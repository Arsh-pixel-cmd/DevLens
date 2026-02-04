// src/content.js

// Prevent multiple injections
if (window.DevLensInjected) {
    // If we receive a message and it's already injected, we might want to just toggle it.
    // However, the background script sends 'INIT_DEVLENS' on every click.
    // We should handle that.
    console.log('DevLens already loaded');
}
window.DevLensInjected = true;

let shadowHost = null;
let shadowRoot = null;
let uiInstance = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INIT_DEVLENS') {
        const techData = message.data;
        togglePanel(techData);
    }
});

async function togglePanel(techData) {
    if (shadowHost) {
        // Toggle visibility
        const isVisible = shadowHost.classList.contains('visible');
        if (isVisible) {
            shadowHost.classList.remove('visible');
            setTimeout(() => {
                shadowHost.remove();
                shadowHost = null;
            }, 300); // wait for transition
        } else {
            shadowHost.classList.add('visible');
        }
        return;
    }

    createShadowDOM(techData, { colors: [], fonts: [] }); // Start with empty design data

    // Defer heavy scanning
    const runScan = () => {
        const designData = scanDesignTokens();
        if (uiInstance) {
            uiInstance.updateDesignData(designData);
        }
    };

    if (window.requestIdleCallback) {
        window.requestIdleCallback(runScan, { timeout: 2000 });
    } else {
        setTimeout(runScan, 500);
    }
}

function createShadowDOM(techData, designData) {
    shadowHost = document.createElement('div');
    shadowHost.id = 'devlens-host';

    // Attach shadow root
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    // Inject Styles
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('src/styles.css');
    shadowRoot.appendChild(styleLink);

    // Create container for React-like UI
    const container = document.createElement('div');
    container.className = 'devlens-container';
    shadowRoot.appendChild(container);

    document.body.appendChild(shadowHost);

    // Load UI Logic and Render
    // Since ui.js is an ES module, we need to import it.
    // Chrome extension content scripts can use dynamic imports for WARs

    import(chrome.runtime.getURL('src/ui.js'))
        .then(({ DevLensUI }) => {
            uiInstance = new DevLensUI(container, techData, designData);
            uiInstance.render();

            // Listen for close event from UI
            container.addEventListener('close-devlens', () => {
                shadowHost.classList.remove('visible');
                setTimeout(() => {
                    shadowHost.remove();
                    shadowHost = null;
                }, 300);
            });

            // Trigger slide-in
            requestAnimationFrame(() => {
                shadowHost.classList.add('visible');
            });
        })
        .catch(err => console.error('DevLens UI Import Error:', err));
}

// --- Design Token Scanning ---
// Performance guardrails: requestIdleCallback usage if heavy, 
// but for a single snapshot `requestIdleCallback` might be too slow for immediate UI feedback.
// We will scan visible elements mostly.

function scanDesignTokens() {
    const colors = new Set();
    const fonts = [];

    // 1. Scan Body and Headings for Typography
    const fontTargets = ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button'];
    const processedFonts = new Set();

    fontTargets.forEach(tag => {
        document.querySelectorAll(tag).forEach(el => {
            // Check visibility
            if (el.offsetParent === null) return;

            const style = getComputedStyle(el);
            const fam = style.fontFamily;
            const size = style.fontSize;
            const weight = style.fontWeight;

            const key = `${tag}-${fam}-${weight}-${size}`;
            if (!processedFonts.has(key) && processedFonts.size < 20) {
                processedFonts.add(key);
                fonts.push({
                    tag: tag,
                    family: fam,
                    weight: weight,
                    size: size
                });
            }
        });
    });

    // 2. Color Extraction (Simple version: scan all computed styles of sample elements)
    // To avoid jank, we limit the search depth or use a TreeWalker
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
            // Skip invisible
            if (!node.offsetParent && node !== document.body) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    let count = 0;
    while (walker.nextNode() && count < 500) { // Limit to 500 elements for perf
        const node = walker.currentNode;
        const style = getComputedStyle(node);

        const bg = style.backgroundColor;
        const color = style.color;
        const border = style.borderColor;

        [bg, color, border].forEach(c => {
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                colors.add(c);
            }
        });
        count++;
    }

    return {
        colors: Array.from(colors),
        fonts: fonts
    };
}
