// Enhanced emoji collection
const possibleEmojis = [
‘🐀’,‘🐁’,‘🐭’,‘🐹’,‘🐂’,‘🐃’,‘🐄’,‘🐮’,‘🐅’,‘🐆’,‘🐯’,‘🐇’,‘🐐’,‘🐑’,‘🐏’,‘🐴’,
‘🐎’,‘🐱’,‘🐈’,‘🐰’,‘🐓’,‘🐔’,‘🐤’,‘🐣’,‘🐥’,‘🐦’,‘🐧’,‘🐘’,‘🐩’,‘🐕’,‘🐷’,‘🐖’,
‘🐗’,‘🐫’,‘🐪’,‘🐶’,‘🐺’,‘🐻’,‘🐨’,‘🐼’,‘🐵’,‘🙈’,‘🙉’,‘🙊’,‘🐒’,‘🐉’,‘🐲’,‘🐊’,
‘🐍’,‘🐢’,‘🐸’,‘🐋’,‘🐳’,‘🐬’,‘🐙’,‘🐟’,‘🐠’,‘🐡’,‘🐚’,‘🐌’,‘🐛’,‘🐜’,‘🐝’,‘🐞’,
];

function randomEmoji() {
return possibleEmojis[Math.floor(Math.random() * possibleEmojis.length)];
}

// ============== ENCRYPTION MODULE ==============
class ChatEncryption {
constructor(password = ‘’) {
this.password = password;
this.algorithm = ‘AES-GCM’;
this.keyCache = null;
}

// Generate a key from password using PBKDF2
async generateKey(salt) {
if (this.keyCache && this.keyCache.salt === salt) {
return this.keyCache.key;
}

```
const encoder = new TextEncoder();
const passwordBuffer = encoder.encode(this.password);
const saltBuffer = encoder.encode(salt);

// Import password as key material
const keyMaterial = await crypto.subtle.importKey(
  'raw',
  passwordBuffer,
  { name: 'PBKDF2' },
  false,
  ['deriveBits', 'deriveKey']
);

// Derive actual encryption key
const key = await crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt: saltBuffer,
    iterations: 100000,
    hash: 'SHA-256'
  },
  keyMaterial,
  { name: this.algorithm, length: 256 },
  false,
  ['encrypt', 'decrypt']
);

this.keyCache = { key, salt };
return key;
```

}

// Encrypt a message
async encrypt(message) {
if (!this.password) {
return { encrypted: false, data: message };
}

```
try {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await this.generateKey(Array.from(salt).map(b => String.fromCharCode(b)).join(''));
  
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: this.algorithm,
      iv: iv
    },
    key,
    data
  );

  // Combine salt + iv + encrypted data
  const result = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encryptedData), salt.length + iv.length);

  // Convert to base64 for transmission
  const base64 = btoa(String.fromCharCode(...result));
  
  return {
    encrypted: true,
    data: base64
  };
} catch (error) {
  console.error('Encryption error:', error);
  return { encrypted: false, data: message };
}
```

}

// Decrypt a message
async decrypt(encryptedData) {
if (!encryptedData.encrypted || !this.password) {
return encryptedData.data;
}

```
try {
  // Convert from base64
  const combined = new Uint8Array(
    atob(encryptedData.data).split('').map(c => c.charCodeAt(0))
  );
  
  // Extract salt, iv, and encrypted data
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encrypted = combined.slice(28);
  
  const saltString = Array.from(salt).map(b => String.fromCharCode(b)).join('');
  const key = await this.generateKey(saltString);
  
  const decryptedData = await crypto.subtle.decrypt(
    {
      name: this.algorithm,
      iv: iv
    },
    key,
    encrypted
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedData);
} catch (error) {
  console.error('Decryption error:', error);
  return '[🔒 Decryption failed - wrong password?]';
}
```

}
}

// ============== APPLICATION VARIABLES ==============
const emoji = randomEmoji();
let name = prompt(“What’s your name?”);

// Validate name
while (!name || name.trim() === ‘’) {
name = prompt(“Please enter a valid name:”);
}
name = name.trim();

// Get encryption password
let encryptionPassword = prompt(“Enter encryption password (optional - leave blank for no encryption):”);
if (encryptionPassword) {
encryptionPassword = encryptionPassword.trim();
}

