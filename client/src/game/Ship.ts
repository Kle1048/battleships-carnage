import * as PIXI from 'pixi.js';

// Ship types
type ShipType = 'destroyer' | 'cruiser' | 'battleship';

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
  type: ShipType;
  playerId: string;
  color: number;
  
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
    this.type = props.type;
    this.playerId = props.playerId || 'local';
    
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
  
  accelerate(): void {
    this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
  }
  
  decelerate(): void {
    this.speed = Math.max(this.speed - this.acceleration, -this.maxSpeed / 2);
  }
  
  rotateLeft(): void {
    this.rotation -= this.rotationSpeed;
  }
  
  rotateRight(): void {
    this.rotation += this.rotationSpeed;
  }
  
  update(delta: number): void {
    // Apply momentum - gradually slow down if not accelerating
    if (Math.abs(this.speed) > 0.01) {
      this.speed *= 0.98;
    } else {
      this.speed = 0;
    }
    
    // Update position based on speed and rotation
    this.x += Math.sin(this.rotation) * this.speed * delta;
    this.y -= Math.cos(this.rotation) * this.speed * delta;
    
    // Update sprite position and rotation
    this.updateSpritePosition();
  }
  
  takeDamage(amount: number): void {
    this.hull -= amount;
    
    // Check if ship is destroyed
    if (this.hull <= 0) {
      this.destroy();
    }
  }
  
  destroy(): void {
    // In a real implementation, we would create explosion effects
    // and remove the ship from the game
    this.sprite.visible = false;
  }
} 