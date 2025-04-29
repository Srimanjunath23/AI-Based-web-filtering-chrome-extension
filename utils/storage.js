'use strict';

/**
 * Get settings from Chrome storage
 * @returns {Promise<Object>} The saved settings object
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('aiWebFilterSettings', (result) => {
      if (result && result.aiWebFilterSettings) {
        resolve(result.aiWebFilterSettings);
      } else {
        // Default settings if nothing is saved
        resolve({
          enabled: true,
          nsfwFilter: true,
          violenceFilter: true,
          suicideFilter: true,
          educationalMode: true,
          sensitivity: 'medium',
          isPasswordProtected: false,
          password: ''
        });
      }
    });
  });
}

/**
 * Save settings to Chrome storage
 * @param {Object} settings - The settings object to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ 'aiWebFilterSettings': settings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get model data from Chrome local storage
 * @param {string} modelName - The name of the model
 * @returns {Promise<Object|null>} The saved model data or null if not found
 */
async function getModelData(modelName) {
  return new Promise((resolve) => {
    const key = `aiWebFilter_model_${modelName}`;
    chrome.storage.local.get(key, (result) => {
      if (result && result[key]) {
        resolve(result[key]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Save model data to Chrome local storage
 * @param {string} modelName - The name of the model
 * @param {Object} modelData - The model data to save
 * @returns {Promise<void>}
 */
async function saveModelData(modelName, modelData) {
  return new Promise((resolve, reject) => {
    const key = `aiWebFilter_model_${modelName}`;
    const data = {};
    data[key] = modelData;
    
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get allowed websites list from Chrome storage
 * @returns {Promise<Array<string>>} The saved list of allowed websites
 */
async function getAllowedWebsites() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('aiWebFilterAllowedSites', (result) => {
      if (result && result.aiWebFilterAllowedSites) {
        resolve(result.aiWebFilterAllowedSites);
      } else {
        resolve([]);
      }
    });
  });
}

/**
 * Save allowed websites list to Chrome storage
 * @param {Array<string>} allowedSites - The list of allowed websites
 * @returns {Promise<void>}
 */
async function saveAllowedWebsites(allowedSites) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ 'aiWebFilterAllowedSites': allowedSites }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Log an event to Chrome storage for monitoring purposes
 * @param {string} eventType - The type of event
 * @param {Object} eventData - Data related to the event
 * @returns {Promise<void>}
 */
async function logEvent(eventType, eventData) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('aiWebFilterEventLog', (result) => {
      let eventLog = result.aiWebFilterEventLog || [];
      
      // Limit log size to 1000 entries
      if (eventLog.length >= 1000) {
        eventLog = eventLog.slice(-999);
      }
      
      // Add new event with timestamp
      eventLog.push({
        timestamp: new Date().toISOString(),
        type: eventType,
        data: eventData
      });
      
      // Save updated log
      chrome.storage.local.set({ 'aiWebFilterEventLog': eventLog }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });
}
