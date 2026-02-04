// src/scanner.js

export class DevLensScanner {
    constructor() {
        this.designData = { colors: [], fonts: [], spacing: [] };
        this.animations = [];
    }

    async startActiveScan(onProgress, onComplete) {
        // 1. Auto-scroll
        onProgress(0.1);
        await this.autoScroll();
        onProgress(0.5);

        // 2. Scan Design System (Visible Elements)
        this.scanDesignSystem();
        onProgress(0.8);

        // 3. Scan Animations
        this.scanAnimations();
        onProgress(1.0);

        onComplete({
            design: this.designData,
            animations: this.animations
        });
    }

    async autoScroll() {
        return new Promise((resolve) => {
            let totalHeight = document.body.scrollHeight;
            let distance = 100;
            let timer = setInterval(() => {
                window.scrollBy(0, distance);
                if (window.innerHeight + window.scrollY >= totalHeight - 50) {
                    clearInterval(timer);
                    window.scrollTo(0, 0); // Reset
                    resolve();
                }
            }, 50); // Fast scroll
        });
    }

    scanDesignSystem() {
        const colors = new Set();
        const fonts = new Map(); // Key -> { details, count }

        // TreeWalker for visible elements
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => {
                if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
                // Basic visibility check
                if (node.offsetParent === null) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let count = 0;
        while (walker.nextNode() && count < 1000) {
            const node = walker.currentNode;
            const style = getComputedStyle(node);

            // Colors
            [style.backgroundColor, style.color, style.borderColor].forEach(c => {
                if (c && !c.includes('rgba(0, 0, 0, 0)') && c !== 'transparent') {
                    colors.add(this.rgbToHex(c) || c);
                }
            });

            // Fonts
            const fontKey = `${style.fontFamily}-${style.fontWeight}`;
            if (!fonts.has(fontKey)) {
                fonts.set(fontKey, {
                    family: style.fontFamily,
                    weight: style.fontWeight,
                    size: style.fontSize,
                    count: 1
                });
            } else {
                fonts.get(fontKey).count++;
            }

            count++;
        }

        this.designData.colors = this.clusterColors(Array.from(colors));
        this.designData.fonts = Array.from(fonts.values()).sort((a, b) => b.count - a.count).slice(0, 5);
    }

    // Helper: Convert RGB to Hex
    rgbToHex(rgb) {
        // Handle rgba(r,g,b,a) or rgb(r,g,b)
        // naive regex
        const res = rgb.match(/\d+/g);
        if (!res || res.length < 3) return rgb;
        const r = parseInt(res[0]);
        const g = parseInt(res[1]);
        const b = parseInt(res[2]);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    // Clustering Logic (Smart Palette)
    clusterColors(hexArray) {
        // Simple grouping by distinctness
        // Real clustering (Delta E) is complex, we'll sort for now and provide categories
        return hexArray.sort();
    }

    scanAnimations() {
        if (document.getAnimations) {
            this.animations = document.getAnimations().map(anim => {
                let easing = 'linear';
                let duration = 0;

                if (anim.effect) {
                    const timing = anim.effect.getTiming();
                    easing = timing.easing || 'linear';
                    duration = timing.duration;
                }

                return {
                    id: anim.id || 'Anonymous',
                    type: anim instanceof CSSTransition ? 'Transition' : 'Animation',
                    easing: easing,
                    duration: duration
                };
            });
        }
    }

    setPlaybackRate(rate) {
        if (document.getAnimations) {
            document.getAnimations().forEach(anim => {
                anim.playbackRate = rate;
            });
        }
    }

    toggleA11yHeatmap(active) {
        if (active) {
            // Inject styles or helper logic
            document.body.classList.add('devlens-a11y-active');
            // This needs CSS injected into the main page or we walk and apply styles
            this.runA11yCheck();
        } else {
            document.body.classList.remove('devlens-a11y-active');
            document.querySelectorAll('.devlens-a11y-box').forEach(el => el.remove());
        }
    }

    runA11yCheck() {
        // fast contrast check
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => {
                if (node.innerText && node.children.length === 0 && node.offsetParent) return NodeFilter.FILTER_ACCEPT;
                return NodeFilter.FILTER_SKIP;
            }
        });

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const style = getComputedStyle(node); // simplified, real calc needs bg search
            // We'll just mark small text for now as a demo
            if (style.fontSize < '12px') {
                this.highlightElement(node, 'red');
            }
        }
    }

    highlightElement(node, color) {
        const rect = node.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'devlens-a11y-box';
        box.style.position = 'fixed';
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';
        box.style.border = `2px solid ${color}`;
        box.style.zIndex = 2147483646;
        box.style.pointerEvents = 'none';
        document.body.appendChild(box);
    }
}
