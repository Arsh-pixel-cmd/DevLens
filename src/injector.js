// src/injector.js

(function () {
    // Prevent multiple injections logic
    if (window.DevLensInjected) {
        // console.log('DevLens already loaded');
        // If already injected, we don't need to do anything, 
        // the background script might have sent a message that the listener will catch.
        return;
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
        try {
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

            // Listen for API messages from Main World
            window.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'DEVLENS_API_DETECTED') {
                    uiInstance.addDetectedApi(e.data.name);
                }
            });

            // Animate In
            openPanel();

        } catch (e) {
            console.error('DevLens Import Error:', e);
        }
    }

    function openPanel() {
        requestAnimationFrame(() => {
            shadowHost.classList.add('visible');
        });
    }

    function closePanel() {
        shadowHost.classList.remove('visible');
    }

    // --- Drag Logic ---
    function setupDrag(host, container) {
        // UI renders synchronously, so header should be there
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

            e.preventDefault();

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            container.style.cursor = 'grabbing';
            header.style.cursor = 'grabbing';
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            host.style.left = `${initialLeft + dx}px`;
            host.style.top = `${initialTop + dy}px`;
            host.style.right = 'auto'; // Clear right/bottom constraint
        };

        const onMouseUp = () => {
            isDragging = false;
            container.style.cursor = 'auto';
            header.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

})();
