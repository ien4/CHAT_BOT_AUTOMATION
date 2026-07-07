const getPrisma = require('../db');
const prisma = getPrisma();
const alertQueue = require('../notifications/alertQueue');
const formatters = require('../notifications/formatters');

/**
 * LLM Factory
 * Routes requests to the best available provider.
 * Supports both simple text generation and agentic tool calling.
 */
class LlmFactory {
  constructor() {
    this.providers = {
      gemini:   require('./gemini'),
      deepseek: require('./deepseek'),
      claude:   require('./claude'),
      jina:     require('./jina'),
    };
    this.providerCache = null;
    this.cacheExpiry = 0;
  }

  async getActiveProviders() {
    if (this.providerCache && Date.now() < this.cacheExpiry) {
      return this.providerCache;
    }
    const providers = await prisma.llmProvider.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'asc' },
    });
    this.providerCache = providers;
    this.cacheExpiry = Date.now() + 60000;
    return providers;
  }

  async refreshCache() {
    this.providerCache = null;
    this.cacheExpiry = 0;
    return this.getActiveProviders();
  }

  getProviderName(configName) {
    const lower = configName.toLowerCase();
    if (lower.includes('gemini'))                              return 'gemini';
    if (lower.includes('deepseek'))                            return 'deepseek';
    if (lower.includes('claude') || lower.includes('anthropic')) return 'claude';
    if (lower.includes('jina'))                                return 'jina';
    return lower;
  }

  /**
   * Generate a text response using the best available provider.
   */
  async generate(systemPrompt, userPrompt, preferredModel = null) {
    const providers = await this.getActiveProviders();

    if (providers.length === 0) {
      return 'Xin lỗi, hệ thống chưa được cấu hình AI. Vui lòng liên hệ quản trị viên.';
    }

    const ordered = preferredModel
      ? [
          ...providers.filter((p) => p.modelName === preferredModel),
          ...providers.filter((p) => p.modelName !== preferredModel),
        ]
      : providers;

    const firstName = ordered[0]?.name || null;

    for (const config of ordered) {
      try {
        const name = this.getProviderName(config.name);
        const provider = this.providers[name];
        if (!provider) { console.warn(`Unknown provider: ${config.name}`); continue; }

        console.log(`🤖 Using ${config.name} (${config.modelName})`);
        const response = await provider.generate(
          config.apiKeyEncrypted,
          config.modelName,
          systemPrompt,
          userPrompt,
          { maxTokens: config.maxTokens, temperature: config.temperature, baseUrl: config.baseUrl }
        );

        if (response?.trim()) {
          if (firstName && config.name !== firstName) {
            await alertQueue.alert(
              `llm_fallback_${firstName}`,
              formatters.llmProviderFallback(firstName, config.name)
            );
          }
          return response;
        }
      } catch (error) {
        console.warn(`Provider ${config.name} failed: ${error.message}. Trying next...`);
      }
    }

    await alertQueue.alert('llm_all_failed', formatters.llmAllProvidersFailed());
    return 'Xin lỗi, mình đang gặp sự cố kỹ thuật. Bạn vui lòng thử lại sau ít phút nhé!';
  }

  /**
   * Agentic tool-calling: tries Claude first, then DeepSeek (both support tool use).
   * Gemini is skipped here — tool calling support is limited.
   *
   * @param {string}   systemPrompt
   * @param {Array}    messages      - conversation in provider-agnostic format [{role, content}]
   * @param {Function} executeTool   - async (name, input) => result
   * @param {object}   toolDefs      - { claudeTools, openaiTools }
   * @param {object}   options
   * @returns {Promise<string>}
   */
  async generateWithTools(systemPrompt, messages, executeTool, toolDefs, options = {}) {
    const providers = await this.getActiveProviders();

    // Prefer Claude and DeepSeek (both support tool calling)
    const toolProviders = providers.filter((p) => {
      const name = this.getProviderName(p.name);
      return name === 'claude' || name === 'deepseek';
    });

    if (toolProviders.length === 0) {
      // Fall back to plain generate if no tool-capable provider
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      return this.generate(systemPrompt, lastUserMsg?.content || '', null);
    }

    const firstName = toolProviders[0]?.name || null;

    for (const config of toolProviders) {
      const providerName = this.getProviderName(config.name);
      const provider = this.providers[providerName];
      if (!provider?.generateWithTools) continue;

      try {
        console.log(`🤖 Agent using ${config.name} (${config.modelName})`);

        // Claude uses its own tool format; DeepSeek uses OpenAI format
        const tools = providerName === 'claude' ? toolDefs.claudeTools : toolDefs.openaiTools;

        const response = await provider.generateWithTools(
          config.apiKeyEncrypted,
          config.modelName,
          systemPrompt,
          messages,
          tools,
          executeTool,
          {
            maxTokens: config.maxTokens || 2048,
            temperature: config.temperature || 0.7,
            ...options,
          }
        );

        if (response?.trim()) {
          if (firstName && config.name !== firstName) {
            await alertQueue.alert(
              `llm_fallback_${firstName}`,
              formatters.llmProviderFallback(firstName, config.name)
            );
          }
          return response;
        }
      } catch (error) {
        console.warn(`Tool-calling provider ${config.name} failed: ${error.message}. Trying next...`);
      }
    }

    await alertQueue.alert('llm_all_failed', formatters.llmAllProvidersFailed());
    return 'Xin lỗi, mình đang gặp sự cố kỹ thuật. Bạn vui lòng thử lại sau ít phút nhé!';
  }

  /**
   * Classification (cheap, single-word response)
   */
  async classify(systemPrompt, userPrompt) {
    const providers = await this.getActiveProviders();
    for (const config of providers) {
      try {
        const name = this.getProviderName(config.name);
        const provider = this.providers[name];
        if (!provider) continue;
        const response = await provider.generate(
          config.apiKeyEncrypted,
          config.modelName,
          systemPrompt,
          userPrompt,
          { maxTokens: 10, temperature: 0.1, baseUrl: config.baseUrl }
        );
        if (response?.trim()) return response.trim();
      } catch (error) {
        console.warn(`Classification failed with ${config.name}: ${error.message}`);
      }
    }
    return 'fallback';
  }

  /**
   * Generate embeddings — tries Gemini first, falls back to Jina AI (768 dims, multilingual)
   */
  async generateEmbedding(text) {
    const providers = await this.getActiveProviders();

    const geminiConfig = providers.find((p) => p.name.toLowerCase().includes('gemini'));
    if (geminiConfig) {
      try {
        return await this.providers['gemini'].generateEmbedding(geminiConfig.apiKeyEncrypted, text);
      } catch (error) {
        console.warn('Gemini embedding failed, trying Jina:', error.message);
      }
    }

    const jinaConfig = providers.find((p) => p.name.toLowerCase().includes('jina'));
    if (jinaConfig) {
      try {
        return await this.providers['jina'].generateEmbedding(jinaConfig.apiKeyEncrypted, text);
      } catch (error) {
        console.warn('Jina embedding failed:', error.message);
      }
    }

    console.warn('No embedding provider available, returning null');
    return null;
  }
}

module.exports = new LlmFactory();
