/**
 * Xtobe WhatsApp Webhook Server
 * 
 * HTTP server that receives webhooks from Meta and forwards
 * messages to the Xtobe relay via WebSocket.
 * 
 * Endpoints:
 * - GET  /webhook — Meta webhook verification
 * - POST /webhook — Receive messages from Meta
 * - GET  /health — Health check
 */

const http = require('http');
const { WhatsAppCloudAPI } = require('./whatsapp-cloud-api');

// ─── Config ────────────────────────────────────────────────────────────
const PORT = process.env.WHATSAPP_WEBHOOK_PORT || 8081;
const RELAY_WS_URL = process.env.RELAY_WS_URL || 'ws://localhost:8080';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'xtobe_verify_token_2026';

// ─── WhatsApp API Client ───────────────────────────────────────────────
const waClient = new WhatsAppCloudAPI({
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  webhookVerifyToken: VERIFY_TOKEN,
});

// ─── WebSocket to Relay ────────────────────────────────────────────────
let relayWs = null;
let relayConnected = false;

function connectToRelay() {
  const WebSocket = require('ws');
  relayWs = new WebSocket(RELAY_WS_URL);

  relayWs.on('open', () => {
    console.log('[WhatsApp] Connected to Xtobe relay');
    relayConnected = true;
  });

  relayWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'key_exchange') {
        // Send auth with our public key
        relayWs.send(JSON.stringify({
          type: 'auth',
          nodeId: 'whatsapp-webhook',
          publicKey: 'whatsapp-webhook-key',
          nodeType: 'webhook',
        }));
      }
    } catch (err) {
      console.error('[WhatsApp] Relay message error:', err.message);
    }
  });

  relayWs.on('close', () => {
    console.log('[WhatsApp] Disconnected from relay, reconnecting...');
    relayConnected = false;
    setTimeout(connectToRelay, 5000);
  });

  relayWs.on('error', (err) => {
    console.error('[WhatsApp] Relay error:', err.message);
  });
}

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
      service: 'xtobe-whatsapp-webhook',
      relayConnected,
      timestamp: Date.now(),
    }));
    return;
  }

  // Webhook verification (GET)
  if (req.url === '/webhook' && req.method === 'GET') {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const challenge = waClient.verifyWebhook({
      'hub.mode': params.get('hub.mode'),
      'hub.verify_token': params.get('hub.verify_token'),
      'hub.challenge': params.get('hub.challenge'),
    });

    if (challenge) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
      console.log('[WhatsApp] Webhook verified successfully');
    } else {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      console.log('[WhatsApp] Webhook verification failed');
    }
    return;
  }

  // Webhook receiver (POST)
  if (req.url === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const messages = waClient.processWebhook(payload);

        console.log(`[WhatsApp] Received ${messages.length} messages from Meta`);

        // Forward to relay
        for (const msg of messages) {
          if (msg.type === 'status_update') {
            console.log(`[WhatsApp] Status update: ${msg.id} → ${msg.status}`);
            continue;
          }

          console.log(`[WhatsApp] Message from ${msg.from}: ${msg.text?.substring(0, 50)}`);

          // Send to relay if connected
          if (relayConnected && relayWs.readyState === 1) {
            relayWs.send(JSON.stringify({
              type: 'message',
              payload: {
                cipher: Buffer.from(JSON.stringify({
                  channel: 'WHA',
                  sender: msg.from,
                  content: msg.text || `[${msg.type}]`,
                  priority: 1,
                  timestamp: msg.timestamp,
                  metadata: {
                    whatsappId: msg.id,
                    type: msg.type,
                    image: msg.image,
                    document: msg.document,
                    location: msg.location,
                  },
                })).toString('base64'),
                iv: Buffer.from('whatsapp-webhook-iv').toString('base64'),
                authTag: Buffer.from('whatsapp-webhook-tag').toString('base64'),
              },
            }));
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, processed: messages.length }));
      } catch (err) {
        console.error('[WhatsApp] Webhook processing error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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
║           Xtobe WhatsApp Webhook Server v1.0.0               ║
╠══════════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:${PORT}/webhook                  ║
║  Health:   http://localhost:${PORT}/health                    ║
║  Relay:    ${RELAY_WS_URL}              ║
╠══════════════════════════════════════════════════════════════╣
║  Verify Token: ${VERIFY_TOKEN}          ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Connect to relay
  connectToRelay();
});

module.exports = { server, waClient };
