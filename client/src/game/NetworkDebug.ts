import * as PIXI from 'pixi.js';
import { NetworkManager } from './NetworkManager';

/**
 * NetworkDebug - Stubbed version for production
 * This class maintains the interface but disables all debug functionality.
 */
export class NetworkDebug {
  constructor(app: PIXI.Application, networkManager: NetworkManager) {
    // Stub constructor - does nothing
  }

  /**
   * Toggle debug display - disabled in production
   */
  public toggle(): void {
    // Debug disabled in production
  }

  /**
   * Set the local player ID - disabled in production
   */
  public setLocalPlayerId(id: string): void {
    // Debug disabled in production
  }

  /**
   * Update the debug display - disabled in production
   */
  public update(): void {
    // Debug disabled in production
  }

  /**
   * Force a visibility check on all players - disabled in production
   */
  public checkVisibility(): void {
    // Debug disabled in production
  }

  /**
   * Force a reconnection to the server - disabled in production
   */
  public forceReconnect(): void {
    // Debug disabled in production
  }
} 