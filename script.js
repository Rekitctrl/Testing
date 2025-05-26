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

// Color palette for different users
const userColorPalette = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85929E', '#A569BD'
];

let colorIndex = 0;

// File upload utilities
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for large files
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'];

// Store for file transfers
let fileTransfers = new Map();
let receivedFiles = new Map();

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

// File handling functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateFileId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function isImageFile(file) {
  return SUPPORTED_IMAGE_TYPES.includes(file.type);
}

function isVideoFile(file) {
  return SUPPORTED_VIDEO_TYPES.includes(file.type);
}

function isSupportedFile(file) {
  return isImageFile(file) || isVideoFile(file);
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64.split(',')[1]);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

async function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
  if (!isImageFile(file)) return file;
  
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(resolve, file.type, quality);
    };
    
    img.src = URL.createObjectURL(file);
  });
}

async function sendFileInChunks(file, fileId) {
  const base64Data = await fileToBase64(file);
  const chunks = [];
  const chunkCount = Math.ceil(base64Data.length / CHUNK_SIZE);
  
  // Split into chunks
  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, base64Data.length);
    chunks.push(base64Data.slice(start, end));
  }
  
  // Send file metadata first
  const fileMetadata = {
    type: 'file_metadata',
    fileId: fileId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    chunkCount: chunks.length,
    timestamp: Date.now(),
    sender: {
      name: name,
      emoji: emoji
    }
  };
  
  broadcastMessage(fileMetadata);
  
  // Send chunks with delay to avoid overwhelming the connection
  for (let i = 0; i < chunks.length; i++) {
    const chunkData = {
      type: 'file_chunk',
      fileId: fileId,
      chunkIndex: i,
      chunkData: chunks[i],
      isLastChunk: i === chunks.length - 1
    };
    
    broadcastMessage(chunkData);
    
    // Small delay between chunks
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Update progress
    const progress = Math.round(((i + 1) / chunks.length) * 100);
    updateFileProgress(fileId, progress, 'Sending');
  }
}

function updateFileProgress(fileId, progress, status) {
  const progressEl = document.querySelector(`[data-file-id="${fileId}"] .file-progress`);
  if (progressEl) {
    progressEl.innerHTML = `
      <div class="progress-bar" style="width: 100%; background: #f0f0f0; border-radius: 4px; height: 6px; margin: 4px 0;">
        <div style="width: ${progress}%; background: #4ECDC4; height: 100%; border-radius: 4px; transition: width 0.3s;"></div>
      </div>
      <small style="opacity: 0.7;">${status}: ${progress}%</small>
    `;
  }
}

