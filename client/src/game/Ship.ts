import * as PIXI from 'pixi.js';

// Global reference to the NetworkManager for damage reporting
let networkManagerRef: any = null;

// Export function to set the NetworkManager reference
export function setNetworkManagerRef(networkManager: any): void {
  networkManagerRef = networkManager;
}

// Ship types
type ShipType = 'destroyer' | 'cruiser' | 'battleship';

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
}

// Collision data for different ship types
const SHIP_COLLISION_DATA = {
  destroyer: { radius: 25, width: 40, height: 15, damage: 1.0 },
  cruiser: { radius: 35, width: 60, height: 20, damage: 1.5 },
  battleship: { radius: 45, width: 80, height: 25, damage: 2.0 }
};

// Array of bright, distinct colors that stand out against blue background
const SHIP_COLORS = [
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
  x: number;
  y: number;
  rotation: number;
  speed: number;
  maxSpeed: number;
  acceleration: number;
  rotationSpeed: number;
  
  // Ship properties
  hull: number;
  maxHull: number;
  type: ShipType;
  playerId: string;
  color: number;
  
  // Collision properties
  collisionRadius: number;
  collisionWidth: number;
  collisionHeight: number;
  collisionDamageMultiplier: number;
  isColliding: boolean = false;
  lastCollisionTime: number = 0;
  collisionCooldown: number = 500; // ms
  
  // Ship control settings
  throttleSetting: ThrottleSetting = ThrottleSetting.STOP;
  rudderSetting: RudderSetting = RudderSetting.AHEAD;
  
  // Target speed based on throttle setting
  targetSpeed: number = 0;
  
  // PIXI sprite
  sprite: PIXI.Sprite;
  
  constructor(props: ShipProps) {
    // Set initial properties
    this.x = props.x;
    this.y = props.y;
    this.rotation = props.rotation;
    this.speed = props.speed;
    this.maxSpeed = props.maxSpeed;
    this.acceleration = props.acceleration;
    this.rotationSpeed = props.rotationSpeed;
    this.hull = props.hull;
    this.maxHull = props.hull; // Store the initial hull value as maxHull
    this.type = props.type;
    this.playerId = props.playerId || 'local';
    
    // Set collision properties based on ship type
    const collisionData = SHIP_COLLISION_DATA[this.type];
    this.collisionRadius = collisionData.radius;
    this.collisionWidth = collisionData.width;
    this.collisionHeight = collisionData.height;
    this.collisionDamageMultiplier = collisionData.damage;
    
    // Assign a color based on player ID
    this.color = this.getColorForPlayer(this.playerId);
    
    // Create ship sprite based on type
    this.sprite = this.createShipSprite();
    
    // Set initial position and rotation
    this.updateSpritePosition();
  }
  
  // Get a color based on player ID
  private getColorForPlayer(playerId: string): number {
    // For local player, always use bright orange
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
  
  createShipSprite(): PIXI.Sprite {
    // Create a canvas for the ship
    const canvas = document.createElement('canvas');
    const size = this.type === 'destroyer' ? 40 : 
                 this.type === 'cruiser' ? 50 : 60;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Convert hex color to RGB for canvas
      const r = (this.color >> 16) & 255;
      const g = (this.color >> 8) & 255;
      const b = this.color & 255;
      const colorStr = `rgb(${r},${g},${b})`;
      
      // Draw ship with the assigned color
      ctx.fillStyle = colorStr;
      
      // Draw ship shape based on type
      ctx.beginPath();
      
      // Ship body
      const width = this.type === 'destroyer' ? size * 0.5 : 
                    this.type === 'cruiser' ? size * 0.6 : size * 0.7;
      const length = this.type === 'destroyer' ? size * 0.8 : 
                     this.type === 'cruiser' ? size * 0.85 : size * 0.9;
      
      // Draw a more detailed ship shape
      ctx.moveTo(size/2, size/2 - length/2); // Front of ship
      ctx.lineTo(size/2 + width/2, size/2 + length/3); // Right side
      ctx.lineTo(size/2 + width/3, size/2 + length/2); // Right back corner
      ctx.lineTo(size/2 - width/3, size/2 + length/2); // Left back corner
      ctx.lineTo(size/2 - width/2, size/2 + length/3); // Left side
      ctx.closePath();
      ctx.fill();
      
      // Add details to make the ship more visible
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // White for details
      
      // Draw a bridge/tower on the ship
      const towerWidth = width * 0.3;
      const towerHeight = length * 0.2;
      const towerX = size/2 - towerWidth/2;
      const towerY = size/2 - towerHeight/2;
      ctx.fillRect(towerX, towerY, towerWidth, towerHeight);
      
      // Add an outline to make the ship stand out more
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add player ID text for debugging (small and at the bottom)
      ctx.fillStyle = 'white';
      ctx.font = '8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.playerId.substring(0, 4), size/2, size - 5);
    }
    
    const texture = PIXI.Texture.from(canvas);
    const sprite = new PIXI.Sprite(texture);
    
    // Set anchor to center
    sprite.anchor.set(0.5);
    
    return sprite;
  }
  
  updateSpritePosition(): void {
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    this.sprite.rotation = this.rotation;
  }
  
  // Set throttle to a specific setting
  setThrottle(setting: ThrottleSetting): void {
    this.throttleSetting = setting;
    
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
    if (this.throttleSetting < ThrottleSetting.FLANK) {
      this.setThrottle(this.throttleSetting + 1);
    }
  }
  
  // Decrease throttle by one step
  decreaseThrottle(): void {
    if (this.throttleSetting > ThrottleSetting.REVERSE_FULL) {
      this.setThrottle(this.throttleSetting - 1);
    }
  }
  
  // Set rudder to a specific setting
  setRudder(setting: RudderSetting): void {
    this.rudderSetting = setting;
  }
  
  // Turn rudder more to the left
  turnRudderLeft(): void {
    if (this.rudderSetting > RudderSetting.FULL_LEFT) {
      this.rudderSetting--;
    }
  }
  
  // Turn rudder more to the right
  turnRudderRight(): void {
    if (this.rudderSetting < RudderSetting.FULL_RIGHT) {
      this.rudderSetting++;
    }
  }
  
  // Center the rudder
  centerRudder(): void {
    this.rudderSetting = RudderSetting.AHEAD;
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
    
    switch (this.rudderSetting) {
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
    const driftFactor = 0.1 * speedFactor * Math.abs(this.rudderSetting);
    const driftAngle = this.rotation + (this.rudderSetting < 0 ? -Math.PI/2 : Math.PI/2);
    
    // Update position based on speed, rotation, and drift
    this.x += Math.sin(this.rotation) * this.speed * delta;
    this.y -= Math.cos(this.rotation) * this.speed * delta;
    
    // Add drift component
    if (Math.abs(this.rudderSetting) > 0 && Math.abs(this.speed) > 0.5) {
      this.x += Math.sin(driftAngle) * driftFactor * delta;
      this.y -= Math.cos(driftAngle) * driftFactor * delta;
    }
    
    // Update sprite position and rotation
    this.updateSpritePosition();
  }
  
  /**
   * Check if this ship collides with another ship
   * @param otherShip The other ship to check collision with
   * @returns True if the ships are colliding, false otherwise
   */
  checkCollision(otherShip: Ship): boolean {
    // Don't collide with self
    if (this.playerId === otherShip.playerId) {
      return false;
    }
    
    // Simple circle collision detection
    const dx = this.x - otherShip.x;
    const dy = this.y - otherShip.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = this.collisionRadius + otherShip.collisionRadius;
    
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
    const thisImpactForce = relativeSpeed * this.collisionDamageMultiplier;
    
    // Apply damage based on collision force
    const damageAmount = Math.ceil(thisImpactForce * 10);
    if (damageAmount > 0) {
      this.takeDamage(damageAmount);
      
      // Report damage to the server if this is the local player
      if (this.playerId === 'local' && networkManagerRef && otherShip.playerId !== 'local') {
        networkManagerRef.reportDamage(otherShip.playerId, damageAmount);
      }
      
      // Add collision response - push ships away from each other
      const pushForce = 0.5;
      const angle = Math.atan2(this.y - otherShip.y, this.x - otherShip.x);
      this.x += Math.cos(angle) * pushForce;
      this.y += Math.sin(angle) * pushForce;
      
      // Create collision effect
      this.createCollisionEffect();
    }
  }
  
  /**
   * Create visual effect for collision
   */
  createCollisionEffect(): void {
    // In a real implementation, we would create particle effects
    // For now, just flash the ship sprite
    const originalTint = this.sprite.tint;
    this.sprite.tint = 0xFFFFFF; // Flash white
    
    // Reset tint after a short delay
    setTimeout(() => {
      this.sprite.tint = originalTint;
      this.isColliding = false;
    }, 100);
  }
  
  /**
   * Apply damage to the ship
   * @param amount Amount of damage to apply
   */
  takeDamage(amount: number): void {
    this.hull -= amount;
    console.log(`Ship ${this.playerId} took ${amount} damage. Hull: ${this.hull}/${this.maxHull}`);
    
    // Update ship appearance based on damage
    this.updateDamageAppearance();
    
    // Check if ship is destroyed
    if (this.hull <= 0) {
      this.destroy();
    }
  }
  
  /**
   * Update ship appearance based on current damage
   */
  updateDamageAppearance(): void {
    // Calculate damage percentage
    const damagePercent = 1 - (this.hull / this.maxHull);
    
    // Apply visual effects based on damage level
    if (damagePercent > 0.7) {
      // Heavily damaged - add red tint
      this.sprite.tint = this.blendColors(this.color, 0xFF0000, 0.5);
    } else if (damagePercent > 0.3) {
      // Moderately damaged - slight red tint
      this.sprite.tint = this.blendColors(this.color, 0xFF0000, 0.2);
    } else {
      // Minimal damage - normal color
      this.sprite.tint = this.color;
    }
  }
  
  /**
   * Blend two colors together
   * @param color1 First color
   * @param color2 Second color
   * @param ratio Blend ratio (0-1)
   * @returns Blended color
   */
  private blendColors(color1: number, color2: number, ratio: number): number {
    const r1 = (color1 >> 16) & 0xFF;
    const g1 = (color1 >> 8) & 0xFF;
    const b1 = color1 & 0xFF;
    
    const r2 = (color2 >> 16) & 0xFF;
    const g2 = (color2 >> 8) & 0xFF;
    const b2 = color2 & 0xFF;
    
    const r = Math.floor(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.floor(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.floor(b1 * (1 - ratio) + b2 * ratio);
    
    return (r << 16) | (g << 8) | b;
  }
  
  /**
   * Destroy the ship
   */
  destroy(): void {
    console.log(`Ship ${this.playerId} was destroyed!`);
    
    // Create explosion effect
    this.createExplosionEffect();
    
    // Hide the ship
    this.sprite.visible = false;
  }
  
  /**
   * Create explosion effect when ship is destroyed
   */
  createExplosionEffect(): void {
    // In a real implementation, we would create particle effects
    // For now, just log a message
    console.log(`Explosion at ${this.x}, ${this.y}`);
  }
} 