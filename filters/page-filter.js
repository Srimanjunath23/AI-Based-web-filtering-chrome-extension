'use strict';

/**
 * Page filtering module for detecting and blocking inappropriate web content
 */

// Configuration
const SCAN_INTERVAL = 2000;  // Milliseconds between page rescans
const MIN_TEXT_LENGTH = 100; // Minimum text length to analyze
const DETECTION_CONFIDENCE = {
  low: 0.8,     // Low sensitivity (more permissive)
  medium: 0.7,  // Medium sensitivity (default)
  high: 0.6     // High sensitivity (more restrictive)
};

// Track last scan time to avoid too frequent scans
let lastScanTime = 0;
let pageIsBlocked = false;
let isAnalyzingContent = false;
let contentChangeObserver = null;
let pageAnalysisTimer = null;

/**
 * Initialize page content filtering
 * @param {Object} settings - The extension settings
 */
function initializePageFiltering(settings) {
  if (!settings.enabled) return;
  
  // Initial page scan
  analyzePageContent();
  
  // Set up mutation observer to detect content changes
  observeContentChanges();
  
  // Setup periodic rescans for dynamically loaded content
  setupPeriodicRescans();
}

/**
 * Analyze page content for inappropriate material
 */
async function analyzePageContent() {
  // Skip if page is already blocked or analysis is in progress
  if (pageIsBlocked || isAnalyzingContent) return;
  
  // Throttle scans to avoid performance issues
  const now = Date.now();
  if (now - lastScanTime < SCAN_INTERVAL) return;
  lastScanTime = now;
  
  isAnalyzingContent = true;
  
  try {
    // Get extension settings
    const settings = await getExtensionSettings();
    
    // Skip if extension is disabled
    if (!settings.enabled) {
      isAnalyzingContent = false;
      return;
    }
    
    // Extract text content from the page
    const pageText = extractPageText();
    
    // Skip if not enough text to analyze
    if (pageText.length < MIN_TEXT_LENGTH) {
      isAnalyzingContent = false;
      return;
    }
    
    // Get the current URL
    const url = window.location.href;
    
    // Analyze page for different types of inappropriate content
    const analysisResults = {
      containsNSFW: settings.nsfwFilter ? await checkForNSFWContent(pageText, settings) : false,
      containsViolence: settings.violenceFilter ? await checkForViolentContent(pageText, settings) : false,
      containsSuicide: settings.suicideFilter ? await checkForSuicidalContent(pageText, settings) : false,
      isEducational: settings.educationalMode ? await checkIfEducationalContent(pageText) : false
    };
    
    // Determine if the page should be blocked
    const shouldBlock = (
      (analysisResults.containsNSFW || 
       analysisResults.containsViolence || 
       analysisResults.containsSuicide) && 
      !analysisResults.isEducational
    );
    
    if (shouldBlock) {
      // Determine the reason for blocking
      let blockReason = '';
      if (analysisResults.containsNSFW) blockReason = 'nsfw';
      else if (analysisResults.containsViolence) blockReason = 'violence';
      else if (analysisResults.containsSuicide) blockReason = 'suicide';
      
      // Block the page
      blockPage(blockReason, url);
      
      // Log the blocked page
      logFilterEvent('page_blocked', {
        url: url,
        reason: blockReason,
        analysis: analysisResults
      });
    }
  } catch (error) {
    console.error('Error analyzing page content:', error);
  }
  
  isAnalyzingContent = false;
}

/**
 * Extract text content from the page
 * @returns {string} The page text content
 */
function extractPageText() {
  // Function to get text from an element excluding scripts, styles, etc.
  function getTextFromElement(element) {
    // Skip hidden elements
    if (element.offsetParent === null && element.tagName !== 'BODY') {
      return '';
    }
    
    // Skip script, style, noscript, and other non-content elements
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME', 'OBJECT'].includes(element.tagName)) {
      return '';
    }
    
    // Get text content
    let text = '';
    
    // Check if this is a text node
    if (element.nodeType === Node.TEXT_NODE) {
      text = element.textContent.trim();
    } else if (element.nodeType === Node.ELEMENT_NODE) {
      // For regular elements, process their text content
      
      // Get text from attributes that might contain content
      if (element.hasAttribute('title')) {
        text += ' ' + element.getAttribute('title');
      }
      if (element.hasAttribute('alt')) {
        text += ' ' + element.getAttribute('alt');
      }
      
      // Special handling for input elements
      if (element.tagName === 'INPUT' && 
          ['text', 'search'].includes(element.type) && 
          element.value) {
        text += ' ' + element.value;
      }
      
      // Recursively process child nodes
      for (const child of element.childNodes) {
        text += ' ' + getTextFromElement(child);
      }
    }
    
    return text.trim();
  }
  
  // Start extraction from the body
  const body = document.body;
  if (!body) return '';
  
  return getTextFromElement(body)
    .replace(/\s+/g, ' ')  // Replace multiple spaces with a single space
    .trim();
}

