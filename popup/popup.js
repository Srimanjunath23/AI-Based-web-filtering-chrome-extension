'use strict';

// DOM elements
const extensionToggle = document.getElementById('extension-toggle');
const nsfwToggle = document.getElementById('nsfw-toggle');
const violenceToggle = document.getElementById('violence-toggle');
const suicideToggle = document.getElementById('suicide-toggle');
const educationalToggle = document.getElementById('educational-toggle');
const sensitivitySlider = document.getElementById('sensitivity-slider');
const statusMessage = document.getElementById('status-message');
const mainSection = document.getElementById('main-section');
const loginSection = document.getElementById('login-section');
const passwordInput = document.getElementById('password-input');
const loginButton = document.getElementById('login-button');
const loginError = document.getElementById('login-error');
const currentPassword = document.getElementById('current-password');
const newPassword = document.getElementById('new-password');
const confirmPassword = document.getElementById('confirm-password');
const updatePasswordButton = document.getElementById('update-password-button');
const passwordMessage = document.getElementById('password-message');

// Extension settings
let settings = {
  enabled: true,
  nsfwFilter: true,
  violenceFilter: true,
  suicideFilter: true,
  educationalMode: true,
  sensitivity: 'medium',
  isPasswordProtected: false,
  password: ''
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize feather icons if loaded
    if (typeof feather !== 'undefined') {
      feather.replace();
    }
    
    // Load settings
    await loadSettings();
    
    // Set up event listeners
    setupEventListeners();
    
    // Check if password protected
    if (settings.isPasswordProtected) {
      mainSection.style.display = 'none';
      loginSection.style.display = 'block';
    } else {
      loginSection.style.display = 'none';
      mainSection.style.display = 'block';
    }
    
    // Update UI based on settings
    updateUI();
  } catch (error) {
    console.error('Error initializing popup:', error);
    showStatusMessage('Error loading settings', false);
  }
});

// Load settings from storage
async function loadSettings() {
  try {
    // Get settings from background script
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    
    if (response && response.settings) {
      settings = response.settings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    throw error;
  }
}

// Update UI based on current settings
function updateUI() {
  // Set toggle states
  extensionToggle.checked = settings.enabled;
  nsfwToggle.checked = settings.nsfwFilter;
  violenceToggle.checked = settings.violenceFilter;
  suicideToggle.checked = settings.suicideFilter;
  educationalToggle.checked = settings.educationalMode;
  
  // Set sensitivity slider
  if (settings.sensitivity === 'low') {
    sensitivitySlider.value = 1;
  } else if (settings.sensitivity === 'medium') {
    sensitivitySlider.value = 2;
  } else {
    sensitivitySlider.value = 3;
  }
  
  // Update status message
  updateStatusMessage();
  
  // Disable controls if extension is off
  const controls = [nsfwToggle, violenceToggle, suicideToggle, educationalToggle, sensitivitySlider];
  controls.forEach(control => {
    control.disabled = !settings.enabled;
  });
}

// Set up event listeners
function setupEventListeners() {
  // Login button
  loginButton.addEventListener('click', async () => {
    const password = passwordInput.value;
    
    if (!password) {
      loginError.textContent = 'Please enter a password';
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'VERIFY_PASSWORD',
        password: password
      });
      
      if (response && response.success) {
        loginSection.style.display = 'none';
        mainSection.style.display = 'block';
        passwordInput.value = '';
        loginError.textContent = '';
      } else {
        loginError.textContent = 'Incorrect password';
      }
    } catch (error) {
      console.error('Login error:', error);
      loginError.textContent = 'Error verifying password';
    }
  });
  
  // Update password button
  updatePasswordButton.addEventListener('click', async () => {
    const currentPwd = currentPassword.value;
    const newPwd = newPassword.value;
    const confirmPwd = confirmPassword.value;
    
    // Validate inputs
    if (settings.isPasswordProtected && !currentPwd) {
      showPasswordMessage('Current password is required', false);
      return;
    }
    
    if (!newPwd) {
      showPasswordMessage('New password is required', false);
      return;
    }
    
    if (newPwd !== confirmPwd) {
      showPasswordMessage('Passwords do not match', false);
      return;
    }
    
    // Send password update request
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_PASSWORD',
        currentPassword: currentPwd,
        newPassword: newPwd
      });
      
      if (response && response.success) {
        settings.isPasswordProtected = true;
        settings.password = response.hashedPassword;
        
        // Clear password fields
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
        
        showPasswordMessage('Password updated successfully', true);
      } else {
        showPasswordMessage(response.error || 'Failed to update password', false);
      }
    } catch (error) {
      console.error('Password update error:', error);
      showPasswordMessage('Error updating password', false);
    }
  });
  
  // Main extension toggle
  extensionToggle.addEventListener('change', async () => {
    settings.enabled = extensionToggle.checked;
    await updateSettings();
    updateUI();
  });
  
  // Filter toggles
  nsfwToggle.addEventListener('change', async () => {
    settings.nsfwFilter = nsfwToggle.checked;
    await updateSettings();
  });
  
  violenceToggle.addEventListener('change', async () => {
    settings.violenceFilter = violenceToggle.checked;
    await updateSettings();
  });
  
  suicideToggle.addEventListener('change', async () => {
    settings.suicideFilter = suicideToggle.checked;
    await updateSettings();
  });
  
  educationalToggle.addEventListener('change', async () => {
    settings.educationalMode = educationalToggle.checked;
    await updateSettings();
  });
  
  // Sensitivity slider
  sensitivitySlider.addEventListener('change', async () => {
    const value = parseInt(sensitivitySlider.value);
    
    if (value === 1) {
      settings.sensitivity = 'low';
    } else if (value === 2) {
      settings.sensitivity = 'medium';
    } else {
      settings.sensitivity = 'high';
    }
    
    await updateSettings();
  });
  
  // Handle Enter key in password input
  passwordInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      loginButton.click();
    }
  });
}

// Update settings in storage
async function updateSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: settings
    });
    
    if (response && response.success) {
      updateStatusMessage();
      return true;
    } else {
      showStatusMessage('Failed to update settings', false);
      return false;
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    showStatusMessage('Error: ' + error.message, false);
    return false;
  }
}

// Update status message
function updateStatusMessage() {
  if (settings.enabled) {
    statusMessage.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      <span>Protection active</span>
    `;
    statusMessage.className = '';
  } else {
    statusMessage.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-alert-circle"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <span>Protection disabled</span>
    `;
    statusMessage.className = 'inactive';
  }
}

// Show temporary status message
function showStatusMessage(message, isSuccess) {
  const originalMessage = statusMessage.innerHTML;
  
  statusMessage.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather ${isSuccess ? 'feather-check-circle' : 'feather-alert-circle'}">
      ${isSuccess ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'}
    </svg>
    <span>${message}</span>
  `;
  
  statusMessage.className = isSuccess ? '' : 'inactive';
  
  // Restore original message after a delay
  setTimeout(() => {
    statusMessage.innerHTML = originalMessage;
    updateStatusMessage();
  }, 3000);
}

// Show password update message
function showPasswordMessage(message, isSuccess) {
  passwordMessage.textContent = message;
  passwordMessage.className = isSuccess ? 'message success' : 'message error';
  
  // Clear message after delay
  setTimeout(() => {
    passwordMessage.textContent = '';
    passwordMessage.className = 'message';
  }, 3000);
}