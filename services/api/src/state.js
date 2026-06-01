// Shared mutable runtime state.
// Exported as an object so other modules see updates via property access
// (ESM live bindings are read-only and cannot be reassigned across modules).
export const state = {
  latestData: null,
  lastHeartbeat: 0,
  alertSettings: { level1: 1000, level2: 1500, notifications: true },
  lastAlertLevel: 0,
};

export const wsClients = new Set();
