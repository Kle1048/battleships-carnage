const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // Add crypto for password hashing

// Initialize Express app
const app = express();

// Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Add Content Security Policy headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws: wss: http://localhost:3001 http://192.168.178.44:3001; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.socket.io; style-src 'self' 'unsafe-inline';"
  );
  next();
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Serve favicon
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '../favicon.ico'));
});

// Create a simple favicon if it doesn't exist
const faviconPath = path.join(__dirname, '../favicon.ico');
if (!fs.existsSync(faviconPath)) {
  console.log('Creating default favicon.ico');
  // We'll create a simple 16x16 transparent favicon
  const buffer = Buffer.from(
    'AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAABILAAASCwAAAAAAAAAAAAD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    'base64'
  );
  fs.writeFileSync(faviconPath, buffer);
}

// Add admin credentials (in a real app, these would be in a secure config file or environment variables)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
// Generate a random admin password if not provided in environment variables
const DEFAULT_ADMIN_PASSWORD = crypto.randomBytes(8).toString('hex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
console.log(`Admin credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);

// Add basic authentication middleware for admin routes
const basicAuth = (req, res, next) => {
  // Check for basic auth header
  if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
    return res.status(401).json({ message: 'Missing Authorization Header' });
  }

  // Verify auth credentials
  const base64Credentials = req.headers.authorization.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Attach user to request
    req.user = { username };
    return next();
  }

  // Return authentication error
  return res.status(401).json({ message: 'Invalid Authentication Credentials' });
};

// Store player data
const players = {};

// Store projectiles
const projectiles = {};

// Track device connections
const deviceConnections = {};

// Inactive player timeout (5 minutes)
const INACTIVE_TIMEOUT = 5 * 60 * 1000;

// World size constant
const WORLD_SIZE = 5000;

// Generate a unique device ID
function generateDeviceId() {
  return uuidv4();
}

// Get a random ship type
function getRandomShipType() {
  const types = ['destroyer', 'cruiser', 'battleship'];
  return types[Math.floor(Math.random() * types.length)];
}

// Clean up inactive players periodically
setInterval(() => {
  try {
    const now = Date.now();
    let cleanupCount = 0;
    
    Object.keys(players).forEach(playerId => {
      try {
        const player = players[playerId];
        if (!player) {
          console.warn(`Found invalid player entry for ID ${playerId}`);
          delete players[playerId];
          return;
        }
        
        // Check if player has been inactive for too long
        if (player.lastActivity && now - player.lastActivity > INACTIVE_TIMEOUT) {
          console.log(`Cleaning up inactive player ${playerId} (inactive for ${Math.floor((now - player.lastActivity) / 1000)} seconds)`);
          
          // Remove player from the game
          delete players[playerId];
          
          // MODIFIED: Remove device connection if it exists
          if (player.deviceId && deviceConnections[player.deviceId]) {
            // Make sure deviceConnections[player.deviceId] is an array
            if (Array.isArray(deviceConnections[player.deviceId])) {
              const index = deviceConnections[player.deviceId].indexOf(playerId);
              if (index !== -1) {
                deviceConnections[player.deviceId].splice(index, 1);
                
                // If no more connections for this device, remove the device entry
                if (deviceConnections[player.deviceId].length === 0) {
                  delete deviceConnections[player.deviceId];
                }
              }
            } else {
              // Handle legacy format (string instead of array)
              if (deviceConnections[player.deviceId] === playerId) {
                delete deviceConnections[player.deviceId];
              }
            }
          }
          
          // Notify other players
          io.emit('playerLeft', playerId);
          
          cleanupCount++;
        }
      } catch (playerError) {
        console.error(`Error cleaning up player ${playerId}:`, playerError);
        // Try to remove the problematic player entry
        delete players[playerId];
      }
    });
    
    if (cleanupCount > 0) {
      console.log(`Cleaned up ${cleanupCount} inactive players`);
    }
  } catch (error) {
    console.error('Error in cleanup interval:', error);
  }
}, 60000);

// Add a function to clean up orphaned connections
function cleanupOrphanedConnections() {
  console.log('Cleaning up orphaned connections...');
  
  // Get all active socket IDs
  const activeSocketIds = Array.from(io.sockets.sockets.keys());
  console.log(`Active sockets: ${activeSocketIds.length}`);
  
  // Check for players that don't have an active socket
  const orphanedPlayers = Object.keys(players).filter(id => !activeSocketIds.includes(id));
  console.log(`Found ${orphanedPlayers.length} orphaned players`);
  
  // Remove orphaned players
  orphanedPlayers.forEach(playerId => {
    console.log(`Removing orphaned player: ${playerId}`);
    
    // Get the device ID for this player
    const deviceId = players[playerId]?.deviceId;
    
    // Remove the player
    delete players[playerId];
    
    // Update device connections if needed
    if (deviceId && deviceConnections[deviceId]) {
      if (Array.isArray(deviceConnections[deviceId])) {
        // Remove this player from the device connections
        const index = deviceConnections[deviceId].indexOf(playerId);
        if (index !== -1) {
          deviceConnections[deviceId].splice(index, 1);
          console.log(`Removed orphaned connection ${playerId} from device ${deviceId}`);
          
          // If no more connections for this device, remove the device entry
          if (deviceConnections[deviceId].length === 0) {
            delete deviceConnections[deviceId];
            console.log(`Removed device ${deviceId} as it has no more connections`);
          }
        }
      } else if (deviceConnections[deviceId] === playerId) {
        // Legacy format - remove the device connection
        delete deviceConnections[deviceId];
        console.log(`Removed legacy device connection for ${deviceId}`);
      }
    }
  });
  
  // Check for device connections that reference non-existent players
  Object.entries(deviceConnections).forEach(([deviceId, connections]) => {
    if (Array.isArray(connections)) {
      // Filter out connections that don't exist in players
      const validConnections = connections.filter(id => players[id]);
      
      if (validConnections.length !== connections.length) {
        console.log(`Cleaning up device ${deviceId}: ${connections.length} connections -> ${validConnections.length} valid`);
        
        if (validConnections.length === 0) {
          // No valid connections left, remove the device
          delete deviceConnections[deviceId];
          console.log(`Removed device ${deviceId} as it has no valid connections`);
        } else {
          // Update with only valid connections
          deviceConnections[deviceId] = validConnections;
        }
      }
    } else if (typeof connections === 'string') {
      // Legacy format - check if the player exists
      if (!players[connections]) {
        console.log(`Removing legacy device connection for ${deviceId} (player ${connections} not found)`);
        delete deviceConnections[deviceId];
      }
    }
  });
  
  // Clean up "Reconnected Player" entries that have no device ID
  const reconnectedPlayers = Object.entries(players).filter(([id, player]) => 
    player.name === 'Reconnected Player' && !player.deviceId
  );
  
  if (reconnectedPlayers.length > 0) {
    console.log(`Found ${reconnectedPlayers.length} reconnected players without device IDs`);
    
    reconnectedPlayers.forEach(([id, player]) => {
      // Check if this is an active socket
      if (!activeSocketIds.includes(id)) {
        console.log(`Removing inactive reconnected player: ${id}`);
        delete players[id];
      } else {
        console.log(`Keeping active reconnected player: ${id}`);
      }
    });
  }
  
  console.log(`After cleanup: ${Object.keys(players).length} players, ${Object.keys(deviceConnections).length} devices`);
}

// Run cleanup on startup
cleanupOrphanedConnections();

// Run cleanup periodically (every 5 minutes)
setInterval(cleanupOrphanedConnections, 5 * 60 * 1000);

// Add a function for aggressive cleanup
function aggressiveCleanup() {
  console.log('Running aggressive cleanup...');
  
  // Get all active socket IDs
  const activeSocketIds = Array.from(io.sockets.sockets.keys());
  console.log(`Active sockets: ${activeSocketIds.length}`);
  
  // Check for player entries without corresponding active sockets
  const orphanedPlayers = Object.keys(players).filter(id => !activeSocketIds.includes(id));
  console.log(`Found ${orphanedPlayers.length} orphaned players to remove`);
  
  // Remove orphaned players
  orphanedPlayers.forEach(playerId => {
    delete players[playerId];
  });
  
  // Remove all "Reconnected Player" entries
  const reconnectedPlayers = Object.entries(players).filter(([id, player]) => 
    player.name === 'Reconnected Player'
  );
  
  console.log(`Found ${reconnectedPlayers.length} reconnected players to remove`);
  
  reconnectedPlayers.forEach(([id, player]) => {
    delete players[id];
  });
  
  // Look for devices with multiple players
  const devicePlayerCounts = {};
  Object.entries(players).forEach(([playerId, player]) => {
    if (player.deviceId) {
      if (!devicePlayerCounts[player.deviceId]) {
        devicePlayerCounts[player.deviceId] = [];
      }
      devicePlayerCounts[player.deviceId].push(playerId);
    }
  });
  
  // Log devices with multiple players
  Object.entries(devicePlayerCounts)
    .filter(([_, playerIds]) => playerIds.length > 1)
    .forEach(([deviceId, playerIds]) => {
      console.log(`Device ${deviceId} has ${playerIds.length} players: ${playerIds.join(', ')}`);
      
      // Only keep the most recent player (with latest socket ID, which usually sorts alphabetically later)
      const sortedPlayerIds = [...playerIds].sort();
      const playerToKeep = sortedPlayerIds[sortedPlayerIds.length - 1];
      
      // Remove all other players for this device
      sortedPlayerIds.slice(0, sortedPlayerIds.length - 1).forEach(playerId => {
        console.log(`Removing duplicate player ${playerId} (keeping ${playerToKeep})`);
        delete players[playerId];
      });
    });
  
  // Rebuild device connections from scratch
  console.log('Rebuilding device connections from scratch');
  
  // Clear all device connections
  Object.keys(deviceConnections).forEach(deviceId => {
    delete deviceConnections[deviceId];
  });
  
  // Rebuild device connections based on current players
  Object.entries(players).forEach(([playerId, player]) => {
    if (player.deviceId) {
      if (!deviceConnections[player.deviceId]) {
        deviceConnections[player.deviceId] = [];
      }
      
      if (!deviceConnections[player.deviceId].includes(playerId)) {
        deviceConnections[player.deviceId].push(playerId);
      }
    }
  });
  
  // Check for sockets without player entries
  activeSocketIds.forEach(socketId => {
    if (!players[socketId]) {
      console.log(`Socket ${socketId} exists but has no player entry`);
      
      // Get the socket object
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        // Check if it has a deviceId property
        const deviceId = socket.deviceId;
        if (deviceId) {
          console.log(`Socket ${socketId} has deviceId ${deviceId} but no player entry`);
          
          // Add to device connections if not already there
          if (!deviceConnections[deviceId]) {
            deviceConnections[deviceId] = [];
          }
          
          if (!deviceConnections[deviceId].includes(socketId)) {
            deviceConnections[deviceId].push(socketId);
          }
        }
      }
    }
  });
  
  console.log(`After aggressive cleanup: ${Object.keys(players).length} players, ${Object.keys(deviceConnections).length} devices`);
}

// Handle socket connections
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Flag to track if player has been created
  let playerCreated = false;
  
  // Check if device ID was provided in auth
  const authDeviceId = socket.handshake.auth?.deviceId;
  const authPlayerName = socket.handshake.auth?.playerName || 'Unknown Player';
  
  // When connecting, don't immediately create a player
  // Just log the connection and wait for explicit identification
  if (authDeviceId) {
    console.log(`Socket ${socket.id} provided device ID in auth: ${authDeviceId}`);
    socket.deviceId = authDeviceId; // Store it on the socket object for reference
  }
  
  // Handle device identification
  socket.on('identifyDevice', (data) => {
    // Skip if already identified via auth and player created
    if (playerCreated) {
      console.log(`Socket ${socket.id} already has a player created, skipping identification`);
      return;
    }
    
    let deviceId = data.deviceId || socket.deviceId;
    const playerName = data.playerName || 'Unknown Player';
    
    // If no device ID provided, generate a new one
    if (!deviceId) {
      deviceId = generateDeviceId();
      console.log(`Generated new device ID for socket ${socket.id}: ${deviceId}`);
      
      // Send the new device ID to the client
      socket.emit('deviceIdAssigned', { deviceId });
    } else {
      console.log(`Socket ${socket.id} identified with device ID: ${deviceId}`);
    }
    
    // Store the device ID on the socket object
    socket.deviceId = deviceId;
    
    // Register this device connection
    if (!deviceConnections[deviceId]) {
      deviceConnections[deviceId] = [];
    }
    
    // Add this connection to the device's connections list if not already there
    if (!deviceConnections[deviceId].includes(socket.id)) {
      deviceConnections[deviceId].push(socket.id);
      console.log(`Device ${deviceId} now has ${deviceConnections[deviceId].length} active connections`);
    }
    
    // Check if this device already has a player in the game
    const existingPlayer = Object.values(players).find(p => p.deviceId === deviceId);
    
    if (existingPlayer) {
      console.log(`Device ${deviceId} already has a player (${existingPlayer.id}), updating socket.id`);
      // Update the existing player's socket ID
      const oldSocketId = existingPlayer.id;
      delete players[oldSocketId];
      existingPlayer.id = socket.id;
      players[socket.id] = existingPlayer;
      playerCreated = true;
      
      // Send game state to the reconnected player
      socket.emit('gameState', {
        players,
        self: socket.id,
        projectiles: Object.values(projectiles)
      });
      
      // Notify other players about the reconnection
      socket.broadcast.emit('playerLeft', oldSocketId);
      socket.broadcast.emit('playerJoined', players[socket.id]);
    } else {
      // Create a new player if one doesn't exist for this device
      const spawnX = Math.floor(WORLD_SIZE * 0.1 + Math.random() * WORLD_SIZE * 0.8);
      const spawnY = Math.floor(WORLD_SIZE * 0.1 + Math.random() * WORLD_SIZE * 0.8);
      
      players[socket.id] = {
        id: socket.id,
        x: spawnX,
        y: spawnY,
        rotation: Math.random() * Math.PI * 2,
        type: getRandomShipType(),
        hull: 100,
        deviceId: deviceId,
        name: playerName,
        lastActivity: Date.now()
      };
      
      console.log(`Created new player ${socket.id} at position (${spawnX}, ${spawnY})`);
      
      // Mark player as created
      playerCreated = true;
      
      // Send game state to the new player
      socket.emit('gameState', {
        players,
        self: socket.id,
        projectiles: Object.values(projectiles)
      });
      
      // Notify other players about the new player
      socket.broadcast.emit('playerJoined', players[socket.id]);
    }
  });
  
  // Handle game state request
  socket.on('requestGameState', () => {
    console.log(`Socket ${socket.id} requested game state`);
    
    // Check if player exists
    if (!players[socket.id]) {
      // Player doesn't exist yet - require identification
      console.log(`Socket ${socket.id} requested game state but doesn't exist yet - waiting for identification`);
      
      // Send a special response to tell the client it needs to identify first
      socket.emit('identificationRequired', {
        message: 'Please identify your device before requesting game state'
      });
      return;
    } else {
      // Update last activity timestamp
      players[socket.id].lastActivity = Date.now();
    }
    
    // Send game state to the requesting player
    socket.emit('gameState', {
      players,
      self: socket.id,
      projectiles: Object.values(projectiles)
    });
    
    console.log(`Sent game state to player ${socket.id} with ${Object.keys(players).length} players`);
  });
  
  // Handle player movement
  socket.on('updatePosition', (data) => {
    if (!players[socket.id]) {
      console.warn(`Received position update from non-existent player ${socket.id}`);
      return;
    }

    // Update player position
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].rotation = data.rotation;
    players[socket.id].lastActivity = Date.now();
    
    // Broadcast the updated position to other players
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: data.x,
      y: data.y,
      rotation: data.rotation
    });
  });
  
  // Handle projectile firing
  socket.on('projectileFired', (data) => {
    if (!players[socket.id]) {
      console.warn(`Received projectile from non-existent player ${socket.id}`);
      return;
    }

    // Add the projectile to the game
    projectiles[data.id] = data;
    players[socket.id].lastActivity = Date.now();
    
    // Broadcast the projectile to other players
    socket.broadcast.emit('projectileFired', data);
    
    // Remove the projectile after a delay
    setTimeout(() => {
      delete projectiles[data.id];
    }, 5000);
  });
  
  // Handle ship damage
  socket.on('damageShip', (data) => {
    const { targetId, amount } = data;
    
    if (!players[socket.id] || !players[targetId]) {
      console.warn(`Invalid damage report: source=${socket.id}, target=${targetId}`);
      return;
    }

    // Update player hull
    players[targetId].hull -= amount;
    players[socket.id].lastActivity = Date.now();
    
    // Check if the ship is destroyed
    if (players[targetId].hull <= 0) {
      // Notify all players about the destruction
      io.emit('shipDestroyed', { id: targetId });
    } else {
      // Broadcast the damage to all players
      io.emit('shipDamaged', {
        id: targetId,
        hull: players[targetId].hull
      });
    }
  });
  
  // Handle heartbeat
  socket.on('heartbeat', () => {
    if (!players[socket.id]) {
      console.warn(`Received heartbeat from non-existent player ${socket.id}`);
      return;
    }

    players[socket.id].lastActivity = Date.now();
    console.log(`Heartbeat received from player ${socket.id}`);
  });
  
  // Handle respawn request
  socket.on('requestRespawn', () => {
    console.log(`Player ${socket.id} requested respawn`);
    
    // Create a new ship for the player at a random position
    const spawnX = Math.floor(WORLD_SIZE * 0.1 + Math.random() * WORLD_SIZE * 0.8);
    const spawnY = Math.floor(WORLD_SIZE * 0.1 + Math.random() * WORLD_SIZE * 0.8);
    
    players[socket.id] = {
      id: socket.id,
      x: spawnX,
      y: spawnY,
      rotation: Math.random() * Math.PI * 2,
      type: getRandomShipType(),
      hull: 100,
      deviceId: players[socket.id]?.deviceId || null,
      name: players[socket.id]?.name || 'Unknown Player',
      lastActivity: Date.now()
    };
    
    console.log(`Respawned player ${socket.id} at position (${spawnX}, ${spawnY})`);
    
    // Send the updated player data back
    socket.emit('respawnAccepted', players[socket.id]);
    
    // Notify other players about the respawn
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Check if this socket had a player
    if (players[socket.id]) {
      console.log(`Player ${socket.id} disconnected`);
      
      // Remove the player's device connection
      if (players[socket.id].deviceId) {
        const deviceId = players[socket.id].deviceId;
        
        console.log(`Removing player ${socket.id} from device ${deviceId}`);
        
        // Remove this connection from the device's connections list
        if (deviceConnections[deviceId]) {
          const index = deviceConnections[deviceId].indexOf(socket.id);
          if (index !== -1) {
            deviceConnections[deviceId].splice(index, 1);
            console.log(`Removed connection ${socket.id} from device ${deviceId}. Remaining connections: ${deviceConnections[deviceId].length}`);
          }
          
          // If no more connections for this device, remove the device entry
          if (deviceConnections[deviceId].length === 0) {
            delete deviceConnections[deviceId];
            console.log(`Removed device ${deviceId} as it has no more connections`);
          }
        }
      }
      
      // Remove the player from the game
      delete players[socket.id];
      
      // Notify other players
      io.emit('playerLeft', socket.id);
    } else {
      console.log(`Socket ${socket.id} disconnected but had no player entry`);
      
      // Check if the socket had a device ID stored on it
      if (socket.deviceId) {
        console.log(`Socket ${socket.id} had device ID: ${socket.deviceId}`);
        
        // Remove this socket from device connections
        if (deviceConnections[socket.deviceId]) {
          const index = deviceConnections[socket.deviceId].indexOf(socket.id);
          if (index !== -1) {
            deviceConnections[socket.deviceId].splice(index, 1);
            console.log(`Removed socket ${socket.id} from device ${socket.deviceId}. Remaining connections: ${deviceConnections[socket.deviceId].length}`);
          }
          
          // If no more connections for this device, remove the device entry
          if (deviceConnections[socket.deviceId].length === 0) {
            delete deviceConnections[socket.deviceId];
            console.log(`Removed device ${socket.deviceId} as it has no more connections`);
          }
        }
      }
    }
  });

  // Handle admin kick request
  socket.on('adminKickPlayer', (data) => {
    // Check if the request is from an admin socket
    if (socket.isAdmin) {
      const playerId = data.playerId;
      
      if (players[playerId]) {
        console.log(`Admin ${socket.id} kicked player ${playerId}`);
        
        // Get the socket for the player to kick
        const playerSocket = io.sockets.sockets.get(playerId);
        
        if (playerSocket) {
          // Notify the player they're being kicked
          playerSocket.emit('forceDisconnect', { 
            reason: 'You have been kicked by an administrator' 
          });
          
          // Disconnect the player
          playerSocket.disconnect(true);
        }
        
        // Remove the player from the game
        delete players[playerId];
        
        // Remove device connection if it exists
        if (players[playerId] && players[playerId].deviceId) {
          delete deviceConnections[players[playerId].deviceId];
        }
        
        // Notify other players
        io.emit('playerLeft', playerId);
        
        // Confirm to admin
        socket.emit('adminActionResult', { 
          success: true, 
          action: 'kickPlayer', 
          playerId: playerId,
          message: `Player ${playerId} has been kicked`
        });
      } else {
        socket.emit('adminActionResult', { 
          success: false, 
          action: 'kickPlayer', 
          playerId: playerId,
          message: `Player ${playerId} not found`
        });
      }
    } else {
      console.warn(`Unauthorized admin action attempt from ${socket.id}`);
      socket.emit('adminActionResult', { 
        success: false, 
        message: 'Unauthorized' 
      });
    }
  });
  
  // Handle admin kick all request
  socket.on('adminKickAll', () => {
    // Check if the request is from an admin socket
    if (socket.isAdmin) {
      console.log(`Admin ${socket.id} kicked all players`);
      
      let kickCount = 0;
      
      // Get all player IDs except the admin
      const playerIds = Object.keys(players).filter(id => id !== socket.id);
      
      // Kick each player
      playerIds.forEach(playerId => {
        const playerSocket = io.sockets.sockets.get(playerId);
        
        if (playerSocket) {
          // Notify the player they're being kicked
          playerSocket.emit('forceDisconnect', { 
            reason: 'You have been kicked by an administrator' 
          });
          
          // Disconnect the player
          playerSocket.disconnect(true);
          kickCount++;
        }
        
        // Remove the player from the game
        delete players[playerId];
      });
      
      // Clear device connections (except admin's device)
      const adminDeviceId = players[socket.id]?.deviceId;
      
      Object.keys(deviceConnections).forEach(deviceId => {
        if (deviceId !== adminDeviceId) {
          // Remove all connections for this device
          delete deviceConnections[deviceId];
        } else {
          // For admin's device, keep only the admin connection
          deviceConnections[deviceId] = deviceConnections[deviceId].filter(id => id === socket.id);
        }
      });
      
      // Confirm to admin
      socket.emit('adminActionResult', { 
        success: true, 
        action: 'kickAll', 
        count: kickCount,
        message: `Kicked ${kickCount} players`
      });
    } else {
      console.warn(`Unauthorized admin action attempt from ${socket.id}`);
      socket.emit('adminActionResult', { 
        success: false, 
        message: 'Unauthorized' 
      });
    }
  });
  
  // Handle admin reset server request
  socket.on('adminResetServer', () => {
    // Check if the request is from an admin socket
    if (socket.isAdmin) {
      console.log(`Admin ${socket.id} reset the server`);
      
      // Kick all players (except admin)
      const playerIds = Object.keys(players).filter(id => id !== socket.id);
      
      playerIds.forEach(playerId => {
        const playerSocket = io.sockets.sockets.get(playerId);
        
        if (playerSocket) {
          // Notify the player about the server reset
          playerSocket.emit('forceDisconnect', { 
            reason: 'Server has been reset by an administrator' 
          });
          
          // Disconnect the player
          playerSocket.disconnect(true);
        }
      });
      
      // Clear all game state
      Object.keys(players).forEach(playerId => {
        if (playerId !== socket.id) {
          delete players[playerId];
        }
      });
      
      // Clear all projectiles
      Object.keys(projectiles).forEach(id => {
        delete projectiles[id];
      });
      
      // Clear device connections (except admin's device)
      const adminDeviceId = players[socket.id]?.deviceId;
      
      Object.keys(deviceConnections).forEach(deviceId => {
        if (deviceId !== adminDeviceId) {
          // Remove all connections for this device
          delete deviceConnections[deviceId];
        } else {
          // For admin's device, keep only the admin connection
          deviceConnections[deviceId] = deviceConnections[deviceId].filter(id => id === socket.id);
        }
      });
      
      // Confirm to admin
      socket.emit('adminActionResult', { 
        success: true, 
        action: 'resetServer',
        message: 'Server has been reset'
      });
    } else {
      console.warn(`Unauthorized admin action attempt from ${socket.id}`);
      socket.emit('adminActionResult', { 
        success: false, 
        message: 'Unauthorized' 
      });
    }
  });
  
  // Handle admin force cleanup request
  socket.on('adminForceCleanup', () => {
    // Check if the request is from an admin socket
    if (socket.isAdmin) {
      console.log(`Admin ${socket.id} requested forced cleanup`);
      
      // Run the cleanup function
      cleanupOrphanedConnections();
      
      // Confirm to admin
      socket.emit('adminActionResult', { 
        success: true, 
        action: 'forceCleanup',
        message: 'Forced cleanup completed'
      });
    } else {
      console.warn(`Unauthorized admin action attempt from ${socket.id}`);
      socket.emit('adminActionResult', { 
        success: false, 
        message: 'Unauthorized' 
      });
    }
  });
  
  // Handle admin aggressive cleanup request
  socket.on('adminAggressiveCleanup', () => {
    // Check if the request is from an admin socket
    if (socket.isAdmin) {
      console.log(`Admin ${socket.id} requested aggressive cleanup`);
      
      // Run the aggressive cleanup function
      aggressiveCleanup();
      
      // Confirm to admin
      socket.emit('adminActionResult', { 
        success: true, 
        action: 'aggressiveCleanup',
        message: 'Aggressive cleanup completed'
      });
    } else {
      console.warn(`Unauthorized admin action attempt from ${socket.id}`);
      socket.emit('adminActionResult', { 
        success: false, 
        message: 'Unauthorized' 
      });
    }
  });
  
  // Handle admin authentication
  socket.on('adminLogin', (data) => {
    if (data.username === ADMIN_USERNAME && data.password === ADMIN_PASSWORD) {
      console.log(`Admin authenticated: ${socket.id}`);
      
      // Mark this socket as an admin
      socket.isAdmin = true;
      
      // Confirm successful login
      socket.emit('adminLoginResult', { 
        success: true, 
        message: 'Authentication successful'
      });
    } else {
      console.warn(`Failed admin login attempt from ${socket.id}`);
      
      // Notify about failed login
      socket.emit('adminLoginResult', { 
        success: false, 
        message: 'Invalid credentials'
      });
    }
  });
  
  // Handle device connections info request
  socket.on('getDeviceConnections', () => {
    // Only respond if this is an admin socket
    if (socket.isAdmin) {
      // Count unique devices
      const uniqueDevices = Object.keys(deviceConnections).length;
      
      // Count total connections across all devices
      const totalConnections = Object.values(deviceConnections)
        .reduce((sum, connections) => sum + connections.length, 0);
      
      // Send the info back to the admin
      socket.emit('deviceConnectionsInfo', {
        uniqueDevices,
        totalConnections,
        deviceConnections
      });
    }
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Serve the test.html file
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/network_test.html'));
});

