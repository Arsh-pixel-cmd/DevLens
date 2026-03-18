// src/componentDetector.js

/**
 * Tree-Based Pattern Detection & Prop Extraction
 * Identifies reusable nested subtrees, clustered lists, and semantic properties.
 */

export class ComponentDetector {
  static globalIndex = new Map();
  static isIndexed = false;

  static buildGlobalIndex() {
     if (this.isIndexed) return;
     
     // Extremely fast single-pass precomputation cache mapped efficiently by signature
     const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
     while(walker.nextNode()) {
        const el = walker.currentNode;
        if (el.id === 'devlens-host') continue;
        
        const sig = `${el.tagName.toLowerCase()}.${[...el.classList].sort().join('.')}`;
        if (!this.globalIndex.has(sig)) this.globalIndex.set(sig, 0);
        this.globalIndex.set(sig, this.globalIndex.get(sig) + 1);
     }
     this.isIndexed = true;
  }

  static getGlobalMatchCount(nodeElement) {
     if (!this.isIndexed) this.buildGlobalIndex();
     const sig = `${nodeElement.tagName.toLowerCase()}.${[...nodeElement.classList].sort().join('.')}`;
     return this.globalIndex.get(sig) || 1;
  }

  constructor(irNodes) {
    this.nodes = irNodes; // Map of NodeIRs
    this.components = new Map(); 
    this.listClusters = new Map();
  }

  detectPatterns() {
    this.nodes.forEach(node => {
      node.subtreeSignature = this.generateSubtreeSignature(node);
      node.semanticRole = this.inferSemanticRole(node);
    });

    this.clusterSimilarSubtrees();
    this.detectDynamicLists();
    this.extractDynamicProps();

    return {
      components: this.components,
      lists: this.listClusters
    };
  }

  // Deep recursive signature creating a structural fingerprint of the entire branch
  generateSubtreeSignature(node) {
    if (!node) return '';
    let sig = node.tag;
    
    // Include critical structural class indicators
    if (node.layout?.display === 'flex') sig += '-flex';
    
    if (node.children && node.children.length > 0) {
      const childSigs = node.children.map(childId => {
        return this.generateSubtreeSignature(this.nodes.get(childId));
      });
      sig += `[${childSigs.join(',')}]`;
    }
    return sig;
  }

  clusterSimilarSubtrees() {
    const signatureGroups = new Map();
    
    this.nodes.forEach(node => {
      // We only care about complex structures (depth > 1 or children > 0)
      if (!node.children || node.children.length === 0) return;
      
      const sig = node.subtreeSignature;
      if (!signatureGroups.has(sig)) signatureGroups.set(sig, []);
      signatureGroups.get(sig).push(node.id);
    });

    let componentCounter = 1;
    signatureGroups.forEach((nodeIds, sig) => {
      // If a complex pattern appears more than once, it's a reusable component!
      if (nodeIds.length > 1) {
        const firstNode = this.nodes.get(nodeIds[0]);
        const name = this.getComponentName(firstNode.semanticRole) || `Component${componentCounter++}`;
        
        this.components.set(sig, { name, instances: nodeIds, props: new Set() });
        
        // Mark nodes as Component Instances
        nodeIds.forEach(id => {
          this.nodes.get(id).isComponentInstance = true;
          this.nodes.get(id).componentName = name;
        });
      }
    });
  }

  detectDynamicLists() {
    this.nodes.forEach(parentNode => {
      if (!parentNode.children || parentNode.children.length < 2) return;

      // If all children of a parent map to the SAME component signature -> It's a list (.map)
      const firstChildSig = this.nodes.get(parentNode.children[0])?.subtreeSignature;
      const allMatch = parentNode.children.every(childId => {
        return this.nodes.get(childId)?.subtreeSignature === firstChildSig;
      });

      if (allMatch && this.components.has(firstChildSig)) {
        parentNode.isDynamicList = true;
        parentNode.listComponentName = this.components.get(firstChildSig).name;
      }
    });
  }

  extractDynamicProps() {
    this.nodes.forEach(node => {
      if (!node.extractedProps) node.extractedProps = {};
      
      // Extract text content dynamically from ANY terminal node
      if (node.text && node.text.trim() !== '') {
        node.extractedProps.textContent = node.text.trim();
      }
      // Extract Image Source
      if (node.tag === 'img' && node.attributes?.src) {
        node.extractedProps.src = node.attributes.src;
      }
      // Extract Links
      if (node.tag === 'a' && node.attributes?.href) {
        node.extractedProps.href = node.attributes.href;
      }

      // If this node belongs to a component, register prop key definitions
      if (node.isComponentInstance) {
         const compInfo = this.components.get(node.subtreeSignature);
         Object.keys(node.extractedProps).forEach(k => compInfo.props.add(k));
      }
    });
  }

  inferSemanticRole(node) {
    if (node.tag === 'button' || node.attributes?.onclick) return 'button';
    if (node.tag === 'img') return 'image';
    if (node.tag === 'nav') return 'navbar';
    
    // Heuristic: If it has multiple images/texts and styling, it's a card
    if (node.tag === 'div' && node.children?.length > 1) {
      const hasImg = node.children.some(id => this.nodes.get(id)?.tag === 'img');
      const hasTitle = node.children.some(id => ['h1','h2','h3'].includes(this.nodes.get(id)?.tag));
      if (hasImg && hasTitle) return 'card';
    }
    
    if (node.children?.length > 5) return 'container';
    return null;
  }

  getComponentName(role) {
    if (!role) return null;
    return role.charAt(0).toUpperCase() + role.slice(1);
  }
}
