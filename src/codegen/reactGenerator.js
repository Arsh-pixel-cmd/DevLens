// src/codegen/reactGenerator.js
import { mapToTailwind } from './tailwindMapper.js';
import { store } from '../store.js';

/**
 * Native DOM JSX Generator pipeline
 * Directly transforms the live DOM clone into exact, pristine React JSX code, preserving all SVGs and unmapped attributes natively!
 */
export class ReactGenerator {
  constructor(irNodes, componentsMap) {
    // We intentionally ignore the Abstract Syntax mappings now per User Preference 
    // to strictly enforce the "raw visual structure pattern" exactly as seen in DevTools.
    this.confidenceScore = 1.0; 
  }

  generate(rootNodeId) {
    const rootNode = store.nodes.get(rootNodeId);
    if (!rootNode || !rootNode.element) return '';
    
    // 1. Deep Clone the exact Native DOM Element block (including all raw SVGs, scripts, text)
    const clone = rootNode.element.cloneNode(true);
    
    // 2. Recursive Transform on the pristine cloned DOM memory
    const transformElement = (el) => {
       // Convert standard HTML classes to JSX className safely
       if (el.hasAttribute('class')) {
          el.setAttribute('className', el.getAttribute('class'));
          el.removeAttribute('class');
       }
       // React specific label mappings
       if (el.hasAttribute('for')) {
          el.setAttribute('htmlFor', el.getAttribute('for'));
          el.removeAttribute('for');
       }
       
       // Process styles into Tailwind utility strings
       const rawStyleStr = el.getAttribute('style') || '';
       if (rawStyleStr && rawStyleStr.length > 0) {
           let parsedStyleObj = {};
           rawStyleStr.split(';').forEach(rule => {
               if(rule.trim() === '') return;
               const parts = rule.split(':');
               if (parts.length >= 2) {
                  const k = parts[0].trim();
                  const v = parts.slice(1).join(':').trim(); 
                  const camelKey = k.replace(/-([a-z])/g, g => g[1].toUpperCase());
                  parsedStyleObj[camelKey] = v.replace('!important', '').trim();
               }
           });
           
           // Funnel the DOM Style block directly into our Tailwind Normalizer Layer!
           const { className, style } = mapToTailwind(parsedStyleObj);
           
           // Inject mapped Tailwind Classes natively
           if (className) {
              const current = el.getAttribute('className') || '';
              el.setAttribute('className', `${current} ${className}`.trim());
           }
           
           if (Object.keys(style).length > 2) this.confidenceScore *= 0.95;
           
           // Wipe the raw inline string so outerHTML doesn't spit it out formatted badly
           if (Object.keys(style).length > 0) {
              // Hack to retain curly brace logic natively out of dom attributes later
              el.setAttribute('style', `__STYLE_PLACEHOLDER_${JSON.stringify(style)}__`);
           } else {
              el.removeAttribute('style');
           }
       }
       
       // Explicitly enforce specific nested recursions
       Array.from(el.children).forEach(child => transformElement(child));
    };

    transformElement(clone);

    // 3. Exact Browser HTML Export via Recursive Indentation Builder
    const buildIndentedHTML = (node, depth) => {
       const tab = '  '.repeat(depth + 2); // Base indentation for React component shell
       
       if (node.nodeType === Node.TEXT_NODE) {
           const text = node.textContent.trim();
           return text ? `${tab}${text}\n` : '';
       }
       if (node.nodeType !== Node.ELEMENT_NODE) return '';
       
       const tag = node.tagName.toLowerCase();
       
       // Construct standard explicitly formatted attributes
       const attrsList = Array.from(node.attributes).map(attr => `${attr.name}="${attr.value}"`);
       const attrs = attrsList.length > 0 ? ' ' + attrsList.join(' ') : '';
       
       const voidTags = ['img','br','input','hr','path','rect','circle','ellipse','line','polygon','polyline','defs','use'];
       
       if (voidTags.includes(tag)) {
           return `${tab}<${tag}${attrs} />\n`;
       }
       
       const childrenHTML = Array.from(node.childNodes).map(child => buildIndentedHTML(child, depth + 1)).join('');
       
       if (!childrenHTML) {
           return `${tab}<${tag}${attrs}></${tag}>\n`;
       }
       
       return `${tab}<${tag}${attrs}>\n${childrenHTML}${tab}</${tag}>\n`;
    };

    let html = buildIndentedHTML(clone, 0);
    html = html.trimEnd();

    // Fix stragglers and translated style wrappers
    html = html.replace(/ class="/g, ' className="');
    html = html.replace(/style="__STYLE_PLACEHOLDER_(.*?)__"/g, 'style={$1}');

    return `export default function GeneratedCode() {\n  return (\n${html}\n  );\n}\n`;
  }

  getVerificationScore() {
    return Math.max(0.1, this.confidenceScore).toFixed(2);
  }
}
