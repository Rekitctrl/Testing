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

// Compression utilities using native JavaScript
function compressString(str) {
  // Simple LZ-style compression for text
  const dict = {};
  let data = (str + "").split("");
  let out = [];
  let currChar;
  let phrase = data[0];
  let code = 256;
  
  for (let i = 1; i < data.length; i++) {
    currChar = data[i];
    if (dict[phrase + currChar] != null) {
      phrase += currChar;
    } else {
      out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
      dict[phrase + currChar] = code;
      code++;
      phrase = currChar;
    }
  }
  out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
  
  return JSON.stringify(out);
}

function decompressString(compressed) {
  try {
    const data = JSON.parse(compressed);
    const dict = {};
    let currChar = String.fromCharCode(data[0]);
    let oldPhrase = currChar;
    let out = [currChar];
    let code = 256;
    let phrase;
    
    for (let i = 1; i < data.length; i++) {
      let currCode = data[i];
      if (currCode < 256) {
        phrase = String.fromCharCode(data[i]);
      } else {
        phrase = dict[currCode] ? dict[currCode] : (oldPhrase + currChar);
      }
      out.push(phrase);
      currChar = phrase.charAt(0);
      dict[code] = oldPhrase + currChar;
      code++;
      oldPhrase = phrase;
    }
    return out.join("");
  } catch (e) {
    console.error('Decompression failed:', e);
    return compressed; // Return original if decompression fails
  }
}

// Chunking utilities for large messages
const CHUNK_SIZE = 15000; // Leave room for metadata

function createChunks(data, messageId) {
  const compressed = compressString(JSON.stringify(data));
  const chunks = [];
  const totalChunks = Math.ceil(compressed.length / CHUNK_SIZE);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, compressed.length);
    const chunk = compressed.slice(start, end);
    
    chunks.push({
      type: 'chunk',
      messageId: messageId,
      chunkIndex: i,
      totalChunks: totalChunks,
      data: chunk,
      timestamp: Date.now()
    });
  }
  
  return chunks;
}

// Chunk reassembly
const pendingChunks = new Map();

function handleChunk(chunkData) {
  const { messageId, chunkIndex, totalChunks, data } = chunkData;
  
  if (!pendingChunks.has(messageId)) {
    pendingChunks.set(messageId, {
      chunks: new Array(totalChunks),
      receivedCount: 0,
      totalChunks: totalChunks
    });
  }
  
  const pending = pendingChunks.get(messageId);
  
  if (!pending.chunks[chunkIndex]) {
    pending.chunks[chunkIndex] = data;
    pending.receivedCount++;
  }
  
  // Check if all chunks received
  if (pending.receivedCount === pending.totalChunks) {
    const compressed = pending.chunks.join('');
    const decompressed = decompressString(compressed);
    const originalData = JSON.parse(decompressed);
    
    pendingChunks.delete(messageId);
    return originalData;
  }
  
  return null; // Still waiting for more chunks
}

// Image utilities
function resizeImage(file, maxWidth = 800, maxHeight = 600, quality = 0.8) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      let { width, height } = img;
      
      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    
    img.src = URL.createObjectURL(file);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
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

