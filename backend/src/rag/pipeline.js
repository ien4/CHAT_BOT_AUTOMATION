const llmFactory = require('../llm/factory');
const getPrisma = require('../db');
const prisma = getPrisma();

/**
 * RAG (Retrieval Augmented Generation) Pipeline
 * 
 * Flow: User Query → Generate Embedding → Vector Search → Format Context → LLM Generation
 */
class RagPipeline {
  constructor() {
    this.similarityThreshold = 0.3;
    this.maxResults = 5;
  }

  /**
   * Search knowledge base for relevant content
   * @param {string} query - User query
   * @param {string} intent - Detected intent for filtering
   * @returns {Promise<Array>} Matching knowledge entries
   */
  /**
   * @param {string}   query
   * @param {string}   intent
   * @param {string[]} tagFilter - nếu có, chỉ lấy knowledge có ít nhất 1 tag trong list này
   */
  /**
   * @param {string}   query
   * @param {string}   intent
   * @param {string[]} tagFilter  — chỉ lấy knowledge có ít nhất 1 tag trong list
   * @param {string|null} tenantId — null = owner's KB, non-null = tenant's KB
   */
  async search(query, intent = null, tagFilter = [], tenantId = null) {
    try {
      // 1. Generate embedding for the query
      const queryEmbedding = await llmFactory.generateEmbedding(query);

      if (!queryEmbedding || queryEmbedding.length === 0) {
        console.warn('Could not generate query embedding, falling back to text search');
        return this.fallbackTextSearch(query, intent, tagFilter, tenantId);
      }

      // 2. Vector similarity search via pgvector
      const category = intent && intent !== 'fallback' ? this.intentToCategory(intent) : null;
      const hasTagFilter = Array.isArray(tagFilter) && tagFilter.length > 0;

      const { Prisma } = require('@prisma/client');
      const tagCondition = hasTagFilter
        ? Prisma.sql`AND tags && ${tagFilter}::text[]`
        : Prisma.empty;

      // Tenant isolation: global (null) luôn được dùng; tenant-specific thêm vào
      const tenantCondition = tenantId
        ? Prisma.sql`AND (tenant_id = ${tenantId} OR tenant_id IS NULL)`
        : Prisma.sql`AND tenant_id IS NULL`;

      const results = await prisma.$queryRaw`
        SELECT
          id, title, content, category, type, tags, source_url,
          1 - (embedding <=> ${queryEmbedding}::vector) AS similarity
        FROM knowledge_base
        WHERE is_active = true
          AND (${category}::text IS NULL OR category = ${category}::text)
          AND embedding IS NOT NULL
          ${tenantCondition}
          ${tagCondition}
        ORDER BY embedding <=> ${queryEmbedding}::vector
        LIMIT ${this.maxResults}
      `;

      // 3. Filter by similarity threshold
      const relevant = results.filter(r => r.similarity >= this.similarityThreshold);

      console.log(`🔍 RAG: Found ${results.length} results, ${relevant.length} above threshold${hasTagFilter ? ` (tags: ${tagFilter.join(',')})` : ''}`);

      const filtered = relevant.length > 0 ? relevant : results.slice(0, 2);
      return this.rerank(filtered, intent);
    } catch (error) {
      console.error('RAG search error:', error.message);
      return this.fallbackTextSearch(query, intent, tagFilter);
    }
  }

  /**
   * Fallback: text-based search when vector search fails
   */
  async fallbackTextSearch(query, intent = null, tagFilter = [], tenantId = null) {
    try {
      let whereClause = {
        isActive: true,
        // global luôn hiển thị; nếu có tenantId thì thêm tenant-specific
        ...(tenantId
          ? { OR: [{ tenantId }, { tenantId: null }] }
          : { tenantId: null }),
      };

      if (intent && intent !== 'fallback') {
        const category = this.intentToCategory(intent);
        if (category) whereClause.category = category;
      }

      if (Array.isArray(tagFilter) && tagFilter.length > 0) {
        whereClause.tags = { hasSome: tagFilter };
      }

      const allEntries = await prisma.knowledgeBase.findMany({
        where: whereClause,
        select: {
          id: true,
          title: true,
          content: true,
          category: true,
          type: true,
          tags: true,
          sourceUrl: true,
        },
        take: this.maxResults,
      });

      // Simple keyword matching
      const keywords = query.toLowerCase().split(/\s+/);
      const scored = allEntries.map(entry => {
        const text = (entry.title + ' ' + entry.content).toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            score += 1;
          }
        }
        return { ...entry, similarity: score / Math.max(keywords.length, 1) };
      });