/**
 * Check if page content contains NSFW material
 * @param {string} pageText - The text content of the page
 * @param {Object} settings - The extension settings
 * @returns {Promise<boolean>} True if NSFW content detected
 */
async function checkForNSFWContent(pageText, settings) {
  try {
    // Keyword analysis
    const nsfwKeywords = [
      'porn', 'xxx', 'sex video', 'nude', 'naked', 'pornography', 'adult video',
      'erotic', 'explicit', 'nsfw', 'sexual content', 'x-rated', 'onlyfans',
      'dildo', 'vibrator', 'masturbate', 'blowjob', 'handjob', 'anal sex',
      'fetish', 'bdsm', 'escort service', 'prostitution', 'hardcore'
    ];
    
    // Simple keyword matching (could be improved with regular expressions)
    const lowercaseText = pageText.toLowerCase();
    const matchedKeywords = nsfwKeywords.filter(keyword => 
      lowercaseText.includes(keyword.toLowerCase())
    );
    
    // If multiple explicit keywords are found, likely NSFW
    if (matchedKeywords.length >= 3) {
      return true;
    }
    
    // For more ambiguous cases, use BERT model
    if (matchedKeywords.length > 0) {
      // Get confidence threshold based on sensitivity setting
      let confidenceThreshold = DETECTION_CONFIDENCE.medium;
      if (settings.sensitivity === 'low') {
        confidenceThreshold = DETECTION_CONFIDENCE.low;
      } else if (settings.sensitivity === 'high') {
        confidenceThreshold = DETECTION_CONFIDENCE.high;
      }
      
      // Perform NLP analysis on the page context
      const analysis = await analyzeTextWithBERT(pageText);
      
      if (analysis.classification === 'nsfw' && analysis.confidence >= confidenceThreshold) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking for NSFW content:', error);
    return false;
  }
}

/**
 * Check if page content contains violent material
 * @param {string} pageText - The text content of the page
 * @param {Object} settings - The extension settings
 * @returns {Promise<boolean>} True if violent content detected
 */
async function checkForViolentContent(pageText, settings) {
  try {
    // Keyword analysis
    const violentKeywords = [
      'kill', 'murder', 'stab', 'shoot', 'torture', 'violence', 'blood', 'gore',
      'attack', 'assassinate', 'slaughter', 'bomb', 'terror', 'weapon', 'assault',
      'graphic violence', 'beheading', 'massacre', 'terrorist attack', 'shooting',
      'brutal', 'bloodshed', 'execution', 'mass shooting', 'snuff', 'killing'
    ];
    
    // Simple keyword matching
    const lowercaseText = pageText.toLowerCase();
    const matchedKeywords = violentKeywords.filter(keyword => 
      lowercaseText.includes(keyword.toLowerCase())
    );
    
    // If multiple explicit keywords are found, likely violent content
    if (matchedKeywords.length >= 3) {
      return true;
    }
    
    // For more ambiguous cases, use BERT model
    if (matchedKeywords.length > 0) {
      // Get confidence threshold based on sensitivity setting
      let confidenceThreshold = DETECTION_CONFIDENCE.medium;
      if (settings.sensitivity === 'low') {
        confidenceThreshold = DETECTION_CONFIDENCE.low;
      } else if (settings.sensitivity === 'high') {
        confidenceThreshold = DETECTION_CONFIDENCE.high;
      }
      
      // Perform NLP analysis on the page context
      const analysis = await analyzeTextWithBERT(pageText);
      
      if (analysis.classification === 'violence' && analysis.confidence >= confidenceThreshold) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking for violent content:', error);
    return false;
  }
}

/**
 * Check if page content contains suicidal or self-harm material
 * @param {string} pageText - The text content of the page
 * @param {Object} settings - The extension settings
 * @returns {Promise<boolean>} True if suicidal content detected
 */
async function checkForSuicidalContent(pageText, settings) {
  try {
    // Keyword analysis
    const suicideKeywords = [
      'suicide', 'kill myself', 'end my life', 'self harm', 'hurt myself',
      'commit suicide', 'suicidal', 'take my own life', 'die by suicide',
      'how to commit suicide', 'methods of suicide', 'suicide note',
      'suicide plan', 'wrist cutting', 'overdose', 'hanging myself',
      'suicidal thoughts', 'want to die', 'don\'t want to live'
    ];
    
    // Simple keyword matching
    const lowercaseText = pageText.toLowerCase();
    const matchedKeywords = suicideKeywords.filter(keyword => 
      lowercaseText.includes(keyword.toLowerCase())
    );
    
    // If multiple explicit keywords are found, likely suicidal content
    if (matchedKeywords.length >= 2) {
      return true;
    }
    
    // For more ambiguous cases, use BERT model
    if (matchedKeywords.length > 0) {
      // Get confidence threshold based on sensitivity setting
      let confidenceThreshold = DETECTION_CONFIDENCE.medium;
      if (settings.sensitivity === 'low') {
        confidenceThreshold = DETECTION_CONFIDENCE.low;
      } else if (settings.sensitivity === 'high') {
        confidenceThreshold = DETECTION_CONFIDENCE.high;
      }
      
      // Perform NLP analysis on the page context
      const analysis = await analyzeTextWithBERT(pageText);
      
      if (analysis.classification === 'suicide' && analysis.confidence >= confidenceThreshold) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking for suicidal content:', error);
    return false;
  }
}

/**
 * Check if page content is educational
 * @param {string} pageText - The text content of the page
 * @returns {Promise<boolean>} True if educational content detected
 */
async function checkIfEducationalContent(pageText) {
  try {
    // Keyword analysis for educational content
    const educationalKeywords = [
      'education', 'research', 'study', 'medical', 'biology', 'science',
      'health', 'documentary', 'history', 'psychology', 'therapy',
      'treatment', 'anatomy', 'physiology', 'academic', 'university',
      'school', 'college', 'course', 'lecture', 'analysis', 'paper',
      'journal', 'statistics', 'data', 'report', 'review', 'exam',
      'literature', 'article', 'publication', 'study', 'dissertation',
      'human body', 'cancer', 'disease', 'health condition', 'symptoms',
      'breast cancer', 'sex education', 'reproductive health', 'sexuality',
      'mental health', 'psychology', 'depression treatment', 'therapy',
      'lgbt', 'lgbtq', 'gender identity', 'sexual orientation'
    ];
    
    // Check for educational domain suffixes
    const educationalDomains = [
      '.edu', 'education', 'academic', 'school', 'university', 'college',
      'research', 'science', 'health', 'medical', 'gov'
    ];
    
    // Check domain
    const hostname = window.location.hostname.toLowerCase();
    const isEducationalDomain = educationalDomains.some(domain => hostname.includes(domain));
    
    // If it's clearly an educational domain, return true
    if (isEducationalDomain) {
      return true;
    }
    
    // Simple keyword matching
    const lowercaseText = pageText.toLowerCase();
    const matchedKeywords = educationalKeywords.filter(keyword => 
      lowercaseText.includes(keyword.toLowerCase())
    );
    
    // If multiple educational keywords are found, likely educational content
    if (matchedKeywords.length >= 5) {
      return true;
    }
    
    // For more ambiguous cases, use BERT model
    if (matchedKeywords.length > 0) {
      // Perform NLP analysis on the page context
      const analysis = await analyzeTextWithBERT(pageText);
      
      if (analysis.classification === 'educational' && analysis.confidence >= 0.6) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if content is educational:', error);
    return false;
  }
}

/**
 * Analyze text using BERT model
 * @param {string} text - The text to analyze
 * @returns {Promise<Object>} Analysis result with classification and confidence
 */
async function analyzeTextWithBERT(text) {
  try {
    // For long texts, extract a representative sample
    const textSample = extractTextSample(text);
    
    // Use background script to analyze the text
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'ANALYZE_TEXT',
        text: textSample
      }, (response) => {
        if (response && response.success) {
          resolve(response.analysis);
        } else {
          // Fallback to a simpler analysis
          resolve(simplifiedTextAnalysis(textSample));
        }
      });
    });
  } catch (error) {
    console.error('Error analyzing text with BERT:', error);
    return simplifiedTextAnalysis(text);
  }
}