// Initialize encryption
const encryption = new ChatEncryption(encryptionPassword);

const GLOBAL_CHAT_ROOM = ‘global-chat-room’;

// Prompt user for join code
let joinCode = prompt(‘Enter join code (leave blank for global chat):’);

// Use global room if join code is blank or null
if (!joinCode) {
location.hash = GLOBAL_CHAT_ROOM;
} else {
location.hash = joinCode;
}

// Extract the final room identifier from the URL hash
const chatHash = location.hash.substring(1) || GLOBAL_CHAT_ROOM;

// TODO: Replace with your own channel ID
const drone = new ScaleDrone(‘yiS12Ts5RdNhebyM’);
const roomName = ‘observable-’ + chatHash;

// Global variables for signaling-based messaging (no WebRTC needed for unlimited users)
let room;
let isConnected = false;
let messageHistory = [];
let connectedUsers = new Map();
let userColors = {};

// Color palette for different users
const userColorPalette = [
‘#FF6B6B’, ‘#4ECDC4’, ‘#45B7D1’, ‘#96CEB4’, ‘#FFEAA7’,
‘#DDA0DD’, ‘#98D8C8’, ‘#F7DC6F’, ‘#BB8FCE’, ‘#85C1E9’,
‘#F8C471’, ‘#82E0AA’, ‘#F1948A’, ‘#85929E’, ‘#A569BD’
];

let colorIndex = 0;

// Enhanced error handling
function handleError(message, error) {
console.error(message, error);
insertSystemMessage(`Error: ${message}`);
showStatus(`Error: ${message}`);
}

function showStatus(message) {
console.log(‘Status:’, message);
const statusEl = document.querySelector(’.status’);
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
const messagesEl = document.querySelector(’.messages’);
if (!messagesEl) return;

const systemMsg = document.createElement(‘div’);
systemMsg.className = ‘system-message’;
systemMsg.textContent = content;
systemMsg.style.cssText = `text-align: center; color: #666; font-size: 0.9em; margin: 10px 0; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 12px; font-style: italic;`;

messagesEl.appendChild(systemMsg);
scrollToBottom();
}

function insertUserCountMessage(count) {
const messagesEl = document.querySelector(’.messages’);
if (!messagesEl) return;

// Remove existing user count message
const existingCount = messagesEl.querySelector(’.user-count-message’);
if (existingCount) {
existingCount.remove();
}

const countMsg = document.createElement(‘div’);
countMsg.className = ‘user-count-message system-message’;
countMsg.textContent = `👥 ${count} user${count !== 1 ? 's' : ''} online`;
countMsg.style.cssText = `text-align: center; color: #4ECDC4; font-size: 0.9em; margin: 10px 0; padding: 8px; background: rgba(78, 205, 196, 0.1); border-radius: 12px; font-weight: bold; position: sticky; top: 0; z-index: 10;`;

messagesEl.insertBefore(countMsg, messagesEl.firstChild);
}

function scrollToBottom() {
const messagesEl = document.querySelector(’.messages’);
if (messagesEl) {
messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight;
}
}

// Wait for Scaledrone signalling server to connect
drone.on(‘open’, error => {
if (error) {
handleError(‘Failed to connect to chat server’, error);
return;
}

showStatus(‘Connected to chat server’);
room = drone.subscribe(roomName);

room.on(‘open’, error => {
if (error) {
handleError(‘Failed to join chat room’, error);
return;
}
console.log(‘Room Code:’, roomName);
isConnected = true;
showStatus(‘Connected - Ready to chat!’);
insertSystemMessage(‘Connected to chat room! 🎉’);

```
if (encryptionPassword) {
  insertSystemMessage('🔒 End-to-end encryption enabled');
}
```

});

room.on(‘members’, members => {
console.log(‘Room members:’, members.length);
connectedUsers.clear();

```
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
```

});

room.on(‘member_join’, member => {
console.log(‘Member joined:’, member.id);
connectedUsers.set(member.id, {
id: member.id,
clientData: member.clientData || {}
});

```
insertUserCountMessage(connectedUsers.size);
insertSystemMessage(`Someone joined the chat 👋`);
showStatus(`Connected (${connectedUsers.size} users online)`);
```

});

room.on(‘member_leave’, member => {
console.log(‘Member left:’, member.id);
connectedUsers.delete(member.id);

```
insertUserCountMessage(connectedUsers.size);
insertSystemMessage(`Someone left the chat 👋`);
showStatus(`Connected (${connectedUsers.size} users online)`);
```

});

// Listen for messages from other users
room.on(‘data’, async (data, client) => {
// Don’t show our own messages (we already display them)
if (client.id === drone.clientId) {
return;
}

```
console.log('Received message from:', client.id, data);

if (data.type === 'chat_message') {
  // Decrypt the message if it's encrypted
  const decryptedContent = await encryption.decrypt(data.message.content);
  const messageData = {
    ...data.message,
    content: decryptedContent
  };
  insertMessageToDOM(messageData, false, client.id);
} else if (data.type === 'user_joined') {
  insertSystemMessage(`${data.emoji} ${data.name} joined the chat`);
} else if (data.type === 'user_typing') {
  showTypingIndicator(data.name, data.emoji);
}
```

});

// Announce our arrival
broadcastMessage({
type: ‘user_joined’,
name: name,
emoji: emoji,
timestamp: Date.now()
});
});

