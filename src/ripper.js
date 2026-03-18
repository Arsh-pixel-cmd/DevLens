// src/ripper.js
import { store, registerNode, getNodeSignature } from './store.js';
import { eventBus } from './eventBus.js';
import { buildExportIR } from './irBuilder.js';

/**
 * Advanced Selection & Interaction Engine
 * Features:
 *  - Shift+Click Multi-select
 *  - Full Keyboard DOM Navigation (Up, Down, Left, Right)
 *  - Viewport-optimized Overlays
 *  - MutationObserver for React/Vue Re-render Survival
 */
export class ComponentRipper {
  constructor(uiInstance) {
    this.active = false;
    this.ui = uiInstance;
    this.overlays = [];
    this.hoverOverlay = null;

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);

    this.setupSurvivalObserver();
  }

  toggle(active) {
    this.active = active;
    store.mode = active ? "inspect" : "idle";
    
    if (active) {
      document.addEventListener('mousemove', this.onMouseMove, true);
      document.addEventListener('click', this.onClick, true);
      document.addEventListener('keydown', this.onKeyDown, true);
      document.body.style.cursor = 'crosshair';
      this.renderOverlays();
    } else {
      document.removeEventListener('mousemove', this.onMouseMove, true);
      document.removeEventListener('click', this.onClick, true);
      document.removeEventListener('keydown', this.onKeyDown, true);
      document.body.style.cursor = 'default';
      this.clearOverlays();
      store.selection = [];
      store.primary = null;
    }

    if (this.ui.syncPanelToSelection) {
      this.ui.syncPanelToSelection();
    }
  }

  // Watches for disconnected DOM nodes inside our registry and attempts to rebind dynamically
  setupSurvivalObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (store.mode === "freeze") return; // Prevent system from attempting recovery while frozen

      let structureChanged = false;
      
      store.nodes.forEach((node, id) => {
        if (!document.contains(node.element)) {
          // Attempt recovery via fingerprint signature matching
          const match = this.attemptNodeRecovery(node.signature);
          if (match) {
            node.element = match;
            node.original = match.getAttribute("style") || ""; // refresh inline base cache
            structureChanged = true;
          }
        }
      });

      if (structureChanged && store.mode !== "idle") {
        this.renderOverlays(); // Sync UI bounds
      }
    });
    
    // Watch whole document for radical React DOM flushes
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  attemptNodeRecovery(signature) {
     // A brute force structural scan for exact fingerprint matches.
     // In ultra-heavy DOMs this can be optimized with scoped path traversals.
     const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
     while(walker.nextNode()) {
        const el = walker.currentNode;
        if (el.id === 'devlens-host') continue; // Avoid our UI
        if (getNodeSignature(el) === signature) {
           return el;
        }
     }
     return null;
  }

  onMouseMove(e) {
    if (store.mode !== "inspect") return;
    if (e.target.closest && e.target.closest('#devlens-host')) return;

    this.drawHoverBox(e.target);
  }

  onClick(e) {
    if (store.mode !== "inspect" && store.mode !== "edit") return;
    if (e.target.closest && e.target.closest('#devlens-host')) return;

    e.preventDefault();
    e.stopPropagation();

    let id = this.getIdForNode(e.target);
    if (!id) id = registerNode(e.target);

    if (e.shiftKey) {
       // Push if unique to Multi-select
       if (!store.selection.includes(id)) {
          store.selection.push(id);
       }
    } else {
       // Replace selection
       store.selection = [id];
       store.primary = id;
    }

    // Entering editing state locks visual selection until user Escapes to inspect mode explicitly
    store.mode = "edit"; 
    
    // Flush UI hover cache as we are now editing
    if (this.hoverOverlay) { this.hoverOverlay.style.display = 'none'; }
    
    // Broadcast Interaction
    eventBus.emit("selection:change", { selection: store.selection, primary: store.primary });
    
    this.renderOverlays();
    
    // Signal CodeGen Layer Pipeline Preparation on newly selected scope
    buildExportIR(store.selection);
    
    // Show UI Sidebar via the UI class (assuming uiInstance handles the eventBus or method call)
    if (this.ui.showStylePanel) this.ui.showStylePanel();
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      this.toggle(false);
      if (this.ui?.updateRipperState) this.ui.updateRipperState(false);
      return;
    }

    if (store.mode !== "inspect" && store.mode !== "edit") return;
    if (!store.primary) return;

    const node = store.nodes.get(store.primary);
    if (!node || !document.contains(node.element)) return;

    let targetEl = null;
    const el = node.element;

    // Full DOM Hierarchy Traversal
    if (e.key === 'ArrowUp') targetEl = el.parentElement;
    if (e.key === 'ArrowDown') targetEl = el.firstElementChild;
    if (e.key === 'ArrowRight') targetEl = el.nextElementSibling;
    if (e.key === 'ArrowLeft') targetEl = el.previousElementSibling;

    if (targetEl && targetEl.tagName !== 'BODY' && targetEl.tagName !== 'HTML') {
      e.preventDefault();
      
      let id = this.getIdForNode(targetEl);
      if (!id) id = registerNode(targetEl);

      store.selection = [id];
      store.primary = id;
      
      eventBus.emit("selection:change", { selection: store.selection, primary: store.primary });
      this.renderOverlays();
      buildExportIR(store.selection);
    }
  }

  getIdForNode(el) {
     for (const [id, node] of store.nodes.entries()) {
        if (node.element === el) return id;
     }
     return null;
  }

  drawHoverBox(el) {
    if (!this.hoverOverlay) {
       this.hoverOverlay = document.createElement('div');
       this.hoverOverlay.style.position = 'fixed';
       this.hoverOverlay.style.pointerEvents = 'none';
       this.hoverOverlay.style.zIndex = 2147483646; // Directly under active selection overlays
       this.hoverOverlay.style.border = '1px dashed #61dafb'; // React Blue
       document.body.appendChild(this.hoverOverlay);
    }

    const rect = el.getBoundingClientRect();
    
    // Viewport Optimization: skip paints for off-screen hovers
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
       this.hoverOverlay.style.display = 'none';
       return;
    }

    this.hoverOverlay.style.display = 'block';
    this.hoverOverlay.style.left = rect.left + 'px';
    this.hoverOverlay.style.top = rect.top + 'px';
    this.hoverOverlay.style.width = rect.width + 'px';
    this.hoverOverlay.style.height = rect.height + 'px';
  }

  renderOverlays() {
    this.clearOverlays(false); // Retain hover cache but clear specific node selection boxes

    store.selection.forEach(id => {
       const node = store.nodes.get(id);
       if (!node || !document.contains(node.element)) return;

       const rect = node.element.getBoundingClientRect();
       
       // Viewport Optimization: skip painting deeply nested scrolling selection boxes
       if (rect.bottom < 0 || rect.top > window.innerHeight) return;

       const div = document.createElement('div');
       div.style.position = 'fixed';
       div.style.pointerEvents = 'none';
       div.style.zIndex = 2147483647; 
       
       // Base visual style
       div.style.border = '2px solid #ff79c6';
       div.style.background = 'rgba(255, 121, 198, 0.1)';
       div.style.left = rect.left + 'px';
       div.style.top = rect.top + 'px';
       div.style.width = rect.width + 'px';
       div.style.height = rect.height + 'px';
       
       // Emphasize the primary anchor node dynamically chosen during multi-select
       if (id === store.primary) {
          div.style.border = '3px solid #ff79c6';
          div.style.boxShadow = '0 0 10px rgba(255,121,198,0.4)';
       }

       document.body.appendChild(div);
       this.overlays.push(div);
    });
  }

  clearOverlays(destroyHover = true) {
    this.overlays.forEach(el => el.remove());
    this.overlays = [];
    
    if (destroyHover && this.hoverOverlay) {
       this.hoverOverlay.remove();
       this.hoverOverlay = null;
    }
  }
}