// Global variables for signaling-based messaging
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
    
    if (data.type === 'chunk') {
      const reassembled = handleChunk(data);
      if (reassembled) {
        // Process the reassembled message
        if (reassembled.type === 'chat_message') {
          insertMessageToDOM(reassembled.message, false, client.id);
        } else if (reassembled.type === 'image_message') {
          insertImageToDOM(reassembled.message, false, client.id);
        }
      }
    } else if (data.type === 'chat_message') {
      insertMessageToDOM(data.message, false, client.id);
    } else if (data.type === 'image_message') {
      insertImageToDOM(data.message, false, client.id);
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

// Enhanced broadcast message with compression and chunking
function broadcastMessage(messageData) {
  if (!isConnected || !room) {
    console.error('Cannot send message - not connected to chat room');
    return false;
  }

  try {
    const serialized = JSON.stringify(messageData);
    
    // Check if message needs chunking
    if (serialized.length > 15000) {
      const messageId = Math.random().toString(36).substr(2, 9);
      const chunks = createChunks(messageData, messageId);
      
      insertSystemMessage(`📦 Sending large message in ${chunks.length} chunks...`);
      
      chunks.forEach((chunk, index) => {
        setTimeout(() => {
          drone.publish({
            room: roomName,
            message: chunk
          });
        }, index * 100); // Stagger chunk sending
      });
      
      return true;
    } else {
      // Compress smaller messages
      const compressed = compressString(serialized);
      if (compressed.length < serialized.length * 0.8) {
        // Only use compression if it saves significant space
        drone.publish({
          room: roomName,
          message: {
            type: 'compressed',
            data: compressed,
            originalType: messageData.type
          }
        });
      } else {
        drone.publish({
          room: roomName,
          message: messageData
        });
      }
      return true;
    }
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

async function sendImageMessage(file) {
  try {
    insertSystemMessage('📸 Processing image...');
    
    // Resize image to reduce file size
    const resizedFile = await resizeImage(file);
    const base64 = await fileToBase64(resizedFile);
    
    const messageData = {
      name: name,
      emoji: emoji,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9),
      imageData: base64,
      fileName: file.name,
      fileSize: resizedFile.size
    };

    console.log('Sending image message:', messageData.fileName);

    // Show our own image immediately
    insertImageToDOM(messageData, true, drone.clientId);

    // Broadcast to others
    const success = broadcastMessage({
      type: 'image_message',
      message: messageData
    });

    if (!success) {
      insertSystemMessage('Failed to send image - connection issue');
    }

  } catch (error) {
    console.error('Failed to send image:', error);
    insertSystemMessage('Failed to process image');
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

function insertImageToDOM(messageData, isFromMe = false, senderId = null) {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${isFromMe ? 'message--mine' : 'message--theirs'}`;
  
  if (!isFromMe && senderId) {
    messageEl.style.borderLeft = `3px solid ${getUserColor(senderId)}`;
  }

  const nameEl = document.createElement('div');
  nameEl.className = 'message__name';
  nameEl.textContent = `${messageData.emoji || ''} ${messageData.name || 'Anonymous'}`.trim();
  
  if (senderId && !isFromMe) {
    nameEl.style.color = getUserColor(senderId);
  }

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'message__bubble';
  bubbleEl.style.cssText = `
    max-width: 300px;
    padding: 8px;
    background: ${isFromMe ? '#007bff' : '#e9ecef'};
    color: ${isFromMe ? 'white' : 'black'};
    border-radius: 12px;
    margin: 4px 0;
  `;

  const img = document.createElement('img');
  img.src = messageData.imageData;
  img.alt = messageData.fileName || 'Shared image';
  img.style.cssText = `
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    cursor: pointer;
  `;
  
  // Click to view full size
  img.addEventListener('click', () => {
    const fullSizeWindow = window.open('', '_blank');
    fullSizeWindow.document.write(`
      <html>
        <head><title>${messageData.fileName || 'Image'}</title></head>
        <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;">
          <img src="${messageData.imageData}" style="max-width:100%;max-height:100%;object-fit:contain;">
        </body>
      </html>
    `);
  });

  bubbleEl.appendChild(img);

  // Add file info
  if (messageData.fileName) {
    const fileInfo = document.createElement('small');
    fileInfo.textContent = `📎 ${messageData.fileName}`;
    fileInfo.style.cssText = `
      display: block;
      opacity: 0.8;
      font-size: 0.75em;
      margin-top: 4px;
    `;
    bubbleEl.appendChild(fileInfo);
  }

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

  messageEl.appendChild(nameEl);
  messageEl.appendChild(bubbleEl);

  messagesEl.appendChild(messageEl);
  scrollToBottom();
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

// Drag and drop functionality
function setupDragAndDrop() {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    messagesEl.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop zone
  ['dragenter', 'dragover'].forEach(eventName => {
    messagesEl.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    messagesEl.addEventListener(eventName, unhighlight, false);
  });

  function highlight(e) {
    messagesEl.style.background = 'rgba(0, 123, 255, 0.1)';
    messagesEl.style.border = '2px dashed #007bff';
  }

  function unhighlight(e) {
    messagesEl.style.background = '';
    messagesEl.style.border = '';
  }

  // Handle dropped files
  messagesEl.addEventListener('drop', handleDrop, false);

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    handleFiles(files);
  }

  function handleFiles(files) {
    [...files].forEach(file => {
      if (file.type.startsWith('image/')) {
        sendImageMessage(file);
      } else {
        insertSystemMessage(`❌ Only image files are supported. Received: ${file.type}`);
      }
    });
  }
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

  // Add paste handler for images
  input.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        sendImageMessage(blob);
        e.preventDefault();
      }
    }
  });
}

// Initialize when DOM is ready
function init() {
  console.log('Initializing unlimited users chat application with compression and image support');
  console.log('User:', emoji, name);
  console.log('Chat room:', chatHash);
  
  setupFormHandler();
  setupDragAndDrop();
  
  insertSystemMessage(`Welcome to the chat room! 🎊`);
  insertSystemMessage(`You are: ${emoji} ${name}`);
  insertSystemMessage(`Room: ${chatHash}`);
  insertSystemMessage(`💡 Drag & drop or paste images to share them!`);
  
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
}

// Start the application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}