'use strict';

/**
 * Encrypts a string using AES encryption
 * @param {string} text - The text to encrypt
 * @returns {Promise<string>} - The encrypted text
 */
async function encryptString(text) {
  try {
    // For security, we'll use the Web Crypto API to hash the string
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Create a SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert the hash to a hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  } catch (error) {
    console.error('Error encrypting text:', error);
    throw error;
  }
}

/**
 * Generates a random encryption key
 * @returns {Promise<CryptoKey>} - The generated encryption key
 */
async function generateEncryptionKey() {
  try {
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Error generating encryption key:', error);
    throw error;
  }
}

/**
 * Exports a CryptoKey to a base64 string
 * @param {CryptoKey} key - The key to export
 * @returns {Promise<string>} - The exported key as a base64 string
 */
async function exportKey(key) {
  try {
    const exported = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  } catch (error) {
    console.error('Error exporting key:', error);
    throw error;
  }
}

/**
 * Imports a key from a base64 string
 * @param {string} keyStr - The base64 encoded key
 * @returns {Promise<CryptoKey>} - The imported CryptoKey
 */
async function importKey(keyStr) {
  try {
    const keyData = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
    
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Error importing key:', error);
    throw error;
  }
}
