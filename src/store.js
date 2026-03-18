// src/store.js

/**
 * Centralized State Management (System 4: Production Runtime)
 * Single source of truth for UI, Selection, Engine, and Reconciliation loops.
 */
export const store = {
  mode: "idle", // "inspect" | "edit" | "idle" | "freeze"
  debug: false, // DevMode for visualizing Snapshots/ASTs
  selection: [], // Array of UUIDs
  primary: null, // Lead selected UUID anchor
  nodes: new Map(), // Mapping UUID -> { element, signature, original, overrides, computedView, parentId, childrenIds }
  
  // Job & Sync Management
  currentJobId: null,
  mappings: {}, // { nodeId: { start, end, astPath } }
  mappingVersion: 0,
  lastUpdateSource: null, // "UI" | "CODE"
  lastUpdateTimestamp: 0,

  history: [],
  future: []
};

/**
 * Node Identity Signature (Survival Hash)
 * Used to recover identity during React remounts or DOM re-ordering.
 */
export function getNodeSignature(el) {
  if (!el || !document.contains(el)) return null;

  let depth = 0;
  let curr = el;
  while (curr.parentElement) {
    depth++;
    curr = curr.parentElement;
  }
  
  const tag = el.tagName.toLowerCase();
  const classes = el.classList ? [...el.classList].sort().join('.') : '';
  const text = el.textContent ? el.textContent.trim().slice(0, 50) : '';

  return {
    tag,
    classHash: simpleHash(classes),
    textHash: simpleHash(text),
    depth,
    siblingIndex: getSiblingIndex(el)
  };
}

function getSiblingIndex(el) {
  if (!el.parentElement) return 0;
  return Array.from(el.parentElement.children).indexOf(el);
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

export function registerNode(el) {
  const id = crypto.randomUUID();
  store.nodes.set(id, {
    element: el,
    signature: getNodeSignature(el),
    original: el.getAttribute("style") || "", 
    overrides: {}, 
    computedView: {}, 
    parentId: null, 
    childrenIds: []
  });
  return id;
}
