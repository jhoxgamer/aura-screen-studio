import React, { useEffect, useState } from 'react';

export const ZoomShareBorderView: React.FC = () => {
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const cleanup = window.electronAPI?.onLiveStatusChanged?.((status) => {
      setIsPaused(!!status?.isPaused);
    });
    return () => cleanup?.();
  }, []);

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-50 transition-colors duration-300 ${
        isPaused
          ? 'border-[3.5px] border-amber-500 shadow-[inset_0_0_24px_rgba(245,158,11,0.6)]'
          : 'border-[3.5px] border-emerald-500 shadow-[inset_0_0_24px_rgba(16,185,129,0.6)]'
      }`}
    >
      {/* Corner Bracket Accents (Zoom Pro signature share frame) */}
      <div
        className={`absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 ${
          isPaused ? 'border-amber-400' : 'border-emerald-400'
        }`}
      />
      <div
        className={`absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 ${
          isPaused ? 'border-amber-400' : 'border-emerald-400'
        }`}
      />
      <div
        className={`absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 ${
          isPaused ? 'border-amber-400' : 'border-emerald-400'
        }`}
      />
      <div
        className={`absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 ${
          isPaused ? 'border-amber-400' : 'border-emerald-400'
        }`}
      />
    </div>
  );
};
