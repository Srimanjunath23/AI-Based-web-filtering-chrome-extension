'use strict';

// Global variables
let extensionSettings = null;
let isPageBlocked = false;

// Initialize content script
async function initialize() {
  try {
    // Get extension settings
    extensionSettings = await getExtensionSettings();
    
    // If extension is disabled, exit
    if (!extensionSettings.enabled) return;
    
    // Start monitoring page content
    analyzePageContent();
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(handleMessages);
    
    console.log('AI Web Filter content script initialized');
  } catch (error) {
    console.error('Failed to initialize content script:', error);
  }
}

// Get extension settings from background script
async function getExtensionSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      resolve(response?.settings || {
        enabled: true,
        nsfwFilter: true,
        violenceFilter: true,
        suicideFilter: true,
        educationalMode: true,
        sensitivity: 'medium'
      });
    });
  });
}

// Analyze page content for inappropriate material
function analyzePageContent() {
  if (isPageBlocked) return;

  // Get page text content
  const pageContent = document.body.innerText.toLowerCase();
  const url = window.location.href;

  // Keywords to check
  const nsfwWords = ['xxx', 'porn', 'adult content'];
  const violenceWords = ['violence', 'kill', 'murder', 'attack'];
  const substanceWords = ['alcohol', 'drugs', 'cocaine'];

  let reason = '';
  
  // Check for inappropriate content
  if (nsfwWords.some(word => pageContent.includes(word))) {
    reason = 'nsfw';
  } else if (violenceWords.some(word => pageContent.includes(word))) {
    reason = 'violence';
  } else if (substanceWords.some(word => pageContent.includes(word))) {
    reason = 'substance';
  }

  if (reason) {
    blockPage(reason);
  }
}

// Block page and show block page
function blockPage(reason) {
  if (isPageBlocked) return;
  
  isPageBlocked = true;
  
  try {
    // Construct block page URL with reason
    const blockPageUrl = chrome.runtime.getURL('pages/block.html') + 
                      `?reason=${encodeURIComponent(reason || 'unsafe')}` + 
                      `&url=${encodeURIComponent(window.location.href)}`;

    // Stop loading the current page
    window.stop();
    
    // Clear the page content
    document.documentElement.innerHTML = '';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.height = '100vh';
  
    // Create block page container
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.zIndex = '2147483647';
    container.style.backgroundColor = '#fff';

    // Create iframe for block page
    const iframe = document.createElement('iframe');
    iframe.src = blockPageUrl;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    
    // Append iframe to container
    container.appendChild(iframe);
    
    // Clear existing content and append container
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.appendChild(container);
  } catch (error) {
    console.error('Error blocking page:', error);
  }
}

// Handle messages from the background script
function handleMessages(message, sender, sendResponse) {
  switch (message.type) {
    case 'SETTINGS_UPDATED':
      extensionSettings = message.settings;
      break;
    
    case 'FORCE_ANALYSIS':
      analyzePageContent();
      break;
  }
}

// Initialize the content script
initialize();