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

const emoji = randomEmoji();
let name = prompt("What's your name?") || "Anonymous";

while (!name || name.trim() === '') {
  name = prompt("Please enter a valid name:") || "Anonymous";
}
name = name.trim();

const GLOBAL_CHAT_ROOM = 'global-chat-room';
let joinCode = prompt('Enter join code (leave blank for global chat):');
location.hash = joinCode || GLOBAL_CHAT_ROOM;
const chatHash = location.hash.substring(1) || GLOBAL_CHAT_ROOM;

const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
const roomName = 'observable-' + chatHash;

let room;
let isConnected = false;
let messageHistory = [];
let connectedUsers = new Map();
let userColors = {};
const userColorPalette = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85929E', '#A569BD'
];
let colorIndex = 0;

function handleError(message, error) {
  console.error(message, error);
  insertSystemMessage(`Error: ${message}`);
  showStatus(`Error: ${message}`);
}

function showStatus(message) {
  const statusEl = document.querySelector('.status');
  if (statusEl) statusEl.textContent = message;
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
  const existingCount = messagesEl.querySelector('.user-count-message');
  if (existingCount) existingCount.remove();
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
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight;
}

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
    isConnected = true;
    showStatus('Connected - Ready to chat!');
    insertSystemMessage('Connected to chat room! 🎉');
  });

  room.on('members', members => {
    connectedUsers.clear();
    members.forEach(member => {
      connectedUsers.set(member.id, {
        id: member.id,
        clientData: member.clientData || {}
      });
    });
    insertUserCountMessage(members.length);
    showStatus(`Connected (${members.length} users online)`);
    if (members.length === 1) insertSystemMessage('You are the first person in this chat room!');
  });

  room.on('member_join', member => {
    connectedUsers.set(member.id, {
      id: member.id,
      clientData: member.clientData || {}
    });
    insertUserCountMessage(connectedUsers.size);
    insertSystemMessage(`Someone joined the chat 👋`);
    showStatus(`Connected (${connectedUsers.size} users online)`);
  });

  room.on('member_leave', member => {
    connectedUsers.delete(member.id);
    insertUserCountMessage(connectedUsers.size);
    insertSystemMessage(`Someone left the chat 👋`);
    showStatus(`Connected (${connectedUsers.size} users online)`);
  });

  room.on('data', (data, client) => {
    if (client.id === drone.clientId) return;
    if (data.type === 'chat_message') {
      insertMessageToDOM(data.message, false, client.id);
    } else if (data.type === 'user_joined') {
      insertSystemMessage(`${data.emoji} ${data.name} joined the chat`);
    } else if (data.type === 'user_typing') {
      showTypingIndicator(data.name, data.emoji);
    }
  });

  broadcastMessage({
    type: 'user_joined',
    name: name,
    emoji: emoji,
    timestamp: Date.now()
  });
});

drone.on('error', error => handleError('Chat server error', error));
drone.on('close', () => {
  isConnected = false;
  showStatus('Disconnected');
  insertSystemMessage('Connection lost. Refresh to reconnect.');
});

function broadcastMessage(messageData) {
  if (!isConnected || !room) {
    console.error('Cannot send message - not connected');
    return false;
  }
  try {
    drone.publish({ room: roomName, message: messageData });
    return true;
  } catch (error) {
    handleError('Failed to send message', error);
    return false;
  }
}

function sendChatMessage(content) {
  if (!content || content.trim() === '') return;
  const messageData = {
    name, content: content.trim(), emoji,
    timestamp: Date.now(), id: Math.random().toString(36).substr(2, 9)
  };
  insertMessageToDOM(messageData, true, drone.clientId);
  const success = broadcastMessage({ type: 'chat_message', message: messageData });
  if (!success) insertSystemMessage('Failed to send message - connection issue');
  messageHistory.push(messageData);
  if (messageHistory.length > 100) messageHistory = messageHistory.slice(-100);
}

