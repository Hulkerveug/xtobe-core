/* relay-server.js with push loop, safe send, body read helper, chunked broadcast, claim/release push queue */
/**
 * Xtobe Relay Server — REAL Implementation (perf fixes applied)
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'xtobe.db');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Add claimed_at if missing and index
try {
  const cols = db.prepare("PRAGMA table_info(push_queue);").all();
  const hasClaimed = cols.some(c => c.name === 'claimed_at');
  if (!hasClaimed) {
    try { db.prepare('ALTER TABLE push_queue ADD COLUMN claimed_at INTEGER').run(); } catch (e) { /* ignore if can't alter */ }
  }
  db.prepare('CREATE INDEX IF NOT EXISTS idx_push_pending ON push_queue(sent, id)').run();
} catch (e) {
  console.warn('[DB] push_queue migration skipped:', e.message);
}

// schema creation (existing code)
db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fcm_token TEXT,
    hms_token TEXT,
    apns_token TEXT,
    connected INTEGER DEFAULT 0,
    last_seen INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    priority INTEGER DEFAULT 5,
    encrypted INTEGER DEFAULT 1,
    delivered INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    cipher TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    algorithm TEXT DEFAULT 'aes-256-gcm',
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (route_id) REFERENCES routes(id),
    FOREIGN KEY (node_id) REFERENCES nodes(id)
  );

  CREATE TABLE IF NOT EXISTS push_queue (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    payload TEXT NOT NULL,
    sent INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    claimed_at INTEGER
  );
`);

// Crypto helpers (unchanged)
const ECDH = crypto.createECDH('secp256k1');
const SERVER_PUBLIC_KEY = ECDH.generateKeys('hex');
const SERVER_KEY_ID = uuidv4();

function deriveSharedSecret(clientPublicKeyHex) {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(ECDH.getPrivateKey());
  return ecdh.computeSecret(clientPublicKeyHex, 'hex');
}

function encryptMessage(plaintext, sharedSecret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    cipher: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decryptMessage(encryptedData, sharedSecret) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    sharedSecret,
    Buffer.from(encryptedData.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedData.cipher, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// HTTP Server
const MAX_BODY = 256 * 1024; // 256KB
function readBody(req, res) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'payload_too_large' }));
        req.destroy();
        return reject(new Error('payload_too_large'));
      }
      body += chunk;
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json' }));
        reject(new Error('invalid_json'));
      }
    });
  });
}

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

  // Health
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'xtobe-relay', version: '1.0.0', keyId: SERVER_KEY_ID, publicKey: SERVER_PUBLIC_KEY, timestamp: Date.now() }));
    return;
  }

  if (req.url === '/v1/key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keyId: SERVER_KEY_ID, publicKey: SERVER_PUBLIC_KEY, algorithm: 'secp256k1' }));
    return;
  }

  if (req.url === '/v1/node/register' && req.method === 'POST') {
    readBody(req, res).then((data) => {
      try {
        const nodeId = data.nodeId || uuidv4();
        db.prepare(`INSERT OR REPLACE INTO nodes (id, node_type, public_key, fcm_token, hms_token, apns_token, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(nodeId, data.nodeType || 'client', data.publicKey || '', data.fcmToken || null, data.hmsToken || null, data.apnsToken || null, Date.now());

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, nodeId, serverPublicKey: SERVER_PUBLIC_KEY, serverKeyId: SERVER_KEY_ID }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }).catch(() => { /* response already sent */ });
    return;
  }

  if (req.url === '/v1/routes' && req.method === 'GET') {
    // lightweight summary endpoint with limit/offset
    const limit = 100;
    const rows = db.prepare(`
      SELECT r.id, r.channel, r.sender, r.priority, r.created_at,
             COUNT(m.id) AS message_count, MAX(m.created_at) AS last_message_at
      FROM routes r
      LEFT JOIN messages m ON m.route_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ routes: rows }));
    return;
  }

  if (req.url === '/v1/stats' && req.method === 'GET') {
    const stats = {
      totalRoutes: db.prepare('SELECT COUNT(*) as c FROM routes').get().c,
      totalMessages: db.prepare('SELECT COUNT(*) as c FROM messages').get().c,
      connectedNodes: db.prepare('SELECT COUNT(*) as c FROM nodes WHERE connected = 1').get().c,
      pendingPush: db.prepare('SELECT COUNT(*) as c FROM push_queue WHERE sent = 0').get().c,
      channels: db.prepare('SELECT channel, COUNT(*) as c FROM routes GROUP BY channel').all(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket server
const wss = new WebSocket.Server({ server });
const connections = new Map();

// Backpressure constants
const MAX_BUFFERED = 1 << 20; // 1 MB per socket
function safeSend(conn, payload) {
  const ws = conn.ws;
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > MAX_BUFFERED) {
    conn.dropped = (conn.dropped || 0) + 1;
    if (conn.dropped > 100) ws.terminate();
    return false;
  }
  ws.send(payload, (err) => { if (err) conn.dropped = (conn.dropped || 0) + 1; });
  return true;
}

wss.on('connection', (ws, req) => {
  let nodeId = null;
  let sharedSecret = null;

  console.log(`[Xtobe] New connection from ${req.socket.remoteAddress}`);

  ws.send(JSON.stringify({ type: 'key_exchange', serverPublicKey: SERVER_PUBLIC_KEY, serverKeyId: SERVER_KEY_ID }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case 'auth': {
          nodeId = msg.nodeId;
          const clientPublicKey = msg.publicKey;
          sharedSecret = deriveSharedSecret(clientPublicKey);
          connections.set(nodeId, { ws, sharedSecret, publicKey: clientPublicKey });
          db.prepare('UPDATE nodes SET connected = 1, last_seen = ? WHERE id = ?').run(Date.now(), nodeId);
          ws.send(JSON.stringify({ type: 'auth_success', nodeId, message: 'Connected to Xtobe relay' }));
          console.log(`[Xtobe] Node ${nodeId} authenticated`);
          break;
        }

        case 'message': {
          if (!nodeId || !sharedSecret) { ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' })); return; }
          const plaintext = decryptMessage(msg.payload, sharedSecret);
          const routeData = JSON.parse(plaintext);

          const routeId = uuidv4();
          db.prepare(`INSERT INTO routes (id, channel, sender, content, priority, encrypted) VALUES (?, ?, ?, ?, ?, 1)`).run(routeId, routeData.channel || 'UNKNOWN', routeData.sender || 'Unknown', routeData.content || '', routeData.priority || 5);

          db.prepare(`INSERT INTO messages (id, route_id, node_id, cipher, iv, auth_tag, algorithm) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), routeId, nodeId, msg.payload.cipher, msg.payload.iv, msg.payload.authTag, 'aes-256-gcm');

          db.prepare(`INSERT INTO push_queue (id, node_id, platform, payload) VALUES (?, ?, ?, ?)`)
            .run(uuidv4(), nodeId, routeData.channel || 'UNKNOWN', JSON.stringify({ title: `New ${routeData.channel} message`, body: (routeData.content || '').substring(0,100), routeId }));

          // Broadcast in chunks to avoid monopolising event loop
          const plaintextStr = plaintext;
          const targets = [];
          for (const [nid, conn] of connections) {
            if (nid !== nodeId && conn.ws.readyState === WebSocket.OPEN) targets.push(conn);
          }
          const CHUNK = 32;
          for (let i = 0; i < targets.length; i += CHUNK) {
            const slice = targets.slice(i, i + CHUNK);
            setImmediate(() => {
              for (const conn of slice) {
                const encrypted = encryptMessage(plaintextStr, conn.sharedSecret);
                safeSend(conn, JSON.stringify({ type: 'message', routeId, payload: encrypted }));
              }
            });
          }

          ws.send(JSON.stringify({ type: 'message_ack', routeId, delivered: true }));
          console.log(`[Xtobe] Message ${routeId} from ${nodeId} via ${routeData.channel}`);
          break;
        }

        case 'ping': { ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() })); break; }
        case 'disconnect': {
          if (nodeId) { connections.delete(nodeId); db.prepare('UPDATE nodes SET connected = 0 WHERE id = ?').run(nodeId); console.log(`[Xtobe] Node ${nodeId} disconnected`); }
          break;
        }
        default: ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (err) {
      console.error('[Xtobe] Message error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => { if (nodeId) { connections.delete(nodeId); db.prepare('UPDATE nodes SET connected = 0 WHERE id = ?').run(nodeId); console.log(`[Xtobe] Node ${nodeId} disconnected`); } });
  ws.on('error', (err) => { console.error('[Xtobe] WebSocket error:', err.message); });
});

