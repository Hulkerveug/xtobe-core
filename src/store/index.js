/**
 * Xtobe State Store
 * Zustand-based state management for routes, connection, and stats.
 */

import { create } from 'zustand';

export const useXtobeStore = create((set, get) => ({
  // Connection state
  connected: false,
  nodeId: null,

  // Routes (incoming messages)
  routes: [],

  // Stats
  stats: {
    total: 0,
    today: 0,
    active: 0,
    pending: 0,
  },

  // Actions
  setConnected: (connected, nodeId = null) => set({ connected, nodeId }),

  addRoute: (route) => set((state) => ({
    routes: [route, ...state.routes].slice(0, 100), // Keep last 100
    stats: {
      ...state.stats,
      total: state.stats.total + 1,
      today: state.stats.today + 1,
      active: state.stats.active + 1,
    },
  })),

  updateRoute: (id, updates) => set((state) => ({
    routes: state.routes.map(r => r.id === id ? { ...r, ...updates } : r),
  })),

  removeRoute: (id) => set((state) => ({
    routes: state.routes.filter(r => r.id !== id),
    stats: {
      ...state.stats,
      active: Math.max(0, state.stats.active - 1),
    },
  })),

  clearRoutes: () => set({ routes: [] }),

  incrementPending: () => set((state) => ({
    stats: { ...state.stats, pending: state.stats.pending + 1 },
  })),

  decrementPending: () => set((state) => ({
    stats: { ...state.stats, pending: Math.max(0, state.stats.pending - 1) },
  })),
}));