function insertMessageToDOM(messageData, isFromMe = false, senderId = null) {
  const template = document.querySelector('template[data-template="message"]');
  if (!template) return;
  const nameEl = template.content.querySelector('.message__name');
  const bubbleEl = template.content.querySelector('.message__bubble');

  if (nameEl) {
    nameEl.textContent = `${messageData.emoji || ''} ${messageData.name || 'Anonymous'}`.trim();
    if (senderId && !isFromMe) nameEl.style.color = getUserColor(senderId);
  }

  if (bubbleEl) {
    bubbleEl.textContent = messageData.content || '';

    if (messageData.timestamp) {
      const timeEl = document.createElement('small');
      timeEl.textContent = new Date(messageData.timestamp).toLocaleTimeString();
      timeEl.style.cssText = `display: block; opacity: 0.6; font-size: 0.75em; margin-top: 4px;`;
      bubbleEl.appendChild(timeEl);
    }

    if (messageData.media && messageData.media.data) {
      let mediaElement;
      const type = messageData.media.type;
      if (type.startsWith('image/')) {
        mediaElement = document.createElement('img');
        mediaElement.src = messageData.media.data;
        mediaElement.style.maxWidth = '200px';
        mediaElement.style.borderRadius = '8px';
      } else if (type.startsWith('video/')) {
        mediaElement = document.createElement('video');
        mediaElement.src = messageData.media.data;
        mediaElement.controls = true;
        mediaElement.style.maxWidth = '250px';
        mediaElement.style.borderRadius = '8px';
      } else if (type.startsWith('audio/')) {
        mediaElement = document.createElement('audio');
        mediaElement.src = messageData.media.data;
        mediaElement.controls = true;
      }
      if (mediaElement) {
        mediaElement.style.marginTop = '8px';
        bubbleEl.appendChild(mediaElement);
      }
    }
  }

  const clone = document.importNode(template.content, true);
  const messageEl = clone.querySelector('.message');
  if (messageEl) {
    messageEl.classList.add(isFromMe ? 'message--mine' : 'message--theirs');
    if (!isFromMe && senderId) messageEl.style.borderLeft = `3px solid ${getUserColor(senderId)}`;
  }

  const messagesEl = document.querySelector('.messages');
  if (messagesEl) {
    messagesEl.appendChild(clone);
    scrollToBottom();
  }
}

let typingTimeout;
function showTypingIndicator(userName, userEmoji) {
  const messagesEl = document.querySelector('.messages');
  if (!messagesEl) return;
  const existing = messagesEl.querySelector('.typing-indicator');
  if (existing) existing.remove();
  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = `<span style="opacity: 0.7; font-style: italic;">${userEmoji} ${userName} is typing...</span>`;
  typingEl.style.cssText = `padding: 8px 16px; margin: 5px 0; background: rgba(0,0,0,0.05); border-radius: 12px; font-size: 0.9em;`;
  messagesEl.appendChild(typingEl);
  scrollToBottom();
  setTimeout(() => typingEl.remove(), 3000);
}

function setupFormHandler() {
  const form = document.querySelector('form');
  const input = document.querySelector('input[type="text"]');
  const mediaInput = document.getElementById('mediaInput');

  if (!form || !input || !mediaInput) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    sendChatMessage(value);
  });

  mediaInput.addEventListener('change', () => {
    const file = mediaInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const mediaMessage = {
        name, emoji,
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9),
        media: {
          type: file.type,
          data: reader.result
        }
      };

      insertMessageToDOM(mediaMessage, true, drone.clientId);
      const success = broadcastMessage({ type: 'chat_message', message: mediaMessage });
      if (!success) insertSystemMessage('Failed to send media - connection issue');
      messageHistory.push(mediaMessage);
      if (messageHistory.length > 100) messageHistory = messageHistory.slice(-100);
    };
    reader.readAsDataURL(file);
  });

  let isTyping = false;
  input.addEventListener('input', () => {
    if (!isTyping && input.value.trim()) {
      isTyping = true;
      broadcastMessage({ type: 'user_typing', name, emoji });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { isTyping = false; }, 2000);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      clearTimeout(typingTimeout);
      isTyping = false;
      form.dispatchEvent(new Event('submit'));
    }
  });

  input.focus();
}

function init() {
  setupFormHandler();
  insertSystemMessage(`Welcome to the chat room! 🎊`);
  insertSystemMessage(`You are: ${emoji} ${name}`);
  insertSystemMessage(`Room: ${chatHash}`);
  showStatus('Connecting...');

  window.addEventListener('error', (event) => handleError('Unexpected error', event.error));
  window.addEventListener('unhandledrejection', (event) => handleError('Promise rejection', event.reason));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isConnected) insertSystemMessage('Attempting to reconnect...');
  });
  window.addEventListener('beforeunload', () => {
    if (isConnected) {
      broadcastMessage({ type: 'user_left', name, emoji });
    }
    if (drone) drone.close();
  });

  insertSystemMessage('💡 Tip: Share this URL with others to invite them to chat!');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
