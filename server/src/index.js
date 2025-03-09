const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
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
const io = socketIo(server, {
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

// Game state
const players = {};
const ships = {};
const projectiles = {};

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Add player to the game
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 2500, // Random position across the map
    y: Math.random() * 2500, // Random position across the map
    rotation: Math.random() * Math.PI * 2, // Random initial rotation
    type: getRandomShipType(),
    hull: 100
  };
  
  // Send current game state to the new player
  socket.emit('gameState', {
    players: players,
    self: socket.id
  });
  
  // Broadcast new player to all other players
  socket.broadcast.emit('playerJoined', players[socket.id]);
  
  // Handle player movement
  socket.on('updatePosition', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].rotation = data.rotation;
      
      // Broadcast updated position to all other players
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: data.x,
        y: data.y,
        rotation: data.rotation
      });
    }
  });
  
  // Handle projectile fired
  socket.on('projectileFired', (projectileData) => {
    console.log(`Projectile fired by ${socket.id}:`, projectileData.id);
    
    // Store the projectile
    projectiles[projectileData.id] = {
      ...projectileData,
      timestamp: Date.now()
    };
    
    // Broadcast to all other players
    socket.broadcast.emit('projectileFired', projectileData);
    
    // Clean up old projectiles after their lifetime
    setTimeout(() => {
      delete projectiles[projectileData.id];
    }, 10000); // 10 seconds should be enough for any projectile to expire
  });
  
  // Handle ship damage
  socket.on('damageShip', (data) => {
    const { targetId, amount } = data;
    
    // Validate the damage request
    if (players[targetId] && amount > 0) {
      // Apply damage to the target ship
      players[targetId].hull -= amount;
      
      // Check if ship is destroyed
      if (players[targetId].hull <= 0) {
        players[targetId].hull = 0;
        
        // Broadcast ship destruction to all players
        io.emit('shipDestroyed', {
          id: targetId
        });
        
        // Respawn the ship after a delay
        setTimeout(() => {
          if (players[targetId]) {
            players[targetId].hull = 100;
            players[targetId].x = Math.random() * 2500;
            players[targetId].y = Math.random() * 2500;
            
            // Broadcast ship respawn
            io.emit('shipRespawned', players[targetId]);
          }
        }, 5000); // 5 second respawn time
      } else {
        // Broadcast damage to all players
        io.emit('shipDamaged', {
          id: targetId,
          hull: players[targetId].hull
        });
      }
    }
  });
  
  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove player from the game
    delete players[socket.id];
    
    // Broadcast player left to all other players
    io.emit('playerLeft', socket.id);
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
      hull: 100
    };
    
    // Send the updated player data back
    socket.emit('respawnAccepted', players[socket.id]);
    
    // Notify other players about the respawn
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });
});

// Helper function to get a random ship type
function getRandomShipType() {
  const types = ['destroyer', 'cruiser', 'battleship'];
  return types[Math.floor(Math.random() * types.length)];
}

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
        </style>
      </head>
      <body>
        <h1>Battleships MMO Server</h1>
        <div class="status">
          <p>Server is running on port ${PORT}</p>
          <p>Connected players: ${Object.keys(players).length}</p>
        </div>
        <div class="players">
          <h2>Active Players</h2>
          <pre>${JSON.stringify(players, null, 2)}</pre>
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