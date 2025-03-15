/**
 * DeltaCompression - Utilities for efficient network updates
 * This reduces network traffic by only sending changes between states
 * rather than the complete state each time
 */

import * as Logger from './Logger';

// Type for any object with properties
type StateObject = { [key: string]: any };

export class DeltaCompression {
  // Previous states for each object by ID
  private static previousStates: Map<string, StateObject> = new Map();
  
  // Minimum time between full state updates in milliseconds
  private static fullUpdateInterval: number = 5000;
  
  // Last full update timestamp for each object
  private static lastFullUpdate: Map<string, number> = new Map();
  
  // Properties that should always be included regardless of changes
  private static requiredProps: Set<string> = new Set(['id']);
  
  /**
   * Set the required properties that should always be included in updates
   */
  public static setRequiredProperties(props: string[]): void {
    this.requiredProps = new Set(['id', ...props]);
  }
  
  /**
   * Compress an object state by comparing to previous state
   * and returning only changed properties
   * 
   * @param id Unique identifier for the object
   * @param currentState Current full state of the object
   * @param forceFullUpdate Whether to force a full update regardless of changes
   * @returns Compressed state with only changed properties
   */
  public static compressState(
    id: string,
    currentState: StateObject,
    forceFullUpdate: boolean = false
  ): StateObject {
    try {
      // Get the current time
      const now = Date.now();
      
      // Check if we need a full update due to time passed
      const lastFullUpdateTime = this.lastFullUpdate.get(id) || 0;
      const needsFullUpdate = forceFullUpdate || 
        !this.previousStates.has(id) ||
        (now - lastFullUpdateTime > this.fullUpdateInterval);
      
      // If no previous state or force full update, return full state
      if (needsFullUpdate) {
        // Update full update timestamp
        this.lastFullUpdate.set(id, now);
        
        // Store current state for future comparison
        this.previousStates.set(id, { ...currentState });
        
        // Return full state
        return { ...currentState, _full: true };
      }
      
      // Get previous state
      const previousState = this.previousStates.get(id) || {};
      
      // Create delta with only changed properties
      const delta: StateObject = { id: currentState.id };
      let hasChanges = false;
      
      // Check each property for changes
      for (const key in currentState) {
        // Skip properties that start with underscore (metadata)
        if (key.startsWith('_')) continue;
        
        // Always include required properties
        if (this.requiredProps.has(key)) {
          delta[key] = currentState[key];
          continue;
        }
        
        if (!Object.prototype.hasOwnProperty.call(previousState, key) || 
            !this.isEqual(previousState[key], currentState[key])) {
          delta[key] = currentState[key];
          hasChanges = true;
        }
      }
      
      // If nothing changed (except required props), return minimal object
      if (!hasChanges) {
        // Return object with just the ID
        const minimal: StateObject = { id: currentState.id, _minimal: true };
        
        // Convert requiredProps Set to Array before iterating
        Array.from(this.requiredProps).forEach(key => {
          minimal[key] = currentState[key];
        });
        
        return minimal;
      }
      
      // Update previous state
      this.previousStates.set(id, { ...currentState });
      
      return delta;
    } catch (error) {
      Logger.error('DeltaCompression.compressState', error);
      // In case of error, return full state to ensure consistency
      return { ...currentState };
    }
  }
  
  /**
   * Decompress a delta update by merging with previous state
   * 
   * @param id Unique identifier for the object
   * @param delta Delta state containing only changed properties
   * @returns Full object state after applying delta changes
   */
  public static decompressState(id: string, delta: StateObject): StateObject {
    try {
      // If delta has _full flag, it's already a complete state
      if (delta._full) {
        // Store the complete state for future deltas
        const fullState = { ...delta };
        delete fullState._full;
        this.previousStates.set(id, fullState);
        return fullState;
      }
      
      // If _minimal flag is present, nothing important changed
      if (delta._minimal) {
        // Return previous state if available
        if (this.previousStates.has(id)) {
          return this.previousStates.get(id)!;
        }
        // Otherwise return delta as is (without _minimal flag)
        const minimalState = { ...delta };
        delete minimalState._minimal;
        return minimalState;
      }
      
      // Get previous state or empty object if none exists
      const previousState = this.previousStates.get(id) || {};
      
      // Create new state by merging previous state with delta
      const newState = { ...previousState, ...delta };
      
      // Store new state for future deltas
      this.previousStates.set(id, newState);
      
      return newState;
    } catch (error) {
      Logger.error('DeltaCompression.decompressState', error);
      // In case of error, return delta as is to ensure something is returned
      return delta;
    }
  }
  
  /**
   * Check if a full update is needed for an object
   */
  public static needsFullUpdate(id: string): boolean {
    // If no previous state or too much time since last full update
    return !this.previousStates.has(id) ||
      !this.lastFullUpdate.has(id) ||
      (Date.now() - (this.lastFullUpdate.get(id) || 0) > this.fullUpdateInterval);
  }
  
  /**
   * Reset the state for a specific object
   */
  public static resetState(id: string): void {
    this.previousStates.delete(id);
    this.lastFullUpdate.delete(id);
  }
  
  /**
   * Clear all stored states (for cleanup)
   */
  public static clearAllStates(): void {
    this.previousStates.clear();
    this.lastFullUpdate.clear();
  }
  
  /**
   * Helper method to check if two values are equal
   */
  private static isEqual(a: any, b: any): boolean {
    // Handle primitive types
    if (a === b) return true;
    
    // Handle null/undefined
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    
    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.isEqual(a[i], b[i])) return false;
      }
      return true;
    }
    
    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      
      if (keysA.length !== keysB.length) return false;
      
      for (const key of Array.from(keysA)) {
        if (!this.isEqual(a[key], b[key])) return false;
      }
      
      return true;
    }
    
    // Handle numbers (special case for NaN)
    if (typeof a === 'number' && typeof b === 'number') {
      if (isNaN(a) && isNaN(b)) return true;
    }
    
    // Different types or values
    return false;
  }
} 