      return scored
        .filter(r => r.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, this.maxResults);
    } catch (error) {
      console.error('Text search error:', error);
      return [];
    }
  }

  /**
   * Format RAG results into context string for LLM — type-aware
   */
  formatContext(results) {
    if (!results || results.length === 0) {
      return 'Không tìm thấy thông tin liên quan.';
    }

    return results.map((r, i) => {
      const type = r.type || 'document';
      let body;

      switch (type) {
        case 'image_prompt':
          // Giữ nguyên prompt — LLM sẽ truyền lại cho user
          body = `[Prompt tạo ảnh — cung cấp nguyên văn cho người dùng]\n${r.content.substring(0, 1500)}`;
          break;
        case 'resource_link':
          body = r.content.substring(0, 500);
          if (r.sourceUrl) body += `\n🔗 Link: ${r.sourceUrl}`;
          break;
        case 'pricing':
          body = `[Thông tin giá]\n${r.content.substring(0, 800)}`;
          break;
        case 'contact':
          body = `[Thông tin liên hệ]\n${r.content.substring(0, 500)}`;
          break;
        case 'skill':
          body = `[Hướng dẫn kỹ năng]\n${r.content.substring(0, 1000)}`;
          break;
        case 'faq':
          body = r.content.substring(0, 800);
          break;
        default:
          body = r.content.substring(0, 1000);
      }

      return `[${i + 1}] ${r.title || 'Không có tiêu đề'}\n${body}`;
    }).join('\n\n---\n\n');
  }

  /**
   * Map intent type to knowledge category
   */
  intentToCategory(intent) {
    const map = {
      company_info: 'company_info',
      service_inquiry: 'service',
      campaign: 'campaign',
      content_package: 'content_package',
      general: null,
      fallback: null,
    };
    return map[intent] || null;
  }

  /**
   * Map intent to preferred knowledge types (soft filter: prefer these types)
   * Used to re-rank results after vector search
   */
  intentToPreferredTypes(intent) {
    const map = {
      company_info:    ['faq', 'document', 'contact', 'pricing'],
      service_inquiry: ['faq', 'document', 'pricing', 'skill'],
      content_package: ['image_prompt', 'skill', 'resource_link', 'document'],
      email_b2b:       ['document', 'faq'],
      zalo_b2b:        ['document', 'faq'],
      fallback:        null,
    };
    return map[intent] || null;
  }

  /**
   * Re-rank results: bump preferred types to the top
   */
  rerank(results, intent) {
    const preferred = this.intentToPreferredTypes(intent);
    if (!preferred) return results;
    return [...results].sort((a, b) => {
      const aScore = preferred.indexOf(a.type) !== -1 ? preferred.indexOf(a.type) : 999;
      const bScore = preferred.indexOf(b.type) !== -1 ? preferred.indexOf(b.type) : 999;
      if (aScore !== bScore) return aScore - bScore;
      return (b.similarity || 0) - (a.similarity || 0);
    });
  }

  /**
   * Auto-classify document type using LLM
   * Types: faq | document | image_prompt | skill | resource_link | pricing | contact
   * @param {object} doc - {title, content}
   * @returns {Promise<string>} Classified type
   */
  async autoClassify(doc) {
    try {
      const prompt = `Bạn là hệ thống phân loại tài liệu. Xác định loại của tài liệu sau CHỈ bằng 1 từ trong danh sách: faq, document, image_prompt, skill, resource_link, pricing, contact.

Tiêu đề: ${doc.title}
Nội dung (200 ký tự đầu): ${doc.content.substring(0, 200)}

Trả về CHÍNH XÁC 1 từ: faq, document, image_prompt, skill, resource_link, pricing, hoặc contact. Không thêm gì khác.`;

      const result = await llmFactory.generate(
        'Bạn là bộ phân loại tài liệu. Chỉ trả về 1 từ.',
        prompt,
        null // use default model
      );

      const type = result.trim().toLowerCase();
      const validTypes = ['faq', 'document', 'image_prompt', 'skill', 'resource_link', 'pricing', 'contact'];

      if (validTypes.includes(type)) {
        console.log(`🏷️ Auto-classified "${doc.title}" as "${type}"`);
        return type;
      }

      // Default fallback
      console.log(`🏷️ Unknown type "${type}" for "${doc.title}", defaulting to "document"`);
      return 'document';
    } catch (error) {
      console.warn(`Auto-classify failed for "${doc.title}":`, error.message);
      return 'document'; // fallback
    }
  }

  /**
   * Add document to knowledge base with embedding
   * @param {object} doc - {title, content, category, sourceType, sourceUrl, type, tags, parentId, fileUrl}
   */
  async addDocument(doc) {
    const safeTitle = doc.title.replace(/'/g, "''");
    const safeContent = doc.content.replace(/'/g, "''");
    const safeCategory = (doc.category || 'general').replace(/'/g, "''");
    const safeSourceType = (doc.sourceType || 'manual').replace(/'/g, "''");
    const safeSourceUrl = doc.sourceUrl ? `'${doc.sourceUrl.replace(/'/g, "''")}'` : 'NULL';
    
    // Auto-classify type if not provided
    let docType = doc.type;
    if (!docType) {
      docType = await this.autoClassify(doc);
    }
    const safeType = docType.replace(/'/g, "''");

    // Handle tags
    const tagsArray = doc.tags || [];
    const tagsLiteral = `{${tagsArray.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',')}}`;

    // Handle parentId
    const safeParentId = doc.parentId ? `'${doc.parentId.replace(/'/g, "''")}'` : 'NULL';
    
    // Handle fileUrl
    const safeFileUrl  = doc.fileUrl  ? `'${doc.fileUrl.replace(/'/g, "''")}'`  : 'NULL';
    // tenantId định nghĩa trước try-catch để cả 2 nhánh đều dùng được
    const safeTenantId = doc.tenantId ? `'${doc.tenantId.replace(/'/g, "''")}'` : 'NULL';

    try {
      // Try with embedding first
      const textToEmbed = `${doc.title}\n${doc.content}`.substring(0, 3000);
      const embedding = await llmFactory.generateEmbedding(textToEmbed);

      if (!embedding) {
        throw new Error('Failed to generate embedding');
      }

      const vectorLiteral = `[${embedding.join(',')}]`;

      const result = await prisma.$queryRawUnsafe(`
        INSERT INTO knowledge_base
          (id, title, content, category, type, tags, parent_id, file_url, source_type, source_url, embedding, is_active, tenant_id, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          '${safeTitle}',
          '${safeContent}',
          '${safeCategory}',
          '${safeType}',
          '${tagsLiteral}'::text[],
          ${safeParentId},
          ${safeFileUrl},
          '${safeSourceType}',
          ${safeSourceUrl},
          '${vectorLiteral}'::vector,
          true,
          ${safeTenantId},
          NOW(),
          NOW()
        )
        RETURNING id, title, type
      `);

      console.log(`✅ Added to knowledge base (with embedding): ${doc.title} [${safeType}]`);
      return result[0];
    } catch (embeddingError) {
      // Fallback: insert without embedding (text search still works)
      console.warn(`Embedding failed, saving without vector: ${embeddingError.message}`);

      const result = await prisma.$queryRawUnsafe(`
        INSERT INTO knowledge_base
          (id, title, content, category, type, tags, parent_id, file_url, source_type, source_url, is_active, tenant_id, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          '${safeTitle}',
          '${safeContent}',
          '${safeCategory}',
          '${safeType}',
          '${tagsLiteral}'::text[],
          ${safeParentId},
          ${safeFileUrl},
          '${safeSourceType}',
          ${safeSourceUrl},
          true,
          ${safeTenantId},
          NOW(),
          NOW()
        )
        RETURNING id, title, type
      `);

      console.log(`✅ Added to knowledge base (no embedding): ${doc.title}`);
      return result[0];
    }
  }

  /**
   * Delete a knowledge base entry
   */
  async deleteDocument(id) {
    try {
      await prisma.knowledgeBase.delete({ where: { id } });
      console.log(`�️ Deleted knowledge base entry: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting document:', error.message);
      return false;
    }
  }

  /**
   * Update a knowledge base entry and regenerate embedding
   */
  async updateDocument(id, updates) {
    try {
      const existing = await prisma.knowledgeBase.findUnique({ where: { id } });
      if (!existing) throw new Error('Document not found');

      const mergedTitle = updates.title || existing.title;
      const mergedContent = updates.content || existing.content;

      const textToEmbed = `${mergedTitle}\n${mergedContent}`.substring(0, 3000);
      const embedding = await llmFactory.generateEmbedding(textToEmbed);

      const title = (updates.title || existing.title).replace(/'/g, "''");
      const content = (updates.content || existing.content).replace(/'/g, "''");
      const category = (updates.category || existing.category).replace(/'/g, "''");
      const type = (updates.type || existing.type || 'document').replace(/'/g, "''");
      const tagsArray = updates.tags || existing.tags || [];
      const tagsLiteral = `{${tagsArray.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',')}}`;
      const sourceType = updates.sourceType || existing.sourceType;
      const sourceUrl = updates.sourceUrl || existing.sourceUrl;
      const isActive = updates.isActive !== undefined ? updates.isActive : existing.isActive;
      const parentId = updates.parentId || existing.parentId;
      const fileUrl = updates.fileUrl || existing.fileUrl;

      if (embedding) {
        const vectorLiteral = `[${embedding.join(',')}]`;
        await prisma.$queryRawUnsafe(`
          UPDATE knowledge_base
          SET
            title = '${title}',
            content = '${content}',
            category = '${category}',
            type = '${type}',
            tags = '${tagsLiteral}'::text[],
            parent_id = ${parentId ? `'${String(parentId).replace(/'/g, "''")}'` : 'NULL'},
            file_url = ${fileUrl ? `'${String(fileUrl).replace(/'/g, "''")}'` : 'NULL'},
            source_type = '${sourceType}',
            source_url = ${sourceUrl ? `'${sourceUrl.replace(/'/g, "''")}'` : 'NULL'},
            is_active = ${isActive},
            embedding = '${vectorLiteral}'::vector,
            updated_at = NOW()
          WHERE id = '${id}'
        `);
      } else {
        // Fallback: update without embedding (text search still works)
        console.warn(`Embedding unavailable for update, saving without vector: ${id}`);
        await prisma.$queryRawUnsafe(`
          UPDATE knowledge_base
          SET
            title = '${title}',
            content = '${content}',
            category = '${category}',
            type = '${type}',
            tags = '${tagsLiteral}'::text[],
            parent_id = ${parentId ? `'${String(parentId).replace(/'/g, "''")}'` : 'NULL'},
            file_url = ${fileUrl ? `'${String(fileUrl).replace(/'/g, "''")}'` : 'NULL'},
            source_type = '${sourceType}',
            source_url = ${sourceUrl ? `'${sourceUrl.replace(/'/g, "''")}'` : 'NULL'},
            is_active = ${isActive},
            updated_at = NOW()
          WHERE id = '${id}'
        `);
      }

      console.log(`✅ Updated knowledge base entry: ${id}`);
      return true;
    } catch (error) {
      console.error('Error updating document:', error.message);
      return false;
    }
  }
}

module.exports = new RagPipeline();