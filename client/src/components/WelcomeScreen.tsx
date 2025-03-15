import React, { useState, useEffect } from 'react';
import './WelcomeScreen.css';
import { SHIP_COLORS } from '../game/Ship';
import { SHIPS } from '../config/GameConfig';

interface WelcomeScreenProps {
  onJoin: (shipConfig: { name: string; color: number; type: string }) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onJoin }) => {
  // Player configuration state
  const [playerName, setPlayerName] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<number>(SHIP_COLORS[0]);
  const [selectedShipType, setSelectedShipType] = useState<string>('destroyer');
  const [formValid, setFormValid] = useState<boolean>(false);

  // Load saved player name from localStorage if available
  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    const savedColor = localStorage.getItem('shipColor');
    
    if (savedName) {
      setPlayerName(savedName);
    }
    
    if (savedColor) {
      setSelectedColor(parseInt(savedColor));
    }
  }, []);

  // Validate form whenever inputs change
  useEffect(() => {
    setFormValid(playerName.trim().length > 0);
  }, [playerName]);

  // Handle join game button click
  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formValid) return;
    
    // Save player preferences to localStorage
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('shipColor', selectedColor.toString());
    
    onJoin({
      name: playerName,
      color: selectedColor,
      type: selectedShipType
    });
  };

  // Convert color value to CSS hex
  const colorToHex = (color: number): string => {
    return '#' + color.toString(16).padStart(6, '0');
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <h1>Battleships MMO</h1>
        <h2>Configure Your Ship</h2>
        
        <form onSubmit={handleJoinGame}>
          {/* Name input */}
          <div className="form-group">
            <label htmlFor="player-name">Captain's Name:</label>
            <input
              type="text"
              id="player-name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={16}
              autoFocus
            />
          </div>
          
          {/* Ship type selection */}
          <div className="form-group">
            <label>Select Ship Type:</label>
            <div className="ship-type-selector">
              {SHIPS.TYPES.map((type) => (
                <div 
                  key={type}
                  className={`ship-type-option ${selectedShipType === type ? 'selected' : ''}`}
                  onClick={() => setSelectedShipType(type)}
                >
                  <div className={`ship-icon ship-icon-${type}`}></div>
                  <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Color selection */}
          <div className="form-group">
            <label>Select Ship Color:</label>
            <div className="color-picker">
              {SHIP_COLORS.map((color, index) => (
                <div 
                  key={index} 
                  className={`color-swatch ${selectedColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: colorToHex(color) }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
          </div>
          
          {/* Join game button */}
          <button 
            className="join-button" 
            type="submit" 
            disabled={!formValid}
          >
            Join Battle
          </button>
        </form>
        
        <div className="game-info">
          <h3>Ship Specifications</h3>
          <div className="ship-specs">
            {selectedShipType === 'destroyer' && (
              <div>
                <p><strong>Type:</strong> Destroyer</p>
                <p><strong>Speed:</strong> ★★★★☆</p>
                <p><strong>Armor:</strong> ★★☆☆☆</p>
                <p><strong>Firepower:</strong> ★★★☆☆</p>
                <p><strong>Description:</strong> Fast and agile, but lightly armored.</p>
              </div>
            )}
            {selectedShipType === 'cruiser' && (
              <div>
                <p><strong>Type:</strong> Cruiser</p>
                <p><strong>Speed:</strong> ★★★☆☆</p>
                <p><strong>Armor:</strong> ★★★☆☆</p>
                <p><strong>Firepower:</strong> ★★★☆☆</p>
                <p><strong>Description:</strong> Well-balanced ship with good all-around capabilities.</p>
              </div>
            )}
            {selectedShipType === 'battleship' && (
              <div>
                <p><strong>Type:</strong> Battleship</p>
                <p><strong>Speed:</strong> ★★☆☆☆</p>
                <p><strong>Armor:</strong> ★★★★★</p>
                <p><strong>Firepower:</strong> ★★★★★</p>
                <p><strong>Description:</strong> Slow but heavily armored with devastating firepower.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen; 