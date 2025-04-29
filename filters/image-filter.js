'use strict';

/**
 * Image filtering module for detecting and blurring NSFW images
 */

// Configuration
const BLUR_AMOUNT = '30px';  // Default blur amount for NSFW images
const MIN_IMAGE_SIZE = 60;   // Minimum image size to analyze (width/height)
const DETECTION_CONFIDENCE = {
  low: 0.8,     // Low sensitivity (more permissive)
  medium: 0.6,  // Medium sensitivity (default)
  high: 0.4     // High sensitivity (more restrictive)
};

// Tracking which images have been processed
const processedImages = new Set();

/**
 * Initialize image filtering
 * @param {Object} settings - The extension settings
 */
function initializeImageFiltering(settings) {
  if (!settings.enabled || !settings.nsfwFilter) return;
  
  // Process existing images
  processImages();
  
  // Set up mutation observer to detect new images
  observeImageChanges();
}

/**
 * Process all images on the page
 */
function processImages() {
  const images = document.querySelectorAll('img');
  
  for (const img of images) {
    if (shouldProcessImage(img)) {
      processImage(img);
    }
  }
}

/**
 * Determine if an image should be processed
 * @param {HTMLImageElement} img - The image element to check
 * @returns {boolean} Whether the image should be processed
 */
function shouldProcessImage(img) {
  // Skip if already processed
  if (processedImages.has(img.src) || img.dataset.aiFiltered) {
    return false;
  }
  
  // Skip tiny images or icons
  if (img.complete && (img.naturalWidth < MIN_IMAGE_SIZE || img.naturalHeight < MIN_IMAGE_SIZE)) {
    // Mark as processed to avoid rechecking
    processedImages.add(img.src);
    img.dataset.aiFiltered = 'skipped';
    return false;
  }
  
  // Skip images with specific classes that are likely UI elements
  if (img.classList.contains('avatar') || 
      img.classList.contains('icon') || 
      img.classList.contains('logo') ||
      img.classList.contains('emoji')) {
    processedImages.add(img.src);
    img.dataset.aiFiltered = 'skipped';
    return false;
  }
  
  // Skip SVG images (these are often icons)
  if (img.src.includes('.svg') || img.src.startsWith('data:image/svg+xml')) {
    processedImages.add(img.src);
    img.dataset.aiFiltered = 'skipped';
    return false;
  }
  
  return true;
}

/**
 * Process a single image
 * @param {HTMLImageElement} img - The image element to process
 */
function processImage(img) {
  // Mark as being processed
  img.dataset.aiFiltered = 'processing';
  
  // If image is not loaded yet, wait for it
  if (!img.complete) {
    img.addEventListener('load', () => {
      if (img.naturalWidth >= MIN_IMAGE_SIZE && img.naturalHeight >= MIN_IMAGE_SIZE) {
        analyzeImage(img);
      } else {
        // Mark small images as skipped
        img.dataset.aiFiltered = 'skipped';
        processedImages.add(img.src);
      }
    });
    return;
  }
  
  // Analyze loaded image
  analyzeImage(img);
}

/**
 * Analyze an image for NSFW content
 * @param {HTMLImageElement} img - The image to analyze
 */
async function analyzeImage(img) {
  try {
    // Get extension settings
    const settings = await getExtensionSettings();
    
    // Skip if extension or NSFW filtering is disabled
    if (!settings.enabled || !settings.nsfwFilter) {
      img.dataset.aiFiltered = 'skipped';
      return;
    }
    
    // Get or load NSFW model
    const nsfwModel = await loadNSFWModel();
    
    if (!nsfwModel) {
      console.error('Failed to load NSFW model for image analysis');
      img.dataset.aiFiltered = 'error';
      return;
    }
    
    // Classify the image
    const predictions = await nsfwModel.classify(img);
    
    // Determine confidence threshold based on sensitivity setting
    let threshold = DETECTION_CONFIDENCE.medium; // Default
    if (settings.sensitivity === 'low') {
      threshold = DETECTION_CONFIDENCE.low;
    } else if (settings.sensitivity === 'high') {
      threshold = DETECTION_CONFIDENCE.high;
    }
    
    // Check prediction results
    const pornPrediction = predictions.find(p => p.className === 'Porn');
    const sexyPrediction = predictions.find(p => p.className === 'Sexy');
    const hentaiPrediction = predictions.find(p => p.className === 'Hentai');
    
    const pornProb = pornPrediction ? pornPrediction.probability : 0;
    const sexyProb = sexyPrediction ? sexyPrediction.probability : 0;
    const hentaiProb = hentaiPrediction ? hentaiPrediction.probability : 0;
    
    // Determine if the image should be blurred
    let shouldBlur = false;
    let blurReason = '';
    
    if (pornProb > threshold) {
      shouldBlur = true;
      blurReason = 'explicit content';
    } else if (hentaiProb > threshold) {
      shouldBlur = true;
      blurReason = 'explicit animated content';
    } else if (sexyProb > threshold && settings.sensitivity !== 'low') {
      shouldBlur = true;
      blurReason = 'suggestive content';
    }
    
    if (shouldBlur) {
      // Apply blur and overlay
      blurImage(img, blurReason);
      
      // Log the event
      logFilterEvent('image_blocked', {
        url: window.location.href,
        imgSrc: img.src.substring(0, 100), // Truncate long data URLs
        reason: blurReason,
        confidence: Math.max(pornProb, sexyProb, hentaiProb)
      });
    }
    
    // Mark as processed
    img.dataset.aiFiltered = shouldBlur ? 'blurred' : 'safe';
    processedImages.add(img.src);
    
  } catch (error) {
    console.error('Error analyzing image:', error);
    img.dataset.aiFiltered = 'error';
  }
}

