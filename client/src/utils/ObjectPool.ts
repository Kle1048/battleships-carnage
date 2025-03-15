/**
 * ObjectPool - A generic object pool for efficient object reuse
 * Instead of creating and destroying objects repeatedly, this pool allows
 * reusing objects that are no longer needed, reducing memory allocation and GC pauses
 */

import * as Logger from './Logger';

export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;
  
  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    initialSize: number = 0,
    maxSize: number = 1000
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    
    // Pre-populate the pool with initial objects
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }
  
  /**
   * Get an object from the pool or create a new one if the pool is empty
   */
  public get(): T {
    try {
      if (this.pool.length > 0) {
        return this.pool.pop()!;
      } else {
        return this.createFn();
      }
    } catch (error) {
      Logger.error('ObjectPool.get', error);
      return this.createFn();
    }
  }
  
  /**
   * Return an object to the pool for future reuse
   */
  public release(obj: T): void {
    try {
      // Only add the object back to the pool if we haven't reached the max size
      if (this.pool.length < this.maxSize) {
        this.resetFn(obj);
        this.pool.push(obj);
      }
    } catch (error) {
      Logger.error('ObjectPool.release', error);
    }
  }
  
  /**
   * Get the current size of the pool
   */
  public size(): number {
    return this.pool.length;
  }
  
  /**
   * Clear the pool and release all objects
   */
  public clear(): void {
    this.pool = [];
  }
  
  /**
   * Pre-populate the pool with additional objects
   */
  public preallocate(count: number): void {
    try {
      for (let i = 0; i < count; i++) {
        if (this.pool.length < this.maxSize) {
          this.pool.push(this.createFn());
        } else {
          break;
        }
      }
    } catch (error) {
      Logger.error('ObjectPool.preallocate', error);
    }
  }
} 