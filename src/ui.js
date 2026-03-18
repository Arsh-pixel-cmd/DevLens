// src/ui.js
import { store } from './store.js';
import { eventBus } from './eventBus.js';
import { updateStyle, batchUpdateStyles, getMultiStyle, revertNode } from './styleEngine.js';
import { buildExportIR, exportIR } from './irBuilder.js';
import { ComponentRipper } from './ripper.js';
import { ComponentDetector } from './componentDetector.js';
import { ReactGenerator } from './codegen/reactGenerator.js';
import { copyToClipboard } from './clipboard.js';

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export class DevLensUI {
  constructor(root, techData, scanner) {
    this.root = root;
    this.techData = techData;
    this.scanner = scanner;
    
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
          <div class="devlens-tab" data-tab="tech">Tech</div>
          <div class="devlens-tab active" data-tab="design">Properties</div>
          <div class="devlens-tab" data-tab="export">Codegen</div>
        </div>

        <div class="devlens-content">
          <div id="panel-tech" class="devlens-panel">
             ${this.renderTechTab()}
          </div>
          
          <div id="panel-design" class="devlens-panel active">
             <!-- Live Style Panel Injected Here -->
             <div class="empty-selection-state">
                <button class="btn-primary" id="toggle-ripper">Select Element</button>
                <p>Click an element on the page to inspect and edit.</p>
             </div>
          </div>
          
           <div id="panel-export" class="devlens-panel">
             <div class="section-title">Generative Output</div>
             <button class="btn-secondary" id="compile-code">Compile Selected to React</button>
             <textarea class="code-export" readonly placeholder="JSX will appear here..."></textarea>
             <div style="display:flex; gap:8px; margin-top:8px;">
               <button class="btn-primary" id="copy-code">Copy JSX</button>
               <span class="confidence-badge" id="ai-confidence"></span>
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

    // Initialize State Mappings
    this.syncPanelToSelection();
  }

  syncPanelToSelection() {
    const designPanel = this.root.querySelector('#panel-design');
    if (!designPanel) return;

    if (store.selection.length === 0) {
      designPanel.innerHTML = `
        <div class="empty-selection-state">
           <button class="btn-primary" id="toggle-ripper">${store.mode === "inspect" ? "Stop Inspecting" : "Select Element"}</button>
           <p>${store.mode === "inspect" ? "Hover to highlight, Click to select." : "No elements selected."}</p>
        </div>
      `;
      const btn = designPanel.querySelector('#toggle-ripper');
      if (btn) btn.addEventListener('click', () => this.ripper.toggle(store.mode !== "inspect"));
      return;
    }

    // A node is selected, render the Figma sidebar controls
    designPanel.innerHTML = this.renderPropertiesSidebar();
    this.attachPropertiesEvents(designPanel);
  }

  renderPropertiesSidebar() {
    // Multi-Select Resolvers
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
        <div class="section-title">Layout</div>
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
        <div class="section-title">Spacing</div>
        <div class="prop-grid">
          <div><label>Padding</label><input type="text" data-prop="padding" class="prop-input" value="${formatMix(getVal('padding'))}"></div>
          <div><label>Margin</label><input type="text" data-prop="margin" class="prop-input" value="${formatMix(getVal('margin'))}"></div>
          <div><label>Gap</label><input type="text" data-prop="gap" class="prop-input" value="${formatMix(getVal('gap'))}"></div>
          <div><label>Radius</label><input type="text" data-prop="borderRadius" class="prop-input" value="${formatMix(getVal('borderRadius'))}"></div>
        </div>
      </div>

      <div class="prop-section">
        <div class="section-title">Colors</div>
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
         // Pass to Debounced Style Engine caller
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
       // Multi-select Batch track for proper undo history blocks later
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

    // Codegen Compilation Hook
    const compileBtn = this.root.querySelector('#compile-code');
    if (compileBtn) {
      compileBtn.addEventListener('click', () => {
         if (store.selection.length === 0) {
           this.showToast('Please select an element first.');
           return;
         }

         // Step 1: Force deep IR sync for export
         buildExportIR(store.selection);

         // Step 2: Component Clustering Map
         const detector = new ComponentDetector(exportIR);
         const { components, lists } = detector.detectPatterns();

         // Step 3: Run Deterministic React Generator
         const generator = new ReactGenerator(exportIR, components);
         // Generate code anchored on the Primary Selected Node natively
         const code = generator.generate(store.primary);

         // Render UI
         this.root.querySelector('.code-export').value = code;
         
         const score = generator.getVerificationScore();
         const confBadge = this.root.querySelector('#ai-confidence');
         confBadge.textContent = 'Confidence: ' + score;
         confBadge.style.color = score > 0.8 ? '#a6e22e' : '#ff5555';
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

  renderTechTab() {
    return `<div style="padding: 10px; color:#aaa; font-size:12px;">Tech Radar currently disabled while running inside NextGen codegen UI.</div>`;
  }

  updateRipperState(active) {
    const btn = this.root.querySelector('#toggle-ripper');
    if (btn) {
      btn.textContent = active ? 'Stop Inspecting' : 'Select Element';
      btn.classList.toggle('active', active);
    }
  }

  showToast(msg) {
    const toast = this.root.querySelector('#toast');
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
  }
}
