import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { Ship, ThrottleSetting, RudderSetting } from './Ship';
import { Projectile, ProjectileType } from './Projectile';
import { showNotification, showDamageIndicator } from './Game';
import * as Logger from '../utils/Logger';

// Import ShipType from Ship.ts
type ShipType = 'destroyer' | 'cruiser' | 'battleship';

interface Player {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: ShipType;
  hull: number;
  deviceId?: string;
  name: string;
  color: number;
}

interface ProjectileData {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: ProjectileType;
  sourceId: string;
  spawnTimestamp: number;
}

interface GameState {
  players: { [id: string]: Player };
  self: string;
  projectiles: ProjectileData[];
}

// Get server address from environment or use default
// This allows us to configure it for local network play
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

// Local storage key for device ID
const DEVICE_ID_KEY = 'battleships_device_id';

// Add a function to get the local IP address for better debugging
function getLocalIPAddresses(): string[] {
  const ips: string[] = [];
  try {
    // This is a simple way to get the local IP - it won't work in all cases
    // but it's helpful for debugging
    const hostname = window.location.hostname;
    ips.push(hostname);
    
    // Also add localhost as a fallback
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      ips.push('localhost');
    }
  } catch (e) {
    console.error('Error getting local IP:', e);
  }
  return ips;
}

// Add PlayerConfig interface or reuse if already defined
interface PlayerConfig {
  name: string;
  color: number;
  type: string;
}

export class NetworkManager {
  private socket: Socket | null = null;
  private players: Map<string, Ship> = new Map();
  private gameContainer: PIXI.Container;
  private localPlayer: Ship | null = null;
  private playerId: string = '';
  private connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private serverUrl: string;
  private projectiles: Map<string, Projectile> = new Map();
  private onProjectileCreated: ((projectile: Projectile) => void) | null = null;
  private deviceId: string | null = null;
  private playerName: string = '';
  private playerConfig: PlayerConfig | null = null;
  private identificationTimeout: NodeJS.Timeout | null = null;

  constructor(gameContainer: PIXI.Container, serverUrl: string = SERVER_URL, playerConfig?: PlayerConfig) {
    this.gameContainer = gameContainer;
    
    // Store player configuration if provided
    if (playerConfig) {
      this.playerConfig = playerConfig;
      this.playerName = playerConfig.name;
    }
    
    // Use the getServerUrl function to ensure consistent server URL
    this.serverUrl = serverUrl;
    if (serverUrl === SERVER_URL) {
      // Only override if using the default
      this.serverUrl = this.getServerUrl();
    }
    
    // Try to get device ID from local storage
    this.deviceId = localStorage.getItem(DEVICE_ID_KEY);
    Logger.debug('Device ID from storage:', this.deviceId);
    
    // Get player name if not provided in config
    if (!this.playerName) {
      this.playerName = this.getPlayerName();
    }
    
    // Log connection details for debugging
    Logger.info(`Connecting to server at: ${this.serverUrl}`);
    Logger.info(`Player name: ${this.playerName}`);
    if (this.playerConfig) {
      Logger.info(`Ship type: ${this.playerConfig.type}`);
      Logger.info(`Ship color: ${this.playerConfig.color.toString(16)}`);
    }
    console.log(`Possible local IPs: ${getLocalIPAddresses().join(', ')}`);
    console.log(`If you're having connection issues, try these URLs in your browser:`);
    getLocalIPAddresses().forEach(ip => {
      console.log(`- http://${ip}:3001`);
    });
    
    // Clear any existing connections before connecting
    if (this.socket) {
      Logger.debug('Cleaning up existing socket connection before creating a new one');
      try {
        this.socket.disconnect();
        this.socket = null;
      } catch (error) {
        Logger.error('NetworkManager.constructor', error);
      }
    }
    
    // Connect to the server
    this.connectToServer();
  }

