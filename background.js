'use strict';

// Extension state
let settings = {
  enabled: true,
  nsfwFilter: true,
  violenceFilter: true,
  suicideFilter: true,
  educationalMode: true,
  sensitivity: 'medium', // low, medium, high
  isPasswordProtected: false,
  password: '' // Hashed password will be stored here
};

// Get settings from storage
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('aiWebFilterSettings', (result) => {
      if (result && result.aiWebFilterSettings) {
        resolve(result.aiWebFilterSettings);
      } else {
        // Default settings if nothing is saved
        resolve(settings);
      }
    });
  });
}

// Save settings to storage
async function saveSettings(settingsToSave) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ 'aiWebFilterSettings': settingsToSave }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// Simple hash function for password
function simpleHash(str) {
  let hash = 0;
  
  if (str.length === 0) return hash.toString();
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to positive hex string
  return Math.abs(hash).toString(16);
}

// Initialize extension
async function initialize() {
  try {
    // Load settings
    const savedSettings = await getSettings();
    if (savedSettings) {
      settings = { ...settings, ...savedSettings };
    }
    
    console.log('AI Web Filter initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AI Web Filter:', error);
  }
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      sendResponse({ settings });
      break;
      
    case 'UPDATE_SETTINGS':
      updateSettings(message.settings, sendResponse);
      return true; // Keep the message channel open for async response
      
    case 'CHECK_URL':
      // Simplified content checking for demonstration
      sendResponse({ shouldBlock: false });
      break;
      
    case 'ANALYZE_SEARCH_QUERY':
      // Simplified search query analysis for demonstration
      sendResponse({ shouldBlock: false });
      break;
      
    case 'VERIFY_PASSWORD':
      verifyPassword(message.password, sendResponse);
      break;
      
    case 'SET_PASSWORD':
      setPassword(message.newPassword, message.currentPassword, sendResponse);
      return true;
      
    case 'OPEN_SETTINGS':
      // This will be handled by the popup
      break;
  }
});

// Handle tab navigation
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only handle main frame
  
  // Skip processing if extension is disabled
  if (!settings.enabled) return;
  
  // Simple URL check for demonstration
  if (details.url.includes('example.com/unsafe')) {
    chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL('pages/block.html') + 
           `?reason=demo&url=${encodeURIComponent(details.url)}`
    });
  }
});

// Update settings
async function updateSettings(newSettings, sendResponse) {
  try {
    settings = { ...settings, ...newSettings };
    await saveSettings(settings);
    sendResponse({ success: true, settings });
  } catch (error) {
    console.error('Failed to update settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Verify password
function verifyPassword(password, sendResponse) {
  // If password protection is not enabled or no password set
  if (!settings.isPasswordProtected || !settings.password) {
    sendResponse({ success: true });
    return;
  }
  
  // Hash the provided password and compare
  const hashedPassword = simpleHash(password);
  const passwordMatches = hashedPassword === settings.password;
  
  sendResponse({ success: passwordMatches });
}

// Set or update password
async function setPassword(newPassword, currentPassword, sendResponse) {
  try {
    // If password protection is already enabled, verify current password
    if (settings.isPasswordProtected && settings.password) {
      const hashedCurrentPassword = simpleHash(currentPassword);
      if (hashedCurrentPassword !== settings.password) {
        sendResponse({ success: false, error: 'Current password is incorrect' });
        return;
      }
    }
    
    // Hash the new password
    const hashedPassword = simpleHash(newPassword);
    
    // Update settings
    settings.isPasswordProtected = true;
    settings.password = hashedPassword;
    
    // Save updated settings
    await saveSettings(settings);
    
    sendResponse({ success: true, hashedPassword });
  } catch (error) {
    console.error('Error setting password:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Initialize the extension when installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  await initialize();
});

// Initialize when browser starts
initialize();