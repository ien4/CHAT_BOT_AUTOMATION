const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const ragPipeline = require('../rag/pipeline');
const docParser = require('../rag/docParser');
const llmFactory = require('../llm/factory');
const contextManager = require('../bot/context');
const facebookMenu = require('../facebook/menu');
const getPrisma = require('../db');
const { encryptIfPresent } = require('../infrastructure/services/credentialCrypto');
const tenantRegistry = require('../tenants/registry');
const createPromptRoutes = require('../presentation/http/routes/dashboard/prompts.routes');
const createSettingsRoutes = require('../presentation/http/routes/dashboard/settings.routes');

const router = express.Router();
const prisma = getPrisma();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ==================== AUTH MIDDLEWARE ====================

function authMiddleware(req, res, next) {
 const token = req.headers.authorization?.split(' ')[1];
 if (!token) {
   return res.status(401).json({ error: 'Chưa đăng nhập. Vui lòng đăng nhập lại.' });
 }

 try {
   const decoded = jwt.verify(token, process.env.JWT_SECRET);
   req.user = decoded;
   next();
 } catch (error) {
   return res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' });
 }
}

/**
 * Trả về tenantId scope cho request:
 * - Tenant admin (user.tenantId != null): bị lock vào tenant của mình
 * - Platform admin (user.tenantId == null): dùng ?tenantScope= query param nếu có
 *   null = không filter (xem tất cả global data)
 */
function getTenantScope(req) {
  if (req.user?.tenantId) return req.user.tenantId;
  return req.query.tenantScope || null;
}

/**
 * Middleware: chặn tenant admin truy cập endpoint chỉ dành cho platform admin
 */
function platformAdminOnly(req, res, next) {
  if (req.user?.tenantId) {
    return res.status(403).json({ error: 'Chỉ platform admin mới có quyền truy cập.' });
  }
  next();
}

function tenantPathAccessOnly(req, res, next) {
  if (!req.user?.tenantId) return next();

  if (req.user.tenantId !== req.params.id) {
    return res.status(403).json({ error: 'Không có quyền truy cập tenant này' });
  }

  return next();
}

async function findScopedById(model, id, tenantId, args = {}) {
  if (tenantId) {
    return model.findFirst({
      ...args,
      where: { ...(args.where || {}), id, tenantId },
    });
  }

  return model.findUnique({
    ...args,
    where: { id },
  });
}

async function hasContentPackageAccess(packageId, tenantId) {
  if (!tenantId) return true;

  const pkg = await prisma.contentPackage.findFirst({
    where: { id: packageId, tenantId },
    select: { id: true },
  });
  return Boolean(pkg);
}

// ==================== AUTH ROUTES ====================

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.adminUser.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, tenantId: user.tenantId || null },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, tenantId: user.tenantId || null },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  const user = await prisma.adminUser.findUnique({
    where: { id: req.user.id },
    select: { id: true, username: true, role: true, tenantId: true },
  });
  res.json(user);
});

// ==================== ADMIN USERS ====================

router.get('/admin-users', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const users = await prisma.adminUser.findMany({
      select: { id: true, username: true, role: true, tenantId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin-users', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { username, password, role = 'admin', tenantId } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username và password là bắt buộc' });
    }
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(400).json({ error: 'Tenant không tồn tại' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.adminUser.create({
      data: { username, passwordHash, role, tenantId: tenantId || null },
      select: { id: true, username: true, role: true, tenantId: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Username đã tồn tại' });
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

router.delete('/admin-users/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Không thể xóa tài khoản đang đăng nhập' });
    }
    await prisma.adminUser.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete admin user' });
  }
});

// ==================== DASHBOARD STATS ====================

router.get('/stats', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const [
      totalConversations,
      activeConversations,
      totalMessages,
      totalAppointments,
      pendingAppointments,
      knowledgeCount,
    ] = await Promise.all([
      prisma.conversation.count(),
      prisma.conversation.count({ where: { status: 'active' } }),
      prisma.message.count(),
      prisma.appointment.count(),
      prisma.appointment.count({ where: { status: 'pending' } }),
      prisma.knowledgeBase.count({ where: { isActive: true } }),
    ]);

    // Messages by day (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentMessages = await prisma.message.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const messagesByDay = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      messagesByDay[key] = 0;
    }
    recentMessages.forEach(m => {
      const key = m.createdAt.toISOString().split('T')[0];
      messagesByDay[key] = (messagesByDay[key] || 0) + 1;
    });

    // Intent distribution
    const intentStats = await prisma.message.groupBy({
      by: ['intent'],
      where: { direction: 'inbound', intent: { not: null } },
      _count: true,
    });

    res.json({
      totalConversations,
      activeConversations,
      totalMessages,
      totalAppointments,
      pendingAppointments,
      knowledgeCount,
      messagesByDay: Object.entries(messagesByDay).map(([date, count]) => ({ date, count })),
      intentDistribution: intentStats.map(i => ({ intent: i.intent, count: i._count })),
    });
  } catch (error) {
        console.error('Stats error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
});

