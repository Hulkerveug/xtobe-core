// message-bus.js with O(1) dedup and bounded conversation state
/**
 * Xtobe Message Bus
 */

const { EventEmitter } = require('events');

class MessageBus extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.platforms = new Map();
    this.conversations = new Map();
    this.messageHistory = new Map(); // convKey -> array
    this.maxHistory = opts.maxHistory || 50; // messages per conversation
    this.maxConversations = opts.maxConversations || 5000;
    this.conversationTTL = opts.conversationTTL || 24 * 60 * 60 * 1000;
    this.seenIds = new Map();   // convKey -> Set of ids
    this.lastSeen = new Map();  // convKey -> timestamp
  }

  registerPlatform(platform) {
    this.platforms.set(platform.platformName, platform);
    console.log(`[MessageBus] Registered platform: ${platform.platformName}`);
  }

  getPlatform(name) { return this.platforms.get(name) || null; }

  async processIncoming(platformName, rawPayload) {
    const platform = this.platforms.get(platformName);
    if (!platform) throw new Error(`Platform not registered: ${platformName}`);

    const messages = platform.receive(rawPayload);
    const results = [];
    for (const msg of messages) {
      if (msg.type === 'status_update' || !msg.messageId) continue;

      const convKey = platform.getConversationKey(msg);
      if (this._isDuplicate(convKey, msg)) {
        console.log(`[MessageBus] Duplicate message skipped: ${msg.messageId}`);
        continue;
      }

      this._record(convKey, msg);

      this.emit('message', msg);
      this.emit(`message:${msg.platform}`, msg);
      results.push(msg);
    }
    return results;
  }

  async sendText(platformName, to, text) {
    const platform = this.platforms.get(platformName);
    if (!platform) return { success: false, error: `Platform not registered: ${platformName}` };
    const check = platform.canSendTo(to);
    if (!check.permitted) {
      return platform.createError('OUTBOUND_NOT_ALLOWED', check.reason || 'Outbound messaging not permitted', { requiresCustomerInitiation: check.requiresCustomerInitiation || false });
    }
    return await platform.sendText(to, text);
  }

  async sendMedia(platformName, to, media) {
    const platform = this.platforms.get(platformName);
    if (!platform) return { success: false, error: `Platform not registered: ${platformName}` };
    const check = platform.canSendTo(to);
    if (!check.permitted) {
      return platform.createError('OUTBOUND_NOT_ALLOWED', check.reason || 'Outbound messaging not permitted', { requiresCustomerInitiation: check.requiresCustomerInitiation || false });
    }
    return await platform.sendMedia(to, media);
  }

  getHistory(conversationKey, limit = 10) {
    const history = this.messageHistory.get(conversationKey) || [];
    return history.slice(-limit);
  }

  getPlatforms() { return Array.from(this.platforms.keys()); }

  _isDuplicate(convKey, msg) {
    const ids = this.seenIds.get(convKey);
    return ids ? ids.has(msg.messageId) : false;
  }

  _record(convKey, msg) {
    let history = this.messageHistory.get(convKey);
    let ids = this.seenIds.get(convKey);
    if (!history) { history = []; ids = new Set(); this.messageHistory.set(convKey, history); this.seenIds.set(convKey, ids); }
    history.push(msg);
    ids.add(msg.messageId);
    while (history.length > this.maxHistory) { ids.delete(history.shift().messageId); }
    // update LRU timestamp
    if (this.lastSeen.has(convKey)) this.lastSeen.delete(convKey);
    this.lastSeen.set(convKey, Date.now());
    this._evictIfNeeded();
  }

  _drop(key) {
    this.messageHistory.delete(key);
    this.seenIds.delete(key);
    this.lastSeen.delete(key);
  }

  _evictIfNeeded() {
    const now = Date.now();
    // TTL sweep: remove entries older than TTL
    for (const [key, ts] of Array.from(this.lastSeen.entries())) {
      if (now - ts > this.conversationTTL) this._drop(key);
    }
    // hard cap
    while (this.lastSeen.size > this.maxConversations) {
      const oldest = this.lastSeen.keys().next().value;
      if (!oldest) break;
      this._drop(oldest);
    }
  }
}

module.exports = { MessageBus };