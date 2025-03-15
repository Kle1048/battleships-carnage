import * as PIXI from 'pixi.js';
import { ProjectileType, Projectile } from './Projectile';
import * as Logger from '../utils/Logger';
import { VISUAL_EFFECTS } from '../config/GameConfig';

// Global reference to the NetworkManager for damage reporting
let networkManagerRef: any = null;

// Export function to set the NetworkManager reference
export function setNetworkManagerRef(networkManager: any): void {
  networkManagerRef = networkManager;
}

// Ship types
export type ShipType = 'destroyer' | 'cruiser' | 'battleship';

// Throttle settings
export enum ThrottleSetting {
  REVERSE_FULL = -2,
  REVERSE_HALF = -1,
  STOP = 0,
  SLOW = 1,
  HALF = 2,
  FLANK = 3
}

// Rudder settings
export enum RudderSetting {
  FULL_LEFT = -2,
  HALF_LEFT = -1,
  AHEAD = 0,
  HALF_RIGHT = 1,
  FULL_RIGHT = 2
}

// Weapon types and properties
export enum WeaponType {
  PRIMARY = 'primary',
  SECONDARY = 'secondary'
}

// Weapon properties by ship type
const WEAPON_PROPERTIES = {
  destroyer: {
    [WeaponType.PRIMARY]: {
      type: ProjectileType.CANNON_BALL,
      cooldown: 30, // frames
      count: 1,
      spread: 0,
      offset: { x: 0, y: 0 }
    },
    [WeaponType.SECONDARY]: {
      type: ProjectileType.TORPEDO,
      cooldown: 120, // frames
      count: 1,
      spread: 0,
      offset: { x: 0, y: 0 }
    }
  },
  cruiser: {
    [WeaponType.PRIMARY]: {
      type: ProjectileType.CANNON_BALL,
      cooldown: 25, // frames
      count: 2,
      spread: 0.1,
      offset: { x: 0, y: 0 }
    },
    [WeaponType.SECONDARY]: {
      type: ProjectileType.TORPEDO,
      cooldown: 100, // frames
      count: 1,
      spread: 0,
      offset: { x: 0, y: 0 }
    }
  },
  battleship: {
    [WeaponType.PRIMARY]: {
      type: ProjectileType.CANNON_BALL,
      cooldown: 40, // frames
      count: 3,
      spread: 0.15,
      offset: { x: 0, y: 0 }
    },
    [WeaponType.SECONDARY]: {
      type: ProjectileType.TORPEDO,
      cooldown: 150, // frames
      count: 2,
      spread: 0.05,
      offset: { x: 0, y: 0 }
    }
  }
};

// Ship properties interface
interface ShipProps {
  x: number;
  y: number;
  rotation: number;
  speed: number;
  maxSpeed: number;
  acceleration: number;
  rotationSpeed: number;
  hull: number;
  type: ShipType;
  playerId?: string; // Optional player ID for color assignment
  playerName: string;
}

// Collision data for different ship types
const SHIP_COLLISION_DATA = {
  destroyer: { radius: 20, width: 40, height: 15, damage: 1.0 },
  cruiser: { radius: 30, width: 60, height: 20, damage: 1.5 },
  battleship: { radius: 40, width: 80, height: 25, damage: 2.0 }
};

// Ship colors array - moved outside class for reuse
export const SHIP_COLORS = [
  0xFF5733, // Bright orange
  0xFFD700, // Gold
  0x32CD32, // Lime green
  0xFF1493, // Deep pink
  0xFFFFFF, // White
  0xFFA500, // Orange
  0x00FFFF, // Cyan
  0xFF00FF, // Magenta
  0xADFF2F, // Green yellow
  0xF08080  // Light coral
];

export class Ship {
  // Position and movement
  public x: number;
  public y: number;
  public rotation: number;
  public speed: number;
  public maxSpeed: number;
  public acceleration: number;
  public rotationSpeed: number;
  public velocityX: number = 0;
  public velocityY: number = 0;
  public driftAngle: number = 0;
  public driftX: number = 0;
  public driftY: number = 0;
  
  // Ship properties
  public type: ShipType;
  public hull: number;
  public maxHull: number;
  public collisionRadius: number;
  public collisionWidth: number;
  public collisionHeight: number;
  public collisionDamageMultiplier: number;
  
  // Collision state
  public isColliding: boolean = false;
  public lastCollisionTime: number = 0;
  public collisionCooldown: number = 500; // ms
  public spawnProtectionTime: number = 3000; // 3 seconds of spawn protection
  public spawnTime: number = Date.now();
  
  // Ship controls
  public throttle: ThrottleSetting = ThrottleSetting.STOP;
  public rudder: RudderSetting = RudderSetting.AHEAD;
  public targetSpeed: number = 0;
  
  // PIXI sprite
  public sprite: PIXI.Container;
  
  // Add weapon cooldown properties
  public primaryWeaponCooldown: number = 0;
  public secondaryWeaponCooldown: number = 0;
  
  // Ship ID (used for network identification)
  public id: string;
  public playerId: string;
  public playerName: string;
  public color: number;
  private nameText: PIXI.Text;
  
  // Add color picker properties
  private static userSelectedColor: number | null = null;
  
  private nameContainer: PIXI.Container;  // Add this new property
  
