// instagram-graph-api.js tweaks: messagingWindows TTL + processedMessages pruning
/**
 * Xtobe Instagram Graph API Integration
 */

const https = require('https');
const crypto = require('crypto');
const { MessagingPlatform } = require('./messaging-platform');

const INSTAGRAM_API_VERSION = 'v21.0';
const INSTAGRAM_API_BASE = 'https://graph.facebook.com';

class InstagramGraphAPI extends MessagingPlatform {
  constructor(config = {}) {
    super(config);
    this.platformName = 'instagram';
    this.accessToken = config.accessToken;
    this.accountId = config.accountId;
    this.apiVersion = config.apiVersion || INSTAGRAM_API_VERSION;
    this.baseUrl = `${INSTAGRAM_API_BASE}/${this.apiVersion}`;
    this.webhookVerifyToken = config.webhookVerifyToken || crypto.randomBytes(32).toString('hex');
    this.appId = config.appId;
    this.appSecret = config.appSecret;

    // Track 24-hour messaging windows per conversation
    this.messagingWindows = new Map(); // key -> timestamp

    // Track processed message IDs for deduplication with timestamp
    this.processedMessages = new Map(); // id -> timestamp
    this._startCleanup();
  }

  _startCleanup() {
    // prune processedMessages periodically to avoid unbounded growth
    setInterval(() => {
      const now = Date.now();
      const TTL = 24 * 60 * 60 * 1000;
      for (const [id, ts] of Array.from(this.processedMessages.entries())) {
        if (now - ts > TTL) this.processedMessages.delete(id);
      }
      // also prune messagingWindows older than 24h
      for (const [k, ts] of Array.from(this.messagingWindows.entries())) {
        if (now - ts > TTL) this.messagingWindows.delete(k);
      }
    }, 60 * 60 * 1000); // hourly
  }

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
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
            else {
              const error = json.error || {};
              reject(new Error(`Instagram API error ${res.statusCode}: ${error.message || body} (code: ${error.code || 'unknown'})`));
            }
          } catch (err) { reject(new Error(`Parse error: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  receive(body) {
    const messages = [];
    if (body.object !== 'instagram') return messages;
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      const messaging = entry.messaging || [];
      for (const change of changes) {
        const value = change.value;
        if (value.messages) {
          for (const msg of value.messages) {
            const normalized = this.normalizeMessage(msg, entry.id);
            if (normalized) {
              // dedupe using processedMessages map
              if (this.processedMessages.has(normalized.messageId)) continue;
              this.processedMessages.set(normalized.messageId, Date.now());
              messages.push(normalized);
            }
          }
        }
        if (value.statuses) {
          for (const status of value.statuses) {
            messages.push({ type: 'status_update', platform: this.platformName, accountId: this.accountId, messageId: status.id, status: status.status, timestamp: parseInt(status.timestamp) * 1000, recipientId: status.recipient_id, });
          }
        }
      }
      for (const msg of messaging) {
        if (msg.message) {
          const normalized = this.normalizeMessage(msg.message, entry.id, msg.sender);
          if (normalized) {
            if (this.processedMessages.has(normalized.messageId)) continue;
            this.processedMessages.set(normalized.messageId, Date.now());
            messages.push(normalized);
          }
        }
      }
    }
    return messages;
  }

  normalizeMessage(rawMessage, entryId, sender = null) {
    if (!rawMessage || !rawMessage.mid) return null;
    const messageId = rawMessage.mid;
    const senderId = sender?.id || rawMessage.from?.id || 'unknown';
    const timestamp = rawMessage.timestamp ? (typeof rawMessage.timestamp === 'number' ? rawMessage.timestamp : parseInt(rawMessage.timestamp)) : Date.now();
    const text = rawMessage.text || rawMessage.message || '';
    let media = null;
    if (rawMessage.attachments) {
      const attachment = rawMessage.attachments[0];
      if (attachment) media = { type: attachment.type || 'unknown', url: attachment.payload?.url || attachment.url || null, id: attachment.id || null };
    }
    let reactions = null;
    if (rawMessage.reaction) reactions = { emoji: rawMessage.reaction.emoji, action: rawMessage.reaction.action };
    let context = null;
    if (rawMessage.reply_to) context = { replyToId: rawMessage.reply_to.mid, replyToText: rawMessage.reply_to.text || null };
    this._openMessagingWindow(entryId, senderId);
    return { platform: this.platformName, accountId: this.accountId, conversationId: entryId, messageId, senderId, senderName: sender?.name || null, timestamp, type: rawMessage.type || (text ? 'text' : media ? 'media' : 'unknown'), text, media, context, reactions, raw: rawMessage };
  }

  _openMessagingWindow(accountId, userId) {
    const key = `${accountId}:${userId}`;
    this.messagingWindows.set(key, Date.now());
  }

  canSendTo(userId) {
    const windowKey = `${this.accountId}:${userId}`;
    const window = this.messagingWindows.get(windowKey);
    if (!window) return { permitted: false, reason: 'No active messaging window. Customer must message first.', requiresCustomerInitiation: true };
    const elapsed = Date.now() - window;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (elapsed > twentyFourHours) return { permitted: false, reason: '24-hour messaging window expired. Customer must message again.', requiresCustomerInitiation: true };
    return { permitted: true };
  }

  // remaining methods unchanged (sendText, sendMedia, getConversations...)
}

module.exports = { InstagramGraphAPI };