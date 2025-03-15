/**
 * ProjectilePool - A specialized object pool for projectiles
 * This helps reduce garbage collection by reusing projectile objects
 */

import { Projectile, ProjectileType } from './Projectile';
import { ObjectPool } from '../utils/ObjectPool';
import * as Logger from '../utils/Logger';

export class ProjectilePool {
  private static instance: ProjectilePool;
  private cannonBallPool: ObjectPool<Projectile>;
  private torpedoPool: ObjectPool<Projectile>;
  
  constructor() {
    // Create separate pools for each projectile type
    this.cannonBallPool = new ObjectPool<Projectile>(
      () => new Projectile(ProjectileType.CANNON_BALL, 0, 0, 0, ''),
      (projectile) => {
        // Reset method is called when an object is returned to the pool
        if (projectile.sprite) {
          (projectile.sprite as any).visible = false;
        }
      },
      10, // Initial pool size
      100 // Maximum pool size
    );
    
    this.torpedoPool = new ObjectPool<Projectile>(
      () => new Projectile(ProjectileType.TORPEDO, 0, 0, 0, ''),
      (projectile) => {
        // Reset method is called when an object is returned to the pool
        if (projectile.sprite) {
          (projectile.sprite as any).visible = false;
        }
      },
      5, // Initial pool size
      50 // Maximum pool size
    );
  }
  
  /**
   * Get the singleton instance of the ProjectilePool
   */
  public static getInstance(): ProjectilePool {
    if (!this.instance) {
      this.instance = new ProjectilePool();
    }
    return this.instance;
  }
  
  /**
   * Get a projectile from the pool
   */
  public getProjectile(
    type: ProjectileType, 
    x: number, 
    y: number, 
    rotation: number, 
    sourceId: string
  ): Projectile {
    try {
      // Get the appropriate pool based on projectile type
      const pool = type === ProjectileType.CANNON_BALL ? this.cannonBallPool : this.torpedoPool;
      
      // Get a projectile from the pool
      const projectile = pool.get();
      
      // Reset the projectile to the desired state
      projectile.reset(type, x, y, rotation, sourceId);
      
      return projectile;
    } catch (error) {
      Logger.error('ProjectilePool.getProjectile', error);
      
      // Fallback: Create a new projectile if the pool fails
      return new Projectile(type, x, y, rotation, sourceId);
    }
  }
  
  /**
   * Return a projectile to the pool
   */
  public releaseProjectile(projectile: Projectile): void {
    try {
      if (!projectile) return;
      
      // Get the appropriate pool based on projectile type
      const pool = projectile.type === ProjectileType.CANNON_BALL ? this.cannonBallPool : this.torpedoPool;
      
      // Return the projectile to the pool
      pool.release(projectile);
    } catch (error) {
      Logger.error('ProjectilePool.releaseProjectile', error);
    }
  }
  
  /**
   * Get the size of the pools
   */
  public getPoolSizes(): { cannonBalls: number, torpedoes: number } {
    return {
      cannonBalls: this.cannonBallPool.size(),
      torpedoes: this.torpedoPool.size()
    };
  }
  
  /**
   * Preallocate projectiles to improve performance during gameplay
   */
  public preallocate(cannonBalls: number = 20, torpedoes: number = 10): void {
    this.cannonBallPool.preallocate(cannonBalls);
    this.torpedoPool.preallocate(torpedoes);
  }
} 