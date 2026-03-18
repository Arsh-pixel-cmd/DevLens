// src/codegen/tailwindMapper.js

/**
 * Loss-Aware Hierarchical Axis Normalizer
 * Executes priority folding for padding and margin (e.g. `px-4 py-4` -> `p-4`)
 */
export function mapToTailwind(stylesObj) {
  const classes = [];
  const inlineStyles = {};
  
  // Clone to safely delete matched keys
  const styles = { ...stylesObj };

  // Exact 1-to-1 Mapping Dictionary
  const exactMappings = {
    display: { flex: 'flex', grid: 'grid', block: 'block', inline: 'inline', 'inline-block': 'inline-block', none: 'hidden' },
    flexDirection: { column: 'flex-col', row: 'flex-row', 'column-reverse': 'flex-col-reverse', 'row-reverse': 'flex-row-reverse' },
    justifyContent: { center: 'justify-center', 'space-between': 'justify-between', 'space-around': 'justify-around', 'flex-start': 'justify-start', 'flex-end': 'justify-end' },
    alignItems: { center: 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end', stretch: 'items-stretch' },
    textAlign: { center: 'text-center', left: 'text-left', right: 'text-right', justify: 'text-justify' },
    fontWeight: { 'bold': 'font-bold', '700': 'font-bold', '600': 'font-semibold', '500': 'font-medium', '400': 'font-normal' }
  };

  const spacingKeys = ['padding', 'margin'];

  // Apply Hierarchy Priorities for Spacing
  spacingKeys.forEach(base => {
     let t = styles[`${base}Top`];
     let b = styles[`${base}Bottom`];
     let l = styles[`${base}Left`];
     let r = styles[`${base}Right`];
     
     // 1. Shorthand expansion
     const all = styles[base];
     if (all) {
        const parts = all.split(' ').map(p => p.trim());
        if (parts.length === 1) { t = b = l = r = parts[0]; delete styles[base]; }
        else if (parts.length === 2) { t = b = parts[0]; l = r = parts[1]; delete styles[base]; }
        else if (parts.length === 3) { t = parts[0]; l = r = parts[1]; b = parts[2]; delete styles[base]; }
        else if (parts.length === 4) { t = parts[0]; r = parts[1]; b = parts[2]; l = parts[3]; delete styles[base]; }
     }

     const parseVal = (val) => {
        if (!val) return null;
        const match = String(val).trim().match(/^(-?\d+(\.\d+)?)px$/);
        return match ? parseFloat(match[1]) : null;
     };

     const tv = parseVal(t), bv = parseVal(b), lv = parseVal(l), rv = parseVal(r);
     const pfix = base === 'padding' ? 'p' : 'm';
     
     const valToClass = (prefix, val) => {
         if (val === 0) return `${prefix}-0`;
         if (val % 4 === 0) return `${prefix}-${val/4}`;
         return `${prefix}-[${val}px]`;
     };

     // Priority 1: Exact Match (e.g. p-4)
     if (tv !== null && tv === bv && tv === lv && tv === rv) {
         classes.push(valToClass(pfix, tv));
         delete styles[`${base}Top`]; delete styles[`${base}Bottom`]; delete styles[`${base}Left`]; delete styles[`${base}Right`];
     } 
     else {
         // Priority 2: Axis Match (e.g. px-4, py-2)
         if (tv !== null && tv === bv) {
             classes.push(valToClass(`${pfix}y`, tv));
             delete styles[`${base}Top`]; delete styles[`${base}Bottom`];
         }
         if (lv !== null && lv === rv) {
             classes.push(valToClass(`${pfix}x`, lv));
             delete styles[`${base}Left`]; delete styles[`${base}Right`];
         }
         
         // Priority 3: Directional Match 
         if (styles[`${base}Top`] !== undefined && tv !== null) { classes.push(valToClass(`${pfix}t`, tv)); delete styles[`${base}Top`]; }
         if (styles[`${base}Bottom`] !== undefined && bv !== null) { classes.push(valToClass(`${pfix}b`, bv)); delete styles[`${base}Bottom`]; }
         if (styles[`${base}Left`] !== undefined && lv !== null) { classes.push(valToClass(`${pfix}l`, lv)); delete styles[`${base}Left`]; }
         if (styles[`${base}Right`] !== undefined && rv !== null) { classes.push(valToClass(`${pfix}r`, rv)); delete styles[`${base}Right`]; }
     }
  });

  // Process remaining definitions
  for (const [key, value] of Object.entries(styles)) {
    if (!value) continue;

    // Exact Dictionaries
    if (exactMappings[key] && exactMappings[key][value]) {
      classes.push(exactMappings[key][value]);
      continue;
    }

    // Explicit standard values
    if (key === 'gap' || key === 'borderRadius') {
      const match = String(value).trim().match(/^(\d+)px$/);
      if (match) {
         const val = parseInt(match[1], 10);
         if (key === 'gap') {
             classes.push(val % 4 === 0 ? `gap-${val/4}` : `gap-[${val}px]`);
         } else {
             classes.push(`rounded-[${val}px]`);
         }
         continue;
      }
    }

    // Priority 4: Loss-Aware Fallback Payload
    inlineStyles[key] = value;
  }

  return {
    className: classes.join(' '),
    style: inlineStyles
  };
}
