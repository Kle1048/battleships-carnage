import * as PIXI from 'pixi.js';
import { Ship, ThrottleSetting, RudderSetting, setNetworkManagerRef, WeaponType, SHIP_COLORS } from './Ship';
import { InputHandler } from './InputHandler';
import { NetworkManager } from './NetworkManager';
import { Projectile, ProjectileType } from './Projectile';
import { NetworkDebug } from './NetworkDebug';

// Game state
let app: PIXI.Application;
let playerShip: Ship;
let inputHandler: InputHandler;
let networkManager: NetworkManager;
let networkDebug: NetworkDebug;
let gameLoop: (delta: number) => void;
let statusText: PIXI.Text;
let controlsText: PIXI.Text;
let shipStatusText: PIXI.Text;
let healthBar: PIXI.Graphics;
let healthBarBg: PIXI.Graphics;
let damageIndicator: PIXI.Text;
let gameOverContainer: PIXI.Container;
let gameOverText: PIXI.Text;
let rejoinButton: PIXI.Graphics;
let rejoinButtonText: PIXI.Text;
let isGameOver: boolean = false;

// Frame counter for periodic updates
let frameCounter: number = 0;

// Projectiles
let projectiles: Projectile[] = [];
let projectilesContainer: PIXI.Container;

// Mouse target indicator
let mouseTargetIndicator: PIXI.Graphics;

// Enemy indicator arrow
let enemyIndicator: PIXI.Graphics;
const ENEMY_INDICATOR_DISTANCE = 250; // Increased distance from player ship to indicator (was 100)
const ENEMY_INDICATOR_SIZE = 8; // Size factor for the arrow (smaller than before)
const ENEMY_INDICATOR_OPACITY = 0.7; // Reduced opacity to make it less prominent

// Game world properties
const WORLD_SIZE = 5000; // Size of the game world

let colorPickerContainer: PIXI.Container;
let colorPickerVisible: boolean = false;

// Add notification system
let notificationText: PIXI.Text;
let notificationTimeout: number | null = null;

// Add player list display
let playerListContainer: PIXI.Container;
let playerListBackground: PIXI.Graphics;
let playerListText: PIXI.Text;
let playerListVisible: boolean = true;
let playerListToggleButton: PIXI.Graphics;
let playerListToggleText: PIXI.Text;

// Add position update counter
let positionUpdateCounter: number = 0;
const POSITION_UPDATE_INTERVAL: number = 1; // Send position updates every frame (was 3)

// Add sync button
let syncButton: PIXI.Graphics;
let syncButtonText: PIXI.Text;

// Add debug key handler
document.addEventListener('keydown', (e) => {
  // Press F2 to toggle network debug
  if (e.key === 'F2' && networkDebug) {
    networkDebug.toggle();
  }
  
  // Press F3 to force visibility check
  if (e.key === 'F3' && networkDebug) {
    networkDebug.checkVisibility();
  }
  
  // Press F4 to force reconnection
  if (e.key === 'F4' && networkDebug) {
    networkDebug.forceReconnect();
  }
});

