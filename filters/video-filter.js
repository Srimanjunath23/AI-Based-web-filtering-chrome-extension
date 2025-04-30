// Check if already initialized
if (window.__videoFilterInitialized) {
  throw new Error('Video filter already initialized');
}
window.__videoFilterInitialized = true;

(function() {
  'use strict';

  /**
   * Video filtering module for detecting and blurring NSFW video frames
   */

  // Configuration
  const BLUR_AMOUNT = '30px';  // Default blur amount for NSFW videos
  const FRAME_CHECK_INTERVAL = 1000;  // Milliseconds between frame checks
  const MIN_VIDEO_SIZE = 120;  // Minimum video size to analyze (width/height)
  const DETECTION_CONFIDENCE = {
    low: 0.75,    // Low sensitivity (more permissive)
    medium: 0.6,  // Medium sensitivity (default)
    high: 0.45    // High sensitivity (more restrictive)
  };

  // Tracking processed videos
  const processedVideos = new Set();
  const videoAnalysisIntervals = new Map();
  const videoFrameCanvas = document.createElement('canvas');
  const videoFrameContext = videoFrameCanvas.getContext('2d');

  /**
   * Initialize video filtering
   * @param {Object} settings - The extension settings
   */
  function initializeVideoFiltering(settings) {
    if (!settings.enabled || (!settings.nsfwFilter && !settings.violenceFilter)) return;
    
    // Process existing videos
    processVideos();
    
    // Set up mutation observer to detect new videos
    observeVideoChanges();
    
    // Special handling for common video platforms
    handleSpecialPlatforms();
  }

  /**
   * Process all videos on the page
   */
  function processVideos() {
    const videos = document.querySelectorAll('video');
    
    for (const video of videos) {
      if (shouldProcessVideo(video)) {
        processVideo(video);
      }
    }
    
    // Look for iframes that might contain videos
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      processVideoIframe(iframe);
    }
  }

  /**
   * Determine if a video should be processed
   * @param {HTMLVideoElement} video - The video element to check
   * @returns {boolean} Whether the video should be processed
   */
  function shouldProcessVideo(video) {
    // Skip if already processed
    if (video.dataset.aiFiltered) {
      return false;
    }
    
    // Skip tiny videos
    if (video.videoWidth < MIN_VIDEO_SIZE || video.videoHeight < MIN_VIDEO_SIZE) {
      // Mark as processed to avoid rechecking
      video.dataset.aiFiltered = 'skipped';
      return false;
    }
    
    // Skip videos with specific classes that are likely UI elements
    if (video.classList.contains('background-video') || 
        video.classList.contains('ui-video') || 
        video.classList.contains('logo-video')) {
      video.dataset.aiFiltered = 'skipped';
      return false;
    }
    
    return true;
  }

  /**
   * Process a single video
   * @param {HTMLVideoElement} video - The video element to process
   */
  function processVideo(video) {
    // Mark as being processed
    video.dataset.aiFiltered = 'processing';
    
    // Set up canvas for frame extraction
    ensureVideoCanvasSize(video);
    
    // Set up interval to analyze video frames
    setupVideoAnalysisInterval(video);
    
    // Add event listeners for video events
    addVideoEventListeners(video);
  }

  /**
   * Process an iframe that might contain a video
   * @param {HTMLIFrameElement} iframe - The iframe to check
   */
  function processVideoIframe(iframe) {
    // Check if this is a video embed from popular platforms
    const src = iframe.src || '';
    
    // YouTube embed
    if (src.includes('youtube.com/embed/') || src.includes('youtube-nocookie.com/embed/')) {
      // Mark for special handling
      iframe.dataset.aiVideoEmbed = 'youtube';
      
      // Add a mutation observer to the parent document to watch for when the video is actually loaded
      const observer = new MutationObserver(() => {
        // Try to find the video element inside the iframe
        try {
          const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
          const video = iframeDocument.querySelector('video');
          
          if (video && !video.dataset.aiFiltered) {
            processVideo(video);
            observer.disconnect();
          }
        } catch (e) {
          // Cross-origin restrictions might prevent access
          console.log('Could not access iframe content due to cross-origin restrictions');
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    // Vimeo embed
    if (src.includes('player.vimeo.com/video/')) {
      iframe.dataset.aiVideoEmbed = 'vimeo';
      // Similar handling as YouTube
    }
    
    // For other potential video iframes, add a placeholder cover just in case
    if (!iframe.dataset.aiVideoEmbed && 
        (src.includes('video') || src.includes('player') || src.includes('embed'))) {
      iframe.dataset.aiVideoEmbed = 'generic';
      addIframeOverlay(iframe);
    }
  }

  /**
   * Add a protective overlay to iframes that might load videos
   * @param {HTMLIFrameElement} iframe - The iframe to protect
   */
  function addIframeOverlay(iframe) {
    // Create container for positioning
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'ai-filter-iframe-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    overlay.style.color = 'white';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.textAlign = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.cursor = 'pointer';
    
    overlay.innerHTML = `
      <div>
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="10 8 16 12 10 16 10 8"></polygon>
        </svg>
        <p style="margin-top: 8px;">Click to load video<br>(Content will be monitored)</p>
      </div>
    `;
    
    // Get parent and insert our container
    const parent = iframe.parentNode;
    parent.insertBefore(container, iframe);
    container.appendChild(iframe);
    container.appendChild(overlay);
    
    // Add click handler to remove overlay when user wants to play
    overlay.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
  }

  /**
   * Set up an interval to periodically analyze video frames
   * @param {HTMLVideoElement} video - The video to analyze
   */
  function setupVideoAnalysisInterval(video) {
    // Clear any existing interval
    if (videoAnalysisIntervals.has(video)) {
      clearInterval(videoAnalysisIntervals.get(video));
    }
    
    // Set up new interval
    const intervalId = setInterval(() => {
      // Only analyze if video is playing
      if (!video.paused && !video.ended && video.readyState >= 2) {
        analyzeVideoFrame(video);
      }
    }, FRAME_CHECK_INTERVAL);
    
    // Store interval ID for cleanup
    videoAnalysisIntervals.set(video, intervalId);
  }

  /**
   * Add event listeners to handle video state changes
   * @param {HTMLVideoElement} video - The video element
   */
  function addVideoEventListeners(video) {
    // Clean up on video removal
    video.addEventListener('remove', () => {
      if (videoAnalysisIntervals.has(video)) {
        clearInterval(videoAnalysisIntervals.get(video));
        videoAnalysisIntervals.delete(video);
      }
    });
    
    // Handle video play events
    video.addEventListener('play', () => {
      // Ensure we're analyzing frames when video plays
      if (!videoAnalysisIntervals.has(video)) {
        setupVideoAnalysisInterval(video);
      }
    });
  }

  /**
   * Analyze a single frame from the video
   * @param {HTMLVideoElement} video - The video to analyze
   */
  async function analyzeVideoFrame(video) {
    try {
      // Get extension settings
      const settings = await getExtensionSettings();
      
      // Skip if extension is disabled or if neither NSFW nor violence filtering is enabled
      if (!settings.enabled || (!settings.nsfwFilter && !settings.violenceFilter)) {
        return;
      }
      
      // Ensure canvas is the right size
      ensureVideoCanvasSize(video);
      
      // Draw current frame on canvas
      videoFrameContext.drawImage(video, 0, 0, videoFrameCanvas.width, videoFrameCanvas.height);
      
      // Check for inappropriate content
      let isInappropriate = false;
      let reason = '';
      
      // Check for NSFW content with NSFW.js
      if (settings.nsfwFilter) {
        const nsfwResult = await checkFrameForNSFW(videoFrameCanvas, settings);
        if (nsfwResult.inappropriate) {
          isInappropriate = true;
          reason = nsfwResult.reason;
        }
      }
      
      // Check for violence with YOLO
      if (!isInappropriate && settings.violenceFilter) {
        const violenceResult = await checkFrameForViolence(videoFrameCanvas, settings);
        if (violenceResult.inappropriate) {
          isInappropriate = true;
          reason = violenceResult.reason;
        }
      }
      
      // If inappropriate content is detected
      if (isInappropriate) {
        // Blur the video and show warning
        blurVideo(video, reason);
        
        // Pause the video
        video.pause();
        
        // Log the event
        logFilterEvent('video_blocked', {
          url: window.location.href,
          reason: reason
        });
      }
    } catch (error) {
      console.error('Error analyzing video frame:', error);
    }
  }

  /**
   * Ensure the canvas is the right size for the video
   * @param {HTMLVideoElement} video - The video to match
   */
  function ensureVideoCanvasSize(video) {
    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;
    
    if (videoFrameCanvas.width !== width || videoFrameCanvas.height !== height) {
      videoFrameCanvas.width = width;
      videoFrameCanvas.height = height;
    }
  }

  /**
   * Check a video frame for NSFW content using NSFW.js
   * @param {HTMLCanvasElement} canvas - Canvas with the video frame
   * @param {Object} settings - Extension settings
   * @returns {Object} Result of the check
   */
  async function checkFrameForNSFW(canvas, settings) {
    try {
      // Get or load NSFW model
      const nsfwModel = await loadNSFWModel();
      
      if (!nsfwModel) {
        return { inappropriate: false };
      }
      
      // Classify the frame
      const predictions = await nsfwModel.classify(canvas);
      
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
      
      // Determine if the frame is inappropriate
      if (pornProb > threshold) {
        return { inappropriate: true, reason: 'explicit content', confidence: pornProb };
      } else if (hentaiProb > threshold) {
        return { inappropriate: true, reason: 'explicit animated content', confidence: hentaiProb };
      } else if (sexyProb > threshold && settings.sensitivity === 'high') {
        return { inappropriate: true, reason: 'suggestive content', confidence: sexyProb };
      }
      
      return { inappropriate: false };
    } catch (error) {
      console.error('Error checking frame for NSFW content:', error);
      return { inappropriate: false };
    }
  }

  /**
   * Check a video frame for violence using YOLO
   * @param {HTMLCanvasElement} canvas - Canvas with the video frame
   * @param {Object} settings - Extension settings
   * @returns {Object} Result of the check
   */
  async function checkFrameForViolence(canvas, settings) {
    try {
      // Get or load YOLO model
      const yoloModel = await loadYOLOModel();
      
      if (!yoloModel) {
        return { inappropriate: false };
      }
      
      // Detect objects in the frame
      const detections = await yoloModel.detect(canvas);
      
      // Determine confidence threshold based on sensitivity setting
      let threshold = DETECTION_CONFIDENCE.medium; // Default
      if (settings.sensitivity === 'low') {
        threshold = DETECTION_CONFIDENCE.low;
      } else if (settings.sensitivity === 'high') {
        threshold = DETECTION_CONFIDENCE.high;
      }
      
      // Check for violent content in detections
      const violentClasses = ['weapon', 'gun', 'knife', 'blood', 'violence', 'gore'];
      
      for (const detection of detections) {
        if (violentClasses.includes(detection.class.toLowerCase()) && detection.confidence > threshold) {
          return { 
            inappropriate: true, 
            reason: 'violent content', 
            confidence: detection.confidence,
            detectedClass: detection.class
          };
        }
      }
      
      return { inappropriate: false };
    } catch (error) {
      console.error('Error checking frame for violence:', error);
      return { inappropriate: false };
    }
  }

  /**
   * Apply blur effect and warning overlay to an inappropriate video
   * @param {HTMLVideoElement} video - The video to blur
   * @param {string} reason - The reason for blurring
   */
  function blurVideo(video, reason) {
    // Skip if already blurred
    if (video.dataset.aiFiltered === 'blurred') {
      return;
    }
    
    // Mark as blurred
    video.dataset.aiFiltered = 'blurred';
    
    // Create a container to wrap the video
    const container = document.createElement('div');
    container.className = 'ai-filter-video-container';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    
    // Apply blur to the video
    video.style.filter = `blur(${BLUR_AMOUNT})`;
    video.style.webkitFilter = `blur(${BLUR_AMOUNT})`;
    
    // Create overlay with warning
    const overlay = document.createElement('div');
    overlay.className = 'ai-filter-video-overlay';
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
    overlay.style.padding = '20px';
    overlay.style.zIndex = '9999';
    overlay.style.fontSize = '16px';
    
    // Add warning message
    overlay.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <h2 style="margin-bottom: 12px; font-size: 20px; font-weight: bold;">Potentially Inappropriate Content</h2>
      <p style="margin-bottom: 16px;">This video was detected to contain ${reason}</p>
      <div style="display: flex; gap: 10px;">
        <button class="ai-filter-show-button" style="background-color: rgba(255,255,255,0.2); border: 1px solid white; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;">Show Video</button>
        <button class="ai-filter-block-button" style="background-color: #e74c3c; border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;">Block Video</button>
      </div>
    `;
    
    // Get the parent of the video
    const parent = video.parentNode;
    
    // Handle special cases where the video might be in a complex player
    const isVideoPlayerParent = parent.classList.contains('video-player') || 
                               parent.classList.contains('player-container') ||
                               parent.tagName === 'YOUTUBE-PLAYER';
    
    if (isVideoPlayerParent) {
      // Insert overlay as a sibling to the player
      parent.parentNode.insertBefore(container, parent.nextSibling);
      
      // Position container absolutely over the player
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.pointerEvents = 'auto';
      
      // Add overlay to container
      container.appendChild(overlay);
    } else {
      // Standard case - insert our container in place of the video
      parent.insertBefore(container, video);
      
      // Move the video into our container
      container.appendChild(video);
      
      // Add overlay to the container
      container.appendChild(overlay);
    }
    
    // Add event listener to show button
    const showButton = overlay.querySelector('.ai-filter-show-button');
    showButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Remove blur
      video.style.filter = 'none';
      video.style.webkitFilter = 'none';
      
      // Hide overlay
      overlay.style.display = 'none';
      
      // Resume video playback
      video.play();
      
      // Mark as viewed
      video.dataset.aiFiltered = 'viewed';
      
      // Log that user viewed the video
      logFilterEvent('video_viewed', {
        url: window.location.href,
        reason: reason
      });
    });
    
    // Add event listener to block button
    const blockButton = overlay.querySelector('.ai-filter-block-button');
    blockButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Remove video and container
      if (isVideoPlayerParent) {
        // For special player cases
        container.remove();
        video.remove();
      } else {
        // For standard cases
        container.remove();
      }
      
      // Log that user blocked the video
      logFilterEvent('video_removed', {
        url: window.location.href,
        reason: reason
      });
    });
  }

  /**
   * Set up mutation observer to detect new videos
   */
  function observeVideoChanges() {
    const observer = new MutationObserver((mutations) => {
      let newVideos = false;
      
      mutations.forEach((mutation) => {
        // Check for added nodes
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            // Check if the node is an element
            if (node.nodeType === Node.ELEMENT_NODE) {
              // If the node is a video
              if (node.tagName === 'VIDEO' && shouldProcessVideo(node)) {
                newVideos = true;
                processVideo(node);
              }
              
              // If the node is an iframe
              if (node.tagName === 'IFRAME') {
                processVideoIframe(node);
              }
              
              // Check for videos inside the added node
              const videos = node.querySelectorAll('video');
              if (videos.length > 0) {
                newVideos = true;
                videos.forEach((video) => {
                  if (shouldProcessVideo(video)) {
                    processVideo(video);
                  }
                });
              }
              
              // Check for iframes inside the added node
              const iframes = node.querySelectorAll('iframe');
              if (iframes.length > 0) {
                iframes.forEach(processVideoIframe);
              }
            }
          });
        }
        
        // Check for attribute changes on videos
        if (mutation.type === 'attributes' && 
            mutation.target.tagName === 'VIDEO' &&
            ['src', 'currentSrc'].includes(mutation.attributeName)) {
          const video = mutation.target;
          if (shouldProcessVideo(video)) {
            newVideos = true;
            processVideo(video);
          }
        }
      });
      
      // If new videos were found, log it
      if (newVideos) {
        console.log('New videos detected and processed');
      }
    });
    
    // Start observing
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'currentSrc']
    });
  }

  /**
   * Handle special cases for video platforms
   */
  function handleSpecialPlatforms() {
    // Check if this is YouTube
    if (window.location.hostname.includes('youtube.com')) {
      setupYouTubeHandler();
    }
    
    // Check if this is Vimeo
    if (window.location.hostname.includes('vimeo.com')) {
      setupVimeoHandler();
    }
    
    // Check if this is a news site with video players
    if (window.location.hostname.includes('cnn.com') || 
        window.location.hostname.includes('foxnews.com') ||
        window.location.hostname.includes('bbc.com') ||
        window.location.hostname.includes('nytimes.com')) {
      setupNewsVideoHandler();
    }
  }

  /**
   * Set up special handling for YouTube
   */
  function setupYouTubeHandler() {
    // YouTube loads videos dynamically, so we need to check periodically
    const checkYouTubeInterval = setInterval(() => {
      const videoElement = document.querySelector('video.html5-main-video');
      if (videoElement && !videoElement.dataset.aiFiltered) {
        processVideo(videoElement);
      }
      
      // Also look for the video player container
      const playerContainer = document.querySelector('#movie_player');
      if (playerContainer) {
        // YouTube might reload the video element, so observe changes to the player
        const playerObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
              const videoElement = document.querySelector('video.html5-main-video');
              if (videoElement && !videoElement.dataset.aiFiltered) {
                processVideo(videoElement);
              }
            }
          });
        });
        
        playerObserver.observe(playerContainer, {
          childList: true,
          subtree: true
        });
        
        // We only need to set up the observer once
        clearInterval(checkYouTubeInterval);
      }
    }, 1000);
    
    // Clean up interval after 30 seconds if nothing is found
    setTimeout(() => {
      clearInterval(checkYouTubeInterval);
    }, 30000);
  }

  /**
   * Set up special handling for Vimeo
   */
  function setupVimeoHandler() {
    // Similar approach to YouTube
    const checkVimeoInterval = setInterval(() => {
      const videoElement = document.querySelector('video');
      if (videoElement && !videoElement.dataset.aiFiltered) {
        processVideo(videoElement);
        clearInterval(checkVimeoInterval);
      }
    }, 1000);
    
    // Clean up interval after 30 seconds if nothing is found
    setTimeout(() => {
      clearInterval(checkVimeoInterval);
    }, 30000);
  }

  /**
   * Set up special handling for news sites with video players
   */
  function setupNewsVideoHandler() {
    // News sites often load videos in iframes or custom players
    const videoContainerSelectors = [
      '.video-player', 
      '.player-container', 
      '[data-video-player]',
      '.video-js',
      '.jwplayer'
    ];
    
    // Check for video containers
    const checkNewsVideoInterval = setInterval(() => {
      let found = false;
      
      for (const selector of videoContainerSelectors) {
        const containers = document.querySelectorAll(selector);
        
        for (const container of containers) {
          // Check for video inside container
          const video = container.querySelector('video');
          if (video && !video.dataset.aiFiltered) {
            processVideo(video);
            found = true;
          }
        }
      }
      
      // Also check for direct video elements
      const videos = document.querySelectorAll('video');
      for (const video of videos) {
        if (!video.dataset.aiFiltered) {
          processVideo(video);
          found = true;
        }
      }
      
      if (found) {
        clearInterval(checkNewsVideoInterval);
      }
    }, 1000);
    
    // Clean up interval after 30 seconds if nothing is found
    setTimeout(() => {
      clearInterval(checkNewsVideoInterval);
    }, 30000);
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
          violenceFilter: true,
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
   * Load the YOLO model
   * @returns {Promise<Object>} The loaded model
   */
  async function loadYOLOModel() {
    try {
      // Check if window.yolojs is available
      if (!window.yolojs) {
        // Inject the script if not available
        const scriptElement = document.createElement('script');
        scriptElement.src = chrome.runtime.getURL('models/yolo-model.js');
        document.head.appendChild(scriptElement);
        
        // Wait for the script to load
        await new Promise((resolve) => {
          scriptElement.onload = resolve;
        });
      }
      
      // Load the model
      return await window.yolojs.load();
    } catch (error) {
      console.error('Failed to load YOLO model:', error);
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

  // Initialize when DOM is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    getExtensionSettings().then(initializeVideoFiltering);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      getExtensionSettings().then(initializeVideoFiltering);
    });
  }

  // Export functions for use in content script
  if (typeof module !== 'undefined') {
    module.exports = {
      initializeVideoFiltering,
      processVideos,
      processVideo,
      analyzeVideoFrame
    };
  }
})();