// Enhanced emoji collection
const possibleEmojis = [
  '🐀','🐁','🐭','🐹','🐂','🐃','🐄','🐮','🐅','🐆','🐯','🐇','🐐','🐑','🐏','🐴',
  '🐎','🐱','🐈','🐰','🐓','🐔','🐤','🐣','🐥','🐦','🐧','🐘','🐩','🐕','🐷','🐖',
  '🐗','🐫','🐪','🐶','🐺','🐻','🐨','🐼','🐵','🙈','🙉','🙊','🐒','🐉','🐲','🐊',
  '🐍','🐢','🐸','🐋','🐳','🐬','🐙','🐟','🐠','🐡','🐚','🐌','🐛','🐜','🐝','🐞',
];

function randomEmoji() {
  return possibleEmojis[Math.floor(Math.random() * possibleEmojis.length)];
}

// Application variables
const emoji = randomEmoji();
let name = prompt("What's your name?");

// Validate name
while (!name || name.trim() === '') {
  name = prompt("Please enter a valid name:");
}
name = name.trim();

const GLOBAL_CHAT_ROOM = 'global-chat-room';

// Prompt user for join code
let joinCode = prompt('Enter join code (leave blank for global chat):');

// Use global room if join code is blank or null
if (!joinCode) {
  location.hash = GLOBAL_CHAT_ROOM;
} else {
  location.hash = joinCode;
}

// Extract the final room identifier from the URL hash
const chatHash = location.hash.substring(1) || GLOBAL_CHAT_ROOM;

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
const roomName = 'observable-' + chatHash;

// Global variables for signaling-based messaging (no WebRTC needed for unlimited users)
let room;
let isConnected = false;
let messageHistory = [];
let connectedUsers = new Map();
let userColors = {};

// Image handling variables
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
let imagePreviewContainer = null;

// Color palette for different users
const userColorPalette = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85929E', '#A569BD'
];

let colorIndex = 0;

// Enhanced error handling
function handleError(message, error) {
  console.error(message, error);
  insertSystemMessage(`Error: ${message}`);
  showStatus(`Error: ${message}`);
}

function showStatus(message) {
  console.log('Status:', message);
  const statusEl = document.querySelector('.status');
  if (statusEl) {
    statusEl.textContent = message;
  }
  
  // Also show in title for better UX
  document.title = `Chat (${message})`;
}

function getUserColor(userId) {
  if (!userColors[userId]) {
    userColors[userId] = userColorPalette[colorIndex % userColorPalette.length];
    colorIndex++;
  }
  return userColors[userId];
}

function insertSystemMessage(content) {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;

  const systemMsg = document.createElement('div');
  systemMsg.className = 'system-message';
  systemMsg.textContent = content;
  systemMsg.style.cssText = `
    text-align: center;
    color: #666;
    font-size: 0.9em;
    margin: 10px 0;
    padding: 8px;
    background: rgba(0,0,0,0.05);
    border-radius: 12px;
    font-style: italic;
  `;
  
  messagesEl.appendChild(systemMsg);
  scrollToBottom();
}

function insertUserCountMessage(count) {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;

  // Remove existing user count message
  const existingCount = messagesEl.querySelector('.user-count-message');
  if (existingCount) {
    existingCount.remove();
  }

  const countMsg = document.createElement('div');
  countMsg.className = 'user-count-message system-message';
  countMsg.textContent = `👥 ${count} user${count !== 1 ? 's' : ''} online`;
  countMsg.style.cssText = `
    text-align: center;
    color: #4ECDC4;
    font-size: 0.9em;
    margin: 10px 0;
    padding: 8px;
    background: rgba(78, 205, 196, 0.1);
    border-radius: 12px;
    font-weight: bold;
    position: sticky;
    top: 0;
    z-index: 10;
  `;
  
  messagesEl.insertBefore(countMsg, messagesEl.firstChild);
}

function scrollToBottom() {
  const messagesEl = document.querySelector('.messages');
  if (messagesEl) {
    messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight;
  }
}

// Image handling functions
function validateImage(file) {
  if (!file) return { valid: false, error: 'No file selected' };
  
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Unsupported image type. Please use JPEG, PNG, GIF, or WebP.' };
  }
  
  if (file.size > MAX_IMAGE_SIZE) {
    return { valid: false, error: 'Image too large. Maximum size is 5MB.' };
  }
  
  return { valid: true };
}

function compressImage(file, maxWidth = 1200, maxHeight = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      const originalWidth = width;
      const originalHeight = height;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve({
            blob: blob,
            originalWidth: originalWidth,
            originalHeight: originalHeight,
            compressedWidth: width,
            compressedHeight: height,
            originalSize: file.size,
            compressedSize: blob.size
          });
        } else {
          reject(new Error('Failed to compress image'));
        }
      }, 'image/jpeg', quality); // Always convert to JPEG for better compression
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64Data) {
  const arr = base64Data.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
}

