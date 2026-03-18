// src/irBuilder.js
import { store, registerNode, getNodeSignature } from './store.js';
import { eventBus } from './eventBus.js';

export const liveIR = new Map();
export const exportIR = new Map();

/**
 * Builds the fast reactive UI intermediate representation tree.
 */
export function buildLiveIR(nodeId) {
  const node = store.nodes.get(nodeId);
  if (!node || !document.contains(node.element)) return null;

  const computed = getComputedStyle(node.element);
  
  const ir = {
    id: nodeId,
    tag: node.element.tagName.toLowerCase(),
    classList: [...node.element.classList],
    styles: { ...node.overrides },
    layout: {
      display: computed.display,
      flexDirection: computed.flexDirection,
      justifyContent: computed.justifyContent,
      alignItems: computed.alignItems,
      gap: computed.gap
    },
    boxModel: {
      margin: computed.margin,
      padding: computed.padding
    },
    children: node.childrenIds || [],
    parentId: node.parentId,
    semanticRole: inferSemanticRole(node.element),
    text: Array.from(node.element.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent.trim()).filter(Boolean).join(' '),
    attributes: {
      src: node.element.getAttribute('src'),
      href: node.element.getAttribute('href')
    }
  };
  
  liveIR.set(nodeId, ir);
  return ir;
}

/**
 * Builds the dense Code Generation Export Map by recursively exploring children
 */
export function buildExportIR(nodeIds) {
  exportIR.clear(); // Ensure clean slate
  nodeIds.forEach(id => {
     deepRegisterAndBuild(id);
  });
}

function deepRegisterAndBuild(nodeId) {
  const node = store.nodes.get(nodeId);
  if (!node || !document.contains(node.element)) return;

  const childrenElements = Array.from(node.element.children);
  const childrenIds = [];

  childrenElements.forEach(childEl => {
     let childId = null;
     // Optimization: lookup existing
     for (const [id, n] of store.nodes.entries()) {
        if (n.element === childEl) { childId = id; break; }
     }
     
     if (!childId) {
       childId = registerNode(childEl);
       const newlyRegistered = store.nodes.get(childId);
       newlyRegistered.parentId = nodeId;
     }
     
     childrenIds.push(childId);
     deepRegisterAndBuild(childId);
  });

  node.childrenIds = childrenIds;

  const ir = buildLiveIR(nodeId);
  if (ir) {
     const depth = getDepth(node.element);
     ir.stableKey = `${ir.tag}|${ir.classList.join('.')}|${depth}`;
     exportIR.set(nodeId, ir);
  }
}

function getDepth(el) {
   let d = 0; let c = el;
   while(c.parentElement) { d++; c = c.parentElement; }
   return d;
}

function inferSemanticRole(el) {
  if (!el) return null;
  if (el.tagName === "BUTTON") return "button";
  if (el.onclick) return "interactive";
  if (el.tagName === "IMG") return "image";
  if (el.tagName === "NAV") return "navbar";
  if (el.children.length > 5 && el.tagName === "DIV") return "container";
  if (el.querySelector("img") && el.querySelector("h1")) return "card";
  return null;
}

// Event-driven incremental incremental IR sync
eventBus.on('style:update', (payload) => {
  if (payload.batch) {
    store.selection.forEach(id => {
       buildLiveIR(id);
       eventBus.emit('ir:update', { nodeId: id });
    });
  } else if (payload.nodeId) {
    buildLiveIR(payload.nodeId);
    eventBus.emit('ir:update', { nodeId: payload.nodeId });
  }
});
