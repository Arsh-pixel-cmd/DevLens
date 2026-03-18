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

  async _fetch(prompt) {
    if (!this.baseUrl || !this.apiKey || this.apiKey === 'mock-local-key') {
      throw new Error("Missing AI Configuration (API Key or Base URL). Please configure your credentials in the Codegen tab.");
    }

    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'AI_REFINER_FETCH',
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        modelId: this.modelId,
        prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt)
      }, (response) => {
        if (chrome.runtime.lastError) {
           const err = chrome.runtime.lastError.message;
           if (err.includes("context invalidated")) {
              resolve({ success: false, error: "Extension reloaded. Please refresh the page to continue." });
           } else {
              resolve({ success: false, error: err });
           }
        } else {
           resolve(response);
        }
      });
    });

    if (!res || !res.success) {
      throw new Error("Background Network Fail: " + (res?.error || "CORS/CSP Violation"));
    }

    const data = res.data;
    if (data.error?.message) throw new Error("AI Provider rejection: " + data.error.message);
    if (!data.choices?.[0]?.message?.content) throw new Error("Empty AI response.");

    return data.choices[0].message.content.trim();
  }

  async generalQuery(prompt) {
    try {
      const content = await this._fetch(prompt);
      return { success: true, explanation: content };
    } catch (e) {
      console.warn("[DevLens] AI General Query Failed:", e.message);
      return { success: false, error: e.message };
    }
  }

  async refine(jsxInput, irData, confidenceScore) {
     // Gating Requirement 7: Skip AI for low confidence or completely broken local context
     if (!this.baseUrl || confidenceScore < 0.70) {
        return { mode: 'basic', code: jsxInput, reason: 'Confidence threshold unmet or missing Base URL.' };
     }

     // Gating Requirement 8/9: Token/Cost Control! 
     const prunedIR = [];
     let counter = 0;
     irData.forEach((node) => {
        if (counter++ < 30 && node.semantics) {
           prunedIR.push({ role: node.semantics, dynamicProps: Object.keys(node.dynamicProps || {}) });
        }
     });

     // Strict Contract Execution
     const prompt = {
        role: "You are a specialized DevLens JSX Architect. Your task is to REFINE the provided JSX by improving variable names and identifying semantic components based on the provided IR summary.",
        instructions: [
           "RETAIN the exact DOM structure and Tailwind classes.",
           "RENAME generic components (Component1, Component2) based on the 'role' in the IR Summary.",
           "ENSURE the final code is a complete, executable React file including the 'export default' function.",
           "OUTPUT ONLY a valid JSON object. DO NOT include markdown code blocks or any other text."
        ],
        schema: {
           components: [{ oldName: "string", newName: "string" }],
           code: "string (The complete final executable JSX payload)"
        },
        input: {
           irSummary: prunedIR,
           currentCode: jsxInput
        }
     };

     try {
       let content = await this._fetch(prompt);
       
       // Gating Requirement 10: Robust JSON Extraction
       // Heuristic: Many models ignore the "No Markdown" rule. Try to extract JSON from block.
       const jsonBlockMatch = content.match(/\{[\s\S]*\}/);
       if (jsonBlockMatch) content = jsonBlockMatch[0];

       let parsedOutput;
       try {
         parsedOutput = JSON.parse(content);
       } catch (parseErr) {
         throw new Error("Malformed JSON in AI response.");
       }

       if (!parsedOutput.code) throw new Error("AI returned empty code payload.");

       // Gating Requirement 11: Structural Validation & Auto-Repair
       let finalCode = parsedOutput.code;

       // If model hallucinated and removed the export wrapper but kept the JSX/function body
       if (!finalCode.includes("export default") && finalCode.includes("return")) {
          console.warn("[DevLens] AI omitted export wrapper. Attempting Auto-Repair...");
          if (finalCode.trim().startsWith("function") || finalCode.trim().startsWith("const")) {
             finalCode = `export default ${finalCode}`;
          } else {
             const originalNameMatch = jsxInput.match(/export default function (\w+)/);
             const funcName = originalNameMatch ? originalNameMatch[1] : 'DevLensOutput';
             finalCode = `export default function ${funcName}() {\n  return (\n${finalCode}\n  );\n}`;
          }
       }

       if (!finalCode.includes("<") || !finalCode.includes(">")) {
          throw new Error("AI Hallucination Detected: Output does not contain valid JSX tags.");
       }

       return { mode: 'ai-enhanced', code: finalCode };

     } catch (e) {
       console.warn("[DevLens] AI Refiner Gating Triggered:", e.message);
       return { mode: 'fallback-basic', code: jsxInput, reason: e.message };
     }
  }
}
