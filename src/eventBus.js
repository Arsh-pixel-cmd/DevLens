// src/eventBus.js

/**
 * Global Namespaced Event Bus
 * Decouples logic so UI, Engines, and Exporters can react without tight coupling.
 */
export const eventBus = {
  listeners: {},

  on(event, cb) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(cb);
  },

  emit(event, payload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(payload));
    }
  }
};