// Serve a simple status page
app.get('/', (req, res) => {
  // Count unique devices
  const uniqueDevices = Object.keys(deviceConnections).length;
  
  // Count total connections across all devices
  const totalConnections = Object.values(deviceConnections)
    .reduce((sum, connections) => sum + connections.length, 0);
  
  res.send(`
    <html>
      <head>
        <title>Battleships MMO Server</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          h1 { color: #0077be; }
          .status { padding: 20px; background-color: #f0f8ff; border-left: 5px solid #0077be; }
          .players { margin-top: 20px; }
          .test-link { display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #0077be; color: white; text-decoration: none; border-radius: 4px; }
          .admin-link { display: inline-block; margin-top: 20px; margin-left: 10px; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 4px; }
          .devices { margin-top: 20px; }
          .links { margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Battleships MMO Server</h1>
        <div class="status">
          <p>Server is running on port ${PORT}</p>
          <p>Connected players: ${Object.keys(players).length}</p>
          <p>Unique devices: ${uniqueDevices}</p>
          <p>Total connections: ${totalConnections}</p>
        </div>
        <div class="players">
          <h2>Active Players</h2>
          <pre>${JSON.stringify(players, null, 2)}</pre>
        </div>
        <div class="devices">
          <h2>Device Connections</h2>
          <pre>${JSON.stringify(deviceConnections, null, 2)}</pre>
        </div>
        <div class="links">
          <a href="/test" class="test-link">Open Connection Test Page</a>
          <a href="/admin" class="admin-link">Admin Panel</a>
        </div>
      </body>
    </html>
  `);
});

