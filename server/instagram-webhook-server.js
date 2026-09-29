/**
 * Xtobe Instagram Webhook Server
 * 
 * HTTP server that receives webhooks from Meta and forwards
 * messages to the Xtobe Message Bus.
 * 
 * Endpoints:
 * - GET  /webhook/instagram — Meta webhook verification
 * - POST /webhook/instagram — Receive messages from Meta
 * - GET  /health — Health check
 */

const http = require('http');
const { InstagramGraphAPI } = require('./instagram-graph-api');
const { MessageBus } = require('./message-bus');

// ─── Config ────────────────────────────────────────────────────────────
const PORT = process.env.INSTAGRAM_WEBHOOK_PORT || 8082;
const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || 'xtobe_instagram_verify_2026';

// ─── Instagram API Client ───────────────────────────────────────────────
const igClient = new InstagramGraphAPI({
  accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
  accountId: process.env.INSTAGRAM_ACCOUNT_ID,
  webhookVerifyToken: VERIFY_TOKEN,
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,
});

// ─── Message Bus ───────────────────────────────────────────────────────
const messageBus = new MessageBus();
messageBus.registerPlatform(igClient);

// ─── HTTP Server ───────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'xtobe-instagram-webhook',
      platforms: messageBus.getPlatforms(),
      timestamp: Date.now(),
    }));
    return;
  }

  // Webhook verification (GET)
  if (req.url === '/webhook/instagram' && req.method === 'GET') {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const challenge = igClient.verifyWebhook({
      'hub.mode': params.get('hub.mode'),
      'hub.verify_token': params.get('hub.verify_token'),
      'hub.challenge': params.get('hub.challenge'),
    });

    if (challenge) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
      console.log('[Instagram] Webhook verified successfully');
    } else {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      console.log('[Instagram] Webhook verification failed');
    }
    return;
  }

  // Webhook receiver (POST)
  if (req.url === '/webhook/instagram' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);

        // Process through message bus
        const messages = await messageBus.processIncoming('instagram', payload);

        console.log(`[Instagram] Received ${messages.length} messages from Meta`);

        // Acknowledge quickly
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, processed: messages.length }));
      } catch (err) {
        console.error('[Instagram] Webhook processing error:', err.message);
        // Still return 200 to prevent Meta retries
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── Start ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Xtobe Instagram Webhook Server v1.0.0              ║
╠══════════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:${PORT}/webhook/instagram       ║
║  Health:   http://localhost:${PORT}/health                    ║
╠══════════════════════════════════════════════════════════════╣
║  Verify Token: ${VERIFY_TOKEN}          ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = { server, igClient, messageBus };
