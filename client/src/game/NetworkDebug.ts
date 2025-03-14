import * as PIXI from 'pixi.js';
import { NetworkManager } from './NetworkManager';
import { Ship } from './Ship';

/**
 * NetworkDebug - A utility class to help diagnose network synchronization issues
 */
export class NetworkDebug {
  private networkManager: NetworkManager;
  private debugContainer: PIXI.Container;
  private debugText: PIXI.Text;
  private isEnabled: boolean = false;
  private app: PIXI.Application;
  private localPlayerId: string = '';

  constructor(app: PIXI.Application, networkManager: NetworkManager) {
    this.app = app;
    this.networkManager = networkManager;
    this.debugContainer = new PIXI.Container();
    app.stage.addChild(this.debugContainer as any);

    // Create debug text display
    this.debugText = new PIXI.Text('Network Debug: Disabled', {
      fontFamily: 'Arial',
      fontSize: 12,
      fill: 0xFFFFFF,
      align: 'left'
    });
    this.debugText.position.set(10, app.screen.height - 150);
    this.debugContainer.addChild(this.debugText as any);

    // Create toggle button
    const toggleButton = new PIXI.Graphics();
    toggleButton.beginFill(0x333333);
    toggleButton.drawRect(0, 0, 30, 30);
    toggleButton.endFill();
    toggleButton.position.set(10, app.screen.height - 40);
    toggleButton.interactive = true;
    toggleButton.cursor = 'pointer';
    toggleButton.on('pointerdown', this.toggle.bind(this));
    this.debugContainer.addChild(toggleButton as any);

    // Create button text
    const buttonText = new PIXI.Text('D', {
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xFFFFFF,
      align: 'center'
    });
    buttonText.anchor.set(0.5);
    buttonText.position.set(toggleButton.x + 15, toggleButton.y + 15);
    this.debugContainer.addChild(buttonText as any);

    // Update on window resize
    window.addEventListener('resize', () => {
      this.debugText.position.set(10, app.screen.height - 150);
      toggleButton.position.set(10, app.screen.height - 40);
      buttonText.position.set(toggleButton.x + 15, toggleButton.y + 15);
    });
  }

  /**
   * Toggle debug display
   */
  public toggle(): void {
    this.isEnabled = !this.isEnabled;
    this.debugText.text = `Network Debug: ${this.isEnabled ? 'Enabled' : 'Disabled'}`;
    console.log(`Network debug ${this.isEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set the local player ID
   */
  public setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  /**
   * Update the debug display
   */
  public update(): void {
    if (!this.isEnabled) return;

    const ships = this.networkManager.getAllShips();
    const connectionStatus = this.networkManager.getConnectionStatus();
    
    let debugInfo = `Network Debug (Enabled)\n`;
    debugInfo += `Connection: ${connectionStatus}\n`;
    debugInfo += `Local Player ID: ${this.localPlayerId}\n`;
    debugInfo += `Total Players: ${ships.length}\n\n`;
    
    // Display info for each player
    ships.forEach((ship: Ship) => {
      const isLocal = ship.playerId === this.localPlayerId;
      debugInfo += `Player: ${ship.playerName} (${ship.playerId})${isLocal ? ' - YOU' : ''}\n`;
      debugInfo += `  Position: x=${Math.round(ship.x)}, y=${Math.round(ship.y)}\n`;
      debugInfo += `  Sprite Visible: ${ship.sprite.visible}\n`;
      debugInfo += `  Sprite Has Parent: ${!!ship.sprite.parent}\n`;
      debugInfo += `  Name Visible: ${(ship as any).nameContainer?.visible || false}\n`;
      debugInfo += `  Hull: ${ship.hull}\n\n`;
    });
    
    this.debugText.text = debugInfo;
  }

  /**
   * Force a visibility check on all players
   */
  public checkVisibility(): void {
    console.log('Checking player visibility...');
    const ships = this.networkManager.getAllShips();
    
    ships.forEach((ship: Ship) => {
      const isLocal = ship.playerId === this.localPlayerId;
      console.log(`Player: ${ship.playerName} (${ship.playerId})${isLocal ? ' - YOU' : ''}`);
      console.log(`  Position: x=${Math.round(ship.x)}, y=${Math.round(ship.y)}`);
      console.log(`  Sprite Visible: ${ship.sprite.visible}`);
      console.log(`  Sprite Has Parent: ${!!ship.sprite.parent}`);
      
      // Check if sprite is in the display list
      if (!ship.sprite.visible && ship.sprite.parent) {
        console.log('  Forcing sprite to be visible');
        ship.sprite.visible = true;
      }
      
      // Check name container
      if ((ship as any).nameContainer) {
        console.log(`  Name Container Visible: ${(ship as any).nameContainer.visible}`);
        console.log(`  Name Container Has Parent: ${!!(ship as any).nameContainer.parent}`);
        
        if (!(ship as any).nameContainer.visible && (ship as any).nameContainer.parent) {
          console.log('  Forcing name container to be visible');
          (ship as any).nameContainer.visible = true;
        }
      }
      
      // Force update sprite position
      ship.updateSpritePosition();
    });
  }

  /**
   * Force a reconnection to the server
   */
  public forceReconnect(): void {
    console.log('Forcing reconnection to server...');
    this.networkManager.cleanup();
    // Wait a moment before reconnecting
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }
} 