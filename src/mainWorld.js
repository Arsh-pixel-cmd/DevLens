// src/mainWorld.js

/**
 * Injected into the MAIN browser world to pierce the Chrome Extension isolation.
 * Performs deep, minified-resistant extraction on React 18+ Fiber trees and next.js scopes securely.
 */
(function() {
  if (window.DevLensMainInjected) return;
  window.DevLensMainInjected = true;

  // Defensive Resolution - never hardcode internal react key endings
  function getReactFiber(node) {
    if (!node) return null;
    const keys = Object.keys(node);
    const key = keys.find(k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
    return key ? node[key] : null;
  }

  function parseFiber(fiber) {
    if (!fiber) return null;
    let curr = fiber;
    let componentName = null;
    let props = null;

    // Traverse upwards searching for the first Functional/Class wrapper instead of primitive host nodes
    while (curr) {
       if (curr.type && typeof curr.type === 'function' && curr.type.name) {
          componentName = curr.type.name;
          props = curr.memoizedProps;
          break;
       }
       if (curr.type && typeof curr.type === 'string') {
          if (!props) props = curr.memoizedProps; 
       }
       curr = curr.return;
    }
    
    return {
       componentName,
       props: props ? cleanProps(props) : null
    };
  }

  function cleanProps(propsObj, depth = 0) {
     if (depth > 2) return "...[TRUNCATED]";
     if (!propsObj || typeof propsObj !== 'object') return propsObj;
     
     let clean = {};
     for (const k in propsObj) {
        if (k === 'children' || k === 'ref') continue;
        const val = propsObj[k];
        if (typeof val === 'function') clean[k] = "[Function]";
        else if (Array.isArray(val)) clean[k] = `Array(${val.length})`;
        else if (val && typeof val === 'object') clean[k] = cleanProps(val, depth + 1);
        else clean[k] = val;
     }
     return clean;
  }

  // Deep recursive fuzzy matcher determining data hydration lineage 
  function fuzzySearchData(targetValue, obj, path = "", depth = 0) {
      if (depth > 6 || !obj || typeof obj !== 'object') return null;

      const keys = Object.keys(obj);
      let bestMatch = null;
      let highestConf = 0;

      for (let i = 0; i < keys.length; i++) {
         const k = keys[i];
         const v = obj[k];
         const currPath = path ? `${path}.${k}` : k;

         if (typeof v === 'string') {
             if (v.includes(targetValue) || targetValue.includes(v)) {
                 const diff = Math.abs(v.length - targetValue.length);
                 const conf = Math.max(0.1, 1 - (diff / Math.max(v.length, targetValue.length)));
                 if (conf > highestConf) {
                    highestConf = conf;
                    bestMatch = { path: currPath, confidence: conf, value: v };
                 }
             }
         } else if (typeof v === 'object') {
             const nested = fuzzySearchData(targetValue, v, currPath, depth + 1);
             if (nested && nested.confidence > highestConf) {
                 highestConf = nested.confidence;
                 bestMatch = nested;
             }
         }
      }
      return bestMatch;
  }


  // STRICT Message Protocol Enforcement
  window.addEventListener("message", (event) => {
    if (event.data?.source !== "devlens-content" || event.data?.type !== "DATA_EXTRACT_REQ") return;
    
    const { targetSelector, targetText } = event.data.payload;
    const node = document.querySelector(targetSelector);
    
    let fiberResult = null;
    let nextResult = null;
    
    // Multi-Layer Strategy Extraction Phase
    if (node) {
       try {
         // Layer 1: React Fiber Check
         const fiber = getReactFiber(node);
         fiberResult = parseFiber(fiber);
       } catch (e) {
         fiberResult = { error: e.message };
       }
    }

    // Layer 2: Next.js Global State Matcher fallback
    if (window.__NEXT_DATA__ && targetText && targetText.length > 3) {
       try {
          nextResult = fuzzySearchData(targetText.trim(), window.__NEXT_DATA__.props);
          if (nextResult) nextResult.path = `__NEXT_DATA__.props.${nextResult.path}`;
       } catch(e) {}
    }

    // Return to the explicitly verified isolated listener
    window.postMessage({
       source: "devlens-main",
       type: "DATA_EXTRACT_RES",
       payload: {
           fiber: fiberResult,
           nextData: nextResult,
           selector: targetSelector
       }
    }, "*");
  });
})();
