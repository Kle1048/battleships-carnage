export class InputHandler {
  private keys: { [key: string]: boolean };
  private previousKeys: { [key: string]: boolean };
  private mousePosition: { x: number, y: number };
  private mouseButtons: { [button: number]: boolean };
  private keyPressedThisFrame: { [key: string]: boolean } = {};
  private touchPosition: { x: number, y: number } | null = null;
  private touchActive: boolean = false;
  private isMobileDevice: boolean = false;
  
  // Virtual buttons for mobile controls
  private virtualButtons: { [key: string]: boolean } = {
    'throttleUp': false,
    'throttleDown': false,
    'rudderLeft': false,
    'rudderRight': false,
    'rudderCenter': false,
    'firePrimary': false,
    'fireSecondary': false
  };

  constructor() {
    this.keys = {};
    this.previousKeys = {};
    this.mousePosition = { 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    };
    this.mouseButtons = {};
    
    // Detect if this is a mobile device
    this.isMobileDevice = this.detectMobileDevice();
    console.log('Is mobile device:', this.isMobileDevice);

    // Set up event listeners
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
    window.addEventListener('mousemove', this.handleMouseMove.bind(this));
    window.addEventListener('mousedown', this.handleMouseDown.bind(this));
    window.addEventListener('mouseup', this.handleMouseUp.bind(this));
    
    // Add touch event listeners
    window.addEventListener('touchstart', this.handleTouchStart.bind(this));
    window.addEventListener('touchmove', this.handleTouchMove.bind(this));
    window.addEventListener('touchend', this.handleTouchEnd.bind(this));
    window.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
    
    // Initialize mouse position to center of screen if not set
    if (this.mousePosition.x === 0 && this.mousePosition.y === 0) {
      this.mousePosition.x = window.innerWidth / 2;
      this.mousePosition.y = window.innerHeight / 2;
    }
    
    console.log('InputHandler initialized with mouse position:', this.mousePosition);
  }
  
  // Detect if the device is mobile
  private detectMobileDevice(): boolean {
    // More comprehensive mobile detection
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    
    // First check: user agent patterns for mobile devices
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
    
    // Second check: touch points (most mobile devices support multiple touch points)
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Third check: screen size typical for mobile devices
    const smallScreen = window.innerWidth <= 1024 || window.innerHeight <= 768;
    
    // Log detection results for debugging
    console.log('Mobile detection:', {
      userAgent: userAgent,
      matchesRegex: mobileRegex.test(userAgent),
      hasTouchScreen: hasTouchScreen,
      smallScreen: smallScreen,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints
    });
    
    // For testing purposes, always return true to force mobile controls
    // return true;
    
    // Return true if any of the checks indicate a mobile device
    return mobileRegex.test(userAgent) || (hasTouchScreen && smallScreen);
  }
  
  // Check if this is a mobile device
  public isMobile(): boolean {
    return this.isMobileDevice;
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
  
  // Handle touch start events
  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length > 0) {
      const touch = event.touches[0];
      this.touchPosition = { x: touch.clientX, y: touch.clientY };
      this.touchActive = true;
      
      // Update mouse position to match touch position for aiming
      this.mousePosition.x = touch.clientX;
      this.mousePosition.y = touch.clientY;
      
      // Check if the touch is on any virtual buttons
      this.checkVirtualButtonPress(touch.clientX, touch.clientY);
    }
  }
  
  // Handle touch move events
  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length > 0) {
      const touch = event.touches[0];
      this.touchPosition = { x: touch.clientX, y: touch.clientY };
      
      // Update mouse position to match touch position for aiming
      this.mousePosition.x = touch.clientX;
      this.mousePosition.y = touch.clientY;
    }
  }
  
  // Handle touch end events
  private handleTouchEnd(event: TouchEvent): void {
    event.preventDefault();
    this.touchActive = false;
    
    // Reset all virtual buttons when touch ends
    for (const key in this.virtualButtons) {
      this.virtualButtons[key] = false;
    }
  }
  
  // Check if a touch is on a virtual button
  private checkVirtualButtonPress(x: number, y: number): void {
    // This will be implemented when we create the virtual buttons UI
    // For now, we'll just simulate a primary fire when touching the right side
    if (x > window.innerWidth / 2) {
      this.virtualButtons['firePrimary'] = true;
    }
  }
  
  // Set the state of a virtual button
  public setVirtualButton(buttonName: string, isPressed: boolean): void {
    if (this.virtualButtons.hasOwnProperty(buttonName)) {
      this.virtualButtons[buttonName] = isPressed;
    }
  }
  
  // Check if a virtual button is pressed
  public isVirtualButtonPressed(buttonName: string): boolean {
    return this.virtualButtons[buttonName] === true;
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

  /**
   * Mark a key as processed for this frame to prevent multiple actions
   */
  public setKeyProcessed(code: string): void {
    this.keyPressedThisFrame[code] = true;
  }

  public isKeyReleased(code: string): boolean {
    const isReleased = this.keys[code] !== true && this.previousKeys[code] === true;
    return isReleased;
  }

  public isMouseButtonDown(button: number): boolean {
    // For mobile, treat touch as left mouse button
    if (this.isMobileDevice && button === 0 && this.touchActive) {
      return true;
    }
    return this.mouseButtons[button] === true;
  }

  public getMousePosition(): { x: number, y: number } {
    // For mobile, return touch position if available
    if (this.isMobileDevice && this.touchPosition) {
      return { ...this.touchPosition };
    }
    return { ...this.mousePosition };
  }
  
  public getTouchPosition(): { x: number, y: number } | null {
    return this.touchPosition ? { ...this.touchPosition } : null;
  }
  
  public isTouchActive(): boolean {
    return this.touchActive;
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
    
    // Remove touch event listeners
    window.removeEventListener('touchstart', this.handleTouchStart.bind(this));
    window.removeEventListener('touchmove', this.handleTouchMove.bind(this));
    window.removeEventListener('touchend', this.handleTouchEnd.bind(this));
    window.removeEventListener('touchcancel', this.handleTouchEnd.bind(this));
  }

  public isMouseOver(object: any): boolean {
    if (!object || !object.getBounds) {
      return false;
    }
    
    const bounds = object.getBounds();
    
    // For mobile, check against touch position
    if (this.isMobileDevice && this.touchPosition) {
      return (
        this.touchPosition.x >= bounds.x &&
        this.touchPosition.x <= bounds.x + bounds.width &&
        this.touchPosition.y >= bounds.y &&
        this.touchPosition.y <= bounds.y + bounds.height
      );
    }
    
    return (
      this.mousePosition.x >= bounds.x &&
      this.mousePosition.x <= bounds.x + bounds.width &&
      this.mousePosition.y >= bounds.y &&
      this.mousePosition.y <= bounds.y + bounds.height
    );
  }
} 