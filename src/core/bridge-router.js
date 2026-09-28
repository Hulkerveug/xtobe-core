/**
 * Xtobe Bridge Router
 * Channel parsing and routing for multi-platform message ingestion.
 * 
 * Supported channels:
 * - WHA: WhatsApp
 * - IG: Instagram Direct
 * - TT: TikTok DMs
 * - DT: Dating Apps (Tinder, Bumble, etc.)
 * - FB: Facebook Messenger
 */

import { v4 as uuidv4 } from 'uuid';

// Channel configuration with routing rules
const CHANNELS = {
  WHA: {
    name: 'WhatsApp',
    priority: 1,
    color: '#25D366',
    icon: '💬',
    bridgePattern: 'xtobe.network/j/WHA-7MLW-TOBE',
  },
  IG: {
    name: 'Instagram Direct',
    priority: 2,
    color: '#E4405F',
    icon: '📷',
    bridgePattern: 'xtobe.network/j/IG-7MLW-TOBE',
  },
  TT: {
    name: 'TikTok DMs',
    priority: 3,
    color: '#000000',
    icon: '🎵',
    bridgePattern: 'xtobe.network/j/TT-7MLW-TOBE',
  },
  DT: {
    name: 'Dating Apps',
    priority: 4,
    color: '#FF6B6B',
    icon: '💕',
    bridgePattern: 'xtobe.network/j/DT-7MLW-TOBE',
  },
  FB: {
    name: 'Facebook Messenger',
    priority: 5,
    color: '#0084FF',
    icon: '👤',
    bridgePattern: 'xtobe.network/j/FB-7MLW-TOBE',
  },
};

/**
 * Parse incoming message and determine source channel.
 * @param {Object} message - Raw message from any platform
 * @returns {Object} Parsed route with channel info
 */
export function parseRoute(message) {
  const channel = detectChannel(message);
  const route = {
    id: uuidv4(),
    channel,
    channelInfo: CHANNELS[channel] || { name: 'Unknown', priority: 99 },
    timestamp: Date.now(),
    sender: extractSender(message),
    content: extractContent(message),
    priority: calculatePriority(channel, message),
    metadata: extractMetadata(message),
  };

  return route;
}

/**
 * Detect which channel/platform a message came from.
 */
function detectChannel(message) {
  if (message.channel) return message.channel.toUpperCase();
  if (message.platform) return message.platform.toUpperCase();
  
  // Heuristic detection
  if (message.from && message.from.includes('@c.us')) return 'WHA';
  if (message.igUserId || message.instagramId) return 'IG';
  if (message.ttUserId || message.tiktokId) return 'TT';
  if (message.dtUserId || message.datingId) return 'DT';
  if (message.fbUserId || message.messengerId) return 'FB';
  
  return 'UNKNOWN';
}

/**
 * Extract sender info from message.
 */
function extractSender(message) {
  return (
    message.sender ||
    message.from ||
    message.username ||
    message.userId ||
    'Unknown'
  );
}

/**
 * Extract message content.
 */
function extractContent(message) {
  return (
    message.content ||
    message.text ||
    message.body ||
    message.message ||
    ''
  );
}

/**
 * Extract additional metadata.
 */
function extractMetadata(message) {
  return {
    platformId: message.platformId || message.id,
    rawTimestamp: message.timestamp || message.created_at,
    attachments: message.attachments || message.media || [],
    location: message.location || null,
  };
}

/**
 * Calculate message priority based on channel and content.
 */
function calculatePriority(channel, message) {
  const channelPriority = CHANNELS[channel]?.priority || 99;
  
  // Boost priority for high-value keywords
  const content = extractContent(message).toLowerCase();
  const highValueKeywords = ['buy', 'invest', 'property', 'deal', 'urgent', 'ready'];
  const hasHighValue = highValueKeywords.some(kw => content.includes(kw));
  
  if (hasHighValue) return Math.max(1, channelPriority - 1);
  return channelPriority;
}

/**
 * Get all supported channels.
 */
export function getChannels() {
  return CHANNELS;
}

/**
 * Get channel by code.
 */
export function getChannel(code) {
  return CHANNELS[code.toUpperCase()] || null;
}

/**
 * Register a new bridge link for a channel.
 */
export function registerBridge(channelCode, customId) {
  const channel = CHANNELS[channelCode.toUpperCase()];
  if (!channel) return null;
  
  return {
    channel: channelCode.toUpperCase(),
    bridgeUrl: `xtobe.network/j/${channelCode.toUpperCase()}-${customId || '7MLW-TOBE'}`,
    createdAt: Date.now(),
    status: 'active',
  };
}