/**
 * Extract a representative sample from a long text
 * @param {string} text - The full text
 * @returns {string} A sample of the text
 */
function extractTextSample(text) {
  const maxLength = 1000; // Maximum sample length
  
  if (text.length <= maxLength) {
    return text;
  }
  
  // Take beginning and end of the text
  const beginning = text.substring(0, maxLength / 2);
  const end = text.substring(text.length - maxLength / 2);
  
  return beginning + ' ... ' + end;
}

/**
 * Simplified text analysis when BERT is unavailable
 * @param {string} text - The text to analyze
 * @returns {Object} Analysis result with classification and confidence
 */
function simplifiedTextAnalysis(text) {
  const lowercaseText = text.toLowerCase();
  
  // Define category keywords
  const categories = {
    nsfw: [
      'porn', 'xxx', 'sex video', 'nude', 'naked', 'pornography', 'adult video',
      'erotic', 'explicit', 'nsfw', 'sexual content', 'x-rated', 'onlyfans'
    ],
    violence: [
      'kill', 'murder', 'stab', 'shoot', 'torture', 'violence', 'blood', 'gore',
      'attack', 'assassinate', 'slaughter', 'bomb', 'terror', 'weapon', 'assault'
    ],
    suicide: [
      'suicide', 'kill myself', 'end my life', 'self harm', 'hurt myself',
      'commit suicide', 'suicidal', 'take my own life', 'die by suicide'
    ],
    educational: [
      'education', 'research', 'study', 'medical', 'biology', 'science',
      'health', 'documentary', 'history', 'psychology', 'therapy',
      'treatment', 'anatomy', 'physiology', 'academic', 'university'
    ]
  };
  
  // Count keyword matches for each category
  const categoryCounts = {};
  let totalMatches = 0;
  
  for (const [category, keywords] of Object.entries(categories)) {
    const matches = keywords.filter(keyword => lowercaseText.includes(keyword)).length;
    categoryCounts[category] = matches;
    totalMatches += matches;
  }
  
  // Find category with most matches
  let topCategory = 'neutral';
  let topCount = 0;
  
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > topCount) {
      topCategory = category;
      topCount = count;
    }
  }
  
  // Calculate confidence based on proportion of matches
  const confidence = totalMatches > 0 ? topCount / totalMatches : 0;
  
  return {
    classification: topCategory,
    confidence: confidence
  };
}

