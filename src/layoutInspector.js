// src/layoutInspector.js

/**
 * Layout & Spacing Analysis Intelligence
 * Quantizes scattered pixel values into concrete System Scale arrays.
 */

// Greatest Common Divisor math sequence utilized in normalization bounds
function gcd(a, b) {
  if (!b) return a;
  return gcd(b, a % b);
}

export function detectLayoutIntent(node) {
  if (!node || !document.contains(node.element)) return null;

  const computed = getComputedStyle(node.element);
  const result = {
     type: 'block',
     alignment: null,
     spacingScale: null,
     confidence: 0.5
  };

  // 1. Core Visual Orientation Extraction
  if (computed.display === 'flex') {
     result.type = 'flex';
     result.alignment = `${computed.flexDirection} / Justify: ${computed.justifyContent}`;
     result.confidence = 0.95;
  } else if (computed.display === 'grid') {
     result.type = 'grid';
     result.alignment = `Cols: ${computed.gridTemplateColumns}`;
     result.confidence = 0.95;
  } else if (computed.display === 'inline-flex') {
     result.type = 'inline-flex';
     result.confidence = 0.85;
  }

  // 2. CSS Architecture Inference (Quantization via GCD array analysis)
  const spacingNodes = [
     computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft,
     computed.marginTop, computed.marginRight, computed.marginBottom, computed.marginLeft,
     computed.gap
  ].map(v => parseInt((v || '0').replace('px',''), 10)).filter(v => !isNaN(v) && v > 0);

  if (spacingNodes.length > 0) {
      const minSpacer = Math.min(...spacingNodes);
      
      // Identify shared grid increment multiplier used repeatedly across box model 
      const likelyBase = spacingNodes.reduce((acc, val) => gcd(acc, val), minSpacer);
      
      if (likelyBase === 4 || likelyBase === 8) {
         result.spacingScale = `Tailwind / Material (Base-${likelyBase}px System)`;
         result.confidence = Math.min(1.0, result.confidence + 0.15); 
      } else if (likelyBase > 1) {
         result.spacingScale = `Custom Framework (Base-${likelyBase}px)`;
      } else {
         result.spacingScale = `Chaotic/Mixed Pixels (No standard detected)`;
         result.confidence -= 0.2;
      }
  } else {
      result.spacingScale = 'No explicit bounds applied';
  }

  result.confidence = Math.min(1.0, Math.max(0.1, result.confidence)).toFixed(2);
  
  return result;
}
