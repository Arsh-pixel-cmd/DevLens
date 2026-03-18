// src/dataInspector.js
import { eventBus } from './eventBus.js';
import { store } from './store.js';

/**
 * Handles communication bridging natively with the isolated main world logic.
 * Enforces async pipelines and multi-layer fallbacks.
 */
export class DataInspector {
  constructor() {
     this.injectMainScript();
     this.listenForMainWorld();
  }

  injectMainScript() {
     const script = document.createElement('script');
     script.src = chrome.runtime.getURL('src/mainWorld.js');
     // Appending directly to docElement bypasses some aggressive CSP issues in head
     (document.head || document.documentElement).appendChild(script);
  }

  listenForMainWorld() {
     window.addEventListener("message", (e) => {
        // Enforce Strict Listener
        if (e.data?.source !== "devlens-main" || e.data?.type !== "DATA_EXTRACT_RES") return;
        
        const result = e.data.payload;
        
        // Conclude async pipeline
        eventBus.emit("inspection:data_complete", result);
     });
  }

  /**
   * Broadcasts request to extract React or Next.js Context asynchronously over Message API.
   */
  async runInspection(nodeId) {
     const node = store.nodes.get(nodeId);
     if (!node || !document.contains(node.element)) return;

     // Initialize Async Timeline View updates
     eventBus.emit("inspection:start", { nodeId });

     // 1. Temporarily affix mapping key strictly for unique querySelector targeting over Bridge
     const uniqueId = `devlens-inspect-${crypto.randomUUID()}`;
     node.element.setAttribute('data-dl-query', uniqueId);
     
     // Emit Payload over Sandbox Barrier
     window.postMessage({
        source: "devlens-content",
        type: "DATA_EXTRACT_REQ",
        payload: {
           targetSelector: `[data-dl-query="${uniqueId}"]`,
           targetText: node.element.textContent
        }
     }, "*");

     // Scrape marker instantly prior to next render tick to prevent UX flickering
     requestAnimationFrame(() => {
        if (node.element.hasAttribute('data-dl-query')) {
           node.element.removeAttribute('data-dl-query');
        }
     });
  }
}
