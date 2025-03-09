export class InputHandler {
  private keys: { [key: string]: boolean };
  private previousKeys: { [key: string]: boolean };
  private mousePosition: { x: number, y: number };
  private mouseButtons: { [button: number]: boolean };
  private keyPressedThisFrame: { [key: string]: boolean } = {};

  constructor() {
    this.keys = {};
    this.previousKeys = {};
    this.mousePosition = { x: 0, y: 0 };
    this.mouseButtons = {};

    // Set up event listeners
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
    window.addEventListener('mousemove', this.handleMouseMove.bind(this));
    window.addEventListener('mousedown', this.handleMouseDown.bind(this));
    window.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    this.keys[event.code] = true;
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.keys[event.code] = false;
    this.keyPressedThisFrame[event.code] = false;
  }

  private handleMouseMove(event: MouseEvent): void {
    this.mousePosition.x = event.clientX;
    this.mousePosition.y = event.clientY;
  }

  private handleMouseDown(event: MouseEvent): void {
    this.mouseButtons[event.button] = true;
  }

  private handleMouseUp(event: MouseEvent): void {
    this.mouseButtons[event.button] = false;
  }

  public isKeyDown(code: string): boolean {
    return this.keys[code] === true;
  }

  public isKeyPressed(code: string): boolean {
    if (this.keys[code] === true && this.keyPressedThisFrame[code] !== true) {
      this.keyPressedThisFrame[code] = true;
      return true;
    }
    return false;
  }

  public isKeyReleased(code: string): boolean {
    const isReleased = this.keys[code] !== true && this.previousKeys[code] === true;
    return isReleased;
  }

  public isMouseButtonDown(button: number): boolean {
    return this.mouseButtons[button] === true;
  }

  public getMousePosition(): { x: number, y: number } {
    return { ...this.mousePosition };
  }

  public update(): void {
    // Store current key states for next frame comparison
    this.previousKeys = { ...this.keys };
    // Reset key pressed this frame if key is no longer down
    for (const key in this.keyPressedThisFrame) {
      if (this.keys[key] !== true) {
        this.keyPressedThisFrame[key] = false;
      }
    }
  }

  public cleanup(): void {
    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    window.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    window.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    window.removeEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  public isMouseOver(object: any): boolean {
    if (!object || !object.getBounds) {
      return false;
    }
    
    const bounds = object.getBounds();
    return (
      this.mousePosition.x >= bounds.x &&
      this.mousePosition.x <= bounds.x + bounds.width &&
      this.mousePosition.y >= bounds.y &&
      this.mousePosition.y <= bounds.y + bounds.height
    );
  }
} 