// Serve the admin page with authentication
app.get('/admin', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Battleships MMO Admin</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          h1 { color: #0077be; }
          .container { max-width: 1200px; margin: 0 auto; }
          .login-form { 
            max-width: 400px; 
            margin: 0 auto; 
            padding: 20px; 
            background-color: #f0f8ff; 
            border-left: 5px solid #0077be;
          }
          .admin-panel { display: none; }
          .player-list { 
            margin-top: 20px; 
            border: 1px solid #ddd; 
            border-radius: 4px; 
            overflow: hidden;
          }
          .player-item { 
            padding: 10px; 
            border-bottom: 1px solid #ddd; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
          }
          .player-item:last-child { border-bottom: none; }
          .player-info { flex: 1; }
          .player-actions { display: flex; gap: 10px; }
          .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          }
          .btn-primary { background-color: #0077be; color: white; }
          .btn-danger { background-color: #dc3545; color: white; }
          .btn-warning { background-color: #ffc107; color: #212529; }
          .btn-info { background-color: #17a2b8; color: white; }
          .server-actions { 
            margin-top: 20px; 
            display: flex; 
            gap: 10px; 
            justify-content: flex-end;
          }
          .status-bar {
            margin-top: 20px;
            padding: 10px;
            background-color: #f8f9fa;
            border-radius: 4px;
          }
          .alert {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
          }
          .alert-success { background-color: #d4edda; color: #155724; }
          .alert-danger { background-color: #f8d7da; color: #721c24; }
          .alert-warning { background-color: #fff3cd; color: #856404; }
          .hidden { display: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Battleships MMO Admin Panel</h1>
          
          <div id="login-form" class="login-form">
            <h2>Login</h2>
            <div>
              <label for="username">Username:</label>
              <input type="text" id="username" name="username" style="width: 100%; margin-bottom: 10px; padding: 8px;">
            </div>
            <div>
              <label for="password">Password:</label>
              <input type="password" id="password" name="password" style="width: 100%; margin-bottom: 20px; padding: 8px;">
            </div>
            <button id="login-btn" class="btn btn-primary" style="width: 100%;">Login</button>
            <div id="login-error" class="alert alert-danger hidden" style="margin-top: 10px;"></div>
          </div>
          
          <div id="admin-panel" class="admin-panel">
            <div class="status-bar">
              <strong>Server Status:</strong> <span id="server-status">Running</span> | 
              <strong>Players:</strong> <span id="player-count">0</span> | 
              <strong>Devices:</strong> <span id="device-count">0</span> |
              <strong>Connections:</strong> <span id="connection-count">0</span>
            </div>
            
            <div id="alert-container"></div>
            
            <h2>Player Management</h2>
            <div id="player-list" class="player-list">
              <div class="player-item" style="background-color: #f8f9fa;">
                <div class="player-info">
                  <strong>No players connected</strong>
                </div>
              </div>
            </div>
            
            <div class="server-actions">
              <button id="refresh-btn" class="btn btn-primary">Refresh</button>
              <button id="cleanup-btn" class="btn btn-info">Force Cleanup</button>
              <button id="aggressive-cleanup-btn" class="btn btn-warning">Aggressive Cleanup</button>
              <button id="kick-all-btn" class="btn btn-danger">Kick All Players</button>
              <button id="reset-btn" class="btn btn-warning">Reset Server</button>
            </div>
          </div>
        </div>
        
        <script src="/socket.io/socket.io.js"></script>
        <script>
          // Connect to Socket.IO server
          const socket = io();
          let isAdmin = false;
          
          // DOM elements
          const loginForm = document.getElementById('login-form');
          const adminPanel = document.getElementById('admin-panel');
          const loginBtn = document.getElementById('login-btn');
          const loginError = document.getElementById('login-error');
          const usernameInput = document.getElementById('username');
          const passwordInput = document.getElementById('password');
          const playerList = document.getElementById('player-list');
          const playerCount = document.getElementById('player-count');
          const deviceCount = document.getElementById('device-count');
          const connectionCount = document.getElementById('connection-count');
          const refreshBtn = document.getElementById('refresh-btn');
          const cleanupBtn = document.getElementById('cleanup-btn');
          const aggressiveCleanupBtn = document.getElementById('aggressive-cleanup-btn');
          const kickAllBtn = document.getElementById('kick-all-btn');
          const resetBtn = document.getElementById('reset-btn');
          const alertContainer = document.getElementById('alert-container');
          
          // Handle login
          loginBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();
            
            if (!username || !password) {
              showLoginError('Please enter both username and password');
              return;
            }
            
            // Send login request to server
            socket.emit('adminLogin', { username, password });
          });
          
          // Handle login result
          socket.on('adminLoginResult', (result) => {
            if (result.success) {
              isAdmin = true;
              loginForm.style.display = 'none';
              adminPanel.style.display = 'block';
              
              // Request initial game state
              refreshGameState();
            } else {
              showLoginError(result.message || 'Login failed');
            }
          });
          
          // Show login error
          function showLoginError(message) {
            loginError.textContent = message;
            loginError.classList.remove('hidden');
            
            // Hide error after 3 seconds
            setTimeout(() => {
              loginError.classList.add('hidden');
            }, 3000);
          }
          
          // Refresh game state
          function refreshGameState() {
            socket.emit('requestGameState');
          }
          
          // Handle game state update
          socket.on('gameState', (data) => {
            if (!isAdmin) return;
            
            const players = data.players;
            const playerIds = Object.keys(players);
            
            // Update player count
            playerCount.textContent = playerIds.length;
            
            // Get unique device count and total connections
            const deviceIds = new Set();
            let totalConnections = 0;
            
            playerIds.forEach(id => {
              if (players[id].deviceId) {
                deviceIds.add(players[id].deviceId);
              }
            });
            
            // Request device connections info from server
            socket.emit('getDeviceConnections');
            
            // Update player list
            updatePlayerList(players);
          });
          
          // Handle device connections info
          socket.on('deviceConnectionsInfo', (data) => {
            if (!isAdmin) return;
            
            deviceCount.textContent = data.uniqueDevices;
            connectionCount.textContent = data.totalConnections;
          });
          
          // Update player list
          function updatePlayerList(players) {
            playerList.innerHTML = '';
            
            const playerIds = Object.keys(players);
            
            if (playerIds.length === 0) {
              playerList.innerHTML = '<div class="player-item" style="background-color: #f8f9fa;"><div class="player-info"><strong>No players connected</strong></div></div>';
              return;
            }
            
            playerIds.forEach(id => {
              const player = players[id];
              const playerItem = document.createElement('div');
              playerItem.className = 'player-item';
              
              playerItem.innerHTML = '<div class="player-info"><strong>' + (player.name || 'Unnamed Player') + '</strong> (' + id.substring(0, 8) + '...)<div>Ship: ' + player.type + ' | Hull: ' + player.hull + '% | Position: (' + Math.round(player.x) + ', ' + Math.round(player.y) + ')</div></div><div class="player-actions"><button class="btn btn-danger kick-player-btn" data-id="' + id + '">Kick</button></div>';
              
              playerList.appendChild(playerItem);
            });
            
            // Add event listeners to kick buttons
            document.querySelectorAll('.kick-player-btn').forEach(btn => {
              btn.addEventListener('click', (e) => {
                const playerId = e.target.getAttribute('data-id');
                kickPlayer(playerId);
              });
            });
          }
          
          // Kick a player
          function kickPlayer(playerId) {
            if (!isAdmin) return;
            
            socket.emit('adminKickPlayer', { playerId });
          }
          
          // Force cleanup
          cleanupBtn.addEventListener('click', () => {
            if (!isAdmin) return;
            
            socket.emit('adminForceCleanup');
          });
          
          // Kick all players
          kickAllBtn.addEventListener('click', () => {
            if (!isAdmin) return;
            
            if (confirm('Are you sure you want to kick all players?')) {
              socket.emit('adminKickAll');
            }
          });
          
          // Reset server
          resetBtn.addEventListener('click', () => {
            if (!isAdmin) return;
            
            if (confirm('Are you sure you want to reset the server? This will disconnect all players and reset the game state.')) {
              socket.emit('adminResetServer');
            }
          });
          
          // Refresh button
          refreshBtn.addEventListener('click', () => {
            if (!isAdmin) return;
            
            refreshGameState();
          });
          
          // Handle admin action results
          socket.on('adminActionResult', (result) => {
            if (!isAdmin) return;
            
            // Show alert
            showAlert(result.message, result.success ? 'success' : 'danger');
            
            // Refresh game state
            refreshGameState();
          });
          
          // Show alert
          function showAlert(message, type = 'success') {
            const alert = document.createElement('div');
            alert.className = 'alert alert-' + type;
            alert.textContent = message;
            
            alertContainer.appendChild(alert);
            
            // Remove alert after 3 seconds
            setTimeout(() => {
              alert.remove();
            }, 3000);
          }
          
          // Auto-refresh game state every 5 seconds
          setInterval(() => {
            if (isAdmin) {
              refreshGameState();
            }
          }, 5000);
        </script>
      </body>
    </html>
  `);
});

// Start the server
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0'; // Listen on all network interfaces
server.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://<your-local-ip>:${PORT}`);
  console.log(`Visit these URLs to see server status`);
}); 