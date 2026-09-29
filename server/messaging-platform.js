/**
 * Xtobe Messaging Platform Interface
 * 
 * Platform-neutral interface that all messaging platforms must implement.
 * WhatsApp, Instagram, and future platforms implement this independently.
 * 
 * Unified Message Schema:
 * {
 *   platform: string,
 *   accountId: string,
 *   conversationId: string,
 *   messageId: string,
 *   senderId: string,
 *   senderName: string,
 *   timestamp: number,
 *   type: string,
 *   text: string,
 *   media: Object | null,
 *   context: Object,
 *   raw: Object
 * }
 */

/**
 * Base class for all messaging platforms.
 * Subclasses must implement: receive(), sendText(), sendMedia(), verifyWebhook(), normalizeMessage()
 */
class MessagingPlatform {
  constructor(config = {}) {
    this.platformName = 'abstract';
    this.config = config;
    this.credentials = {};
  }

  /**
   * Receive and normalize incoming messages.
   * @param {Object} rawPayload - Raw webhook payload from platform
   * @returns {Array} Array of normalized messages
   */
  receive(rawPayload) {
    throw new Error('receive() must be implemented by subclass');
  }

  /**
   * Send a text message.
   * @param {string} to - Recipient identifier
   * @param {string} text - Message text
   * @returns {Object} Send result
   */
  async sendText(to, text) {
    throw new Error('sendText() must be implemented by subclass');
  }

  /**
   * Send a media message.
   * @param {string} to - Recipient identifier
   * @param {Object} media - Media object { type, url, caption }
   * @returns {Object} Send result
   */
  async sendMedia(to, media) {
    throw new Error('sendMedia() must be implemented by subclass');
  }

  /**
   * Verify webhook subscription request.
   * @param {Object} query - Query parameters
   * @returns {string|null} Challenge string or null
   */
  verifyWebhook(query) {
    throw new Error('verifyWebhook() must be implemented by subclass');
  }

  /**
   * Normalize a raw platform message to unified schema.
   * @param {Object} rawMessage - Raw message from platform
   * @returns {Object} Normalized message
   */
  normalizeMessage(rawMessage) {
    throw new Error('normalizeMessage() must be implemented by subclass');
  }

  /**
   * Get conversation identity key.
   * Prevents cross-platform identity collision.
   * @param {Object} message - Normalized message
   * @returns {string} Unique conversation key
   */
  getConversationKey(message) {
    return `${this.platformName}:${message.accountId}:${message.conversationId}:${message.senderId}`;
  }

  /**
   * Validate that outbound messaging is permitted.
   * @param {string} to - Recipient
   * @returns {Object} { permitted: boolean, reason?: string }
   */
  canSendTo(to) {
    return { permitted: true };
  }

  /**
   * Create a structured error for unsupported operations.
   * @param {string} code - Error code
   * @param {string} reason - Human-readable reason
   * @param {Object} extra - Extra fields
   * @returns {Object} Structured error
   */
  createError(code, reason, extra = {}) {
    return {
      success: false,
      platform: this.platformName,
      code,
      reason,
      ...extra,
    };
  }
}

module.exports = { MessagingPlatform };
