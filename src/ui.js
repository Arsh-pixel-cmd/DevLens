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

    // Debounce UI inputs sending requests to the core engine (RAF)
    this.debouncedUpdate = debounce(this.handleStyleChange.bind(this), 16);
  }

  render() {
    this.root.innerHTML = `
      <div class="devlens-container figma-sidebar">
        <div class="devlens-header">
          <span class="devlens-title">DevLens Engine <span class="badge">PRO</span></span>
          <div class="actions-right">
             <button class="devlens-btn-icon" id="min-btn">_</button>
             <button class="devlens-btn-icon" id="close-btn">✕</button>
          </div>
        </div>

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
                <label class="section-title" style="display:block; margin-bottom:6px; color:#a6e22e;">✨ AI Refinement Firewall</label>
                <div style="font-size:10px; color:#aaa; margin-bottom:12px; line-height:1.4;">Insert an OpenAI Key to securely unlock contextual naming and logic refinement. Keys are vaulted strictly natively.</div>
                <div style="display:flex; gap:8px;">
                   <input type="password" id="ai-key" class="prop-input" placeholder="sk-proj-..." style="flex:1; padding:8px;">
                   <button class="btn-primary" id="save-key" style="width:auto; padding:8px 16px;">Vault</button>
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
    eventBus.on("style:update", () => this.syncPanelToSelection());
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
     `;
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

    // Key Management
    const saveKeyBtn = this.root.querySelector('#save-key');
    const inputKey = this.root.querySelector('#ai-key');
    if (saveKeyBtn) {
       chrome.storage.local.get(['openai_key'], (res) => {
          if (res.openai_key) inputKey.value = "********";
       });
       saveKeyBtn.addEventListener('click', () => {
          if (inputKey.value && inputKey.value !== "********") {
             chrome.storage.local.set({ openai_key: inputKey.value });
             this.showToast('API Key Secured Natively');
             inputKey.value = "********";
          }
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

         compileBtn.textContent = 'Compiling AST...';
         const mode = this.root.querySelector('#codegen-mode').value;

         // Phase 1: Natively generate the pure NodeIR mapped Tree
         const rootNodeId = store.selection[0];
         buildExportIR([rootNodeId]); 
         
         // Phase 2: Execute Strict Prop Extraction over the AST
         const extractor = new PropExtractor(exportIR);
         extractor.execute();
         
         // Phase 3: Enforce Component Extraction (0.85% Similarities)
         const componentDetector = new ComponentDetector(exportIR);
         componentDetector.detectPatterns();

         // Phase 4: Deterministic Fallback Generation
         const generator = new ReactGenerator(exportIR, componentDetector.components);
         let code = generator.generate(rootNodeId, mode);
         const score = generator.getVerificationScore();

         // Phase 5: Gated AI Validation Path
         let aiMode = "Deterministic";
         if (mode === "abstract") {
             compileBtn.textContent = 'Refining via AI...';
             const stored = await new Promise(r => chrome.storage.local.get(['openai_key'], r));
             if (stored.openai_key) {
                const refiner = new AIRefiner(stored.openai_key);
                const aiResult = await refiner.refine(code, exportIR, score);
                code = aiResult.code;
                aiMode = aiResult.mode;
             }
         }

         this.root.querySelector('.code-export').value = code;
         
         const confBadge = this.root.querySelector('#ai-confidence');
         confBadge.innerHTML = `Conf: ${score} <span style="color:#aaa; font-size:9px;">[${aiMode}]</span>`;
         confBadge.style.color = score > 0.8 ? '#a6e22e' : '#ff5555';
         
         compileBtn.textContent = 'Compile Selection';
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
