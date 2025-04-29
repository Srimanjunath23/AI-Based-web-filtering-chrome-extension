'use strict';

// Initialize the BERT model
let bertModel = null;
let bertModelLoading = false;
let tokenizer = null;

/**
 * Initialize the BERT model for text analysis
 * @returns {Promise<void>}
 */
async function initBertModel() {
  if (bertModel || bertModelLoading) return;
  
  bertModelLoading = true;
  
  try {
    // Use Transformers.js to load the BERT model
    // We're using the "distilbert-base-uncased" model for efficiency
    const { pipeline, AutoTokenizer } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');
    
    // Initialize the model - this is a lightweight version of BERT for text classification
    bertModel = await pipeline('text-classification', 'distilbert-base-uncased-finetuned-sst-2-english');
    tokenizer = await AutoTokenizer.from_pretrained('distilbert-base-uncased');
    
    console.log('BERT model loaded successfully');
  } catch (error) {
    console.error('Failed to load BERT model:', error);
    bertModelLoading = false;
    throw error;
  }
  
  bertModelLoading = false;
}

/**
 * Analyze search query intent using BERT
 * @param {string} query - The search query to analyze
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeSearchIntent(query) {
  try {
    if (!bertModel) {
      await initBertModel();
    }
    
    // Normalize the query
    const normalizedQuery = query.toLowerCase().trim();
    
    // List of harmful keywords related to categories
    const harmful = {
      nsfw: ['porn', 'xxx', 'sex video', 'nude', 'naked', 'pornography', 'adult video', 'xvideos'],
      violence: ['how to kill', 'murder', 'torture', 'violent', 'gore', 'weapon', 'shoot people'],
      suicide: ['suicide', 'how to commit suicide', 'kill myself', 'end my life', 'self harm']
    };
    
    // List of educational keywords for whitelisting
    const educational = [
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
    
    // Check for direct harmful matches
    let category = '';
    let isDirectlyHarmful = false;
    
    for (const [cat, keywords] of Object.entries(harmful)) {
      if (keywords.some(keyword => normalizedQuery.includes(keyword))) {
        category = cat;
        isDirectlyHarmful = true;
        break;
      }
    }
    
    // Check for educational context
    const hasEducationalContext = educational.some(term => 
      normalizedQuery.includes(term)
    );
    
    // If we have a direct match with harmful keywords
    if (isDirectlyHarmful) {
      // Allow if it has educational context
      if (hasEducationalContext) {
        return {
          shouldBlock: false,
          category: category,
          isHarmful: true,
          isEducational: true,
          confidence: 1.0
        };
      } else {
        // Block if it's harmful without educational context
        return {
          shouldBlock: true,
          category: category,
          isHarmful: true,
          isEducational: false,
          confidence: 1.0
        };
      }
    }
    
    // Use BERT for more complex intent analysis
    const result = await bertModel(normalizedQuery);
    
    // Use custom BERT fine-tuned model to detect harmful intent
    // Since we're using a sentiment model as a fallback, positive = safe, negative = unsafe
    const isSafeIntent = result[0].label === 'POSITIVE';
    const confidence = result[0].score;
    
    // Only block if we're confident and there's no educational context
    if (!isSafeIntent && confidence > 0.75 && !hasEducationalContext) {
      return {
        shouldBlock: true,
        category: 'content',
        isHarmful: true,
        isEducational: false,
        confidence: confidence
      };
    }
    
    // Default to allowing the search
    return {
      shouldBlock: false,
      category: '',
      isHarmful: false,
      isEducational: hasEducationalContext,
      confidence: confidence
    };
  } catch (error) {
    console.error('Error analyzing search intent:', error);
    
    // Default to allowing the search on error
    return {
      shouldBlock: false,
      category: '',
      isHarmful: false,
      isEducational: false,
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Check if text content contains NSFW material
 * @param {string} content - The text content to analyze
 * @returns {Promise<boolean>} True if NSFW content detected
 */
async function checkForNSFW(content) {
  try {
    if (!bertModel) {
      await initBertModel();
    }
    
    // Extract important parts of the content for analysis
    const textToAnalyze = extractRelevantContent(content);
    
    // Keywords that strongly indicate NSFW content
    const nsfwKeywords = [
      'porn', 'xxx', 'sex video', 'nude', 'naked', 'pornography', 'adult video',
      'erotic', 'explicit', 'nsfw', 'sexual', 'x-rated'
    ];
    
    // Check for direct keyword matches
    if (nsfwKeywords.some(keyword => textToAnalyze.toLowerCase().includes(keyword))) {
      return true;
    }
    
    // Use BERT model for more nuanced analysis
    // For long content, split into chunks and analyze each
    const chunks = splitIntoChunks(textToAnalyze, 512);
    
    let totalScore = 0;
    
    for (const chunk of chunks) {
      const result = await bertModel(chunk);
      // Using sentiment as a proxy for safe/unsafe content
      // This would ideally be replaced with a purpose-trained model
      if (result[0].label === 'NEGATIVE' && result[0].score > 0.75) {
        totalScore += result[0].score;
      }
    }
    
    // If the average is high enough, consider it NSFW
    return (totalScore / chunks.length) > 0.6;
  } catch (error) {
    console.error('Error checking for NSFW content:', error);
    return false;
  }
}

/**
 * Check if text content contains violent material
 * @param {string} content - The text content to analyze
 * @returns {Promise<boolean>} True if violent content detected
 */
