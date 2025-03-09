import * as PIXI from 'pixi.js';
import { Ship, ThrottleSetting, RudderSetting, setNetworkManagerRef } from './Ship';
import { InputHandler } from './InputHandler';
import { NetworkManager } from './NetworkManager';

// Game state
let app: PIXI.Application;
let playerShip: Ship;
let inputHandler: InputHandler;
let networkManager: NetworkManager;
let gameLoop: (delta: number) => void;
let statusText: PIXI.Text;
let controlsText: PIXI.Text;
let shipStatusText: PIXI.Text;
let healthBar: PIXI.Graphics;
let healthBarBg: PIXI.Graphics;
let damageIndicator: PIXI.Text;

// Game world properties
const WORLD_SIZE = 5000; // Size of the game world

export function initGame(pixiApp: PIXI.Application): void {
  app = pixiApp;
  
  // Create a container for the game world
  const gameWorld = new PIXI.Container();
  app.stage.addChild(gameWorld as any);
  
  // Create water background
  createWaterBackground(gameWorld);
  
  // Create player ship
  playerShip = new Ship({
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    rotation: 0,
    speed: 0,
    maxSpeed: 5,
    acceleration: 0.1,
    rotationSpeed: 0.05,
    hull: 100,
    type: 'destroyer',
    playerId: 'local' // Local player always has 'local' as ID
  });
  
  gameWorld.addChild(playerShip.sprite as any);
  
  // Set up camera to follow player
  setupCamera(gameWorld);
  
  // Set up input handler
  inputHandler = new InputHandler();
  
  // Set up network manager
  networkManager = new NetworkManager(gameWorld);
  networkManager.setLocalPlayer(playerShip);
  
  // Set network manager reference in Ship class
  setNetworkManagerRef(networkManager);
  
  // Create UI container (fixed to screen, not affected by camera)
  const uiContainer = new PIXI.Container();
  app.stage.addChild(uiContainer as any);
  
  // Create connection status text
  statusText = new PIXI.Text('Connecting to server...', {
    fontFamily: 'Arial',
    fontSize: 16,
    fill: 0xFFFFFF,
    align: 'left',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowDistance: 2,
    stroke: 0x000000,
    strokeThickness: 2
  });
  statusText.position.set(20, 20);
  uiContainer.addChild(statusText as any);
  
  // Create ship controls text
  controlsText = new PIXI.Text('', {
    fontFamily: 'Arial',
    fontSize: 14,
    fill: 0xFFFFFF,
    align: 'left',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowDistance: 2,
    stroke: 0x000000,
    strokeThickness: 1
  });
  controlsText.position.set(app.screen.width - 220, 20);
  uiContainer.addChild(controlsText as any);
  
  // Create ship status text (shows current throttle and rudder settings)
  shipStatusText = new PIXI.Text('', {
    fontFamily: 'Arial',
    fontSize: 16,
    fill: 0xFFD700, // Gold color
    align: 'center',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowDistance: 2,
    stroke: 0x000000,
    strokeThickness: 2
  });
  shipStatusText.anchor.set(0.5, 0);
  shipStatusText.position.set(app.screen.width / 2, 20);
  uiContainer.addChild(shipStatusText as any);
  
  // Create health bar background
  healthBarBg = new PIXI.Graphics();
  healthBarBg.beginFill(0x333333);
  healthBarBg.drawRect(0, 0, 200, 15);
  healthBarBg.endFill();
  healthBarBg.position.set(app.screen.width / 2 - 100, 50);
  uiContainer.addChild(healthBarBg as any);
  
  // Create health bar
  healthBar = new PIXI.Graphics();
  healthBar.beginFill(0x00FF00);
  healthBar.drawRect(0, 0, 200, 15);
  healthBar.endFill();
  healthBar.position.set(app.screen.width / 2 - 100, 50);
  uiContainer.addChild(healthBar as any);
  
  // Create damage indicator text
  damageIndicator = new PIXI.Text('', {
    fontFamily: 'Arial',
    fontSize: 24,
    fill: 0xFF0000,
    align: 'center',
    fontWeight: 'bold'
  });
  damageIndicator.anchor.set(0.5);
  damageIndicator.position.set(app.screen.width / 2, app.screen.height / 2);
  damageIndicator.visible = false;
  uiContainer.addChild(damageIndicator as any);
  
  // Set up game loop
  gameLoop = (delta: number) => {
    // Handle ship controls with the new control scheme
    handleShipControls();
    
    // Update ship position
    playerShip.update(delta);
    
    // Check for collisions
    checkCollisions();
    
    // Update camera position to follow player
    updateCamera(gameWorld);
    
    // Update UI texts
    updateConnectionStatus();
    updateControlsText();
    updateShipStatusText();
    updateHealthBar();
    
    // Send position update to server
    networkManager.updatePosition();
    
    // Update input handler
    inputHandler.update();
  };
  
  // Start the game loop
  app.ticker.add(gameLoop);
}

