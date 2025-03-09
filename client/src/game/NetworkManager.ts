import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { Ship } from './Ship';

interface Player {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: string;
  hull: number;
}

interface GameState {
  players: { [id: string]: Player };
  self: string;
}

// Get server address from environment or use default
// This allows us to configure it for local network play
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

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

  constructor(gameContainer: PIXI.Container, serverUrl: string = SERVER_URL) {
    this.gameContainer = gameContainer;
    this.serverUrl = serverUrl;
    
    console.log(`Connecting to server at: ${this.serverUrl}`);
    
    // Connect to the server
    this.connectToServer();
  }

  private connectToServer(): void {
    console.log('Connecting to server...');
    this.connectionStatus = 'connecting';
    
    try {
      console.log(`Attempting to connect to: ${this.serverUrl}`);
      
      // Connect to the server with error handling
      this.socket = io(this.serverUrl, {
        reconnectionAttempts: this.maxReconnectAttempts,
        timeout: 10000,
        transports: ['websocket', 'polling'],
        forceNew: true
      });
      
      // Set up event listeners
      this.setupEventListeners();
    } catch (error) {
      console.error('Failed to initialize socket connection:', error);
      this.connectionStatus = 'disconnected';
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;
    
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to server!');
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
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
    
    // Game state events
    this.socket.on('gameState', (state: GameState) => {
      console.log('Received game state:', state);
      this.playerId = state.self;
      
      // Create ships for all players
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
    this.socket.on('playerLeft', (id: string) => {
      console.log('Player left:', id);
      const ship = this.players.get(id);
      if (ship) {
        ship.destroy();
        if (ship.sprite.parent) {
          ship.sprite.parent.removeChild(ship.sprite as any);
        }
        this.players.delete(id);
      }
    });
    
    // Handle ship damage
    this.socket.on('shipDamaged', (data: { id: string, hull: number }) => {
      console.log('Ship damaged:', data);
      const ship = this.players.get(data.id);
      if (ship) {
        // Update hull value
        ship.hull = data.hull;
        
        // Update ship appearance
        ship.updateDamageAppearance();
      }
    });
    
    // Handle ship destruction
    this.socket.on('shipDestroyed', (data: { id: string }) => {
      console.log('Ship destroyed:', data);
      const ship = this.players.get(data.id);
      if (ship) {
        // Destroy the ship
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
} 