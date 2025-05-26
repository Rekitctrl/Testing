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
let name = prompt("What's your name?") || "Anonymous";

// Validate name
while (!name || name.trim() === '') {
  name = prompt("Please enter a valid name:") || "Anonymous";
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

// File upload configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/mov'];
const SUPPORTED_AUDIO_TYPES = ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];
const ALL_SUPPORTED_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES, ...SUPPORTED_AUDIO_TYPES];

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

// File upload functions
function validateFile(file) {
  if (!file) {
    throw new Error('No file selected');
  }
  
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
  }
  
  if (!ALL_SUPPORTED_TYPES.includes(file.type)) {
    throw new Error('Unsupported file type. Please upload images, videos, or audio files.');
  }
  
  return true;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFileUpload(file) {
  try {
    validateFile(file);
    
    const base64Data = await fileToBase64(file);
    const mediaData = {
      type: 'media_message',
      mediaType: file.type,
      mediaName: file.name,
      mediaSize: file.size,
      mediaData: base64Data,
      name: name,
      emoji: emoji,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    };
    
    // Show our own media message immediately
    insertMediaMessageToDOM(mediaData, true, drone.clientId);
    
    // Broadcast to others
    const success = broadcastMessage(mediaData);
    
    if (!success) {
      insertSystemMessage('Failed to send media - connection issue');
    }
    
    return true;
  } catch (error) {
    handleError('File upload failed', error);
    return false;
  }
}

