# Battleships MMO (v0.1.0)

A top-down multiplayer naval battle game where players engage in combat on an open water map, collect wreckage to upgrade their ships, and climb the leaderboard.

## Current Features (v0.1.0)

- Endless water map with persistent world
- Realistic naval physics with momentum-based movement
- Basic ship controls (W/A/S/D)
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

## Game Controls

- W/S: Increase/decrease ship speed (throttle control)
- A/D: Steer left/right (rudder control)
- Mouse Movement: Rotate gun turrets (coming soon)
- Left Mouse Button: Fire cannons (coming soon)
- Right Mouse Button: Fire rockets/torpedoes (coming soon)
- Shift: Use ship boost for a temporary speed burst (coming soon)
- R Key: Reload weapons manually (coming soon)

## Development Progress

- [x] Project setup
- [x] Basic game engine
- [x] Ship movement & controls
- [x] Basic multiplayer integration
- [x] Visual improvements for better gameplay
- [x] Local network multiplayer
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