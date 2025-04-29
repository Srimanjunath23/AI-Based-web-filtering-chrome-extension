/**
 * NSFW.js Model for detecting NSFW content in images
 * This script loads and provides the NSFW.js model for content filtering
 */

// Create a global namespace for NSFWJS
window.nsfwjs = (function() {
  // Model URL from the TensorFlow.js models repository
  const MODEL_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/nsfwjs/model.json';
  
  // Model instance
  let model = null;
  let modelLoading = false;
  
  /**
   * Load the NSFW.js model
   * @returns {Promise<Object>} The loaded model
   */
  async function load() {
    if (model) return model;
    if (modelLoading) {
      // Wait for model loading to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (model) {
            clearInterval(checkInterval);
            resolve(model);
          }
        }, 100);
      });
    }
    
    modelLoading = true;
    
    try {
      // Dynamically import TensorFlow.js
      const tfjs = await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.3.0/dist/tf.min.js');
      
      // Load the model
      console.log('Loading NSFW.js model...');
      model = await tfjs.loadGraphModel(MODEL_URL);
      
      console.log('NSFW.js model loaded successfully');
      modelLoading = false;
      
      // Return a wrapper with the classify method
      return {
        classify: async function(image) {
          return await classify(image, model, tfjs);
        }
      };
    } catch (error) {
      console.error('Failed to load NSFW.js model:', error);
      modelLoading = false;
      throw error;
    }
  }
  
  /**
   * Classify an image using the NSFW.js model
   * @param {HTMLImageElement|HTMLCanvasElement} image - The image to classify
   * @param {Object} loadedModel - The loaded TensorFlow.js model
   * @param {Object} tf - TensorFlow.js library
   * @returns {Promise<Array>} Array of prediction results
   */
  async function classify(image, loadedModel, tf) {
    try {
      // Convert image to tensor
      const tensor = tf.browser.fromPixels(image);
      
      // Normalize and resize
      const normalized = tensor.toFloat().div(tf.scalar(255));
      const resized = tf.image.resizeBilinear(normalized, [224, 224]);
      const batched = resized.expandDims(0);
      
      // Get predictions
      const predictions = await loadedModel.predict(batched).data();
      
      // Cleanup tensors
      tensor.dispose();
      normalized.dispose();
      resized.dispose();
      batched.dispose();
      
      // Get class probabilities
      const classes = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
      const result = classes.map((className, index) => ({
        className,
        probability: predictions[index]
      }));
      
      // Sort by probability (highest first)
      return result.sort((a, b) => b.probability - a.probability);
    } catch (error) {
      console.error('Error classifying image:', error);
      throw error;
    }
  }
  
  // Public API
  return {
    load,
  };
})();