function handleShipControls(): void {
  // Throttle controls
  if (inputHandler.isKeyPressed('KeyW')) {
    // Increase throttle
    playerShip.increaseThrottle();
  } else if (inputHandler.isKeyPressed('KeyS')) {
    // Decrease throttle
    playerShip.decreaseThrottle();
  }
  
  // Rudder controls
  if (inputHandler.isKeyPressed('KeyA')) {
    // Turn rudder left
    playerShip.turnRudderLeft();
  } else if (inputHandler.isKeyPressed('KeyD')) {
    // Turn rudder right
    playerShip.turnRudderRight();
  } else if (inputHandler.isKeyPressed('Space')) {
    // Center rudder
    playerShip.centerRudder();
  }
  
  // Direct throttle settings with number keys
  if (inputHandler.isKeyPressed('Digit1')) {
    playerShip.setThrottle(ThrottleSetting.REVERSE_FULL);
  } else if (inputHandler.isKeyPressed('Digit2')) {
    playerShip.setThrottle(ThrottleSetting.REVERSE_HALF);
  } else if (inputHandler.isKeyPressed('Digit3')) {
    playerShip.setThrottle(ThrottleSetting.STOP);
  } else if (inputHandler.isKeyPressed('Digit4')) {
    playerShip.setThrottle(ThrottleSetting.SLOW);
  } else if (inputHandler.isKeyPressed('Digit5')) {
    playerShip.setThrottle(ThrottleSetting.HALF);
  } else if (inputHandler.isKeyPressed('Digit6')) {
    playerShip.setThrottle(ThrottleSetting.FLANK);
  }
  
  // Direct rudder settings with Q, E, and R keys
  if (inputHandler.isKeyPressed('KeyQ')) {
    playerShip.setRudder(RudderSetting.FULL_LEFT);
  } else if (inputHandler.isKeyPressed('KeyE')) {
    playerShip.setRudder(RudderSetting.FULL_RIGHT);
  } else if (inputHandler.isKeyPressed('KeyR')) {
    playerShip.setRudder(RudderSetting.AHEAD);
  }
}

function updateConnectionStatus(): void {
  const status = networkManager.getConnectionStatus();
  let text = '';
  let color = 0xffffff;
  
  switch (status) {
    case 'connected':
      text = 'Connected to server';
      color = 0x00ff00; // Green
      break;
    case 'connecting':
      text = 'Connecting to server...';
      color = 0xffff00; // Yellow
      break;
    case 'disconnected':
      text = 'Disconnected from server. Playing offline.';
      color = 0xff0000; // Red
      break;
  }
  
  // Add server info
  const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
  text += `\nServer: ${serverUrl}`;
  
  // Add position info
  text += `\nPosition: X: ${Math.round(playerShip.x)}, Y: ${Math.round(playerShip.y)}`;
  
  // Update text
  statusText.text = text;
  statusText.style.fill = color;
}

function updateControlsText(): void {
  // Display controls information
  let text = 'Controls:';
  text += '\nW/S - Throttle Up/Down';
  text += '\nA/D - Rudder Left/Right';
  text += '\nSpace - Center Rudder';
  text += '\n1-6 - Direct Throttle';
  text += '\nQ/E - Full Rudder L/R';
  text += '\nR - Center Rudder';
  
  controlsText.text = text;
}

function updateShipStatusText(): void {
  // Show current throttle and rudder settings
  let throttleText = '';
  switch (playerShip.throttleSetting) {
    case ThrottleSetting.FLANK: throttleText = 'FLANK SPEED'; break;
    case ThrottleSetting.HALF: throttleText = 'HALF AHEAD'; break;
    case ThrottleSetting.SLOW: throttleText = 'SLOW AHEAD'; break;
    case ThrottleSetting.STOP: throttleText = 'ALL STOP'; break;
    case ThrottleSetting.REVERSE_HALF: throttleText = 'REVERSE HALF'; break;
    case ThrottleSetting.REVERSE_FULL: throttleText = 'REVERSE FULL'; break;
  }
  
  let rudderText = '';
  switch (playerShip.rudderSetting) {
    case RudderSetting.FULL_LEFT: rudderText = 'FULL RUDDER LEFT'; break;
    case RudderSetting.HALF_LEFT: rudderText = 'HALF RUDDER LEFT'; break;
    case RudderSetting.AHEAD: rudderText = 'RUDDER AMIDSHIPS'; break;
    case RudderSetting.HALF_RIGHT: rudderText = 'HALF RUDDER RIGHT'; break;
    case RudderSetting.FULL_RIGHT: rudderText = 'FULL RUDDER RIGHT'; break;
  }
  
  shipStatusText.text = `${throttleText}\n${rudderText}`;
}

