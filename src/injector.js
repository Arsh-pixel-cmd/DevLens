// src/injector.js

// Prevent multiple injections
if (window.DevLensInjected) {
    console.log('DevLens already loaded');
}
window.DevLensInjected = true;

let shadowHost = null;
let shadowRoot = null;
let uiInstance = null;
let scannerInstance = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INIT_DEVLENS') {
        initDevLens(message.data);
    }
});

async function initDevLens(techData) {
    // If exists, just toggle
    if (shadowHost) {
        if (shadowHost.classList.contains('visible')) {
            closePanel();
        } else {
            openPanel();
        }
        return;
    }

    // Create Host
    shadowHost = document.createElement('div');
    shadowHost.id = 'devlens-host';
    // Start slightly offscreen top-right
    shadowHost.style.top = '20px';
    shadowHost.style.right = '20px';

    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    // Inject Styles
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('src/styles.css');
    shadowRoot.appendChild(styleLink);

    // Container
    const container = document.createElement('div');
    container.className = 'devlens-container';
    shadowRoot.appendChild(container);

    document.body.appendChild(shadowHost);

    // Import Modules
    const [{ DevLensUI }, { DevLensScanner }] = await Promise.all([
        import(chrome.runtime.getURL('src/ui.js')),
        import(chrome.runtime.getURL('src/scanner.js'))
    ]);

    // Init Scanner
    scannerInstance = new DevLensScanner();

    // Init UI
    uiInstance = new DevLensUI(container, techData, scannerInstance);
    uiInstance.render();

    // Event Listeners
    setupDrag(shadowHost, container);

    container.addEventListener('close-devlens', closePanel);

    // Animate In
    openPanel();
}

function openPanel() {
    requestAnimationFrame(() => {
        shadowHost.classList.add('visible');
    });
}

function closePanel() {
    shadowHost.classList.remove('visible');
    // Optional: remove usage
    // setTimeout(() => shadowHost.remove(), 300);
}

// --- Drag Logic ---
function setupDrag(host, container) {
    // We listen on the header (inside shadow DOM)
    // But we need to check if the header renders first. 
    // The UI renders synchronously in initDevLens usually, but let's delegate or wait.

    // UI renders immediately in Init.
    const header = container.querySelector('.devlens-header');
    if (!header) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = host.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        // Prevent selection
        e.preventDefault();

        // Add global listeners
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        container.style.cursor = 'grabbing';
    });

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        host.style.left = `${initialLeft + dx}px`;
        host.style.top = `${initialTop + dy}px`;
        // Clear right/bottom if set
        host.style.right = 'auto';
        host.style.bottom = 'auto';
    };

    const onMouseUp = () => {
        isDragging = false;
        container.style.cursor = 'auto';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
}
