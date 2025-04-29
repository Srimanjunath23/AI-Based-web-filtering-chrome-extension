'use strict';

/**
 * Filter search queries and results using NLP analysis
 */

/**
 * Analyze a search query and determine if it should be blocked
 * @param {string} query - The search query to analyze
 * @param {string} searchEngine - The search engine being used
 * @param {function} sendResponse - Callback function to send the result
 */
async function analyzeSearchQuery(query, searchEngine, sendResponse) {
  try {
    // Skip analysis if query is empty
    if (!query || query.trim() === '') {
      sendResponse({ shouldBlock: false });
      return;
    }
    
    // Get current settings
    const settings = await getSettings();
    
    // Skip if extension is disabled
    if (!settings.enabled) {
      sendResponse({ shouldBlock: false });
      return;
    }
    
    // Analyze intent using BERT model
    const analysisResult = await analyzeSearchIntent(query);
    
    // Determine if the query should be blocked based on analysis and settings
    const shouldBlock = determineIfQueryShouldBeBlocked(analysisResult, settings);
    
    if (shouldBlock) {
      // Log the blocked search
      logEvent('search_blocked', {
        query,
        searchEngine,
        reason: analysisResult.category || 'harmful_intent'
      });
    }
    
    sendResponse({
      shouldBlock,
      reason: analysisResult.category,
      isEducational: analysisResult.isEducational,
      confidence: analysisResult.confidence
    });
  } catch (error) {
    console.error('Error analyzing search query:', error);
    
    // Default to not blocking on error
    sendResponse({ shouldBlock: false, error: error.message });
  }
}

/**
 * Determine if a search query should be blocked based on analysis and settings
 * @param {Object} analysis - The result of the search intent analysis
 * @param {Object} settings - The current extension settings
 * @returns {boolean} Whether the query should be blocked
 */
function determineIfQueryShouldBeBlocked(analysis, settings) {
  // If the analysis clearly says to block, respect that
  if (analysis.shouldBlock) {
    // Unless educational mode is enabled and content is educational
    if (settings.educationalMode && analysis.isEducational) {
      return false;
    }
    return true;
  }
  
  // Check specific categories based on settings
  if (analysis.category === 'nsfw' && settings.nsfwFilter) {
    return !analysis.isEducational;
  }
  
  if (analysis.category === 'violence' && settings.violenceFilter) {
    return !analysis.isEducational;
  }
  
  if (analysis.category === 'suicide' && settings.suicideFilter) {
    return !analysis.isEducational;
  }
  
  // Apply sensitivity settings
  if (analysis.isHarmful && !analysis.isEducational) {
    if (settings.sensitivity === 'high' && analysis.confidence > 0.5) {
      return true;
    }
    
    if (settings.sensitivity === 'medium' && analysis.confidence > 0.7) {
      return true;
    }
    
    if (settings.sensitivity === 'low' && analysis.confidence > 0.9) {
      return true;
    }
  }
  
  // Default to not blocking
  return false;
}

/**
 * Filter search results on page
 * @param {Document} document - The page document
 * @param {Object} settings - The current extension settings
 */
function filterSearchResults(document, settings) {
  // Identify the search engine
  const searchEngine = identifySearchEngine(window.location.hostname);
  if (!searchEngine) return;
  
  // Get search query
  const query = getSearchQuery(searchEngine);
  if (!query) return;
  
  // Get search result elements based on search engine
  const searchResults = getSearchResultElements(searchEngine);
  
  // Analyze each search result
  for (const result of searchResults) {
    analyzeSearchResult(result, query, settings);
  }
}

/**
 * Identify which search engine is being used
 * @param {string} hostname - The page hostname
 * @returns {string|null} The identified search engine or null
 */
function identifySearchEngine(hostname) {
  if (hostname.includes('google.')) return 'google';
  if (hostname.includes('bing.')) return 'bing';
  if (hostname.includes('yahoo.')) return 'yahoo';
  if (hostname.includes('duckduckgo.')) return 'duckduckgo';
  if (hostname.includes('yandex.')) return 'yandex';
  if (hostname.includes('baidu.')) return 'baidu';
  return null;
}

/**
 * Get the current search query based on the search engine
 * @param {string} searchEngine - The identified search engine
 * @returns {string|null} The search query or null
 */
function getSearchQuery(searchEngine) {
  const urlParams = new URLSearchParams(window.location.search);
  
  switch (searchEngine) {
    case 'google':
      return urlParams.get('q');
    case 'bing':
      return urlParams.get('q');
    case 'yahoo':
      return urlParams.get('p');
    case 'duckduckgo':
      return urlParams.get('q');
    case 'yandex':
      return urlParams.get('text');
    case 'baidu':
      return urlParams.get('wd');
    default:
      return null;
  }
}

/**
 * Get search result elements based on the search engine
 * @param {string} searchEngine - The identified search engine
 * @returns {NodeList|HTMLElement[]} Collection of search result elements
 */