// ==================== CONVERSATIONS ====================

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const tenantId = getTenantScope(req);
    const where = status ? { status } : {};
    if (tenantId) where.tenantId = tenantId;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          _count: { select: { messages: true } },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({
      data: conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const scopedConversation = await prisma.conversation.findFirst({
        where: { id: req.params.id, tenantId },
        select: { id: true },
      });
      if (!scopedConversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }

    const conversation = await contextManager.getConversationSummary(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error) {
    console.error('Conversation detail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const scopedConversation = await prisma.conversation.findFirst({
        where: { id: req.params.id, tenantId },
        select: { id: true },
      });
      if (!scopedConversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json(messages);
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== KNOWLEDGE BASE CRUD ====================

router.get('/knowledge', authMiddleware, async (req, res) => {
  try {
    const { category, type, tags, page = 1, limit = 20 } = req.query;
    const tenantId = getTenantScope(req);
    const where = { isActive: true, tenantId: tenantId ?? null };
    if (category) where.category = category;
    if (type) where.type = type;
    if (tags) where.tags = { hasSome: tags.split(',') };

    const [items, total] = await Promise.all([
      prisma.knowledgeBase.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        select: {
          id: true,
          title: true,
          content: true,
          category: true,
          type: true,
          tags: true,
          sourceType: true,
          sourceUrl: true,
          fileUrl: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.knowledgeBase.count({ where }),
    ]);

    res.json({
      data: items,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('Knowledge list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/knowledge/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const item = await findScopedById(prisma.knowledgeBase, req.params.id, tenantId, {
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        sourceType: true,
        sourceUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/knowledge', authMiddleware, async (req, res) => {
    try {
      const { title, content, category, type, tags } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: 'Tiêu đề và nội dung là bắt buộc' });
      }
      const tenantId = getTenantScope(req);

      // Thử thêm với embedding (RAG), nếu lỗi thì thêm không embedding
      try {
        const result = await ragPipeline.addDocument({
          title,
          content,
          category: category || 'general',
          type: type || 'document',
          tags: tags || [],
          sourceType: 'manual',
          tenantId: tenantId || null,
        });
      res.status(201).json(result);
    } catch (ragError) {
      // Fallback: thêm vào DB bằng raw SQL (bỏ qua trường embedding vector)
      console.warn('RAG add failed, using plain insert:', ragError.message);
            const safeTitle = title.replace(/'/g, "''");
      const safeContent = content.replace(/'/g, "''");
      const safeCategory = (category || 'general').replace(/'/g, "''");
      const safeType = (type || 'document').replace(/'/g, "''");
      const tagsArray = tags || [];
      const tagsLiteral = `{${tagsArray.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(',')}}`;
      const safeTenantId = tenantId ? `'${tenantId.replace(/'/g, "''")}'` : 'NULL';
      const result = await prisma.$queryRawUnsafe(`
        INSERT INTO knowledge_base (id, title, content, category, type, tags, source_type, is_active, tenant_id, 
created_at, updated_at)
        VALUES (gen_random_uuid(), '${safeTitle}', '${safeContent}', '${safeCategory}', 
'${safeType}', '${tagsLiteral}'::text[], 'manual', true, ${safeTenantId}, NOW(), NOW())
        RETURNING id, title
      `);
      res.status(201).json(result[0]);
    }
  } catch (error) {
    console.error('Add knowledge error:', error);
    res.status(500).json({ error: 'Failed to add knowledge: ' + error.message });
  }
});

router.put('/knowledge/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const item = await prisma.knowledgeBase.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!item) return res.status(404).json({ error: 'Not found' });
    }
    const success = await ragPipeline.updateDocument(req.params.id, req.body);
    if (!success) return res.status(404).json({ error: 'Not found or update failed' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update: ' + error.message });
  }
});

router.delete('/knowledge/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const item = await prisma.knowledgeBase.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!item) return res.status(404).json({ error: 'Not found' });
    }
    const success = await ragPipeline.deleteDocument(req.params.id);
    if (!success) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ==================== FILE UPLOAD ====================

router.post('/knowledge/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const category = req.body.category || 'general';

    // Save file to disk
    const filePath = await docParser.saveUploadedFile(req.file);

    // Parse file
    const items = await docParser.parseFile(filePath);

    // Add each item to knowledge base
    const results = [];
    for (const item of items) {
      try {
        const result = await ragPipeline.addDocument({
          ...item,
          category: item.category || category,
          sourceType: 'file',
        });
        results.push(result);
      } catch (err) {
        console.error(`Failed to add item "${item.title}":`, err.message);
      }
    }

    // Cleanup
    await docParser.cleanupFile(filePath);

    res.json({ success: true, added: results.length, items: results });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// ==================== WEB SCRAPE ====================

router.post('/knowledge/scrape', authMiddleware, async (req, res) => {
  try {
    const { url, category } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL là bắt buộc' });
    }

    const items = await docParser.scrapeWebsite(url);
    const results = [];

    // Map _parentTitle → parentId sau khi insert từng item
    const titleToId = {};

    for (const item of items) {
      try {
        // Resolve parentId nếu item có _parentTitle
        let parentId = null;
        if (item._parentTitle && titleToId[item._parentTitle]) {
          parentId = titleToId[item._parentTitle];
        }

        const { _parentTitle, _isPageRoot, ...cleanItem } = item;
        const result = await ragPipeline.addDocument({
          ...cleanItem,
          category: category || cleanItem.category || 'general',
          sourceType: 'scrape',
          sourceUrl: url,
          parentId,
        });
        if (result) {
          titleToId[item.title] = result.id;
          results.push(result);
        }
      } catch (err) {
        console.error(`Failed to add scraped item:`, err.message);
      }
    }

    res.json({ success: true, scraped: items.length, added: results.length, items: results });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({ error: 'Scraping failed: ' + error.message });
  }
});

// Re-generate embeddings for knowledge entries missing them (or all)
router.post('/knowledge/reindex', authMiddleware, platformAdminOnly, async (req, res) => {
  const { all = false } = req.body;
  try {
    let entries;
    if (all) {
      entries = await prisma.$queryRawUnsafe(
        `SELECT id, title, content FROM knowledge_base WHERE is_active = true`
      );
    } else {
      entries = await prisma.$queryRawUnsafe(
        `SELECT id, title, content FROM knowledge_base WHERE is_active = true AND embedding IS NULL`
      );
    }

    let embedded = 0;
    let failed = 0;
    for (const entry of entries) {
      try {
        const text = `${entry.title}\n${entry.content}`.substring(0, 3000);
        const embedding = await llmFactory.generateEmbedding(text);
        if (embedding) {
          const vectorLiteral = `[${embedding.join(',')}]`;
          const safeId = entry.id.replace(/'/g, "''");
          await prisma.$queryRawUnsafe(
            `UPDATE knowledge_base SET embedding = '${vectorLiteral}'::vector, updated_at = NOW() WHERE id = '${safeId}'`
          );
          embedded++;
        } else {
          failed++;
        }
      } catch (err) {
        console.warn(`Reindex failed for ${entry.id}: ${err.message}`);
        failed++;
      }
    }

    res.json({ success: true, total: entries.length, embedded, failed });
  } catch (error) {
    console.error('Reindex error:', error);
    res.status(500).json({ error: 'Reindex failed: ' + error.message });
  }
});

// ==================== PROMPT TEMPLATES ====================

router.use('/prompts', createPromptRoutes({ authMiddleware, getTenantScope, prisma }));

router.get('/prompts/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const template = await findScopedById(prisma.promptTemplate, req.params.id, tenantId);
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/prompts', authMiddleware, async (req, res) => {
  try {
    const { name, intentType, layer, systemPrompt, userPromptTemplate, modelPreference } = req.body;
    if (!name || !systemPrompt) {
      return res.status(400).json({ error: 'Tên và nội dung systemPrompt là bắt buộc' });
    }
    const tenantId = getTenantScope(req);
    const template = await prisma.promptTemplate.create({
      data: {
        name,
        intentType: intentType || 'fallback',
        layer: layer || 'intent',
        systemPrompt,
        userPromptTemplate: userPromptTemplate || '{{USER_MESSAGE}}',
        modelPreference,
        tenantId: tenantId ?? null,
      },
    });
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/prompts/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const tpl = await prisma.promptTemplate.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!tpl) return res.status(404).json({ error: 'Not found' });
    }

    const { name, intentType, layer, systemPrompt, userPromptTemplate, modelPreference, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (intentType !== undefined) data.intentType = intentType;
    if (layer !== undefined) data.layer = layer;
    if (systemPrompt !== undefined) data.systemPrompt = systemPrompt;
    if (userPromptTemplate !== undefined) data.userPromptTemplate = userPromptTemplate;
    if (modelPreference !== undefined) data.modelPreference = modelPreference;
    if (isActive !== undefined) data.isActive = isActive;

    const template = await prisma.promptTemplate.update({
      where: { id: req.params.id },
      data,
    });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/prompts/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const tpl = await prisma.promptTemplate.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!tpl) return res.status(404).json({ error: 'Not found' });
    }
    await prisma.promptTemplate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ==================== LLM PROVIDERS ====================

router.get('/providers', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const providers = await prisma.llmProvider.findMany({
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        name: true,
        modelName: true,
        baseUrl: true,
        maxTokens: true,
        temperature: true,
        isEnabled: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        // Exclude apiKeyEncrypted for security (show masked)
      },
    });
    // Mask API keys
    const safeProviders = providers.map(p => ({
      ...p,
      hasApiKey: true, // Just indicate key is set
    }));
    res.json(safeProviders);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/providers', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { name, modelName, apiKey, baseUrl, maxTokens, temperature, isEnabled, priority } = req.body;
    if (!name || !modelName || !apiKey) {
      return res.status(400).json({ error: 'name, modelName và apiKey là bắt buộc' });
    }
    const provider = await prisma.llmProvider.create({
      data: {
        name,
        modelName,
        apiKeyEncrypted: apiKey,
        baseUrl: baseUrl || null,
        maxTokens: maxTokens || 2048,
        temperature: temperature ?? 0.7,
        isEnabled: isEnabled !== false,
        priority: priority || 10,
      },
    });
    await llmFactory.refreshCache();
    res.status(201).json({ ...provider, apiKeyEncrypted: undefined, hasApiKey: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create provider' });
  }
});

router.delete('/providers/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    await prisma.llmProvider.delete({ where: { id: req.params.id } });
    await llmFactory.refreshCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

router.put('/providers/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { name, modelName, apiKey, baseUrl, maxTokens, temperature, isEnabled, priority } = req.body;
    const data = { name, modelName, baseUrl, maxTokens, temperature, isEnabled, priority };
    if (apiKey && !apiKey.startsWith('********')) {
      data.apiKeyEncrypted = apiKey;
    }

    const provider = await prisma.llmProvider.update({
      where: { id: req.params.id },
      data,
    });

    // Refresh LLM cache
    await llmFactory.refreshCache();

    res.json({ ...provider, apiKeyEncrypted: undefined, hasApiKey: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

// Test a provider connection
router.post('/providers/:id/test', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const provider = await prisma.llmProvider.findUnique({ where: { id: req.params.id } });
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const isEmbedding =
      provider.name.toLowerCase().includes('jina') ||
      provider.modelName.toLowerCase().includes('embedding');

    if (isEmbedding) {
      const embedding = await llmFactory.providers['jina'].generateEmbedding(
        provider.apiKeyEncrypted,
        'test embedding connection'
      );
      res.json({ success: true, response: `Embedding OK — ${embedding.length} dims` });
    } else {
      const result = await llmFactory.generate(
        'Bạn là trợ lý ảo.',
        'Hãy trả lời "Kết nối thành công!"',
        provider.modelName
      );
      res.json({ success: true, response: result });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== QUICK REPLY MENUS ====================

router.get('/quick-reply-menus', authMiddleware, async (req, res) => {
  try {
    const { intentType, pageId } = req.query;
    const tenantId = getTenantScope(req);
    const where = { tenantId: tenantId ?? null };
    if (intentType) where.intentType = intentType;
    if (pageId) where.pageId = pageId;

    const menus = await prisma.quickReplyMenu.findMany({
      where,
      orderBy: [{ intentType: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(menus);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/quick-reply-menus/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const menu = await findScopedById(prisma.quickReplyMenu, req.params.id, tenantId);
    if (!menu) return res.status(404).json({ error: 'Not found' });
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/quick-reply-menus', authMiddleware, async (req, res) => {
  try {
    const { intentType, pageId, items, isActive } = req.body;
    if (!intentType) return res.status(400).json({ error: 'intentType là bắt buộc' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items phải là mảng không rỗng với {title, payload}' });
    }

    // Validate items format
    for (const item of items) {
      if (!item.title || !item.payload) {
        return res.status(400).json({ error: 'Mỗi item phải có title và payload' });
      }
    }

    const tenantId = getTenantScope(req);
    const menu = await prisma.quickReplyMenu.create({
      data: { intentType, pageId: pageId || null, items, isActive: isActive !== false, tenantId: tenantId ?? null },
    }).catch(err => {
      if (err.code === 'P2002') throw new Error('Menu for this intentType + pageId already exists');
      throw err;
    });
    res.status(201).json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/quick-reply-menus/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const menu = await prisma.quickReplyMenu.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!menu) return res.status(404).json({ error: 'Not found' });
    }
    const { intentType, pageId, items, isActive } = req.body;
    const data = {};
    if (intentType !== undefined) data.intentType = intentType;
    if (pageId !== undefined) data.pageId = pageId;
    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items must be a non-empty array' });
      }
      data.items = items;
    }
    if (isActive !== undefined) data.isActive = isActive;

    const menu = await prisma.quickReplyMenu.update({
      where: { id: req.params.id },
      data,
    });
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/quick-reply-menus/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const menu = await prisma.quickReplyMenu.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!menu) return res.status(404).json({ error: 'Not found' });
    }
    await prisma.quickReplyMenu.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete menu' });
  }
});

// ==================== CAMPAIGNS ====================

// Upload tài liệu cho campaign
router.post('/campaigns/upload', authMiddleware, platformAdminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Save file to disk
    const filePath = await docParser.saveUploadedFile(req.file);

    // Parse file content
    let parsedContent = '';
    try {
      const items = await docParser.parseFile(filePath);
      parsedContent = items.map(i => i.title + ': ' + i.content).join('\n\n');
    } catch (parseErr) {
      // If parsing fails, use raw filename
      parsedContent = req.file.originalname;
    }

    // Create a download URL (relative path)
    const fileUrl = '/uploads/' + filePath.split('/').pop().split('\\').pop();

    res.json({
      name: req.file.originalname,
      url: fileUrl,
      description: parsedContent.substring(0, 500),
    });
  } catch (error) {
    console.error('Campaign upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

router.get('/campaigns', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/campaigns/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/campaigns', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { name, description, assets } = req.body;
    const campaign = await prisma.campaign.create({
      data: {
        name,
        description,
        assets: assets || [],
      },
    });
    res.status(201).json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.put('/campaigns/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { name, description, assets, isActive } = req.body;
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { name, description, assets, isActive },
    });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

router.delete('/campaigns/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    await prisma.campaign.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ==================== CONTENT PACKAGES ====================

router.get('/content-packages', authMiddleware, async (req, res) => {
  try {
    const { isActive, page = 1, limit = 20 } = req.query;
    const tenantId = getTenantScope(req);
    const where = { tenantId: tenantId ?? null };
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [packages, total] = await Promise.all([
      prisma.contentPackage.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.contentPackage.count({ where }),
    ]);

    res.json({
      data: packages,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('Content packages list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/content-packages/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const pkg = await findScopedById(prisma.contentPackage, req.params.id, tenantId, {
      include: {
        items: { orderBy: { order: 'asc' } },
      },
    });
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    res.json(pkg);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/content-packages', authMiddleware, async (req, res) => {
  try {
    const { name, description, coverUrl, isActive, isPublic } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên gói nội dung là bắt buộc' });

    const tenantId = getTenantScope(req);
    const pkg = await prisma.contentPackage.create({
      data: { name, description, coverUrl, isActive, isPublic, tenantId: tenantId ?? null },
    });
    res.status(201).json(pkg);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create content package' });
  }
});

router.put('/content-packages/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const pkg = await prisma.contentPackage.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!pkg) return res.status(404).json({ error: 'Not found' });
    }
    const { name, description, coverUrl, isActive, isPublic } = req.body;
    const pkg = await prisma.contentPackage.update({
      where: { id: req.params.id },
      data: { name, description, coverUrl, isActive, isPublic },
    });
    res.json(pkg);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update content package' });
  }
});

router.delete('/content-packages/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const pkg = await prisma.contentPackage.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
      if (!pkg) return res.status(404).json({ error: 'Not found' });
    }
    await prisma.contentPackage.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete content package' });
  }
});

// --- Content Package Items ---

router.get('/content-packages/:packageId/items', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (!(await hasContentPackageAccess(req.params.packageId, tenantId))) {
      return res.status(404).json({ error: 'Not found' });
    }

    const items = await prisma.contentPackageItem.findMany({
      where: { packageId: req.params.packageId },
      orderBy: { order: 'asc' },
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/content-packages/:packageId/items', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (!(await hasContentPackageAccess(req.params.packageId, tenantId))) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { type, title, content, url, fileUrl, description, tags, order } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'Loại và tiêu đề là bắt buộc' });

    const validTypes = ['image_prompt', 'skill', 'link', 'document'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Loại phải là: ${validTypes.join(', ')}` });
    }

    const item = await prisma.contentPackageItem.create({
      data: {
        packageId: req.params.packageId,
        type, title, content, url, fileUrl, description,
        tags: tags || [],
        order: order !== undefined ? order : 0,
      },
    });
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create item' });
  }
});

router.put('/content-packages/:packageId/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (!(await hasContentPackageAccess(req.params.packageId, tenantId))) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { type, title, content, url, fileUrl, description, tags, order } = req.body;
    const data = {};
    if (type !== undefined) data.type = type;
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;
    if (url !== undefined) data.url = url;
    if (fileUrl !== undefined) data.fileUrl = fileUrl;
    if (description !== undefined) data.description = description;
    if (tags !== undefined) data.tags = tags;
    if (order !== undefined) data.order = order;

    let item;
    if (tenantId) {
      const result = await prisma.contentPackageItem.updateMany({
        where: { id: req.params.itemId, packageId: req.params.packageId },
        data,
      });
      if (result.count === 0) return res.status(404).json({ error: 'Not found' });
      item = await prisma.contentPackageItem.findUnique({ where: { id: req.params.itemId } });
    } else {
      item = await prisma.contentPackageItem.update({
        where: { id: req.params.itemId },
        data,
      });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

router.delete('/content-packages/:packageId/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (!(await hasContentPackageAccess(req.params.packageId, tenantId))) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (tenantId) {
      const result = await prisma.contentPackageItem.deleteMany({
        where: { id: req.params.itemId, packageId: req.params.packageId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      await prisma.contentPackageItem.delete({ where: { id: req.params.itemId } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Migrate Campaign → ContentPackage
router.post('/content-packages/migrate-from-campaigns', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany();
    let migrated = 0;

    for (const camp of campaigns) {
      // Tạo ContentPackage từ Campaign
      const pkg = await prisma.contentPackage.create({
        data: {
          name: camp.name,
          description: camp.description,
          isActive: camp.isActive,
          isPublic: true,
        },
      });

      // Chuyển assets thành items
      let assets = [];
      try {
        assets = typeof camp.assets === 'string' ? JSON.parse(camp.assets) : (camp.assets || []);
      } catch (e) {
        assets = [];
      }

      if (Array.isArray(assets)) {
        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          if (!asset) continue;

          let itemType = 'document';
          let itemTitle = asset.name || asset.title || `Tài liệu ${i + 1}`;
          let itemContent = asset.prompt || asset.content || asset.description || '';
          let itemUrl = asset.url || null;
          let itemDesc = asset.description || null;

          // Guess type from content
          if (asset.prompt || itemTitle.toLowerCase().includes('prompt')) {
            itemType = 'image_prompt';
          } else if (asset.url || itemTitle.toLowerCase().includes('link')) {
            itemType = 'link';
          } else if (itemTitle.toLowerCase().includes('skill') || itemTitle.toLowerCase().includes('kỹ năng')) {
            itemType = 'skill';
          }

          await prisma.contentPackageItem.create({
            data: {
              packageId: pkg.id,
              type: itemType,
              title: itemTitle,
              content: itemContent,
              url: itemUrl,
              description: itemDesc,
              order: i,
            },
          });
        }
      }

      migrated++;
    }

    res.json({ success: true, migrated, total: campaigns.length });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed: ' + error.message });
  }
});

// ==================== APPOINTMENTS ====================

router.get('/appointments', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const tenantId = getTenantScope(req);
    const where = { tenantId: tenantId ?? null };
    if (status) where.status = status;

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.appointment.count({ where }),
    ]);

    res.json({
      data: appointments,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/appointments/:id', authMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const tenantId = getTenantScope(req);
    const before = tenantId
      ? await prisma.appointment.findFirst({ where: { id: req.params.id, tenantId } })
      : await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (tenantId && !before) return res.status(404).json({ error: 'Not found' });

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status, notes },
    });

    try {
      const appointmentNotifications = require('../notifications/appointments');
      if (status !== undefined && before?.status !== status) {
        await appointmentNotifications.statusChanged(appointment, before?.status, status);
      } else if (notes !== undefined && before?.notes !== notes) {
        await appointmentNotifications.updated(appointment, ['Ghi chú đã được cập nhật']);
      }
    } catch (notifyError) {
      console.warn('[Dashboard] Appointment Telegram notification failed:', notifyError.message);
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// ==================== STAFF ====================

router.get('/staff', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const staff = await prisma.staff.findMany({ orderBy: { name: 'asc' } });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/staff', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { name, telegramChatId } = req.body;
    if (!name || !telegramChatId) {
      return res.status(400).json({ error: 'Tên và Telegram Chat ID là bắt buộc' });
    }
    const member = await prisma.staff.create({
      data: { name, telegramId: telegramChatId, telegramChatId },
    });
    res.status(201).json(member);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Telegram Chat ID đã tồn tại' });
    }
    res.status(500).json({ error: 'Failed to create staff' });
  }
});

router.put('/staff/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { name, telegramChatId, isActive, isOnDuty } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (telegramChatId !== undefined) { data.telegramId = telegramChatId; data.telegramChatId = telegramChatId; }
    if (isActive !== undefined) data.isActive = isActive;
    if (isOnDuty !== undefined) data.isOnDuty = isOnDuty;

    const member = await prisma.staff.update({ where: { id: req.params.id }, data });
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update staff' });
  }
});

router.delete('/staff/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    await prisma.staff.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete staff' });
  }
});

// ==================== HANDOFF SETTINGS ====================

// GET/PUT /settings/handoff đã tách sang presentation/http/routes/dashboard/settings.routes.js

// Xem trạng thái handoff realtime — conversations đang pending hoặc active
// ==================== TELEGRAM DESTINATIONS ====================

function sanitizeTelegramDestinationInput(body) {
  const name = String(body.name || '').trim();
  const type = String(body.type || 'group').trim();
  const purpose = String(body.purpose || 'status').trim();
  const chatId = String(body.chatId || '').trim();
  const isActive = body.isActive === undefined ? undefined : Boolean(body.isActive);

  return { name, type, purpose, chatId, isActive };
}

router.post('/settings/telegram-destinations', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const data = sanitizeTelegramDestinationInput(req.body);
    if (!data.name || !data.chatId) {
      return res.status(400).json({ error: 'Ten va Chat ID la bat buoc' });
    }
    if (!['group', 'channel'].includes(data.type)) {
      return res.status(400).json({ error: 'Loai Telegram khong hop le' });
    }
    if (data.purpose !== 'status') {
      return res.status(400).json({ error: 'Muc dich Telegram khong hop le' });
    }

    const destination = await prisma.telegramDestination.create({
      data: {
        name: data.name,
        type: data.type,
        purpose: data.purpose,
        chatId: data.chatId,
        isActive: data.isActive ?? true,
      },
    });
    res.status(201).json(destination);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Chat ID nay da ton tai' });
    }
    console.error('Failed to create Telegram destination:', error);
    res.status(500).json({ error: 'Failed to create Telegram destination' });
  }
});

router.put('/settings/telegram-destinations/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const input = sanitizeTelegramDestinationInput(req.body);
    const data = {};
    if (input.name) data.name = input.name;
    if (input.chatId) data.chatId = input.chatId;
    if (input.type) {
      if (!['group', 'channel'].includes(input.type)) {
        return res.status(400).json({ error: 'Loai Telegram khong hop le' });
      }
      data.type = input.type;
    }
    if (input.purpose) {
      if (input.purpose !== 'status') {
        return res.status(400).json({ error: 'Muc dich Telegram khong hop le' });
      }
      data.purpose = input.purpose;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const destination = await prisma.telegramDestination.update({
      where: { id: req.params.id },
      data,
    });
    res.json(destination);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Chat ID nay da ton tai' });
    }
    console.error('Failed to update Telegram destination:', error);
    res.status(500).json({ error: 'Failed to update Telegram destination' });
  }
});

router.delete('/settings/telegram-destinations/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    await prisma.telegramDestination.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete Telegram destination:', error);
    res.status(500).json({ error: 'Failed to delete Telegram destination' });
  }
});

router.post('/settings/telegram-destinations/:id/test', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const destination = await prisma.telegramDestination.findUnique({ where: { id: req.params.id } });
    if (!destination) return res.status(404).json({ error: 'Khong tim thay cau hinh Telegram' });

    const { getBot } = require('../telegram/bot');
    const bot = getBot();
    if (!bot) return res.status(400).json({ error: 'Telegram bot chua chay hoac thieu TELEGRAM_BOT_TOKEN' });

    await bot.sendMessage(
      destination.chatId,
      `Test cau hinh trang thai: ${destination.name}\n\nNeu ban thay tin nay, bot da gui duoc vao ${destination.type === 'channel' ? 'channel' : 'group'}.`
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to test Telegram destination:', error);
    res.status(500).json({ error: error.response?.body?.description || error.message || 'Test Telegram failed' });
  }
});

router.get('/handoff/active', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const active = await prisma.conversation.findMany({
      where: { handoffStatus: { in: ['pending_human', 'human_active'] } },
      include: { assignedStaff: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(active);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Force-end một human session từ dashboard
router.post('/handoff/:conversationId/force-end', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const handoffModule = require('../telegram/handoff');
    await handoffModule.endHumanSession(req.params.conversationId, 'admin_forced');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Staff status với active session info
router.get('/handoff/staff-status', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [staffList, todayHandoffs] = await Promise.all([
      prisma.staff.findMany({
        where: { isActive: true },
        include: {
          conversations: {
            where: { handoffStatus: 'human_active' },
            select: { id: true, fbUserName: true, fbUserId: true, updatedAt: true, humanSessionExpiresAt: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.conversation.count({
        where: {
          handoffStatus: { not: 'bot' },
          updatedAt: { gte: todayStart },
        },
      }),
    ]);

    res.json({ staff: staffList, todayHandoffs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Conversations đang bot xử lý trong 1 giờ gần nhất — staff có thể takeover
router.get('/handoff/bot-queue', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const conversations = await prisma.conversation.findMany({
      where: {
        handoffStatus: 'bot',
        updatedAt: { gte: oneHourAgo },
      },
      select: {
        id: true,
        fbUserId: true,
        fbUserName: true,
        updatedAt: true,
        botGraceUntil: true,
        messages: {
          where: { direction: 'inbound' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    // Chỉ lấy những conversation có > 1 tin nhắn (loại bỏ "Get Started" đơn lẻ)
    const filtered = conversations.filter(c => c._count.messages > 1);
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Phân công thủ công từ dashboard
router.post('/handoff/:conversationId/assign', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { staffId } = req.body;
    if (!staffId) return res.status(400).json({ error: 'staffId là bắt buộc' });

    const [staff, conversation, settings] = await Promise.all([
      prisma.staff.findUnique({ where: { id: staffId } }),
      prisma.conversation.findUnique({ where: { id: req.params.conversationId } }),
      prisma.handoffSetting.findUnique({ where: { id: 'singleton' } }),
    ]);

    if (!staff) return res.status(404).json({ error: 'Staff không tồn tại' });
    if (!conversation) return res.status(404).json({ error: 'Conversation không tồn tại' });

    const sessionTimeout = settings?.sessionTimeoutSeconds || 300;

    const updated = await prisma.conversation.update({
      where: { id: req.params.conversationId },
      data: {
        handoffStatus: 'human_active',
        assignedStaffId: staffId,
        humanSessionExpiresAt: new Date(Date.now() + sessionTimeout * 1000),
      },
    });

    // Notify staff qua Telegram + notify Facebook user
    try {
      const handoffModule = require('../telegram/handoff');
      await handoffModule.notifyStaffAssignment(staff.telegramChatId, { ...conversation, ...updated });
    } catch (e) {
      console.warn('[Dashboard] Telegram notification failed (not critical):', e.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Assign error:', error);
    res.status(500).json({ error: 'Failed to assign' });
  }
});

// ==================== WEBHOOK STATUS ====================

router.use('/settings', createSettingsRoutes({ authMiddleware, prisma }));

// ==================== FACEBOOK PAGES ====================

router.get('/facebook-pages', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const pages = await prisma.facebookPage.findMany({
      orderBy: { pageName: 'asc' },
      select: {
        id: true, pageId: true, pageName: true, isActive: true,
        botPersona: true, knowledgeFilter: true,
        createdAt: true, updatedAt: true,
        // exclude accessToken for security
      },
    });
    // Mask tokens
    const safe = pages.map(p => ({ ...p, hasToken: true }));
    res.json(safe);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/facebook-pages/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const page = await prisma.facebookPage.findUnique({ where: { id: req.params.id } });
    if (!page) return res.status(404).json({ error: 'Not found' });
    const { accessToken, ...safe } = page;
    res.json({ ...safe, hasToken: !!accessToken });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/facebook-pages', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { pageId, pageName, accessToken, isActive, botPersona, knowledgeFilter } = req.body;
    if (!pageId || !pageName || !accessToken) {
      return res.status(400).json({ error: 'pageId, pageName và accessToken là bắt buộc' });
    }
    const page = await prisma.facebookPage.create({
      data: { pageId, pageName, accessToken, isActive: isActive !== false, botPersona, knowledgeFilter: knowledgeFilter || [] },
    });
    const { accessToken: _, ...safe } = page;
    res.status(201).json({ ...safe, hasToken: true });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Page ID already exists' });
    res.status(500).json({ error: 'Failed to create page' });
  }
});

router.put('/facebook-pages/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { pageId, pageName, accessToken, isActive, botPersona, knowledgeFilter } = req.body;
    const data = {};
    if (pageId !== undefined) data.pageId = pageId;
    if (pageName !== undefined) data.pageName = pageName;
    if (accessToken !== undefined && accessToken) data.accessToken = accessToken;
    if (isActive !== undefined) data.isActive = isActive;
    if (botPersona !== undefined) data.botPersona = botPersona;
    if (knowledgeFilter !== undefined) data.knowledgeFilter = knowledgeFilter;

    const page = await prisma.facebookPage.update({ where: { id: req.params.id }, data });
    const { accessToken: _, ...safe } = page;
    res.json({ ...safe, hasToken: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update page' });
  }
});

router.delete('/facebook-pages/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    await prisma.facebookPage.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// ==================== FACEBOOK MENU MANAGEMENT ====================

// Get current Messenger profile (menu, greeting, get_started)
router.get('/settings/facebook-menu', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const profile = await facebookMenu.getProfile();
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Setup/Reset Persistent Menu
router.post('/settings/facebook-menu', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const result = await facebookMenu.setupPersistentMenu();
    await facebookMenu.setupGetStarted();
    await facebookMenu.setupGreeting(req.body.greeting || undefined);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== TEST ENDPOINTS ====================

// Simulate a Facebook message (no Facebook needed)
router.post('/test-message', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { message, senderId } = req.body;
    if (!message) return res.status(400).json({ error: 'Nội dung tin nhắn là bắt buộc' });

    const botEngine = require('../bot/engine');
    const fakeSenderId = senderId || 'test_user_000';

    console.log(`🧪 [TEST] Simulated message from ${fakeSenderId}: "${message}"`);
    const response = await botEngine.processMessage(fakeSenderId, message);
    console.log(`🧪 [TEST] Bot response:`, response);

    res.json({ senderId: fakeSenderId, userMessage: message, botResponse: response });
  } catch (error) {
    console.error('Test message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check Facebook webhook subscription status for all pages
router.get('/fb-subscription', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const axios = require('axios');
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    const pageIds = ['787000101169514', '672718022594164', '205923229272834'];
    const results = [];

    for (const pageId of pageIds) {
      try {
        const r = await axios.get(
          `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
          { params: { access_token: token } }
        );
        results.push({ pageId, subscribed: r.data.data?.length > 0, data: r.data.data });
      } catch (e) {
        results.push({ pageId, subscribed: false, error: e.response?.data?.error?.message || e.message });
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ANALYTICS ====================

/**
 * GET /analytics — Báo cáo phân tích nâng cao
 * Cung cấp cho Dashboard phần Thống kê
 */
router.get('/analytics', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const sinceDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // 1. Handoff statistics
    const handoffConversations = await prisma.conversation.findMany({
      where: { handoffStatus: { not: 'bot' } },
      select: { handoffStatus: true, assignedStaffId: true, updatedAt: true, createdAt: true },
    });

    const totalHandoffs = handoffConversations.length;
    const activeHandoffs = handoffConversations.filter(c => c.handoffStatus === 'human_active').length;
    const pendingHandoffs = handoffConversations.filter(c => c.handoffStatus === 'pending_human').length;
    const resolvedHandoffs = await prisma.conversation.count({
      where: { handoffStatus: 'bot', assignedStaffId: { not: null } },
    });

        // 2. Staff response time (approximate: time from first message to first staff outbound)
    // Use raw query with parameterized input to avoid SQL injection
    const staffResponseTimes = await prisma.$queryRawUnsafe(`
      SELECT m2.conversation_id, m2.created_at as response_time,
             m1.created_at as first_message,
             EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)) AS response_seconds
      FROM messages m1
      INNER JOIN messages m2 ON m2.conversation_id = m1.conversation_id AND m2.direction = 'staff_outbound'
      WHERE m1.direction = 'inbound'
        AND m1.created_at >= $1::timestamp
        AND m2.created_at >= m1.created_at
      ORDER BY m1.created_at DESC
      LIMIT 100
    `, sinceDate).catch(() => []);

        let avgResponseTime = 0;
    let responseTimeList = [];
    if (Array.isArray(staffResponseTimes) && staffResponseTimes.length > 0) {
      responseTimeList = staffResponseTimes.map(r => Math.round(Number(r.response_seconds) || 0));
      avgResponseTime = responseTimeList.reduce(function(sum, t) { return sum + t; }, 0) / responseTimeList.length;
    }

    // 3. Hourly activity
    const hourlyActivity = await prisma.$queryRawUnsafe(`
      SELECT 
        EXTRACT(HOUR FROM created_at) AS hour,
        COUNT(*) AS count
      FROM messages
      WHERE created_at >= $1::timestamp
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `, sinceDate).catch(() => []);

    // 4. Fallback rate (messages that went to fallback intent)
    const totalInbound = await prisma.message.count({
      where: { direction: 'inbound', createdAt: { gte: sinceDate } },
    });
    const fallbackCount = await prisma.message.count({
      where: { direction: 'inbound', intent: 'fallback', createdAt: { gte: sinceDate } },
    });
    const fallbackRate = totalInbound > 0 ? parseFloat((fallbackCount / totalInbound * 100).toFixed(1)) : 0;

        // 5. Conversation duration (minutes, where status is not active)
    const closedConversations = await prisma.$queryRawUnsafe(`
      SELECT 
        EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 AS duration_minutes
      FROM conversations
      WHERE status != 'active' AND created_at >= $1::timestamp
      ORDER BY created_at DESC
      LIMIT 100
    `, sinceDate).catch(() => []);

            const avgDuration = Array.isArray(closedConversations) && closedConversations.length > 0
      ? closedConversations.reduce(function(sum, c) { return sum + Number(c.duration_minutes || 0); }, 0) / closedConversations.length
      : 0;

    // 6. Intent distribution (last 30 days)
    const intentDistribution = await prisma.message.groupBy({
      by: ['intent'],
      where: { direction: 'inbound', intent: { not: null }, createdAt: { gte: sinceDate } },
      _count: true,
      orderBy: { _count: { intent: 'desc' } },
    });

    // 7. Bot vs Handoff split
    const botHandled = await prisma.conversation.count({
      where: {
        createdAt: { gte: sinceDate },
        handoffStatus: { notIn: ['pending_human', 'human_active'] },
      },
    });
    const handoffHandled = await prisma.conversation.count({
      where: {
        createdAt: { gte: sinceDate },
        handoffStatus: { in: ['pending_human', 'human_active'] },
      },
    });

        // 8. Messages count (last 30 days, daily)
    const dailyMessages = await prisma.$queryRawUnsafe(`
      SELECT 
        DATE(created_at) AS date,
        COUNT(*)::int AS total,
        SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END)::int AS inbound,
        SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END)::int AS outbound
      FROM messages
      WHERE created_at >= $1::timestamp
      GROUP BY DATE(created_at)
      ORDER BY date
    `, sinceDate).catch(() => []);

    res.json({
      handoff: {
        total: totalHandoffs,
        active: activeHandoffs,
        pending: pendingHandoffs,
        resolved: resolvedHandoffs,
        avgResponseTimeSeconds: Math.round(avgResponseTime),
        staffResponseTimes: responseTimeList.slice(0, 30),
      },
      conversations: {
        avgDurationMinutes: Math.round(avgDuration * 10) / 10,
        botHandled,
        handoffHandled,
      },
      messages: {
        total: totalInbound,
        fallbackRate: fallbackRate,
        fallbackCount,
                hourly: (Array.isArray(hourlyActivity) ? hourlyActivity : []).map(h => ({ hour: Number(h.hour), count: Number(h.count || 0) })),
        daily: (Array.isArray(dailyMessages) ? dailyMessages : []).map(d => ({
          date: d.date,
          total: Number(d.total),
          inbound: Number(d.inbound),
          outbound: Number(d.outbound),
        })),
      },
      intents: intentDistribution.map(i => ({ intent: i.intent, count: i._count })),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CHANNEL CONFIGS ====================

router.get('/channel-configs', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const configs = tenantId
      ? await prisma.tenantChannelConfig.findMany({ where: { tenantId }, orderBy: { channelType: 'asc' } })
      : await prisma.channelConfig.findMany({ orderBy: { channelType: 'asc' } });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/channel-configs/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const config = tenantId
      ? await prisma.tenantChannelConfig.findUnique({ where: { id: req.params.id } })
      : await prisma.channelConfig.findUnique({ where: { id: req.params.id } });
    if (!config) return res.status(404).json({ error: 'Not found' });
    if (tenantId && config.tenantId !== tenantId) return res.status(404).json({ error: 'Not found' });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/channel-configs', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const { inboxId, channelType, name, knowledgeFilter, botPersonaOverride, isActive } = req.body;
    if (!inboxId || !channelType || !name) {
      return res.status(400).json({ error: 'inboxId, channelType và name là bắt buộc' });
    }
    const validTypes = ['facebook', 'web', 'whatsapp', 'email'];
    if (!validTypes.includes(channelType)) {
      return res.status(400).json({ error: `channelType phải là: ${validTypes.join(', ')}` });
    }

    let config;
    if (tenantId) {
      config = await prisma.tenantChannelConfig.create({
        data: { tenantId, inboxId: String(inboxId), channelType, name, knowledgeFilter: knowledgeFilter || [], isActive: isActive !== false },
      });
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (tenant) tenantRegistry.invalidate(tenant.slug);
    } else {
      config = await prisma.channelConfig.create({
        data: { inboxId: String(inboxId), channelType, name, knowledgeFilter: knowledgeFilter || [], botPersonaOverride: botPersonaOverride || null, isActive: isActive !== false },
      });
    }
    res.status(201).json(config);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Inbox ID này đã được cấu hình' });
    res.status(500).json({ error: 'Failed to create channel config' });
  }
});

router.put('/channel-configs/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    const { inboxId, channelType, name, knowledgeFilter, botPersonaOverride, isActive } = req.body;
    const data = {};
    if (inboxId !== undefined) data.inboxId = String(inboxId);
    if (channelType !== undefined) {
      const validTypes = ['facebook', 'web', 'whatsapp', 'email'];
      if (!validTypes.includes(channelType)) {
        return res.status(400).json({ error: `channelType phải là: ${validTypes.join(', ')}` });
      }
      data.channelType = channelType;
    }
    if (name !== undefined) data.name = name;
    if (knowledgeFilter !== undefined) data.knowledgeFilter = knowledgeFilter;
    if (isActive !== undefined) data.isActive = isActive;

    let config;
    if (tenantId) {
      const existing = await prisma.tenantChannelConfig.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.tenantId !== tenantId) return res.status(404).json({ error: 'Not found' });
      config = await prisma.tenantChannelConfig.update({ where: { id: req.params.id }, data });
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (tenant) tenantRegistry.invalidate(tenant.slug);
    } else {
      if (botPersonaOverride !== undefined) data.botPersonaOverride = botPersonaOverride || null;
      config = await prisma.channelConfig.update({ where: { id: req.params.id }, data });
    }
    res.json(config);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Inbox ID này đã được cấu hình' });
    res.status(500).json({ error: 'Failed to update channel config' });
  }
});

router.delete('/channel-configs/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = getTenantScope(req);
    if (tenantId) {
      const existing = await prisma.tenantChannelConfig.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.tenantId !== tenantId) return res.status(404).json({ error: 'Not found' });
      await prisma.tenantChannelConfig.delete({ where: { id: req.params.id } });
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (tenant) tenantRegistry.invalidate(tenant.slug);
    } else {
      await prisma.channelConfig.delete({ where: { id: req.params.id } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel config' });
  }
});

// ==================== TENANTS ====================
// Mask credentials trước khi trả về client — không bao giờ expose raw token

function maskTenant(t) {
  return {
    ...t,
    chatwootApiTokenEnc: undefined,
    webhookSecretEnc: undefined,
    hasApiToken:     !!t.chatwootApiTokenEnc,
    hasWebhookSecret: !!t.webhookSecretEnc,
    webhookUrl: null,
  };
}

router.get('/tenants', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { staff: true, channelConfigs: true } } },
    });
    res.json(tenants.map(maskTenant));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tenants/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: { staff: true, channelConfigs: true },
    });
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    res.json(maskTenant(tenant));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tenants', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const {
      slug, name, chatwootModel = 'dedicated',
      chatwootAccountId, chatwootBaseUrl,
      chatwootApiToken, chatwootTeamId,
      webhookSecret, telegramGroupChatId,
      pendingTimeoutSeconds, sessionTimeoutSeconds,
      offHoursPendingTimeout, workHoursStart, workHoursEnd,
      defaultPersona,
    } = req.body;

    if (!slug || !name || !chatwootAccountId) {
      return res.status(400).json({ error: 'slug, name, chatwootAccountId là bắt buộc' });
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'slug chỉ được chứa chữ thường, số và dấu gạch ngang' });
    }
    if (chatwootModel === 'dedicated' && !chatwootApiToken) {
      return res.status(400).json({ error: 'chatwootApiToken bắt buộc với dedicated model' });
    }

    const tenant = await prisma.tenant.create({
      data: {
        slug, name, chatwootModel,
        chatwootAccountId: String(chatwootAccountId),
        chatwootBaseUrl:      chatwootBaseUrl || null,
        chatwootApiTokenEnc:  encryptIfPresent(chatwootApiToken),
        chatwootTeamId:       chatwootTeamId ? String(chatwootTeamId) : null,
        webhookSecretEnc:     encryptIfPresent(webhookSecret),
        telegramGroupChatId:  telegramGroupChatId || null,
        pendingTimeoutSeconds:  pendingTimeoutSeconds  ?? 30,
        sessionTimeoutSeconds:  sessionTimeoutSeconds  ?? 30,
        offHoursPendingTimeout: offHoursPendingTimeout ?? 10,
        workHoursStart: workHoursStart ?? null,
        workHoursEnd:   workHoursEnd   ?? null,
        defaultPersona: defaultPersona || null,
      },
    });
    res.status(201).json(maskTenant(tenant));
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Slug này đã tồn tại' });
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

router.put('/tenants/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const {
      name, chatwootModel, chatwootAccountId, chatwootBaseUrl,
      chatwootApiToken, chatwootTeamId, webhookSecret,
      telegramGroupChatId, pendingTimeoutSeconds, sessionTimeoutSeconds,
      offHoursPendingTimeout, workHoursStart, workHoursEnd,
      defaultPersona, isActive,
    } = req.body;

    const data = {};
    if (name              !== undefined) data.name              = name;
    if (chatwootModel     !== undefined) data.chatwootModel     = chatwootModel;
    if (chatwootAccountId !== undefined) data.chatwootAccountId = String(chatwootAccountId);
    if (chatwootBaseUrl   !== undefined) data.chatwootBaseUrl   = chatwootBaseUrl || null;
    if (chatwootTeamId    !== undefined) data.chatwootTeamId    = chatwootTeamId ? String(chatwootTeamId) : null;
    if (telegramGroupChatId !== undefined) data.telegramGroupChatId = telegramGroupChatId || null;
    if (pendingTimeoutSeconds  !== undefined) data.pendingTimeoutSeconds  = pendingTimeoutSeconds;
    if (sessionTimeoutSeconds  !== undefined) data.sessionTimeoutSeconds  = sessionTimeoutSeconds;
    if (offHoursPendingTimeout !== undefined) data.offHoursPendingTimeout = offHoursPendingTimeout;
    if (workHoursStart !== undefined) data.workHoursStart = workHoursStart ?? null;
    if (workHoursEnd   !== undefined) data.workHoursEnd   = workHoursEnd   ?? null;
    if (defaultPersona !== undefined) data.defaultPersona = defaultPersona || null;
    if (isActive       !== undefined) data.isActive       = isActive;

    // Chỉ update token/secret nếu client gửi giá trị mới (không phải mask '****')
    // "" hoặc null → xóa secret; undefined → không thay đổi
    if (chatwootApiToken !== undefined) {
      if (!chatwootApiToken || chatwootApiToken.startsWith('****')) { /* skip */ }
      else data.chatwootApiTokenEnc = encryptIfPresent(chatwootApiToken);
    }
    if (webhookSecret !== undefined) {
      if (webhookSecret === null || webhookSecret === '') data.webhookSecretEnc = null;
      else if (!webhookSecret.startsWith('****')) data.webhookSecretEnc = encryptIfPresent(webhookSecret);
    }

    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data });

    // Invalidate cache để tenant registry load config mới
    tenantRegistry.invalidate(tenant.slug);

    res.json(maskTenant(tenant));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

router.delete('/tenants/:id', authMiddleware, platformAdminOnly, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    await prisma.tenant.delete({ where: { id: req.params.id } });
    tenantRegistry.invalidate(tenant.slug);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// ==================== TENANT STAFF ====================

router.get('/tenants/:id/staff', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const staff = await prisma.tenantStaff.findMany({
      where: { tenantId: req.params.id },
      orderBy: { name: 'asc' },
    });
    res.json(staff);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tenants/:id/staff', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const { name, telegramId, telegramChatId } = req.body;
    if (!name || !telegramId || !telegramChatId) {
      return res.status(400).json({ error: 'name, telegramId, telegramChatId là bắt buộc' });
    }
    const staff = await prisma.tenantStaff.create({
      data: { tenantId: req.params.id, name, telegramId: String(telegramId), telegramChatId: String(telegramChatId) },
    });
    res.status(201).json(staff);
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Staff này đã tồn tại trong tenant' });
    res.status(500).json({ error: 'Failed to create staff' });
  }
});

router.put('/tenants/:id/staff/:sid', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const { name, isOnDuty, isActive } = req.body;
    const data = {};
    if (name     !== undefined) data.name     = name;
    if (isOnDuty !== undefined) data.isOnDuty = isOnDuty;
    if (isActive !== undefined) data.isActive = isActive;
    const result = await prisma.tenantStaff.updateMany({
      where: { id: req.params.sid, tenantId: req.params.id },
      data,
    });
    if (result.count === 0) return res.status(404).json({ error: 'Not found' });

    const staff = await prisma.tenantStaff.findUnique({
      where: { id: req.params.sid },
    });
    res.json(staff);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update staff' });
  }
});

