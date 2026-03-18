// src/propExtractor.js

/**
 * The Prop Extractor Pipeline
 * Sits BETWEEN Style Normalization and Component Detection.
 * Explicitly strips dynamic content out of the AST so Component Detector can measure pure structural similarity,
 * while hoarding those deltas into Prop Schemas for React looping.
 */

export class PropExtractor {
  constructor(irNodesMap) {
    this.nodes = irNodesMap;
  }

  execute() {
    this.maskDynamicFields();
  }

  /**
   * Generates a rigid structural string for the node specifically IGNORING content, src, text, href
   * so that similarity matching relies exclusively on DOM tags and layout architecture!
   */
  generateStructuralFingerprint(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return '';

    let fingerprint = `[${node.tag}`;
    
    // Core Layout identity (Flex, Grid bounds) is critical for structural matching, ignoring specific pixel counts
    if (node.layout.display && node.layout.display !== 'block') {
       fingerprint += `|${node.layout.display}`;
       if (node.layout.flexDirection) fingerprint += `-${node.layout.flexDirection}`;
    }

    if (node.children && node.children.length > 0) {
       const childPrints = node.children.map(cId => this.generateStructuralFingerprint(cId));
       fingerprint += `|Kids:${childPrints.join(',')}`;
    }
    
    fingerprint += `]`;
    node.structuralFingerprint = fingerprint;
    return fingerprint;
  }

  maskDynamicFields() {
    // Traverse all IR and generate the strict, non-dynamic Structural Fingerprint for Component Clustering
    this.nodes.forEach(node => {
       node.dynamicProps = {}; // Holder for literal variance data mapping
       this.generateStructuralFingerprint(node.id);
    });
  }

  /**
   * Invoked heavily BY the ComponentDetector once it isolates a group of structurally identical 
   * nodes across the document layout. We extract the literal prop deltas!
   */
  extractSchemaForGroup(componentName, nodeIdsArr) {
     const schema = {
        component: componentName,
        props: [],       // List of detected delta keys e.g. ["titleText", "heroSrc"]
        instances: []    // Array of property objects mapped sequentially matches nodeIdsArr
     };

     if (!nodeIdsArr || nodeIdsArr.length < 2) return schema;

     // Prepare empty instances
     nodeIdsArr.forEach(id => schema.instances.push({ _nodeId: id }));

     // We traverse the AST of all instances simultaneously! 
     // This recursive comparative walk ensures we find exactly which spans differ between Card1 and Card2
     this.compareNodeTrees(nodeIdsArr, schema, 0, "root");

     return schema;
  }

  // Iterates the exact identical structural trees side-by-side checking purely the 'content' block!
  compareNodeTrees(nodeIdsArr, schemaRef, depth, pathBase) {
      if (nodeIdsArr.length === 0) return;
      
      const nodes = nodeIdsArr.map(id => this.nodes.get(id));
      
      // 1. Check for Content Variance at this specific Node Depth
      // We look at text, src, and href
      ['text', 'src', 'href'].forEach(contentKey => {
          const values = nodes.map(n => n.content[contentKey] || null);
          const firstVal = values[0];
          
          // Does any sibling node in the group have a DIFFERENT value for this content field?
          const isDynamic = values.some(v => v !== firstVal);
          
          if (isDynamic) {
             const cleanKeyName = `${pathBase}${contentKey.charAt(0).toUpperCase() + contentKey.slice(1)}`;
             if (!schemaRef.props.includes(cleanKeyName)) schemaRef.props.push(cleanKeyName);
             
             // Inject values into the sequence mapped index
             nodes.forEach((n, index) => {
                 n.dynamicProps[cleanKeyName] = values[index];
                 schemaRef.instances[index][cleanKeyName] = values[index];
             });
          }
      });

      // 2. Since structural similarity is strictly identical, we walk their children arrays safely!
      const baseChildrenLen = nodes[0].children.length;
      if (baseChildrenLen > 0) {
         for (let i = 0; i < baseChildrenLen; i++) {
             const childIdsAcrossGroup = nodes.map(n => n.children[i]);
             const newPathBase = `${pathBase}_child${i}_`;
             this.compareNodeTrees(childIdsAcrossGroup, schemaRef, depth + 1, newPathBase);
         }
      }
  }
}
