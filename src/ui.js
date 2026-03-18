// src/ui.js
import { store } from './store.js';
import { eventBus } from './eventBus.js';
import { updateStyle, batchUpdateStyles, getMultiStyle, revertNode } from './styleEngine.js';
import { ComponentRipper } from './ripper.js';
import { ComponentDetector } from './componentDetector.js';
import { detectLayoutIntent } from './layoutInspector.js';
import { ReactGenerator } from './codegen/reactGenerator.js';
import { AIRefiner } from './codegen/aiRefiner.js';
import { PropExtractor } from './propExtractor.js';
import { buildExportIR, exportIR } from './irBuilder.js';
import { copyToClipboard } from './clipboard.js';
import { buildSnapshot } from './snapshotBuilder.js';

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export class DevLensUI {
  constructor(root, techData, scanner, dataInspector) {
    this.root = root;
    this.techData = techData;
    this.scanner = scanner;
    this.dataInspector = dataInspector;
    
    // Instantiate our new State-Driven Ripper
    this.ripper = new ComponentRipper(this);

    // Initialize System 4 Worker Pipeline
    this.workerPromise = this.initWorker();

    // Debounce UI inputs sending requests to the core engine (RAF)
    this.debouncedUpdate = debounce(this.handleStyleChange.bind(this), 16);
    this.debouncedSyncCode = debounce(this.handleCodeSync.bind(this), 300);
    
    // Sync Guards
    this.isSyncing = false;
  }

  async initWorker() {
    try {
      // 1. Global Heuristic: Check if the site appears to have a strict CSP that blocks workers
      // We look for CSP meta tags or the presence of nonces (a sign of high security)
      const hasStrictCSP = () => {
        const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if (meta && (meta.content.includes('worker-src') || meta.content.includes('script-src'))) return true;
        if (document.querySelector('script[nonce]')) return true;
        // Common high-security domains as fallback
        const host = window.location.hostname;
        if (host.includes('stripe.com') || host.includes('paypal.com') || host.includes('github.com')) return true;
        return false;
      };

      if (hasStrictCSP()) {
        this.worker = null;
        console.log("[DevLens] Strict CSP detected. Standardizing on Main-Thread Engine (Zero-Noise Mode).");
        return false;
      }

      // 2. Capability Probe: Attempt to initialize a lightweight worker
      let probe;
      try {
        const probeBlob = new Blob([''], { type: 'application/javascript' });
        const probeUrl = URL.createObjectURL(probeBlob);
        probe = new Worker(probeUrl);
        probe.terminate();
        URL.revokeObjectURL(probeUrl);
      } catch (e) {
        this.worker = null;
        return false;
      }

      const workerUrl = chrome.runtime.getURL('src/workers/scanner.worker.js');
      const response = await fetch(workerUrl);
      const code = await response.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
      console.log("[DevLens] Background Scanner Worker Initialized.");
      return true;
    } catch (err) {
      this.worker = null;
      if (store.debug) console.warn("[DevLens] Global worker init failed:", err);
      return false;
    }
  }

  handleWorkerMessage(data) {
    const { type, jobId, data: result, error } = data;

    if (jobId !== store.currentJobId) return; // Ignore stale jobs

    if (type === 'ERROR') {
      console.error("[DevLens Worker Error]", error);
      this.showToast("Worker Processing Failed. Fallback active.");
      return;
    }

    if (type === 'IR_COMPLETE') {
      this.onIRComplete(result);
    }
  }

  render() {
    this.root.innerHTML = `
      <div class="devlens-container figma-sidebar">
        <div class="devlens-header">
          <div class="header-left">
            <span class="devlens-title">DevLens Engine <span class="badge">PRO</span></span>
            <a href="https://github.com/Arsh-pixel-cmd/DevLens" target="_blank" class="github-star-link">⭐ Star</a>
          </div>
          <div class="actions-right">
             <button class="devlens-btn-icon" id="debug-btn" title="Toggle Debug Mode">🐞</button>
             <button class="devlens-btn-icon" id="min-btn">_</button>
             <button class="devlens-btn-icon" id="close-btn">✕</button>
          </div>
        </div>

        <div class="minimized-shortcut">D</div>

        <div class="devlens-tabs">
          <div class="devlens-tab active" data-tab="intelligence">Insights</div>
          <div class="devlens-tab" data-tab="design">Properties</div>
          <div class="devlens-tab" data-tab="export">Codegen</div>
        </div>

        <div class="devlens-content">
          <div id="panel-intelligence" class="devlens-panel active">
             <div class="empty-selection-state">
                <button class="btn-primary" id="toggle-ripper">Select Element</button>
                <p>Click an element to trace React Fiber data, List components, and deep layout parameters.</p>
             </div>
          </div>
          
          <div id="panel-design" class="devlens-panel">
             <div class="empty-selection-state">
                <button class="btn-primary" id="toggle-ripper">Select Element</button>
                <p>Click an element to see structural limits.</p>
             </div>
          </div>
          
           <div id="panel-export" class="devlens-panel">
             <div class="props-header" style="margin-bottom:16px;">
                 <span class="selection-count">Generation Strategy</span>
             </div>
             
             <div style="margin-bottom:20px;">
               <label class="section-title" style="display:block; margin-bottom:8px;">Compiler Mode</label>
               <select id="codegen-mode" class="prop-input" style="width:100%; padding:8px;">
                  <option value="raw">Mode 1: Raw Tailwind DOM</option>
                  <option value="abstract" selected>Mode 2: Abstract JSX Components</option>
               </select>
             </div>
             
             <div style="margin-bottom:24px; padding:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px;">
                <label class="section-title" style="display:block; margin-bottom:6px; color:#a6e22e;">✨ Universal AI Refinement</label>
                <div style="font-size:10px; color:#aaa; margin-bottom:12px; line-height:1.4;">Select a provider and enter your key to enable AI features.</div>
                
                <div style="display:flex; flex-direction:column; gap:10px;">
                   <select id="ai-provider" class="prop-input" style="width:100%; padding:8px;">
                      <option value="openai">OpenAI (GPT-4o)</option>
                      <option value="groq">Groq (Llama 3.3)</option>
                      <option value="openrouter">OpenRouter (Auto)</option>
                      <option value="custom">Custom / Local (Ollama)</option>
                   </select>

                   <div id="ai-provider-help" style="font-size:10px; color:#61dafb; margin-top:-4px;">
                      <a id="provider-link" href="https://platform.openai.com/api-keys" target="_blank" style="color:inherit; text-decoration:none;">Get OpenAI Key ↗</a>
                   </div>

                   <div id="ai-custom-fields" style="display:none; flex-direction:column; gap:8px;">
                      <input type="text" id="ai-url" class="prop-input" placeholder="Base URL" style="width:100%; padding:8px;">
                      <input type="text" id="ai-model" class="prop-input" placeholder="Model ID" style="width:100%; padding:8px;">
                   </div>
                   
                   <input type="password" id="ai-key" class="prop-input" placeholder="Enter API Key" style="width:100%; padding:8px;">
                   
                   <button class="btn-primary" id="save-key" style="width:100%; padding:8px; margin-top:4px;">Save Configuration</button>
                </div>
             </div>

             <button class="btn-secondary" id="compile-code" style="width:100%; padding:10px; margin-bottom:16px; font-size:13px; font-weight:600;">Compile Selection</button>
             
             <textarea class="code-export" readonly placeholder="Select an element and click Compile to see JSX..."></textarea>
             
             <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
               <span class="confidence-badge" id="ai-confidence" style="flex:1; background:rgba(0,0,0,0.3); justify-content:center; margin-right:8px; border:none; padding:8px; color:#666;">Waiting...</span>
               <button class="btn-primary" id="copy-code" style="width:auto; padding:8px 24px;">Copy JSX</button>
             </div>
          </div>
        </div>
        
        <div class="toast" id="toast">Copied!</div>
      </div>
    `;

    this.attachEvents();
    
    // Global EventBus Subscribers
    eventBus.on("selection:change", () => this.syncPanelToSelection());
    eventBus.on("style:update", (payload) => {
       this.syncPanelToSelection();
       this.handleVisualSync(payload);
    });
    eventBus.on("inspection:start", () => this.showInsightLoadingState());
    eventBus.on("inspection:data_complete", (res) => this.renderInsightFusion(res));

    // Initialize State Mappings
    this.syncPanelToSelection();
  }

  syncPanelToSelection() {
    const designPanel = this.root.querySelector('#panel-design');
    const intelPanel = this.root.querySelector('#panel-intelligence');
    if (!designPanel || !intelPanel) return;

    if (store.selection.length === 0) {
      const emptyHTML = `
        <div class="empty-selection-state">
           <button class="btn-primary" id="toggle-ripper">${store.mode === "inspect" ? "Stop Inspecting" : "Select Element"}</button>
           <p>${store.mode === "inspect" ? "Hover to highlight, Click to select." : "No elements selected."}</p>
        </div>
      `;
      designPanel.innerHTML = emptyHTML;
      intelPanel.innerHTML = emptyHTML;
      
      this.root.querySelectorAll('#toggle-ripper').forEach(btn => {
         btn.addEventListener('click', () => this.ripper.toggle(store.mode !== "inspect"));
      });
      return;
    }

    // A node is selected, render the Figma sidebar controls
    designPanel.innerHTML = this.renderPropertiesSidebar();
    this.attachPropertiesEvents(designPanel);

    // Trigger Async Data Extraction Pipeline for Insights Tab if single select
    if (store.selection.length === 1 && this.dataInspector) {
        this.dataInspector.runInspection(store.selection[0]);
    } else {
        intelPanel.innerHTML = `<div class="empty-selection-state"><p>Insight Fusion runs exclusively on single element selections.</p></div>`;
    }
  }

  showInsightLoadingState() {
     const panel = this.root.querySelector('#panel-intelligence');
     if (!panel) return;
     panel.innerHTML = `
       <div class="empty-selection-state">
          <p>⚙️ Hooking Framework Runtime...</p>
       </div>
     `;
  }

  renderInsightFusion(dataResult) {
     const panel = this.root.querySelector('#panel-intelligence');
     if (!panel || store.selection.length === 0) return;

     const node = store.nodes.get(store.selection[0]);
     if (!node) return;

     // 1. O(1) Component Lookup
     const instances = ComponentDetector.getGlobalMatchCount(node.element);
     const reuseText = instances > 1 
       ? `<span style="color:#a6e22e">Reusable Component (${instances} instances)</span>` 
       : `Isolated Node (1 instance)`;

     // 2. Layout Intent Extraction
     const layout = detectLayoutIntent(node);

     // 3. Data Awareness Visualization
     let dataBlock = `<div style="color:#888; font-size:12px; padding:12px; border:1px dashed rgba(255,255,255,0.1); border-radius:6px; text-align:center;">No Framework Context Found</div>`;
     if (dataResult.fiber && !dataResult.fiber.error && dataResult.fiber.componentName) {
         dataBlock = `
           <div style="background:rgba(97,218,251,0.05); border:1px solid rgba(97,218,251,0.2); padding:12px; border-radius:6px;">
              <strong style="color:#61dafb; display:block; margin-bottom:6px;">React Fiber ⚛️</strong>
              <span style="font-size:12px; color:#ddd;">Component: <code style="color:#fff;">&lt;${dataResult.fiber.componentName} /&gt;</code></span>
              <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.3); border-radius:4px; max-height:120px; overflow:auto;">
                 <pre style="font-size:10px; color:#a6e22e; margin:0;">${JSON.stringify(dataResult.fiber.props || {}, null, 2)}</pre>
              </div>
           </div>
         `;
     } else if (dataResult.nextData) {
         dataBlock = `
           <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); padding:12px; border-radius:6px;">
              <strong style="display:block; margin-bottom:6px;">Next.js __NEXT_DATA__ 🚀</strong>
              <code style="font-size:11px; color:#a6e22e; display:block; margin-bottom:8px;">${dataResult.nextData.value}</code>
              <div style="font-size:10px; color:#aaa; margin-bottom:4px;">Path: ${dataResult.nextData.path}</div>
              <div style="font-size:10px; color:#aaa;">Confidence: <span style="color:#61dafb;">${(dataResult.nextData.confidence * 100).toFixed(0)}%</span></div>
           </div>
         `;
     }

     panel.innerHTML = `
        <div class="props-header" style="margin-bottom:16px;">
           <span class="selection-count">Context-Aware Fusion</span>
        </div>
        
        <div class="prop-section" style="margin-bottom:24px;">
          <div class="section-title" style="margin-bottom:10px;">Component Intelligence</div>
          <div style="font-size:12px; padding:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px;">${reuseText}</div>
        </div>

        <div class="prop-section" style="margin-bottom:24px;">
          <div class="section-title" style="margin-bottom:10px; display:flex; justify-content:space-between;">
             <span>Layout Telemetry</span>
             <span style="color:#61dafb;">Conf: ${(layout.confidence * 100).toFixed(0)}%</span>
          </div>
          <div style="font-size:12px; padding:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px; line-height:1.6;">
            <div style="display:flex; justify-content:space-between;"><span style="color:#888;">System</span> <span style="font-weight:600;">${layout.type.toUpperCase()}</span></div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;"><span style="color:#888;">Logic</span> <span>${layout.alignment || 'Static Flow'}</span></div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;"><span style="color:#888;">Scale</span> <span style="color:#ff79c6;">${layout.spacingScale}</span></div>
          </div>
        </div>

        <div class="prop-section">
          <div class="section-title" style="margin-bottom:10px;">Data Binding Layer</div>
          ${dataBlock}
        </div>

        <div class="prop-section" style="margin-top:24px; display:flex; flex-wrap:wrap; gap:8px;">
           <button class="btn-secondary" id="make-comp-btn" style="flex:1; min-width:80px; font-size:11px;">🧩 Component</button>
           <button class="btn-secondary" id="clone-btn" style="flex:1; min-width:80px; font-size:11px;">👯 Clone</button>
           <button class="btn-secondary" id="ai-explain-btn" style="flex:1; min-width:80px; font-size:11px;">🧠 AI Explain</button>
        </div>
     `;

     // Attach Killer Feature Listeners
     const makeBtn = panel.querySelector('#make-comp-btn');
     if (makeBtn) {
        makeBtn.onclick = () => this.handleMakeComponent(store.selection[0]);
     }

     const explainBtn = panel.querySelector('#ai-explain-btn');
     if (explainBtn) {
        explainBtn.onclick = () => this.handleAIExplain(store.selection[0]);
     }

     const cloneBtn = panel.querySelector('#clone-btn');
     if (cloneBtn) {
        cloneBtn.onclick = () => this.handleClone(store.selection[0]);
     }
  }

  handleClone(nodeId) {
     const node = store.nodes.get(nodeId);
     if (!node || !node.element) return;
     
     const clone = node.element.cloneNode(true);
     node.element.parentNode.insertBefore(clone, node.element.nextSibling);
     
     this.showToast("Section Cloned Successfully!");
     // Re-trigger ripper to pick up new node if selected
  }

  async handleMakeComponent(nodeId) {
     if (!nodeId) return;
     this.showToast("Expanding Boundaries...");
     
     // 1. Snapshot and prime IR
     buildExportIR([nodeId]);
     const detector = new ComponentDetector(exportIR);
     
     // 2. Expand Boundary (Mandatory Fix)
     const expandedId = detector.expandBoundary(nodeId);
     const node = exportIR.get(expandedId);
     
     if (node) {
        detector.addManualSignature(node.structuralFingerprint);
        this.showToast(`🧩 Created <${node.tag} /> Component`);
        
        // Switch to Export tab and trigger compilation
        this.root.querySelector('[data-tab="export"]').click();
        this.root.querySelector('#compile-code').click();
     }
  }

  async handleAIExplain(nodeId) {
     if (!nodeId) return;
     const panel = this.root.querySelector('#panel-intelligence');
     const explainBtn = panel.querySelector('#ai-explain-btn');
     
     explainBtn.textContent = "🧠 Thinking...";
     explainBtn.disabled = true;

     try {
        // Ensure exportIR is primed for this node (Mandatory Fix for "IR not primed" error)
        if (!exportIR.has(nodeId)) {
           buildExportIR([nodeId]);
        }

        const node = exportIR.get(nodeId);
        if (!node) throw new Error("Failed to extract element metadata.");

        const stored = await new Promise(r => chrome.storage.local.get(['ai_key', 'ai_url', 'ai_model'], r));
        
        if (!stored.ai_key || stored.ai_key === 'mock-local-key') {
           this.root.querySelector('[data-tab="export"]').click();
           throw new Error("API Key Missing. Please enter your key in the Codegen tab.");
        }

        const refiner = new AIRefiner(stored.ai_key, stored.ai_url, stored.ai_model);
        
        const prompt = `Explain this UI element's layout and logic in 3 sentences. 
        Focus on structural purpose and performance.
        Tag: ${node.tag}, Layout: ${JSON.stringify(node.layout)}, Semantics: ${node.semantics}.`;

        const response = await refiner.generalQuery(prompt);
        
        if (!response.success) throw new Error(response.error || "AI Query Failed");

        const content = response.explanation || "No explanation generated.";
        this.showAIWindow(`Insight: <${node.tag} />`, content);

     } catch (err) {
        console.error("[DevLens] AI Explain Error:", err);
        this.showToast("AI Explanation failed: " + err.message);
     } finally {
        explainBtn.textContent = "🧠 AI Explain";
        explainBtn.disabled = false;
     }
  }

  showAIWindow(title, content) {
    // Remove existing window if any
    const existing = document.querySelector('.devlens-insight-window');
    if (existing) existing.remove();

    const win = document.createElement('div');
    win.className = 'devlens-insight-window';
    win.innerHTML = `
      <div class="insight-header">
        <div class="insight-title">✨ ${title}</div>
        <div class="insight-controls">
           <button class="insight-btn" id="insight-min" title="Minimize">_</button>
           <button class="insight-btn" id="insight-close" title="Close">✕</button>
        </div>
      </div>
      <div class="insight-content">
        ${content}
      </div>
    `;

    const hostRoot = this.root.getRootNode();
    if (hostRoot) {
       hostRoot.appendChild(win);
    } else {
       document.body.appendChild(win); // Fallback
    }

    // Controls
    win.querySelector('#insight-close').onclick = () => win.remove();
    win.querySelector('#insight-min').onclick = () => win.classList.toggle('minimized');

    // Drag Logic
    this.makeDraggable(win, win.querySelector('.insight-header'));
  }

  makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.bottom = 'auto'; // Break initial bottom-right binds if any
      el.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  renderPropertiesSidebar() {
    const getVal = (prop) => getMultiStyle(store.selection, prop) || '';
    const formatMix = (val) => val === 'MIXED' ? '—' : val;

    return `
      <div class="props-header">
         <span class="selection-count">${store.selection.length} Selected</span>
         <div class="props-actions">
           <button class="btn-icon" id="btn-revert" title="Revert Changes">↺ Revert</button>
         </div>
      </div>

      <div class="prop-section">
        <div class="section-title">Layout Override</div>
        <div class="prop-row">
          <label>Display</label>
          <select data-prop="display" class="prop-input">
             <option value="" disabled selected hidden>${formatMix(getVal('display'))}</option>
             <option value="flex">flex</option>
             <option value="grid">grid</option>
             <option value="block">block</option>
             <option value="inline-block">inline-block</option>
             <option value="none">none</option>
          </select>
        </div>
        <div class="prop-row">
          <label>Flex Dir</label>
          <select data-prop="flexDirection" class="prop-input">
             <option value="" disabled selected hidden>${formatMix(getVal('flexDirection'))}</option>
             <option value="row">row</option>
             <option value="column">column</option>
          </select>
        </div>
        <div class="prop-row">
          <label>Justify</label>
          <select data-prop="justifyContent" class="prop-input">
             <option value="" disabled selected hidden>${formatMix(getVal('justifyContent'))}</option>
             <option value="center">center</option>
             <option value="space-between">space-between</option>
             <option value="flex-start">start</option>
             <option value="flex-end">end</option>
          </select>
        </div>
      </div>

      <div class="prop-section">
        <div class="section-title" style="margin-bottom:12px;">Spacing</div>
        <div class="prop-grid">
          <div><label>Padding</label><input type="text" data-prop="padding" class="prop-input" value="${formatMix(getVal('padding'))}"></div>
          <div><label>Margin</label><input type="text" data-prop="margin" class="prop-input" value="${formatMix(getVal('margin'))}"></div>
          <div><label>Gap</label><input type="text" data-prop="gap" class="prop-input" value="${formatMix(getVal('gap'))}"></div>
          <div><label>Radius</label><input type="text" data-prop="borderRadius" class="prop-input" value="${formatMix(getVal('borderRadius'))}"></div>
        </div>
      </div>

      <div class="prop-section">
        <div class="section-title" style="margin-bottom:12px;">Colors</div>
        <div class="prop-row">
          <label>Background</label>
          <div class="color-picker-wrap">
             <input type="color" data-prop="backgroundColor" class="prop-color-picker">
             <input type="text" data-prop="backgroundColor" class="prop-input" value="${formatMix(getVal('backgroundColor'))}">
          </div>
        </div>
        <div class="prop-row">
          <label>Text Fill</label>
          <div class="color-picker-wrap">
             <input type="color" data-prop="color" class="prop-color-picker">
             <input type="text" data-prop="color" class="prop-input" value="${formatMix(getVal('color'))}">
          </div>
        </div>
      </div>

      <div class="prop-section">
        <div class="section-title">Typography</div>
        <div class="prop-row">
          <label>Font</label>
          <input type="text" data-prop="fontFamily" class="prop-input" value="${formatMix(getVal('fontFamily'))}">
        </div>
        <div class="prop-grid">
           <div><label>Weight</label><input type="text" data-prop="fontWeight" class="prop-input" value="${formatMix(getVal('fontWeight'))}"></div>
           <div><label>Size</label><input type="text" data-prop="fontSize" class="prop-input" value="${formatMix(getVal('fontSize'))}"></div>
        </div>
      </div>

      <div class="prop-section" id="animation-controls">
        <div class="section-title">Animations</div>
        <div id="animation-list" style="margin-top:8px;">
           <div class="empty-selection-state" style="padding:10px;"><p style="font-size:10px;">No active animations detected.</p></div>
        </div>
      </div>
    `;
  }

  attachPropertiesEvents(panel) {
    const inputs = panel.querySelectorAll('.prop-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
         const prop = e.target.getAttribute('data-prop');
         let val = e.target.value;
         this.debouncedUpdate(prop, val);
      });
    });

    const revertBtn = panel.querySelector('#btn-revert');
    if (revertBtn) {
       revertBtn.addEventListener('click', () => {
          store.selection.forEach(id => revertNode(id));
       });
    }

    this.renderAnimations(panel);
  }

  renderAnimations(panel) {
    const animList = panel.querySelector('#animation-list');
    if (!animList || store.selection.length !== 1) return;

    const node = store.nodes.get(store.selection[0]);
    if (!node || !node.element) return;

    try {
      const animations = node.element.getAnimations ? node.element.getAnimations() : [];
      if (animations.length === 0) return;

      animList.innerHTML = animations.map((anim, i) => {
        const duration = anim.effect?.getComputedTiming().duration || 0;
        const progress = anim.currentTime || 0;
        const easing = anim.effect?.getComputedTiming().easing || 'linear';

        return `
          <div class="animation-item" style="margin-bottom:12px; padding:8px; background:rgba(255,255,255,0.03); border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
             <div style="display:flex; justify-content:space-between; font-size:10px; color:#aaa; margin-bottom:4px;">
                <span>Anim #${i+1}</span>
                <span style="color:#61dafb;">${easing}</span>
             </div>
             <input type="range" class="anim-scrubber" data-index="${i}" min="0" max="${duration}" value="${progress}" style="width:100%;">
             <div style="display:flex; justify-content:space-between; font-size:9px; color:#666; margin-top:4px;">
                <span>0ms</span>
                <span>${duration}ms</span>
             </div>
          </div>
        `;
      }).join('');

      animList.querySelectorAll('.anim-scrubber').forEach(scrubber => {
        scrubber.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.index);
          const animation = animations[idx];
          if (animation) {
             animation.pause();
             animation.currentTime = parseFloat(e.target.value);
          }
        });
      });

    } catch (err) {
      console.warn("[DevLens] Animation control failed safely:", err);
    }
  }

  handleStyleChange(prop, val) {
    if (store.selection.length === 0) return;

    if (store.selection.length === 1) {
       updateStyle(store.selection[0], prop, val); // Fast Track
    } else {
       const changes = store.selection.map(id => ({ nodeId: id, property: prop, value: val }));
       batchUpdateStyles(changes);
    }
  }

  attachEvents() {
    // Tabs
    this.root.querySelectorAll('.devlens-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.root.querySelectorAll('.devlens-tab').forEach(t => t.classList.remove('active'));
        this.root.querySelectorAll('.devlens-panel').forEach(p => p.classList.remove('active'));
        const tabId = e.target.getAttribute('data-tab');
        e.target.classList.add('active');
        this.root.querySelector(`#panel-${tabId}`).classList.add('active');
      });
    });

    // Close
    this.root.querySelector('#close-btn').addEventListener('click', () => {
      this.root.dispatchEvent(new CustomEvent('close-devlens', { bubbles: true }));
    });

    // Minimize
    this.root.querySelector('#min-btn').addEventListener('click', () => {
      this.root.dispatchEvent(new CustomEvent('min-devlens', { bubbles: true }));
    });
    
    // Minimized Shortcut click to restore
    this.root.querySelector('.minimized-shortcut').addEventListener('click', () => {
      this.root.dispatchEvent(new CustomEvent('min-devlens', { bubbles: true }));
    });

    // Debug Mode Toggle
    const debugBtn = this.root.querySelector('#debug-btn');
    if (debugBtn) {
       debugBtn.addEventListener('click', () => {
          store.debug = !store.debug;
          debugBtn.style.opacity = store.debug ? '1' : '0.5';
          debugBtn.style.filter = store.debug ? 'drop-shadow(0 0 5px #a6e22e)' : '';
          this.showToast(`Debug Mode: ${store.debug ? 'ON' : 'OFF'}`);
          if (store.debug) {
            console.log("[DevLens Debug State]", { 
              nodes: store.nodes, 
              mappings: store.mappings, 
              lastUpdate: store.lastUpdateTimestamp 
            });
          }
       });
    }

    // Universal Key Management
    const saveKeyBtn = this.root.querySelector('#save-key');
    const inputKey = this.root.querySelector('#ai-key');
    const inputUrl = this.root.querySelector('#ai-url');
    const inputModel = this.root.querySelector('#ai-model');
    const providerSelect = this.root.querySelector('#ai-provider');
    const customFields = this.root.querySelector('#ai-custom-fields');
    const providerLink = this.root.querySelector('#provider-link');

    const providerConfigs = {
      openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', link: 'https://platform.openai.com/api-keys', name: 'OpenAI' },
      groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', link: 'https://console.groq.com/keys', name: 'Groq' },
      openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'auto', link: 'https://openrouter.ai/keys', name: 'OpenRouter' },
      custom: { url: '', model: '', link: '', name: 'Custom' }
    };

    const updateProviderUI = (provider) => {
      const config = providerConfigs[provider];
      if (provider === 'custom') {
         customFields.style.display = 'flex';
         providerLink.parentElement.style.display = 'none';
      } else {
         customFields.style.display = 'none';
         providerLink.parentElement.style.display = 'block';
         providerLink.href = config.link;
         providerLink.textContent = `Get ${config.name} Key ↗`;
         inputUrl.value = config.url;
         inputModel.value = config.model;
      }
    };

    providerSelect.addEventListener('change', (e) => updateProviderUI(e.target.value));
    
    if (saveKeyBtn) {
       chrome.storage.local.get(['ai_key', 'ai_url', 'ai_model', 'ai_provider'], (res) => {
          if (res.ai_provider) {
             providerSelect.value = res.ai_provider;
             updateProviderUI(res.ai_provider);
          } else {
             updateProviderUI('openai'); // Default
          }
          if (res.ai_key && res.ai_key !== 'mock-local-key') inputKey.value = "********";
          if (res.ai_url) inputUrl.value = res.ai_url;
          if (res.ai_model) inputModel.value = res.ai_model;
       });

       saveKeyBtn.addEventListener('click', () => {
          const provider = providerSelect.value;
          if (inputKey.value && inputKey.value !== "********") {
             chrome.storage.local.set({ ai_key: inputKey.value });
             inputKey.value = "********";
          }
          chrome.storage.local.set({ 
             ai_url: inputUrl.value, 
             ai_model: inputModel.value,
             ai_provider: provider 
          });
          this.showToast('AI Config Saved!');
       });
    }

    // Codegen Compilation Hook
    const compileBtn = this.root.querySelector('#compile-code');
    if (compileBtn) {
      compileBtn.addEventListener('click', async () => {
        if (store.selection.length === 0) {
          this.showToast('Please select an element first.');
          return;
        }

        if (this.isSyncing) return;
        this.isSyncing = true;

        compileBtn.textContent = 'Snapshotting DOM...';

        // Phase 1: Main Thread Snapshotting (Atomic Read)
        const rootEl = store.nodes.get(store.selection[0])?.element;
        if (!rootEl) {
          this.isSyncing = false;
          return;
        }

        // Phase 2: Processing (Worker with Main-Thread Fallback)
        store.currentJobId = crypto.randomUUID();
        this.pendingMode = this.root.querySelector('#codegen-mode').value;
        this.compileBtn = compileBtn;

        // Ensure we know the final status of worker initialization
        await this.workerPromise;

        if (this.worker) {
          compileBtn.textContent = 'Worker Processing...';
          const snapshot = buildSnapshot(rootEl);
          this.worker.postMessage({
            type: 'GENERATE_IR',
            jobId: store.currentJobId,
            payload: { snapshot }
          });
        } else {
          // CSP Fallback: Main Thread Execution
          compileBtn.textContent = 'Main Thread Sync...';
          setTimeout(() => { // Async to prevent UI lockup immediately
            try {
              buildExportIR([store.selection[0]]);
              const result = {
                rootId: store.selection[0],
                nodes: Array.from(exportIR.entries())
              };
              this.onIRComplete(result);
            } catch (err) {
              console.error("[DevLens] Main-thread fallback failed:", err);
              this.showToast("Critial Scan Failure.");
              this.isSyncing = false;
              compileBtn.textContent = 'Compile Selection';
            }
          }, 50);
        }
      });
    }

    const copyBtn = this.root.querySelector('#copy-code');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
         const code = this.root.querySelector('.code-export').value;
         if(code) {
           copyToClipboard(code).then(() => this.showToast('JSX Copied!'));
         }
      });
    }

    // Code Sync Hook
    const codeEditor = this.root.querySelector('.code-export');
    if (codeEditor) {
      codeEditor.removeAttribute('readonly'); // Unlock for bi-directional sync
      codeEditor.addEventListener('input', (e) => {
        this.debouncedSyncCode(e.target.value);
      });
    }
  }

  handleCodeSync(code) {
    if (!code || this.isSyncing) return;
    this.isSyncing = true;
    
    try {
      // System 4: Surgical Extraction Loop
      // We look for [data-dev-id="ID"] followed by className="..." or style={{...}}
      const nodeRegex = /<([a-z0-9]+)\s+[^>]*data-dev-id="([^"]+)"([^>]*)/gi;
      let match;
      
      const timestamp = Date.now();
      store.lastUpdateSource = "CODE";
      store.lastUpdateTimestamp = timestamp;

      while ((match = nodeRegex.exec(code)) !== null) {
        const tag = match[1];
        const nodeId = match[2];
        const propsStr = match[3];

        const node = store.nodes.get(nodeId);
        if (!node || !document.contains(node.element)) continue;

        // 1. Extract className
        const classMatch = /className="([^"]*)"/.exec(propsStr);
        if (classMatch) {
          node.element.setAttribute('class', classMatch[1]);
        }

        // 2. Extract style
        const styleMatch = /style={{([^}]*)}}/.exec(propsStr);
        if (styleMatch) {
          try {
            const rawStyle = styleMatch[1].replace(/'/g, '"');
            const styleObj = JSON.parse(`{${rawStyle}}`);
            Object.assign(node.element.style, styleObj);
          } catch(e) { /* partial style parse fail */ }
        }

        // 3. Extract safe attributes (src, href, alt)
        const attrRegex = /(src|href|alt)="([^"]*)"/gi;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(propsStr)) !== null) {
          node.element.setAttribute(attrMatch[1], attrMatch[2]);
        }
      }

      this.showToast("⚡ UI Synced to Code");

    } catch (err) {
      console.warn("[DevLens] Code Sync Failed:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  handleVisualSync(payload) {
    if (this.isSyncing || !payload.nodeId) return;
    
    const codeEditor = this.root.querySelector('.code-export');
    if (!codeEditor || !codeEditor.value) return;

    this.isSyncing = true;
    try {
      let code = codeEditor.value;
      const nodeId = payload.nodeId;
      const node = store.nodes.get(nodeId);
      if (!node) return;

      // Surgical replacement based on data-dev-id
      // We look for the tag that has this data-dev-id
      const tagRegex = new RegExp(`(<[a-z0-9]+\\s+[^>]*data-dev-id="${nodeId}"[^>]*>)`, 'gi');
      const match = tagRegex.exec(code);

      if (match) {
        let tagContent = match[1];
        const oldTag = tagContent;

        // If it's a className update
        if (payload.property === 'className' || payload.classes) {
          const newClasses = payload.classes || node.element.getAttribute('class') || '';
          if (tagContent.includes('className="')) {
            tagContent = tagContent.replace(/className="[^"]*"/, `className="${newClasses}"`);
          } else {
            tagContent = tagContent.replace(/>$/, ` className="${newClasses}">`).replace(/\/>$/, ` className="${newClasses}" />`);
          }
        } 
        
        // If it's a style update
        else if (payload.property) {
          // For simplicity in the surgical regex, if it's a style update we might want to just update the style prop
          // But since we use Tailwind mostly, simple className updates are the common case.
          // For raw styles:
          if (tagContent.includes('style={{')) {
             // This is harder to surgically replace with regex without a parser, 
             // but we can try to find the specific key.
             const styleKey = payload.property;
             const styleVal = payload.value;
             const keyRegex = new RegExp(`("${styleKey}"|${styleKey}):\\s*"[^"]*"`, 'g');
             if (keyRegex.test(tagContent)) {
               tagContent = tagContent.replace(keyRegex, `"${styleKey}": "${styleVal}"`);
             }
          }
        }

        if (tagContent !== oldTag) {
          code = code.replace(oldTag, tagContent);
          codeEditor.value = code;
        }
      }
    } catch (err) {
      console.warn("[DevLens] Visual Sync Failed:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  async onIRComplete(result) {
    const compileBtn = this.compileBtn;
    const mode = this.pendingMode;

    try {
      compileBtn.textContent = 'Rebuilding Code...';

      // Update the exportIR map with data from the worker
      exportIR.clear();
      result.nodes.forEach(([id, ir]) => {
        exportIR.set(id, ir);
        // Also update store.nodes metadata (without stripping the element reference!)
        const node = store.nodes.get(id);
        if (node) {
          Object.assign(node, ir);
        }
      });

      // Execute Intelligence Pipeline (Still Main Thread for now, but IR is primed)
      const extractor = new PropExtractor(exportIR);
      extractor.execute();
      
      const componentDetector = new ComponentDetector(exportIR);
      componentDetector.detectPatterns();

      const generator = new ReactGenerator(exportIR, componentDetector.components);
      let code = generator.generate(result.rootId, mode);
      const score = generator.getVerificationScore();

      let aiMode = "Deterministic";
      if (mode === "abstract") {
          compileBtn.textContent = 'Refining via AI...';
          const stored = await new Promise(r => chrome.storage.local.get(['ai_key', 'ai_url', 'ai_model'], r));
          
          const useKey = stored.ai_key || 'mock-local-key';
          const useUrl = stored.ai_url || 'https://api.openai.com/v1/chat/completions';
          const useModel = stored.ai_model || 'gpt-4o';
          
          if (useUrl && useModel && useKey !== 'mock-local-key') {
             const refiner = new AIRefiner(useKey, useUrl, useModel);
             const aiResult = await refiner.refine(code, exportIR, score);
             code = aiResult.code;
             aiMode = aiResult.mode;
          } else if (mode === "abstract") {
             this.showToast("AI Refinement skipped: Missing API Key.");
          }
      }

      this.root.querySelector('.code-export').value = code;
      
      const confBadge = this.root.querySelector('#ai-confidence');
      confBadge.innerHTML = `Conf: ${score} <span style="color:#aaa; font-size:9px;">[${aiMode}]</span>`;
      confBadge.style.color = score > 0.8 ? '#a6e22e' : '#ff5555';

    } catch (err) {
      console.error("[DevLens] Codegen Pipeline Failed:", err);
      this.showToast("Codegen Error. Check console.");
    } finally {
      this.isSyncing = false;
      compileBtn.textContent = 'Compile Selection';
    }
  }

  updateRipperState(active) {
    this.root.querySelectorAll('#toggle-ripper').forEach(btn => {
      btn.textContent = active ? 'Stop Inspecting' : 'Select Element';
      btn.classList.toggle('active', active);
    });
  }

  showToast(msg) {
    const toast = this.root.querySelector('#toast');
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
  }
}
