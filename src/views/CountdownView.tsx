import React, { useState, useEffect } from 'react';

export const CountdownView: React.FC = () => {
  const [count, setCount] = useState<number>(3);

  useEffect(() => {
    const cleanup = window.electronAPI.onCountdownTick((newCount) => {
      setCount(newCount);
    });
    return cleanup;
  }, []);

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-black/40 backdrop-blur-sm select-none">
      <div className="relative flex items-center justify-center">
        {/* Glowing Pulsing Outer Ring */}
        <div className="w-48 h-48 rounded-full border-4 border-loom-primary/40 animate-ping absolute" />
        <div className="w-44 h-44 rounded-full border-4 border-loom-coral/60 animate-pulse absolute" />

        {/* Center Circular Badge */}
        <div className="w-40 h-40 rounded-full bg-loom-dark/95 border-2 border-loom-primary shadow-2xl flex flex-col items-center justify-center">
          <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-loom-secondary to-loom-primary animate-bounce">
            {count > 0 ? count : 'GO!'}
          </span>
          <span className="text-[11px] font-bold text-loom-coral tracking-widest uppercase mt-1">
            Gravando em instantes
          </span>
        </div>
      </div>
    </div>
  );
};