export function initGame(pixiApp: PIXI.Application): InputHandler {
  app = pixiApp;
  isGameOver = false;
  projectiles = [];
  
  // Check if running on mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  console.log(`Device detection: ${isMobile ? 'Mobile' : 'Desktop'} device detected`);
  console.log(`Screen size: ${window.innerWidth}x${window.innerHeight}`);
  console.log(`Pixel ratio: ${window.devicePixelRatio}`);
  
  // Initialize ship color from storage
  Ship.initializeColorFromStorage();
  
  // Create a container for the game world
  const gameWorld = new PIXI.Container();
  app.stage.addChild(gameWorld as any);
  
  // Create water background
  createWaterBackground(gameWorld);
  
  // Create a container for projectiles
  projectilesContainer = new PIXI.Container();
  gameWorld.addChild(projectilesContainer as any);
  
  // Create mouse target indicator
  mouseTargetIndicator = new PIXI.Graphics();
  mouseTargetIndicator.beginFill(0xff0000, 0.5);
  mouseTargetIndicator.drawCircle(0, 0, 10);
  mouseTargetIndicator.endFill();
  mouseTargetIndicator.visible = false;
  gameWorld.addChild(mouseTargetIndicator as any);
  
  // Create enemy indicator arrow
  enemyIndicator = new PIXI.Graphics();
  createEnemyIndicator();
  enemyIndicator.visible = false;
  gameWorld.addChild(enemyIndicator as any);
  
  // Create network manager
  networkManager = new NetworkManager(gameWorld);
  
  // Create network debug utility
  networkDebug = new NetworkDebug(app, networkManager);
  
  // Set network manager reference in Ship class
  setNetworkManagerRef(networkManager);
  
  // Create player ship
  createPlayerShip(gameWorld);
  
  // Set local player in network manager
  networkManager.setLocalPlayer(playerShip);
  
  // Set local player ID in network debug once it's available
  setTimeout(() => {
    networkDebug.setLocalPlayerId(networkManager.getPlayerId());
  }, 2000);
  
  // Set up camera to follow player
  setupCamera(gameWorld);
  
  // Set up input handler
  inputHandler = new InputHandler();
  
  // Set up projectile callback
  networkManager.setProjectileCallback((projectile: Projectile) => {
    try {
      // Add projectile to the game
      projectiles.push(projectile);
      
      // Ensure the projectile sprite is created before adding to container
      if (projectile.sprite) {
        projectilesContainer.addChild(projectile.sprite as any);
        
        // Add firing effect
        createFiringEffect(
          projectile.x, 
          projectile.y, 
          projectile.rotation, 
          projectile.type
        );
        
        console.log('Network projectile added successfully:', projectile.id);
      } else {
        console.error('Failed to add network projectile: sprite is null');
      }
    } catch (error) {
      console.error('Error handling network projectile:', error);
    }
  });
  
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
  shipStatusText.position.set(app.screen.width / 2, 80); // Moved down to avoid overlap with health bar
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
  
  // Create game over container (initially hidden)
  createGameOverScreen();
  
  // Create color picker UI
  createColorPicker();
  
  // Add color picker button to controls text
  controlsText.text += '\nC - Color Picker';
  
  // Create notification text with larger font and more visible colors
  notificationText = new PIXI.Text('', {
    fontFamily: 'Arial',
    fontSize: 24, // Increased font size
    fill: 0xFFFF00, // Yellow color for better visibility
    align: 'center',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowDistance: 3,
    stroke: 0x000000,
    strokeThickness: 3
  });
  notificationText.anchor.set(0.5, 0);
  notificationText.position.set(app.screen.width / 2, 120);
  notificationText.alpha = 0; // Start invisible
  uiContainer.addChild(notificationText as any);
  
  // Create player list container
  playerListContainer = new PIXI.Container();
  uiContainer.addChild(playerListContainer as unknown as PIXI.DisplayObject);
  
  // Create semi-transparent background for player list
  playerListBackground = new PIXI.Graphics();
  playerListBackground.beginFill(0x000000, 0.6);
  playerListBackground.drawRect(0, 0, 200, 150);
  playerListBackground.endFill();
  playerListContainer.addChild(playerListBackground as unknown as PIXI.DisplayObject);
  
  // Create player list text
  playerListText = new PIXI.Text('Players Online:\n', {
    fontFamily: 'Arial',
    fontSize: 16,
    fill: 0xFFFFFF,
    align: 'left',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowDistance: 2
  });
  playerListText.position.set(10, 10);
  playerListContainer.addChild(playerListText as unknown as PIXI.DisplayObject);
  
  // Position player list in top left corner instead of top right to avoid overlap with controls
  playerListContainer.position.set(20, 100);
  
  // If on mobile, adjust UI elements for better visibility
  if (isMobile) {
    console.log('Applying mobile optimizations');
    
    // Make notification text larger
    notificationText.style.fontSize = 28;
    notificationText.style.strokeThickness = 4;
    
    // Make player list larger
    playerListText.style.fontSize = 20;
    
    // Position player list for better visibility on mobile
    playerListContainer.position.set(10, 150); // Move it down a bit more on mobile
  }
  
  // Create toggle button for player list
  playerListToggleButton = new PIXI.Graphics();
  playerListToggleButton.beginFill(0x333333);
  playerListToggleButton.drawRect(0, 0, 30, 30);
  playerListToggleButton.endFill();
  playerListToggleButton.position.set(20, 70);
  playerListToggleButton.interactive = true;
  playerListToggleButton.cursor = 'pointer';
  uiContainer.addChild(playerListToggleButton as unknown as PIXI.DisplayObject);
  
  // Create toggle button text
  playerListToggleText = new PIXI.Text('P', {
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'bold',
    fill: 0xFFFFFF,
    align: 'center'
  });
  playerListToggleText.anchor.set(0.5);
  playerListToggleText.position.set(playerListToggleButton.x + 15, playerListToggleButton.y + 15);
  uiContainer.addChild(playerListToggleText as unknown as PIXI.DisplayObject);
  
  // Add click event to toggle button
  playerListToggleButton.on('pointerdown', togglePlayerList);
  
  // Create sync button
  createSyncButton(uiContainer);
  
  // Set up game loop
  gameLoop = (delta: number) => {
    if (isGameOver) {
      // Only handle input for the rejoin button when game over
      handleRejoinButton();
      return;
    }
    
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
    
    // Check if player ship is destroyed
    if (playerShip && !playerShip.sprite.visible) {
      showGameOver();
    }
    
    // Send position update to server (more frequently)
    positionUpdateCounter++;
    if (positionUpdateCounter >= POSITION_UPDATE_INTERVAL) {
      networkManager.updatePosition();
      positionUpdateCounter = 0;
    }
    
    // Update input handler
    inputHandler.update();
    
    // Handle weapon controls
    handleWeaponControls();
    
    // Update projectiles
    updateProjectiles();
    
    // Check projectile collisions
    checkProjectileCollisions();
    
    // Update mouse target indicator
    updateMouseTargetIndicator();
    
    // Update enemy indicator
    updateEnemyIndicator();
    
    // Update network debug display
    networkDebug.update();
    
    // Increment frame counter
    frameCounter++;
  };
  
  // Start the game loop
  app.ticker.add(gameLoop);
  
  // Return the input handler so it can be used by the mobile controls
  return inputHandler;
}

