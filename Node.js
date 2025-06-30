// WebSocket Signaling Server
// Save as: server.js
// Run with: node server.js

const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// Configuration
const PORT = process.env.PORT || 3000;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MAX_ROOM_SIZE = 100; // Maximum users per room
const MAX_MESSAGE_LENGTH = 1000; // Maximum message length

// Storage for rooms and clients
const rooms = new Map();
const clients = new Map();

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    // Basic verification - you can add more security here
    return true;
  }
});

// Utility functions
function generateClientId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function sanitizeMessage(message) {
  if (typeof message !== 'string') return '';
  return message.slice(0, MAX_MESSAGE_LENGTH).trim();
}

function isValidRoomName(roomName) {
  return typeof roomName === 'string' && 
         roomName.length > 0 && 
         roomName.length <= 50 && 
         /^[a-zA-Z0-9-_]+$/.test(roomName);
}

function getRoomInfo(roomName) {
  const room = rooms.get(roomName);
  if (!room) return null;
  
  return {
    name: roomName,
    memberCount: room.members.size,
    members: Array.from(room.members.values()).map(client => ({
      id: client.id,
      clientData: client.clientData || {}
    }))
  };
}

function broadcastToRoom(roomName, message, excludeClientId = null) {
  const room = rooms.get(roomName);
  if (!room) return;
  
  const messageStr = JSON.stringify(message);
  
  room.members.forEach(client => {
    if (client.id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(messageStr);
      } catch (error) {
        console.error(`Failed to send message to client ${client.id}:`, error);
        removeClientFromRoom(client.id, roomName);
      }
    }
  });
}

function addClientToRoom(client, roomName) {
  if (!isValidRoomName(roomName)) {
    return false;
  }
  
  // Create room if it doesn't exist
  if (!rooms.has(roomName)) {
    rooms.set(roomName, {
      name: roomName,
      members: new Map(),
      createdAt: Date.now()
    });
  }
  
  const room = rooms.get(roomName);
  
  // Check room size limit
  if (room.members.size >= MAX_ROOM_SIZE) {
    return false;
  }
  
  // Add client to room
  room.members.set(client.id, client);
  client.currentRoom = roomName;
  
  console.log(`Client ${client.id} joined room ${roomName} (${room.members.size} members)`);
  
  // Notify client about successful join
  client.ws.send(JSON.stringify({
    type: 'room_joined',
    room: roomName,
    clientId: client.id,
    members: Array.from(room.members.values()).map(c => ({
      id: c.id,
      clientData: c.clientData || {}
    }))
  }));
  
  // Notify other room members
  broadcastToRoom(roomName, {
    type: 'member_joined',
    member: {
      id: client.id,
      clientData: client.clientData || {}
    }
  }, client.id);
  
  return true;
}

function removeClientFromRoom(clientId, roomName) {
  const room = rooms.get(roomName);
  if (!room) return;
  
  const client = room.members.get(clientId);
  if (!client) return;
  
  room.members.delete(clientId);
  
  console.log(`Client ${clientId} left room ${roomName} (${room.members.size} members)`);
  
  // Notify remaining room members
  broadcastToRoom(roomName, {
    type: 'member_left',
    member: {
      id: clientId,
      clientData: client.clientData || {}
    }
  });
  
  // Clean up empty rooms
  if (room.members.size === 0) {
    rooms.delete(roomName);
    console.log(`Room ${roomName} deleted (empty)`);
  }
}

function handleClientDisconnect(clientId) {
  const client = clients.get(clientId);
  if (!client) return;
  
  // Remove from current room
  if (client.currentRoom) {
    removeClientFromRoom(clientId, client.currentRoom);
  }
  
  // Remove from clients map
  clients.delete(clientId);
  
  console.log(`Client ${clientId} disconnected`);
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientId = generateClientId();
  const clientIp = req.connection.remoteAddress;
  
  console.log(`New client connected: ${clientId} from ${clientIp}`);
  
  // Create client object
  const client = {
    id: clientId,
    ws: ws,
    ip: clientIp,
    connectedAt: Date.now(),
    currentRoom: null,
    clientData: {},
    isAlive: true
  };
  
  clients.set(clientId, client);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId: clientId,
    message: 'Connected to signaling server'
  }));
  
  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Rate limiting (simple implementation)
      const now = Date.now();
      if (!client.lastMessageTime) client.lastMessageTime = 0;
      if (now - client.lastMessageTime < 100) { // 100ms between messages
        return;
      }
      client.lastMessageTime = now;
      
      console.log(`Message from ${clientId}:`, message.type);
      
      switch (message.type) {
        case 'join_room':
          if (message.room) {
            const success = addClientToRoom(client, message.room);
            if (!success) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to join room (full or invalid name)'
              }));
            }
          }
          break;
          
        case 'leave_room':
          if (client.currentRoom) {
            removeClientFromRoom(clientId, client.currentRoom);
            client.currentRoom = null;
          }
          break;
          
        case 'publish':
          if (client.currentRoom && message.message) {
            // Sanitize message content
            if (message.message.content) {
              message.message.content = sanitizeMessage(message.message.content);
            }
            
            broadcastToRoom(client.currentRoom, {
              type: 'data',
              data: message.message,
              client: {
                id: clientId,
                clientData: client.clientData
              }
            }, clientId);
          }
          break;
          
        case 'update_client_data':
          if (message.clientData && typeof message.clientData === 'object') {
            client.clientData = { ...client.clientData, ...message.clientData };
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
      
    } catch (error) {
      console.error(`Error processing message from ${clientId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    handleClientDisconnect(clientId);
  });
  
  // Handle connection errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    handleClientDisconnect(clientId);
  });
  
  // Heartbeat mechanism
  ws.on('pong', () => {
    client.isAlive = true;
  });
});

// Heartbeat interval to detect dead connections
const heartbeatInterval = setInterval(() => {
  clients.forEach((client) => {
    if (!client.isAlive) {
      console.log(`Client ${client.id} failed heartbeat, terminating`);
      client.ws.terminate();
      handleClientDisconnect(client.id);
      return;
    }
    
    client.isAlive = false;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.ping();
    }
  });
}, HEARTBEAT_INTERVAL);

// Cleanup interval for old rooms
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  rooms.forEach((room, roomName) => {
    if (room.members.size === 0 && (now - room.createdAt) > maxAge) {
      rooms.delete(roomName);
      console.log(`Cleaned up old empty room: ${roomName}`);
    }
  });
}, 60 * 60 * 1000); // Run every hour

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  clearInterval(heartbeatInterval);
  clearInterval(cleanupInterval);
  
  // Close all client connections
  clients.forEach((client) => {
    client.ws.close(1001, 'Server shutting down');
  });
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`WebSocket signaling server running on port ${PORT}`);
  console.log(`Rooms: ${rooms.size}, Clients: ${clients.size}`);
});

// Optional: HTTP endpoint for server stats
server.on('request', (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      rooms: rooms.size,
      clients: clients.size,
      roomDetails: Array.from(rooms.entries()).map(([name, room]) => ({
        name,
        members: room.members.size,
        createdAt: room.createdAt
      }))
    }, null, 2));
  } else if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

module.exports = { server, wss };