function createWaterBackground(container: PIXI.Container): void {
  // Create a canvas for the water
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    // Draw a darker blue background for better contrast with ships
    ctx.fillStyle = '#003366'; // Darker blue
    ctx.fillRect(0, 0, 100, 100);
    
    // Draw wave lines
    ctx.strokeStyle = '#004080'; // Slightly lighter blue for waves
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    
    // Add more detailed wave patterns
    for (let i = 0; i < 10; i++) {
      // Horizontal waves
      ctx.beginPath();
      ctx.moveTo(0, i * 10 + 5);
      ctx.lineTo(100, i * 10 + 5);
      ctx.stroke();
      
      // Add some diagonal waves for texture
      ctx.beginPath();
      ctx.moveTo(i * 10, 0);
      ctx.lineTo((i * 10) + 20, 100);
      ctx.stroke();
    }
    
    // Add some random dots for texture (like foam or ripples)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const size = Math.random() * 2 + 1;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  const waterTexture = PIXI.Texture.from(canvas);
  
  // Create a tiling sprite for the water
  const waterBackground = new PIXI.TilingSprite(
    waterTexture,
    WORLD_SIZE,
    WORLD_SIZE
  );
  
  // Add the water background to the container
  container.addChild(waterBackground as any);
}

function setupCamera(gameWorld: PIXI.Container): void {
  // Center the camera on the player initially
  gameWorld.position.x = app.screen.width / 2 - playerShip.x;
  gameWorld.position.y = app.screen.height / 2 - playerShip.y;
}

function updateCamera(gameWorld: PIXI.Container): void {
  // Smoothly follow the player
  const targetX = app.screen.width / 2 - playerShip.x;
  const targetY = app.screen.height / 2 - playerShip.y;
  
  gameWorld.position.x = targetX;
  gameWorld.position.y = targetY;
}

/**
 * Check for collisions between ships
 */
function checkCollisions(): void {
  // Get all ships from the network manager
  const ships = networkManager.getAllShips();
  
  // Debug info
  console.log(`Checking collisions among ${ships.length} ships`);
  
  // Check for collisions between all pairs of ships
  for (let i = 0; i < ships.length; i++) {
    const shipA = ships[i];
    
    // Skip if ship is not visible (destroyed)
    if (!shipA.sprite.visible) {
      continue;
    }
    
    for (let j = 0; j < ships.length; j++) {
      // Skip self-collision
      if (i === j) {
        continue;
      }
      
      const shipB = ships[j];
      
      // Skip if ship is not visible (destroyed)
      if (!shipB.sprite.visible) {
        continue;
      }
      
      // Debug distances
      const dx = shipA.x - shipB.x;
      const dy = shipA.y - shipB.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = shipA.collisionRadius + shipB.collisionRadius;
      
      // Check for collision
      if (distance < minDistance) {
        console.log(`Collision detected between ${shipA.playerId} and ${shipB.playerId}!`);
        console.log(`Distance: ${distance}, Min Distance: ${minDistance}`);
        
        // Handle collision for both ships
        shipA.handleCollision(shipB);
        shipB.handleCollision(shipA);
        
        // If the player ship is involved, show damage indicator
        if (shipA === playerShip || shipB === playerShip) {
          showDamageIndicator();
        }
      }
    }
  }
}

/**
 * Show damage indicator when player takes damage
 */
function showDamageIndicator(): void {
  // Show damage indicator
  damageIndicator.text = 'COLLISION!';
  damageIndicator.visible = true;
  
  // Hide after a short delay
  setTimeout(() => {
    damageIndicator.visible = false;
  }, 1000);
}

/**
 * Update the health bar based on player ship hull
 */
function updateHealthBar(): void {
  // Calculate health percentage
  const healthPercent = playerShip.hull / playerShip.maxHull;
  
  // Update health bar width
  healthBar.clear();
  
  // Choose color based on health percentage
  let color = 0x00FF00; // Green
  if (healthPercent < 0.3) {
    color = 0xFF0000; // Red
  } else if (healthPercent < 0.6) {
    color = 0xFFFF00; // Yellow
  }
  
  healthBar.beginFill(color);
  healthBar.drawRect(0, 0, 200 * healthPercent, 15);
  healthBar.endFill();
  
  // Reposition health bar if window is resized
  healthBar.position.set(app.screen.width / 2 - 100, 50);
  healthBarBg.position.set(app.screen.width / 2 - 100, 50);
} 