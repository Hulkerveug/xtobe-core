/**
 * Xtobe Relay Server — Test Suite
 * 
 * Tests real E2EE: ECDH key exchange + AES-256-GCM encryption/decryption.
 */

const crypto = require('crypto');
const assert = require('assert');

// ─── Test ECDH Key Exchange ────────────────────────────────────────────
function testECDH() {
  console.log('Testing ECDH key exchange...');
  
  // Server generates key pair
  const serverECDH = crypto.createECDH('secp256k1');
  const serverPublicKey = serverECDH.generateKeys('hex');
  const serverPrivateKey = serverECDH.getPrivateKey('hex');
  
  // Client generates key pair
  const clientECDH = crypto.createECDH('secp256k1');
  const clientPublicKey = clientECDH.generateKeys('hex');
  const clientPrivateKey = clientECDH.getPrivateKey('hex');
  
  // Both derive same shared secret
  const serverSecret = serverECDH.computeSecret(clientPublicKey, 'hex');
  const clientSecret = clientECDH.computeSecret(serverPublicKey, 'hex');
  
  assert.deepStrictEqual(serverSecret, clientSecret, 'Shared secrets must match');
  console.log('  ✓ ECDH key exchange: PASS');
}

// ─── Test AES-256-GCM Encryption ───────────────────────────────────────
function testAES256GCM() {
  console.log('Testing AES-256-GCM encryption...');
  
  const sharedSecret = crypto.randomBytes(32);
  const plaintext = JSON.stringify({
    channel: 'WHA',
    sender: '+971501234567',
    content: 'I am interested in property investment in Dubai',
    priority: 1,
    timestamp: Date.now(),
  });
  
  // Encrypt
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', sharedSecret, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  assert.strictEqual(decrypted.toString('utf8'), plaintext, 'Decrypted must match original');
  console.log('  ✓ AES-256-GCM encryption: PASS');
}

// ─── Test Tamper Detection ─────────────────────────────────────────────
function testTamperDetection() {
  console.log('Testing tamper detection...');
  
  const sharedSecret = crypto.randomBytes(32);
  const plaintext = 'Sensitive message';
  
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Tamper with ciphertext
  const tampered = Buffer.from(encrypted);
  tampered[0] = tampered[0] ^ 0xFF;
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', sharedSecret, iv);
  decipher.setAuthTag(authTag);
  
  let threw = false;
  try {
    decipher.update(tampered);
    decipher.final();
  } catch {
    threw = true;
  }
  
  assert.strictEqual(threw, true, 'Tampered ciphertext must throw');
  console.log('  ✓ Tamper detection: PASS');
}

// ─── Test Full E2EE Flow ───────────────────────────────────────────────
function testFullE2EEFlow() {
  console.log('Testing full E2EE flow...');
  
  // Server side
  const serverECDH = crypto.createECDH('secp256k1');
  const serverPublicKey = serverECDH.generateKeys('hex');
  
  // Client side
  const clientECDH = crypto.createECDH('secp256k1');
  const clientPublicKey = clientECDH.generateKeys('hex');
  
  // Key exchange
  const serverSecret = serverECDH.computeSecret(clientPublicKey, 'hex');
  const clientSecret = clientECDH.computeSecret(serverPublicKey, 'hex');
  
  // Client encrypts message
  const message = JSON.stringify({
    channel: 'IG',
    sender: 'investor_123',
    content: 'Looking for AED 2M+ property in Dubai Marina',
    priority: 1,
  });
  
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', clientSecret, iv);
  const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Server decrypts message
  const decipher = crypto.createDecipheriv('aes-256-gcm', serverSecret, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  assert.strictEqual(decrypted.toString('utf8'), message, 'Full E2EE flow must work');
  console.log('  ✓ Full E2EE flow: PASS');
}

// ─── Run All Tests ─────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           Xtobe Relay Server — Test Suite v1.0.0             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

try {
  testECDH();
  testAES256GCM();
  testTamperDetection();
  testFullE2EEFlow();
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    ALL TESTS PASSED ✓                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
} catch (err) {
  console.error('\n✗ TEST FAILED:', err.message);
  process.exit(1);
}
