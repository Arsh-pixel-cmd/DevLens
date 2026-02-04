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

        const meaningful = this.extractMeaningfulStyles(style);
        const tailwindClasses = this.mapToTailwind(meaningful);

        // If we found tailwind classes, use them, otherwise style prop
        let props = '';
        if (tailwindClasses.length > 0) {
            props = `className="${tailwindClasses.join(' ')}"`;
        } else {
            props = `style={${JSON.stringify(meaningful, null, 2)}}`;
        }

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
            'justifyContent', 'alignItems', 'gap', 'boxShadow', 'width', 'height',
            'position', 'top', 'left', 'zIndex', 'textAlign'
        ];

        // Defaults to ignore to reduce noise
        const defaults = {
            'backgroundColor': ['rgba(0, 0, 0, 0)', 'transparent'],
            'color': ['rgb(0, 0, 0)', 'rgba(0, 0, 0, 1)'], // dangerous assumption, but common default
            'borderRadius': ['0px'],
            'border': ['0px none rgb(0, 0, 0)', '0px none'],
            'padding': ['0px'],
            'margin': ['0px'],
            'fontSize': ['16px'], // Browser default
            'fontWeight': ['400', 'normal'],
            'display': ['block'],
            'position': ['static'],
            'boxShadow': ['none'],
            'textAlign': ['start', 'left']
        };

        const res = {};
        importantKeys.forEach(key => {
            const val = computed[key];
            if (!val) return;

            // Check against defaults
            const isDefault = defaults[key]?.some(d => val === d || val.startsWith(d));

            if (!isDefault) {
                res[key] = val;
            }
        });
        return res;
    }

    // Basic Tailwind Mapper (Heuristic)
    mapToTailwind(styles) {
        const classes = [];

        // Helper to match colors (naive)
        // A real mapper needs a huge lookup table or proximity search.
        // We will do simple structural mapping.

        if (styles.display === 'flex') classes.push('flex');
        if (styles.display === 'grid') classes.push('grid');
        if (styles.flexDirection === 'column') classes.push('flex-col');
        if (styles.justifyContent === 'center') classes.push('justify-center');
        if (styles.justifyContent === 'space-between') classes.push('justify-between');
        if (styles.alignItems === 'center') classes.push('items-center');

        // Spacing (px -> rem -> tailwind unit)
        // 1 unit = 0.25rem = 4px
        const mapSpacing = (val, prefix) => {
            if (!val || !val.endsWith('px')) return;
            const px = parseInt(val);
            if (px === 0) return;
            const unit = Math.round(px / 4);
            classes.push(`${prefix}-${unit}`);
        };

        mapSpacing(styles.padding, 'p');
        mapSpacing(styles.margin, 'm');
        mapSpacing(styles.gap, 'gap');
        mapSpacing(styles.borderRadius, 'rounded');

        if (styles.fontWeight === '700' || styles.fontWeight === 'bold') classes.push('font-bold');
        if (styles.fontWeight === '600') classes.push('font-semibold');
        if (styles.textAlign === 'center') classes.push('text-center');

        // Colors - just pass arbitrary values if not simple?
        // Tailwind allows arbitrary values: bg-[#123456]
        if (styles.backgroundColor && !styles.backgroundColor.includes('rgba')) {
            const hex = this.rgbToHex(styles.backgroundColor);
            if (hex) classes.push(`bg-[${hex}]`);
        }
        if (styles.color && !styles.color.includes('rgba')) {
            const hex = this.rgbToHex(styles.color);
            if (hex) classes.push(`text-[${hex}]`);
        }

        return classes;
    }

    rgbToHex(rgb) {
        const res = rgb.match(/\d+/g);
        if (!res || res.length < 3) return null;
        return "#" + ((1 << 24) + (+res[0] << 16) + (+res[1] << 8) + +res[2]).toString(16).slice(1);
    }
}