drone.on(‘error’, error => {
handleError(‘Chat server error’, error);
isConnected = false;
});

drone.on(‘close’, () => {
console.log(‘Connection to chat server closed’);
isConnected = false;
showStatus(‘Disconnected’);
insertSystemMessage(‘Connection lost. Refresh to reconnect.’);
});

// Broadcast message to all users in the room
function broadcastMessage(messageData) {
if (!isConnected || !room) {
console.error(‘Cannot send message - not connected to chat room’);
return false;
}

try {
drone.publish({
room: roomName,
message: messageData
});
return true;
} catch (error) {
console.error(‘Failed to broadcast message:’, error);
handleError(‘Failed to send message’, error);
return false;
}
}

async function sendChatMessage(content) {
if (!content || content.trim() === ‘’) {
return;
}

// Encrypt the message content
const encryptedContent = await encryption.encrypt(content.trim());

const messageData = {
name: name,
content: content.trim(), // Store original for our own display
emoji: emoji,
timestamp: Date.now(),
id: Math.random().toString(36).substr(2, 9)
};

console.log(‘Sending message:’, messageData);

// Show our own message immediately (unencrypted)
insertMessageToDOM(messageData, true, drone.clientId);

// Broadcast encrypted version to others
const encryptedMessageData = {
…messageData,
content: encryptedContent // Send encrypted version
};

const success = broadcastMessage({
type: ‘chat_message’,
message: encryptedMessageData
});

if (!success) {
insertSystemMessage(‘Failed to send message - connection issue’);
}

// Store in message history (unencrypted for our own reference)
messageHistory.push(messageData);

// Limit history size
if (messageHistory.length > 100) {
messageHistory = messageHistory.slice(-100);
}
}

function insertMessageToDOM(messageData, isFromMe = false, senderId = null) {
const template = document.querySelector(‘template[data-template=“message”]’);
if (!template) {
console.error(‘Message template not found in HTML’);
return;
}

const nameEl = template.content.querySelector(’.message__name’);
const bubbleEl = template.content.querySelector(’.message__bubble’);

if (nameEl) {
nameEl.textContent = `${messageData.emoji || ''} ${messageData.name || 'Anonymous'}`.trim();

```
// Add color for different users
if (senderId && !isFromMe) {
  nameEl.style.color = getUserColor(senderId);
}
```

}

if (bubbleEl) {
bubbleEl.textContent = messageData.content || ‘’;

```
// Add encryption indicator for encrypted messages
if (encryptionPassword && !isFromMe && messageData.content.includes('[🔒 Decryption failed')) {
  bubbleEl.style.backgroundColor = '#ffebee';
  bubbleEl.style.color = '#c62828';
} else if (encryptionPassword) {
  // Add subtle encryption indicator
  const lockIcon = document.createElement('span');
  lockIcon.textContent = '🔒';
  lockIcon.style.cssText = `
    font-size: 0.7em;
    opacity: 0.5;
    margin-left: 5px;
  `;
  bubbleEl.appendChild(lockIcon);
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
```

}

const clone = document.importNode(template.content, true);
const messageEl = clone.querySelector(’.message’);

if (messageEl) {
messageEl.classList.add(isFromMe ? ‘message–mine’ : ‘message–theirs’);

```
// Add sender color border for others' messages
if (!isFromMe && senderId) {
  messageEl.style.borderLeft = `3px solid ${getUserColor(senderId)}`;
}
```

}

const messagesEl = document.querySelector(’.messages’);
if (messagesEl) {
messagesEl.appendChild(clone);
scrollToBottom();
}
}

