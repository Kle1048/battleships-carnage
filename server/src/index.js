const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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

// Store player data
const players = {};

// Store projectiles
const projectiles = {};

// Track device connections
const deviceConnections = {};

// Inactive player timeout (5 minutes)
const INACTIVE_TIMEOUT = 5 * 60 * 1000;

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
          
          // Remove device connection if it exists
          if (player.deviceId && deviceConnections[player.deviceId] === playerId) {
            delete deviceConnections[player.deviceId];
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

// Handle socket connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Handle device identification
  socket.on('identifyDevice', (data) => {
    let deviceId = data.deviceId;
    const playerName = data.playerName || 'Unknown Player';
    
    // If no device ID provided, generate a new one
    if (!deviceId) {
      deviceId = generateDeviceId();
      console.log(`Generated new device ID for player ${socket.id}: ${deviceId}`);
      
      // Send the new device ID to the client
      socket.emit('deviceIdAssigned', { deviceId });
    } else {
      console.log(`Player ${socket.id} identified with device ID: ${deviceId}`);
    }
    
    // Check if this device is already connected
    if (deviceConnections[deviceId] && deviceConnections[deviceId] !== socket.id) {
      const existingPlayerId = deviceConnections[deviceId];
      const existingSocket = io.sockets.sockets.get(existingPlayerId);
      
      if (existingSocket) {
        console.log(`Device ${deviceId} already connected as player ${existingPlayerId}. Disconnecting old session.`);
        
        // Notify the existing socket that it's being disconnected
        existingSocket.emit('forceDisconnect', { 
          reason: 'Another session was opened on this device' 
        });
        
        // Disconnect the existing socket
        existingSocket.disconnect(true);
        
        // Remove the player from the game
        if (players[existingPlayerId]) {
          delete players[existingPlayerId];
          
          // Notify other players
          socket.broadcast.emit('playerLeft', existingPlayerId);
        }
      }
    }
    
    // Register this device connection
    deviceConnections[deviceId] = socket.id;
    
    // Create a new player
    players[socket.id] = {
      id: socket.id,
      x: Math.random() * 2500,
      y: Math.random() * 2500,
      rotation: Math.random() * Math.PI * 2,
      type: getRandomShipType(),
      hull: 100,
      deviceId: deviceId,
      name: playerName,
      lastActivity: Date.now()
    };
    
    // Send game state to the new player
    socket.emit('gameState', {
      players,
      self: socket.id,
      projectiles: Object.values(projectiles)
    });
    
    // Notify other players about the new player
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });
  
  // Handle game state request
  socket.on('requestGameState', () => {
    console.log(`Player ${socket.id} requested game state`);
    
    // Check if player exists
    if (!players[socket.id]) {
      console.warn(`Player ${socket.id} requested game state but doesn't exist in players list`);
      
      // Create a new player as a fallback
      players[socket.id] = {
        id: socket.id,
        x: Math.random() * 2500,
        y: Math.random() * 2500,
        rotation: Math.random() * Math.PI * 2,
        type: getRandomShipType(),
        hull: 100,
        deviceId: null,
        name: 'Reconnected Player',
        lastActivity: Date.now()
      };
      
      console.log(`Created new player entry for ${socket.id}`);
    }
    
    // Update last activity timestamp
    players[socket.id].lastActivity = Date.now();
    
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
    players[socket.id] = {
      id: socket.id,
      x: Math.random() * 2500,
      y: Math.random() * 2500,
      rotation: Math.random() * Math.PI * 2,
      type: getRandomShipType(),
      hull: 100,
      deviceId: players[socket.id]?.deviceId || null,
      lastActivity: Date.now()
    };
    
    // Send the updated player data back
    socket.emit('respawnAccepted', players[socket.id]);
    
    // Notify other players about the respawn
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove the player's device connection
    if (players[socket.id] && players[socket.id].deviceId) {
      const deviceId = players[socket.id].deviceId;
      
      // Only remove the device connection if it belongs to this player
      if (deviceConnections[deviceId] === socket.id) {
        delete deviceConnections[deviceId];
      }
    }
    
    // Remove the player from the game
    delete players[socket.id];
    
    // Notify other players
    socket.broadcast.emit('playerLeft', socket.id);
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
          .devices { margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Battleships MMO Server</h1>
        <div class="status">
          <p>Server is running on port ${PORT}</p>
          <p>Connected players: ${Object.keys(players).length}</p>
          <p>Unique devices: ${Object.keys(deviceConnections).length}</p>
        </div>
        <div class="players">
          <h2>Active Players</h2>
          <pre>${JSON.stringify(players, null, 2)}</pre>
        </div>
        <div class="devices">
          <h2>Device Connections</h2>
          <pre>${JSON.stringify(deviceConnections, null, 2)}</pre>
        </div>
        <a href="/test" class="test-link">Open Connection Test Page</a>
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