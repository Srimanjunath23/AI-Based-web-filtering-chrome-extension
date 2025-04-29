'use strict';

// Import encryption utilities
importScripts('./encryption.js');

/**
 * Verifies if the provided password matches the stored password
 * @param {string} password - The password to verify
 * @param {function} sendResponse - Callback function to send the result
 */
async function verifyPassword(password, sendResponse) {
  try {
    // Get current settings
    const settings = await getSettings();
    
    // Check if password protection is enabled
    if (!settings.isPasswordProtected || !settings.password) {
      sendResponse({ success: true });
      return;
    }
    
    // Compare the hashed password with the stored one
    const hashedPassword = await hashPassword(password);
    const passwordMatches = hashedPassword === settings.password;
    
    sendResponse({ success: passwordMatches });
  } catch (error) {
    console.error('Error verifying password:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Sets or updates the password for the extension
 * @param {string} newPassword - The new password to set
 * @param {string} oldPassword - The current password (if any)
 * @param {function} sendResponse - Callback function to send the result
 */
async function setPassword(newPassword, oldPassword, sendResponse) {
  try {
    // Get current settings
    const settings = await getSettings();
    
    // Check if password protection is already enabled
    if (settings.isPasswordProtected && settings.password) {
      // Verify the old password first
      const hashedOldPassword = await hashPassword(oldPassword);
      if (hashedOldPassword !== settings.password) {
        sendResponse({ success: false, error: 'Current password is incorrect' });
        return;
      }
    }
    
    // Hash the new password
    const hashedPassword = await hashPassword(newPassword);
    
    // Update settings with new password
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

/**
 * Hash a password using SHA-256 algorithm
 * @param {string} password - The password to hash
 * @returns {Promise<string>} - The hashed password
 */
async function hashPassword(password) {
  try {
    return await encryptString(password);
  } catch (error) {
    console.error('Error hashing password:', error);
    throw error;
  }
}
