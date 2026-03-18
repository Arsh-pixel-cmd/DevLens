// src/codegen/reactGenerator.js
import { mapToTailwind } from './tailwindMapper.js';
import { store } from '../store.js';

/**
 * Deterministic Routing JSX Generator Pipeline
 * Unifies System 1 (Raw Extraction) and System 3 (Abstracted Arrays) internally.
 */
export class ReactGenerator {
  constructor(irNodes, componentsMap) {
    this.nodes = irNodes || new Map();
    this.components = componentsMap || new Map();
    this.confidenceScore = 1.0; 
  }

  generate(rootNodeId, explicitMode = "raw") {
     if (explicitMode === "abstract") return this.generateAbstracted(rootNodeId);
     return this.generateRaw(rootNodeId);
  }

  // ==========================================
  // MODE 1: RAW DOM TRANSLATION (System 1)
  // ==========================================
  generateRaw(rootNodeId) {
    const rootNode = store.nodes.get(rootNodeId);
    if (!rootNode || !rootNode.element) return '';
    
    const clone = rootNode.element.cloneNode(true);
    
    const transformElement = (el) => {
       if (el.hasAttribute('class')) { el.setAttribute('className', el.getAttribute('class')); el.removeAttribute('class'); }
       if (el.hasAttribute('for')) { el.setAttribute('htmlFor', el.getAttribute('for')); el.removeAttribute('for'); }
       
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
           
           const { className, style } = mapToTailwind(parsedStyleObj);
           
           if (className) {
              const current = el.getAttribute('className') || '';
              el.setAttribute('className', `${current} ${className}`.trim());
           }
           
           if (Object.keys(style).length > 2) this.confidenceScore *= 0.95;
           if (Object.keys(style).length > 0) { el.setAttribute('style', `__STYLE_PLACEHOLDER_${JSON.stringify(style)}__`); } 
           else { el.removeAttribute('style'); }
       }
       Array.from(el.children).forEach(child => transformElement(child));
    };

    transformElement(clone);

    const buildIndentedHTML = (node, depth) => {
       const tab = '  '.repeat(depth + 2);
       if (node.nodeType === Node.TEXT_NODE) {
           const text = node.textContent.trim();
           return text ? `${tab}${text}\n` : '';
       }
       if (node.nodeType !== Node.ELEMENT_NODE) return '';
       const tag = node.tagName.toLowerCase();
       const attrsList = Array.from(node.attributes).map(attr => `${attr.name}="${attr.value}"`);
       const attrs = attrsList.length > 0 ? ' ' + attrsList.join(' ') : '';
       const voidTags = ['img','br','input','hr','path','rect','circle','ellipse','line','polygon','polyline','defs','use'];
       if (voidTags.includes(tag)) { return `${tab}<${tag}${attrs} />\n`; }
       const childrenHTML = Array.from(node.childNodes).map(child => buildIndentedHTML(child, depth + 1)).join('');
       if (!childrenHTML) { return `${tab}<${tag}${attrs}></${tag}>\n`; }
       return `${tab}<${tag}${attrs}>\n${childrenHTML}${tab}</${tag}>\n`;
    };

    let html = buildIndentedHTML(clone, 0);
    html = html.trimEnd().replace(/ class="/g, ' className="').replace(/style="__STYLE_PLACEHOLDER_(.*?)__"/g, 'style={$1}');
    return `export default function DevLensOutput() {\n  return (\n${html}\n  );\n}\n`;
  }