  constructor(options: {
    x: number;
    y: number;
    rotation: number;
    speed: number;
    maxSpeed: number;
    acceleration: number;
    rotationSpeed: number;
    hull: number;
    type: ShipType;
    playerId: string;
    playerName: string;
  }) {
    this.x = options.x;
    this.y = options.y;
    this.rotation = options.rotation;
    this.speed = options.speed;
    this.maxSpeed = options.maxSpeed;
    this.acceleration = options.acceleration;
    this.rotationSpeed = options.rotationSpeed;
    this.hull = options.hull;
    this.maxHull = options.hull;
    this.type = options.type;
    this.playerId = options.playerId;
    this.playerName = options.playerName;
    
    // Set collision properties based on ship type
    const collisionData = SHIP_COLLISION_DATA[this.type];
    this.collisionRadius = collisionData.radius;
    this.collisionWidth = collisionData.width;
    this.collisionHeight = collisionData.height;
    this.collisionDamageMultiplier = collisionData.damage;
    
    // Set ship ID (use player ID if provided, otherwise generate a random one)
    this.id = this.playerId;
    
    // Assign a color based on player ID
    this.color = this.getColorForPlayer(this.id);
    
    // Create container for ship sprite
    this.sprite = new PIXI.Container();
    
    // Create ship sprite
    const shipSprite = this.createShipSprite();
    this.sprite.addChild(shipSprite as unknown as PIXI.DisplayObject);

    // Create separate container for name that's independent of ship rotation
    this.nameContainer = new PIXI.Container();
    
    // Create name text
    this.nameText = new PIXI.Text(this.playerName, {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xFFFFFF,
        align: 'center',
        stroke: 0x000000,
        strokeThickness: 4,
        lineJoin: 'round'
    });
    
    // Center the name text horizontally
    this.nameText.anchor.set(0.5, 0);
    
    // Add name text to its container
    this.nameContainer.addChild(this.nameText as unknown as PIXI.DisplayObject);
    
    // Position the name container below the ship
    this.nameContainer.position.set(this.x, this.y + 38); // 38px is about 1cm below the ship
    
    // Set initial position
    this.sprite.position.set(this.x, this.y);
    this.sprite.rotation = this.rotation;
    
    // Update sprite position
    this.updateSpritePosition();
    
    // Explicitly initialize weapon cooldowns to 0
    this.primaryWeaponCooldown = 0;
    this.secondaryWeaponCooldown = 0;
  }
  
  // Get a color based on player ID or user selection
  private getColorForPlayer(playerId: string): number {
    // For local player, use selected color if available
    if (playerId === 'local' && Ship.userSelectedColor !== null) {
      return Ship.userSelectedColor;
    }
    
    // For local player without selection, use first color
    if (playerId === 'local') {
      return SHIP_COLORS[0];
    }
    
    // For other players, hash the player ID to get a consistent color
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
      hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Use the hash to pick a color from the array
    const colorIndex = Math.abs(hash) % SHIP_COLORS.length;
    return SHIP_COLORS[colorIndex];
  }
  
  // Method to update ship color
  public updateColor(newColor: number): void {
    this.color = newColor;
    if (this.playerId === 'local') {
      Ship.userSelectedColor = newColor;
      localStorage.setItem('shipColor', newColor.toString());
      
      // Send color update to server if network manager is available
      if (networkManagerRef && typeof networkManagerRef.sendPlayerUpdate === 'function') {
        Logger.info('Ship', `Sending color update to server: ${newColor}`);
        networkManagerRef.sendPlayerUpdate({ color: newColor });
      }
    }
    
    // Update ship appearance
    const shipGraphics = this.sprite.children[0] as PIXI.Graphics;
    if (shipGraphics) {
      shipGraphics.tint = this.color;
    }
  }
  
  // Static method to initialize color from storage
  public static initializeColorFromStorage(): void {
    const storedColor = localStorage.getItem('shipColor');
    if (storedColor) {
      Ship.userSelectedColor = parseInt(storedColor);
    }
  }
  
  // Add a static method to set the user-selected color
  public static setUserSelectedColor(color: number): void {
    Ship.userSelectedColor = color;
    localStorage.setItem('shipColor', color.toString());
  }
  
  createShipSprite(): PIXI.Container {
    const container = new PIXI.Container();
    
    // Create ship graphics
    const shipGraphics = new PIXI.Graphics();
    
    // Draw ship based on type
    switch (this.type) {
      case 'destroyer':
        this.drawDestroyer(shipGraphics);
        break;
      case 'cruiser':
        this.drawCruiser(shipGraphics);
        break;
      case 'battleship':
        this.drawBattleship(shipGraphics);
        break;
    }
    
    // Add ship graphics to container
    container.addChild(shipGraphics as unknown as PIXI.DisplayObject);
    
    return container;
  }
  
  /**
   * Update the sprite position and rotation to match the ship
   */
  updateSpritePosition(): void {
    if (!this.sprite) {
      console.warn(`Cannot update sprite position for ${this.playerName}: sprite is null`);
      this.sprite = this.createShipSprite();
    }
    
    // Use try-catch to catch any issues with updating sprite position
    try {
      this.sprite.position.set(this.x, this.y);
      this.sprite.rotation = this.rotation;
      
      // Position nameContainer above ship if it exists
      if (this.nameContainer) {
        this.nameContainer.position.set(this.x, this.y - 40);
      }
    } catch (error) {
      console.error(`Error updating sprite position for ${this.playerName}:`, error);
    }
  }
  
