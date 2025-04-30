//updated on 1/5/25
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

// Perform the actual content analysis with educational exception checking
function performContentAnalysis() {
  const pageContent = document.body ? document.body.innerText.toLowerCase() : '';
  const url = window.location.href;
  const pageTitle = document.title ? document.title.toLowerCase() : '';

  // Extended keywords for educational content
  const educationalWords = [
    'research', 'study', 'academic', 'education', 'scientific', 'analysis', 'university', 'paper', 'sex education'
  ];
  
  // Phrases related to sensitive topics in an educational context
  const educationalPhrases = [
    'research on', 'study on', 'analysis of', 'effects of', 'impact of', 'prevention of'
  ];
  
  let reason = '';
  let isEducational = false;
  
  // Check if content is likely educational
  if (extensionSettings.educationalMode) {
    const contentToCheck = pageContent + ' ' + pageTitle;
    
    // Check for educational words
    const educationalWordCount = educationalWords.filter(word => contentToCheck.includes(word)).length;
    
    // Check for educational phrases about sensitive topics (e.g., violence, suicide)
    const hasSensitivePhrases = educationalPhrases.some(phrase => {
      return (
        pageContent.includes(phrase + ' violence') ||
        pageContent.includes(phrase + ' suicide')
      );
    });
    
    // Determine if content is likely educational
    isEducational = (educationalWordCount >= 3) || hasSensitivePhrases;
    
    console.log('Educational content detected:', isEducational);
  }
  
  // Check for inappropriate content (NSFW, violence, suicide)
  const nsfwWords = ['xxx', 'porn', 'adult content', 'nsfw'];
  const violenceWords = ['kill', 'violence', 'attack'];
  const suicideWords = ['suicide', 'self-harm'];
  
  // Always block suicidal content
  if (suicideWords.some(word => pageContent.includes(word))) {
    reason = 'suicide';
  }
  // Check for NSFW content (but allow educational content like sex education)
  else if (nsfwWords.some(word => pageContent.includes(word)) && !isEducational) {
    reason = 'NSFW';
  }
  // Check for violence
  else if (violenceWords.some(word => pageContent.includes(word))) {
    reason = 'violence';
  }

  // If content is inappropriate but educational, allow access
  if (reason && isEducational && extensionSettings.educationalMode) {
    console.log('Educational content detected, allowing access');
    // Do not block the page, but still analyze images and videos
    blurImages();
  } else if (reason) {
    // Block the page if content is inappropriate and not educational
    blockPage(reason);
  } else {
    // Apply image blur for inappropriate content
    blurImages();
  }
}

// Analyze page content for inappropriate material
function analyzePageContent() {
  if (isPageBlocked) return;

  // Perform content analysis with educational exception checking
  performContentAnalysis();
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

// Blur images that are potentially unsafe
function blurImages() {
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    const imgAlt = img.alt.toLowerCase();
    const imgSrc = img.src.toLowerCase();
    
    // Keywords related to NSFW, violence, suicide
    const unsafeKeywords = ['xxx', 'porn', 'violence', 'suicide', 'self-harm', 'attack'];
    
    // Check if the image contains any unsafe keywords in alt text or src URL
    if (unsafeKeywords.some(keyword => imgAlt.includes(keyword) || imgSrc.includes(keyword))) {
      img.style.filter = 'blur(10px)';
    }
  });
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