/**
 * Apply blur effect and warning overlay to an inappropriate image
 * @param {HTMLImageElement} img - The image to blur
 * @param {string} reason - The reason for blurring
 */
function blurImage(img, reason) {
  // Create a container to wrap the image
  const container = document.createElement('div');
  container.className = 'ai-filter-image-container';
  container.style.position = 'relative';
  container.style.display = 'inline-block';
  container.style.overflow = 'hidden';
  
  // Apply blur to the image
  img.style.filter = `blur(${BLUR_AMOUNT})`;
  img.style.webkitFilter = `blur(${BLUR_AMOUNT})`;
  
  // Create overlay with warning
  const overlay = document.createElement('div');
  overlay.className = 'ai-filter-image-overlay';
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  overlay.style.color = 'white';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.textAlign = 'center';
  overlay.style.padding = '10px';
  overlay.style.zIndex = '9999';
  overlay.style.fontSize = '14px';
  
  // Add warning message
  overlay.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
    <strong>Content Filtered</strong>
    <p>This image was detected to contain ${reason}</p>
    <button class="ai-filter-show-button" style="background-color: rgba(255,255,255,0.2); border: 1px solid white; color: white; padding: 4px 8px; margin-top: 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Show Image</button>
  `;
  
  // Get the parent of the image
  const parent = img.parentNode;
  
  // Insert our container in place of the image
  parent.insertBefore(container, img);
  
  // Move the image into our container
  container.appendChild(img);
  
  // Add overlay to the container
  container.appendChild(overlay);
  
  // Add event listener to show button
  const showButton = overlay.querySelector('.ai-filter-show-button');
  showButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove blur
    img.style.filter = 'none';
    img.style.webkitFilter = 'none';
    
    // Hide overlay
    overlay.style.display = 'none';
    
    // Log that user viewed the image
    logFilterEvent('image_viewed', {
      url: window.location.href,
      imgSrc: img.src.substring(0, 100), // Truncate long data URLs
      reason: reason
    });
  });
}

/**
 * Set up mutation observer to detect new images
 */
function observeImageChanges() {
  const observer = new MutationObserver((mutations) => {
    let newImages = false;
    
    mutations.forEach((mutation) => {
      // Check for added nodes
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          // Check if the node is an element
          if (node.nodeType === Node.ELEMENT_NODE) {
            // If the node is an image
            if (node.tagName === 'IMG' && shouldProcessImage(node)) {
              newImages = true;
              processImage(node);
            }
            
            // Check for images inside the added node
            const images = node.querySelectorAll('img');
            if (images.length > 0) {
              newImages = true;
              images.forEach((img) => {
                if (shouldProcessImage(img)) {
                  processImage(img);
                }
              });
            }
          }
        });
      }
      
      // Check for attribute changes on images (src changes)
      if (mutation.type === 'attributes' && 
          mutation.attributeName === 'src' && 
          mutation.target.tagName === 'IMG') {
        const img = mutation.target;
        if (shouldProcessImage(img)) {
          newImages = true;
          processImage(img);
        }
      }
    });
    
    // If new images were found, log it
    if (newImages) {
      console.log('New images detected and processed');
    }
  });
  
  // Start observing
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
}

/**
 * Get extension settings from background script
 * @returns {Promise<Object>} The extension settings
 */
async function getExtensionSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      resolve(response.settings || {
        enabled: true,
        nsfwFilter: true,
        sensitivity: 'medium'
      });
    });
  });
}

/**
 * Load the NSFW model
 * @returns {Promise<Object>} The loaded model
 */
async function loadNSFWModel() {
  try {
    // Check if window.nsfwjs is available
    if (!window.nsfwjs) {
      // Inject the script if not available
      const scriptElement = document.createElement('script');
      scriptElement.src = chrome.runtime.getURL('models/nsfw-model.js');
      document.head.appendChild(scriptElement);
      
      // Wait for the script to load
      await new Promise((resolve) => {
        scriptElement.onload = resolve;
      });
    }
    
    // Load the model
    return await window.nsfwjs.load();
  } catch (error) {
    console.error('Failed to load NSFW model:', error);
    return null;
  }
}

/**
 * Log a filter event
 * @param {string} eventType - The type of event
 * @param {Object} eventData - Data related to the event
 */
function logFilterEvent(eventType, eventData) {
  chrome.runtime.sendMessage({
    type: 'LOG_EVENT',
    eventType,
    eventData
  });
}

// Export functions for use in content script
if (typeof module !== 'undefined') {
  module.exports = {
    initializeImageFiltering,
    processImages,
    processImage,
    analyzeImage
  };
}
