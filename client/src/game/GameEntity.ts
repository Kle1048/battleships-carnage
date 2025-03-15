import * as PIXI from 'pixi.js';

/**
 * Base interface for game entities
 */
export interface GameEntity {
  id: string;
  x: number;
  y: number;
  rotation: number;
  sprite?: PIXI.DisplayObject;
  update?: (delta: number) => boolean | void;
  destroy?: () => void;
} 