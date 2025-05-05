//updated on 1/5/25
'use strict';

let extensionSettings = null;
let isPageBlocked = false;

async function initialize() {
  try {
    extensionSettings = await getExtensionSettings();
    if (!extensionSettings.enabled) return;

    analyzePageContent();
    chrome.runtime.onMessage.addListener(handleMessages);
    console.log('AI Web Filter content script initialized');
  } catch (error) {
    console.error('Failed to initialize content script:', error);
  }
}

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

function performContentAnalysis() {
  const pageContent = document.body ? document.body.innerText.toLowerCase() : '';
  const url = window.location.href;
  const pageTitle = document.title ? document.title.toLowerCase() : '';

  const educationalWords = ['research', 'study', 'academic', 'education', 'scientific', 'analysis', 'university', 'paper', 'sex education'];
  const educationalPhrases = ['research on', 'study on', 'analysis of', 'effects of', 'impact of', 'prevention of'];

  let reason = '';
  let isEducational = false;

  if (extensionSettings.educationalMode) {
    const contentToCheck = pageContent + ' ' + pageTitle;
    const educationalWordCount = educationalWords.filter(word => contentToCheck.includes(word)).length;
    const hasSensitivePhrases = educationalPhrases.some(phrase => {
      return (
        pageContent.includes(phrase + ' violence') ||
        pageContent.includes(phrase + ' suicide')
      );
    });
    isEducational = (educationalWordCount >= 3) || hasSensitivePhrases;
    console.log('Educational content detected:', isEducational);
  }

  const nsfwWords = ['xxx', 'porn', 'adult content', 'nsfw'];
  const violenceWords = ['kill', 'violence', 'attack'];
  const suicideWords = ['suicide', 'self-harm'];

  if (suicideWords.some(word => pageContent.includes(word))) {
    reason = 'suicide';
  } else if (nsfwWords.some(word => pageContent.includes(word)) && !isEducational) {
    reason = 'NSFW';
  } else if (violenceWords.some(word => pageContent.includes(word))) {
    reason = 'violence';
  }

  if (reason && isEducational && extensionSettings.educationalMode) {
    console.log('Educational content detected, allowing access');
    blurImages();
  } else if (reason) {
    blockPage(reason);
  } else {
    blurImages();
  }
}

function analyzePageContent() {
  if (isPageBlocked) return;
  performContentAnalysis();
}

function blockPage(reason) {
  if (isPageBlocked) return;
  isPageBlocked = true;

  try {
    const blockPageUrl = chrome.runtime.getURL('pages/block.html') +
      `?reason=${encodeURIComponent(reason || 'unsafe')}` +
      `&url=${encodeURIComponent(window.location.href)}`;

    window.stop();
    document.documentElement.innerHTML = '';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.height = '100vh';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.zIndex = '2147483647';
    container.style.backgroundColor = '#fff';

    const iframe = document.createElement('iframe');
    iframe.src = blockPageUrl;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    container.appendChild(iframe);
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.appendChild(container);
  } catch (error) {
    console.error('Error blocking page:', error);
  }
}
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

// 👇 Reintegrated Sightengine logic here
async function blurImages() {
  const images = document.querySelectorAll('img');
  const unsafeKeywords = ['xxx', 'porn', 'violence', 'suicide', 'self-harm', 'attack'];

  const sensitivityThresholds = {
    low: 0.85,
    medium: 0.75,
    high: 0.60
  };

  const threshold = sensitivityThresholds[extensionSettings.sensitivity || 'medium'];

  for (const img of images) {
    const imgAlt = img.alt?.toLowerCase() || '';
    const imgSrc = img.src?.toLowerCase() || '';

    // Skip base64/blob images
    if (img.src.startsWith('data:') || img.src.startsWith('blob:')) continue;

    let shouldBlur = unsafeKeywords.some(keyword =>
      imgAlt.includes(keyword) || imgSrc.includes(keyword)
    );

    if (!shouldBlur) {
      try {
        const apiUrl = `https://api.sightengine.com/1.0/check.json?models=nudity,wad,offensive&url=${encodeURIComponent(img.src)}&api_user=363518856&api_secret=kFFtELuEnWyJzzRL6MnAXKdyzRnTc6pU`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.status !== 'success') continue;

        const unsafeScore = Math.max(
          data.nudity?.raw || 0,
          data.weapon || 0,
          data.alcohol || 0,
          data.drugs || 0,
          data.offensive?.prob || 0
        );

        if (unsafeScore >= threshold) {
          shouldBlur = true;
        }
      } catch (error) {
        console.warn('Sightengine error for image:', img.src, error);
      }
    }

    if (shouldBlur) {
      // Wrap image in a container
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';

      const parent = img.parentNode;
      parent.insertBefore(wrapper, img);
      wrapper.appendChild(img);

      // Blur the image
      img.style.filter = 'blur(10px)';
      img.style.transition = 'filter 0.3s ease';

      // Create unlock button
      const button = document.createElement('button');
      button.innerText = 'Show Image';
      Object.assign(button.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: '9999',
        backgroundColor: '#000',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: '5px',
        border: 'none',
        cursor: 'pointer',
        opacity: '0.85'
      });

      wrapper.appendChild(button);

      // Handle unlock logic
      button.addEventListener('click', async () => {
        const enteredPassword = prompt('Enter extension password to view this image:');
        const settings = await getExtensionSettings();

        // Compare hashed passwords
        const hashedInput = simpleHash(enteredPassword);
        const correctHash = settings.password;

        if (!settings.isPasswordProtected || !correctHash || hashedInput === correctHash) {
          img.style.filter = 'none';
          button.remove();
        } else {
          alert('Incorrect password.');
        }
      });
    }
  }
}


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

initialize();