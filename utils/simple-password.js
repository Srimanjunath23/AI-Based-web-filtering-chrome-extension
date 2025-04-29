'use strict';

/**
 * Simple password utility functions for the AI Web Filter extension
 */

/**
 * Simple hash function for password
 * @param {string} str - The string to hash
 * @returns {string} - The hashed string
 */
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

/**
 * Verifies if the provided password matches the stored password
 * @param {string} password - The password to verify
 * @param {string} storedHash - The stored password hash to compare against
 * @returns {boolean} - Whether the password matches
 */
function verifyPassword(password, storedHash) {
  const hashedPassword = simpleHash(password);
  return hashedPassword === storedHash;
}

/**
 * Hash a password using the simple hash function
 * @param {string} password - The password to hash
 * @returns {string} - The hashed password
 */
function hashPassword(password) {
  return simpleHash(password);
}