function createMediaElement(mediaType, mediaData, mediaName) {
  let mediaEl;
  
  if (SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
    mediaEl = document.createElement('img');
    mediaEl.src = mediaData;
    mediaEl.alt = mediaName;
    mediaEl.style.cssText = `
      max-width: 300px;
      max-height: 300px;
      border-radius: 8px;
      cursor: pointer;
    `;
    
    // Add click to expand functionality
    mediaEl.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        cursor: pointer;
      `;
      
      const fullImg = document.createElement('img');
      fullImg.src = mediaData;
      fullImg.style.cssText = `
        max-width: 90vw;
        max-height: 90vh;
        object-fit: contain;
      `;
      
      overlay.appendChild(fullImg);
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
    
  } else if (SUPPORTED_VIDEO_TYPES.includes(mediaType)) {
    mediaEl = document.createElement('video');
    mediaEl.src = mediaData;
    mediaEl.controls = true;
    mediaEl.style.cssText = `
      max-width: 300px;
      max-height: 200px;
      border-radius: 8px;
    `;
    
  } else if (SUPPORTED_AUDIO_TYPES.includes(mediaType)) {
    mediaEl = document.createElement('audio');
    mediaEl.src = mediaData;
    mediaEl.controls = true;
    mediaEl.style.cssText = `
      width: 280px;
      max-width: 100%;
    `;
  }
  
  return mediaEl;
}

function insertMediaMessageToDOM(mediaData, isFromMe = false, senderId = null) {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${isFromMe ? 'message--mine' : 'message--theirs'}`;
  
  // Add sender color border for others' messages
  if (!isFromMe && senderId) {
    messageEl.style.borderLeft = `3px solid ${getUserColor(senderId)}`;
  }
  
  const messageHTML = `
    <div class="message__name" style="margin-bottom: 8px; font-weight: bold; font-size: 0.9em; ${!isFromMe && senderId ? `color: ${getUserColor(senderId)}` : ''}">
      ${mediaData.emoji || ''} ${mediaData.name || 'Anonymous'}
    </div>
    <div class="message__bubble" style="background: ${isFromMe ? '#007bff' : '#f1f1f1'}; color: ${isFromMe ? 'white' : 'black'}; padding: 12px; border-radius: 18px; max-width: 350px;">
      <div class="media-container" style="margin-bottom: 8px;"></div>
      <div class="media-info" style="font-size: 0.8em; opacity: 0.7; margin-top: 8px;">
        📎 ${mediaData.mediaName} (${(mediaData.mediaSize / 1024).toFixed(1)}KB)
      </div>
      <small style="display: block; opacity: 0.6; font-size: 0.75em; margin-top: 4px;">
        ${new Date(mediaData.timestamp).toLocaleTimeString()}
      </small>
    </div>
  `;
  
  messageEl.innerHTML = messageHTML;
  
  // Add media element
  const mediaContainer = messageEl.querySelector('.media-container');
  const mediaElement = createMediaElement(mediaData.mediaType, mediaData.mediaData, mediaData.mediaName);
  
  if (mediaElement && mediaContainer) {
    mediaContainer.appendChild(mediaElement);
  }
  
  messagesEl.appendChild(messageEl);
  scrollToBottom();
}

// Wait for Scaledrone signalling server to connect
drone.on('open', error => {
  if (error) {
    handleError('Failed to connect to chat server', error);
    return;
  }
  
  showStatus('Connected to chat server');
  room = drone.subscribe(roomName);
  
  room.on('open', error => {
    if (error) {
      handleError('Failed to join chat room', error);
      return;
    }
    console.log('Connected to room:', roomName);
    isConnected = true;
    showStatus('Connected - Ready to chat!');
    insertSystemMessage('Connected to chat room! 🎉');
  });

  room.on('members', members => {
    console.log('Room members:', members.length);
    connectedUsers.clear();
    
    members.forEach(member => {
      connectedUsers.set(member.id, {
        id: member.id,
        clientData: member.clientData || {}
      });
    });
    
    insertUserCountMessage(members.length);
    showStatus(`Connected (${members.length} users online)`);
    
    if (members.length === 1) {
      insertSystemMessage('You are the first person in this chat room!');
    }
  });

  room.on('member_join', member => {
    console.log('Member joined:', member.id);
    connectedUsers.set(member.id, {
      id: member.id,
      clientData: member.clientData || {}
    });
    
    insertUserCountMessage(connectedUsers.size);
    insertSystemMessage(`Someone joined the chat 👋`);
    showStatus(`Connected (${connectedUsers.size} users online)`);
  });

  room.on('member_leave', member => {
    console.log('Member left:', member.id);
    connectedUsers.delete(member.id);
    
    insertUserCountMessage(connectedUsers.size);
    insertSystemMessage(`Someone left the chat 👋`);
    showStatus(`Connected (${connectedUsers.size} users online)`);
  });

  // Listen for messages from other users
  room.on('data', (data, client) => {
    // Don't show our own messages (we already display them)
    if (client.id === drone.clientId) {
      return;
    }

    console.log('Received message from:', client.id, data);
    
    if (data.type === 'chat_message') {
      insertMessageToDOM(data.message, false, client.id);
    } else if (data.type === 'media_message') {
      insertMediaMessageToDOM(data, false, client.id);
    } else if (data.type === 'user_joined') {
      insertSystemMessage(`${data.emoji} ${data.name} joined the chat`);
    } else if (data.type === 'user_typing') {
      showTypingIndicator(data.name, data.emoji);
    }
  });

  // Announce our arrival
  broadcastMessage({
    type: 'user_joined',
    name: name,
    emoji: emoji,
    timestamp: Date.now()
  });
});

drone.on('error', error => {
  handleError('Chat server error', error);
  isConnected = false;
});

drone.on('close', () => {
  console.log('Connection to chat server closed');
  isConnected = false;
  showStatus('Disconnected');
  insertSystemMessage('Connection lost. Refresh to reconnect.');
});

// Broadcast message to all users in the room
function broadcastMessage(messageData) {
  if (!isConnected || !room) {
    console.error('Cannot send message - not connected to chat room');
    return false;
  }

  try {
    drone.publish({
      room: roomName,
      message: messageData
    });
    return true;
  } catch (error) {
    console.error('Failed to broadcast message:', error);
    handleError('Failed to send message', error);
    return false;
  }
}

function sendChatMessage(content) {
  if (!content || content.trim() === '') {
    return;
  }

  const messageData = {
    name: name,
    content: content.trim(),
    emoji: emoji,
    timestamp: Date.now(),
    id: Math.random().toString(36).substr(2, 9)
  };

  console.log('Sending message:', messageData);

  // Show our own message immediately
  insertMessageToDOM(messageData, true, drone.clientId);

  // Broadcast to others
  const success = broadcastMessage({
    type: 'chat_message',
    message: messageData
  });

  if (!success) {
    insertSystemMessage('Failed to send message - connection issue');
  }

  // Store in message history
  messageHistory.push(messageData);
  
  // Limit history size
  if (messageHistory.length > 100) {
    messageHistory = messageHistory.slice(-100);
  }
}

function insertMessageToDOM(messageData, isFromMe = false, senderId = null) {
  const template = document.querySelector('template[data-template="message"]');
  if (!template) {
    console.error('Message template not found in HTML');
    return;
  }

  const nameEl = template.content.querySelector('.message__name');
  const bubbleEl = template.content.querySelector('.message__bubble');
  
  if (nameEl) {
    nameEl.textContent = `${messageData.emoji || ''} ${messageData.name || 'Anonymous'}`.trim();
    
    // Add color for different users
    if (senderId && !isFromMe) {
      nameEl.style.color = getUserColor(senderId);
    }
  }
  
  if (bubbleEl) {
    bubbleEl.textContent = messageData.content || '';
    
    // Add timestamp
    if (messageData.timestamp) {
      const timeEl = document.createElement('small');
      timeEl.textContent = new Date(messageData.timestamp).toLocaleTimeString();
      timeEl.style.cssText = `
        display: block;
        opacity: 0.6;
        font-size: 0.75em;
        margin-top: 4px;
      `;
      bubbleEl.appendChild(timeEl);
    }
  }

  const clone = document.importNode(template.content, true);
  const messageEl = clone.querySelector('.message');
  
  if (messageEl) {
    messageEl.classList.add(isFromMe ? 'message--mine' : 'message--theirs');
    
    // Add sender color border for others' messages
    if (!isFromMe && senderId) {
      messageEl.style.borderLeft = `3px solid ${getUserColor(senderId)}`;
    }
  }

  const messagesEl = document.querySelector('.messages');
  if (messagesEl) {
    messagesEl.appendChild(clone);
    scrollToBottom();
  }
}

// Typing indicator (optional feature)
let typingTimeout;
function showTypingIndicator(userName, userEmoji) {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;

  // Remove existing typing indicator
  const existingIndicator = messagesEl.querySelector('.typing-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }

  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = `
    <span style="opacity: 0.7; font-style: italic;">
      ${userEmoji} ${userName} is typing...
    </span>
  `;
  typingEl.style.cssText = `
    padding: 8px 16px;
    margin: 5px 0;
    background: rgba(0,0,0,0.05);
    border-radius: 12px;
    font-size: 0.9em;
  `;
  
  messagesEl.appendChild(typingEl);
  scrollToBottom();

  // Remove after 3 seconds
  setTimeout(() => {
    if (typingEl.parentNode) {
      typingEl.remove();
    }
  }, 3000);
}

// Enhanced form handling
function setupFormHandler() {
  const form = document.querySelector('form');
  const input = document.querySelector('input[type="text"]');
  
  if (!form || !input) {
    console.error('Form or input not found in HTML');
    return;
  }

  console.log('Setting up form handler for unlimited users chat');

  // Create file input for media uploads
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = ALL_SUPPORTED_TYPES.join(',');
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      const uploadButton = document.querySelector('.upload-button');
      if (uploadButton) {
        uploadButton.textContent = 'Uploading...';
        uploadButton.disabled = true;
      }
      
      const success = await handleFileUpload(file);
      
      if (uploadButton) {
        uploadButton.textContent = '📎';
        uploadButton.disabled = false;
      }
      
      // Reset file input
      fileInput.value = '';
    }
  });
  
  // Add file input to the form
  form.appendChild(fileInput);
  
  // Create upload button
  const uploadButton = document.createElement('button');
  uploadButton.type = 'button';
  uploadButton.className = 'upload-button';
  uploadButton.textContent = '📎';
  uploadButton.title = 'Upload image, video, or audio';
  uploadButton.style.cssText = `
    background: #4ECDC4;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    margin-left: 8px;
    cursor: pointer;
    font-size: 16px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  uploadButton.addEventListener('click', () => {
    fileInput.click();
  });
  
  // Add upload button next to the send button
  const sendButton = form.querySelector('button[type="submit"]');
  if (sendButton) {
    sendButton.parentNode.insertBefore(uploadButton, sendButton);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const value = input.value.trim();
    console.log('Form submitted with value:', value);
    
    if (!value) {
      console.log('Empty message, not sending');
      return;
    }

    input.value = '';
    sendChatMessage(value);
  });

  // Enhanced keyboard handling with typing indicator
  let isTyping = false;
  input.addEventListener('input', () => {
    if (!isTyping && input.value.trim()) {
      isTyping = true;
      broadcastMessage({
        type: 'user_typing',
        name: name,
        emoji: emoji
      });
    }
    
    // Reset typing indicator
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
    }, 2000);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      clearTimeout(typingTimeout);
      isTyping = false;
      form.dispatchEvent(new Event('submit'));
    }
  });

  // Focus input for better UX
  input.focus();
}

// Initialize when DOM is ready
function init() {
  console.log('Initializing unlimited users chat application with media support');
  console.log('User:', emoji, name);
  console.log('Chat room:', chatHash);
  
  setupFormHandler();
  insertSystemMessage(`Welcome to the chat room! 🎊`);
  insertSystemMessage(`You are: ${emoji} ${name}`);
  insertSystemMessage(`Room: ${chatHash}`);
  insertSystemMessage(`📎 You can now upload images, videos, and audio files!`);
  
  // Show connection status
  showStatus('Connecting...');
  
  // Global error handlers
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    handleError('Unexpected error occurred', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    handleError('Promise rejection', event.reason);
  });

  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isConnected) {
      insertSystemMessage('Attempting to reconnect...');
      // Note: Scaledrone should auto-reconnect, but we can show status
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (isConnected) {
      broadcastMessage({
        type: 'user_left',
        name: name,
        emoji: emoji
      });
    }
    if (drone) {
      drone.close();
    }
  });

  // Add some helpful commands
  insertSystemMessage('💡 Tip: Share this URL with others to invite them to chat!');
  insertSystemMessage('📱 Click the 📎 button to share photos, videos, or audio!');
}

// Start the application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}