/**
 * Create the player ship
 */
function createPlayerShip(gameWorld: PIXI.Container): void {
  try {
    // Start the player in the center of the world, but the server will update this position
    // We're using the center as a safe default until we get the real position from the server
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
      playerId: 'local', // Local player always has 'local' as ID
      playerName: localStorage.getItem('playerName') || 'Unknown Player'
    });
    
    // Add the ship sprite to the game world
    gameWorld.addChild(playerShip.sprite as unknown as PIXI.DisplayObject);
    
    // Add the name container to the game world
    if ((playerShip as any).nameContainer) {
      gameWorld.addChild((playerShip as any).nameContainer as unknown as PIXI.DisplayObject);
    }
    
    console.log('Player ship created at initial position:', {
      x: playerShip.x,
      y: playerShip.y
    });
  } catch (error) {
    console.error('Error creating player ship:', error);
  }
}

/**
 * Create the game over screen
 */
function createGameOverScreen(): void {
  // Create container for game over screen
  gameOverContainer = new PIXI.Container();
  gameOverContainer.visible = false;
  app.stage.addChild(gameOverContainer as any);
  
  // Semi-transparent background
  const overlay = new PIXI.Graphics();
  overlay.beginFill(0x000000, 0.7);
  overlay.drawRect(0, 0, app.screen.width, app.screen.height);
  overlay.endFill();
  gameOverContainer.addChild(overlay as any);
  
  // Game over text
  gameOverText = new PIXI.Text('SHIP DESTROYED', {
    fontFamily: 'Arial',
    fontSize: 48,
    fontWeight: 'bold',
    fill: 0xFF0000,
    align: 'center',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowDistance: 4
  });
  gameOverText.anchor.set(0.5);
  gameOverText.position.set(app.screen.width / 2, app.screen.height / 2 - 50);
  gameOverContainer.addChild(gameOverText as any);
  
  // Rejoin button
  rejoinButton = new PIXI.Graphics();
  rejoinButton.beginFill(0x0077be);
  rejoinButton.drawRoundedRect(0, 0, 200, 50, 10);
  rejoinButton.endFill();
  rejoinButton.position.set(app.screen.width / 2 - 100, app.screen.height / 2 + 50);
  rejoinButton.interactive = true;
  rejoinButton.cursor = 'pointer';
  gameOverContainer.addChild(rejoinButton as any);
  
  // Rejoin button text
  rejoinButtonText = new PIXI.Text('REJOIN GAME', {
    fontFamily: 'Arial',
    fontSize: 20,
    fontWeight: 'bold',
    fill: 0xFFFFFF,
    align: 'center'
  });
  rejoinButtonText.anchor.set(0.5);
  rejoinButtonText.position.set(app.screen.width / 2, app.screen.height / 2 + 75);
  gameOverContainer.addChild(rejoinButtonText as any);
  
  // Add click event to rejoin button
  rejoinButton.on('pointerdown', () => {
    rejoinGame();
  });
}

/**
 * Show the game over screen
 */
function showGameOver(): void {
  isGameOver = true;
  gameOverContainer.visible = true;
  
  // Resize overlay to match current screen size
  const overlay = gameOverContainer.children[0] as PIXI.Graphics;
  overlay.clear();
  overlay.beginFill(0x000000, 0.7);
  overlay.drawRect(0, 0, app.screen.width, app.screen.height);
  overlay.endFill();
  
  // Update positions for responsive layout
  gameOverText.position.set(app.screen.width / 2, app.screen.height / 2 - 50);
  rejoinButton.position.set(app.screen.width / 2 - 100, app.screen.height / 2 + 50);
  rejoinButtonText.position.set(app.screen.width / 2, app.screen.height / 2 + 75);
}

