import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { Ship } from './Ship';
import { Projectile, ProjectileType } from './Projectile';

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
}

interface ProjectileData {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: ProjectileType;
  sourceId: string;
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
  private heartbeatInterval: number | null = null;

  constructor(gameContainer: PIXI.Container, serverUrl: string = SERVER_URL) {
    this.gameContainer = gameContainer;
    this.serverUrl = serverUrl;
    
    // Try to get device ID from local storage
    this.deviceId = localStorage.getItem(DEVICE_ID_KEY);
    console.log('Device ID from storage:', this.deviceId);
    
    // Connect to the server
    this.connectToServer();
  }

  private connectToServer(): void {
    console.log('Connecting to server:', this.serverUrl);
    this.connectionStatus = 'connecting';
    
    try {
      // Connect to the server
      this.socket = io(this.serverUrl, {
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
      });
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start heartbeat to keep connection alive
      this.startHeartbeat();
    } catch (error) {
      console.error('Error connecting to server:', error);
      this.connectionStatus = 'disconnected';
    }
  }
  
  /**
   * Start sending heartbeat messages to the server
   */
  private startHeartbeat(): void {
    // Clear any existing heartbeat interval
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
    }
    
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket && this.connectionStatus === 'connected') {
        this.socket.emit('heartbeat');
        console.log('Heartbeat sent');
      }
    }, 30000);
  }

  private setupEventListeners(): void {
    if (!this.socket) return;
    
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to server!');
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      
      // Identify this device to the server
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
      console.log('Disconnected from server:', reason);
      this.connectionStatus = 'disconnected';
      
      // Clear other players
      this.players.forEach((ship, id) => {
        if (id !== this.playerId) {
          ship.destroy();
          if (ship.sprite.parent) {
            ship.sprite.parent.removeChild(ship.sprite as any);
          }
        }
      });
      this.players.clear();
      
      // Keep local player
      if (this.localPlayer) {
        this.players.set(this.playerId, this.localPlayer);
      }
    });
    
    // Handle forced disconnection (when another instance connects with the same device ID)
    this.socket.on('forceDisconnect', (data) => {
      console.warn('Forced disconnect:', data.reason);
      alert('Another game session was opened on this device. This session will be disconnected.');
      
      // Disconnect from the server
      this.socket?.disconnect();
      this.connectionStatus = 'disconnected';
      
      // Clear the game state
      this.players.forEach((ship, id) => {
        ship.destroy();
        if (ship.sprite.parent) {
          ship.sprite.parent.removeChild(ship.sprite as any);
        }
      });
      this.players.clear();
      this.localPlayer = null;
    });
    
    // Handle device ID assignment
    this.socket.on('deviceIdAssigned', (data) => {
      console.log('Device ID assigned:', data.deviceId);
      this.deviceId = data.deviceId;
      
      // Store the device ID in local storage
      localStorage.setItem(DEVICE_ID_KEY, data.deviceId);
    });
    
    // Game state events
    this.socket.on('gameState', (state: GameState) => {
      console.log('Received game state:', state);
      this.playerId = state.self;
      
      // Get the player's initial position from the server
      const playerData = state.players[this.playerId];
      if (playerData && this.localPlayer) {
        console.log('Setting initial player position:', playerData);
        
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
      }
      
      // Create ships for all other players
      Object.values(state.players).forEach(player => {
        if (player.id !== this.playerId) {
          this.addPlayer(player);
        }
      });
    });
    
    // Handle new player joining
    this.socket.on('playerJoined', (player: Player) => {
      console.log('Player joined:', player);
      this.addPlayer(player);
    });
    
    // Handle player movement
    this.socket.on('playerMoved', (data: { id: string, x: number, y: number, rotation: number }) => {
      const ship = this.players.get(data.id);
      if (ship) {
        ship.x = data.x;
        ship.y = data.y;
        ship.rotation = data.rotation;
      }
    });
    
    // Handle player leaving
    this.socket.on('playerLeft', (playerId: string) => {
      console.log('Player left:', playerId);
      
      const ship = this.players.get(playerId);
      if (ship) {
        // Remove ship sprite from the game
        if (ship.sprite.parent) {
          ship.sprite.parent.removeChild(ship.sprite as any);
        }
        
        // Remove ship from the players map
        this.players.delete(playerId);
      }
    });
    
    // Handle ship damage
    this.socket.on('shipDamaged', (data: { id: string, hull: number }) => {
      console.log('Ship damaged:', data);
      
      const ship = this.players.get(data.id);
      if (ship) {
        ship.hull = data.hull;
        ship.updateDamageAppearance();
      }
    });
    
    // Handle ship destruction
    this.socket.on('shipDestroyed', (data: { id: string }) => {
      console.log('Ship destroyed:', data);
      
      const ship = this.players.get(data.id);
      if (ship) {
        ship.hull = 0;
        ship.destroy();
      }
    });
    
    // Handle ship respawn
    this.socket.on('shipRespawned', (player: Player) => {
      console.log('Ship respawned:', player);
      
      const ship = this.players.get(player.id);
      if (ship) {
        // Update ship properties
        ship.x = player.x;
        ship.y = player.y;
        ship.hull = player.hull;
        ship.sprite.visible = true;
        
        // Reset ship appearance
        ship.updateDamageAppearance();
      }
    });
    
    // Handle respawn acceptance
    this.socket.on('respawnAccepted', (player: Player) => {
      console.log('Respawn accepted:', player);
      
      // Update local player with new position and type
      if (this.localPlayer) {
        this.localPlayer.x = player.x;
        this.localPlayer.y = player.y;
        this.localPlayer.rotation = player.rotation;
        this.localPlayer.hull = player.hull;
        this.localPlayer.maxHull = player.hull;
        
        // Update ship type if it changed
        if (this.localPlayer.type !== player.type) {
          this.localPlayer.type = player.type as ShipType;
          
          // Recreate sprite with new ship type
          if (this.localPlayer.sprite.parent) {
            this.localPlayer.sprite.parent.removeChild(this.localPlayer.sprite as any);
          }
          this.localPlayer.sprite = this.localPlayer.createShipSprite();
          this.gameContainer.addChild(this.localPlayer.sprite as any);
        }
        
        // Make ship visible again
        this.localPlayer.sprite.visible = true;
        
        // Reset appearance
        this.localPlayer.updateDamageAppearance();
        this.localPlayer.updateSpritePosition();
        
        // Reset spawn protection
        if (typeof this.localPlayer.resetSpawnProtection === 'function') {
          this.localPlayer.resetSpawnProtection();
        }
      }
    });
    
    // Handle projectile fired by other players
    this.socket.on('projectileFired', (projectileData: ProjectileData) => {
      console.log('Projectile fired by another player:', projectileData);
      this.handleProjectileFromServer(projectileData);
    });
  }
  
  /**
   * Identify this device to the server
   */
  private identifyDevice(): void {
    if (!this.socket || this.connectionStatus !== 'connected') {
      console.warn('Cannot identify device: not connected to server');
      return;
    }
    
    console.log('Identifying device with ID:', this.deviceId);
    this.socket.emit('identifyDevice', { deviceId: this.deviceId });
  }

  private addPlayer(player: Player): void {
    // Skip if player already exists
    if (this.players.has(player.id)) {
      return;
    }
    
    console.log('Adding player:', player);
    
    // Create a new ship for the player
    const ship = new Ship({
      x: player.x,
      y: player.y,
      rotation: player.rotation,
      speed: 0,
      maxSpeed: 5,
      acceleration: 0.1,
      rotationSpeed: 0.05,
      hull: player.hull,
      type: player.type as any,
      playerId: player.id
    });
    
    // Add the ship to the game container
    this.gameContainer.addChild(ship.sprite as any);
    
    // Add the ship to the players map
    this.players.set(player.id, ship);
    
    // Reset spawn protection for the new ship
    if (typeof ship.resetSpawnProtection === 'function') {
      ship.resetSpawnProtection();
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

  public cleanup(): void {
    // Stop heartbeat
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
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
   * @param targetId ID of the ship that was damaged
   * @param amount Amount of damage
   */
  public reportDamage(targetId: string, amount: number): void {
    if (this.socket && this.connectionStatus === 'connected') {
      this.socket.emit('damageShip', {
        targetId,
        amount
      });
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
    // Skip if we already have this projectile
    if (this.projectiles.has(projectileData.id)) {
      return;
    }
    
    // Create projectile
    const projectile = Projectile.deserialize(projectileData, this.players);
    
    if (projectile) {
      // Add to our map
      this.projectiles.set(projectile.id, projectile);
      
      // Call the callback if set
      if (this.onProjectileCreated) {
        this.onProjectileCreated(projectile);
      }
    }
  }
} 