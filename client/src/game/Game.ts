import * as PIXI from 'pixi.js';
import { Ship, ThrottleSetting, RudderSetting } from './Ship';
import { InputHandler } from './InputHandler';
import { NetworkManager } from './NetworkManager';

// Game state
let app: PIXI.Application;
let playerShip: Ship;
let inputHandler: InputHandler;
let networkManager: NetworkManager;
let gameLoop: (delta: number) => void;
let statusText: PIXI.Text;

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
  
  // Create status text
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
  app.stage.addChild(statusText as any);
  
  // Set up game loop
  gameLoop = (delta: number) => {
    // Handle ship controls with the new control scheme
    handleShipControls();
    
    // Update ship position
    playerShip.update(delta);
    
    // Update camera position to follow player
    updateCamera(gameWorld);
    
    // Update status text
    updateStatusText();
    
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

function updateStatusText(): void {
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
  
  // Add controls info
  text += '\nControls:';
  text += '\nW/S - Increase/Decrease Throttle';
  text += '\nA/D - Turn Rudder Left/Right';
  text += '\nSpace - Center Rudder';
  text += '\n1-6 - Direct Throttle Settings';
  text += '\nQ/E - Full Rudder Left/Right';
  text += '\nR - Center Rudder';
  
  // Add position info
  text += `\nPosition: X: ${Math.round(playerShip.x)}, Y: ${Math.round(playerShip.y)}`;
  
  // Update text
  statusText.text = text;
  statusText.style.fill = color;
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