/**
 * Handle rejoin button hover and click
 */
function handleRejoinButton(): void {
  // Check if mouse is over button (simple hover effect)
  if (inputHandler.isMouseOver(rejoinButton)) {
    rejoinButton.tint = 0x00AAFF; // Lighter blue on hover
  } else {
    rejoinButton.tint = 0xFFFFFF; // Normal color
  }
}

/**
 * Rejoin the game after being destroyed
 */
function rejoinGame(): void {
  console.log('Rejoining game...');
  
  // Hide game over screen
  isGameOver = false;
  gameOverContainer.visible = false;
  
  // Request a new ship from the server
  networkManager.requestRespawn();
  
  // Reset player ship
  playerShip.hull = playerShip.maxHull;
  playerShip.sprite.visible = true;
  playerShip.updateDamageAppearance();
  
  // Reset ship position to a random location
  playerShip.x = Math.random() * WORLD_SIZE;
  playerShip.y = Math.random() * WORLD_SIZE;
  playerShip.rotation = Math.random() * Math.PI * 2;
  playerShip.speed = 0;
  playerShip.setThrottle(ThrottleSetting.STOP);
  playerShip.setRudder(RudderSetting.AHEAD);
  
  // Update sprite position
  playerShip.updateSpritePosition();
}

function handleShipControls(): void {
  // Check if we're on a mobile device
  const isMobile = inputHandler.isMobile();
  
  // Handle virtual buttons for mobile
  if (isMobile) {
    // Throttle controls
    if (inputHandler.isVirtualButtonPressed('throttleUp')) {
      playerShip.increaseThrottle();
    } else if (inputHandler.isVirtualButtonPressed('throttleDown')) {
      playerShip.decreaseThrottle();
    }
    
    // Rudder controls
    if (inputHandler.isVirtualButtonPressed('rudderLeft')) {
      playerShip.turnRudderLeft();
    } else if (inputHandler.isVirtualButtonPressed('rudderRight')) {
      playerShip.turnRudderRight();
    } else if (inputHandler.isVirtualButtonPressed('rudderCenter')) {
      playerShip.centerRudder();
    }
  } else {
    // Keyboard controls for desktop
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
  
  // Toggle color picker with 'C' key
  if (inputHandler.isKeyPressed('KeyC')) {
    toggleColorPicker();
    inputHandler.setKeyProcessed('KeyC');
  }
  
  // Toggle player list with 'P' key
  if (inputHandler.isKeyPressed('KeyP')) {
    togglePlayerList();
    inputHandler.setKeyProcessed('KeyP');
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
  controlsText.text = 'Controls:\n';
  controlsText.text += 'W/S - Throttle\n';
  controlsText.text += 'A/D - Rudder\n';
  controlsText.text += 'Q - Center Rudder\n';
  controlsText.text += 'Left Click - Fire Cannons\n';
  controlsText.text += 'Right Click - Fire Torpedoes\n';
  controlsText.text += 'C - Color Picker\n';
  controlsText.text += 'P - Toggle Player List';
}

function updateShipStatusText(): void {
  // Show current throttle and rudder settings
  let throttleText = '';
  switch (playerShip.throttle) {
    case ThrottleSetting.FLANK: throttleText = 'FLANK SPEED'; break;
    case ThrottleSetting.HALF: throttleText = 'HALF AHEAD'; break;
    case ThrottleSetting.SLOW: throttleText = 'SLOW AHEAD'; break;
    case ThrottleSetting.STOP: throttleText = 'ALL STOP'; break;
    case ThrottleSetting.REVERSE_HALF: throttleText = 'REVERSE HALF'; break;
    case ThrottleSetting.REVERSE_FULL: throttleText = 'REVERSE FULL'; break;
  }
  
  let rudderText = '';
  switch (playerShip.rudder) {
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

function handleWeaponControls(): void {
  if (!playerShip || isGameOver) return;
  
  // Check if we're on a mobile device
  const isMobile = inputHandler.isMobile();
  
  if (isMobile) {
    // Handle virtual weapon buttons for mobile
    if (inputHandler.isVirtualButtonPressed('firePrimary')) {
      firePlayerWeapon(WeaponType.PRIMARY);
    }
    
    if (inputHandler.isVirtualButtonPressed('fireSecondary')) {
      firePlayerWeapon(WeaponType.SECONDARY);
    }
  } else {
    // Desktop controls
    // Fire primary weapon with left mouse button
    if (inputHandler.isMouseButtonDown(0)) {
      firePlayerWeapon(WeaponType.PRIMARY);
    }
    
    // Fire secondary weapon with right mouse button
    if (inputHandler.isMouseButtonDown(2)) {
      firePlayerWeapon(WeaponType.SECONDARY);
    }
    
    // Alternative keyboard controls
    if (inputHandler.isKeyPressed('KeyF')) {
      firePlayerWeapon(WeaponType.PRIMARY);
    }
    
    if (inputHandler.isKeyPressed('KeyG')) {
      firePlayerWeapon(WeaponType.SECONDARY);
    }
  }
}

function firePlayerWeapon(weaponType: WeaponType): void {
  if (!playerShip) {
    console.error('Cannot fire weapon: playerShip is null');
    return;
  }
  
  // Log weapon state before firing
  console.log(`Firing ${weaponType} weapon. Ship state:`, {
    type: playerShip.type,
    position: { x: playerShip.x, y: playerShip.y },
    rotation: playerShip.rotation * (180 / Math.PI) + '°',
    primaryCooldown: playerShip.primaryWeaponCooldown,
    secondaryCooldown: playerShip.secondaryWeaponCooldown
  });
  
  let fired = false;
  
  if (weaponType === WeaponType.PRIMARY) {
    fired = playerShip.firePrimaryWeapon();
  } else {
    fired = playerShip.fireSecondaryWeapon();
  }
  
  if (fired) {
    // Get weapon properties
    const weaponProps = playerShip.getWeaponProperties(weaponType);
    if (!weaponProps) {
      console.error(`No weapon properties found for ${weaponType} on ship type ${playerShip.type}`);
      return;
    }
    
    // Get mouse position in world coordinates
    const mousePos = inputHandler.getMousePosition();
    if (!mousePos) {
      console.error('Cannot fire weapon: mouse position is null');
      return;
    }
    
    console.log('Mouse position for firing:', mousePos);
    
    // Convert screen coordinates to world coordinates
    // Since the camera is centered on the player, we need to calculate the offset
    // from the center of the screen to the mouse, and then add that to the player's position
    const worldMousePos = {
      x: playerShip.x + (mousePos.x - app.screen.width / 2),
      y: playerShip.y + (mousePos.y - app.screen.height / 2)
    };
    
    // Log for debugging
    console.log('Mouse Position:', mousePos);
    console.log('Player Position:', { x: playerShip.x, y: playerShip.y });
    console.log('World Mouse Position:', worldMousePos);
    
    // Calculate angle from ship to mouse
    const angleToMouse = Math.atan2(
      worldMousePos.y - playerShip.y,
      worldMousePos.x - playerShip.x
    );
    
    console.log('Angle to Mouse:', angleToMouse * (180 / Math.PI) + '°');
    console.log('Ship Rotation:', playerShip.rotation * (180 / Math.PI) + '°');
    
    // Create projectiles
    for (let i = 0; i < weaponProps.count; i++) {
      // Get spawn position with initial rotation
      const spawnPos = playerShip.getProjectileSpawnPosition(weaponType, i);
      
      // Apply spread around the mouse direction
      const spreadAngle = weaponProps.spread * (i - (weaponProps.count - 1) / 2);
      
      // Use the angle to mouse for direction, not the ship's rotation
      const finalAngle = angleToMouse + spreadAngle;
      
      try {
        // Create the projectile with proper error handling
        const projectile = new Projectile(
          spawnPos.x,
          spawnPos.y,
          finalAngle, // Use the calculated angle to mouse
          weaponProps.type,
          playerShip
        );
        
        // Add projectile to the game
        projectiles.push(projectile);
        
        // Ensure the projectile sprite is created before adding to container
        if (projectile.sprite) {
          projectilesContainer.addChild(projectile.sprite as any);
          
          // Report to server
          networkManager.reportProjectileFired(projectile);
          
          // Add firing effect
          createFiringEffect(spawnPos.x, spawnPos.y, finalAngle, weaponProps.type);
          
          console.log('Projectile created successfully:', projectile.id, 'with angle:', finalAngle * (180 / Math.PI) + '°');
        } else {
          console.error('Failed to create projectile sprite');
        }
      } catch (error) {
        console.error('Error creating projectile:', error);
      }
    }
  } else {
    console.log(`Weapon ${weaponType} could not be fired (on cooldown or other issue)`);
  }
}

function createFiringEffect(x: number, y: number, rotation: number, type: ProjectileType): void {
  try {
    // Create a simple muzzle flash effect
    const flash = new PIXI.Graphics();
    
    if (type === ProjectileType.CANNON_BALL) {
      // Cannon flash
      flash.beginFill(0xffaa00, 0.8);
      flash.drawCircle(0, 0, 10);
      flash.endFill();
    } else {
      // Torpedo launch splash
      flash.beginFill(0xaaaaaa, 0.6);
      flash.drawCircle(0, 0, 15);
      flash.endFill();
    }
    
    flash.x = x;
    flash.y = y;
    
    projectilesContainer.addChild(flash as any);
    
    // Check if app and ticker are available
    if (!app || !app.ticker) {
      console.warn('Cannot animate flash: app.ticker is null. Using setTimeout fallback.');
      
      // Fallback to setTimeout for animation if ticker is not available
      let lifetime = 10;
      const fadeInterval = setInterval(() => {
        lifetime--;
        flash.alpha = lifetime / 10;
        
        if (lifetime <= 0) {
          clearInterval(fadeInterval);
          if (flash.parent) {
            flash.parent.removeChild(flash as any);
          }
        }
      }, 50); // 50ms intervals for roughly similar timing
      
      return;
    }
    
    // Animate the flash using ticker if available
    let lifetime = 10;
    const flashUpdate = () => {
      lifetime--;
      flash.alpha = lifetime / 10;
      
      if (lifetime <= 0) {
        if (flash.parent) {
          flash.parent.removeChild(flash as any);
        }
        app.ticker.remove(flashUpdate);
      }
    };
    
    app.ticker.add(flashUpdate);
  } catch (error) {
    console.error('Error creating firing effect:', error);
  }
}

function updateProjectiles(): void {
  // Update each projectile and remove expired ones
  for (let i = projectiles.length - 1; i >= 0; i--) {
    try {
      const projectile = projectiles[i];
      
      if (!projectile) {
        console.warn('Undefined projectile found at index', i);
        projectiles.splice(i, 1);
        continue;
      }
      
      // Update projectile
      const active = projectile.update();
      
      // Remove if no longer active
      if (!active) {
        try {
          // Create splash effect where the projectile ended
          createWaterSplashEffect(projectile.x, projectile.y);
          
          // Destroy and remove projectile
          projectile.destroy();
        } catch (innerError) {
          console.error('Error cleaning up projectile:', innerError);
        } finally {
          // Always remove the projectile from the array
          projectiles.splice(i, 1);
        }
      }
    } catch (error) {
      console.error('Error in updateProjectiles:', error);
      // Remove problematic projectile
      projectiles.splice(i, 1);
    }
  }
}

function createWaterSplashEffect(x: number, y: number): void {
  // Create a water splash effect
  const splash = new PIXI.Graphics();
  
  // Draw outer splash circle
  splash.beginFill(0xaaaaff, 0.5);
  splash.drawCircle(0, 0, 15);
  splash.endFill();
  
  // Draw inner splash circle
  splash.beginFill(0xffffff, 0.7);
  splash.drawCircle(0, 0, 8);
  splash.endFill();
  
  splash.x = x;
  splash.y = y;
  
  projectilesContainer.addChild(splash as any);
  
  // Animate the splash
  let lifetime = 20;
  let scale = 1.0;
  
  const splashUpdate = () => {
    lifetime--;
    scale += 0.03;
    splash.alpha = lifetime / 20;
    splash.scale.set(scale);
    
    if (lifetime <= 0) {
      projectilesContainer.removeChild(splash as any);
      app.ticker.remove(splashUpdate);
    }
  };
  
  app.ticker.add(splashUpdate);
}

function checkProjectileCollisions(): void {
  // Get all ships from network manager
  const ships = networkManager.getAllShips();
  
  // Log collision check for debugging (every 60 frames)
  if (frameCounter % 60 === 0) {
    console.log(`Checking projectile collisions: ${projectiles.length} projectiles, ${ships.length} ships`);
  }
  
  // Check each projectile against each ship
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    let hitDetected = false;
    
    for (const ship of ships) {
      // Skip if ship is the source of the projectile
      if (ship.id === projectile.sourceId) continue;
      
      // Check collision
      if (projectile.checkCollision(ship)) {
        hitDetected = true;
        
        // Only report damage to server, don't apply locally
        // The server will broadcast the damage and all clients will apply it consistently
        if (projectile.sourceShip === playerShip) {
          console.log(`Reporting damage to server: target=${ship.id}, amount=${projectile.damage}`);
          networkManager.reportDamage(ship.id, projectile.damage);
          
          // Create visual effect for hit, but don't apply damage
          projectile.createHitEffect();
        }
        
        // Remove projectile
        projectile.destroy();
        projectiles.splice(i, 1);
        
        // Show damage indicator if player ship was hit
        if (ship === playerShip) {
          showDamageIndicator();
        }
        
        // Break out of the inner loop since this projectile is now destroyed
        break;
      }
    }
  }
}

function updateMouseTargetIndicator(): void {
  if (!playerShip || isGameOver) {
    mouseTargetIndicator.visible = false;
    return;
  }
  
  // Get mouse position in world coordinates
  const mousePos = inputHandler.getMousePosition();
  
  // Convert screen coordinates to world coordinates
  const worldMousePos = {
    x: playerShip.x + (mousePos.x - app.screen.width / 2),
    y: playerShip.y + (mousePos.y - app.screen.height / 2)
  };
  
  // Update indicator position
  mouseTargetIndicator.x = worldMousePos.x;
  mouseTargetIndicator.y = worldMousePos.y;
  mouseTargetIndicator.visible = true;
}

function createEnemyIndicator(): void {
  // Clear previous graphics
  enemyIndicator.clear();
  
  // Draw arrow shape with reduced size and opacity
  enemyIndicator.beginFill(0xff0000, ENEMY_INDICATOR_OPACITY);
  
  // Arrow pointing up by default (will be rotated to point at enemy)
  // Reduced size by using ENEMY_INDICATOR_SIZE
  enemyIndicator.moveTo(0, -ENEMY_INDICATOR_SIZE); // Tip of the arrow
  enemyIndicator.lineTo(ENEMY_INDICATOR_SIZE * 0.6, ENEMY_INDICATOR_SIZE * 0.3); // Bottom right
  enemyIndicator.lineTo(0, 0); // Bottom middle indent
  enemyIndicator.lineTo(-ENEMY_INDICATOR_SIZE * 0.6, ENEMY_INDICATOR_SIZE * 0.3); // Bottom left
  enemyIndicator.lineTo(0, -ENEMY_INDICATOR_SIZE); // Back to tip
  
  enemyIndicator.endFill();
  
  // Remove the white border - arrow is now only red
}

function updateEnemyIndicator(): void {
  if (!playerShip || isGameOver) {
    enemyIndicator.visible = false;
    return;
  }
  
  // Find the nearest enemy ship
  const nearestEnemy = findNearestEnemyShip();
  
  if (nearestEnemy) {
    // Calculate angle to enemy
    const dx = nearestEnemy.x - playerShip.x;
    const dy = nearestEnemy.y - playerShip.y;
    const angleToEnemy = Math.atan2(dy, dx);
    
    // Position the indicator at a fixed distance from the player
    const indicatorX = playerShip.x + Math.cos(angleToEnemy) * ENEMY_INDICATOR_DISTANCE;
    const indicatorY = playerShip.y + Math.sin(angleToEnemy) * ENEMY_INDICATOR_DISTANCE;
    
    // Update indicator position and rotation
    enemyIndicator.x = indicatorX;
    enemyIndicator.y = indicatorY;
    enemyIndicator.rotation = angleToEnemy + Math.PI/2; // Add 90 degrees to point in the right direction
    enemyIndicator.visible = true;
  } else {
    // No enemies found, hide the indicator
    enemyIndicator.visible = false;
  }
}

function findNearestEnemyShip(): Ship | null {
  if (!playerShip) return null;
  
  const ships = networkManager.getAllShips();
  let nearestShip: Ship | null = null;
  let minDistance = Number.MAX_VALUE;
  
  for (const ship of ships) {
    // Skip player's own ship
    if (ship === playerShip) continue;
    
    // Skip destroyed ships
    if (ship.hull <= 0) continue;
    
    // Calculate distance
    const dx = ship.x - playerShip.x;
    const dy = ship.y - playerShip.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Update nearest ship if this one is closer
    if (distance < minDistance) {
      minDistance = distance;
      nearestShip = ship;
    }
  }
  
  return nearestShip;
}

function createColorPicker(): void {
  colorPickerContainer = new PIXI.Container();
  colorPickerContainer.visible = false;
  app.stage.addChild(colorPickerContainer as any);
  
  // Semi-transparent background
  const bg = new PIXI.Graphics();
  bg.beginFill(0x000000, 0.7);
  bg.drawRect(0, 0, 300, 150);
  bg.endFill();
  colorPickerContainer.addChild(bg as any);
  
  // Title text
  const title = new PIXI.Text('Choose Ship Color', {
    fontFamily: 'Arial',
    fontSize: 20,
    fill: 0xFFFFFF
  });
  title.position.set(150, 10);
  title.anchor.set(0.5, 0);
  colorPickerContainer.addChild(title as any);
  
  // Create color swatches
  const swatchSize = 30;
  const padding = 10;
  const startX = 20;
  const startY = 50;
  let currentX = startX;
  let currentY = startY;
  
  SHIP_COLORS.forEach((color, index) => {
    const swatch = new PIXI.Graphics();
    swatch.beginFill(color);
    swatch.drawRect(0, 0, swatchSize, swatchSize);
    swatch.endFill();
    swatch.position.set(currentX, currentY);
    swatch.interactive = true;
    swatch.cursor = 'pointer';
    
    // Add click handler
    swatch.on('pointerdown', () => {
      if (playerShip) {
        playerShip.updateColor(color);
        toggleColorPicker();
      }
    });
    
    colorPickerContainer.addChild(swatch as any);
    
    // Update position for next swatch
    currentX += swatchSize + padding;
    if (currentX > 250) {
      currentX = startX;
      currentY += swatchSize + padding;
    }
  });
  
  // Position the container in the center of the screen
  colorPickerContainer.position.set(
    app.screen.width / 2 - 150,
    app.screen.height / 2 - 75
  );
}

function toggleColorPicker(): void {
  colorPickerVisible = !colorPickerVisible;
  colorPickerContainer.visible = colorPickerVisible;
}

// Update the window resize handler
window.addEventListener('resize', () => {
  if (app) {
    // ... existing resize code ...
    
    // Update color picker position
    if (colorPickerContainer) {
      colorPickerContainer.position.set(
        app.screen.width / 2 - 150,
        app.screen.height / 2 - 75
      );
    }
    
    // Update notification position
    if (notificationText) {
      notificationText.position.set(app.screen.width / 2, 120);
    }
    
    // Update player list position - keep it in the top left
    if (playerListContainer) {
      playerListContainer.position.set(20, 100);
    }
    
    // Update player list toggle button position
    if (playerListToggleButton && playerListToggleText) {
      playerListToggleButton.position.set(20, 70);
      playerListToggleText.position.set(playerListToggleButton.x + 15, playerListToggleButton.y + 15);
    }
    
    // Update sync button position
    if (syncButton && syncButtonText) {
      syncButton.position.set(60, 70);
      syncButtonText.position.set(syncButton.x + 15, syncButton.y + 15);
    }
  }
});

// Modify showNotification function to be more visible
function showNotification(message: string, duration: number = 5000): void {
  console.log("NOTIFICATION: " + message); // Log notification for debugging
  
  // Clear any existing notification timeout
  if (notificationTimeout !== null) {
    clearTimeout(notificationTimeout);
  }
  
  // Show the notification
  notificationText.text = message;
  notificationText.alpha = 1;
  
  // Fade out after duration
  notificationTimeout = window.setTimeout(() => {
    // Fade out animation
    const fadeOut = () => {
      notificationText.alpha -= 0.02; // Slower fade
      if (notificationText.alpha > 0) {
        requestAnimationFrame(fadeOut);
      }
    };
    fadeOut();
  }, duration);
}

// Export getPlayerId for use in other modules
export { showNotification };

// Add togglePlayerList function
function togglePlayerList(): void {
  playerListVisible = !playerListVisible;
  playerListContainer.visible = playerListVisible;
}

// Update updatePlayerList function to make it more compact
function updatePlayerList(): void {
  const ships = networkManager.getAllShips();
  let listText = 'Players Online: ' + ships.length + '\n';
  
  ships.forEach(ship => {
    const isLocal = ship.id === networkManager.getPlayerId();
    // Truncate long names
    const displayName = ship.playerName.length > 12 ? 
      ship.playerName.substring(0, 10) + '...' : 
      ship.playerName;
    listText += `• ${displayName}${isLocal ? ' (You)' : ''}\n`;
  });
  
  playerListText.text = listText;
  
  // Resize background to fit text but keep it compact
  const padding = 20;
  const minWidth = 150;
  const width = Math.max(minWidth, playerListText.width + padding);
  playerListBackground.clear();
  playerListBackground.beginFill(0x000000, 0.6);
  playerListBackground.drawRect(0, 0, width, playerListText.height + padding);
  playerListBackground.endFill();
}

// Add createSyncButton function
function createSyncButton(uiContainer: PIXI.Container): void {
  // Create sync button
  syncButton = new PIXI.Graphics();
  syncButton.beginFill(0x333333);
  syncButton.drawRect(0, 0, 30, 30);
  syncButton.endFill();
  syncButton.position.set(60, 70); // Position it next to the player list toggle button
  syncButton.interactive = true;
  syncButton.cursor = 'pointer';
  uiContainer.addChild(syncButton as unknown as PIXI.DisplayObject);
  
  // Create sync button text
  syncButtonText = new PIXI.Text('S', {
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'bold',
    fill: 0xFFFFFF,
    align: 'center'
  });
  syncButtonText.anchor.set(0.5);
  syncButtonText.position.set(syncButton.x + 15, syncButton.y + 15);
  uiContainer.addChild(syncButtonText as unknown as PIXI.DisplayObject);
  
  // Add click event to sync button
  syncButton.on('pointerdown', () => {
    if (networkManager) {
      showNotification('Requesting game state synchronization...', 2000);
      networkManager.requestGameState();
    }
  });
} 