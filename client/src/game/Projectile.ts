import * as PIXI from 'pixi.js';
import { Ship } from './Ship';
import { GameEntity } from './GameEntity';
import { v4 as uuidv4 } from 'uuid';
import * as Logger from '../utils/Logger';

// Projectile types with different properties
export enum ProjectileType {
  CANNON_BALL = 'cannonBall',
  TORPEDO = 'torpedo'
}

// Projectile properties by type
const PROJECTILE_PROPERTIES = {
  [ProjectileType.CANNON_BALL]: {
    speed: 4.5,
    damage: 10,
    range: 800,
    radius: 3,
    color: 0xdddddd
  },
  [ProjectileType.TORPEDO]: {
    speed: 3.0,
    damage: 25,
    range: 1000,
    radius: 5,
    color: 0x333333
  }
};

// Interface for projectile serialization
export interface ProjectileData {
  id: string;
  type: ProjectileType;
  x: number;
  y: number;
  rotation: number;
  sourceId: string;
  spawnTimestamp: number;
}

export class Projectile implements GameEntity {
  public id: string;
  public type: ProjectileType;
  public x: number;
  public y: number;
  public rotation: number;
  public speed: number;
  public damage: number;
  public maxRange: number;
  public radius: number;
  public sourceId: string;
  public sprite: PIXI.DisplayObject;
  public distanceTraveled: number = 0;
  public spawnTimestamp: number;
  public sourceShipCollisionChecked: boolean = false;
  
  constructor(
    type: ProjectileType, 
    x: number, 
    y: number, 
    rotation: number, 
    sourceId: string
  ) {
    this.id = uuidv4();
    this.type = type;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.sourceId = sourceId;
    this.spawnTimestamp = Date.now();
    
    // Set properties based on type
    const props = PROJECTILE_PROPERTIES[type];
    this.speed = props.speed;
    this.damage = props.damage;
    this.maxRange = props.range;
    this.radius = props.radius;
    
    // Create sprite
    this.sprite = this.createProjectileSprite();
    
    // Update sprite position
    this.updateSpritePosition();
  }
  
  /**
   * Reset a projectile to be reused (for object pooling)
   */
  public reset(
    type: ProjectileType, 
    x: number, 
    y: number, 
    rotation: number, 
    sourceId: string
  ): void {
    // Generate a new ID for this reused projectile
    this.id = uuidv4();
    this.type = type;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.sourceId = sourceId;
    this.spawnTimestamp = Date.now();
    this.distanceTraveled = 0;
    this.sourceShipCollisionChecked = false;
    
    // Set properties based on type
    const props = PROJECTILE_PROPERTIES[type];
    this.speed = props.speed;
    this.damage = props.damage;
    this.maxRange = props.range;
    this.radius = props.radius;
    
    // Recreate the sprite if needed
    if (!this.sprite) {
      this.sprite = this.createProjectileSprite();
    } else {
      // Update sprite appearance based on type
      try {
        const graphics = this.sprite as PIXI.Graphics;
        graphics.clear();
        
        if (type === ProjectileType.CANNON_BALL) {
          graphics.beginFill(props.color);
          graphics.drawCircle(0, 0, this.radius);
          graphics.endFill();
        } else if (type === ProjectileType.TORPEDO) {
          graphics.beginFill(props.color);
          graphics.drawRect(-this.radius * 1.5, -this.radius / 2, this.radius * 3, this.radius);
          graphics.endFill();
        }
      } catch (error) {
        Logger.error('Projectile.reset', error);
        // If updating the existing sprite fails, create a new one
        this.sprite = this.createProjectileSprite();
      }
    }
    
    // Make sure the sprite is visible
    if (this.sprite) {
      (this.sprite as PIXI.Graphics).visible = true;
    }
    
    // Update sprite position
    this.updateSpritePosition();
  }
  
  private createProjectileSprite(): PIXI.DisplayObject {
    const graphics = new PIXI.Graphics();
    
    if (this.type === ProjectileType.CANNON_BALL) {
      graphics.beginFill(PROJECTILE_PROPERTIES[ProjectileType.CANNON_BALL].color);
      graphics.drawCircle(0, 0, this.radius);
      graphics.endFill();
    } else if (this.type === ProjectileType.TORPEDO) {
      graphics.beginFill(PROJECTILE_PROPERTIES[ProjectileType.TORPEDO].color);
      graphics.drawRect(-this.radius * 1.5, -this.radius / 2, this.radius * 3, this.radius);
      graphics.endFill();
    }
    
    return graphics as unknown as PIXI.DisplayObject;
  }
  
  public update(): boolean {
    try {
      // Calculate movement based on rotation and speed
      const dx = Math.cos(this.rotation) * this.speed;
      const dy = Math.sin(this.rotation) * this.speed;
      
      // Update position
      this.x += dx;
      this.y += dy;
      
      // Update sprite position
      this.updateSpritePosition();
      
      // Update distance traveled
      this.distanceTraveled += Math.sqrt(dx * dx + dy * dy);
      
      // Return false if projectile has traveled its max range
      if (this.distanceTraveled >= this.maxRange) {
        return false;
      }
      
      return true;
    } catch (error) {
      Logger.error('Projectile.update', error);
      return false;
    }
  }
  