  // ==========================================
  // MODE 2: ABSTRACT AST DATA TRANSLATION (System 3)
  // ==========================================
  generateAbstracted(rootNodeId) {
     let output = '';

     if (this.components && this.components.size > 0) {
        this.components.forEach((compData) => {
           if (!compData.instances || compData.instances.length < 2) return;
           
           const templateId = compData.instances[0];
           const templateNode = this.nodes.get(templateId);
           if (!templateNode) return;
           
           const wasInstance = templateNode.isComponentInstance;
           templateNode.isComponentInstance = false;
           const compHTML = this.renderAstNode(templateNode, 1, true);
           templateNode.isComponentInstance = wasInstance;

           const propsArray = compData.props ? Array.from(compData.props) : [];
           const paramSignature = propsArray.length > 0 ? `{ ${propsArray.join(', ')} }` : '';
           output += `const ${compData.name} = (${paramSignature}) => (\n${compHTML}\n);\n\n`;
        });
     }

     const rootJSX = this.renderAstNode(this.nodes.get(rootNodeId), 2, false);
     output += `export default function DevLensAbstractedOutput() {\n  return (\n${rootJSX}\n  );\n}\n`;
     output = output.replace(/ class="/g, ' className="'); // Hard catch
     return output;
  }

  renderAstNode(node, depth, insideComponentDeclaration = false) {
     if (!node) return '';
     const tab = '  '.repeat(depth);

     // Detangler Logic 1: Dynamic Data Loops {items.map}
     if (node.isDynamicList && node.listComponentName) {
        const schemaObj = Array.from(this.components.values()).find(c => c.name === node.listComponentName);
        const dataArr = schemaObj && schemaObj.instances ? JSON.stringify(schemaObj.instances.map(inst => {
            const clean = {...inst}; delete clean._nodeId; return clean;
        }), null, 2).replace(/\n/g, `\n${tab}`) : '[]';

        return `${tab}{/* Data array natively abstracted by DevLens PropExtractor */}\n` +
               `${tab}const listData = ${dataArr};\n` +
               `${tab}{listData.map((item, index) => (\n` +
               `${tab}  <${node.listComponentName} key={index} {...item} />\n` +
               `${tab}))}\n`;
     }

     // Component Swap Logic
     if (node.isComponentInstance && depth > 0) {
        const propsStr = Object.entries(node.dynamicProps || {}).map(([k, v]) => ` ${k}="${v}"`).join('');
        return `${tab}<${node.componentName}${propsStr} />\n`;
     }

     // Mapping Structural Visuals
     const { className, style } = mapToTailwind(node.styles || {});
     const nativeClasses = (node.classList || []).join(' ').trim();
     const finalClasses = [nativeClasses, className].filter(Boolean).join(' ');
     if (Object.keys(style).length > 2) this.confidenceScore *= 0.95;

     let props = [];
     if (finalClasses) props.push(`className="${finalClasses}"`);
     if (Object.keys(style).length > 0) props.push(`style={${JSON.stringify(style)}}`);
     
     // Safe Attribute Gating avoiding prop collision
     if (node.content?.src) props.push(`src="${node.content.src}"`);
     if (node.tag === 'a' && node.content?.href) props.push(`href="${node.content.href}"`);
     
     const propsCompiled = props.length > 0 ? ' ' + props.join(' ') : '';
     const voidElements = ['img', 'input', 'hr', 'br', 'path', 'rect', 'circle', 'use', 'line'];
     
     if (voidElements.includes(node.tag)) {
        return `${tab}<${node.tag}${propsCompiled} />\n`;
     }

     // Dynamic vs Static Text Generation Integration
     let innerJSX = '';
     
     // Match dynamic keys populated by PropExtractor
     if (insideComponentDeclaration && node.dynamicProps) {
        const injectedKey = Object.keys(node.dynamicProps).find(k => k.toLowerCase().includes('text'));
        if (injectedKey) {
           innerJSX = `\n${tab}  {${injectedKey}}\n`;
        }
     } 
     
     // Standard Native text flow
     if (!innerJSX && node.content?.text) {
        innerJSX = `\n${tab}  ${node.content.text}\n`;
     }

     // Recurse remaining structural nodes
     if (node.children && node.children.length > 0) {
         if (!node.isDynamicList) { // Ensure mapping loops don't recursively dupe kids!
            innerJSX += node.children.map(cId => this.renderAstNode(this.nodes.get(cId), depth + 1, insideComponentDeclaration)).join('');
         }
     }
     
     if (!innerJSX) return `${tab}<${node.tag}${propsCompiled}></${node.tag}>\n`;
     return `${tab}<${node.tag}${propsCompiled}>${innerJSX}${tab}</${node.tag}>\n`;
  }

  getVerificationScore() {
    return Math.max(0.1, this.confidenceScore).toFixed(2);
  }
}
