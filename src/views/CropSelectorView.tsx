import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Crop, Move } from 'lucide-react';
import { CropArea } from '../types';

export const CropSelectorView: React.FC = () => {
  const [selecting, setSelecting] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [area, setArea] = useState<CropArea | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI.closeCurrentWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setSelecting(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setArea({
      x: e.clientX,
      y: e.clientY,
      width: 0,
      height: 0
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selecting || !startPos) return;

    const x = Math.min(startPos.x, e.clientX);
    const y = Math.min(startPos.y, e.clientY);
    const width = Math.abs(e.clientX - startPos.x);
    const height = Math.abs(e.clientY - startPos.y);

    setArea({ x, y, width, height });
  };

  const handleMouseUp = () => {
    setSelecting(false);
  };

  const handleConfirm = () => {
    if (area && area.width > 50 && area.height > 50) {
      (window as any).electronAPI.closeCurrentWindow();
      // Send IPC crop:area-selected
      const ipc = (window as any).require ? (window as any).require('electron').ipcRenderer : null;
      if (ipc) {
        ipc.send('crop:area-selected', area);
      } else {
        // Fallback
        window.electronAPI.startCropSelection();
      }
    }
  };

  const handleCancel = () => {
    window.electronAPI.closeCurrentWindow();
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="w-screen h-screen relative bg-black/40 cursor-crosshair select-none overflow-hidden"
    >
      {/* Top instruction banner */}
      <div className="absolute top-6 inset-x-0 flex justify-center pointer-events-none">
        <div className="bg-[#111216]/95 border border-loom-border px-5 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs text-white">
          <Crop className="w-4 h-4 text-loom-coral" />
          <span className="font-medium">
            Clique e arraste para desenhar o retângulo da área de gravação (ESC para cancelar)
          </span>
        </div>
      </div>

      {/* Selected Box cutout */}
      {area && area.width > 5 && area.height > 5 && (
        <div
          className="absolute border-2 border-loom-coral bg-transparent rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-auto"
          style={{
            left: `${area.x}px`,
            top: `${area.y}px`,
            width: `${area.width}px`,
            height: `${area.height}px`
          }}
        >
          {/* Dimension Tag */}
          <div className="absolute -top-7 left-0 bg-loom-coral text-white text-[11px] font-mono font-bold px-2 py-0.5 rounded shadow">
            {Math.round(area.width)} × {Math.round(area.height)} px
          </div>

          {/* Confirm Bar when not actively dragging */}
          {!selecting && (
            <div className="absolute -bottom-12 right-0 flex items-center space-x-2 bg-[#111216] border border-loom-border p-1.5 rounded-xl shadow-2xl">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                className="px-2.5 py-1 rounded-lg bg-loom-card hover:bg-loom-hover text-xs font-medium text-loom-muted hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirm();
                }}
                className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-loom-coral hover:bg-red-500 text-xs font-semibold text-white shadow-md transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Usar Esta Área</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
