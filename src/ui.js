// src/ui.js

export class DevLensUI {
    constructor(root, techData, stylesData) {
        this.root = root;
        this.techData = techData;
        this.stylesData = stylesData;
        this.activeTab = 'tech';
    }

    render() {
        this.root.innerHTML = `
      <div class="devlens-container">
        <div class="devlens-header">
          <span class="devlens-title">DevLens</span>
          <button class="devlens-close">✕</button>
        </div>
        
        <div class="devlens-tabs">
          <div class="devlens-tab active" data-tab="tech">Tech Stack</div>
          <div class="devlens-tab" data-tab="design">Design System</div>
          <div class="devlens-tab" data-tab="export">Export</div>
        </div>

        <div class="devlens-content">
          <div id="panel-tech" class="devlens-panel active">
             ${this.renderTechTab()}
          </div>
          <div id="panel-design" class="devlens-panel">
             ${this.renderDesignTab()}
          </div>
          <div id="panel-export" class="devlens-panel">
             ${this.renderExportTab()}
          </div>
        </div>
      </div>
    `;

        this.attachEvents();
    }

    renderTechTab() {
        const { frameworks, libraries, cssFrameworks } = this.techData;

        return `
      <div class="section-title">Frameworks</div>
      <div class="tag-container">
        ${frameworks.length ? frameworks.map(f => `<span class="tag">${f}</span>`).join('') : '<span class="tag">None detected</span>'}
      </div>

      <div class="section-title">CSS Frameworks</div>
      <div class="tag-container">
        ${cssFrameworks.length ? cssFrameworks.map(f => `<span class="tag">${f}</span>`).join('') : '<span class="tag">None detected</span>'}
      </div>

      <div class="section-title">Libraries</div>
      <div class="tag-container">
        ${libraries.length ? libraries.map(f => `<span class="tag">${f}</span>`).join('') : '<span class="tag">None detected</span>'}
      </div>
    `;
    }

    renderDesignTab() {
        const { colors, fonts } = this.stylesData;
        const uniqueColors = [...new Set(colors)].slice(0, 50); // limit for perf

        return `
      <div class="section-title">Colors (${uniqueColors.length})</div>
      <div class="color-grid">
        ${uniqueColors.map(c => `<div class="color-swatch" style="background-color: ${c}" data-color="${c}"></div>`).join('')}
      </div>

      <div class="section-title">Typography</div>
      ${fonts.map(f => `
        <div class="typo-item">
          <span class="typo-tag">${f.tag}</span>
          <div class="typo-details">
            ${f.family}<br>
            ${f.weight} / ${f.size}
          </div>
        </div>
      `).join('')}
    `;
    }

    renderExportTab() {
        return `
      <div class="section-title">Tailwind Config (Preview)</div>
      <p style="font-size:12px; color:#888;">Generated from detected colors and fonts</p>
      <textarea class="code-export" readonly>${this.generateTailwindConfig()}</textarea>
      
      <button class="btn-primary" id="copy-btn">Copy to Clipboard</button>
    `;
    }

    generateTailwindConfig() {
        const { colors, fonts } = this.stylesData;
        const uniqueColors = [...new Set(colors)].slice(0, 20); // Limit

        const fontFamily = fonts.length > 0 ? fonts[0].family : 'sans-serif';

        return `module.exports = {
  theme: {
    extend: {
      colors: {
        ${uniqueColors.map((c, i) => `'custom-${i + 1}': '${c}'`).join(',\n        ')}
      },
      fontFamily: {
        'detected': ['${fontFamily.replace(/'/g, "")}', 'sans-serif']
      }
    }
  }
}`;
    }

    attachEvents() {
        // Tabs
        const tabs = this.root.querySelectorAll('.devlens-tab');
        const sections = this.root.querySelectorAll('.devlens-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                sections.forEach(s => s.classList.remove('active'));

                e.target.classList.add('active');
                const targetId = e.target.getAttribute('data-tab');
                this.root.querySelector(`#panel-${targetId}`).classList.add('active');
            });
        });

        // Close
        this.root.querySelector('.devlens-close').addEventListener('click', () => {
            // Dispatch custom event to host to close
            this.root.dispatchEvent(new CustomEvent('close-devlens', { bubbles: true, composed: true }));
        });

        // Copy
        const copyBtn = this.root.querySelector('#copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const textarea = this.root.querySelector('.code-export');
                textarea.select();
                document.execCommand('copy');
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = 'Copy to Clipboard', 2000);
            });
        }
    }
}