function createFilePreview(file, fileId, isFromMe = false) {
  const container = document.createElement('div');
  container.className = 'file-message';
  container.setAttribute('data-file-id', fileId);
  container.style.cssText = `
    max-width: 400px;
    margin: 8px 0;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(0,0,0,0.05);
    border: 1px solid rgba(0,0,0,0.1);
  `;
  
  if (isImageFile(file)) {
    const img = document.createElement('img');
    img.style.cssText = `
      width: 100%;
      height: auto;
      max-height: 300px;
      object-fit: contain;
      display: block;
    `;
    img.src = URL.createObjectURL(file);
    container.appendChild(img);
  } else if (isVideoFile(file)) {
    const video = document.createElement('video');
    video.controls = true;
    video.style.cssText = `
      width: 100%;
      height: auto;
      max-height: 300px;
      display: block;
    `;
    video.src = URL.createObjectURL(file);
    container.appendChild(video);
  }
  
  // File info
  const info = document.createElement('div');
  info.style.cssText = `
    padding: 8px 12px;
    background: rgba(255,255,255,0.8);
    font-size: 0.9em;
  `;
  info.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">${file.name}</div>
    <div style="opacity: 0.7;">${formatFileSize(file.size)}</div>
    <div class="file-progress"></div>
  `;
  
  container.appendChild(info);
  return container;
}

function handleFileReceived(metadata, chunks) {
  try {
    // Reconstruct the file data
    const base64Data = chunks.join('');
    const blob = base64ToBlob(base64Data, metadata.fileType);
    const file = new File([blob], metadata.fileName, { type: metadata.fileType });
    
    // Create and insert file message
    const filePreview = createFilePreview(file, metadata.fileId, false);
    
    // Remove progress indicator
    const progressEl = filePreview.querySelector('.file-progress');
    if (progressEl) {
      progressEl.remove();
    }
    
    // Insert as a message
    insertFileMessage(filePreview, metadata.sender, false);
    
    insertSystemMessage(`📎 ${metadata.sender.emoji} ${metadata.sender.name} shared: ${metadata.fileName}`);
    
    // Cleanup
    receivedFiles.delete(metadata.fileId);
    
  } catch (error) {
    console.error('Error reconstructing file:', error);
    handleError('Failed to receive file', error);
  }
}

function insertFileMessage(fileElement, sender, isFromMe = false) {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;

  const messageContainer = document.createElement('div');
  messageContainer.className = `message ${isFromMe ? 'message--mine' : 'message--theirs'}`;
  messageContainer.style.cssText = `
    margin: 10px 0;
    display: flex;
    flex-direction: column;
    align-items: ${isFromMe ? 'flex-end' : 'flex-start'};
  `;
  
  if (!isFromMe) {
    const nameEl = document.createElement('div');
    nameEl.className = 'message__name';
    nameEl.textContent = `${sender.emoji} ${sender.name}`;
    nameEl.style.cssText = `
      font-size: 0.8em;
      margin-bottom: 4px;
      opacity: 0.7;
    `;
    messageContainer.appendChild(nameEl);
  }
  
  messageContainer.appendChild(fileElement);
  messagesEl.appendChild(messageContainer);
  scrollToBottom();
}

async function handleFileSelection(files) {
  for (const file of files) {
    if (!isSupportedFile(file)) {
      insertSystemMessage(`❌ Unsupported file type: ${file.type}`);
      continue;
    }
    
    if (file.size > MAX_FILE_SIZE) {
      insertSystemMessage(`❌ File too large: ${formatFileSize(file.size)} (max: ${formatFileSize(MAX_FILE_SIZE)})`);
      continue;
    }
    
    try {
      let processedFile = file;
      
      // Compress images if needed
      if (isImageFile(file) && file.size > 1024 * 1024) { // 1MB
        insertSystemMessage(`🔄 Compressing image: ${file.name}`);
        processedFile = await compressImage(file);
      }
      
      const fileId = generateFileId();
      
      // Show local preview immediately
      const filePreview = createFilePreview(processedFile, fileId, true);
      insertFileMessage(filePreview, { name, emoji }, true);
      
      // Send file
      await sendFileInChunks(processedFile, fileId);
      
      // Remove progress indicator after sending
      setTimeout(() => {
        const progressEl = filePreview.querySelector('.file-progress');
        if (progressEl) {
          progressEl.remove();
        }
      }, 1000);
      
    } catch (error) {
      console.error('Error processing file:', error);
      handleError(`Failed to send file: ${file.name}`, error);
    }
  }
}

function setupFileUpload() {
  // Create file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES].join(',');
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  
  // Create upload button
  const uploadBtn = document.createElement('button');
  uploadBtn.innerHTML = '📎';
  uploadBtn.title = 'Upload Image/Video';
  uploadBtn.type = 'button';
  uploadBtn.style.cssText = `
    background: #4ECDC4;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 18px;
    cursor: pointer;
    margin-left: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  
  uploadBtn.addEventListener('mouseenter', () => {
    uploadBtn.style.background = '#45B7D1';
  });
  
  uploadBtn.addEventListener('mouseleave', () => {
    uploadBtn.style.background = '#4ECDC4';
  });
  
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(Array.from(e.target.files));
      e.target.value = ''; // Reset input
    }
  });
  
  // Add to form
  const form = document.querySelector('form');
  if (form) {
    form.appendChild(uploadBtn);
  }
  
  // Drag and drop support
  const messagesEl = document.querySelector('.messages');
  if (messagesEl) {
    messagesEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      messagesEl.style.background = 'rgba(78, 205, 196, 0.1)';
    });
    
    messagesEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      messagesEl.style.background = '';
    });
    
    messagesEl.addEventListener('drop', (e) => {
      e.preventDefault();
      messagesEl.style.background = '';
      
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFileSelection(files);
      }
    });
  }
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
    } else if (data.type === 'user_joined') {
      insertSystemMessage(`${data.emoji} ${data.name} joined the chat`);
    } else if (data.type === 'user_typing') {
      showTypingIndicator(data.name, data.emoji);
    } else if (data.type === 'file_metadata') {
      // Initialize file transfer
      receivedFiles.set(data.fileId, {
        metadata: data,
        chunks: new Array(data.chunkCount),
        receivedChunks: 0
      });
      insertSystemMessage(`📎 Receiving file: ${data.fileName} (${formatFileSize(data.fileSize)})`);
    } else if (data.type === 'file_chunk') {
      // Handle file chunk
      const transfer = receivedFiles.get(data.fileId);
      if (transfer) {
        transfer.chunks[data.chunkIndex] = data.chunkData;
        transfer.receivedChunks++;
        
        const progress = Math.round((transfer.receivedChunks / transfer.metadata.chunkCount) * 100);
        console.log(`File ${data.fileId}: ${progress}% received`);
        
        if (transfer.receivedChunks === transfer.metadata.chunkCount) {
          // File complete
          handleFileReceived(transfer.metadata, transfer.chunks);
        }
      }
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
  console.log('Initializing unlimited users chat application with file support');
  console.log('User:', emoji, name);
  console.log('Chat room:', chatHash);
  
  setupFormHandler();
  setupFileUpload();
  
  insertSystemMessage(`Welcome to the chat room! 🎊`);
  insertSystemMessage(`You are: ${emoji} ${name}`);
  insertSystemMessage(`Room: ${chatHash}`);
  insertSystemMessage(`📎 Drag & drop images/videos or use the 📎 button to share files!`);
  
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
    
    // Cleanup file URLs to prevent memory leaks
    document.querySelectorAll('img, video').forEach(media => {
      if (media.src && media.src.startsWith('blob:')) {
        URL.revokeObjectURL(media.src);
      }
    });
  });

  // Add some helpful commands
  insertSystemMessage('💡 Tip: Share this URL with others to invite them to chat!');
  insertSystemMessage('🎨 Supported files: Images (JPEG, PNG, GIF, WebP, BMP) and Videos (MP4, WebM, OGG, AVI, MOV)');
}

// Start the application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
