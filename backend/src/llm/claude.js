const axios = require('axios');

/**
 * Anthropic Claude API Integration
 * Supports both simple text generation and agentic tool calling
 */
class ClaudeProvider {
  constructor() {
    this.baseUrl = 'https://api.anthropic.com/v1';
    this.version = '2023-06-01';
  }

  /**
   * Generate text completion (simple, no tools)
   */
  async generate(apiKey, modelName, systemPrompt, userPrompt, options = {}) {
    const { maxTokens = 2048, temperature = 0.7 } = options;
    const actualModel = modelName || 'claude-haiku-4-5-20251001';

    const response = await axios.post(
      `${this.baseUrl}/messages`,
      {
        model: actualModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': this.version,
        },
      }
    ).catch((error) => {
      const status = error.response?.status;
      const msg = error.response?.data?.error?.message || error.message;
      throw new Error(`Claude API error (${status}): ${msg}`);
    });

    const text = response.data.content?.[0]?.text;
    if (!text?.trim()) throw new Error('Empty response from Claude');
    return text.trim();
  }

  /**
   * Agentic tool-calling loop
   * Calls Claude, executes tools if requested, loops until final text response
   *
   * @param {string} apiKey
   * @param {string} modelName
   * @param {string} systemPrompt
   * @param {Array}  messages      - [{role:'user'|'assistant', content: string|Array}]
   * @param {Array}  tools         - CLAUDE_TOOLS definitions
   * @param {Function} executeTool - async (name, input) => result object
   * @param {object} options
   * @returns {Promise<string>}    - final text to send to user
   */
  async generateWithTools(apiKey, modelName, systemPrompt, messages, tools, executeTool, options = {}) {
    const { maxTokens = 2048, temperature = 0.7, maxIterations = 6 } = options;
    const actualModel = modelName || 'claude-haiku-4-5-20251001';

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': this.version,
    };

    let workingMessages = [...messages];
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: actualModel,
          system: systemPrompt,
          messages: workingMessages,
          tools,
          max_tokens: maxTokens,
          temperature,
        },
        { headers }
      ).catch((error) => {
        const status = error.response?.status;
        const msg = error.response?.data?.error?.message || error.message;
        throw new Error(`Claude API error (${status}): ${msg}`);
      });

      const { stop_reason, content } = response.data;

      if (stop_reason === 'end_turn') {
        const text = content.find((c) => c.type === 'text')?.text;
        return text?.trim() || '';
      }

      if (stop_reason === 'tool_use') {
        // Add assistant's response (may contain text + tool_use blocks)
        workingMessages.push({ role: 'assistant', content });

        // Execute each tool call and collect results
        const toolUses = content.filter((c) => c.type === 'tool_use');
        const toolResults = [];

        for (const tu of toolUses) {
          console.log(`🔧 Tool call: ${tu.name}`, JSON.stringify(tu.input));
          let result;
          try {
            result = await executeTool(tu.name, tu.input);
          } catch (err) {
            result = { error: err.message };
          }
          console.log(`🔧 Tool result: ${tu.name}`, JSON.stringify(result));

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          });
        }

        // Feed results back to Claude
        workingMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // max_tokens or unexpected stop — extract any text
      const text = content?.find?.((c) => c.type === 'text')?.text;
      return text?.trim() || '';
    }

    return 'Xin lỗi, mình đang xử lý quá nhiều bước. Bạn vui lòng thử lại nhé!';
  }
}

module.exports = new ClaudeProvider();
