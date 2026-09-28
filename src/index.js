/**
 * Xtobe Core - Entry Point
 * 
 * Omnichannel E2EE Lead Acquisition & Routing Protocol
 * 
 * Usage:
 *   import XtobeCore from 'xtobe-core';
 *   const xtobe = new XtobeCore({ relayUrl: 'wss://relay.xtobe.network' });
 *   await xtobe.connect();
 */

import { AppRegistry, Text, View, StyleSheet } from 'react-native';
import React from 'react';
import { initializeBlindRelay, processInboundMessage, clearSessionKey } from './core/mls-crypto';
import { parseRoute, getChannels, registerBridge } from './core/bridge-router';
import { createSocketNode, ConnectionState } from './core/socket-node';
import { useXtobeStore } from './store';

class XtobeCore {
  constructor(config = {}) {
    this.config = {
      relayUrl: config.relayUrl || 'wss://relay.xtobe.network',
      nodeType: config.nodeType || 'master_console',
      nodeId: config.nodeId,
      autoConnect: config.autoConnect ?? true,
    };

    this.socket = createSocketNode({
      relayUrl: this.config.relayUrl,
      nodeType: this.config.nodeType,
      nodeId: this.config.nodeId,
    });

    this._setupListeners();

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to relay server.
   */
  async connect() {
    try {
      await this.socket.connect();
      console.log('[Xtobe] Connected to relay');
    } catch (error) {
      console.error('[Xtobe] Connection failed:', error);
    }
  }

  /**
   * Disconnect from relay.
   */
  disconnect() {
    this.socket.disconnect();
  }

  /**
   * Process an incoming message from any platform.
   */
  async processMessage(rawMessage) {
    try {
      // Parse route
      const route = parseRoute(rawMessage);
      
      // Create secure packet
      const securePacket = await processInboundMessage(rawMessage);
      
      // Add to store
      useXtobeStore.getState().addRoute(route);
      
      // Send through relay
      await this.socket.send(securePacket);
      
      // Clear ephemeral key
      clearSessionKey(securePacket);
      
      return { success: true, routeId: route.id };
    } catch (error) {
      console.error('[Xtobe] Message processing failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all supported channels.
   */
  getChannels() {
    return getChannels();
  }

  /**
   * Register a new bridge link.
   */
  registerBridge(channelCode, customId) {
    return registerBridge(channelCode, customId);
  }

  /**
   * Subscribe to events.
   */
  on(event, callback) {
    return this.socket.on(event, callback);
  }

  /**
   * Setup internal event listeners.
   */
  _setupListeners() {
    this.socket.on('connected', ({ nodeId }) => {
      useXtobeStore.getState().setConnected(true, nodeId);
    });

    this.socket.on('stateChange', (state) => {
      if (state === ConnectionState.DISCONNECTED) {
        useXtobeStore.getState().setConnected(false);
      }
    });

    this.socket.on('error', (error) => {
      console.error('[Xtobe] Socket error:', error);
    });
  }
}

// React Native App Component
export function XtobeApp() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Xtobe Core</Text>
      <Text style={styles.subtitle}>E2EE Blind Relay Protocol</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
});

// Register app
AppRegistry.registerComponent('XtobeCore', () => XtobeApp);

export default XtobeCore;