async function processImageForSending(file) {
  try {
    showStatus('Compressing image...');
    
    // Compress the image
    const compressionResult = await compressImage(file);
    const compressedBase64 = await fileToBase64(compressionResult.blob);
    
    console.log(`Image compressed: ${(compressionResult.originalSize / 1024).toFixed(1)}KB → ${(compressionResult.compressedSize / 1024).toFixed(1)}KB`);
    
    return {
      base64Data: compressedBase64,
      originalName: file.name,
      originalType: file.type,
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      originalWidth: compressionResult.originalWidth,
      originalHeight: compressionResult.originalHeight,
      compressedWidth: compressionResult.compressedWidth,
      compressedHeight: compressionResult.compressedHeight
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

function createImageElement(imageData, isFromMe = false) {
  const imgContainer = document.createElement('div');
  imgContainer.className = 'image-container';
  imgContainer.style.cssText = `
    max-width: 400px;
    margin: 8px 0;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    transition: transform 0.2s ease;
  `;
  
  const img = document.createElement('img');
  img.src = imageData.base64Data;
  img.alt = imageData.originalName || 'Shared image';
  img.style.cssText = `
    width: 100%;
    height: auto;
    display: block;
    max-height: 300px;
    object-fit: contain;
    background: #f0f0f0;
  `;
  
  // Add image info overlay
  const infoOverlay = document.createElement('div');
  infoOverlay.className = 'image-info';
  infoOverlay.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
    color: white;
    padding: 8px;
    font-size: 0.8em;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;
  
  const compressionInfo = imageData.compressedSize ? 
    ` (${(imageData.originalSize / 1024).toFixed(1)}KB → ${(imageData.compressedSize / 1024).toFixed(1)}KB)` : '';
  
  infoOverlay.textContent = `${imageData.originalName || 'Image'}${compressionInfo}`;
  
  imgContainer.appendChild(img);
  imgContainer.appendChild(infoOverlay);
  
  // Hover effects
  imgContainer.addEventListener('mouseenter', () => {
    imgContainer.style.transform = 'scale(1.02)';
    infoOverlay.style.opacity = '1';
  });
  
  imgContainer.addEventListener('mouseleave', () => {
    imgContainer.style.transform = 'scale(1)';
    infoOverlay.style.opacity = '0';
  });
  
  // Click to view full size
  imgContainer.addEventListener('click', () => {
    showImageModal(imageData);
  });
  
  return imgContainer;
}

function showImageModal(imageData) {
  // Remove existing modal
  const existingModal = document.querySelector('.image-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    cursor: pointer;
  `;
  
  const img = document.createElement('img');
  img.src = imageData.base64Data;
  img.alt = imageData.originalName || 'Image';
  img.style.cssText = `
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 8px;
    cursor: default;
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 30px;
    background: rgba(255, 255, 255, 0.8);
    border: none;
    font-size: 2em;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  modal.appendChild(img);
  modal.appendChild(closeBtn);
  document.body.appendChild(modal);
  
  // Close modal events
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  // ESC key to close
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  
  document.addEventListener('keydown', handleEscape);
  
  // Prevent image drag
  img.addEventListener('dragstart', (e) => e.preventDefault());
}

function setupImageUpload() {
  const form = document.querySelector('form');
  if (!form) return;
  
  // Create image upload button
  const imageBtn = document.createElement('button');
  imageBtn.type = 'button';
  imageBtn.innerHTML = '📷';
  imageBtn.title = 'Send image';
  imageBtn.style.cssText = `
    background: #4ECDC4;
    border: none;
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    margin-left: 8px;
    cursor: pointer;
    font-size: 1.1em;
    transition: background 0.2s ease;
  `;
  
  imageBtn.addEventListener('mouseenter', () => {
    imageBtn.style.background = '#45B7D1';
  });
  
  imageBtn.addEventListener('mouseleave', () => {
    imageBtn.style.background = '#4ECDC4';
  });
  
  // Create hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = SUPPORTED_IMAGE_TYPES.join(',');
  fileInput.style.display = 'none';
  
  imageBtn.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const validation = validateImage(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }
    
    try {
      const imageData = await processImageForSending(file);
      sendImageMessage(imageData);
      fileInput.value = ''; // Reset input
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image. Please try again.');
    }
  });
  
  // Add to form
  form.appendChild(imageBtn);
  form.appendChild(fileInput);
  
  // Setup drag and drop
  setupDragAndDrop();
}

function setupDragAndDrop() {
  const messagesEl = document.querySelector('.messages');
  const input = document.querySelector('input[type="text"]');
  
  if (!messagesEl) return;
  
  let dragCounter = 0;
  
  const showDropZone = () => {
    let dropZone = document.querySelector('.drop-zone');
    if (!dropZone) {
      dropZone = document.createElement('div');
      dropZone.className = 'drop-zone';
      dropZone.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(78, 205, 196, 0.1);
        border: 3px dashed #4ECDC4;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999;
        font-size: 1.5em;
        color: #4ECDC4;
        font-weight: bold;
      `;
      dropZone.textContent = '📷 Drop image here to send';
      document.body.appendChild(dropZone);
    }
  };
  
  const hideDropZone = () => {
    const dropZone = document.querySelector('.drop-zone');
    if (dropZone) {
      dropZone.remove();
    }
  };
  
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  
  document.addEventListener('dragenter', (e) => {
    dragCounter++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      showDropZone();
    }
  });
  
  document.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter === 0) {
      hideDropZone();
    }
  });
  
  document.addEventListener('drop', async (e) => {
    dragCounter = 0;
    hideDropZone();
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => SUPPORTED_IMAGE_TYPES.includes(file.type));
    
    if (imageFiles.length === 0) {
      if (files.length > 0) {
        alert('Please drop image files only (JPEG, PNG, GIF, WebP)');
      }
      return;
    }
    
    // Process multiple images
    for (const file of imageFiles.slice(0, 5)) { // Limit to 5 images at once
      const validation = validateImage(file);
      if (!validation.valid) {
        alert(`${file.name}: ${validation.error}`);
        continue;
      }
      
      try {
        const imageData = await processImageForSending(file);
        sendImageMessage(imageData);
        // Add small delay between multiple images
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        alert(`Failed to process ${file.name}`);
      }
    }
  });
}