  // Set throttle to a specific setting
  setThrottle(setting: ThrottleSetting): void {
    this.throttle = setting;
    
    // Set target speed based on throttle setting
    switch (setting) {
      case ThrottleSetting.FLANK:
        this.targetSpeed = this.maxSpeed;
        break;
      case ThrottleSetting.HALF:
        this.targetSpeed = this.maxSpeed * 0.6;
        break;
      case ThrottleSetting.SLOW:
        this.targetSpeed = this.maxSpeed * 0.3;
        break;
      case ThrottleSetting.STOP:
        this.targetSpeed = 0;
        break;
      case ThrottleSetting.REVERSE_HALF:
        this.targetSpeed = -this.maxSpeed * 0.3;
        break;
      case ThrottleSetting.REVERSE_FULL:
        this.targetSpeed = -this.maxSpeed * 0.5;
        break;
    }
  }
  
  // Increase throttle by one step
  increaseThrottle(): void {
    if (this.throttle < ThrottleSetting.FLANK) {
      this.setThrottle(this.throttle + 1);
    }
  }
  
  // Decrease throttle by one step
  decreaseThrottle(): void {
    if (this.throttle > ThrottleSetting.REVERSE_FULL) {
      this.setThrottle(this.throttle - 1);
    }
  }
  
  // Set rudder to a specific setting
  setRudder(setting: RudderSetting): void {
    this.rudder = setting;
  }
  
  // Turn rudder more to the left
  turnRudderLeft(): void {
    if (this.rudder > RudderSetting.FULL_LEFT) {
      this.rudder--;
    }
  }
  
  // Turn rudder more to the right
  turnRudderRight(): void {
    if (this.rudder < RudderSetting.FULL_RIGHT) {
      this.rudder++;
    }
  }
  
  // Center the rudder
  centerRudder(): void {
    this.rudder = RudderSetting.AHEAD;
  }
  
  // Legacy methods for compatibility
  accelerate(): void {
    this.increaseThrottle();
  }
  
  decelerate(): void {
    this.decreaseThrottle();
  }
  
  rotateLeft(): void {
    this.turnRudderLeft();
  }
  
  rotateRight(): void {
    this.turnRudderRight();
  }
  
  update(delta: number): void {
    // Apply throttle - gradually adjust speed toward target
    if (Math.abs(this.speed - this.targetSpeed) > 0.01) {
      // Acceleration is slower than deceleration (ships take time to speed up)
      const accelFactor = this.speed < this.targetSpeed ? 0.02 : 0.03;
      this.speed += (this.targetSpeed - this.speed) * accelFactor * delta;
    } else {
      this.speed = this.targetSpeed;
    }
    
    // Apply rudder - rotation speed depends on current speed and rudder setting
    // Ships turn faster at higher speeds, and rudder is less effective in reverse
    const speedFactor = Math.abs(this.speed) / this.maxSpeed;
    const directionFactor = this.speed >= 0 ? 1 : 0.5; // Less effective in reverse
    const rudderEffect = this.rotationSpeed * speedFactor * directionFactor;
    
    switch (this.rudder) {
      case RudderSetting.FULL_LEFT:
        this.rotation -= rudderEffect * 1.0 * delta;
        break;
      case RudderSetting.HALF_LEFT:
        this.rotation -= rudderEffect * 0.5 * delta;
        break;
      case RudderSetting.HALF_RIGHT:
        this.rotation += rudderEffect * 0.5 * delta;
        break;
      case RudderSetting.FULL_RIGHT:
        this.rotation += rudderEffect * 1.0 * delta;
        break;
      // No rotation when rudder is centered (AHEAD)
    }
    
    // Add slight drift based on current speed and turning
    // Ships tend to drift sideways when turning at speed
    const driftFactor = 0.1 * speedFactor * Math.abs(this.rudder);
    const driftAngle = this.rotation + (this.rudder < 0 ? -Math.PI/2 : Math.PI/2);
    
    // Update position based on speed and rotation
    // In PixiJS, 0 radians points to the right, and rotation is clockwise
    // So we use sin for x and -cos for y to move in the direction of rotation
    this.x += Math.cos(this.rotation) * this.speed * delta;
    this.y += Math.sin(this.rotation) * this.speed * delta;
    
    // Add drift component
    if (Math.abs(this.rudder) > 0 && Math.abs(this.speed) > 0.5) {
      this.x += Math.cos(driftAngle) * driftFactor * delta;
      this.y += Math.sin(driftAngle) * driftFactor * delta;
    }
    
    // Update sprite position and rotation
    this.updateSpritePosition();
    
    // Update weapon cooldowns
    if (this.primaryWeaponCooldown > 0) {
      this.primaryWeaponCooldown--;
    }
    
    if (this.secondaryWeaponCooldown > 0) {
      this.secondaryWeaponCooldown--;
    }
  }
  
  /**
   * Check if this ship collides with another ship
   * @param otherShip The other ship to check collision with
   * @returns True if the ships are colliding, false otherwise
   */
  checkCollision(otherShip: Ship): boolean {
    // Don't collide with self
    if (this.id === otherShip.id) {
      return false;
    }
    
    // Check for spawn protection
    const now = Date.now();
    if (now - this.spawnTime < this.spawnProtectionTime) {
      // Ship is in spawn protection period
      return false;
    }
    
    // Check if other ship has spawn protection
    if (now - otherShip.spawnTime < otherShip.spawnProtectionTime) {
      return false;
    }
    
    // Simple circle collision detection
    const dx = this.x - otherShip.x;
    const dy = this.y - otherShip.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = this.collisionRadius + otherShip.collisionRadius;
    
    // Debug collision
    if (distance < minDistance) {
      console.log(`Collision check: ${this.id} and ${otherShip.id}`);
      console.log(`Distance: ${distance}, Min Distance: ${minDistance}`);
    }
    
    return distance < minDistance;
  }
  
