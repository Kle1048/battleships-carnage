import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { initGame } from '../game/Game';
import './GameCanvas.css';

const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    if (canvasRef.current && !appRef.current) {
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

      // Initialize the game
      initGame(app);

      // Handle window resize
      const handleResize = () => {
        if (appRef.current) {
          appRef.current.renderer.resize(window.innerWidth, window.innerHeight);
        }
      };

      window.addEventListener('resize', handleResize);

      // Clean up
      return () => {
        window.removeEventListener('resize', handleResize);
        if (appRef.current) {
          appRef.current.destroy(true, true);
          appRef.current = null;
        }
      };
    }
  }, []);

  return <div ref={canvasRef} className="game-canvas"></div>;
};

export default GameCanvas; 