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
          ? 'border-[3.5px] border-[#F2B66D] shadow-[inset_0_0_28px_rgba(242,182,109,0.65)]'
          : 'border-[3.5px] border-[#78A5FF] shadow-[inset_0_0_28px_rgba(120,165,255,0.65)]'
      }`}
    >
      {/* Corner Bracket Accents (Aura Studio signature share frame in Nocturne Blue) */}
      <div
        className={`absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 ${
          isPaused ? 'border-[#F2B66D]' : 'border-[#9AB9FF]'
        }`}
      />
      <div
        className={`absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 ${
          isPaused ? 'border-[#F2B66D]' : 'border-[#9AB9FF]'
        }`}
      />
      <div
        className={`absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 ${
          isPaused ? 'border-[#F2B66D]' : 'border-[#9AB9FF]'
        }`}
      />
      <div
        className={`absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 ${
          isPaused ? 'border-[#F2B66D]' : 'border-[#9AB9FF]'
        }`}
      />
    </div>
  );
};
