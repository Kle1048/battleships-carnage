# Battleships MMO (v0.1.0)

A top-down multiplayer naval battle game where players engage in combat on an open water map, collect wreckage to upgrade their ships, and climb the leaderboard.

## Current Features (v0.1.0)

- Endless water map with persistent world
- Realistic naval physics with momentum-based movement
- Authentic ship controls with discrete throttle and rudder settings
- Real-time multiplayer with WebSockets
- Multiple ship types (destroyer, cruiser, battleship)
- Player-specific ship colors for better visibility
- Enhanced water background with improved contrast
- Connection status display
- Basic server-side game state management
- Local network multiplayer support

## Upcoming Features

- Combat system with cannons, torpedoes, and rockets
- Ship damage and destruction mechanics
- Wreckage collection and ship upgrades
- Leaderboard system
- Weather effects
- Sound effects and improved visuals
- Player authentication

## Project Structure

- `/client` - React frontend with PixiJS for rendering
- `/server` - Node.js backend with Socket.IO for real-time communication

## Development Setup

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Client Setup

```bash
cd client
npm install
npm start
```

### Server Setup

```bash
cd server
npm install
node src/index.js
```

## Network Play Setup

To play with multiple devices on your local network:

1. Find your computer's local IP address:
   - Windows: Open Command Prompt and type `ipconfig`
   - Mac: Open System Preferences > Network
   - Linux: Open Terminal and type `ip addr show`

2. Create a `.env` file in the client directory:
   ```
   # Copy from .env.example
   REACT_APP_SERVER_URL=http://YOUR_LOCAL_IP:3001
   ```

3. Start the server on the host computer:
   ```bash
   cd server
   node src/index.js
   ```

4. On other devices, open a browser and navigate to:
   ```
   http://YOUR_LOCAL_IP:3000
   ```

5. If you have firewall issues, make sure ports 3000 and 3001 are allowed.

## Ship Controls

### Throttle Settings
- **W**: Increase throttle one step
- **S**: Decrease throttle one step
- **1**: Reverse Full
- **2**: Reverse Half
- **3**: Stop
- **4**: Slow Ahead
- **5**: Half Ahead
- **6**: Flank Speed

### Rudder Settings
- **A**: Turn rudder more to the left
- **D**: Turn rudder more to the right
- **Space**: Center the rudder
- **Q**: Full rudder left
- **E**: Full rudder right
- **R**: Rudder ahead (centered)

The ship's movement is now more realistic with:
- Gradual acceleration and deceleration
- Turning effectiveness based on speed
- Reduced turning ability in reverse
- Slight drift when turning at speed

## Development Progress

- [x] Project setup
- [x] Basic game engine
- [x] Ship movement & controls
- [x] Basic multiplayer integration
- [x] Visual improvements for better gameplay
- [x] Local network multiplayer
- [x] Realistic ship controls
- [ ] Combat system
- [ ] Progression system
- [ ] Polish & optimization

## Testing the Connection

If you're having issues with the main game, you can test the server connection by visiting:
```
http://YOUR_LOCAL_IP:3001/test
```

This test page will show you if the connection to the server is working properly.

## Version History

### v0.1.0
- Initial prototype with basic ship movement
- Real-time multiplayer functionality
- Ship physics with momentum-based movement
- Basic server-side game state management
- Player-specific ship colors for better visibility
- Enhanced water background with improved contrast
- Local network multiplayer support
- Realistic ship controls with throttle and rudder settings 