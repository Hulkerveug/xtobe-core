# Xtobe Core

**Omnichannel E2EE Lead Acquisition & Routing Protocol**

Cross-platform mobile app for iOS, Android, and Huawei AppGallery.

## Architecture

```
xtobe-core/
├── src/
│   ├── core/
│   │   ├── mls-crypto.js    # MLS protocol / zero-knowledge handshake
│   │   ├── bridge-router.js # Channel parsing (WHA, IG, TT, DT, FB)
│   │   └── socket-node.js   # WebSocket relay + push dispatcher
│   ├── ui/
│   │   ├── dashboard.tsx    # Live operations stream
│   │   └── slider.tsx       # Secret platform config matrix
│   ├── store/
│   │   └── index.js         # Zustand state management
│   └── index.js             # Entry point
├── android/                 # Android & Google Play shell
├── ios/                     # iOS & App Store shell
├── huawei/                  # HMS Core integration
├── scripts/                 # Build & deploy scripts
└── docs/                    # Documentation
```

## Quick Start

```bash
# Install dependencies
npm install

# Start development
npm start

# Build for iOS
npm run build:ios

# Build for Android
npm run build:android

# Build for Huawei
npm run build:huawei
```

## Core Concepts

### E2EE Blind Relay
- No plaintext stored on device
- Ephemeral session keys per connection
- Forward secrecy via key rotation
- Zero-knowledge server infrastructure

### Multi-Platform Push
- **iOS**: APNs (Apple Push Notification service)
- **Android**: FCM (Firebase Cloud Messaging)
- **Huawei**: HMS Push Kit (no Google Play Services needed)

### Supported Channels
| Code | Platform | Priority |
|------|----------|----------|
| WHA  | WhatsApp | 1 |
| IG   | Instagram Direct | 2 |
| TT   | TikTok DMs | 3 |
| DT   | Dating Apps | 4 |
| FB   | Facebook Messenger | 5 |

## API

```javascript
import XtobeCore from 'xtobe-core';

const xtobe = new XtobeCore({
  relayUrl: 'wss://relay.xtobe.network',
  nodeType: 'master_console',
});

// Process incoming message
await xtobe.processMessage({
  platform: 'WHA',
  from: '+971501234567',
  text: 'I am interested in property investment',
});

// Register bridge link
xtobe.registerBridge('IG', '7MLW-TOBE');

// Subscribe to events
xtobe.on('connected', ({ nodeId }) => {
  console.log('Connected as', nodeId);
});
```

## Store Deployment

### Apple App Store
- Requires Apple Developer Account ($99/year)
- Build: `npm run build:ios`
- Upload via App Store Connect

### Google Play Store
- Requires Google Play Developer Account ($25 one-time)
- Build: `npm run build:android`
- Upload AAB via Play Console

### Huawei AppGallery
- Free Huawei Developer account
- Integrate HMS Core SDK
- Build: `npm run build:huawei`
- Upload via AppGallery Connect

## Security

- All messages encrypted with MLS protocol
- No plaintext stored on device or server
- Ephemeral keys rotated per connection
- Zero-knowledge relay architecture

## License

Private - All rights reserved