  private updateSpritePosition(): void {
    if (this.sprite) {
      try {
        const graphics = this.sprite as PIXI.Graphics;
        graphics.position.set(this.x, this.y);
        graphics.rotation = this.rotation;
      } catch (error) {
        Logger.error('Projectile.updateSpritePosition', error);
      }
    }
  }
  
  public checkCollision(ship: Ship): boolean {
    try {
      // Skip collision with source ship until projectile has traveled a bit
      if (ship.id === this.sourceId) {
        // Only check once per projectile to avoid repeated checks
        if (!this.sourceShipCollisionChecked && this.distanceTraveled > ship.collisionRadius * 3) {
          this.sourceShipCollisionChecked = true;
          return false;
        }
        return false;
      }
      
      // Calculate distance between projectile and ship
      const dx = this.x - ship.x;
      const dy = this.y - ship.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Check if distance is less than sum of radii (simple circle collision)
      return distance < (this.radius + ship.collisionRadius);
    } catch (error) {
      Logger.error('Projectile.checkCollision', error);
      return false;
    }
  }
  
  public createHitEffect(): void {
    try {
      // Create explosion effect
      const explosion = new PIXI.Graphics();
      explosion.beginFill(0xffaa00);
      
      // Size based on projectile type
      const explosionRadius = this.type === ProjectileType.TORPEDO ? 30 : 15;
      
      explosion.drawCircle(0, 0, explosionRadius);
      explosion.endFill();
      explosion.position.set(this.x, this.y);
      
      // Add to same parent as projectile sprite if possible
      if (this.sprite && this.sprite.parent) {
        this.sprite.parent.addChild(explosion as unknown as PIXI.DisplayObject);
      } else {
        // Log an error but don't throw - this is a visual effect only
        Logger.warn('Projectile.createHitEffect', 'Cannot add explosion effect: sprite or parent is null');
        return;
      }
      
      // Create a series of expanding rings
      const rings: PIXI.Graphics[] = [];
      for (let i = 0; i < 3; i++) {
        const ring = new PIXI.Graphics();
        ring.lineStyle(2, 0xffaa00);
        ring.drawCircle(0, 0, explosionRadius * (i + 1) * 0.5);
        ring.position.set(this.x, this.y);
        ring.alpha = 1;
        
        if (this.sprite && this.sprite.parent) {
          this.sprite.parent.addChild(ring as unknown as PIXI.DisplayObject);
          rings.push(ring);
        }
      }
      
      // Animation duration
      const duration = 300; // milliseconds
      const startTime = Date.now();
      
      // Update function for animation
      const explosionUpdate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Update explosion
        explosion.alpha = 1 - progress;
        
        // Update rings
        rings.forEach((ring, i) => {
          // Scale increases over time
          const scale = 1 + progress * (i + 1);
          ring.scale.set(scale);
          
          // Alpha decreases over time, faster for outer rings
          ring.alpha = Math.max(0, 1 - progress * (1 + i * 0.2));
        });
        
        // Continue animation until complete
        if (progress < 1) {
          requestAnimationFrame(explosionUpdate);
        } else {
          // Remove explosion and rings when animation is complete
          if (explosion.parent) {
            explosion.parent.removeChild(explosion as unknown as PIXI.DisplayObject);
          }
          
          rings.forEach(ring => {
            if (ring.parent) {
              ring.parent.removeChild(ring as unknown as PIXI.DisplayObject);
            }
          });
        }
      };
      
      // Start animation
      requestAnimationFrame(explosionUpdate);
    } catch (error) {
      Logger.error('Projectile.createHitEffect', error);
    }
  }
  
  public serialize(): ProjectileData {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      sourceId: this.sourceId,
      spawnTimestamp: this.spawnTimestamp
    };
  }
  
  public destroy(): void {
    try {
      // If sprite has a parent, remove it
      if (this.sprite && this.sprite.parent) {
        this.sprite.parent.removeChild(this.sprite as unknown as PIXI.DisplayObject);
      }
      
      // Clean up PIXI resources
      if (this.sprite) {
        // Only destroy if it's a PIXI object with destroy method
        if ('destroy' in this.sprite && typeof this.sprite.destroy === 'function') {
          (this.sprite as any).destroy({ children: true });
        }
        this.sprite = undefined as unknown as PIXI.DisplayObject;
      }
    } catch (error) {
      Logger.error('Projectile.destroy', error);
    }
  }
  
  /**
   * Create a projectile from serialized data
   */
  public static deserialize(data: ProjectileData): Projectile | null {
    try {
      const projectile = new Projectile(
        data.type,
        data.x,
        data.y,
        data.rotation,
        data.sourceId
      );
      
      // Override ID and timestamp with the ones from data
      projectile.id = data.id;
      projectile.spawnTimestamp = data.spawnTimestamp;
      
      return projectile;
    } catch (error) {
      Logger.error('Projectile.deserialize', error);
      return null;
    }
  }
} 