  /**
   * Handle collision with another ship
   * @param otherShip The other ship involved in the collision
   */
  handleCollision(otherShip: Ship): void {
    // Check if we're in cooldown period
    const now = Date.now();
    if (now - this.lastCollisionTime < this.collisionCooldown) {
      return;
    }
    
    // Set collision flag and time
    this.isColliding = true;
    this.lastCollisionTime = now;
    
    // Calculate collision force based on relative speed and mass
    const relativeSpeed = Math.abs(this.speed - otherShip.speed);
    const thisImpactForce = Math.max(relativeSpeed * this.collisionDamageMultiplier, 0.5);
    
    Logger.info('Ship', `Collision: ${this.playerName} (${this.id}) hit ${otherShip.playerName} (${otherShip.id})`);
    Logger.debug('Ship', `Damage amount: ${Math.ceil(thisImpactForce * 10)}, Impact force: ${thisImpactForce}`);
    
    // Always apply at least some damage on collision
    const actualDamage = Math.max(Math.ceil(thisImpactForce * 10), 5);
    
    // Apply damage to this ship
    this.takeDamage(actualDamage);
    
    // If this is the local player, report damage to the server for the other ship
    if (this.id === 'local' && networkManagerRef && otherShip.id !== 'local') {
      Logger.info('Ship', `Reporting collision damage to server: targetId=${otherShip.id}, amount=${actualDamage}`);
      networkManagerRef.reportDamage(otherShip.id, actualDamage);
    }
    
    // Calculate collision response vector (direction from other ship to this ship)
    const dx = this.x - otherShip.x;
    const dy = this.y - otherShip.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize the direction vector
    const nx = dx / distance;
    const ny = dy / distance;
    
    // Calculate overlap (how much ships are intersecting)
    const overlap = (this.collisionRadius + otherShip.collisionRadius) - distance;
    
    // If we're the local ship, adjust our position to prevent overlap
    // This is done only on the local player to avoid desync with server positions
    if (this.id === 'local') {
      // Move this ship away from the other ship to prevent overlap
      this.x += nx * overlap * 0.5;
      this.y += ny * overlap * 0.5;
      
      // Apply collision impulse (change in velocity)
      const impulseMagnitude = thisImpactForce * 0.5; // Scale down for game feel
      this.velocityX += nx * impulseMagnitude;
      this.velocityY += ny * impulseMagnitude;
    }
  }
  
  /**
   * Update the ship's appearance based on damage
   */
  updateDamageAppearance(): void {
    try {
      // Get the ship graphics from the container (second child)
      const shipGraphics = this.sprite.children[this.sprite.children.length - 1] as unknown as PIXI.Graphics;
      if (!shipGraphics) {
        console.error('Ship graphics not found in container');
        return;
      }
      
      // Calculate damage percentage
      const damagePercent = 1 - (this.hull / this.maxHull);
      
      // Apply visual effects based on damage
      if (damagePercent > 0.7) {
        // Heavily damaged - red tint
        shipGraphics.tint = 0xFF0000;
      } else if (damagePercent > 0.3) {
        // Moderately damaged - orange tint
        shipGraphics.tint = 0xFF8800;
      } else {
        // Lightly damaged or undamaged - no tint
        shipGraphics.tint = 0xFFFFFF;
      }
    } catch (error) {
      console.error('Error in updateDamageAppearance:', error);
    }
  }
  
  /**
   * Create a visual effect for collision
   */
  createCollisionEffect(): void {
    try {
      // Get the ship graphics from the container (second child)
      const shipGraphics = this.sprite.children[this.sprite.children.length - 1] as unknown as PIXI.Graphics;
      if (!shipGraphics) {
        console.error('Ship graphics not found in container');
        return;
      }
      
      // Flash the ship red
      const originalTint = shipGraphics.tint;
      shipGraphics.tint = 0xFF0000;
      
      // Reset after a short delay
      setTimeout(() => {
        shipGraphics.tint = originalTint;
      }, 200);
    } catch (error) {
      console.error('Error in createCollisionEffect:', error);
    }
  }
  
  /**
   * Apply damage to the ship
   * @param amount Amount of damage to apply
   * @returns The new hull value
   */
  takeDamage(amount: number): number {
    try {
      // Validate input
      if (typeof amount !== 'number' || amount < 0) {
        Logger.warn('Ship', `Invalid damage amount: ${amount}`);
        return this.hull;
      }
      
      // Save old hull value for logging
      const oldHull = this.hull;
      
      // Apply damage
      this.hull = Math.max(0, this.hull - amount);
      
      Logger.info('Ship', `Ship ${this.id} (${this.playerName}) took ${amount} damage. Hull: ${oldHull} -> ${this.hull}/${this.maxHull}`);
      
      // Update ship appearance based on damage
      this.updateDamageAppearance();
      
      // Create damage effect
      this.createCollisionEffect();
      
      // Report updated hull value to the network if this is the local player
      if (this.id === 'local' && networkManagerRef && typeof networkManagerRef.sendPlayerUpdate === 'function') {
        Logger.info('Ship', `Sending hull update to server: ${this.hull}`);
        networkManagerRef.sendPlayerUpdate({ hull: this.hull });
      }
      
      // Trigger health change event for UI updates
      if (this.id === 'local') {
        const event = new CustomEvent('playerHealthChanged', { 
          detail: { current: this.hull, max: this.maxHull }
        });
        window.dispatchEvent(event);
      }
      
      // Check if ship is destroyed
      if (this.hull <= 0) {
        Logger.info('Ship', `Ship ${this.id} (${this.playerName}) was destroyed by damage`);
        this.hull = 0; // Ensure hull doesn't go below 0
        this.destroy();
      }
      
      return this.hull;
    } catch (error) {
      Logger.error('Ship.takeDamage', error);
      return this.hull;
    }
  }
  
