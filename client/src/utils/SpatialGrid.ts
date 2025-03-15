/**
 * SpatialGrid - A spatial partitioning system for efficient collision detection
 * This divides the game world into a grid of cells and allows quick queries
 * for entities that are potentially colliding, reducing the number of checks needed
 */

import { Ship } from '../game/Ship';
import { Projectile } from '../game/Projectile';
import * as Logger from './Logger';

// Type for objects that can be stored in the grid
export type GridObject = Ship | Projectile;

// A single cell in the grid
class GridCell {
  public objects: Set<GridObject> = new Set();
  
  public add(object: GridObject): void {
    this.objects.add(object);
  }
  
  public remove(object: GridObject): void {
    this.objects.delete(object);
  }
  
  public clear(): void {
    this.objects.clear();
  }
  
  public getObjects(): GridObject[] {
    return Array.from(this.objects);
  }
  
  public isEmpty(): boolean {
    return this.objects.size === 0;
  }
}

export class SpatialGrid {
  private cells: Map<string, GridCell> = new Map();
  private cellSize: number;
  
  constructor(cellSize: number = 500) {
    this.cellSize = cellSize;
  }
  
  /**
   * Convert world coordinates to grid cell coordinates
   */
  private getCellCoord(value: number): number {
    return Math.floor(value / this.cellSize);
  }
  
  /**
   * Get a unique key for a cell based on its coordinates
   */
  private getCellKey(x: number, y: number): string {
    return `${this.getCellCoord(x)},${this.getCellCoord(y)}`;
  }
  
  /**
   * Get or create a cell at the specified coordinates
   */
  private getCell(x: number, y: number): GridCell {
    const key = this.getCellKey(x, y);
    if (!this.cells.has(key)) {
      this.cells.set(key, new GridCell());
    }
    return this.cells.get(key)!;
  }
  
  /**
   * Add an object to the grid at its current position
   */
  public addObject(object: GridObject): void {
    try {
      const cell = this.getCell(object.x, object.y);
      cell.add(object);
    } catch (error) {
      Logger.error('SpatialGrid.addObject', error);
    }
  }
  
  /**
   * Remove an object from the grid
   */
  public removeObject(object: GridObject): void {
    try {
      // To improve performance, we only need to check the cell at the object's current position
      const cell = this.getCell(object.x, object.y);
      cell.remove(object);
    } catch (error) {
      Logger.error('SpatialGrid.removeObject', error);
    }
  }
  
  /**
   * Update an object's position in the grid
   */
  public updateObject(object: GridObject, oldX: number, oldY: number): void {
    try {
      const oldKey = this.getCellKey(oldX, oldY);
      const newKey = this.getCellKey(object.x, object.y);
      
      // If the object has moved to a different cell, update its position
      if (oldKey !== newKey) {
        if (this.cells.has(oldKey)) {
          this.cells.get(oldKey)!.remove(object);
        }
        this.getCell(object.x, object.y).add(object);
      }
    } catch (error) {
      Logger.error('SpatialGrid.updateObject', error);
    }
  }
  
  /**
   * Clear all cells in the grid
   */
  public clear(): void {
    this.cells.clear();
  }
  
  /**
   * Get all objects in cells near the specified position within a radius
   * This is used to find potential collision candidates
   */
  public getNearbyObjects(x: number, y: number, radius: number = this.cellSize): GridObject[] {
    try {
      const cellX = this.getCellCoord(x);
      const cellY = this.getCellCoord(y);
      
      // Calculate how many cells to check in each direction
      const cellRadius = Math.ceil(radius / this.cellSize);
      const results: Set<GridObject> = new Set();
      
      // Check all cells in a square around the position
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        for (let dy = -cellRadius; dy <= cellRadius; dy++) {
          const key = `${cellX + dx},${cellY + dy}`;
          if (this.cells.has(key)) {
            const cell = this.cells.get(key)!;
            cell.getObjects().forEach(obj => results.add(obj));
          }
        }
      }
      
      return Array.from(results);
    } catch (error) {
      Logger.error('SpatialGrid.getNearbyObjects', error);
      return [];
    }
  }
  
  /**
   * Get all potential collision pairs within the specified radius
   * This is an optimization for collision detection
   */
  public getPotentialCollisionPairs(radius: number = this.cellSize): [GridObject, GridObject][] {
    try {
      const pairs: [GridObject, GridObject][] = [];
      const checked: Set<string> = new Set();
      
      // Check each cell for potential collision pairs
      this.cells.forEach((cell, key) => {
        const objects = cell.getObjects();
        
        // Check for collisions within this cell
        for (let i = 0; i < objects.length; i++) {
          for (let j = i + 1; j < objects.length; j++) {
            const objA = objects[i];
            const objB = objects[j];
            
            // Create a unique key for this pair
            const pairKey = `${objA.id}:${objB.id}`;
            
            // Skip if we've already checked this pair
            if (checked.has(pairKey)) continue;
            
            // Add this pair to the results
            pairs.push([objA, objB]);
            checked.add(pairKey);
          }
        }
      });
      
      return pairs;
    } catch (error) {
      Logger.error('SpatialGrid.getPotentialCollisionPairs', error);
      return [];
    }
  }
} 