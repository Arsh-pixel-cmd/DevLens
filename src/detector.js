// src/detector.js

(function detect() {
    const data = {
        frameworks: [],
        libraries: [],
        cssFrameworks: []
    };

    const win = window;

    // --- Frameworks ---
    if (win.React || (win._REACT_DEVTOOLS_GLOBAL_HOOK_ && win._REACT_DEVTOOLS_GLOBAL_HOOK_.renderers?.size > 0)) {
        data.frameworks.push('React');
    }
    if (win.Vue || win.__VUE__) {
        data.frameworks.push('Vue');
    }
    if (win.next) {
        data.frameworks.push('Next.js');
    }
    if (win.angular || document.querySelector('[ng-version]')) {
        data.frameworks.push('Angular');
    }
    if (win.Svelte) {
        data.frameworks.push('Svelte');
    }

    // --- Libraries ---
    if (win.gsap || win.TweenMax) data.libraries.push('GSAP');
    if (win.THREE) data.libraries.push('Three.js');
    // Framer Motion is harder to detect globally as it's often bundled, checking for typical markers or specific attribute patterns might be needed,
    // but often it leaves no global. We'll check for a common signature if possible, otherwise rely on classnames if distinct.
    // For now, simple global check:
    if (win.Motion || document.querySelector('[style*="transform"][style*="framer"]')) {
        // rudimentary heuristic
        data.libraries.push('Framer Motion (Likely)');
    }

    // --- CSS Frameworks ---
    // Tailwind: Look for typical utility classes or some specific variable patterns if available
    // Simple regex on a sample of elements or check stylesheets rules is expensive.
    // We'll check for a few known indicators.
    const hasTailwind = Array.from(document.querySelectorAll('*')).some(el => {
        // Check a few widely used classes
        return el.classList.contains('flex') || el.classList.contains('p-4') || el.classList.contains('text-center');
    }) && (detectTailwindVars());

    if (hasTailwind || detectTailwindVars()) data.cssFrameworks.push('Tailwind CSS');

    if (win.bootstrap || document.querySelector('.container') && document.querySelector('.row')) {
        // Weak heuristic for bootstrap but checking vars is better
        if (getComputedStyle(document.body).getPropertyValue('--bs-primary')) {
            data.cssFrameworks.push('Bootstrap');
        }
    }

    function detectTailwindVars() {
        // fast check for --tw var
        const checkEl = document.querySelector('body');
        if (!checkEl) return false;
        const styles = getComputedStyle(checkEl);
        for (let i = 0; i < styles.length; i++) {
            if (styles[i].startsWith('--tw-')) return true;
        }
        return false;
    }

    return data;
})();
