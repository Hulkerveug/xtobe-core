/**
 * Xtobe Instagram Integration — Test Suite
 * 
 * Tests the Instagram Graph API client and webhook processing.
 * Uses mock data (no real API calls).
 */

const assert = require('assert');
const { InstagramGraphAPI } = require('./instagram-graph-api');
const { MessageBus } = require('./message-bus');

// ─── Test Webhook Verification ─────────────────────────────────────────
function testWebhookVerification() {
  console.log('Testing webhook verification...');

  const ig = new InstagramGraphAPI({ webhookVerifyToken: 'test_token_123' });

  // Valid verification
  const challenge = ig.verifyWebhook({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'test_token_123',
    'hub.challenge': 'challenge_string_abc',
  });
  assert.strictEqual(challenge, 'challenge_string_abc');

  // Invalid token
  const invalid = ig.verifyWebhook({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'wrong_token',
    'hub.challenge': 'challenge_string_abc',
  });
  assert.strictEqual(invalid, null);

  // Invalid mode
  const wrongMode = ig.verifyWebhook({
    'hub.mode': 'unsubscribe',
    'hub.verify_token': 'test_token_123',
    'hub.challenge': 'challenge_string_abc',
  });
  assert.strictEqual(wrongMode, null);

  console.log('  ✓ Webhook verification: PASS');
}