router.delete('/tenants/:id/staff/:sid', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const result = await prisma.tenantStaff.deleteMany({
      where: { id: req.params.sid, tenantId: req.params.id },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete staff' });
  }
});

// ==================== TENANT CHANNEL CONFIGS ====================

router.get('/tenants/:id/channel-configs', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const configs = await prisma.tenantChannelConfig.findMany({
      where: { tenantId: req.params.id },
      orderBy: { name: 'asc' },
    });
    res.json(configs);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tenants/:id/channel-configs', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const { inboxId, channelType, name, knowledgeFilter } = req.body;
    if (!inboxId || !channelType || !name) {
      return res.status(400).json({ error: 'inboxId, channelType, name là bắt buộc' });
    }
    const config = await prisma.tenantChannelConfig.create({
      data: {
        tenantId: req.params.id,
        inboxId:  String(inboxId),
        channelType,
        name,
        knowledgeFilter: knowledgeFilter || [],
      },
    });
    // Invalidate registry cache để channelConfigs được reload
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (tenant) tenantRegistry.invalidate(tenant.slug);
    res.status(201).json(config);
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Inbox này đã được cấu hình cho tenant' });
    res.status(500).json({ error: 'Failed to create channel config' });
  }
});

router.delete('/tenants/:id/channel-configs/:cid', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const result = await prisma.tenantChannelConfig.deleteMany({
      where: { id: req.params.cid, tenantId: req.params.id },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Not found' });

    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (tenant) tenantRegistry.invalidate(tenant.slug);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete channel config' });
  }
});

