/**
 * Game configuration settings
 * This file centralizes all game settings and feature flags
 */

// Debug settings
export const DEBUG = {
  ENABLED: process.env.NODE_ENV === 'development',
  SHOW_COLLISION_RADIUS: false,
  LOG_NETWORK_EVENTS: false,
  LOG_PHYSICS_UPDATES: false
};

// Visual effects settings
export const VISUAL_EFFECTS = {
  SHIP_HIGHLIGHTING: false,  // Highlight other players' ships
  EXPLOSION_EFFECTS: true,   // Show explosion effects when ships are destroyed
  FIRING_EFFECTS: true,      // Show firing effects when weapons are fired
  WATER_SPLASH_EFFECTS: true // Show water splash effects for projectiles
};

// UI settings
export const UI = {
  SHOW_PLAYER_LIST: true,    // Show the player list
  PLAYER_LIST_UPDATE_INTERVAL: 60, // Update player list every N frames
  SHOW_COLOR_PICKER: true,   // Show the color picker
  SHOW_ENEMY_INDICATOR: true, // Show the enemy indicator arrow
  NOTIFICATION_DURATION: 3000 // Default notification duration in ms
};

// Game world settings
export const WORLD = {
  SIZE: 5000,                // Size of the game world
  SPAWN_PROTECTION_TIME: 3000 // Spawn protection time in ms
};

// Network settings
export const NETWORK = {
  POSITION_UPDATE_INTERVAL: 3, // Send position updates every N frames
  HEARTBEAT_INTERVAL: 30000,   // Send heartbeat every N ms
  RECONNECT_ATTEMPTS: 5        // Number of reconnection attempts
};

// Ship settings
export const SHIPS = {
  TYPES: ['destroyer', 'cruiser', 'battleship'] as const,
  COLORS: [
    0x3366CC, // Blue
    0xDC3912, // Red
    0xFF9900, // Orange
    0x109618, // Green
    0x990099, // Purple
    0x0099C6, // Teal
    0xDD4477, // Pink
    0x66AA00, // Lime
    0xB82E2E, // Dark Red
    0x316395  // Dark Blue
  ]
};

// Weapon settings
export const WEAPONS = {
  PRIMARY_COOLDOWN: 500,     // Primary weapon cooldown in ms
  SECONDARY_COOLDOWN: 1500,  // Secondary weapon cooldown in ms
  MAX_RANGE: {
    PRIMARY: 500,            // Maximum range for primary weapons
    SECONDARY: 700           // Maximum range for secondary weapons
  }
};

// Physics settings
export const PHYSICS = {
  COLLISION_RESPONSE_STRENGTH: 0.5, // Strength of collision response
  DRIFT_FACTOR: 0.2                // Drift factor for ship movement
}; 