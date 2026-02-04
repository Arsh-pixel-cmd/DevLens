// src/ui.js
import { copyToClipboard } from './clipboard.js';

export class DevLensUI {
  constructor(root, techData, scanner) {
    this.root = root;
    this.techData = techData;
    this.scanner = scanner;
    this.designData = { colors: [], fonts: [] };
    this.activeTab = 'tech';
  }

  render() {
    this.root.innerHTML = `
      <div class="devlens-container">
        <div class="devlens-header">
          <span class="devlens-title">DevLens Ultra</span>
          <div class="actions-right">
             <button class="devlens-btn-icon" id="min-btn">_</button>
             <button class="devlens-btn-icon" id="close-btn">✕</button>
          </div>
        </div>

        <div class="scan-progress"><div class="scan-bar"></div></div>
        
        <div class="devlens-tabs">
          <div class="devlens-tab active" data-tab="tech">Tech</div>
          <div class="devlens-tab" data-tab="design">Design</div>
          <div class="devlens-tab" data-tab="tools">Tools</div>
          <div class="devlens-tab" data-tab="export">Export</div>
        </div>

        <div class="devlens-content">
          <div id="panel-tech" class="devlens-panel active">
             ${this.renderTechTab()}
          </div>
          <div id="panel-design" class="devlens-panel">
             ${this.renderDesignTab()}
          </div>
          <div id="panel-tools" class="devlens-panel">
             ${this.renderToolsTab()}
          </div>
           <div id="panel-export" class="devlens-panel">
             ${this.renderExportTab()}
          </div>
        </div>
        
        <div class="toast" id="toast">Copied!</div>
      </div>
    `;

    this.attachEvents();

    // Zero-Config Quick Scan (500px scroll)
    this.runQuickScan();
  }

  runQuickScan() {
    // Small delay to allow UI to settle
    setTimeout(() => {
      this.scanner.startActiveScan(
        () => { },
        (results) => {
          this.designData = results.design;
          // Don't auto-switch tabs, just update data
          console.log('Quick scan complete');
        },
        true // isQuickScan mode (only 500px)
      );
    }, 500);
  }

  setRipper(ripper) {
    this.ripper = ripper;
  }

  addDetectedApi(name) {
    if (!this.apis) this.apis = new Set();
    if (!this.apis.has(name)) {
      this.apis.add(name);
      this.updateTechTab();
    }
  }

  updateRipperState(active) {
    const btn = this.root.querySelector('#toggle-ripper');
    if (btn) {
      btn.textContent = active ? 'Exit Inspector' : 'Inspect Component';
      btn.classList.toggle('active', active);
    }
  }

  showGeneratedCode(code) {
    // Switch to export tab and show code
    this.root.querySelector('[data-tab="export"]').click();
    const area = this.root.querySelector('.code-export');
    if (area) area.value = code;
    const title = this.root.querySelector('.section-title.export-title');
    if (title) title.textContent = 'Extracted Component';
  }

  updateTechTab() {
    const el = this.root.querySelector('#panel-tech');
    if (el && el.classList.contains('active')) {
      el.innerHTML = this.renderTechTab();

      // Re-attach start scan
      const scanBtn = this.root.querySelector('#start-scan');
      if (scanBtn) {
        scanBtn.addEventListener('click', () => this.handleScan(scanBtn));
      }
    }
  }

  handleScan(scanBtn) {
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning...';
    this.root.querySelector('.scan-progress').classList.add('active');

    this.scanner.startActiveScan(
      (progress) => { },
      (results) => {
        this.designData = results.design;
        this.animations = results.animations || [];
        this.updateDesignTabs();

        this.root.querySelector('.scan-progress').classList.remove('active');
        scanBtn.textContent = 'Scan Complete';
        scanBtn.disabled = false;

        if (this.animations.length) this.showToast(`${this.animations.length} animations found`);
      }
    );
  }

  renderTechTab() {
    const categories = ['frameworks', 'cssFrameworks', 'libraries'];
    let html = '';

    // Scan Button
    html += `<button class="btn-primary" id="start-scan">Start Active Scan</button>`;

    // APIs
    if (this.apis && this.apis.size > 0) {
      html += `<div class="section-title" style="margin-top:16px; color:#ff79c6">Backend / APIs</div>
        <div class="card-grid">
          ${Array.from(this.apis).map(api => `
             <div class="tech-badge" style="border-color: rgba(255, 121, 198, 0.4);">
               <span>${api}</span>
             </div>
          `).join('')}
        </div>`;
    }

    categories.forEach(cat => {
      const items = this.techData[cat] || [];
      if (items.length) {
        html += `<div class="section-title">${cat.replace(/([A-Z])/g, ' $1')}</div>`;
        html += `<div class="card-grid">`;
        items.forEach(item => {
          html += `
                <div class="tech-badge">
                   <span>${item.name} ${item.version ? `<small style="opacity:0.6">v${item.version}</small>` : ''}</span>
                   <span class="confidence">${item.confidence}</span>
                </div>`;
        });
        html += `</div>`;
      }
    });

    if (!html.includes('tech-badge')) html += `<p style="opacity:0.5; font-size:12px; margin-top:10px;">Click "Start Active Scan" to detect more.</p>`;

    return html;
  }

