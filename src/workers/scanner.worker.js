// src/workers/scanner.worker.js

/**
 * System 4: Background Intelligence Worker
 * Operates on serializable DOMSnapshots to generate IR and Codegen.
 * No DOM access. Logic-heavy only.
 */
self.onmessage = async (e) => {
  const { type, payload, jobId } = e.data;

  try {
    switch (type) {
      case 'GENERATE_IR':
        const result = processSnapshot(payload.snapshot);
        self.postMessage({
          type: 'IR_COMPLETE',
          jobId,
          data: result
        });
        break;

      default:
        console.warn(`[DevLens Worker] Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      jobId,
      error: error.message
    });
  }
};

/**
 * Converts a DOMSnapshot into a NodeIR structure.
 * This is the ported version of irBuilder.js logic.
 */
function processSnapshot(snapshot) {
  const irMap = new Map();
  const flatNodes = [];

  function traverse(node, parentId = null, depth = 0) {
    const ir = {
      id: node.id,
      signature: node.signature,
      tag: node.tag,
      attributes: node.attributes,
      
      layout: node.computedLayout,
      boxModel: node.boxModel,
      rect: node.rect,
      
      content: {
        text: node.textContent,
        src: node.attributes.src,
        href: node.attributes.href
      },
      
      childrenIds: node.children.map(c => c.id),
      parentId: parentId,
      depth: depth,
      semantics: inferSemanticRole(node)
    };

    irMap.set(node.id, ir);
    flatNodes.push(ir);

    node.children.forEach(child => {
      traverse(child, node.id, depth + 1);
    });
  }

  traverse(snapshot);

  return {
    rootId: snapshot.id,
    nodes: Array.from(irMap.entries())
  };
}

function inferSemanticRole(node) {
  const tag = node.tag.toUpperCase();
  if (tag === "BUTTON") return "button";
  if (node.attributes.onclick) return "interactive";
  if (tag === "IMG") return "image";
  if (tag === "NAV") return "navbar";
  if (node.children.length > 5 && tag === "DIV") return "container";
  
  // Basic heuristic for cards
  const hasImg = node.children.some(c => c.tag.toUpperCase() === "IMG");
  const hasHeading = node.children.some(c => ["H1", "H2", "H3", "H4", "H5"].includes(c.tag.toUpperCase()));
  if (hasImg && hasHeading) return "card";
  
  return null;
}