  /**
   * Set the hull value directly and update appearance
   * Used primarily for server synchronization
   * @param value New hull value
   */
  setHull(value: number): void {
    if (typeof value !== 'number' || isNaN(value)) {
      Logger.warn('Ship', `Invalid hull value: ${value}`);
      return;
    }
    
    const oldHull = this.hull;
    this.hull = Math.max(0, Math.min(value, this.maxHull));
    
    if (oldHull !== this.hull) {
      Logger.info('Ship', `Hull value set for ${this.playerName}: ${oldHull} -> ${this.hull}`);
      this.updateDamageAppearance();
      
      // Trigger event for UI updates if local player
      if (this.id === 'local') {
        const event = new CustomEvent('playerHealthChanged', { 
          detail: { current: this.hull, max: this.maxHull }
        });
        window.dispatchEvent(event);
      }
      
      // If hull is now zero, mark as destroyed
      if (this.hull <= 0) {
        this.hull = 0;
        Logger.info('Ship', `Ship ${this.id} (${this.playerName}) was destroyed by setHull`);
        this.destroy();
      }
    }
  }
  
  /**
   * Destroy the ship
   */
  destroy(): void {
    try {
      Logger.info('Ship', `Ship ${this.id} (${this.playerName}) was destroyed!`);
      
      // Create explosion effect
      this.createExplosionEffect();
      
      // Hide the ship
      if (this.sprite) {
        this.sprite.visible = false;
      }
      
      // Clean up name container
      if (this.nameContainer) {
        if (this.nameText) {
          this.nameContainer.removeChild(this.nameText as unknown as PIXI.DisplayObject);
          this.nameText.destroy();
          (this as any).nameText = null; // Set to null for easier checking when respawning
        }
        this.nameContainer.destroy();
        (this as any).nameContainer = null; // Set to null for easier checking when respawning
      }
      
      // Destroy sprite
      if (this.sprite) {
        this.sprite.destroy();
        (this as any).sprite = null; // Set to null for easier checking when respawning
      }
    } catch (error) {
      Logger.error('Ship.destroy', `Error destroying ship: ${error}`);
    }
  }
  
  /**
   * Create explosion effect when ship is destroyed
   * @param scale Optional scale factor for the explosion (default: 1.0)
   */
  createExplosionEffect(scale: number = 1.0): void {
    try {
      Logger.info('Ship', `Creating explosion effect at ${this.x}, ${this.y} with scale ${scale}`);
      
      // Check if VISUAL_EFFECTS.EXPLOSION_EFFECTS is enabled
      if (!VISUAL_EFFECTS.EXPLOSION_EFFECTS) {
        Logger.debug('Ship', 'Explosion effects are disabled in game config');
        return;
      }
      
      // Find the game container
      const gameContainer = this.sprite.parent;
      if (!gameContainer) {
        Logger.warn('Ship', 'Cannot create explosion: ship sprite has no parent container');
        return;
      }
      
      // Create explosion parts
      const explosionParts = 8 + Math.floor(scale * 4); // Number of explosion particles
      const maxRadius = 20 * scale;
      const lifespan = 60; // frames
      
      // Create a container for all explosion particles
      const explosionContainer = new PIXI.Container();
      explosionContainer.x = this.x;
      explosionContainer.y = this.y;
      gameContainer.addChild(explosionContainer as any);
      
      // Create multiple explosion particles
      for (let i = 0; i < explosionParts; i++) {
        // Create a particle
        const particle = new PIXI.Graphics();
        
        // Random color from yellow to red
        const colorValue = 0xFF0000 + (Math.random() * 0xFFFF00) & 0xFFFF00;
        
        // Draw the particle
        particle.beginFill(colorValue, 0.8);
        const particleSize = 3 + Math.random() * 7 * scale;
        particle.drawCircle(0, 0, particleSize);
        particle.endFill();
        
        // Random position within the ship radius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.collisionRadius * 0.8;
        particle.x = Math.cos(angle) * distance;
        particle.y = Math.sin(angle) * distance;
        
        // Random velocity
        const speed = (1 + Math.random() * 2) * scale;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        // Add to container
        explosionContainer.addChild(particle as any);
        
        // Store velocity in the particle object
        (particle as any).vx = vx;
        (particle as any).vy = vy;
      }
      
      // Create a central flash
      const flash = new PIXI.Graphics();
      flash.beginFill(0xFFFFFF, 0.9);
      flash.drawCircle(0, 0, 15 * scale);
      flash.endFill();
      explosionContainer.addChild(flash as any);
      
      // Use a ticker to animate the explosion
      let timer = lifespan;
      
      // Get the app's ticker if it exists
      const app = (window as any).pixiApp;
      if (!app || !app.ticker) {
        Logger.warn('Ship', 'Cannot animate explosion: app.ticker is null');
        return;
      }
      
      const animate = () => {
        timer--;
        
        // Update all particles
        for (let i = 0; i < explosionContainer.children.length - 1; i++) {
          const particle = explosionContainer.children[i] as any;
          
          // Update position
          particle.x += particle.vx;
          particle.y += particle.vy;
          
          // Reduce scale and alpha
          particle.alpha = timer / lifespan;
          
          // Add some random wiggle for more natural movement
          particle.x += (Math.random() - 0.5) * scale;
          particle.y += (Math.random() - 0.5) * scale;
        }
        
        // Update flash
        flash.alpha = (timer / lifespan) * 0.8;
        flash.scale.set(1 + (1 - timer / lifespan) * 2);
        
        // Remove explosion when timer expires
        if (timer <= 0) {
          app.ticker.remove(animate);
          gameContainer.removeChild(explosionContainer as any);
          explosionContainer.destroy({ children: true });
        }
      };
      
      app.ticker.add(animate);
    } catch (error) {
      Logger.error('Ship.createExplosionEffect', error);
    }
  }
  
