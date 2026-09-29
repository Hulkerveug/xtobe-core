/**
 * Xtobe Instagram Graph API Integration
 * 
 * Real integration with Meta's Instagram Graph API.
 * 
 * Features:
 * - Webhook verification
 * - Incoming DM processing (text, media, reactions)
 * - Outbound replies (customer-initiated only)
 * - 24-hour messaging window enforcement
 * - Message status tracking
 * - Proper Meta Graph API error handling
 * 
 * API Version: v21.0 (current as of 2026)
 * Docs: https://developers.facebook.com/docs/instagram-api
 * 
 * IMPORTANT: Instagram only allows outbound replies within 24h of customer message.
 * Cold DMs are NOT permitted. This integration enforces that rule.
 */

const https = require('https');
const crypto = require('crypto');
const { MessagingPlatform } = require('./messaging-platform');

// ─── Config ────────────────────────────────────────────────────────────
const INSTAGRAM_API_VERSION = 'v21.0';
const INSTAGRAM_API_BASE = 'https://graph.facebook.com';

// ─── Instagram Graph API Client ────────────────────────────────────────
class InstagramGraphAPI extends MessagingPlatform {
  constructor(config = {}) {
    super(config);
    this.platformName = 'instagram';
    this.accessToken = config.accessToken;
    this.accountId = config.accountId; // Instagram Business/Creator account ID
    this.apiVersion = config.apiVersion || INSTAGRAM_API_VERSION;
    this.baseUrl = `${INSTAGRAM_API_BASE}/${this.apiVersion}`;
    this.webhookVerifyToken = config.webhookVerifyToken || crypto.randomBytes(32).toString('hex');
    this.appId = config.appId;
    this.appSecret = config.appSecret;

    // Track 24-hour messaging windows per conversation
    this.messagingWindows = new Map();

    // Track processed message IDs for deduplication
    this.processedMessages = new Set();
  }