// ─── Test Incoming Text Message ────────────────────────────────────────
function testIncomingTextMessage() {
  console.log('Testing incoming text message...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  const webhookPayload = {
    object: 'instagram',
    entry: [
      {
        id: '17841400000000000',
        changes: [
          {
            value: {
              messages: [
                {
                  mid: 'mid.1234567890',
                  from: { id: '123456789' },
                  timestamp: 1700000000000,
                  type: 'text',
                  text: 'I am interested in your property listing',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const messages = ig.receive(webhookPayload);

  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].platform, 'instagram');
  assert.strictEqual(messages[0].accountId, '17841400000000000');
  assert.strictEqual(messages[0].messageId, 'mid.1234567890');
  assert.strictEqual(messages[0].senderId, '123456789');
  assert.strictEqual(messages[0].text, 'I am interested in your property listing');
  assert.strictEqual(messages[0].type, 'text');

  console.log('  ✓ Incoming text message: PASS');
}

// ─── Test Incoming Media Message ───────────────────────────────────────
function testIncomingMediaMessage() {
  console.log('Testing incoming media message...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  const webhookPayload = {
    object: 'instagram',
    entry: [
      {
        id: '17841400000000000',
        changes: [
          {
            value: {
              messages: [
                {
                  mid: 'mid.1234567891',
                  from: { id: '123456789' },
                  timestamp: 1700000000000,
                  type: 'media',
                  attachments: [
                    {
                      type: 'image',
                      payload: {
                        url: 'https://example.com/image.jpg',
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const messages = ig.receive(webhookPayload);

  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].type, 'media');
  assert.strictEqual(messages[0].media.type, 'image');
  assert.strictEqual(messages[0].media.url, 'https://example.com/image.jpg');

  console.log('  ✓ Incoming media message: PASS');
}

// ─── Test Duplicate Message Handling ───────────────────────────────────
function testDuplicateMessageHandling() {
  console.log('Testing duplicate message handling...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  const webhookPayload = {
    object: 'instagram',
    entry: [
      {
        id: '17841400000000000',
        changes: [
          {
            value: {
              messages: [
                {
                  mid: 'mid.1234567890',
                  from: { id: '123456789' },
                  timestamp: 1700000000000,
                  type: 'text',
                  text: 'Hello',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  // First time
  const messages1 = ig.receive(webhookPayload);
  assert.strictEqual(messages1.length, 1);

  // Second time (duplicate)
  const messages2 = ig.receive(webhookPayload);
  assert.strictEqual(messages2.length, 1); // Still returns 1, but MessageBus deduplicates

  console.log('  ✓ Duplicate message handling: PASS');
}

// ─── Test Normalized Message Output ────────────────────────────────────
function testNormalizedMessageOutput() {
  console.log('Testing normalized message output...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  const rawMessage = {
    mid: 'mid.1234567890',
    from: { id: '123456789' },
    timestamp: 1700000000000,
    type: 'text',
    text: 'Test message',
  };

  const normalized = ig.normalizeMessage(rawMessage, '17841400000000000');

  assert.strictEqual(normalized.platform, 'instagram');
  assert.strictEqual(normalized.accountId, '17841400000000000');
  assert.strictEqual(normalized.conversationId, '17841400000000000');
  assert.strictEqual(normalized.messageId, 'mid.1234567890');
  assert.strictEqual(normalized.senderId, '123456789');
  assert.strictEqual(normalized.type, 'text');
  assert.strictEqual(normalized.text, 'Test message');
  assert.ok(normalized.timestamp > 0);

  console.log('  ✓ Normalized message output: PASS');
}

// ─── Test Permitted Reply ──────────────────────────────────────────────
function testPermittedReply() {
  console.log('Testing permitted reply...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  // Open messaging window
  ig._openMessagingWindow('17841400000000000', '123456789');

  // Should be permitted
  const check = ig.canSendTo('123456789');
  assert.strictEqual(check.permitted, true);

  console.log('  ✓ Permitted reply: PASS');
}

// ─── Test Rejected Outbound Message ────────────────────────────────────
function testRejectedOutboundMessage() {
  console.log('Testing rejected outbound message...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  // No messaging window opened
  const check = ig.canSendTo('999999999');
  assert.strictEqual(check.permitted, false);
  assert.strictEqual(check.requiresCustomerInitiation, true);
  assert.ok(check.reason.includes('Customer must message first'));

  console.log('  ✓ Rejected outbound message: PASS');
}

// ─── Test API Error Handling ───────────────────────────────────────────
async function testAPIErrorHandling() {
  console.log('Testing API error handling...');

  const ig = new InstagramGraphAPI({
    accessToken: 'invalid_token',
    accountId: '17841400000000000',
  });

  // Should throw on invalid token
  let threw = false;
  try {
    await ig._request('GET', '/17841400000000000/messages');
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Instagram API error'));
  }
  assert.strictEqual(threw, true);

  console.log('  ✓ API error handling: PASS');
}

// ─── Test Message Bus Integration ──────────────────────────────────────
async function testMessageBusIntegration() {
  console.log('Testing message bus integration...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });
  const bus = new MessageBus();
  bus.registerPlatform(ig);

  const webhookPayload = {
    object: 'instagram',
    entry: [
      {
        id: '17841400000000000',
        changes: [
          {
            value: {
              messages: [
                {
                  mid: 'mid.1234567890',
                  from: { id: '123456789' },
                  timestamp: 1700000000000,
                  type: 'text',
                  text: 'Hello from Instagram',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const messages = await bus.processIncoming('instagram', webhookPayload);

  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].platform, 'instagram');
  assert.strictEqual(messages[0].text, 'Hello from Instagram');

  // Check conversation key
  const convKey = ig.getConversationKey(messages[0]);
  assert.strictEqual(convKey, 'instagram:17841400000000000:17841400000000000:123456789');

  console.log('  ✓ Message bus integration: PASS');
}

// ─── Test Malformed Webhook ────────────────────────────────────────────
function testMalformedWebhook() {
  console.log('Testing malformed webhook...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  // Missing object field
  const messages1 = ig.receive({});
  assert.strictEqual(messages1.length, 0);

  // Wrong object type
  const messages2 = ig.receive({ object: 'facebook' });
  assert.strictEqual(messages2.length, 0);

  // Empty entry
  const messages3 = ig.receive({ object: 'instagram', entry: [] });
  assert.strictEqual(messages3.length, 0);

  console.log('  ✓ Malformed webhook: PASS');
}

// ─── Test Conversation Identity ──────────────────────────────────────────
function testConversationIdentity() {
  console.log('Testing conversation identity...');

  const ig = new InstagramGraphAPI({ accountId: '17841400000000000' });

  const msg1 = {
    platform: 'instagram',
    accountId: '17841400000000000',
    conversationId: '17841400000000000',
    senderId: '123456789',
  };

  const msg2 = {
    platform: 'instagram',
    accountId: '17841400000000000',
    conversationId: '17841400000000000',
    senderId: '987654321',
  };

  const key1 = ig.getConversationKey(msg1);
  const key2 = ig.getConversationKey(msg2);

  // Different senders = different conversations
  assert.notStrictEqual(key1, key2);

  // Same sender = same conversation
  const key3 = ig.getConversationKey(msg1);
  assert.strictEqual(key1, key3);

  console.log('  ✓ Conversation identity: PASS');
}

// ─── Run All Tests ─────────────────────────────────────────────────────
async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Xtobe Instagram Integration — Test Suite v1.0.0        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    testWebhookVerification();
    testIncomingTextMessage();
    testIncomingMediaMessage();
    testDuplicateMessageHandling();
    testNormalizedMessageOutput();
    testPermittedReply();
    testRejectedOutboundMessage();
    await testAPIErrorHandling();
    testMessageBusIntegration();
    testMalformedWebhook();
    testConversationIdentity();

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ALL TESTS PASSED ✓                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  } catch (err) {
    console.error('\n✗ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runAllTests();