/**
 * Block the page due to inappropriate content
 * @param {string} reason - The reason for blocking
 * @param {string} url - The URL being blocked
 */
function blockPage(reason, url) {
  if (pageIsBlocked) return;
  
  pageIsBlocked = true;
  
  // Construct block page URL with reason
  const blockPageUrl = chrome.runtime.getURL('pages/block.html') + 
                      `?reason=${encodeURIComponent(reason)}` + 
                      `&url=${encodeURIComponent(url)}`;
  
  // Replace entire page content with block page
  document.documentElement.innerHTML = '';
  
  // Create iframe for block page
  const iframe = document.createElement('iframe');
  iframe.src = blockPageUrl;
  iframe.style.width = '100vw';
  iframe.style.height = '100vh';
  iframe.style.border = 'none';
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.zIndex = '2147483647'; // Maximum z-index
  
  // Append iframe to page
  document.documentElement.appendChild(iframe);
  
  // Prevent any further content loading
  window.stop();
}

/**
 * Set up observer to detect content changes
 */
function observeContentChanges() {
  // Create a debounced function for analysis
  function debouncedAnalysis() {
    clearTimeout(pageAnalysisTimer);
    pageAnalysisTimer = setTimeout(() => {
      analyzePageContent();
    }, 500);
  }
  
  // Create MutationObserver
  contentChangeObserver = new MutationObserver((mutations) => {
    // Check if any significant content was added
    const significantChange = mutations.some(mutation => {
      // Check for added nodes
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          // Skip non-element nodes
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          
          // Skip small text changes
          if (node.textContent && node.textContent.length < 20) continue;
          
          // Skip script, style, etc.
          if (['SCRIPT', 'STYLE', 'LINK', 'META', 'SVG', 'PATH'].includes(node.tagName)) continue;
          
          // If we get here, this is a significant content change
          return true;
        }
      }
      return false;
    });
    
    if (significantChange) {
      debouncedAnalysis();
    }
  });
  
  // Start observing
  contentChangeObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

/**
 * Set up periodic rescans of the page
 */
function setupPeriodicRescans() {
  // Periodically check for new content
  setInterval(() => {
    if (!pageIsBlocked) {
      analyzePageContent();
    }
  }, SCAN_INTERVAL * 5);  // Less frequent than mutation-triggered scans
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
        suicideFilter: true,
        educationalMode: true,
        sensitivity: 'medium'
      });
    });
  });
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
    initializePageFiltering,
    analyzePageContent,
    checkForNSFWContent,
    checkForViolentContent,
    checkForSuicidalContent,
    checkIfEducationalContent
  };
}
