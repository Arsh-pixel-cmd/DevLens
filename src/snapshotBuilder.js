// src/snapshotBuilder.js
import { store, getNodeSignature } from './store.js';

/**
 * System 4: The DOM Sniper
 * Captures a non-lossy, serializable representation of a DOM subtree.
 */
export function buildSnapshot(el, depth = 0) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

  // Avoid capturing our own UI
  if (el.id === 'devlens-host' || el.closest('#devlens-host')) return null;

  const rect = el.getBoundingClientRect();
  const computed = window.getComputedStyle(el);

  // Link to existing store ID if possible, otherwise generate a temporary one
  let nodeId = null;
  for (const [id, node] of store.nodes.entries()) {
    if (node.element === el) {
      nodeId = id;
      break;
    }
  }
  
  // If not in store, we don't register it in store.nodes yet to keep the snapshot pure
  // but we provide a stable-ish ID for the worker to use.
  const id = nodeId || `temp-${crypto.randomUUID()}`;

  const snapshot = {
    id,
    tag: el.tagName.toLowerCase(),
    signature: getNodeSignature(el),
    
    // Explicit Style Collection
    styles: {}, 
    
    computedLayout: {
      display: computed.display,
      flexDirection: computed.flexDirection,
      justifyContent: computed.justifyContent,
      alignItems: computed.alignItems,
      gap: computed.gap,
      flexWrap: computed.flexWrap,
      position: computed.position,
      gridTemplateColumns: computed.gridTemplateColumns,
      gridTemplateRows: computed.gridTemplateRows
    },

    boxModel: {
      margin: computed.margin,
      padding: computed.padding,
      borderWidth: computed.borderWidth,
      borderRadius: computed.borderRadius
    },

    rect: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height
    },

    attributes: {},
    textContent: getDirectTextContent(el),
    children: []
  };

  // Capture only relevant attributes
  const allowedAttrs = ['src', 'href', 'alt', 'placeholder', 'target', 'class', 'id'];
  for (const attr of el.attributes) {
    if (allowedAttrs.includes(attr.name.toLowerCase())) {
      snapshot.attributes[attr.name] = attr.value;
    }
  }

  // Recurse heavily into children
  Array.from(el.children).forEach(child => {
    const childSnapshot = buildSnapshot(child, depth + 1);
    if (childSnapshot) {
      snapshot.children.push(childSnapshot);
    }
  });

  return snapshot;
}

/**
 * Extracts only direct text nodes, avoiding child-tree pollution.
 */
function getDirectTextContent(el) {
  return Array.from(el.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim())
    .filter(Boolean)
    .join(' ');
}
