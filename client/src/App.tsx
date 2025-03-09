import React, { useEffect, useState } from 'react';
import './App.css';
import GameCanvas from './components/GameCanvas';

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading assets
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="App">
      {isLoading ? (
        <div className="loading-screen">
          <h1>Battleships MMO</h1>
          <p>Loading...</p>
        </div>
      ) : (
        <GameCanvas />
      )}
    </div>
  );
}

export default App; 