function getSearchResultElements(searchEngine) {
  switch (searchEngine) {
    case 'google':
      return document.querySelectorAll('div.g, div.xpd');
    case 'bing':
      return document.querySelectorAll('li.b_algo');
    case 'yahoo':
      return document.querySelectorAll('div.algo');
    case 'duckduckgo':
      return document.querySelectorAll('div.result');
    case 'yandex':
      return document.querySelectorAll('li.serp-item');
    case 'baidu':
      return document.querySelectorAll('div.result');
    default:
      return [];
  }
}

/**
 * Analyze and potentially filter an individual search result
 * @param {HTMLElement} resultElement - The search result element
 * @param {string} query - The search query
 * @param {Object} settings - The current extension settings
 */
function analyzeSearchResult(resultElement, query, settings) {
  // Extract text from the result
  const resultText = resultElement.innerText;
  
  // Skip if there's no text to analyze
  if (!resultText || resultText.trim() === '') return;
  
  // Check for harmful keywords in the result
  const containsHarmfulContent = checkForHarmfulKeywords(resultText);
  
  if (containsHarmfulContent) {
    // Check if educational content should be allowed
    if (settings.educationalMode && checkForEducationalContext(resultText)) {
      // Allow educational content, but add a warning label
      addWarningLabel(resultElement, 'Educational content with sensitive topics');
    } else {
      // Hide the result
      hideSearchResult(resultElement);
    }
  }
}

/**
 * Check if text contains harmful keywords
 * @param {string} text - The text to check
 * @returns {boolean} Whether harmful keywords were found
 */
function checkForHarmfulKeywords(text) {
  const lowercaseText = text.toLowerCase();
  
  // Keywords that indicate potentially harmful content
  const harmfulKeywords = [
    'porn', 'xxx', 'nude', 'naked', 'sex video', 
    'how to kill', 'murder', 'suicide', 'how to commit suicide',
    'self harm', 'torture', 'gore', 'violent', 'weapon',
    'pornography', 'adult video', 'xvideos'
  ];
  
  return harmfulKeywords.some(keyword => lowercaseText.includes(keyword));
}

/**
 * Check if text has educational context
 * @param {string} text - The text to check
 * @returns {boolean} Whether educational context was found
 */
function checkForEducationalContext(text) {
  const lowercaseText = text.toLowerCase();
  
  // Keywords that indicate educational content
  const educationalKeywords = [
    'education', 'research', 'study', 'medical', 'biology', 'science',
    'health', 'documentary', 'history', 'psychology', 'therapy',
    'treatment', 'anatomy', 'physiology', 'academic', 'university',
    'school', 'college', 'course', 'lecture', 'analysis', 'paper',
    'journal', 'statistics', 'data', 'report', 'review', 'exam',
    'breast cancer', 'sex education', 'reproductive health'
  ];
  
  return educationalKeywords.some(keyword => lowercaseText.includes(keyword));
}

/**
 * Add a warning label to a search result
 * @param {HTMLElement} resultElement - The search result element
 * @param {string} warningText - The warning text to display
 */
function addWarningLabel(resultElement, warningText) {
  // Create warning label
  const warningLabel = document.createElement('div');
  warningLabel.className = 'ai-filter-warning';
  warningLabel.style.backgroundColor = '#fff3cd';
  warningLabel.style.color = '#856404';
  warningLabel.style.padding = '8px 12px';
  warningLabel.style.borderRadius = '4px';
  warningLabel.style.marginBottom = '8px';
  warningLabel.style.fontSize = '14px';
  warningLabel.style.border = '1px solid #ffeeba';
  
  // Add warning icon
  warningLabel.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; vertical-align: text-bottom;">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
    ${warningText}
  `;
  
  // Insert at the beginning of the result
  resultElement.insertBefore(warningLabel, resultElement.firstChild);
}

/**
 * Hide a search result that contains harmful content
 * @param {HTMLElement} resultElement - The search result element to hide
 */
function hideSearchResult(resultElement) {
  // Create replacement element
  const blockElement = document.createElement('div');
  blockElement.className = 'ai-filter-blocked-result';
  blockElement.style.backgroundColor = '#f8d7da';
  blockElement.style.color = '#721c24';
  blockElement.style.padding = '12px 15px';
  blockElement.style.borderRadius = '4px';
  blockElement.style.marginBottom = '15px';
  blockElement.style.fontSize = '14px';
  blockElement.style.border = '1px solid #f5c6cb';
  
  // Add blocked content message and icon
  blockElement.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; vertical-align: text-bottom;">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
    </svg>
    <strong>Content filtered:</strong> A search result was hidden because it may contain inappropriate content.
    <button class="ai-filter-show-button" style="background-color: transparent; border: 1px solid #721c24; color: #721c24; padding: 3px 8px; margin-left: 10px; border-radius: 3px; cursor: pointer; font-size: 12px;">Show anyway</button>
  `;
  
  // Replace the original element
  resultElement.parentNode.insertBefore(blockElement, resultElement);
  resultElement.style.display = 'none';
  
  // Add event listener to "Show anyway" button
  const showButton = blockElement.querySelector('.ai-filter-show-button');
  showButton.addEventListener('click', () => {
    resultElement.style.display = '';
    blockElement.style.display = 'none';
  });
}
