import * as PIXI from 'pixi.js';
import { Ship } from './Ship';

// Projectile types
export enum ProjectileType {
  CANNON_BALL = 'cannonBall',
  TORPEDO = 'torpedo'
}

// Projectile properties by type
const PROJECTILE_PROPERTIES = {
  [ProjectileType.CANNON_BALL]: {
    speed: 5,
    damage: 15,
    radius: 5,
    lifetime: 120, // frames
    color: 0x333333
  },
  [ProjectileType.TORPEDO]: {
    speed: 3,
    damage: 30,
    radius: 8,
    lifetime: 240, // frames
    color: 0x666666
  }
};

export class Projectile {
  public x: number;
  public y: number;
  public rotation: number;
  public type: ProjectileType;
  public sprite: PIXI.Graphics;
  public speed: number;
  public damage: number;
  public radius: number;
  public lifetime: number;
  public currentLifetime: number;
  public sourceShip: Ship;
  public sourceId: string;
  public id: string;
  
  constructor(
    x: number, 
    y: number, 
    rotation: number, 
    type: ProjectileType, 
    sourceShip: Ship
  ) {
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.type = type;
    this.sourceShip = sourceShip;
    this.sourceId = sourceShip.id;
    this.id = `${this.sourceId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Set properties based on type
    const properties = PROJECTILE_PROPERTIES[type];
    this.speed = properties.speed;
    this.damage = properties.damage;
    this.radius = properties.radius;
    this.lifetime = properties.lifetime;
    this.currentLifetime = 0;
    
    // Create sprite
    this.sprite = this.createProjectileSprite();
  }
  
  private createProjectileSprite(): PIXI.Graphics {
    const properties = PROJECTILE_PROPERTIES[this.type];
    const sprite = new PIXI.Graphics();
    
    // Draw different projectile types
    if (this.type === ProjectileType.CANNON_BALL) {
      // Draw a circle for cannon ball
      sprite.beginFill(properties.color);
      sprite.drawCircle(0, 0, this.radius);
      sprite.endFill();
    } else if (this.type === ProjectileType.TORPEDO) {
      // Draw an elongated shape for torpedo
      sprite.beginFill(properties.color);
      sprite.drawEllipse(0, 0, this.radius * 2, this.radius);
      sprite.endFill();
      
      // Add a small trail
      sprite.beginFill(0xaaaaaa, 0.7);
      sprite.drawCircle(-this.radius * 1.5, 0, this.radius / 2);
      sprite.endFill();
    }
    
    sprite.x = this.x;
    sprite.y = this.y;
    sprite.rotation = this.rotation;
    
    return sprite;
  }
  
  public update(): boolean {
    // Update lifetime
    this.currentLifetime++;
    if (this.currentLifetime >= this.lifetime) {
      return false; // Projectile should be removed
    }
    
    // Update position based on velocity
    const vx = Math.cos(this.rotation) * this.speed;
    const vy = Math.sin(this.rotation) * this.speed;
    this.x += vx;
    this.y += vy;
    
    // Update sprite position
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    
    // Add some visual effects based on projectile type
    if (this.type === ProjectileType.TORPEDO && this.currentLifetime % 5 === 0) {
      // Add bubbles or wake effect for torpedoes
      // This would be expanded in a more complete implementation
    }
    
    return true; // Projectile is still active
  }
  
  public checkCollision(ship: Ship): boolean {
    // Don't collide with the source ship
    if (ship.id === this.sourceId) {
      return false;
    }
    
    // Simple circle collision detection
    const dx = this.x - ship.x;
    const dy = this.y - ship.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance < (this.radius + ship.collisionRadius);
  }
  
  public applyDamage(ship: Ship): void {
    // Apply damage to the ship
    ship.takeDamage(this.damage);
    
    // Add visual effect for hit
    this.createHitEffect();
  }
  
  private createHitEffect(): void {
    // This would create visual effects when a projectile hits a ship
    // For now, this is a placeholder for future implementation
  }
  
  public destroy(): void {
    // Remove sprite from its parent
    if (this.sprite.parent) {
      this.sprite.parent.removeChild(this.sprite);
    }
  }
  
  // Serialize for network transmission
  public serialize(): any {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      type: this.type,
      sourceId: this.sourceId
    };
  }
  
  // Create a projectile from serialized data
  public static deserialize(data: any, ships: Map<string, Ship>): Projectile | null {
    const sourceShip = ships.get(data.sourceId);
    if (!sourceShip) {
      console.warn(`Cannot create projectile: source ship ${data.sourceId} not found`);
      return null;
    }
    
    return new Projectile(
      data.x,
      data.y,
      data.rotation,
      data.type as ProjectileType,
      sourceShip
    );
  }
} 