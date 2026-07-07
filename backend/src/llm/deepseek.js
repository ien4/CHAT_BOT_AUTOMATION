const axios = require('axios');

/**
 * DeepSeek API Integration
 * OpenAI-compatible format — supports tool/function calling
 * Very cost-effective (~$0.14/1M input tokens)
 */
class DeepSeekProvider {
  constructor() {
    this.baseUrl = 'https://api.deepseek.com/v1';
  }

  /**
   * Generate text completion (simple, no tools)
   */
  async generate(apiKey, modelName, systemPrompt, userPrompt, options = {}) {
    const { maxTokens = 2048, temperature = 0.7 } = options;
    const actualModel = modelName || 'deepseek-chat';

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: actualModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    ).catch((error) => {
      const status = error.response?.status;
      const msg = error.response?.data?.error?.message || error.message;
      throw new Error(`DeepSeek API error (${status}): ${msg}`);
    });

    const text = response.data.choices?.[0]?.message?.content;
    if (!text?.trim()) throw new Error('Empty response from DeepSeek');
    return text.trim();
  }

  /**
   * Agentic tool-calling loop (OpenAI function calling format)
   *
   * @param {string} apiKey
   * @param {string} modelName
   * @param {string} systemPrompt
   * @param {Array}  messages      - [{role, content}] OpenAI format
   * @param {Array}  tools         - OPENAI_TOOLS definitions
   * @param {Function} executeTool - async (name, input) => result object
   * @param {object} options
   * @returns {Promise<string>}
   */
  async generateWithTools(apiKey, modelName, systemPrompt, messages, tools, executeTool, options = {}) {
    const { maxTokens = 2048, temperature = 0.7, maxIterations = 6 } = options;
    const actualModel = modelName || 'deepseek-chat';

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    // Prepend system message in OpenAI format
    let workingMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: actualModel,
          messages: workingMessages,
          tools,
          tool_choice: 'auto',
          max_tokens: maxTokens,
          temperature,
          stream: false,
        },
        { headers }
      ).catch((error) => {
        const status = error.response?.status;
        const msg = error.response?.data?.error?.message || error.message;
        throw new Error(`DeepSeek API error (${status}): ${msg}`);
      });

      const choice = response.data.choices?.[0];
      const { finish_reason, message } = choice;

      if (finish_reason === 'stop') {
        return message.content?.trim() || '';
      }

      if (finish_reason === 'tool_calls') {
        // Add assistant message with tool_calls
        workingMessages.push(message);

        for (const tc of message.tool_calls || []) {
          const toolName = tc.function.name;
          let toolInput;
          try {
            toolInput = JSON.parse(tc.function.arguments);
          } catch (_) {
            toolInput = {};
          }

          console.log(`🔧 Tool call: ${toolName}`, JSON.stringify(toolInput));
          let result;
          try {
            result = await executeTool(toolName, toolInput);
          } catch (err) {
            result = { error: err.message };
          }
          console.log(`🔧 Tool result: ${toolName}`, JSON.stringify(result));

          workingMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }

        continue;
      }

      // length or unexpected finish
      return message.content?.trim() || '';
    }

    return 'Xin lỗi, mình đang xử lý quá nhiều bước. Bạn vui lòng thử lại nhé!';
  }
}

module.exports = new DeepSeekProvider();
