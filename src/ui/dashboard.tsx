/* src/ui/dashboard.tsx with memoization and FlatList tuning */
/**
 * Xtobe Dashboard - Unified Live Operations Stream
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useXtobeStore } from '../store';

const PLATFORM_COLORS = { WHA: '#25D366', IG: '#E4405F', TT: '#000000', DT: '#FF6B6B', FB: '#0084FF' };
const PLATFORM_ICONS = { WHA: '💬', IG: '📷', TT: '🎵', DT: '💕', FB: '👤' };

function RouteRow({ route }) {
  return (
    <View style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <View style={styles.platformBadge}>
          <Text style={styles.platformIcon}>{PLATFORM_ICONS[route.channel] || '📡'}</Text>
          <Text style={[styles.platformText, { color: PLATFORM_COLORS[route.channel] || '#888' }]}>{route.channel}</Text>
        </View>
        <Text style={styles.timestamp}>{new Date(route.created_at || route.timestamp || Date.now()).toLocaleTimeString()}</Text>
      </View>
      <Text style={styles.sender}>{route.sender}</Text>
      <Text style={styles.content} numberOfLines={2}>{route.content}</Text>
      <View style={styles.routeFooter}>
        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(route.priority) }]}>
          <Text style={styles.priorityText}>P{route.priority}</Text>
        </View>
        <Text style={styles.routeId}>#{String(route.id).slice(0,8)}</Text>
      </View>
    </View>
  );
}
const MemoRouteRow = React.memo(RouteRow);

export default function Dashboard() {
  const { routes = [], connected, stats = {} } = useXtobeStore();
  const [filter, setFilter] = useState('ALL');

  const filteredRoutes = useMemo(() => (filter === 'ALL' ? routes : routes.filter(r => r.channel === filter)), [routes, filter]);

  const keyExtractor = useCallback((item) => String(item.id), []);
  const renderItem = useCallback(({ item }) => <MemoRouteRow route={item} />, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <View style={styles.header}>
        <Text style={styles.title}>Xtobe // Live Operations</Text>
        <View style={[styles.statusDot, { backgroundColor: connected ? '#10b981' : '#ef4444' }]} />
      </View>
      <View style={styles.statsBar}>
        <View style={styles.stat}><Text style={styles.statValue}>{stats.total}</Text><Text style={styles.statLabel}>Total</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{stats.today}</Text><Text style={styles.statLabel}>Today</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{stats.active}</Text><Text style={styles.statLabel}>Active</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{stats.pending}</Text><Text style={styles.statLabel}>Pending</Text></View>
      </View>
      <View style={styles.filterBar}>
        {['ALL', 'WHA', 'IG', 'TT', 'DT', 'FB'].map(ch => (
          <TouchableOpacity key={ch} style={[styles.filterTab, filter === ch && styles.filterTabActive]} onPress={() => setFilter(ch)}>
            <Text style={[styles.filterText, filter === ch && styles.filterTextActive]}>{ch}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredRoutes}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No messages yet</Text><Text style={styles.emptySub}>Waiting for bridge connections...</Text></View>}
      />
    </SafeAreaView>
  );
}

function getPriorityColor(priority) { if (priority <= 1) return '#ef4444'; if (priority <= 2) return '#f59e0b'; if (priority <= 3) return '#3b82f6'; return '#6b7280'; }

const styles = StyleSheet.create({ /* unchanged styles copied from original */
  container: { flex: 1, backgroundColor: '#050505' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1f1f1f' },
  title: { fontSize: 18, fontWeight: '700', color: '#fff' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statsBar: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f1f1f' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  filterBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1f1f1f' },
  filterTabActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  filterText: { fontSize: 12, color: '#888', fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  list: { padding: 16 },
  routeCard: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1f1f1f' },
  routeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  platformBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  platformIcon: { fontSize: 14 },
  platformText: { fontSize: 12, fontWeight: '700' },
  timestamp: { fontSize: 11, color: '#666' },
  sender: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 },
  content: { fontSize: 13, color: '#aaa', lineHeight: 18 },
  routeFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  priorityText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  routeId: { fontSize: 10, color: '#666' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#666', fontWeight: '600' },
  emptySub: { fontSize: 13, color: '#444', marginTop: 4 }
});