// Typing indicator (optional feature)
let typingTimeout;
function showTypingIndicator(userName, userEmoji) {
const messagesEl = document.querySelector(’.messages’);
if (!messagesEl) return;

// Remove existing typing indicator
const existingIndicator = messagesEl.querySelector(’.typing-indicator’);
if (existingIndicator) {
existingIndicator.remove();
}

const typingEl = document.createElement(‘div’);
typingEl.className = ‘typing-indicator’;
typingEl.innerHTML = `<span style="opacity: 0.7; font-style: italic;"> ${userEmoji} ${userName} is typing... </span>`;
typingEl.style.cssText = `padding: 8px 16px; margin: 5px 0; background: rgba(0,0,0,0.05); border-radius: 12px; font-size: 0.9em;`;

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
const form = document.querySelector(‘form’);
const input = document.querySelector(‘input[type=“text”]’);

if (!form || !input) {
console.error(‘Form or input not found in HTML’);
return;
}

console.log(‘Setting up form handler for unlimited users chat’);

form.addEventListener(‘submit’, (e) => {
e.preventDefault();

```
const value = input.value.trim();
console.log('Form submitted with value:', value);

if (!value) {
  console.log('Empty message, not sending');
  return;
}

input.value = '';
sendChatMessage(value);
```

});

// Enhanced keyboard handling with typing indicator
let isTyping = false;
input.addEventListener(‘input’, () => {
if (!isTyping && input.value.trim()) {
isTyping = true;
broadcastMessage({
type: ‘user_typing’,
name: name,
emoji: emoji
});
}

```
// Reset typing indicator
clearTimeout(typingTimeout);
typingTimeout = setTimeout(() => {
  isTyping = false;
}, 2000);
```

});

input.addEventListener(‘keydown’, (e) => {
if (e.key === ‘Enter’ && !e.shiftKey) {
e.preventDefault();
clearTimeout(typingTimeout);
isTyping = false;
form.dispatchEvent(new Event(‘submit’));
}
});

// Focus input for better UX
input.focus();
}

// Initialize when DOM is ready
function init() {
console.log(‘Initializing unlimited users chat application’);
console.log(‘User:’, emoji, name);
console.log(‘Chat room:’, chatHash);
console.log(‘Encryption:’, encryptionPassword ? ‘Enabled’ : ‘Disabled’);

setupFormHandler();
insertSystemMessage(`Welcome to the chat room! 🎊`);
insertSystemMessage(`You are: ${emoji} ${name}`);
insertSystemMessage(`Room: ${chatHash}`);

if (encryptionPassword) {
insertSystemMessage(‘🔐 Messages are encrypted end-to-end’);
insertSystemMessage(‘💡 Share the same password with others to decrypt messages’);
} else {
insertSystemMessage(‘⚠️ Messages are not encrypted’);
}

// Show connection status
showStatus(‘Connecting…’);

// Global error handlers
window.addEventListener(‘error’, (event) => {
console.error(‘Global error:’, event.error);
handleError(‘Unexpected error occurred’, event.error);
});

window.addEventListener(‘unhandledrejection’, (event) => {
console.error(‘Unhandled promise rejection:’, event.reason);
handleError(‘Promise rejection’, event.reason);
});

// Handle page visibility changes
document.addEventListener(‘visibilitychange’, () => {
if (!document.hidden && !isConnected) {
insertSystemMessage(‘Attempting to reconnect…’);
// Note: Scaledrone should auto-reconnect, but we can show status
}
});

// Cleanup on page unload
window.addEventListener(‘beforeunload’, () => {
if (isConnected) {
broadcastMessage({
type: ‘user_left’,
name: name,
emoji: emoji
});
}
if (drone) {
drone.close();
}
});

// Add some helpful commands
insertSystemMessage(‘💡 Tip: Share this code with others to invite them to chat!’);
if (encryptionPassword) {
insertSystemMessage(‘🔑 Remember to share the encryption password with trusted users’);
}
}

// Start the application
if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, init);
} else {
init();
}