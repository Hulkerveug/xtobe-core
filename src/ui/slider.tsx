/**
 * Xtobe Secret Slider - Platform Configuration Matrix
 * 
 * Hidden admin panel accessible via floating trigger button.
 * Contains all platform bridge links, AWS wiring, and store deployment nodes.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = Math.min(400, width * 0.9);

const PLATFORMS = [
  { name: 'Instagram Direct', code: 'IG', status: 'Active', link: 'xtobe.network/j/IG-7MLW-TOBE' },
  { name: 'Facebook Messenger', code: 'FB', status: 'Active', link: 'xtobe.network/j/FB-7MLW-TOBE' },
  { name: 'TikTok DMs', code: 'TT', status: 'Active', link: 'xtobe.network/j/TT-7MLW-TOBE' },
  { name: 'Dating App Bridges', code: 'DT', status: 'Active', link: 'xtobe.network/j/DT-7MLW-TOBE' },
];

const AWS_SERVICES = [
  { name: 'AWS S3 Bridge', code: 'AWS', status: 'Active' },
  { name: 'AWS Lambda Relay', code: 'LDA', status: 'Active' },
  { name: 'AWS SQS Queue', code: 'SQS', status: 'Active' },
  { name: 'AWS DynamoDB', code: 'DDB', status: 'Active' },
  { name: 'AWS API Gateway', code: 'AGW', status: 'Active' },
  { name: 'AWS CloudWatch', code: 'CW', status: 'Active' },
  { name: 'AWS SNS Notifications', code: 'SNS', status: 'Active' },
  { name: 'AWS KMS Encryption', code: 'KMS', status: 'Active' },
  { name: 'AWS Bedrock AI', code: 'BRK', status: 'Active' },
];

const STORE_NODES = [
  { name: 'iOS App Store', status: 'Ready', detail: 'App Store Connect // Build v1.1' },
  { name: 'Google Play Store', status: 'Ready', detail: 'Play Console // Android AAB' },
  { name: 'Huawei AppGallery', status: 'HMS Integrated', detail: 'AppGallery Console // Push Kit Active' },
];

export default function SecretSlider({ visible, onClose }) {
  const [slideAnim] = useState(new Animated.Value(visible ? 0 : SLIDER_WIDTH));

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : SLIDER_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} />
      
      <Animated.View
        style={[
          styles.slider,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Platform Bridging Matrix</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Platform Bridges */}
          <Text style={styles.sectionTitle}>Social Platforms</Text>
          {PLATFORMS.map(p => (
            <View key={p.code} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{p.name}</Text>
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.statusText}>{p.status}</Text>
                </View>
              </View>
              <Text style={styles.cardLink}>{p.link}</Text>
            </View>
          ))}

          {/* AWS Services */}
          <Text style={styles.sectionTitle}>AWS Infrastructure</Text>
          {AWS_SERVICES.map(s => (
            <View key={s.code} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{s.name}</Text>
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.statusText}>{s.status}</Text>
                </View>
              </View>
              <Text style={styles.cardLink}>xtobe.network/j/{s.code}-7MLW-TOBE</Text>
            </View>
          ))}

          {/* Store Deployment Nodes */}
          <Text style={styles.sectionTitle}>Store Deployment Nodes</Text>
          {STORE_NODES.map(s => (
            <View key={s.name} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{s.name}</Text>
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: '#3b82f6' }]} />
                  <Text style={[styles.statusText, { color: '#3b82f6' }]}>{s.status}</Text>
                </View>
              </View>
              <Text style={styles.cardLink}>{s.detail}</Text>
            </View>
          ))}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Xtobe Core v1.0.0</Text>
            <Text style={styles.footerSub}>E2EE Blind Relay Protocol</Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  slider: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: SLIDER_WIDTH,
    height: '100%',
    backgroundColor: '#080808',
    borderLeftWidth: 1,
    borderLeftColor: '#1f1f1f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 18,
    color: '#888',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    marginTop: 20,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '600',
  },
  cardLink: {
    fontSize: 11,
    color: '#3b82f6',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  footerSub: {
    fontSize: 10,
    color: '#444',
    marginTop: 2,
  },
});
