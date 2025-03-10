import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { Ship } from './Ship';
import { Projectile, ProjectileType } from './Projectile';
import { showNotification } from './Game';

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

  constructor(gameContainer: PIXI.Container, serverUrl: string = SERVER_URL) {
    this.gameContainer = gameContainer;
    
    // Use the getServerUrl function to ensure consistent server URL
    this.serverUrl = serverUrl;
    if (serverUrl === SERVER_URL) {
      // Only override if using the default
      this.serverUrl = this.getServerUrl();
    }
    
    // Try to get device ID from local storage
    this.deviceId = localStorage.getItem(DEVICE_ID_KEY);
    console.log('Device ID from storage:', this.deviceId);
    
    // Get player name
    this.playerName = this.getPlayerName();
    
    // Log connection details for debugging
    console.log(`Connecting to server at: ${this.serverUrl}`);
    console.log(`Possible local IPs: ${getLocalIPAddresses().join(', ')}`);
    console.log(`If you're having connection issues, try these URLs in your browser:`);
    getLocalIPAddresses().forEach(ip => {
      console.log(`- http://${ip}:3001`);
    });
    
    // Connect to the server
    this.connectToServer();
  }

  private connectToServer(): void {
    try {
      console.log(`Attempting to connect to server at ${this.serverUrl}...`);
      
      // Create socket connection with better error handling and logging
      this.socket = io(this.serverUrl, {
        reconnectionAttempts: this.maxReconnectAttempts,
        timeout: 10000,
        transports: ['websocket', 'polling'],
        forceNew: true
      });
      
      this.connectionStatus = 'connecting';
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start sending heartbeats once connected
      const heartbeatInterval = setInterval(() => {
        if (this.socket && this.socket.connected) {
          console.log('Sending heartbeat to server');
          this.socket.emit('heartbeat');
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.log('Max reconnect attempts reached, clearing heartbeat interval');
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Send heartbeat every 30 seconds
      
      // Identify this device to the server once connected
      this.socket.on('connect', () => {
        console.log(`Socket connected with ID: ${this.socket?.id}`);
        this.identifyDevice();
      });
    } catch (error) {
      console.error('Error connecting to server:', error);
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
      
      // Log server URL for debugging
      console.log(`Successfully connected to server at: ${this.serverUrl}`);
      console.log(`Socket ID: ${this.socket?.id}`);
      
      // Store the server URL in localStorage so all clients use the same server
      localStorage.setItem('battleships_server_url', this.serverUrl);
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
          console.log(`Adding other player from game state: ${player.name} (${player.id})`);
          this.addPlayer(player);
        }
      });
      
      // Debug: Check if players are visible in the game world
      setTimeout(() => {
        console.log('DEBUG: Checking player visibility after 1 second');
        this.players.forEach((ship, id) => {
          const isVisible = ship.sprite.visible;
          const hasParent = !!ship.sprite.parent;
          const position = { x: ship.x, y: ship.y };
          const isLocal = id === this.playerId;
          
          console.log(`Player ${ship.playerName} (${id}): visible=${isVisible}, hasParent=${hasParent}, position=${JSON.stringify(position)}, isLocal=${isLocal}`);
          
          // Check name container
          if ((ship as any).nameContainer) {
            const nameVisible = (ship as any).nameContainer.visible;
            const nameHasParent = !!(ship as any).nameContainer.parent;
            console.log(`- Name container: visible=${nameVisible}, hasParent=${nameHasParent}`);
          } else {
            console.log(`- No name container found`);
          }
        });
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
      const ship = this.players.get(data.id);
      if (ship) {
        // Log position updates for debugging
        console.log(`Received position update for ${ship.playerName}: x=${Math.round(data.x)}, y=${Math.round(data.y)}, rot=${data.rotation.toFixed(2)}`);
        
        // Update ship position and rotation
        ship.x = data.x;
        ship.y = data.y;
        ship.rotation = data.rotation;
        
        // Explicitly update sprite position
        ship.updateSpritePosition();
      } else {
        console.warn(`Received position update for unknown player: ${data.id}`);
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
    this.socket.on('shipDamaged', (data: { id: string, hull: number }) => {
      try {
        console.log('Ship damaged event received from server:', data);
        const ship = this.players.get(data.id);
        if (ship) {
          console.log(`Applying damage to ship ${ship.playerName} (${data.id}): hull=${ship.hull} -> ${data.hull}`);
          
          // Update hull value
          ship.hull = data.hull;
          
          // Create damage effect
          ship.createCollisionEffect();
          
          // Update ship appearance
          ship.updateDamageAppearance();
          
          // Show notification if it's the local player
          if (data.id === this.playerId) {
            showNotification(`Your ship was hit! Hull: ${data.hull}`, 2000);
          }
        } else {
          console.warn(`Received damage for unknown ship: ${data.id}`);
        }
      } catch (error) {
        console.error('Error handling shipDamaged event:', error);
      }
    });
    
    // Handle ship destruction
    this.socket.on('shipDestroyed', (data: { id: string }) => {
      try {
        console.log('Ship destroyed event received from server:', data);
        const ship = this.players.get(data.id);
        if (ship) {
          // Show different notifications based on whether it's the local player or not
          if (data.id === this.playerId) {
            showNotification(`Your ship was destroyed!`, 5000);
            // Game over handling is done elsewhere
          } else {
            showNotification(`${ship.playerName}'s ship was destroyed!`, 3000);
          }
          
          // Create explosion effect and destroy the ship
          ship.createExplosionEffect();
          ship.destroy();
          
          // Remove from players map if it's not the local player
          if (data.id !== this.playerId) {
            this.players.delete(data.id);
          }
        } else {
          console.warn(`Received destruction event for unknown ship: ${data.id}`);
        }
      } catch (error) {
        console.error('Error handling shipDestroyed event:', error);
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

  private addPlayer(player: Player): void {
    try {
      // Skip if player already exists
      if (this.players.has(player.id)) {
        console.log(`Player ${player.name} (${player.id}) already exists, skipping`);
        return;
      }
      
      console.log('Adding player:', {
        id: player.id,
        name: player.name,
        position: { x: player.x, y: player.y },
        type: player.type
      });
      
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
        playerId: player.id,
        playerName: player.name
      });
      
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
        console.error('Cannot report damage: socket is null');
        return;
      }
      
      if (this.connectionStatus !== 'connected') {
        console.error(`Cannot report damage: not connected to server (status: ${this.connectionStatus})`);
        return;
      }
      
      console.log(`Sending damage report to server: targetId=${targetId}, amount=${amount}`);
      
      this.socket.emit('damageShip', {
        targetId,
        amount
      });
      
      // Log the event for debugging
      console.log(`Damage report sent successfully`);
    } catch (error) {
      console.error('Error reporting damage:', error);
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
    if (!this.socket || this.connectionStatus !== 'connected') {
      console.warn('Cannot identify device: not connected to server');
      return;
    }
    
    console.log('Identifying device with ID:', this.deviceId);
    this.socket.emit('identifyDevice', { 
      deviceId: this.deviceId,
      playerName: this.playerName
    });
  }

  /**
   * Debug function to check player visibility
   * Call this periodically to ensure players are visible
   */
  public debugCheckPlayerVisibility(): void {
    try {
      console.log('--- DEBUG: Player Visibility Check ---');
      console.log(`Total players in game: ${this.players.size}`);
      console.log(`Local player ID: ${this.playerId}`);
      console.log(`Connection status: ${this.connectionStatus}`);
      
      // Check each player
      this.players.forEach((ship, id) => {
        const isLocal = id === this.playerId;
        const isVisible = ship.sprite.visible;
        const hasParent = !!ship.sprite.parent;
        const position = { x: Math.round(ship.x), y: Math.round(ship.y) };
        const distance = isLocal ? 0 : Math.round(
          Math.sqrt(
            Math.pow(ship.x - (this.localPlayer?.x || 0), 2) + 
            Math.pow(ship.y - (this.localPlayer?.y || 0), 2)
          )
        );
        
        console.log(`Player ${ship.playerName} (${id}):`, {
          isLocal,
          isVisible,
          hasParent,
          position,
          distance: isLocal ? 'N/A' : distance,
          type: ship.type
        });
        
        // Check name container
        if ((ship as any).nameContainer) {
          const nameVisible = (ship as any).nameContainer.visible;
          const nameHasParent = !!(ship as any).nameContainer.parent;
          console.log(`- Name container: visible=${nameVisible}, hasParent=${nameHasParent}`);
        } else {
          console.log(`- No name container found`);
        }
        
        // If not visible but should be, try to fix it
        if (!isVisible && hasParent) {
          console.log(`Attempting to fix visibility for player ${ship.playerName}`);
          ship.sprite.visible = true;
        }
        
        // If no parent but should have one, try to re-add to container
        if (!hasParent && !isLocal) {
          console.log(`Attempting to fix missing parent for player ${ship.playerName}`);
          this.gameContainer.addChild(ship.sprite as unknown as PIXI.DisplayObject);
          
          if ((ship as any).nameContainer && !(ship as any).nameContainer.parent) {
            this.gameContainer.addChild((ship as any).nameContainer as unknown as PIXI.DisplayObject);
          }
        }
      });
      
      console.log('--- End of Player Visibility Check ---');
    } catch (error) {
      console.error('Error in debugCheckPlayerVisibility:', error);
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
      console.log(`Using saved server URL from localStorage: ${savedUrl}`);
      return savedUrl;
    }
    
    // Then try environment variable
    if (process.env.REACT_APP_SERVER_URL) {
      console.log(`Using server URL from environment: ${process.env.REACT_APP_SERVER_URL}`);
      return process.env.REACT_APP_SERVER_URL;
    }
    
    // Finally fall back to default
    console.log(`Using default server URL: http://localhost:3001`);
    return 'http://localhost:3001';
  }

  /**
   * Debug function to check damage synchronization
   */
  public debugDamageSynchronization(): void {
    try {
      console.log('--- DEBUG: Damage Synchronization Check ---');
      
      // Check if we're connected to the server
      console.log(`Connection status: ${this.connectionStatus}`);
      console.log(`Socket connected: ${this.socket?.connected}`);
      console.log(`Socket ID: ${this.socket?.id}`);
      
      // Log all players and their hull values
      console.log('Players and hull values:');
      this.players.forEach((ship, id) => {
        console.log(`- ${ship.playerName} (${id}): hull=${ship.hull}/${ship.maxHull}, isLocal=${id === this.playerId}`);
      });
      
      // Test damage reporting if we have other players
      const otherPlayers = Array.from(this.players.entries())
        .filter(([id]) => id !== this.playerId)
        .map(([_, ship]) => ship);
      
      if (otherPlayers.length > 0) {
        const testShip = otherPlayers[0];
        console.log(`Test damage reporting available for: ${testShip.playerName} (${testShip.id})`);
        console.log('To test, click the debug button (D) and check console logs');
      } else {
        console.log('No other players to test damage reporting with');
      }
      
      console.log('--- End of Damage Synchronization Check ---');
    } catch (error) {
      console.error('Error in debugDamageSynchronization:', error);
    }
  }

  /**
   * Debug function to test collision detection
   */
  public debugTestCollision(): void {
    try {
      console.log('--- DEBUG: Testing Collision Detection ---');
      
      // Get all other players
      const otherPlayers = Array.from(this.players.entries())
        .filter(([id]) => id !== this.playerId)
        .map(([_, ship]) => ship);
      
      if (otherPlayers.length === 0) {
        console.log('No other players to test collision with');
        return;
      }
      
      // Get the first other player
      const targetShip = otherPlayers[0];
      console.log(`Testing collision with ${targetShip.playerName} (${targetShip.id})`);
      
      // Log positions
      console.log(`- Local player position: (${Math.round(this.localPlayer?.x || 0)}, ${Math.round(this.localPlayer?.y || 0)})`);
      console.log(`- Target position: (${Math.round(targetShip.x)}, ${Math.round(targetShip.y)})`);
      
      // Calculate distance
      const dx = (this.localPlayer?.x || 0) - targetShip.x;
      const dy = (this.localPlayer?.y || 0) - targetShip.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      console.log(`- Distance between ships: ${Math.round(distance)}`);
      
      // Test damage reporting
      console.log('Sending test damage report to server...');
      this.reportDamage(targetShip.id, 10);
      
      console.log('--- End of Collision Detection Test ---');
    } catch (error) {
      console.error('Error in debugTestCollision:', error);
    }
  }
} 