  private connectToServer(): void {
    try {
      Logger.debug(`Attempting to connect to server at ${this.serverUrl}...`);
      Logger.debug(`Using device ID: ${this.deviceId || 'none (will request new ID)'}`);
      Logger.debug(`Player name: ${this.playerName}`);
      
      // Create socket connection with better error handling and logging
      this.socket = io(this.serverUrl, {
        reconnectionAttempts: this.maxReconnectAttempts,
        timeout: 10000,
        transports: ['websocket', 'polling'],
        forceNew: true,
        auth: {
          deviceId: this.deviceId,
          playerName: this.playerName
        }
      });
      
      this.connectionStatus = 'connecting';
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start sending heartbeats once connected
      const heartbeatInterval = setInterval(() => {
        if (this.socket && this.socket.connected) {
          Logger.debug('Sending heartbeat to server');
          this.socket.emit('heartbeat');
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          Logger.info('Max reconnect attempts reached, clearing heartbeat interval');
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Send heartbeat every 30 seconds
      
      // Identify this device to the server once connected
      this.socket.on('connect', () => {
        Logger.info(`Socket connected with ID: ${this.socket?.id}`);
        Logger.debug(`Identifying device with ID: ${this.deviceId || 'none (will request new ID)'}`);
        
        // Clear any pending identification timeout
        if (this.identificationTimeout) {
          clearTimeout(this.identificationTimeout);
          this.identificationTimeout = null;
        }
        
        // Only identify device - don't request game state yet
        // Game state will be requested after identification is complete
        this.identifyDevice();
      });
    } catch (error) {
      Logger.error('NetworkManager.connectToServer', error);
      this.connectionStatus = 'disconnected';
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;
    
    // Connection events
    this.socket.on('connect', () => {
      Logger.info('Connected to server!');
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      
      // Log server URL for debugging
      Logger.debug(`Successfully connected to server at: ${this.serverUrl}`);
      Logger.debug(`Socket ID: ${this.socket?.id}`);
      
      // Store the server URL in localStorage so all clients use the same server
      localStorage.setItem('battleships_server_url', this.serverUrl);
    });
    
    // Handle device ID assignment from server
    this.socket.on('deviceIdAssigned', (data: { deviceId: string }) => {
      Logger.info('Received device ID from server:', data.deviceId);
      
      // Store the device ID in localStorage for future connections
      localStorage.setItem(DEVICE_ID_KEY, data.deviceId);
      
      // Update the local deviceId property
      this.deviceId = data.deviceId;
      
      Logger.debug('Device ID saved to localStorage');
      
      // Request game state after device identification is complete
      // But give a short delay to ensure server has processed everything
      setTimeout(() => {
        this.requestGameState();
      }, 300);
    });
    
    // Handle identification required event
    this.socket.on('identificationRequired', (data: { message: string }) => {
      console.log('Server requires identification:', data.message);
      
      // Re-identify the device
      this.identifyDevice();
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(`Max reconnection attempts reached (${this.maxReconnectAttempts}). Please check server status.`);
        console.error(`Server URL: ${this.serverUrl}`);
        console.error('Possible issues:');
        console.error('1. Server is not running');
        console.error('2. Firewall is blocking the connection');
        console.error('3. IP address is incorrect');
        console.error('4. Network issues');
        this.connectionStatus = 'disconnected';
      }
    });
    
    this.socket.on('disconnect', (reason) => {
      try {
        console.log('Disconnected from server:', reason);
        this.connectionStatus = 'disconnected';
        
        // Clear other players
        this.players.forEach((ship, id) => {
          if (id !== this.playerId) {
            try {
              // Remove name container if it exists
              if ((ship as any).nameContainer && (ship as any).nameContainer.parent) {
                (ship as any).nameContainer.parent.removeChild((ship as any).nameContainer as unknown as PIXI.DisplayObject);
              }
              
              // Remove ship sprite
              if (ship.sprite.parent) {
                ship.sprite.parent.removeChild(ship.sprite as unknown as PIXI.DisplayObject);
              }
              ship.destroy();
            } catch (innerError) {
              console.error(`Error cleaning up player ${id}:`, innerError);
            }
          }
        });
        this.players.clear();
        
        // Keep local player
        if (this.localPlayer) {
          this.players.set(this.playerId, this.localPlayer);
        }
      } catch (error) {
        console.error('Error handling disconnect event:', error);
      }
    });
    
    // Handle game state events
    this.socket.on('gameState', (state: GameState) => {
      console.log('Received game state:', state);
      this.playerId = state.self;
      
      // Log all players in the game state
      console.log('Players in game state:', Object.keys(state.players).length);
      Object.entries(state.players).forEach(([id, player]) => {
        console.log(`Player in state: ${player.name} (${id})${id === this.playerId ? ' - YOU' : ''}`);
      });
      
      // Get the player's initial position from the server
      const playerData = state.players[this.playerId];
      
      // Add more robust error handling for player data
      if (!playerData) {
        console.error('Error: Player data not found in game state for self:', this.playerId);
        console.error('Available players:', Object.keys(state.players));
        
        // Request a respawn to get a valid position
        if (this.socket && this.socket.connected) {
          console.log('Requesting respawn due to missing player data');
          this.socket.emit('requestRespawn');
        }
        return;
      }
      
      if (this.localPlayer) {
        console.log('Setting initial player position:', playerData);
        
        // Validate position data
        if (this.isValidPosition(playerData.x, playerData.y)) {
          // Update local player position and rotation
          this.localPlayer.x = playerData.x;
          this.localPlayer.y = playerData.y;
          this.localPlayer.rotation = playerData.rotation;
          
          // Update ship type if needed
          if (this.localPlayer.type !== playerData.type) {
            this.localPlayer.type = playerData.type as ShipType;
            
            // Recreate sprite with new ship type
            if (this.localPlayer.sprite.parent) {
              this.localPlayer.sprite.parent.removeChild(this.localPlayer.sprite as any);
            }
            this.localPlayer.sprite = this.localPlayer.createShipSprite();
            this.gameContainer.addChild(this.localPlayer.sprite as any);
          }
          
          // Update sprite position
          this.localPlayer.updateSpritePosition();
          
          // Reset spawn protection for initial spawn
          if (typeof this.localPlayer.resetSpawnProtection === 'function') {
            this.localPlayer.resetSpawnProtection();
          }
          
          console.log('Player position initialized successfully:', {
            x: this.localPlayer.x,
            y: this.localPlayer.y,
            rotation: this.localPlayer.rotation
          });
        } else {
          console.error('Received invalid position from server:', playerData);
          // Request a respawn to get a valid position
          this.socket?.emit('requestRespawn');
          
          // As a failsafe, set player to a reasonable default position
          this.localPlayer.x = 2500; // WORLD_SIZE / 2
          this.localPlayer.y = 2500; // WORLD_SIZE / 2
          this.localPlayer.updateSpritePosition();
          console.log('Set fallback position while waiting for respawn');
        }
      } else {
        console.error('Error: Local player not initialized when receiving game state');
      }
      
      // Create ships for all other players
      Object.values(state.players).forEach(player => {
        if (player.id !== this.playerId) {
          console.log(`Adding other player from game state: ${player.name} (${player.id})`);
          if (this.isValidPosition(player.x, player.y)) {
            this.addPlayer(player);
          } else {
            console.error('Received invalid position for other player:', player);
            // Still add the player but with a corrected position
            const correctedPlayer = {...player, x: 2500, y: 2500};
            this.addPlayer(correctedPlayer);
          }
        }
      });
      
      // After 1 second, check if all players are visible and properly positioned
      setTimeout(() => {
        this.verifyAllPlayersVisible();
      }, 1000);
    });
    
    // Handle new player joining
    this.socket.on('playerJoined', (player: Player) => {
      console.log('Player joined:', player);
      this.addPlayer(player);
      showNotification(`${player.name} joined the game!`);
    });
    
    // Handle player movement
    this.socket.on('playerMoved', (data: { id: string, x: number, y: number, rotation: number }) => {
      try {
        const ship = this.players.get(data.id);
        if (ship && this.isValidPosition(data.x, data.y)) {
          // Log position updates for debugging (only occasionally to avoid console spam)
          if (Math.random() < 0.05) { // Log only 5% of updates
            console.log(`Received position update for ${ship.playerName}: x=${Math.round(data.x)}, y=${Math.round(data.y)}, rot=${data.rotation.toFixed(2)}`);
          }
          
          // Update ship position and rotation
          ship.x = data.x;
          ship.y = data.y;
          ship.rotation = data.rotation;
          
          // Explicitly update sprite position
          ship.updateSpritePosition();
          
          // Ensure sprite is visible
          if (ship.sprite && !ship.sprite.visible && ship.sprite.parent) {
            console.log(`Making ${ship.playerName}'s ship visible again`);
            ship.sprite.visible = true;
          }
          
          // Ensure name container is visible
          if ((ship as any).nameContainer && !(ship as any).nameContainer.visible && (ship as any).nameContainer.parent) {
            console.log(`Making name container visible for player ${ship.playerName}`);
            (ship as any).nameContainer.visible = true;
          }
        } else {
          console.warn(`Received invalid position update for player: ${data.id}`);
          
          // Request game state to sync missing or invalid players
          if (this.socket && this.socket.connected) {
            console.log('Requesting game state to sync players');
            this.socket.emit('requestGameState');
          }
        }
      } catch (error) {
        console.error('Error handling player movement:', error);
      }
    });
    
    // Handle player leaving
    this.socket.on('playerLeft', (id: string) => {
      try {
        console.log('Player left:', id);
        const ship = this.players.get(id);
        if (ship) {
          showNotification(`${ship.playerName} left the game`);
          
          // Remove name container if it exists
          if ((ship as any).nameContainer && (ship as any).nameContainer.parent) {
            (ship as any).nameContainer.parent.removeChild((ship as any).nameContainer as unknown as PIXI.DisplayObject);
          }
          
          // Remove ship sprite
          if (ship.sprite.parent) {
            ship.sprite.parent.removeChild(ship.sprite as unknown as PIXI.DisplayObject);
          }
          ship.destroy();
          this.players.delete(id);
        }
      } catch (error) {
        console.error('Error handling player left event:', error);
      }
    });
    
    // Handle ship damage
    this.socket.on('shipDamaged', (data: { id: string, hull: number, sourceId: string, damage: number, timestamp: number }) => {
      try {
        Logger.info('NetworkManager', `Ship damaged event received from server: targetId=${data.id}, hull=${data.hull}, sourceId=${data.sourceId}, damage=${data.damage}`);
        
        // Find the target ship
        const targetShip = this.players.get(data.id);
        if (!targetShip) {
          Logger.warn('NetworkManager', `Received damage for unknown ship: ${data.id}`);
          // Request game state to sync players if we're missing someone
          this.requestGameState();
          return;
        }
        
        // Get the source ship (attacker)
        const sourceShip = this.players.get(data.sourceId);
        const sourceName = sourceShip ? sourceShip.playerName : 'Unknown ship';
        
        // Use the new setHull method to ensure proper update
        if (typeof targetShip.setHull === 'function') {
          // Use the setHull method that handles appearance updates
          targetShip.setHull(data.hull);
          Logger.info('NetworkManager', `Used setHull to update ${targetShip.playerName}'s hull to ${data.hull}`);
        } else {
          // Fallback to direct property update
          const oldHull = targetShip.hull;
          targetShip.hull = data.hull;
          Logger.info('NetworkManager', `Directly set ${targetShip.playerName}'s hull from ${oldHull} to ${data.hull}`);
          targetShip.updateDamageAppearance();
        }
        
        // Create damage effect
        targetShip.createCollisionEffect();
        
        // If this is the local player, ensure consistency
        if (data.id === this.playerId && this.localPlayer) {
          if (typeof this.localPlayer.setHull === 'function') {
            this.localPlayer.setHull(data.hull);
          } else {
            this.localPlayer.hull = data.hull;
            this.localPlayer.updateDamageAppearance();
          }
          
          // Show damage indicator
          showDamageIndicator();
        }
        
        // Show notification if it's the local player being hit
        if (data.id === this.playerId) {
          showNotification(`You were hit by ${sourceName} for ${data.damage} damage! Hull: ${data.hull}`, 2000);
        }
        
        // Show notification if the local player did the damage
        else if (data.sourceId === this.playerId) {
          showNotification(`Hit ${targetShip.playerName} for ${data.damage} damage! Enemy hull: ${data.hull}`, 2000);
        }
      } catch (error) {
        Logger.error('NetworkManager.shipDamaged', error);
      }
    });
    
    // Handle ship hit notifications (used for visual effects only, not hull update)
    this.socket.on('shipHit', (data: { id: string, sourceId: string, damage: number, timestamp: number }) => {
      try {
        // Find the target ship
        const targetShip = this.players.get(data.id);
        if (!targetShip) {
          Logger.warn('NetworkManager', `Received hit notification for unknown ship: ${data.id}`);
          return;
        }
        
        // Find the source ship
        const sourceShip = this.players.get(data.sourceId);
        const sourceName = sourceShip ? sourceShip.playerName : 'Unknown ship';
        
        Logger.info('NetworkManager', `Ship hit notification: ${sourceName} hit ${targetShip.playerName} for ${data.damage} damage`);
        
        // Only create visual effects - we don't modify hull here
        // as it should already be handled by direct player updates
        targetShip.createCollisionEffect();
        
        // The actual hull update should come through the standard playerUpdate system
        // directly from the target player client
      } catch (error) {
        Logger.error('NetworkManager.shipHit', error);
      }
    });
    
    // Handle damage confirmation (received by the attacker)
    this.socket.on('damageConfirmed', (data: { targetId: string, newHull: number, damage: number, timestamp: number }) => {
      try {
        // Find the target ship
        const targetShip = this.players.get(data.targetId);
        if (!targetShip) {
          Logger.warn('NetworkManager', `Received damage confirmation for unknown ship: ${data.targetId}`);
          return;
        }
        
        Logger.info('NetworkManager', `Damage confirmation received for ${targetShip.playerName}: hull=${data.newHull}, damage=${data.damage}`);
        
        // Ensure our local representation matches the server
        if (targetShip.hull !== data.newHull) {
          Logger.info('NetworkManager', `Correcting hull value for ${targetShip.playerName} from ${targetShip.hull} to ${data.newHull}`);
          targetShip.hull = data.newHull;
          targetShip.updateDamageAppearance();
        }
      } catch (error) {
        Logger.error('NetworkManager.damageConfirmed', error);
      }
    });
    
    // Handle ship destroyed
    this.socket.on('shipDestroyed', (data: { id: string, destroyedBy: string, destroyerName: string }) => {
      try {
        Logger.info('NetworkManager', `Ship destroyed event received: ${data.id}`);
        const ship = this.players.get(data.id);
        if (ship) {
          // Set hull to 0 and destroy the ship
          ship.hull = 0;
          
          // Call destroy to properly handle ship destruction
          ship.destroy();
          
          // Create a bigger explosion effect after destroy
          ship.createExplosionEffect(3.0);
          
          // Show notification based on who was destroyed
          if (data.id === this.playerId) {
            showNotification(`You were destroyed by ${data.destroyerName}!`, 5000);
          } else if (data.destroyedBy === this.playerId) {
            showNotification(`You destroyed ${ship.playerName}!`, 5000);
          } else {
            showNotification(`${ship.playerName} was destroyed by ${data.destroyerName}`, 3000);
          }
        } else {
          Logger.warn('NetworkManager', `Received destroyed event for unknown ship: ${data.id}`);
        }
      } catch (error) {
        Logger.error('NetworkManager.shipDestroyed', error);
      }
    });
    
    // Handle ship respawn
    this.socket.on('shipRespawned', (player: Player) => {
      console.log('Ship respawned:', player);
      const ship = this.players.get(player.id);
      if (ship) {
        showNotification(`${ship.playerName}'s ship has respawned`);
        // Update ship properties
        ship.x = player.x;
        ship.y = player.y;
        ship.hull = player.hull;
        
        // Check if sprite exists before accessing its properties
        if (ship.sprite) {
          ship.sprite.visible = true;
        } else {
          Logger.warn('NetworkManager', `Cannot set ship.sprite.visible: sprite is null for ${ship.playerName}`);
          // Recreate sprite if it doesn't exist
          ship.sprite = ship.createShipSprite();
          if (this.gameContainer) {
            this.gameContainer.addChild(ship.sprite as unknown as PIXI.DisplayObject);
            Logger.info('NetworkManager', `Recreated sprite for respawned ship: ${ship.playerName}`);
          }
        }
        
        // Reset ship appearance
        ship.updateDamageAppearance();
      }
    });
    
    // Handle respawn acceptance
    this.socket.on('respawnAccepted', (player: Player) => {
      console.log('Respawn accepted:', player);
      
      // Update local player with new position and type
      if (this.localPlayer) {
        // Update position and rotation
        this.localPlayer.x = player.x;
        this.localPlayer.y = player.y;
        this.localPlayer.rotation = player.rotation;
        this.localPlayer.hull = player.hull;
        this.localPlayer.maxHull = player.hull;
        
        // Reset movement properties
        this.localPlayer.speed = 0;
        this.localPlayer.setThrottle(ThrottleSetting.STOP);
        this.localPlayer.setRudder(RudderSetting.AHEAD);
        
        // Update ship type if it changed
        if (this.localPlayer.type !== player.type) {
          this.localPlayer.type = player.type as ShipType;
          // If type changed, sprite should be recreated
          this.localPlayer.recreateShipSprite();
          
          if (this.localPlayer.sprite && !this.localPlayer.sprite.parent) {
            // If the sprite exists but isn't in the scene, add it
            this.gameContainer.addChild(this.localPlayer.sprite as unknown as PIXI.DisplayObject);
          }
        }
        
        // Make sure to update the sprite position to match the new server position
        this.localPlayer.updateSpritePosition();
        
        // Ensure the ship is visible
        if (this.localPlayer.sprite) {
          this.localPlayer.sprite.visible = true;
        }
        
        // Show notification
        showNotification('Ship respawned!', 3000);
        
        // Log respawn details
        Logger.info('NetworkManager', `Player respawned at position (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`);
      } else {
        Logger.error('NetworkManager', 'Received respawnAccepted but localPlayer is null');
      }
    });
    
    // Handle projectile fired by other players
    this.socket.on('projectileFired', (projectileData: ProjectileData) => {
      try {
        // Skip our own projectiles that we already have locally
        if (projectileData.sourceId === this.playerId) {
          Logger.debug('NetworkManager', `Ignoring our own projectile broadcast: ${projectileData.id}`);
          return;
        }
        
        Logger.info('NetworkManager', `Received projectile from another player: ${projectileData.id}, type: ${projectileData.type}`);
        
        // Make sure we process this projectile immediately
        this.handleProjectileFromServer(projectileData);
      } catch (error) {
        Logger.error('NetworkManager.projectileFired', error);
      }
    });

    // Handle force disconnect (e.g., when kicked by admin)
    this.socket.on('forceDisconnect', (data: { reason: string }) => {
      console.warn(`Force disconnect received: ${data.reason}`);
      
      // Show notification to the player
      if (typeof showNotification === 'function') {
        showNotification(`Disconnected: ${data.reason}`, 10000);
      }
      
      // Disconnect the socket
      this.socket?.disconnect();
      
      // Update connection status
      this.connectionStatus = 'disconnected';
      
      // Display a more prominent message
      alert(`You have been disconnected from the server.\nReason: ${data.reason}`);
      
      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    });

    // Handle player update
    this.socket.on('playerUpdate', (data: {
      id: string, 
      x: number, 
      y: number, 
      rotation: number, 
      type?: ShipType,
      hull?: number,
      color?: number
    }) => {
      try {
        const ship = this.players.get(data.id);
        if (ship) {
          // Update position
          ship.x = data.x;
          ship.y = data.y;
          ship.rotation = data.rotation;
          
          // Check if sprite needs to be recreated (if it was destroyed)
          if (ship.sprite === null) {
            Logger.info('NetworkManager', `Recreating sprite for player ${ship.playerName} during playerUpdate`);
            ship.recreateShipSprite();
            this.gameContainer.addChild(ship.sprite as unknown as PIXI.DisplayObject);
            
            // Add name container back to game world
            if ((ship as any).nameContainer) {
              this.gameContainer.addChild((ship as any).nameContainer as unknown as PIXI.DisplayObject);
            }
          }
          
          // Update hull if provided using setHull method for better consistency
          if (typeof data.hull === 'number') {
            if (typeof ship.setHull === 'function') {
              ship.setHull(data.hull);
              Logger.debug('NetworkManager', `Updated ${ship.playerName}'s hull to ${data.hull} via playerUpdate`);
            } else {
              // If setHull is not available, fall back to direct update
              ship.hull = data.hull;
              ship.updateDamageAppearance();
              Logger.debug('NetworkManager', `Set ${ship.playerName}'s hull to ${data.hull} directly via playerUpdate`);
            }
          }
          
          // Update type if provided and different
          if (data.type && ship.type !== data.type) {
            ship.type = data.type;
            
            // Recreate sprite with new ship type
            if (ship.sprite.parent) {
              ship.sprite.parent.removeChild(ship.sprite as any);
            }
            ship.sprite = ship.createShipSprite();
            this.gameContainer.addChild(ship.sprite as any);
          }
          
          // Update color if provided
          if (typeof data.color === 'number' && ship.color !== data.color) {
            Logger.info('NetworkManager', `Updating ship color for ${ship.playerName}: ${ship.color} -> ${data.color}`);
            ship.updateColor(data.color);
          }
          
          // Update sprite position
          ship.updateSpritePosition();
          
          // Handle our own player specially to ensure consistency
          if (data.id === this.playerId && this.localPlayer) {
            // Important: Apply all updates from server to local player to keep in sync
            if (typeof data.hull === 'number') {
              if (typeof this.localPlayer.setHull === 'function') {
                this.localPlayer.setHull(data.hull);
              } else {
                this.localPlayer.hull = data.hull;
                this.localPlayer.updateDamageAppearance();
              }
            }
          }
        } else {
          // If we don't have this player, request game state
          Logger.warn('NetworkManager', `Received update for unknown player: ${data.id}`);
          this.requestGameState();
        }
      } catch (error) {
        Logger.error('NetworkManager.playerUpdate', error);
      }
    });
  }

  private addPlayer(player: Player): void {
    try {
      // Skip if player already exists
      if (this.players.has(player.id)) {
        console.log(`Player ${player.name} (${player.id}) already exists, updating position`);
        
        // Update existing player's position
        const existingShip = this.players.get(player.id);
        if (existingShip) {
          existingShip.x = player.x;
          existingShip.y = player.y;
          existingShip.rotation = player.rotation;
          existingShip.hull = player.hull;
          
          // Ensure ship has valid state (position, sprite, etc.)
          existingShip.ensureValidState();
          
          // Update damage appearance based on hull value
          existingShip.updateDamageAppearance();
          
          // Update color if provided
          if (typeof player.color === 'number' && existingShip.color !== player.color) {
            Logger.info('NetworkManager', `Updating ship color for ${existingShip.playerName}: ${existingShip.color} -> ${player.color}`);
            existingShip.updateColor(player.color);
          }
        }
        
        return;
      }
      
      console.log('Adding player:', {
        id: player.id,
        name: player.name,
        position: { x: player.x, y: player.y },
        type: player.type
      });
      
      // Create ship object with safety checks for position
      const worldSize = 5000; // Should match WORLD_SIZE from Game.ts
      const safeX = this.isValidPosition(player.x, player.y) ? player.x : worldSize / 2;
      const safeY = this.isValidPosition(player.x, player.y) ? player.y : worldSize / 2;
      
      const ship = new Ship({
        x: safeX,
        y: safeY,
        rotation: player.rotation,
        speed: 0,
        maxSpeed: 2,
        acceleration: 0.05,
        rotationSpeed: 0.04,
        hull: player.hull || 100,
        type: player.type as ShipType,
        playerId: player.id,
        playerName: player.name || `Player ${player.id}`
      });
      
      // Ensure ship has valid state
      ship.ensureValidState();
      
      // Update ship color if provided by the server
      if (typeof player.color === 'number') {
        Logger.info('NetworkManager', `Setting ship color for ${player.name} to ${player.color}`);
        ship.updateColor(player.color);
      }
      
      // Add the ship to the game container
      this.gameContainer.addChild(ship.sprite as unknown as PIXI.DisplayObject);
      console.log(`Added ship sprite for ${player.name} to game container`);
      
      // Add the name container to the game container
      if ((ship as any).nameContainer) {
        this.gameContainer.addChild((ship as any).nameContainer as unknown as PIXI.DisplayObject);
        console.log(`Added name container for ${player.name} to game container`);
      } else {
        console.warn(`Name container not found for player ${player.name}`);
      }
      
      // Add the ship to the players map
      this.players.set(player.id, ship);
      
      // Log current players in game
      console.log('Current players in game:', Array.from(this.players.entries()).map(([id, ship]) => ({
        id,
        name: ship.playerName,
        isLocal: id === this.playerId
      })));
      
      // Reset spawn protection for the new ship
      if (typeof ship.resetSpawnProtection === 'function') {
        ship.resetSpawnProtection();
      }
    } catch (error) {
      console.error('Error adding player:', error);
    }
  }

  public setLocalPlayer(ship: Ship): void {
    this.localPlayer = ship;
    
    if (this.playerId) {
      this.players.set(this.playerId, ship);
    }
  }

  public updatePosition(): void {
    if (this.localPlayer && this.socket && this.connectionStatus === 'connected') {
      // Send position update to the server
      this.socket.emit('updatePosition', {
        x: this.localPlayer.x,
        y: this.localPlayer.y,
        rotation: this.localPlayer.rotation
      });
    }
  }

  public isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  public getConnectionStatus(): string {
    return this.connectionStatus;
  }

  /**
   * Get the current player ID
   */
  public getPlayerId(): string {
    return this.playerId;
  }

  public cleanup(): void {
    // Disconnect from the server
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  /**
   * Get all ships in the game, including the local player
   * @returns Array of all ships
   */
  public getAllShips(): Ship[] {
    // Make sure the local player is in the players map
    if (this.localPlayer && !this.players.has('local')) {
      this.players.set('local', this.localPlayer);
    }
    
    return Array.from(this.players.values());
  }
  
  /**
   * Get a specific ship by player ID
   * @param id Player ID
   * @returns Ship or undefined if not found
   */
  public getShipById(id: string): Ship | undefined {
    return this.players.get(id);
  }
  
  /**
   * Report damage to the server
   * @param targetId ID of the ship that was hit
   * @param amount Amount of damage
   */
  public reportDamage(targetId: string, amount: number): void {
    try {
      if (!this.socket) {
        Logger.error('NetworkManager', 'Cannot report damage: socket is null');
        return;
      }
      
      if (this.connectionStatus !== 'connected') {
        Logger.error('NetworkManager', `Cannot report damage: not connected to server (status: ${this.connectionStatus})`);
        return;
      }
      
      if (!targetId) {
        Logger.error('NetworkManager', `Cannot report damage: invalid targetId: ${targetId}`);
        return;
      }
      
      if (!amount || amount <= 0) {
        Logger.error('NetworkManager', `Cannot report damage: invalid amount: ${amount}`);
        return;
      }
      
      // Get target ship for logging purposes
      const targetShip = this.players.get(targetId);
      const targetName = targetShip ? targetShip.playerName : 'unknown';
      
      Logger.info('NetworkManager', `Sending damage report to server: targetId=${targetId} (${targetName}), amount=${amount}`);
      
      // Add source ID explicitly to make debugging easier
      const damageData = {
        targetId,
        amount,
        sourceId: this.playerId // Include source ID explicitly to help with debugging
      };
      
      // Send the damage report to the server
      this.socket.emit('damageShip', damageData);
      
      Logger.debug('NetworkManager', `Damage report sent. Waiting for server confirmation.`);
    } catch (error) {
      Logger.error('NetworkManager.reportDamage', error);
    }
  }

  /**
   * Request respawn from the server
   */
  public requestRespawn(): void {
    if (this.socket && this.connectionStatus === 'connected') {
      console.log('Requesting respawn from server');
      this.socket.emit('requestRespawn');
    } else {
      console.warn('Cannot request respawn: not connected to server');
    }
  }

  // Set callback for projectile creation
  public setProjectileCallback(callback: (projectile: Projectile) => void): void {
    this.onProjectileCreated = callback;
  }
  
  // Report projectile fired to server
  public reportProjectileFired(projectile: Projectile): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('Cannot report projectile: not connected to server');
      return;
    }
    
    this.socket.emit('projectileFired', projectile.serialize());
  }
  
  // Handle projectile from server
  private handleProjectileFromServer(projectileData: ProjectileData): void {
    try {
      // Skip if we already have this projectile
      if (this.projectiles.has(projectileData.id)) {
        Logger.debug('NetworkManager', `Skipping duplicate projectile: ${projectileData.id}`);
        return;
      }
      
      Logger.info('NetworkManager', `Handling projectile from server: ${projectileData.id}, type: ${projectileData.type}, sourceId: ${projectileData.sourceId}`);
      
      // Check if source ship exists
      const sourceShip = this.players.get(projectileData.sourceId);
      if (!sourceShip) {
        Logger.warn('NetworkManager', `Source ship not found for projectile: ${projectileData.sourceId}`);
        // We'll continue anyway and let the deserialize method handle this
      }
      
      // Create projectile
      const projectile = Projectile.deserialize(projectileData);
      
      if (projectile) {
        // Add to our map
        this.projectiles.set(projectile.id, projectile);
        
        // Call the callback if set
        if (this.onProjectileCreated) {
          Logger.debug('NetworkManager', `Calling projectile creation callback for: ${projectile.id}`);
          this.onProjectileCreated(projectile);
        } else {
          Logger.error('NetworkManager', 'Projectile creation callback is not set!');
        }
      } else {
        Logger.error('NetworkManager', `Failed to deserialize projectile: ${JSON.stringify(projectileData)}`);
      }
    } catch (error) {
      Logger.error('NetworkManager.handleProjectileFromServer', error);
    }
  }

  /**
   * Get player name from prompt or localStorage
   */
  private getPlayerName(): string {
    const storedName = localStorage.getItem('playerName');
    if (storedName) {
      return storedName;
    }

    let name = '';
    while (!name) {
      name = prompt('Enter your name:') || '';
      if (name) {
        localStorage.setItem('playerName', name);
      }
    }
    return name;
  }

  /**
   * Identify this device to the server
   */
  private identifyDevice(): void {
    if (!this.socket || !this.socket.connected) {
      console.error('Cannot identify device: socket not connected');
      return;
    }
    
    console.log('Identifying device to server...');
    
    // Prepare identification data
    const identificationData: any = {
      deviceId: this.deviceId,
      playerName: this.playerName
    };
    
    // Add ship configuration if available
    if (this.playerConfig) {
      identificationData.color = this.playerConfig.color;
      identificationData.type = this.playerConfig.type;
    }
    
    // Send device ID and player configuration to server
    this.socket.emit('identifyDevice', identificationData);
    
    // Don't automatically request game state - wait for deviceIdAssigned event
  }

  /**
   * Request the current game state from the server
   * This can be used to resynchronize when players are missing
   */
  public requestGameState(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestGameState');
    }
  }

  /**
   * Get the server URL, preferring the one from localStorage if available
   * This ensures all clients on the same device connect to the same server
   */
  private getServerUrl(): string {
    // First try localStorage
    const savedUrl = localStorage.getItem('battleships_server_url');
    if (savedUrl) {
      return savedUrl;
    }
    
    // Then try environment variable
    if (process.env.REACT_APP_SERVER_URL) {
      return process.env.REACT_APP_SERVER_URL;
    }
    
    // Finally fall back to default
    return 'http://localhost:3001';
  }

  private isValidPosition(x: number, y: number): boolean {
    // Check for NaN, undefined, null, Infinity
    if (x === undefined || y === undefined || x === null || y === null ||
        Number.isNaN(x) || Number.isNaN(y) ||
        !Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }
    
    // Check if position is within reasonable world boundaries
    // Using 5000 as the world size with a small margin
    const worldSize = 5000;
    const margin = 100;
    return x >= margin && x <= worldSize - margin && y >= margin && y <= worldSize - margin;
  }

  /**
   * Send player update to server
   */
  public sendPlayerUpdate(additionalData: any = {}): void {
    try {
      if (!this.socket) {
        Logger.warn('NetworkManager', 'Cannot send update: socket is null');
        return;
      }
      
      if (this.connectionStatus !== 'connected') {
        Logger.warn('NetworkManager', `Cannot send update: not connected to server (status: ${this.connectionStatus})`);
        return;
      }

      if (!this.localPlayer) {
        Logger.error('NetworkManager', 'Local player is null or undefined');
        return;
      }
      
      // Build update data
      const updateData = {
        x: this.localPlayer.x,
        y: this.localPlayer.y,
        rotation: this.localPlayer.rotation,
        type: this.localPlayer.type,
        hull: this.localPlayer.hull,
        color: this.localPlayer.color,
        ...additionalData
      };
      
      // Send update
      this.socket.emit('playerUpdate', updateData);
    } catch (error) {
      Logger.error('NetworkManager.sendPlayerUpdate', error);
    }
  }

  /**
   * Update player position, rotation, etc.
   */
  private updatePlayer(data: any): void {
    try {
      // Check if we have this player
      if (this.players.has(data.id)) {
        const ship = this.players.get(data.id);
        
        if (ship) {
          // Update ship attributes
          ship.x = data.x;
          ship.y = data.y;
          ship.rotation = data.rotation;
          
          // Update hull if provided
          if (typeof data.hull === 'number') {
            if (typeof ship.setHull === 'function') {
              ship.setHull(data.hull);
            } else {
              ship.hull = data.hull;
              ship.updateDamageAppearance();
            }
          }
          
          // Check if sprite needs to be recreated (if it was destroyed)
          if (ship.sprite === null) {
            Logger.info('NetworkManager', `Recreating sprite for player ${ship.playerName} during update`);
            ship.recreateShipSprite();
            this.gameContainer.addChild(ship.sprite as unknown as PIXI.DisplayObject);
            
            // Add name container back to game world
            if ((ship as any).nameContainer) {
              this.gameContainer.addChild((ship as any).nameContainer as unknown as PIXI.DisplayObject);
            }
          }
          
          // Update color if provided
          if (typeof data.color === 'number' && ship.color !== data.color) {
            Logger.info('NetworkManager', `Updating ship color for ${ship.playerName}: ${ship.color} -> ${data.color}`);
            ship.updateColor(data.color);
          }
          
          // Update sprite position
          ship.updateSpritePosition();
          
          // Handle our own player specially to ensure consistency
          if (data.id === this.playerId && this.localPlayer) {
            // Important: Apply all updates from server to local player to keep in sync
            if (typeof data.hull === 'number') {
              if (typeof this.localPlayer.setHull === 'function') {
                this.localPlayer.setHull(data.hull);
              } else {
                this.localPlayer.hull = data.hull;
                this.localPlayer.updateDamageAppearance();
              }
            }
          }
        } else {
          // If we don't have this player, request game state
          Logger.warn('NetworkManager', `Received update for unknown player: ${data.id}`);
          this.requestGameState();
        }
      } else {
        // If we don't have this player, request game state
        Logger.warn('NetworkManager', `Received update for unknown player: ${data.id}`);
        this.requestGameState();
      }
    } catch (error) {
      Logger.error('NetworkManager.updatePlayer', error);
    }
  }

  // Add a new method to verify all players are visible and have valid positions
  private verifyAllPlayersVisible(): void {
    let missingPlayers = false;
    
    // Check all players
    this.players.forEach((ship, id) => {
      // Check if sprite exists and is in the scene
      if (!ship.sprite || !ship.sprite.parent) {
        console.warn(`Player ${ship.playerName} (${id}) has no sprite or it's not in the scene`);
        
        // Recreate the sprite
        try {
          console.log(`Recreating sprite for player ${ship.playerName}`);
          ship.recreateShipSprite();
          this.gameContainer.addChild(ship.sprite as any);
        } catch (error) {
          console.error(`Failed to recreate sprite for player ${ship.playerName}:`, error);
        }
        
        missingPlayers = true;
      }
      
      // Check for valid position
      if (!this.isValidPosition(ship.x, ship.y)) {
        console.warn(`Player ${ship.playerName} (${id}) has invalid position: (${ship.x}, ${ship.y})`);
        
        // Set a valid position as a fallback
        ship.x = 2500; // WORLD_SIZE / 2
        ship.y = 2500; // WORLD_SIZE / 2
        ship.updateSpritePosition();
        
        missingPlayers = true;
      }
    });
    
    // If any issues were found, request a game state refresh
    if (missingPlayers && this.socket && this.socket.connected) {
      console.log('Some players had issues - requesting game state refresh');
      this.requestGameState();
    } else {
      console.log('All players are properly visible and positioned');
    }
  }
} 