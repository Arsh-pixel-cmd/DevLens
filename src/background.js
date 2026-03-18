// src/background.js

// Listen for the extension action click (Manual Activation)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    // 1. Inject the Detector (Main World) to get tech stack & global vars
    // We use executeScript with world: 'MAIN'
    const detectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/detector.js'],
      world: 'MAIN'
    });

    const techData = detectionResults[0]?.result || {};

    // 2. Inject the Injector Script (Isolated World) to handle UI
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/injector.js']
    });

    // 3. Send the detected data to the content script
    // We need a slight delay or ensure content script is ready to receive.
    // However, executeScript promise resolves when the script has run.
    // If content.js simply sets up a listener, we can send immediately.
    chrome.tabs.sendMessage(tab.id, {
      type: 'INIT_DEVLENS',
      data: techData
    });

  } catch (err) {
    console.error('DevLens Activation Error:', err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AI_REFINER_FETCH') {
    (async () => {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { 
             "Content-Type": "application/json", 
             "Authorization": `Bearer ${message.apiKey}` 
          },
          body: JSON.stringify({
             model: "gpt-4-turbo-preview",
             temperature: 0.1,
             messages: [{ role: "user", content: message.prompt }]
          })
        });
        const data = await res.json();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
