/**
 * Xtobe WhatsApp Cloud API Integration
 * 
 * Real integration with Meta's WhatsApp Business Platform.
 * 
 * Features:
 * - Send text messages (template + non-template)
 * - Send media (images, documents, audio)
 * - Receive messages via webhook
 * - Handle 24-hour customer service window
 * - Message status tracking (sent, delivered, read)
 * 
 * API Version: v21.0 (current as of 2026)
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────
const WHATSAPP_API_VERSION = 'v21.0';
const WHATSAPP_API_BASE = 'https://graph.facebook.com';

// ─── WhatsApp Cloud API Client ────────────────────────────────────────
class WhatsAppCloudAPI {
  constructor(config = {}) {
    this.phoneNumberId = config.phoneNumberId;
    this.businessAccountId = config.businessAccountId;
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || WHATSAPP_API_VERSION;
    this.baseUrl = `${WHATSAPP_API_BASE}/${this.apiVersion}`;
    this.webhookVerifyToken = config.webhookVerifyToken || crypto.randomBytes(32).toString('hex');
    
    // Track 24-hour messaging windows per recipient
    this.messagingWindows = new Map();
    
    // Message templates (pre-approved by Meta)
    this.templates = new Map();
  }

  /**
   * Make authenticated API request to WhatsApp.
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
              reject(new Error(`WhatsApp API error ${res.statusCode}: ${json.error?.message || body}`));
            }
          } catch (err) {
            reject(new Error(`Parse error: ${body}`));
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * Send a text message to a WhatsApp number.
   * 
   * @param {string} to - Recipient phone number (E.164 format, e.g. +971501234567)
   * @param {string} text - Message text (max 4096 chars)
   * @param {Object} options - Optional parameters
   * @param {string} options.previewUrl - Include URL preview
   * @returns {Object} Message ID and status
   */
  async sendTextMessage(to, text, options = {}) {
    if (!this.phoneNumberId) throw new Error('phoneNumberId not configured');
    if (!this.accessToken) throw new Error('accessToken not configured');

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._formatPhoneNumber(to),
      type: 'text',
      text: {
        body: text,
        preview_url: options.previewUrl || false,
      },
    };

    const response = await this._request('POST', `/${this.phoneNumberId}/messages`, payload);
    
    // Track messaging window
    this._openMessagingWindow(to);
    
    return {
      success: true,
      messageId: response.messages?.[0]?.id,
      to: payload.to,
      timestamp: Date.now(),
    };
  }

  /**
   * Send a template message (required outside 24-hour window).
   * 
   * @param {string} to - Recipient phone number
   * @param {string} templateName - Pre-approved template name
   * @param {string} languageCode - Language code (e.g. 'en', 'ar')
   * @param {Array} components - Template components
   */
  async sendTemplateMessage(to, templateName, languageCode = 'en', components = []) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._formatPhoneNumber(to),
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: components,
      },
    };

    const response = await this._request('POST', `/${this.phoneNumberId}/messages`, payload);
    
    return {
      success: true,
      messageId: response.messages?.[0]?.id,
      to: payload.to,
      template: templateName,
      timestamp: Date.now(),
    };
  }

  /**
   * Send an image message.
   * 
   * @param {string} to - Recipient phone number
   * @param {string} imageUrl - Publicly accessible image URL
   * @param {string} caption - Optional caption
   */
  async sendImageMessage(to, imageUrl, caption = '') {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._formatPhoneNumber(to),
      type: 'image',
      image: {
        link: imageUrl,
        caption: caption,
      },
    };

    const response = await this._request('POST', `/${this.phoneNumberId}/messages`, payload);
    
    this._openMessagingWindow(to);
    
    return {
      success: true,
      messageId: response.messages?.[0]?.id,
      to: payload.to,
      timestamp: Date.now(),
    };
  }

  /**
   * Send a document message.
   * 
   * @param {string} to - Recipient phone number
   * @param {string} documentUrl - Publicly accessible document URL
   * @param {string} filename - Display filename
   * @param {string} caption - Optional caption
   */
  async sendDocumentMessage(to, documentUrl, filename, caption = '') {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._formatPhoneNumber(to),
      type: 'document',
      document: {
        link: documentUrl,
        filename: filename,
        caption: caption,
      },
    };

    const response = await this._request('POST', `/${this.phoneNumberId}/messages`, payload);
    
    this._openMessagingWindow(to);
    
    return {
      success: true,
      messageId: response.messages?.[0]?.id,
      to: payload.to,
      timestamp: Date.now(),
    };
  }

  /**
   * Send a location message.
   * 
   * @param {string} to - Recipient phone number
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @param {string} name - Location name
   * @param {string} address - Location address
   */
  async sendLocationMessage(to, latitude, longitude, name = '', address = '') {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._formatPhoneNumber(to),
      type: 'location',
      location: {
        latitude,
        longitude,
        name,
        address,
      },
    };

    const response = await this._request('POST', `/${this.phoneNumberId}/messages`, payload);
    
    this._openMessagingWindow(to);
    
    return {
      success: true,
      messageId: response.messages?.[0]?.id,
      to: payload.to,
      timestamp: Date.now(),
    };
  }

  /**
   * Upload media to WhatsApp servers.
   * 
   * @param {string} filePath - Path to media file
   * @param {string} mimeType - MIME type (image/jpeg, image/png, etc.)
   * @returns {Object} Media ID
   */
  async uploadMedia(filePath, mimeType) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = `----XtobeBoundary${crypto.randomBytes(8).toString('hex')}`;
    
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n--${boundary}--\r\n`),
    ]);

    return new Promise((resolve, reject) => {
      const urlObj = new URL(`${this.baseUrl}/${this.phoneNumberId}/media`);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(responseBody);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ mediaId: json.id, success: true });
            } else {
              reject(new Error(`Media upload failed: ${json.error?.message || responseBody}`));
            }
          } catch (err) {
            reject(new Error(`Parse error: ${responseBody}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Get message status (sent, delivered, read).
   * 
   * @param {string} messageId - Message ID from send response
   */
  async getMessageStatus(messageId) {
    // Note: WhatsApp doesn't have a direct "get message status" API
    // Status is received via webhooks. This is a placeholder.
    return {
      messageId,
      status: 'unknown',
      note: 'Status is received via webhooks, not polling',
    };
  }

  /**
   * Verify webhook (for Meta webhook setup).
   * 
   * @param {Object} query - Query parameters from GET request
   * @returns {string} Challenge string if verification succeeds
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
   * 
   * @param {Object} body - Webhook payload
   * @returns {Array} Array of incoming messages
   */
  processWebhook(body) {
    const messages = [];
    
    if (body.object !== 'whatsapp_business_account') {
      return messages;
    }

    const entries = body.entry || [];
    
    for (const entry of entries) {
      const changes = entry.changes || [];
      
      for (const change of changes) {
        const value = change.value;
        
        // Incoming messages
        if (value.messages) {
          for (const msg of value.messages) {
            const message = {
              id: msg.id,
              from: msg.from,
              timestamp: parseInt(msg.timestamp) * 1000,
              type: msg.type,
              text: msg.text?.body || '',
              image: msg.image ? { id: msg.image.id, caption: msg.image.caption } : null,
              document: msg.document ? { id: msg.document.id, filename: msg.document.filename } : null,
              audio: msg.audio ? { id: msg.audio.id } : null,
              video: msg.video ? { id: msg.video.id } : null,
              location: msg.location ? { latitude: msg.location.latitude, longitude: msg.location.longitude } : null,
              contacts: msg.contacts || [],
              context: msg.context || null,
              errors: msg.errors || [],
            };
            
            // Open messaging window for this sender
            this._openMessagingWindow(msg.from);
            
            messages.push(message);
          }
        }

        // Message status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            messages.push({
              type: 'status_update',
              id: status.id,
              status: status.status, // sent, delivered, read, failed
              timestamp: parseInt(status.timestamp) * 1000,
              recipientId: status.recipient_id,
              errors: status.errors || [],
            });
          }
        }
      }
    }

    return messages;
  }

  /**
   * Check if we can send a free-form message to this number.
   * (Within 24-hour customer service window)
   * 
   * @param {string} phoneNumber - Phone number to check
   * @returns {boolean} true if we can send non-template messages
   */
  canSendFreeMessage(phoneNumber) {
    const window = this.messagingWindows.get(this._formatPhoneNumber(phoneNumber));
    if (!window) return false;
    return (Date.now() - window) < 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get the messaging window expiry for a number.
   */
  getMessagingWindowExpiry(phoneNumber) {
    const window = this.messagingWindows.get(this._formatPhoneNumber(phoneNumber));
    if (!window) return null;
    return new Date(window + 24 * 60 * 60 * 1000);
  }

  /**
   * Format phone number to E.164.
   */
  _formatPhoneNumber(number) {
    let cleaned = number.replace(/\D/g, '');
    if (cleaned.startsWith('00')) {
      cleaned = cleaned.slice(2);
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  /**
   * Open/refresh 24-hour messaging window.
   */
  _openMessagingWindow(phoneNumber) {
    this.messagingWindows.set(this._formatPhoneNumber(phoneNumber), Date.now());
  }

  /**
   * Register a message template.
   */
  registerTemplate(name, category, language, components) {
    this.templates.set(name, {
      name,
      category, // AUTHENTICATION, MARKETING, UTILITY
      language,
      components,
      status: 'PENDING',
    });
  }

  /**
   * Create a template via API.
   */
  async createTemplate(name, category, language, components) {
    const payload = {
      name,
      category,
      language,
      components,
    };

    const response = await this._request('POST', `/${this.businessAccountId}/message_templates`, payload);
    
    this.templates.set(name, {
      name,
      category,
      language,
      components,
      id: response.id,
      status: 'PENDING',
    });

    return {
      success: true,
      templateId: response.id,
      name,
      status: 'PENDING',
    };
  }

  /**
   * Get all templates.
   */
  async getTemplates() {
    const response = await this._request('GET', `/${this.businessAccountId}/message_templates`);
    return response.data || [];
  }

  /**
   * Delete a template.
   */
  async deleteTemplate(name) {
    const response = await this._request('DELETE', `/${this.businessAccountId}/message_templates`, { name });
    this.templates.delete(name);
    return { success: true, name };
  }
}

module.exports = { WhatsAppCloudAPI };
