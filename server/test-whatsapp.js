/**
 * Xtobe WhatsApp Integration — Test Suite
 * 
 * Tests the WhatsApp Cloud API client and webhook processing.
 * Uses mock data (no real API calls).
 */

const assert = require('assert');
const { WhatsAppCloudAPI } = require('./whatsapp-cloud-api');

// ─── Test Phone Number Formatting ──────────────────────────────────────
function testPhoneNumberFormatting() {
  console.log('Testing phone number formatting...');
  
  const wa = new WhatsAppCloudAPI({});
  
  assert.strictEqual(wa._formatPhoneNumber('+971501234567'), '+971501234567');
  assert.strictEqual(wa._formatPhoneNumber('00971501234567'), '+971501234567');
  assert.strictEqual(wa._formatPhoneNumber('971501234567'), '+971501234567');
  assert.strictEqual(wa._formatPhoneNumber('+1-555-123-4567'), '+15551234567');
  
  console.log('  ✓ Phone number formatting: PASS');
}

// ─── Test Webhook Verification ─────────────────────────────────────────
function testWebhookVerification() {
  console.log('Testing webhook verification...');
  
  const wa = new WhatsAppCloudAPI({ webhookVerifyToken: 'test_token_123' });
  
  // Valid verification
  const challenge = wa.verifyWebhook({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'test_token_123',
    'hub.challenge': 'challenge_string_abc',
  });
  assert.strictEqual(challenge, 'challenge_string_abc');
  
  // Invalid token
  const invalid = wa.verifyWebhook({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'wrong_token',
    'hub.challenge': 'challenge_string_abc',
  });
  assert.strictEqual(invalid, null);
  
  // Invalid mode
  const wrongMode = wa.verifyWebhook({
    'hub.mode': 'unsubscribe',
    'hub.verify_token': 'test_token_123',
    'hub.challenge': 'challenge_string_abc',
  });
  assert.strictEqual(wrongMode, null);
  
  console.log('  ✓ Webhook verification: PASS');
}

// ─── Test Webhook Message Processing ───────────────────────────────────
function testWebhookProcessing() {
  console.log('Testing webhook message processing...');
  
  const wa = new WhatsAppCloudAPI({});
  
  const webhookPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+971501234567',
                phone_number_id: '987654321',
              },
              messages: [
                {
                  from: '+971509876543',
                  id: 'wamid.ABgB1234567890',
                  timestamp: '1700000000',
                  type: 'text',
                  text: {
                    body: 'I am interested in property investment',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  
  const messages = wa.processWebhook(webhookPayload);
  
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].from, '+971509876543');
  assert.strictEqual(messages[0].type, 'text');
  assert.strictEqual(messages[0].text, 'I am interested in property investment');
  assert.strictEqual(messages[0].id, 'wamid.ABgB1234567890');
  
  console.log('  ✓ Webhook message processing: PASS');
}

// ─── Test Messaging Window ─────────────────────────────────────────────
function testMessagingWindow() {
  console.log('Testing 24-hour messaging window...');
  
  const wa = new WhatsAppCloudAPI({});
  
  const phone = '+971501234567';
  
  // Initially no window
  assert.strictEqual(wa.canSendFreeMessage(phone), false);
  
  // Open window
  wa._openMessagingWindow(phone);
  assert.strictEqual(wa.canSendFreeMessage(phone), true);
  
  // Check expiry
  const expiry = wa.getMessagingWindowExpiry(phone);
  assert.ok(expiry instanceof Date);
  assert.ok(expiry > new Date());
  
  console.log('  ✓ Messaging window: PASS');
}

// ─── Test Status Update Processing ─────────────────────────────────────
function testStatusUpdates() {
  console.log('Testing status update processing...');
  
  const wa = new WhatsAppCloudAPI({});
  
  const webhookPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+971501234567',
                phone_number_id: '987654321',
              },
              statuses: [
                {
                  id: 'wamid.ABgB1234567890',
                  status: 'delivered',
                  timestamp: '1700000001',
                  recipient_id: '+971509876543',
                },
              ],
            },
          },
        ],
      },
    ],
  };
  
  const messages = wa.processWebhook(webhookPayload);
  
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].type, 'status_update');
  assert.strictEqual(messages[0].status, 'delivered');
  assert.strictEqual(messages[0].recipientId, '+971509876543');
  
  console.log('  ✓ Status updates: PASS');
}

// ─── Test Template Registration ────────────────────────────────────────
function testTemplateRegistration() {
  console.log('Testing template registration...');
  
  const wa = new WhatsAppCloudAPI({});
  
  wa.registerTemplate('hello_world', 'UTILITY', 'en', [
    {
      type: 'body',
      text: 'Hello {{1}}, welcome to Xtobe!',
      parameters: [
        { type: 'text', text: 'User' },
      ],
    },
  ]);
  
  const template = wa.templates.get('hello_world');
  assert.ok(template);
  assert.strictEqual(template.name, 'hello_world');
  assert.strictEqual(template.category, 'UTILITY');
  assert.strictEqual(template.language, 'en');
  
  console.log('  ✓ Template registration: PASS');
}

// ─── Test Media Message Processing ─────────────────────────────────────
function testMediaMessageProcessing() {
  console.log('Testing media message processing...');
  
  const wa = new WhatsAppCloudAPI({});
  
  const webhookPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+971501234567',
                phone_number_id: '987654321',
              },
              messages: [
                {
                  from: '+971509876543',
                  id: 'wamid.ABgB1234567891',
                  timestamp: '1700000000',
                  type: 'image',
                  image: {
                    id: 'media_id_123',
                    caption: 'Property photo',
                    mime_type: 'image/jpeg',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  
  const messages = wa.processWebhook(webhookPayload);
  
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].type, 'image');
  assert.strictEqual(messages[0].image.id, 'media_id_123');
  assert.strictEqual(messages[0].image.caption, 'Property photo');
  
  console.log('  ✓ Media message processing: PASS');
}

// ─── Run All Tests ─────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║        Xtobe WhatsApp Integration — Test Suite v1.0.0        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

try {
  testPhoneNumberFormatting();
  testWebhookVerification();
  testWebhookProcessing();
  testMessagingWindow();
  testStatusUpdates();
  testTemplateRegistration();
  testMediaMessageProcessing();
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    ALL TESTS PASSED ✓                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
} catch (err) {
  console.error('\n✗ TEST FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}
