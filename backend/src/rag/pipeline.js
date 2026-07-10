const { Prisma } = require('@prisma/client');
const llmFactory = require('../llm/factory');
const getPrisma = require('../db');

const prisma = getPrisma();

const EMBEDDING_DIMENSION = 768;
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;
const DEFAULT_SIMILARITY_THRESHOLD = 0.3;

function assertEmbeddingVector(vector, expectedDimension = EMBEDDING_DIMENSION) {
  if (!Array.isArray(vector)) {
    throw new Error('Embedding vector must be an array');
  }

  if (expectedDimension && vector.length !== expectedDimension) {
    throw new Error(`Embedding vector dimension mismatch: expected ${expectedDimension}, got ${vector.length}`);
  }

  return vector.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Embedding vector item at index ${index} must be a finite number`);
    }
    return Object.is(value, -0) ? 0 : value;
  });
}

function toPgVectorLiteral(vector, expectedDimension = EMBEDDING_DIMENSION) {
  const safeVector = assertEmbeddingVector(vector, expectedDimension);
  return `[${safeVector.map((value) => Number(value).toString()).join(',')}]`;
}

function fallbackVectorLiteral() {
  return toPgVectorLiteral(Array.from({ length: EMBEDDING_DIMENSION }, () => 0));
}

function sanitizeSearchLimit(value, defaultValue = DEFAULT_SEARCH_LIMIT, maxValue = MAX_SEARCH_LIMIT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, 1), maxValue);
}

function sanitizeSimilarityThreshold(value, defaultValue = DEFAULT_SIMILARITY_THRESHOLD) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, 0), 1);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag) => tag !== null && tag !== undefined)
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 50);
}

function toTextArraySql(tags) {
  const safeTags = normalizeTags(tags);
  if (safeTags.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(safeTags)}]::text[]`;
}

