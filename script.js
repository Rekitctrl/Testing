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
    
    if (data.type === 'chat_message') {
      insertMessageToDOM(data.message, false, client.id);
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

// Reference to the message container where files are dropped
const messagesEl = document.querySelector('.messages');

// Show visual indicator when dragging over the drop area
['dragenter', 'dragover'].forEach(eventName => {
  messagesEl.addEventListener(eventName, e => {
    e.preventDefault();
    messagesEl.classList.add('drag-hover');
  });
});

// Remove indicator on leave or drop
['dragleave', 'drop'].forEach(eventName => {
  messagesEl.addEventListener(eventName, () => {
    messagesEl.classList.remove('drag-hover');
  });
});

// Handle file drop
messagesEl.addEventListener('drop', e => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files);

  files.forEach(file => {
    const reader = new FileReader();

    reader.onload = () => {
      const base64 = reader.result;
      let htmlContent = '';

      // Render image or video based on file type
      if (file.type.startsWith('image/')) {
        htmlContent = `<img src="${base64}" style="max-width:100%; border-radius:8px;">`;
      } else if (file.type.startsWith('video/')) {
        htmlContent = `<video controls style="max-width:100%; border-radius:8px;">
                         <source src="${base64}" type="${file.type}">
                       </video>`;
      } else {
        insertSystemMessage(`❌ Unsupported file: ${file.name}`);
        return;
      }

      // Compress HTML and encode to Base64
      const compressed = pako.deflate(htmlContent);
      const encoded = btoa(String.fromCharCode(...compressed));

      const msg = {
        name: `${emoji} ${name}`, // assumes emoji and name are defined
        content: encoded,
        compressed: true
      };

      // Display on sender's screen
      insertMessageToDOM({ name: msg.name, content: htmlContent }, true);

      // Broadcast to chat room (assuming drone and roomName are defined)
      drone.publish({
        room: roomName,
        message: msg
      });
    };

    reader.readAsDataURL(file);
  });
});

// Optional helper to insert system messages
function insertSystemMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'system-message';
  msg.textContent = text;
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Initialize when DOM is ready
function init() {
  console.log('Initializing unlimited users chat application');
  console.log('User:', emoji, name);
  console.log('Chat room:', chatHash);
  
  setupFormHandler();
  insertSystemMessage(`Welcome to the chat room! 🎊`);
  insertSystemMessage(`You are: ${emoji} ${name}`);
  insertSystemMessage(`Room: ${chatHash}`);
  
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