  // Add firing methods
  public firePrimaryWeapon(): boolean {
    console.log(`Attempting to fire primary weapon. Cooldown: ${this.primaryWeaponCooldown}`);
    
    if (this.primaryWeaponCooldown > 0) {
      console.log('Primary weapon on cooldown, cannot fire');
      return false; // Weapon on cooldown
    }
    
    const weaponProps = WEAPON_PROPERTIES[this.type][WeaponType.PRIMARY];
    this.primaryWeaponCooldown = weaponProps.cooldown;
    
    console.log(`Primary weapon fired. New cooldown: ${this.primaryWeaponCooldown}`);
    
    // Return true to indicate weapon was fired
    // The actual projectile creation will be handled by the Game class
    return true;
  }
  
  public fireSecondaryWeapon(): boolean {
    console.log(`Attempting to fire secondary weapon. Cooldown: ${this.secondaryWeaponCooldown}`);
    
    if (this.secondaryWeaponCooldown > 0) {
      console.log('Secondary weapon on cooldown, cannot fire');
      return false; // Weapon on cooldown
    }
    
    const weaponProps = WEAPON_PROPERTIES[this.type][WeaponType.SECONDARY];
    this.secondaryWeaponCooldown = weaponProps.cooldown;
    
    console.log(`Secondary weapon fired. New cooldown: ${this.secondaryWeaponCooldown}`);
    
    // Return true to indicate weapon was fired
    // The actual projectile creation will be handled by the Game class
    return true;
  }
  
  // Get weapon properties for projectile creation
  public getWeaponProperties(weaponType: WeaponType): any {
    return WEAPON_PROPERTIES[this.type][weaponType];
  }
  
  // Calculate projectile spawn position based on ship position and rotation
  public getProjectileSpawnPosition(weaponType: WeaponType, index: number = 0): { x: number, y: number, rotation: number } {
    const weaponProps = WEAPON_PROPERTIES[this.type][weaponType];
    const shipWidth = SHIP_COLLISION_DATA[this.type].width;
    const shipHeight = SHIP_COLLISION_DATA[this.type].height;
    
    // Calculate offset based on ship size and rotation
    let offsetX = 0;
    let offsetY = 0;
    
    // For primary weapons (cannons), offset to the sides
    if (weaponType === WeaponType.PRIMARY) {
      // Total number of cannons
      const totalCannons = weaponProps.count;
      
      // Determine turret position based on its index and total count
      let positionType = 'front'; // Default to front

      // For multiple cannons, place them in realistic positions
      if (totalCannons === 2) {
        // Two turrets: one front, one aft
        positionType = index === 0 ? 'front' : 'aft';
      } else if (totalCannons === 3) {
        // Three turrets: two front, one aft
        positionType = index < 2 ? 'front' : 'aft';
      }
      
      // Calculate position based on type
      if (positionType === 'front') {
        // Front turret - place forward
        const forwardOffset = shipWidth * 0.45; // 45% of ship width from center
        
        // If multiple front turrets, spread them out slightly
        let lateralOffset = 0;
        if (totalCannons === 2 && index === 0) {
          // No lateral offset needed for single front turret
        } else if (totalCannons === 3 && index < 2) {
          // For two front turrets, spread them slightly
          lateralOffset = (index === 0 ? -1 : 1) * (shipHeight * 0.4);
        }
        
        // Calculate offset in ship's coordinate system
        offsetX = Math.cos(this.rotation) * forwardOffset; 
        offsetY = Math.sin(this.rotation) * forwardOffset;
        
        // Add lateral offset perpendicular to ship direction
        if (lateralOffset !== 0) {
          const perpAngle = this.rotation + Math.PI/2;
          offsetX += Math.cos(perpAngle) * lateralOffset;
          offsetY += Math.sin(perpAngle) * lateralOffset;
        }
      } else {
        // Aft turret - place at back
        const backwardOffset = -shipWidth * 0.35; // 35% of ship width back from center
        offsetX = Math.cos(this.rotation) * backwardOffset;
        offsetY = Math.sin(this.rotation) * backwardOffset;
      }
      
      Logger.debug('Ship', `Primary weapon [${index}/${totalCannons}] spawn position: Ship at (${this.x.toFixed(1)}, ${this.y.toFixed(1)}), offset (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`);
      
      // Ensure projectile spawns just outside ship's collision area
      const spawnDistance = Math.max(this.collisionRadius * 1.1, 5);
      const direction = positionType === 'front' ? 1 : -1;
      const safeX = this.x + offsetX + (Math.cos(this.rotation) * direction * spawnDistance);
      const safeY = this.y + offsetY + (Math.sin(this.rotation) * direction * spawnDistance);
      
      return {
        x: safeX,
        y: safeY,
        rotation: this.rotation // Use ship's rotation as initial direction
      };
    } 
    // For secondary weapons (torpedoes), offset to the front
    else {
      // Position torpedoes at the front of the ship
      const forwardOffset = shipWidth * 0.5 + this.collisionRadius * 0.2; // Forward of ship + a safe margin
      offsetX = Math.cos(this.rotation) * forwardOffset;
      offsetY = Math.sin(this.rotation) * forwardOffset;
      
      // For multiple torpedoes, add slight lateral offset
      if (weaponProps.count > 1) {
        const lateralOffset = (index - (weaponProps.count - 1) / 2) * (shipHeight * 0.3);
        const perpAngle = this.rotation + Math.PI/2;
        offsetX += Math.cos(perpAngle) * lateralOffset;
        offsetY += Math.sin(perpAngle) * lateralOffset;
      }
      
      Logger.debug('Ship', `Secondary weapon [${index}/${weaponProps.count}] spawn position: Ship at (${this.x.toFixed(1)}, ${this.y.toFixed(1)}), offset (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`);
      
      // Ensure torpedo spawns completely outside ship's collision area
      const safeX = this.x + offsetX;
      const safeY = this.y + offsetY;
      
      return {
        x: safeX,
        y: safeY,
        rotation: this.rotation // Use ship's rotation as initial direction
      };
    }
  }
  