  /**
   * Make authenticated API request to Instagram Graph API.
   */
  async _request(method, endpoint, data = null, headers = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              const error = json.error || {};
              reject(new Error(
                `Instagram API error ${res.statusCode}: ${error.message || body}` +
                ` (code: ${error.code || 'unknown'}, subcode: ${error.error_subcode || 'unknown'})`
              ));
            }
          } catch (err) {
            reject(new Error(`Parse error: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * Verify webhook subscription request from Meta.
   * @param {Object} query - Query parameters
   * @returns {string|null} Challenge string or null
   */
  verifyWebhook(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === this.webhookVerifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Process incoming webhook from Meta.
   * @param {Object} body - Webhook payload
   * @returns {Array} Normalized messages
   */
  receive(body) {
    const messages = [];

    if (body.object !== 'instagram') {
      return messages;
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      const messaging = entry.messaging || [];

      // Handle changes format (for Instagram webhooks)
      for (const change of changes) {
        const value = change.value;

        // Incoming messages
        if (value.messages) {
          for (const msg of value.messages) {
            const normalized = this.normalizeMessage(msg, entry.id);
            if (normalized) {
              messages.push(normalized);
            }
          }
        }

        // Message status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            messages.push({
              type: 'status_update',
              platform: this.platformName,
              accountId: this.accountId,
              messageId: status.id,
              status: status.status,
              timestamp: parseInt(status.timestamp) * 1000,
              recipientId: status.recipient_id,
            });
          }
        }
      }

      // Handle messaging format (alternative webhook structure)
      for (const msg of messaging) {
        if (msg.message) {
          const normalized = this.normalizeMessage(msg.message, entry.id, msg.sender);
          if (normalized) {
            messages.push(normalized);
          }
        }
      }
    }

    return messages;
  }

  /**
   * Normalize a raw Instagram message to unified schema.
   * @param {Object} rawMessage - Raw message from Instagram
   * @param {string} entryId - Entry ID from webhook
   * @param {Object} sender - Sender info (optional)
   * @returns {Object|null} Normalized message or null
   */
  normalizeMessage(rawMessage, entryId, sender = null) {
    if (!rawMessage || !rawMessage.mid) {
      return null;
    }

    const messageId = rawMessage.mid;
    const senderId = sender?.id || rawMessage.from?.id || 'unknown';
    const timestamp = rawMessage.timestamp
      ? (typeof rawMessage.timestamp === 'number' ? rawMessage.timestamp : parseInt(rawMessage.timestamp))
      : Date.now();

    // Extract text
    const text = rawMessage.text || rawMessage.message || '';

    // Extract media
    let media = null;
    if (rawMessage.attachments) {
      const attachment = rawMessage.attachments[0];
      if (attachment) {
        media = {
          type: attachment.type || 'unknown',
          url: attachment.payload?.url || attachment.url || null,
          id: attachment.id || null,
        };
      }
    }

    // Extract reactions
    let reactions = null;
    if (rawMessage.reaction) {
      reactions = {
        emoji: rawMessage.reaction.emoji,
        action: rawMessage.reaction.action,
      };
    }

    // Extract reply context
    let context = null;
    if (rawMessage.reply_to) {
      context = {
        replyToId: rawMessage.reply_to.mid,
        replyToText: rawMessage.reply_to.text || null,
      };
    }

    // Open messaging window for this conversation
    this._openMessagingWindow(entryId, senderId);

    return {
      platform: this.platformName,
      accountId: this.accountId,
      conversationId: entryId,
      messageId,
      senderId,
      senderName: sender?.name || null,
      timestamp,
      type: rawMessage.type || (text ? 'text' : media ? 'media' : 'unknown'),
      text,
      media,
      context,
      reactions,
      raw: rawMessage,
    };
  }

  /**
   * Send a text message to an Instagram user.
   * IMPORTANT: Only permitted within 24h of customer message.
   * 
   * @param {string} to - Recipient Instagram user ID (not username)
   * @param {string} text - Message text (max 1000 chars)
   * @returns {Object} Send result
   */
  async sendText(to, text) {
    if (!this.accountId) throw new Error('accountId not configured');
    if (!this.accessToken) throw new Error('accessToken not configured');

    // Check messaging window
    if (!this.canSendTo(to).permitted) {
      return this.createError(
        'OUTBOUND_NOT_ALLOWED',
        'Instagram only allows replies within 24 hours of customer message. Customer must message first.',
        { requiresCustomerInitiation: true }
      );
    }

    const payload = {
      recipient: { id: to },
      message: { text: text.substring(0, 1000) },
    };

    const response = await this._request('POST', `/${this.accountId}/messages`, payload);

    return {
      success: true,
      messageId: response.message_id,
      to,
      platform: this.platformName,
      timestamp: Date.now(),
    };
  }

  /**
   * Send a media message to an Instagram user.
   * @param {string} to - Recipient Instagram user ID
   * @param {Object} media - Media object { type, url, caption }
   * @returns {Object} Send result
   */
  async sendMedia(to, media) {
    if (!this.accountId) throw new Error('accountId not configured');
    if (!this.accessToken) throw new Error('accessToken not configured');

    // Check messaging window
    if (!this.canSendTo(to).permitted) {
      return this.createError(
        'OUTBOUND_NOT_ALLOWED',
        'Instagram only allows replies within 24 hours of customer message.',
        { requiresCustomerInitiation: true }
      );
    }

    const payload = {
      recipient: { id: to },
      message: {
        attachment: {
          type: media.type || 'image',
          payload: { url: media.url },
        },
      },
    };

    if (media.caption) {
      payload.message.text = media.caption;
    }

    const response = await this._request('POST', `/${this.accountId}/messages`, payload);

    return {
      success: true,
      messageId: response.message_id,
      to,
      platform: this.accountId,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if we can send a message to this user.
   * @param {string} userId - Instagram user ID
   * @returns {Object} { permitted: boolean, reason?: string }
   */
  canSendTo(userId) {
    const windowKey = `${this.accountId}:${userId}`;
    const window = this.messagingWindows.get(windowKey);

    if (!window) {
      return {
        permitted: false,
        reason: 'No active messaging window. Customer must message first.',
        requiresCustomerInitiation: true,
      };
    }

    const elapsed = Date.now() - window;
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (elapsed > twentyFourHours) {
      return {
        permitted: false,
        reason: '24-hour messaging window expired. Customer must message again.',
        requiresCustomerInitiation: true,
      };
    }

    return { permitted: true };
  }

  /**
   * Get conversations for this account.
   * @returns {Array} Conversations
   */
  async getConversations() {
    const response = await this._request('GET', `/${this.accountId}/conversations`);
    return response.data || [];
  }

  /**
   * Get messages in a conversation.
   * @param {string} conversationId - Conversation ID
   * @returns {Array} Messages
   */
  async getConversationMessages(conversationId) {
    const response = await this._request('GET', `/${conversationId}/messages`);
    return response.data || [];
  }

  /**
   * Get account info.
   * @returns {Object} Account info
   */
  async getAccountInfo() {
    return await this._request('GET', `/${this.accountId}`, {
      fields: 'id,name,username,profile_picture',
    });
  }

  /**
   * Open/refresh 24-hour messaging window.
   * @param {string} accountId - Account ID
   * @param {string} userId - User ID
   */
  _openMessagingWindow(accountId, userId) {
    const key = `${accountId}:${userId}`;
    this.messagingWindows.set(key, Date.now());
  }

  /**
   * Get messaging window expiry for a user.
   * @param {string} userId - User ID
   * @returns {Date|null}
   */
  getMessagingWindowExpiry(userId) {
    const key = `${this.accountId}:${userId}`;
    const window = this.messagingWindows.get(key);
    if (!window) return null;
    return new Date(window + 24 * 60 * 60 * 1000);
  }
}

module.exports = { InstagramGraphAPI };
