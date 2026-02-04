// src/ripper.js

export class ComponentRipper {
    constructor(uiInstance) {
        this.active = false;
        this.hoveredEl = null;
        this.ui = uiInstance;
        this.overlay = null;

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    toggle(active) {
        this.active = active;
        if (active) {
            document.addEventListener('mousemove', this.onMouseMove, true);
            document.addEventListener('click', this.onClick, true);
            document.addEventListener('keydown', this.onKeyDown, true);
            document.body.style.cursor = 'crosshair';
            this.createOverlay();
        } else {
            document.removeEventListener('mousemove', this.onMouseMove, true);
            document.removeEventListener('click', this.onClick, true);
            document.removeEventListener('keydown', this.onKeyDown, true);
            document.body.style.cursor = 'default';
            this.removeOverlay();
        }
    }

    createOverlay() {
        if (this.overlay) return;
        this.overlay = document.createElement('div');
        this.overlay.style.position = 'fixed';
        this.overlay.style.pointerEvents = 'none';
        this.overlay.style.zIndex = 2147483646; // Below DevLens panel
        this.overlay.style.border = '2px solid #61dafb';
        this.overlay.style.background = 'rgba(97, 218, 251, 0.1)';
        this.overlay.style.transition = 'all 0.1s ease';
        document.body.appendChild(this.overlay);
    }

    removeOverlay() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    onMouseMove(e) {
        if (!this.active) return;
        // Ignore DevLens itself
        if (e.target.closest && e.target.closest('#devlens-host')) return;

        this.hoveredEl = e.target;
        const rect = this.hoveredEl.getBoundingClientRect();

        if (this.overlay) {
            this.overlay.style.left = rect.left + 'px';
            this.overlay.style.top = rect.top + 'px';
            this.overlay.style.width = rect.width + 'px';
            this.overlay.style.height = rect.height + 'px';
        }
    }

    onClick(e) {
        if (!this.active || !this.hoveredEl) return;
        // Ignore DevLens
        if (e.target.closest && e.target.closest('#devlens-host')) return;

        e.preventDefault();
        e.stopPropagation();

        const code = this.generateComponentCode(this.hoveredEl);
        this.ui.showGeneratedCode(code);

        // Turn off after selection? Or keep on?
        // Let's keep on until user toggles off in UI
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.toggle(false);
            this.ui.updateRipperState(false); // Helper to update UI Switch
        }
    }

    generateComponentCode(el) {
        const style = getComputedStyle(el);
        const tag = el.tagName.toLowerCase();
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
            ? el.innerText
            : null;

        // Basic clean-up: convert styles to object
        // TODO: Map to Tailwind if possible (complex)
        // For now, inline styles React component

        const meaningfulStyles = this.extractMeaningfulStyles(style);

        let props = `style={${JSON.stringify(meaningfulStyles, null, 2)}}`;
        let content = text ? text : `{/* ... */}`;

        return `
export default function ExtractedComponent() {
  return (
    <${tag} 
      ${props}
    >
      ${content}
    </${tag}>
  );
}`;
    }

    extractMeaningfulStyles(computed) {
        const importantKeys = [
            'backgroundColor', 'color', 'borderRadius', 'border', 'padding', 'margin',
            'fontSize', 'fontWeight', 'fontFamily', 'display', 'flexDirection',
            'justifyContent', 'alignItems', 'gap', 'boxShadow', 'width', 'height'
        ];

        const res = {};
        importantKeys.forEach(key => {
            const val = computed[key];
            // Filter defaults (simplistic)
            if (val && val !== '0px' && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'rgba(0, 0, 0, 0)') {
                res[key] = val;
            }
        });
        return res;
    }
}
