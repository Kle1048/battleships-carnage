import React, { useEffect, useState } from 'react';
import './App.css';
import GameCanvas from './components/GameCanvas';
import WelcomeScreen from './components/WelcomeScreen';

interface PlayerConfig {
  name: string;
  color: number;
  type: string;
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasJoined, setHasJoined] = useState(false);
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);

  useEffect(() => {
    // Simulate loading assets
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handlePlayerJoin = (config: PlayerConfig) => {
    console.log('Player joining with config:', config);
    setPlayerConfig(config);
    setHasJoined(true);
  };

  return (
    <div className="App">
      {isLoading ? (
        <div className="loading-screen">
          <h1>Battleships MMO</h1>
          <p>Loading...</p>
        </div>
      ) : (
        <>
          {!hasJoined ? (
            <WelcomeScreen onJoin={handlePlayerJoin} />
          ) : (
            <GameCanvas playerConfig={playerConfig} />
          )}
        </>
      )}
    </div>
  );
}

export default App; 