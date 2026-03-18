// src/codegen/aiRefiner.js

/**
 * DevLens AI Refinement Gating System
 * Sends Deterministically Extracted code to an LLM for Variable Semantic Naming.
 * Protects against Hallucinations, Cost Crashes, and Broken Exports via Strict Fallback pipelines.
 */
export class AIRefiner {
  constructor(apiKey, baseUrl, modelId) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelId = modelId;
  }

  async refine(jsxInput, irData, confidenceScore) {
     // Gating Requirement 7: Skip AI for low confidence or completely broken local context
     if (!this.baseUrl || confidenceScore < 0.70) {
        return { mode: 'basic', code: jsxInput, reason: 'Confidence threshold unmet or missing Base URL.' };
     }

     // Gating Requirement 8/9: Token/Cost Control! 
     // We cannot dump 150,000 raw DOM strings into the prompt. Prune IR data to simple schema limits.
     const prunedIR = [];
     let counter = 0;
     irData.forEach((node) => {
        if (counter++ < 30 && node.semantics) {
           prunedIR.push({ role: node.semantics, dynamicProps: Object.keys(node.dynamicProps || {}) });
        }
     });

     // Strict Contract Execution
     const prompt = {
        role: "You are an expert Frontend Architect operating within a strict JSON boundary.",
        rules: [
           "Do not change the DOM structure. Do not remove layout nodes.",
           "Only intelligently rename generic component names (e.g., Component1 -> PricingTier).",
           "Do not add any external library imports like 'framer-motion' or 'lucide'.",
           "Output ONLY valid raw JSON syntax matching the schema. No markdown block wrapping."
        ],
        outputSchema: {
           components: [{ oldName: "string", newName: "string" }],
           code: "string (The complete final executable JSX payload)"
        },
        payload: {
           irSummary: prunedIR,
           currentCode: jsxInput
        }
     };

     try {
       const res = await new Promise((resolve) => {
           chrome.runtime.sendMessage({
               type: 'AI_REFINER_FETCH',
               apiKey: this.apiKey,
               baseUrl: this.baseUrl,
               modelId: this.modelId,
               prompt: JSON.stringify(prompt)
           }, resolve);
       });

       if (!res || !res.success) {
           throw new Error("Background Network Fail: " + (res?.error || "CORS/CSP Violation blocked internally"));
       }
       
       const data = res.data;
       
       if (data.error && data.error.message) {
           throw new Error("AI Provider Rejection: " + data.error.message);
       }
       
       if (!data.choices || !data.choices[0]) {
          throw new Error("Invalid API Response Structure.");
       }

       // Gating Requirement 10: Syntax Validation Layer
       const content = data.choices[0].message.content;
       const parsedOutput = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());

       if (!parsedOutput.code || !parsedOutput.code.includes("export default")) {
          throw new Error("AI Hallucination Detected: Missing essential React export function syntax.");
       }

       // Passed all defensive checks!
       return { mode: 'ai-enhanced', code: parsedOutput.code };

     } catch (e) {
       // Fail-safe execution guaranteed
       console.warn("[DevLens] AI Refiner Pipeline Aborted natively. Falling back to internal engine output.", e);
       return { mode: 'fallback-basic', code: jsxInput, reason: e.message };
     }
  }
}
