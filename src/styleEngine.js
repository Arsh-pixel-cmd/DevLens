// src/styleEngine.js
import { store } from './store.js';
import { eventBus } from './eventBus.js';

let pending = new Set();
let scheduled = false;

/**
 * Batching Render Scheduler (RAF)
 * Prevents UI updates from causing N reflows per second.
 */
export function scheduleApply(nodeId, priority = "normal") {
  if (priority === "high") {
    const node = store.nodes.get(nodeId);
    if (node) applyStyles(node);
    return;
  }
  
  pending.add(nodeId);
  
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(() => {
      pending.forEach(id => {
        const node = store.nodes.get(id);
        if (node) applyStyles(node);
      });
      pending.clear();
      scheduled = false;
    });
  }
}

/**
 * Diff-Based Renderer + DevTools Isolation Try/Catch
 */
function applyStyles(node) {
  if (!document.contains(node.element)) {
    // Rely on MutationObserver in ripper.js to rebind or prune ghost nodes
    return; 
  }

  try {
    const el = node.element;
    for (const key in node.overrides) {
      if (el.style[key] !== node.overrides[key]) {
        el.style.setProperty(key, node.overrides[key], "important");
      }
    }
  } catch (err) {
    console.warn("DevLens: UI Style Mount Blocked by Host Configuration.");
  }
}

/**
 * Update individual styles, tracking intent in overrides map.
 */
export function updateStyle(nodeId, property, value, batch = false) {
  const node = store.nodes.get(nodeId);
  if (!node) return;
  
  node.overrides[property] = value;
  scheduleApply(nodeId);
  
  if (!batch) {
    eventBus.emit("style:update", { nodeId, property, value });
  }
}

/**
 * Batched execution wrapping multiple style updates inside a single history payload
 */
export function batchUpdateStyles(changes) {
  changes.forEach(({ nodeId, property, value }) => {
    const node = store.nodes.get(nodeId);
    if (node) {
       node.overrides[property] = value;
       scheduleApply(nodeId);
    }
  });

  store.history.push({ type: "BATCH_STYLE_UPDATE", changes });
  store.future = [];
  eventBus.emit("style:update", { batch: true });
}

/**
 * Reads merged styles predictably, relying on computed fallbacks for UI rendering.
 */
export function getStyle(nodeId, prop) {
  const node = store.nodes.get(nodeId);
  if (!node || !document.contains(node.element)) return null;
  
  if (node.overrides[prop] !== undefined) return node.overrides[prop];
  return getComputedStyle(node.element)[prop];
}

/**
 * Multi-Select Matrix Resolver
 * Identifies if multiple components share the same variable value, or reports MIXED.
 */
export function getMultiStyle(nodeIds, prop) {
  if (nodeIds.length === 0) return null;
  const values = nodeIds.map(id => getStyle(id, prop));
  const first = values[0];
  return values.every(v => v === first) ? first : "MIXED";
}

export function revertNode(nodeId) {
  const node = store.nodes.get(nodeId);
  if (!node) return;

  node.overrides = {};
  node.element.setAttribute("style", node.original);
  eventBus.emit("style:update", { nodeId, reverted: true });
}
