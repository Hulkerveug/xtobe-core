/* (full file content for server/whatsapp-cloud-api.js with streaming upload) */
/**
 * Xtobe WhatsApp Cloud API Integration
 *
 * Real integration with Meta's WhatsApp Business Platform.
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────
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

  // ... existing send methods omitted for brevity (unchanged) ...

  /**
   * Upload media to WhatsApp servers.
   *
   * @param {string} filePath - Path to media file
   * @param {string} mimeType - MIME type (image/jpeg, image/png, etc.)
   * @returns {Object} Media ID
   */
  async uploadMedia(filePath, mimeType) {
    const boundary = '----XtobeBoundary' + Date.now().toString(16);
    const filename = path.basename(filePath);

    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    );
    const tail = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n` +
      `--${boundary}--\r\n`
    );

    // async stat -> exact Content-Length without buffering the file
    const { size } = await fs.promises.stat(filePath);
    const contentLength = head.length + size + tail.length;

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
          'Content-Length': contentLength
        },
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        let bytes = 0;
        const MAX_RES = 1 << 20; // 1 MB cap on API response
        res.setEncoding('utf8');
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > MAX_RES) {
            req.destroy();
            return reject(new Error('Media upload response too large'));
          }
          responseBody += chunk;
        });
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

      // write head, stream file, then write tail
      req.write(head);

      const fileStream = fs.createReadStream(filePath);
      fileStream.on('error', (err) => { req.destroy(err); reject(err); });
      fileStream.on('end', () => {
        req.end(tail);
      });
      fileStream.pipe(req, { end: false });
    });
  }

  // ... remaining class methods unchanged ...
}

module.exports = { WhatsAppCloudAPI };