const getPrisma = require('../db');
const prisma = getPrisma();

/**
 * Context Manager
 * Manages conversation context, dialog state, and message history
 */
class ContextManager {
  /**
   * Get recent conversation context (last N messages)
   * @param {string} conversationId
   * @param {number} limit - Number of recent messages to retrieve
   * @returns {Promise<Array>}
   */
  async getContext(conversationId, limit = 10) {
    try {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          direction: true,
          content: true,
          intent: true,
          createdAt: true,
        },
      });

      // Reverse to get chronological order
      return messages.reverse();
    } catch (error) {
      console.error('Error getting context:', error);
      return [];
    }
  }

  /**
   * Update conversation context (metadata)
   * @param {string} conversationId
   * @param {object} contextData - Key-value pairs to merge into context
   */
  async updateContext(conversationId, contextData) {
    try {
      // Get existing context
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { context: true },
      });

      const mergedContext = {
        ...(conversation?.context || {}),
        ...contextData,
        lastUpdated: new Date().toISOString(),
      };

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: mergedContext },
      });

      return mergedContext;
    } catch (error) {
      console.error('Error updating context:', error);
      return null;
    }
  }

  /**
   * Update dialog state within conversation context
   * @param {string} conversationId
   * @param {object|null} dialogState - Dialog state object or null to clear
   */
  async updateDialogState(conversationId, dialogState) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { context: true },
      });

      const mergedContext = {
        ...(conversation?.context || {}),
        dialogState,
        lastUpdated: new Date().toISOString(),
      };

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: mergedContext },
      });

      return mergedContext;
    } catch (error) {
      console.error('Error updating dialog state:', error);
      return null;
    }
  }

  /**
   * Get current dialog state
   * @param {string} conversationId
   * @returns {Promise<object|null>}
   */
  async getDialogState(conversationId) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { context: true },
      });

      return conversation?.context?.dialogState || null;
    } catch (error) {
      console.error('Error getting dialog state:', error);
      return null;
    }
  }

  /**
   * Clear all context for a conversation
   * @param {string} conversationId
   */
  async clearContext(conversationId) {
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: {} },
      });
    } catch (error) {
      console.error('Error clearing context:', error);
    }
  }

  /**
   * Close a conversation
   * @param {string} conversationId
   */
  async closeConversation(conversationId) {
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'closed', context: {} },
      });
    } catch (error) {
      console.error('Error closing conversation:', error);
    }
  }

  /**
   * Get conversation summary (for dashboard)
   */
  async getConversationSummary(conversationId) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              direction: true,
              content: true,
              intent: true,
              confidence: true,
              createdAt: true,
            },
          },
        },
      });

      return conversation;
    } catch (error) {
      console.error('Error getting conversation summary:', error);
      return null;
    }
  }
}

module.exports = new ContextManager();