// ==================== TENANT KNOWLEDGE BASE ====================

router.get('/tenants/:id/knowledge', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const items = await prisma.knowledgeBase.findMany({
      where: { tenantId: req.params.id, isActive: true },
      select: { id: true, title: true, category: true, type: true, tags: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tenants/:id/knowledge', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const { title, content, category = 'general', type, tags = [] } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title và content là bắt buộc' });
    const doc = await ragPipeline.addDocument({ title, content, category, type, tags, tenantId: req.params.id });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to add knowledge: ' + e.message });
  }
});

router.put('/tenants/:id/knowledge/:kid', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const existing = await prisma.knowledgeBase.findFirst({
      where: { id: req.params.kid, tenantId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ragPipeline.updateDocument(req.params.kid, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update knowledge' });
  }
});

router.delete('/tenants/:id/knowledge/:kid', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const existing = await prisma.knowledgeBase.findFirst({
      where: { id: req.params.kid, tenantId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ragPipeline.deleteDocument(req.params.kid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete knowledge' });
  }
});

// ==================== TENANT WEBHOOK INFO ====================

router.get('/tenants/:id/webhook-info', authMiddleware, tenantPathAccessOnly, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    res.status(410).json({
      error: 'Tenant webhook info theo kiến trúc inbox trung gian cũ đã bị loại bỏ.',
      target: 'direct-facebook-webhook',
      webhookUrl: null,
      tenantSlug: tenant.slug,
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
