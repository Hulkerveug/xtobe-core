/**
 * Xtobe Message Bus
 * 
 * Unified message bus that routes messages between platforms and the AI layer.
 * 
 * Architecture:
 *   WhatsApp ─────┐
 *   Instagram ────┼──> Message Bus ──> AI Agent ──> Response Router
 *   Future ───────┘                                      │
 *                                                        ├── WhatsApp
 *                                                        └── Instagram
 * 
 * The AI layer never sees platform-specific data. It works with unified messages.
 */

const { EventEmitter } = require('events');

class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.platforms = new Map(); // platformName -> MessagingPlatform instance
    this.conversations = new Map(); // conversationKey -> conversation state
    this.messageHistory = new Map(); // conversationKey -> [messages]
    this.maxHistory = 50; // messages per conversation
  }

  /**
   * Register a messaging platform.
   * @param {MessagingPlatform} platform - Platform instance
   */
  registerPlatform(platform) {
    this.platforms.set(platform.platformName, platform);
    console.log(`[MessageBus] Registered platform: ${platform.platformName}`);
  }

  /**
   * Get a registered platform.
   * @param {string} name - Platform name
   * @returns {MessagingPlatform|null}
   */
  getPlatform(name) {
    return this.platforms.get(name) || null;
  }

  /**
   * Process an incoming message from any platform.
   * Normalizes, stores, and emits to AI layer.
   * @param {string} platformName - Source platform
   * @param {Object} rawPayload - Raw webhook payload
   * @returns {Array} Normalized messages
   */
  async processIncoming(platformName, rawPayload) {
    const platform = this.platforms.get(platformName);
    if (!platform) {
      throw new Error(`Platform not registered: ${platformName}`);
    }

    const messages = platform.receive(rawPayload);
    const results = [];

    for (const msg of messages) {
      // Skip status updates and non-message events
      if (msg.type === 'status_update' || !msg.messageId) {
        continue;
      }

      // Deduplicate by messageId
      if (this._isDuplicate(msg)) {
        console.log(`[MessageBus] Duplicate message skipped: ${msg.messageId}`);
        continue;
      }

      // Store in conversation history
      const convKey = platform.getConversationKey(msg);
      this._addToHistory(convKey, msg);

      // Emit to AI layer
      this.emit('message', msg);
      this.emit(`message:${msg.platform}`, msg);

      results.push(msg);
    }

    return results;
  }

  /**
   * Send a message through the appropriate platform.
   * @param {string} platformName - Target platform
   * @param {string} to - Recipient identifier
   * @param {string} text - Message text
   * @returns {Object} Send result
   */
  async sendText(platformName, to, text) {
    const platform = this.platforms.get(platformName);
    if (!platform) {
      return { success: false, error: `Platform not registered: ${platformName}` };
    }

    // Check if outbound is permitted
    const check = platform.canSendTo(to);
    if (!check.permitted) {
      return platform.createError(
        'OUTBOUND_NOT_ALLOWED',
        check.reason || 'Outbound messaging not permitted',
        { requiresCustomerInitiation: check.requiresCustomerInitiation || false }
      );
    }

    return await platform.sendText(to, text);
  }

  /**
   * Send a media message through the appropriate platform.
   * @param {string} platformName - Target platform
   * @param {string} to - Recipient identifier
   * @param {Object} media - Media object
   * @returns {Object} Send result
   */
  async sendMedia(platformName, to, media) {
    const platform = this.platforms.get(platformName);
    if (!platform) {
      return { success: false, error: `Platform not registered: ${platformName}` };
    }

    const check = platform.canSendTo(to);
    if (!check.permitted) {
      return platform.createError(
        'OUTBOUND_NOT_ALLOWED',
        check.reason || 'Outbound messaging not permitted',
        { requiresCustomerInitiation: check.requiresCustomerInitiation || false }
      );
    }

    return await platform.sendMedia(to, media);
  }

  /**
   * Get conversation history.
   * @param {string} conversationKey - Conversation key
   * @param {number} limit - Max messages
   * @returns {Array} Messages
   */
  getHistory(conversationKey, limit = 10) {
    const history = this.messageHistory.get(conversationKey) || [];
    return history.slice(-limit);
  }

  /**
   * Get all registered platforms.
   * @returns {Array} Platform names
   */
  getPlatforms() {
    return Array.from(this.platforms.keys());
  }

  /**
   * Check if a message is a duplicate.
   * @param {Object} msg - Normalized message
   * @returns {boolean}
   */
  _isDuplicate(msg) {
    const convKey = `${msg.platform}:${msg.accountId}:${msg.conversationId}:${msg.senderId}`;
    const history = this.messageHistory.get(convKey) || [];
    return history.some(m => m.messageId === msg.messageId);
  }

  /**
   * Add message to conversation history.
   * @param {string} convKey - Conversation key
   * @param {Object} msg - Message
   */
  _addToHistory(convKey, msg) {
    if (!this.messageHistory.has(convKey)) {
      this.messageHistory.set(convKey, []);
    }
    const history = this.messageHistory.get(convKey);
    history.push(msg);
    if (history.length > this.maxHistory) {
      history.shift(); // Remove oldest
    }
  }
}

module.exports = { MessageBus };
