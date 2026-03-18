// src/store.js

/**
 * Centralized State Management
 * Single source of truth for UI, Selection, Engine, and Undo/Redo cycles.
 */
export const store = {
  mode: "idle", // "inspect" | "edit" | "idle" | "freeze"
  selection: [], // Array of UUIDs
  primary: null, // Lead selected UUID anchor
  nodes: new Map(), // Mapping UUID -> { element, signature, original, overrides, computedView, parentId, childrenIds }
  history: [],
  future: []
};

/**
 * Node Signature Fingerprint
 * Deep hashing to survive React/Vue re-renders and DOM detachments.
 */
export function getNodeSignature(el) {
  if (!el || !document.contains(el)) return null;

  let depth = 0;
  let curr = el;
  while (curr.parentElement) {
    depth++;
    curr = curr.parentElement;
  }
  
  const index = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0;
  const tag = el.tagName || '';
  const classes = el.classList ? [...el.classList].sort().join('.') : '';
  const text = el.textContent ? el.textContent.trim().slice(0, 30) : '';

  // Creating a robust weighted hash string
  return `${tag}:::${classes}:::${depth}:::${index}:::${text}`;
}

export function registerNode(el) {
  const id = crypto.randomUUID();
  store.nodes.set(id, {
    element: el,
    signature: getNodeSignature(el),
    original: el.getAttribute("style") || "", // Caching inline style ONLY for safe reverts
    overrides: {}, // User injected styles
    computedView: {}, // Lazy evaluation map
    parentId: null, // Hierarchy tracking
    childrenIds: []
  });
  return id;
}