  /**
   * Reset spawn protection timer (call this when ship respawns)
   */
  resetSpawnProtection(): void {
    this.spawnTime = Date.now();
    console.log(`Spawn protection activated for ${this.id} until ${new Date(this.spawnTime + this.spawnProtectionTime).toLocaleTimeString()}`);
  }
  
  /**
   * Draw destroyer ship type
   */
  private drawDestroyer(graphics: PIXI.Graphics): void {
    // Set the fill color based on player ID
    graphics.beginFill(this.color);
    
    // Small, fast ship - pointing right (0 radians)
    graphics.drawPolygon([
      20, 0,   // Front (nose)
      -10, -7.5, // Left back
      -5, 0,   // Back middle
      -10, 7.5   // Right back
    ]);
    
    graphics.endFill();
    
    // Add details to the ship (bridge/tower)
    graphics.beginFill(0xFFFFFF);
    graphics.drawRect(-5, -3, 10, 6);
    graphics.endFill();
    
    // Add outline
    graphics.lineStyle(1, 0x000000);
    graphics.drawPolygon([
      20, 0,   // Front (nose)
      -10, -7.5, // Left back
      -5, 0,   // Back middle
      -10, 7.5   // Right back
    ]);
  }
  
  /**
   * Draw cruiser ship type
   */
  private drawCruiser(graphics: PIXI.Graphics): void {
    // Set the fill color based on player ID
    graphics.beginFill(this.color);
    
    // Medium ship - pointing right (0 radians)
    graphics.drawPolygon([
      30, 0,   // Front (nose)
      -15, -10, // Left back
      -7, 0,   // Back middle
      -15, 10   // Right back
    ]);
    
    graphics.endFill();
    
    // Add details to the ship (bridge/tower)
    graphics.beginFill(0xFFFFFF);
    graphics.drawRect(-7, -5, 14, 10);
    graphics.endFill();
    
    // Add outline
    graphics.lineStyle(1, 0x000000);
    graphics.drawPolygon([
      30, 0,   // Front (nose)
      -15, -10, // Left back
      -7, 0,   // Back middle
      -15, 10   // Right back
    ]);
  }
  
  /**
   * Draw battleship ship type
   */
  private drawBattleship(graphics: PIXI.Graphics): void {
    // Set the fill color based on player ID
    graphics.beginFill(this.color);
    
    // Large, powerful ship - pointing right (0 radians)
    graphics.drawPolygon([
      40, 0,   // Front (nose)
      -20, -12.5, // Left back
      -10, 0,   // Back middle
      -20, 12.5   // Right back
    ]);
    
    graphics.endFill();
    
    // Add details to the ship (bridge/tower)
    graphics.beginFill(0xFFFFFF);
    graphics.drawRect(-10, -7, 20, 14);
    graphics.endFill();
    
    // Add outline
    graphics.lineStyle(1, 0x000000);
    graphics.drawPolygon([
      40, 0,   // Front (nose)
      -20, -12.5, // Left back
      -10, 0,   // Back middle
      -20, 12.5   // Right back
    ]);
  }
  
