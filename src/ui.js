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

  renderTechTab() {
    const categories = ['frameworks', 'cssFrameworks', 'libraries'];
    let html = '';

    // Scan Button
    html += `<button class="btn-primary" id="start-scan">Start Active Scan</button>`;

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
        <div class="section-title">Time Warp</div>
        <input type="range" min="0.1" max="2" step="0.1" value="1" id="speed-slider">
        <div style="display:flex; justify-content:space-between; font-size:10px; opacity:0.6; margin-top:4px;">
            <span>Slow (0.1x)</span>
            <span>Normal (1x)</span>
            <span>Fast (2x)</span>
        </div>

        <div class="section-title">Ghost Overlay</div>
        <input type="file" id="overlay-upload" accept="image/*" style="font-size:12px;">
        
        <div class="section-title">Accessibility</div>
        <button class="btn-secondary" id="toggle-a11y">Toggle High Contrast Check</button>
      `;
  }

  renderExportTab() {
    return `
        <div class="section-title">Tailwind Config</div>
        <textarea class="code-export" style="width:100%; height:150px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:#a6e22e; font-family:monospace; font-size:11px; padding:8px;" readonly>${this.generateTailwindConfig()}</textarea>
        <button class="btn-primary" id="copy-config">Copy Config</button>
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
    });
  }

  updateDesignTabs() {
    this.root.querySelector('#panel-design').innerHTML = this.renderDesignTab();
    this.root.querySelector('#panel-export').innerHTML = this.renderExportTab();
  }
}
