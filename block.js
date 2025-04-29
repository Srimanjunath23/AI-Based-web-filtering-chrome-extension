// block.js

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const blockReason = urlParams.get('reason') || 'unsafe';
const blockedUrl = urlParams.get('url') || 'Unknown';
const blockedQuery = urlParams.get('query') || '';

// DOM elements
const specificReason = document.getElementById('specific-reason');
const blockedUrlElement = document.getElementById('blocked-url');
const blockedQueryElement = document.getElementById('blocked-query');
const backButton = document.getElementById('back-button');
const settingsButton = document.getElementById('settings-button');

// Explanation sections
const nsfwExplanation = document.getElementById('nsfw-explanation');
const violenceExplanation = document.getElementById('violence-explanation');
const suicideExplanation = document.getElementById('suicide-explanation');
const searchExplanation = document.getElementById('search-explanation');

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    // Initialize feather icons if available
    if (typeof feather !== 'undefined') {
        feather.replace();
    }

    // Show error if present
    const errorMsg = urlParams.get('error');
    if (errorMsg) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = `Error: ${errorMsg}`;
        errorElement.style.display = 'block';
    }

    // Set blocked URL
    blockedUrlElement.textContent = decodeURIComponent(blockedUrl);

    // Set blocked query if available
    if (blockedQuery) {
        blockedQueryElement.textContent = decodeURIComponent(blockedQuery);
    }

    // Set block reason specific message
    switch (blockReason) {
        // handle reasons
        default:
            specificReason.innerHTML = `<p>This content was blocked based on our AI content filtering system.</p>`;
            break;
    }

    // Set up event listeners
    backButton.addEventListener('click', () => {
        window.history.back();
    });

    settingsButton.addEventListener('click', () => {
        try {
            chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
        } catch (error) {
            console.log('Error opening settings:', error);
            alert('Please use the extension popup to access settings.');
        }
    });
});