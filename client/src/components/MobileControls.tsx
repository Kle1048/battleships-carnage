import React, { useEffect, useRef } from 'react';
import './MobileControls.css';

interface MobileControlsProps {
  inputHandler: any; // Using any for simplicity, ideally would be the InputHandler type
}

const MobileControls: React.FC<MobileControlsProps> = ({ inputHandler }) => {
  const throttleUpRef = useRef<HTMLDivElement>(null);
  const throttleDownRef = useRef<HTMLDivElement>(null);
  const rudderLeftRef = useRef<HTMLDivElement>(null);
  const rudderRightRef = useRef<HTMLDivElement>(null);
  const rudderCenterRef = useRef<HTMLDivElement>(null);
  const firePrimaryRef = useRef<HTMLDivElement>(null);
  const fireSecondaryRef = useRef<HTMLDivElement>(null);
  
  // Log that the component is rendering
  console.log('MobileControls component rendering');

  useEffect(() => {
    console.log('MobileControls useEffect running');
    console.log('Refs available:', {
      throttleUp: !!throttleUpRef.current,
      throttleDown: !!throttleDownRef.current,
      rudderLeft: !!rudderLeftRef.current,
      rudderRight: !!rudderRightRef.current,
      rudderCenter: !!rudderCenterRef.current,
      firePrimary: !!firePrimaryRef.current,
      fireSecondary: !!fireSecondaryRef.current
    });
    
    // Set up touch event handlers for each control button
    const setupTouchHandlers = (
      ref: React.RefObject<HTMLDivElement>,
      buttonName: string
    ) => {
      const element = ref.current;
      if (!element) {
        console.warn(`Element for ${buttonName} not found`);
        return;
      }

      console.log(`Setting up touch handlers for ${buttonName}`);

      const handleTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        console.log(`Touch start on ${buttonName}`);
        inputHandler.setVirtualButton(buttonName, true);
        element.classList.add('active');
      };

      const handleTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        console.log(`Touch end on ${buttonName}`);
        inputHandler.setVirtualButton(buttonName, false);
        element.classList.remove('active');
      };
      
      // Also handle mouse events for testing on desktop
      const handleMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        console.log(`Mouse down on ${buttonName}`);
        inputHandler.setVirtualButton(buttonName, true);
        element.classList.add('active');
      };
      
      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();
        console.log(`Mouse up on ${buttonName}`);
        inputHandler.setVirtualButton(buttonName, false);
        element.classList.remove('active');
      };

      element.addEventListener('touchstart', handleTouchStart, { passive: false });
      element.addEventListener('touchend', handleTouchEnd, { passive: false });
      element.addEventListener('touchcancel', handleTouchEnd, { passive: false });
      
      // Add mouse events for testing
      element.addEventListener('mousedown', handleMouseDown);
      element.addEventListener('mouseup', handleMouseUp);
      element.addEventListener('mouseleave', handleMouseUp);

      return () => {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchend', handleTouchEnd);
        element.removeEventListener('touchcancel', handleTouchEnd);
        element.removeEventListener('mousedown', handleMouseDown);
        element.removeEventListener('mouseup', handleMouseUp);
        element.removeEventListener('mouseleave', handleMouseUp);
      };
    };

    // Set up handlers for all control buttons
    const cleanupFunctions = [
      setupTouchHandlers(throttleUpRef, 'throttleUp'),
      setupTouchHandlers(throttleDownRef, 'throttleDown'),
      setupTouchHandlers(rudderLeftRef, 'rudderLeft'),
      setupTouchHandlers(rudderRightRef, 'rudderRight'),
      setupTouchHandlers(rudderCenterRef, 'rudderCenter'),
      setupTouchHandlers(firePrimaryRef, 'firePrimary'),
      setupTouchHandlers(fireSecondaryRef, 'fireSecondary')
    ];

    // Clean up event listeners
    return () => {
      console.log('Cleaning up MobileControls event listeners');
      cleanupFunctions.forEach(cleanup => cleanup && cleanup());
    };
  }, [inputHandler]);

  return (
    <div className="mobile-controls">
      {/* Movement controls on the left side */}
      <div className="control-group left">
        <div className="throttle-controls">
          <div ref={throttleUpRef} className="control-button throttle-up">
            <span>▲</span>
          </div>
          <div ref={throttleDownRef} className="control-button throttle-down">
            <span>▼</span>
          </div>
        </div>
        
        <div className="rudder-controls">
          <div ref={rudderLeftRef} className="control-button rudder-left">
            <span>◀</span>
          </div>
          <div ref={rudderCenterRef} className="control-button rudder-center">
            <span>■</span>
          </div>
          <div ref={rudderRightRef} className="control-button rudder-right">
            <span>▶</span>
          </div>
        </div>
      </div>
      
      {/* Weapon controls on the right side */}
      <div className="control-group right">
        <div ref={firePrimaryRef} className="control-button fire-primary">
          <span>CANNON</span>
        </div>
        <div ref={fireSecondaryRef} className="control-button fire-secondary">
          <span>TORPEDO</span>
        </div>
      </div>
      
      {/* Touch anywhere else to aim */}
      <div className="touch-instructions">
        <span>Touch anywhere to aim</span>
      </div>
    </div>
  );
};

export default MobileControls; 