  renderDesignTab() {
    if (!this.designData.colors.length) {
      return `<div style="text-align:center; padding:20px; color:#fff; opacity:0.5;">
            No design data.<br>Run "Start Active Scan".
        </div>`;
    }

    const { colors, fonts } = this.designData;

    return `
      <div class="section-title">Colors</div>
      <div class="color-grid">
        ${colors.map(c => `<div class="color-swatch" style="background-color: ${c}" title="${c}" data-copy="${c}"></div>`).join('')}
      </div>

      <div class="section-title">Typography</div>
      <div class="card-grid">
      ${fonts.map(f => `
        <div class="tech-badge" style="display:block">
          <div style="font-family:${f.family}; font-size:14px;">${f.family}</div>
          <div style="font-size:10px; opacity:0.6; margin-top:4px;">
             ${f.weight} • ${f.size}
          </div>
        </div>
      `).join('')}
      </div>
    `;
  }

  renderToolsTab() {
    return `
        <div class="section-title">Component Ripper</div>
        <button class="btn-secondary" id="toggle-ripper" style="width:100%; justify-content:center;">Inspect Component</button>
      
        <div class="section-title">Time Warp & Animations</div>
        <input type="range" min="0.1" max="2" step="0.1" value="1" id="speed-slider">
        <div style="font-size:10px; opacity:0.6; display:flex; justify-content:space-between;">
             <span>0.1x</span><span>1.0x</span><span>2.0x</span>
        </div>
        ${this.renderAnimationList()}

        <div class="section-title">Ghost Overlay</div>
        <input type="file" id="overlay-upload" accept="image/*" style="font-size:12px;">
        
        <div class="section-title">Accessibility</div>
        <button class="btn-secondary" id="toggle-a11y">Toggle High Contrast Check</button>
      `;
  }

  renderAnimationList() {
    if (!this.animations || !this.animations.length) return '';
    return `<div style="margin-top:10px; max-height:100px; overflow-y:auto;">
         ${this.animations.map(a => `
           <div class="tech-badge" style="font-size:10px; padding:6px;">
             <span>${a.type}</span>
             <span style="color:#d8b4fe" class="copy-easing" data-easing="${a.easing}">${a.easing}</span>
           </div>
         `).join('')}
      </div>`;
  }

  renderExportTab() {
    return `
        <div class="section-title export-title">Tailwind Config</div>
        <textarea class="code-export" style="width:100%; height:150px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:#a6e22e; font-family:monospace; font-size:11px; padding:8px;" readonly>${this.generateTailwindConfig()}</textarea>
        <button class="btn-primary" id="copy-config">Copy Code</button>
       `;
  }

  generateTailwindConfig() {
    // Basic generation
    return `// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
         /* ... detected colors ... */
      }
    }
  }
}`;
  }

  showToast(msg) {
    const toast = this.root.querySelector('#toast');
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
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

    // Actions
    this.root.querySelector('#close-btn').addEventListener('click', () => {
      this.root.dispatchEvent(new CustomEvent('close-devlens', { bubbles: true }));
    });

    // Start Scan
    const scanBtn = this.root.querySelector('#start-scan');
    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning...';
        this.root.querySelector('.scan-progress').classList.add('active');

        await this.scanner.startActiveScan(
          (progress) => { /* Update bar if we had width control */ },
          (results) => {
            this.designData = results.design;
            this.updateDesignTabs();
            this.root.querySelector('.scan-progress').classList.remove('active');
            scanBtn.textContent = 'Scan Complete';
            scanBtn.disabled = false;
            // Switch to design tab
            this.root.querySelector('[data-tab="design"]').click();
          }
        );
      });
    }

    // Tools - Speed
    const speedSlider = this.root.querySelector('#speed-slider');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        this.scanner.setPlaybackRate(parseFloat(e.target.value));
      });
    }

    // Tools - A11y
    const a11yBtn = this.root.querySelector('#toggle-a11y');
    if (a11yBtn) {
      let active = false;
      a11yBtn.addEventListener('click', () => {
        active = !active;
        this.scanner.toggleA11yHeatmap(active);
        a11yBtn.style.background = active ? 'rgba(97, 218, 251, 0.3)' : '';
      });
    }

    // Copy Colors
    this.root.addEventListener('click', (e) => {
      if (e.target.classList.contains('color-swatch')) {
        const color = e.target.getAttribute('data-copy');
        copyToClipboard(color).then(() => this.showToast(`Copied ${color}`));
      }

      // Copy Easing
      if (e.target.classList.contains('copy-easing')) {
        const easing = e.target.getAttribute('data-easing');
        copyToClipboard(easing).then(() => this.showToast('Copied Easing!'));
      }
      if (e.target.id === 'copy-config') {
        const code = this.root.querySelector('.code-export').value;
        copyToClipboard(code).then(() => this.showToast('Copied Code!'));
      }
    });

    // Ripper
    const ripperBtn = this.root.querySelector('#toggle-ripper');
    if (ripperBtn) {
      ripperBtn.addEventListener('click', () => {
        const isActive = ripperBtn.classList.contains('active');
        if (this.ripper) {
          this.ripper.toggle(!isActive);
          this.updateRipperState(!isActive);
        }
      });
    }

    // Ghost Overlay Upload
    const upload = this.root.querySelector('#overlay-upload');
    if (upload) {
      upload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            this.createGhostOverlay(evt.target.result);
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }

  createGhostOverlay(url) {
    const img = document.createElement('img');
    img.src = url;
    img.style.position = 'fixed';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100vw'; // full width
    img.style.opacity = '0.5';
    img.style.pointerEvents = 'none'; // click through
    img.style.zIndex = 2147483645;
    img.id = 'devlens-ghost';
    document.body.appendChild(img);
    this.showToast('Overlay Loaded (50% Opacity)');
  }

  updateDesignTabs() {
    this.root.querySelector('#panel-design').innerHTML = this.renderDesignTab();
    this.root.querySelector('#panel-export').innerHTML = this.renderExportTab();
  }
}
