// src/styleNormalizer.js

/**
 * Bridges the gap between raw CSS computations and Tailwind or logical Atomic models.
 * Isolates explicitly standardizable styles (padding, margin, standard fonts) from complex losses.
 */
export function normalizeStyles(styles) {
   let normalizedInline = {};
   let tailwindClasses = [];
   
   const mapToTailwindSpacing = (val, prefix) => {
      const pxMatch = String(val).match(/^(\d+)px$/);
      if(!pxMatch) return val; // Unprocessable, pass through
      
      const px = parseInt(pxMatch[1], 10);
      if(px === 0) { tailwindClasses.push(`${prefix}-0`); return null; }
      if(px % 4 === 0) { tailwindClasses.push(`${prefix}-${px/4}`); return null; }
      
      // Strict fallback -> if we really want to preserve 7px, we use bracket notation or inline.
      // We choose inline to be loss aware and safe.
      return val; 
   };

   for(const [k, v] of Object.entries(styles)) {
      if (!v) continue;
      
      if(k === 'padding') {
         const remainder = mapToTailwindSpacing(v, 'p');
         if(remainder !== null) normalizedInline[k] = remainder;
      } else if (k === 'margin') {
         const remainder = mapToTailwindSpacing(v, 'm');
         if(remainder !== null) normalizedInline[k] = remainder;
      } else if (k === 'gap') {
         const remainder = mapToTailwindSpacing(v, 'gap');
         if(remainder !== null) normalizedInline[k] = remainder;
      } else {
         normalizedInline[k] = v;
      }
   }
   
   return { 
     inline: normalizedInline, 
     classes: tailwindClasses.join(' ') 
   };
}
