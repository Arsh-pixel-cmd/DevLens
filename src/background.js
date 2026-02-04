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
