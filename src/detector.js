// src/detector.js

(function detect() {
    const data = {
        frameworks: [],
        libraries: [],
        cssFrameworks: []
    };

    const win = window;

    // Helper to add with confidence
    function add(cat, name, ver = null, confidence = 'High') {
        // Avoid dupes
        if (!data[cat].find(i => i.name === name)) {
            data[cat].push({ name, version: ver, confidence });
        }
    }

    // --- Network Sniffer (API Blueprint) ---
    // Monkey-patch fetch and XHR
    const originalFetch = win.fetch;
    win.fetch = async function (...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        checkApi(url);
        return originalFetch.apply(this, args);
    };

    const originalOpen = win.XMLHttpRequest.prototype.open;
    win.XMLHttpRequest.prototype.open = function (method, url) {
        checkApi(url);
        return originalOpen.apply(this, arguments);
    };

    const detectedApis = new Set();

    function checkApi(url) {
        if (!url) return;

        const signatures = {
            'firestore.googleapis.com': 'Firebase Firestore',
            'firebaseio.com': 'Firebase Realtime DB',
            'supabase.co': 'Supabase',
            'api.stripe.com': 'Stripe',
            'algolia.net': 'Algolia',
            'contentful.com': 'Contentful',
            'shopify.com': 'Shopify',
            'sentry.io': 'Sentry',
            'intercom.io': 'Intercom'
        };

        for (const [domain, name] of Object.entries(signatures)) {
            if (url.includes(domain)) {
                if (!detectedApis.has(name)) {
                    detectedApis.add(name);
                    // Send to content script
                    window.postMessage({ type: 'DEVLENS_API_DETECTED', name }, '*');
                }
            }
        }
    }

    // --- Frameworks ---
    if (win.React || (win._REACT_DEVTOOLS_GLOBAL_HOOK_ && win._REACT_DEVTOOLS_GLOBAL_HOOK_.renderers?.size > 0)) {
        const version = win.React?.version || 'Unknown';
        add('frameworks', 'React', version, '100%');
    }
    if (win.Vue || win.__VUE__) {
        add('frameworks', 'Vue', win.Vue?.version, '100%');
    }
    if (win.next) {
        add('frameworks', 'Next.js', win.next.version, 'High');
    }
    if (document.getElementById('__next')) {
        add('frameworks', 'Next.js', null, 'High');
    }
    if (win.angular || document.querySelector('[ng-version]')) {
        const ver = document.querySelector('[ng-version]')?.getAttribute('ng-version');
        add('frameworks', 'Angular', ver, 'High');
    }
    if (win.Svelte) {
        add('frameworks', 'Svelte', null, 'High');
    }

    // --- Libraries ---
    if (win.gsap || win.TweenMax) {
        add('libraries', 'GSAP', win.gsap?.version, 'High');
    }
    if (win.THREE) {
        add('libraries', 'Three.js', win.THREE.REVISION, 'High');
    }
    if (win.Motion) {
        add('libraries', 'Framer Motion', null, 'High');
    }
    // Heuristic for Framer Motion
    if (document.querySelector('[style*="transform"][style*="framer"]')) {
        add('libraries', 'Framer Motion', null, 'Medium (Heuristic)');
    }
    if (win.jQuery) {
        add('libraries', 'jQuery', win.jQuery.fn.jquery, 'High');
    }

    // --- CSS Frameworks ---
    // Tailwind
    const hasTailwindClasses = Array.from(document.querySelectorAll('div')).some(el => {
        return el.classList.contains('flex') && (el.classList.contains('p-4') || el.classList.contains('items-center'));
    });

    function detectTailwindVars() {
        return Array.from(document.styleSheets).some(sheet => {
            try {
                // Can't access cross-origin rules easily, but we can check checking body computed style
                return false;
            } catch (e) { return false; }
        }) || getComputedStyle(document.body).getPropertyValue('--tw-text-opacity') !== '';
    }

    if (hasTailwindClasses || detectTailwindVars()) {
        add('cssFrameworks', 'Tailwind CSS', null, detectTailwindVars() ? 'High' : 'Medium');
    }

    if (win.bootstrap || (getComputedStyle(document.body).getPropertyValue('--bs-primary'))) {
        add('cssFrameworks', 'Bootstrap', null, 'High');
    }

    return data;
})();