  /**
   * Fire a weapon
   * @param weaponType Weapon type (PRIMARY or SECONDARY)
   * @param targetX Target X coordinate
   * @param targetY Target Y coordinate
   */
  public fireWeapon(weaponType: WeaponType, targetX: number, targetY: number): Projectile[] {
    try {
      // Get weapon properties
      const weaponProps = WEAPON_PROPERTIES[this.type][weaponType];
      
      // Check cooldown
      if (weaponType === WeaponType.PRIMARY && this.primaryWeaponCooldown > 0) {
        return [];
      } else if (weaponType === WeaponType.SECONDARY && this.secondaryWeaponCooldown > 0) {
        return [];
      }
      
      // Set cooldown
      if (weaponType === WeaponType.PRIMARY) {
        this.primaryWeaponCooldown = weaponProps.cooldown;
      } else {
        this.secondaryWeaponCooldown = weaponProps.cooldown;
      }
      
      // Create projectiles
      const projectiles: Projectile[] = [];
      
      // Calculate angle to target
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const targetAngle = Math.atan2(dy, dx);
      
      // Log firing details
      Logger.info('Ship', `Ship ${this.id} (${this.playerName}) firing ${weaponType} weapon at (${targetX.toFixed(1)}, ${targetY.toFixed(1)}), angle: ${targetAngle.toFixed(2)}`);
      
      // Create each projectile in the volley with appropriate spread
      for (let i = 0; i < weaponProps.count; i++) {
        try {
          // Get spawn position for this projectile
          const spawnPos = this.getProjectileSpawnPosition(weaponType, i);
          
          // Calculate rotation with spread if multiple projectiles
          let rotation = targetAngle;
          
          // Add spread for multi-projectile weapons
          if (weaponProps.count > 1) {
            const spreadOffset = (i - (weaponProps.count - 1) / 2) * weaponProps.spread;
            rotation += spreadOffset;
          }
          
          // Create the projectile
          const projectile = new Projectile(
            weaponProps.type,
            spawnPos.x,
            spawnPos.y,
            rotation,
            this.id
          );
          
          // Add to list
          projectiles.push(projectile);
          
          // Create firing effect at the spawn position
          if (networkManagerRef) {
            const game = (window as any).game;
            if (game && typeof game.createFiringEffect === 'function') {
              game.createFiringEffect(spawnPos.x, spawnPos.y, this.rotation, projectile.type);
            }
          }
          
          // Log projectile creation
          Logger.debug('Ship', `Created projectile ${projectile.id} at position (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)})`);
        } catch (error) {
          Logger.error('Ship.fireWeapon.projectileCreation', error);
        }
      }
      
      // Play firing sound (if available)
      this.playWeaponSound(weaponType);
      
      return projectiles;
    } catch (error) {
      Logger.error('Ship.fireWeapon', error);
      return [];
    }
  }
  
  /**
   * Play weapon firing sound
   * @param weaponType Type of weapon being fired
   */
  private playWeaponSound(weaponType: WeaponType): void {
    try {
      // This is a stub method for now - sound effects would be implemented in a future update
      Logger.debug('Ship', `Playing ${weaponType} weapon sound for ship ${this.id}`);
      
      // Example code for future sound implementation:
      // const soundId = weaponType === WeaponType.PRIMARY ? 'cannon_fire' : 'torpedo_launch';
      // const soundManager = (window as any).soundManager;
      // if (soundManager && typeof soundManager.playSound === 'function') {
      //   soundManager.playSound(soundId, { volume: 0.8, pan: 0 });
      // }
    } catch (error) {
      Logger.error('Ship.playWeaponSound', error);
    }
  }
  
  /**
   * Recreate the name text and container after destruction
   * This is needed for ship respawn
   */
  public recreateNameDisplay(): PIXI.Container {
    try {
      // Create new name container
      this.nameContainer = new PIXI.Container();
      
      // Create new name text
      this.nameText = new PIXI.Text(this.playerName, {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xFFFFFF,
        align: 'center',
        stroke: 0x000000,
        strokeThickness: 4,
        lineJoin: 'round'
      });
      
      // Center the name text horizontally
      this.nameText.anchor.set(0.5, 0);
      
      // Add name text to its container
      this.nameContainer.addChild(this.nameText as unknown as PIXI.DisplayObject);
      
      // Position the name container below the ship
      this.nameContainer.position.set(this.x, this.y + 38); // 38px is about 1cm below the ship
      
      return this.nameContainer;
    } catch (error) {
      Logger.error('Ship.recreateNameDisplay', error);
      return new PIXI.Container(); // Return empty container on error
    }
  }
  
  /**
   * Recreate the ship sprite after destruction
   * This is needed when a ship respawns after being destroyed
   */
  public recreateShipSprite(): void {
    try {
      // Create new ship sprite
      if (this.sprite === null) {
        this.sprite = this.createShipSprite();
        Logger.info('Ship', `Recreated sprite for ${this.playerName}`);
      }
      
      // Update sprite position and rotation
      this.updateSpritePosition();
      
      // Update damage appearance
      this.updateDamageAppearance();
      
      // Recreate name display if it's missing
      if (!this.nameContainer) {
        this.recreateNameDisplay();
      }
    } catch (error) {
      Logger.error('Ship.recreateShipSprite', error);
    }
  }
  
  /**
   * Ensure this ship is properly initialized with valid position and sprite
   * @returns true if the ship has been fixed, false if it was already valid
   */
  public ensureValidState(): boolean {
    let wasFixed = false;
    
    // Check if position is valid (within world bounds)
    const worldSize = 5000; // Should match WORLD_SIZE from Game.ts
    const margin = 100;
    
    // Check for invalid position
    const hasInvalidPosition = 
      this.x === undefined || this.y === undefined || 
      this.x === null || this.y === null ||
      Number.isNaN(this.x) || Number.isNaN(this.y) ||
      !Number.isFinite(this.x) || !Number.isFinite(this.y) ||
      this.x < margin || this.x > worldSize - margin ||
      this.y < margin || this.y > worldSize - margin;
      
    if (hasInvalidPosition) {
      console.warn(`Ship ${this.playerName} has invalid position: (${this.x}, ${this.y}). Setting to world center.`);
      this.x = worldSize / 2;
      this.y = worldSize / 2;
      wasFixed = true;
    }
    
    // Check if sprite exists
    if (!this.sprite) {
      console.warn(`Ship ${this.playerName} has no sprite. Recreating.`);
      this.sprite = this.createShipSprite();
      wasFixed = true;
    }
    
    // If any fixes were applied, update sprite position
    if (wasFixed) {
      this.updateSpritePosition();
    }
    
    return wasFixed;
  }
} 