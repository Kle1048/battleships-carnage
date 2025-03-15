import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { initGame } from '../game/Game';
import MobileControls from './MobileControls';
import './GameCanvas.css';

interface PlayerConfig {
  name: string;
  color: number;
  type: string;
}

interface GameCanvasProps {
  playerConfig: PlayerConfig | null;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ playerConfig }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const [inputHandler, setInputHandler] = useState<any>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Force mobile controls for testing if needed
  // useEffect(() => {
  //   setIsMobile(true);
  // }, []);

  useEffect(() => {
    // Check if this is a mobile device (separate from InputHandler for early detection)
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const smallScreen = window.innerWidth <= 1024 || window.innerHeight <= 768;
      
      return mobileRegex.test(userAgent) || (hasTouchScreen && smallScreen);
    };
    
    // Set mobile state early
    setIsMobile(checkMobile());
    
    if (canvasRef.current && !appRef.current && playerConfig) {
      // Save player config to localStorage for potential future use
      localStorage.setItem('playerName', playerConfig.name);
      localStorage.setItem('shipColor', playerConfig.color.toString());
      localStorage.setItem('shipType', playerConfig.type);
      
      console.log('Starting game with player config:', playerConfig);
      
      // Initialize PIXI Application
      const app = new PIXI.Application({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x104070, // Ocean blue color
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Add the canvas to the DOM
      canvasRef.current.appendChild(app.view as unknown as Node);
      appRef.current = app;

      // Initialize the game and get the input handler
      const handler = initGame(app, playerConfig);
      setInputHandler(handler);
      
      // Double-check mobile detection from InputHandler
      if (handler && handler.isMobile) {
        setIsMobile(handler.isMobile());
      }
      
      console.log('Mobile device detected:', isMobile);

      // Handle window resize
      const handleResize = () => {
        if (appRef.current) {
          appRef.current.renderer.resize(window.innerWidth, window.innerHeight);
        }
      };

      // Prevent context menu on right-click
      const preventContextMenu = (e: Event) => {
        e.preventDefault();
      };

      window.addEventListener('resize', handleResize);
      
      // Add event listener to prevent context menu
      // Use type assertion to access the view property and add event listener
      const canvas = app.view as HTMLCanvasElement;
      canvas.addEventListener('contextmenu', preventContextMenu);

      // Clean up
      return () => {
        window.removeEventListener('resize', handleResize);
        if (appRef.current) {
          // Use type assertion to access the view property and remove event listener
          const canvas = appRef.current.view as HTMLCanvasElement;
          canvas.removeEventListener('contextmenu', preventContextMenu);
          
          appRef.current.destroy(true, true);
          appRef.current = null;
        }
      };
    }
  }, [playerConfig]);

  // Log when mobile state or input handler changes
  useEffect(() => {
    console.log('Mobile state updated:', isMobile);
    console.log('Input handler updated:', !!inputHandler);
  }, [isMobile, inputHandler]);

  return (
    <>
      <div ref={canvasRef} className="game-canvas"></div>
      {isMobile && inputHandler && (
        <MobileControls inputHandler={inputHandler} />
      )}
      {/* Debug info for mobile detection */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '5px',
          fontSize: '12px',
          zIndex: 2000
        }}>
          Mobile: {isMobile ? 'Yes' : 'No'}<br />
          Handler: {inputHandler ? 'Yes' : 'No'}<br />
          Player: {playerConfig?.name || 'N/A'}<br />
          Ship: {playerConfig?.type || 'N/A'}<br />
          W: {window.innerWidth} H: {window.innerHeight}
        </div>
      )}
    </>
  );
};

export default GameCanvas; 