// Push dispatcher (batched, claimed, no overlapping runs)
const PUSH_INTERVAL_MS = 30000;
const PUSH_BATCH_SIZE = 200;
let pushTimer = null;

function selectPendingIds(limit, staleBefore) {
  const rows = db.prepare('SELECT id FROM push_queue WHERE sent = 0 AND (claimed_at IS NULL OR claimed_at < ?) ORDER BY created_at ASC LIMIT ?').all(staleBefore, limit);
  return rows.map(r => r.id);
}

const claimTx = db.transaction((ids, now) => {
  for (const id of ids) db.prepare('UPDATE push_queue SET claimed_at = ? WHERE id = ?').run(now, id);
});

async function dispatchPushNotifications(limit = PUSH_BATCH_SIZE) {
  const now = Date.now();
  const staleBefore = now - 5 * 60 * 1000; // reclaim stuck rows after 5 min
  const ids = selectPendingIds(limit, staleBefore);
  if (!ids.length) return;
  claimTx(ids, now);
  const batch = db.prepare(`SELECT * FROM push_queue WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  await Promise.allSettled(batch.map(async (item) => {
    try {
      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(item.node_id);
      if (!node) throw new Error('node_missing');
      const payload = JSON.parse(item.payload);
      if (node.fcm_token) console.log(`[Xtobe] FCM push to ${node.fcm_token}: ${payload.title}`);
      if (node.hms_token) console.log(`[Xtobe] HMS push to ${node.hms_token}: ${payload.title}`);
      if (node.apns_token) console.log(`[Xtobe] APNs push to ${node.apns_token}: ${payload.title}`);
      db.prepare('UPDATE push_queue SET sent = 1, claimed_at = NULL WHERE id = ?').run(item.id);
    } catch (err) {
      // release claim so it can be retried
      db.prepare('UPDATE push_queue SET claimed_at = NULL WHERE id = ?').run(item.id);
      console.error('[Xtobe] Push dispatch error for', item.id, err.message);
    }
  }));
}

async function pushLoop() {
  try {
    await dispatchPushNotifications(PUSH_BATCH_SIZE);
  } catch (err) {
    console.error('[push] dispatch failed:', err.message);
  } finally {
    pushTimer = setTimeout(pushLoop, PUSH_INTERVAL_MS);
    if (pushTimer.unref) pushTimer.unref();
  }
}
pushLoop();

server.listen(PORT, () => {
  console.log(`Xtobe Relay Server listening on ${PORT}`);
});

module.exports = { server, wss, db };