function stringValue(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function nullableString(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

/**
 * RAG (Retrieval Augmented Generation) pipeline.
 *
 * Flow: user query -> embedding -> pgvector search -> context formatting.
 */
class RagPipeline {
  constructor() {
    this.similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD;
    this.maxResults = DEFAULT_SEARCH_LIMIT;
  }

  assertEmbeddingVector(vector, expectedDimension = EMBEDDING_DIMENSION) {
    return assertEmbeddingVector(vector, expectedDimension);
  }

  toPgVectorLiteral(vector, expectedDimension = EMBEDDING_DIMENSION) {
    return toPgVectorLiteral(vector, expectedDimension);
  }

  fallbackVectorLiteral() {
    return fallbackVectorLiteral();
  }

  sanitizeSearchLimit(value, defaultValue = DEFAULT_SEARCH_LIMIT, maxValue = MAX_SEARCH_LIMIT) {
    return sanitizeSearchLimit(value, defaultValue, maxValue);
  }

  sanitizeSimilarityThreshold(value, defaultValue = DEFAULT_SIMILARITY_THRESHOLD) {
    return sanitizeSimilarityThreshold(value, defaultValue);
  }

  async search(query, intent = null, tagFilter = [], tenantId = null) {
    try {
      const queryEmbedding = await llmFactory.generateEmbedding(query);

      if (!queryEmbedding || queryEmbedding.length === 0) {
        console.warn('Could not generate query embedding, falling back to text search');
        return this.fallbackTextSearch(query, intent, tagFilter, tenantId);
      }

      const category = intent && intent !== 'fallback' ? this.intentToCategory(intent) : null;
      const safeTagFilter = normalizeTags(tagFilter);
      const hasTagFilter = safeTagFilter.length > 0;
      const vectorLiteral = this.toPgVectorLiteral(queryEmbedding);
      const limit = this.sanitizeSearchLimit(this.maxResults);
      const threshold = this.sanitizeSimilarityThreshold(this.similarityThreshold);

      const tagCondition = hasTagFilter
        ? Prisma.sql`AND tags && ${toTextArraySql(safeTagFilter)}`
        : Prisma.empty;

      const tenantCondition = tenantId
        ? Prisma.sql`AND (tenant_id = ${tenantId} OR tenant_id IS NULL)`
        : Prisma.sql`AND tenant_id IS NULL`;

      const results = await prisma.$queryRaw`
        SELECT
          id, title, content, category, type, tags, source_url,
          1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM knowledge_base
        WHERE is_active = true
          AND (${category}::text IS NULL OR category = ${category}::text)
          AND embedding IS NOT NULL
          ${tenantCondition}
          ${tagCondition}
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit}
      `;

      const finiteResults = results.filter((result) => Number.isFinite(Number(result.similarity)));
      const relevant = finiteResults.filter((result) => Number(result.similarity) >= threshold);
      console.log(
        `RAG: Found ${results.length} results, ${relevant.length} above threshold${hasTagFilter ? ` (tags: ${safeTagFilter.join(',')})` : ''}`
      );

      if (finiteResults.length === 0) {
        return this.fallbackTextSearch(query, intent, tagFilter, tenantId);
      }

      const filtered = relevant.length > 0 ? relevant : finiteResults.slice(0, 2);
      return this.rerank(filtered, intent);
    } catch (error) {
      console.error('RAG search error:', error.message);
      return this.fallbackTextSearch(query, intent, tagFilter, tenantId);
    }
  }

  async fallbackTextSearch(query, intent = null, tagFilter = [], tenantId = null) {
    try {
      const whereClause = {
        isActive: true,
        ...(tenantId
          ? { OR: [{ tenantId }, { tenantId: null }] }
          : { tenantId: null }),
      };

      if (intent && intent !== 'fallback') {
        const category = this.intentToCategory(intent);
        if (category) whereClause.category = category;
      }

      const safeTagFilter = normalizeTags(tagFilter);
      if (safeTagFilter.length > 0) {
        whereClause.tags = { hasSome: safeTagFilter };
      }

      const limit = this.sanitizeSearchLimit(this.maxResults);
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
        take: limit,
      });

      const keywords = stringValue(query).toLowerCase().split(/\s+/).filter(Boolean);
      const scored = allEntries.map((entry) => {
        const text = `${entry.title} ${entry.content}`.toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
          if (text.includes(keyword)) score += 1;
        }
        return { ...entry, similarity: score / Math.max(keywords.length, 1) };
      });

      return scored
        .filter((result) => result.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error('Text search error:', error);
      return [];
    }
  }

  formatContext(results) {
    if (!results || results.length === 0) {
      return 'Không tìm thấy thông tin liên quan.';
    }

    return results.map((result, index) => {
      const type = result.type || 'document';
      let body;

      switch (type) {
        case 'image_prompt':
          body = `[Prompt tạo ảnh - cung cấp nguyên văn cho người dùng]\n${result.content.substring(0, 1500)}`;
          break;
        case 'resource_link':
          body = result.content.substring(0, 500);
          if (result.sourceUrl) body += `\nLink: ${result.sourceUrl}`;
          break;
        case 'pricing':
          body = `[Thông tin giá]\n${result.content.substring(0, 800)}`;
          break;
        case 'contact':
          body = `[Thông tin liên hệ]\n${result.content.substring(0, 500)}`;
          break;
        case 'skill':
          body = `[Hướng dẫn kỹ năng]\n${result.content.substring(0, 1000)}`;
          break;
        case 'faq':
          body = result.content.substring(0, 800);
          break;
        default:
          body = result.content.substring(0, 1000);
      }

      return `[${index + 1}] ${result.title || 'Không có tiêu đề'}\n${body}`;
    }).join('\n\n---\n\n');
  }

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

  intentToPreferredTypes(intent) {
    const map = {
      company_info: ['faq', 'document', 'contact', 'pricing'],
      service_inquiry: ['faq', 'document', 'pricing', 'skill'],
      content_package: ['image_prompt', 'skill', 'resource_link', 'document'],
      email_b2b: ['document', 'faq'],
      zalo_b2b: ['document', 'faq'],
      fallback: null,
    };
    return map[intent] || null;
  }

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

  async autoClassify(doc) {
    try {
      const title = stringValue(doc.title, 'Untitled');
      const content = stringValue(doc.content);
      const prompt = `Bạn là hệ thống phân loại tài liệu. Xác định loại của tài liệu sau CHỈ bằng 1 từ trong danh sách: faq, document, image_prompt, skill, resource_link, pricing, contact.

Tiêu đề: ${title}
Nội dung (200 ký tự đầu): ${content.substring(0, 200)}

Trả về CHÍNH XÁC 1 từ: faq, document, image_prompt, skill, resource_link, pricing, hoặc contact. Không thêm gì khác.`;

      const result = await llmFactory.generate(
        'Bạn là bộ phân loại tài liệu. Chỉ trả về 1 từ.',
        prompt,
        null
      );

      const type = result.trim().toLowerCase();
      const validTypes = ['faq', 'document', 'image_prompt', 'skill', 'resource_link', 'pricing', 'contact'];

      if (validTypes.includes(type)) {
        console.log(`Auto-classified "${title}" as "${type}"`);
        return type;
      }

      console.log(`Unknown type "${type}" for "${title}", defaulting to "document"`);
      return 'document';
    } catch (error) {
      console.warn(`Auto-classify failed for "${doc.title}":`, error.message);
      return 'document';
    }
  }

  async addDocument(doc) {
    const title = stringValue(doc.title);
    const content = stringValue(doc.content);
    const category = stringValue(doc.category, 'general');
    const sourceType = stringValue(doc.sourceType, 'manual');
    const sourceUrl = nullableString(doc.sourceUrl);
    const parentId = nullableString(doc.parentId);
    const fileUrl = nullableString(doc.fileUrl);
    const tenantId = nullableString(doc.tenantId);
    const tagsArray = normalizeTags(doc.tags);
    const tagsSql = toTextArraySql(tagsArray);

    let docType = nullableString(doc.type);
    if (!docType) {
      docType = await this.autoClassify({ title, content });
    }

    try {
      const textToEmbed = `${title}\n${content}`.substring(0, 3000);
      const embedding = await llmFactory.generateEmbedding(textToEmbed);

      if (!embedding) {
        throw new Error('Failed to generate embedding');
      }

      const vectorLiteral = this.toPgVectorLiteral(embedding);
      const result = await prisma.$queryRaw`
        INSERT INTO knowledge_base
          (id, title, content, category, type, tags, parent_id, file_url, source_type, source_url, embedding, is_active, tenant_id, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          ${title},
          ${content},
          ${category},
          ${docType},
          ${tagsSql},
          ${parentId},
          ${fileUrl},
          ${sourceType},
          ${sourceUrl},
          ${vectorLiteral}::vector,
          true,
          ${tenantId},
          NOW(),
          NOW()
        )
        RETURNING id, title, type
      `;

      console.log(`Added to knowledge base (with embedding): ${title} [${docType}]`);
      return result[0];
    } catch (embeddingError) {
      console.warn(`Embedding failed, saving with fallback vector: ${embeddingError.message}`);

      const fallbackVector = this.fallbackVectorLiteral();
      const result = await prisma.$queryRaw`
        INSERT INTO knowledge_base
          (id, title, content, category, type, tags, parent_id, file_url, source_type, source_url, embedding, is_active, tenant_id, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          ${title},
          ${content},
          ${category},
          ${docType},
          ${tagsSql},
          ${parentId},
          ${fileUrl},
          ${sourceType},
          ${sourceUrl},
          ${fallbackVector}::vector,
          true,
          ${tenantId},
          NOW(),
          NOW()
        )
        RETURNING id, title, type
      `;

      console.log(`Added to knowledge base (fallback vector): ${title}`);
      return result[0];
    }
  }

  async deleteDocument(id) {
    try {
      await prisma.knowledgeBase.delete({ where: { id } });
      console.log(`Deleted knowledge base entry: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting document:', error.message);
      return false;
    }
  }

  async updateDocument(id, updates) {
    try {
      const existing = await prisma.knowledgeBase.findUnique({ where: { id } });
      if (!existing) throw new Error('Document not found');

      const title = stringValue(updates.title || existing.title);
      const content = stringValue(updates.content || existing.content);
      const category = stringValue(updates.category || existing.category);
      const type = stringValue(updates.type || existing.type || 'document');
      const tagsArray = normalizeTags(updates.tags || existing.tags || []);
      const tagsSql = toTextArraySql(tagsArray);
      const sourceType = stringValue(updates.sourceType || existing.sourceType || 'manual');
      const sourceUrl = nullableString(updates.sourceUrl || existing.sourceUrl);
      const isActive = updates.isActive !== undefined ? updates.isActive : existing.isActive;
      const parentId = nullableString(updates.parentId || existing.parentId);
      const fileUrl = nullableString(updates.fileUrl || existing.fileUrl);

      const textToEmbed = `${title}\n${content}`.substring(0, 3000);
      const embedding = await llmFactory.generateEmbedding(textToEmbed);

      if (embedding) {
        const vectorLiteral = this.toPgVectorLiteral(embedding);
        await prisma.$executeRaw`
          UPDATE knowledge_base
          SET
            title = ${title},
            content = ${content},
            category = ${category},
            type = ${type},
            tags = ${tagsSql},
            parent_id = ${parentId},
            file_url = ${fileUrl},
            source_type = ${sourceType},
            source_url = ${sourceUrl},
            is_active = ${Boolean(isActive)},
            embedding = ${vectorLiteral}::vector,
            updated_at = NOW()
          WHERE id = ${id}
        `;
      } else {
        console.warn(`Embedding unavailable for update, saving without vector: ${id}`);
        await prisma.$executeRaw`
          UPDATE knowledge_base
          SET
            title = ${title},
            content = ${content},
            category = ${category},
            type = ${type},
            tags = ${tagsSql},
            parent_id = ${parentId},
            file_url = ${fileUrl},
            source_type = ${sourceType},
            source_url = ${sourceUrl},
            is_active = ${Boolean(isActive)},
            updated_at = NOW()
          WHERE id = ${id}
        `;
      }

      console.log(`Updated knowledge base entry: ${id}`);
      return true;
    } catch (error) {
      console.error('Error updating document:', error.message);
      return false;
    }
  }
}

module.exports = new RagPipeline();
