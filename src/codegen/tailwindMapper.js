// src/codegen/tailwindMapper.js

/**
 * Loss-Aware Hybrid Normalizer
 * Maps styles to Tailwind classes where perfect, falls back to inline styles for complex values.
 */
export function mapToTailwind(styles) {
  const classes = [];
  const inlineStyles = {};
  
  // Exact 1-to-1 Mapping Dictionary
  const exactMappings = {
    display: {
      flex: 'flex', grid: 'grid', block: 'block', inline: 'inline', 'inline-block': 'inline-block', none: 'hidden'
    },
    flexDirection: {
      column: 'flex-col', row: 'flex-row', 'column-reverse': 'flex-col-reverse'
    },
    justifyContent: {
      center: 'justify-center', 'space-between': 'justify-between', 'space-around': 'justify-around', 'flex-start': 'justify-start', 'flex-end': 'justify-end'
    },
    alignItems: {
      center: 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end', stretch: 'items-stretch'
    },
    textAlign: {
      center: 'text-center', left: 'text-left', right: 'text-right', justify: 'text-justify'
    },
    fontWeight: {
      'bold': 'font-bold', '700': 'font-bold', '600': 'font-semibold', '500': 'font-medium', '400': 'font-normal'
    }
  };

  for (const [key, value] of Object.entries(styles)) {
    if (!value) continue;

    // 1. Check Exact Dictionary Match
    if (exactMappings[key] && exactMappings[key][value]) {
      classes.push(exactMappings[key][value]);
      continue;
    }

    // 2. Handle Responsive / Standardized Spacing (px -> Tailwind Config Units)
    if (['padding', 'margin', 'gap', 'borderRadius'].includes(key)) {
      const pxMatch = String(value).trim().match(/^(\d+)px$/);
      if (pxMatch) {
         const pxVal = parseInt(pxMatch[1], 10);
         // Standard tailwind unit is px / 4
         if (pxVal === 0) {
            classes.push(`${getPrefix(key)}-0`);
         } else if (pxVal % 4 === 0) {
            classes.push(`${getPrefix(key)}-${pxVal / 4}`);
         } else {
            // Fallback for non-standard sizing if strict mode
            classes.push(`${getPrefix(key)}-[${pxVal}px]`);
         }
         continue;
      }
    }

    // 3. Loss-Aware Fallback (Complex box-shadows, linear-gradients, absolute URLs, calc)
    inlineStyles[key] = value;
  }

  return {
    className: classes.join(' '),
    style: inlineStyles
  };
}

function getPrefix(key) {
  const map = { padding: 'p', margin: 'm', gap: 'gap', borderRadius: 'rounded' };
  return map[key] || key;
}
