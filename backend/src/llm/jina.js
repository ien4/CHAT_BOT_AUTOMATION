const axios = require('axios');

/**
 * Jina AI Embedding Provider
 * Model: jina-embeddings-v2-base-multilingual (768 dims — matches pgvector schema)
 * Free tier: 1M tokens/month — https://jina.ai/embeddings
 */
class JinaProvider {
  constructor() {
    this.baseUrl = 'https://api.jina.ai/v1';
    this.embeddingModel = 'jina-embeddings-v3';
  }

  async generateEmbedding(apiKey, text) {
    const response = await axios.post(
      `${this.baseUrl}/embeddings`,
      {
        model: this.embeddingModel,
        input: [text],
        dimensions: 768,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 15000,
      }
    ).catch((error) => {
      const status = error.response?.status;
      const msg = error.response?.data?.detail || error.message;
      throw new Error(`Jina Embedding error (${status}): ${msg}`);
    });

    const embedding = response.data?.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error('No embedding returned from Jina AI');
    }

    return embedding;
  }
}

module.exports = new JinaProvider();