async function checkForViolence(content) {
  try {
    if (!bertModel) {
      await initBertModel();
    }
    
    // Extract important parts of the content for analysis
    const textToAnalyze = extractRelevantContent(content);
    
    // Keywords that strongly indicate violent content
    const violentKeywords = [
      'kill', 'murder', 'stab', 'shoot', 'torture', 'violence', 'blood', 'gore',
      'attack', 'assassinate', 'slaughter', 'bomb', 'terror', 'weapon', 'assault',
      'graphic violence', 'beheading', 'massacre'
    ];
    
    // Check for direct keyword matches
    if (violentKeywords.some(keyword => textToAnalyze.toLowerCase().includes(keyword))) {
      return true;
    }
    
    // Use BERT model for more nuanced analysis
    // For long content, split into chunks and analyze each
    const chunks = splitIntoChunks(textToAnalyze, 512);
    
    let totalScore = 0;
    
    for (const chunk of chunks) {
      const result = await bertModel(chunk);
      // Using sentiment as a proxy
      if (result[0].label === 'NEGATIVE' && result[0].score > 0.8) {
        totalScore += result[0].score;
      }
    }
    
    // If the average is high enough, consider it violent
    return (totalScore / chunks.length) > 0.7;
  } catch (error) {
    console.error('Error checking for violent content:', error);
    return false;
  }
}

/**
 * Check if text content contains suicide or self-harm material
 * @param {string} content - The text content to analyze
 * @returns {Promise<boolean>} True if suicide-related content detected
 */
async function checkForSuicide(content) {
  try {
    if (!bertModel) {
      await initBertModel();
    }
    
    // Extract important parts of the content for analysis
    const textToAnalyze = extractRelevantContent(content);
    
    // Keywords that strongly indicate suicide content
    const suicideKeywords = [
      'suicide', 'kill myself', 'end my life', 'self harm', 'hurt myself',
      'commit suicide', 'suicidal', 'take my own life', 'die by suicide',
      'how to commit suicide', 'methods of suicide', 'suicide note',
      'suicide plan', 'wrist cutting', 'overdose'
    ];
    
    // Check for direct keyword matches
    if (suicideKeywords.some(keyword => textToAnalyze.toLowerCase().includes(keyword))) {
      return true;
    }
    
    // Use BERT model for more nuanced analysis
    // For long content, split into chunks and analyze each
    const chunks = splitIntoChunks(textToAnalyze, 512);
    
    let totalScore = 0;
    
    for (const chunk of chunks) {
      const result = await bertModel(chunk);
      // Using sentiment as a proxy
      if (result[0].label === 'NEGATIVE' && result[0].score > 0.85) {
        totalScore += result[0].score;
      }
    }
    
    // If the average is high enough, consider it suicide-related
    return (totalScore / chunks.length) > 0.75;
  } catch (error) {
    console.error('Error checking for suicide content:', error);
    return false;
  }
}

/**
 * Check if content is educational
 * @param {string} content - The content to analyze
 * @returns {Promise<boolean>} True if content is educational
 */
async function checkIfEducational(content) {
  try {
    if (!bertModel) {
      await initBertModel();
    }
    
    // Extract important parts of the content for analysis
    const textToAnalyze = extractRelevantContent(content);
    
    // Keywords that indicate educational content
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
    
    // Check for educational keywords
    const keywordMatches = educationalKeywords.filter(keyword => 
      textToAnalyze.toLowerCase().includes(keyword)
    );
    
    // If we find multiple educational keywords, consider it educational
    if (keywordMatches.length >= 3) {
      return true;
    }
    
    // Use BERT model for more nuanced analysis
    // For long content, split into chunks and analyze each
    const chunks = splitIntoChunks(textToAnalyze, 512);
    
    let positiveChunks = 0;
    
    for (const chunk of chunks) {
      const result = await bertModel(chunk);
      // Positive sentiment might indicate educational content
      if (result[0].label === 'POSITIVE' && result[0].score > 0.7) {
        positiveChunks++;
      }
    }
    
    // If majority of chunks are positive, consider it potentially educational
    return (positiveChunks / chunks.length) > 0.6;
  } catch (error) {
    console.error('Error checking if content is educational:', error);
    return false;
  }
}

/**
 * Extract the most relevant parts of content for analysis
 * @param {string} content - The full content
 * @returns {string} The relevant content for analysis
 */
function extractRelevantContent(content) {
  // Remove HTML tags if present
  let text = content.replace(/<[^>]*>/g, ' ');
  
  // Replace multiple spaces with a single space
  text = text.replace(/\s+/g, ' ');
  
  // Limit length to avoid performance issues
  const maxLength = 10000;
  if (text.length > maxLength) {
    // Take the first part and the last part
    return text.substring(0, maxLength / 2) + ' ' + text.substring(text.length - maxLength / 2);
  }
  
  return text;
}

/**
 * Split text into chunks for processing
 * @param {string} text - The text to split
 * @param {number} maxLength - Maximum chunk length
 * @returns {Array<string>} Array of text chunks
 */
function splitIntoChunks(text, maxLength) {
  const chunks = [];
  
  // If text is shorter than max length, return it as a single chunk
  if (text.length <= maxLength) {
    chunks.push(text);
    return chunks;
  }
  
  // Split text into sentences
  const sentences = text.split(/[.!?]+/);
  let currentChunk = '';
  
  for (const sentence of sentences) {
    // If adding this sentence would exceed the max length
    if (currentChunk.length + sentence.length + 1 > maxLength) {
      // Push current chunk to array
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // Start a new chunk
      currentChunk = sentence + '.';
    } else {
      // Add sentence to current chunk
      currentChunk += sentence + '.';
    }
  }
  
  // Add any remaining text
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}
