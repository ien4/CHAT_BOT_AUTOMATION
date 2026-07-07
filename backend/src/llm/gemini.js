const axios = require('axios');

/**
 * Google Gemini API Integration
 * Uses Gemini 2.0 Flash (free tier available)
 * Also provides embedding via text-embedding-004 model
 */
class GeminiProvider {
  constructor() {
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.embeddingModel = 'text-embedding-004';
  }

  /**
   * Generate text completion via Gemini
   */
  async generate(apiKey, modelName, systemPrompt, userPrompt, options = {}) {
    const { maxTokens = 2048, temperature = 0.7 } = options;
    const actualModel = modelName || 'gemini-2.0-flash';

    const url = `${this.baseUrl}/models/${actualModel}:generateContent?key=${apiKey}`;

    // Gemini combines system + user in a single content array
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt + '\n\n' + userPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        topP: 0.95,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const candidate = response.data.candidates?.[0];
      if (!candidate) {
        throw new Error('No response from Gemini');
      }

      if (candidate.finishReason === 'SAFETY') {
        throw new Error('Response blocked by safety filter');
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      return text.trim();
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const msg = error.response.data?.error?.message || 'Unknown error';
        throw new Error(`Gemini API error (${status}): ${msg}`);
      }
      throw error;
    }
  }

  /**
   * Generate embedding vector for text
   * Uses text-embedding-004 model (free tier, 768 dimensions)
   */
  async generateEmbedding(apiKey, text) {
    const embedBaseUrl = 'https://generativelanguage.googleapis.com/v1';
    const url = `${embedBaseUrl}/models/${this.embeddingModel}:embedContent?key=${apiKey}`;

    const payload = {
      model: `models/${this.embeddingModel}`,
      content: {
        parts: [{ text }],
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const embedding = response.data.embedding?.values;

      if (!embedding || embedding.length === 0) {
        throw new Error('No embedding returned from Gemini');
      }

      return embedding;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const msg = error.response.data?.error?.message || 'Unknown error';
        throw new Error(`Gemini Embedding error (${status}): ${msg}`);
      }
      throw error;
    }
  }

  /**
   * Count tokens (approximate for Gemini)
   */
  countTokens(text) {
    // Gemini uses ~4 characters per token for Vietnamese/English mixed text
    return Math.ceil(text.length / 4);
  }
}

module.exports = new GeminiProvider();