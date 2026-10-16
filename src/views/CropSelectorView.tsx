import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Crop, Move, Monitor, Smartphone, Square, Tv } from 'lucide-react';
import { CropArea } from '../types';

type AspectRatio = 'free' | '16:9' | '9:16' | '1:1' | '4:3';

export const CropSelectorView: React.FC = () => {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [selecting, setSelecting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [area, setArea] = useState<CropArea | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && area && area.width >= 50 && area.height >= 50) {
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [area]);

  const handleCancel = () => {
    if (window.electronAPI?.cancelCropSelection) {
      window.electronAPI.cancelCropSelection();
    } else {
      window.electronAPI?.closeCurrentWindow();
    }
  };

  const handleConfirm = () => {
    if (area && area.width >= 40 && area.height >= 40) {
      const cleanArea: CropArea = {
        x: Math.round(area.x),
        y: Math.round(area.y),
        width: Math.round(area.width),
        height: Math.round(area.height)
      };
      if (window.electronAPI?.sendCropArea) {
        window.electronAPI.sendCropArea(cleanArea);
      }
    }
  };

  const calculateWithRatio = (rawW: number, rawH: number, ratio: AspectRatio): { width: number; height: number } => {
    if (ratio === '16:9') {
      const h = rawW / (16 / 9);
      return { width: rawW, height: h };
    }
    if (ratio === '9:16') {
      const h = rawW / (9 / 16);
      return { width: rawW, height: h };
    }
    if (ratio === '1:1') {
      const side = Math.max(rawW, rawH);
      return { width: side, height: side };
    }
    if (ratio === '4:3') {
      const h = rawW / (4 / 3);
      return { width: rawW, height: h };
    }
    return { width: rawW, height: rawH };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag-area')) return;

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
    setMousePos({ x: e.clientX, y: e.clientY });

    // Moving existing box
    if (isMoving && moveStart && area) {
      const dx = e.clientX - moveStart.x;
      const dy = e.clientY - moveStart.y;
      const newX = Math.max(0, Math.min(window.innerWidth - area.width, moveStart.origX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - area.height, moveStart.origY + dy));
      setArea({ ...area, x: newX, y: newY });
      return;
    }

    // Creating new selection
    if (!selecting || !startPos) return;

    let rawW = Math.abs(e.clientX - startPos.x);
    let rawH = Math.abs(e.clientY - startPos.y);

    const { width, height } = calculateWithRatio(rawW, rawH, aspectRatio);

    const x = e.clientX < startPos.x ? startPos.x - width : startPos.x;
    const y = e.clientY < startPos.y ? startPos.y - height : startPos.y;

    setArea({
      x: Math.max(0, x),
      y: Math.max(0, y),
      width,
      height
    });
  };

  const handleMouseUp = () => {
    setSelecting(false);
    setIsMoving(false);
    setMoveStart(null);
  };

  const startMovingBox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!area) return;
    setIsMoving(true);
    setMoveStart({
      x: e.clientX,
      y: e.clientY,
      origX: area.x,
      origY: area.y
    });
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="w-screen h-screen relative bg-black/55 cursor-crosshair select-none overflow-hidden font-sans"
    >
      {/* Dynamic Crosshair Guidelines */}
      <div
        className="fixed top-0 bottom-0 pointer-events-none border-l border-cyan-500/25 z-10"
        style={{ left: `${mousePos.x}px` }}
      />
      <div
        className="fixed left-0 right-0 pointer-events-none border-t border-cyan-500/25 z-10"
        style={{ top: `${mousePos.y}px` }}
      />

      {/* Top Floating Control Toolbar */}
      <div className="absolute top-6 inset-x-0 flex justify-center pointer-events-none z-50">
        <div className="no-drag-area pointer-events-auto bg-[#0a0d14]/95 backdrop-blur-xl border border-cyan-500/30 px-4 py-2 rounded-2xl shadow-2xl shadow-cyan-950/50 flex items-center space-x-3 text-xs text-white">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold border-r border-slate-700/80 pr-3">
            <Crop className="w-4 h-4" />
            <span>Recorte de Área</span>
          </div>

          {/* Aspect Ratio Presets */}
          <div className="flex items-center space-x-1 border-r border-slate-700/80 pr-3">
            <button
              onClick={() => setAspectRatio('free')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                aspectRatio === 'free'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Livre
            </button>
            <button
              onClick={() => {
                setAspectRatio('16:9');
                if (area) {
                  const h = area.width / (16 / 9);
                  setArea({ ...area, height: h });
                }
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                aspectRatio === '16:9'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Monitor className="w-3 h-3" />
              <span>16:9</span>
            </button>
            <button
              onClick={() => {
                setAspectRatio('9:16');
                if (area) {
                  const h = area.width / (9 / 16);
                  setArea({ ...area, height: h });
                }
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                aspectRatio === '9:16'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>9:16 (Shorts)</span>
            </button>
            <button
              onClick={() => {
                setAspectRatio('1:1');
                if (area) {
                  const side = Math.max(area.width, area.height);
                  setArea({ ...area, width: side, height: side });
                }
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                aspectRatio === '1:1'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Square className="w-3 h-3" />
              <span>1:1</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400">
            Arraste na tela para desenhar <span className="text-slate-200 font-mono">(ESC cancela)</span>
          </div>

          <button
            onClick={handleCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Cancelar seleção (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Selected Box cutout */}
      {area && area.width > 5 && area.height > 5 && (
        <div
          className="absolute border-2 border-cyan-400 bg-transparent rounded-lg shadow-[0_0_0_9999px_rgba(4,6,11,0.65)] pointer-events-auto transition-shadow"
          style={{
            left: `${area.x}px`,
            top: `${area.y}px`,
            width: `${area.width}px`,
            height: `${area.height}px`
          }}
        >
          {/* Neon Corner Handles */}
          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/80" />
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/80" />
          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/80" />
          <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/80" />

          {/* Center Move Handle */}
          <div
            onMouseDown={startMovingBox}
            className="absolute inset-0 flex items-center justify-center cursor-move group opacity-0 hover:opacity-100 transition-opacity bg-cyan-500/10"
          >
            <div className="bg-[#0b0e17]/90 px-3 py-1.5 rounded-xl border border-cyan-500/40 shadow-lg text-xs font-semibold text-cyan-300 flex items-center space-x-1.5">
              <Move className="w-3.5 h-3.5" />
              <span>Arraste para Mover</span>
            </div>
          </div>

          {/* Dimension Tag */}
          <div className="absolute -top-8 left-0 flex items-center space-x-1.5 bg-cyan-500 text-slate-950 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg shadow-lg shadow-cyan-500/30">
            <span>{Math.round(area.width)} × {Math.round(area.height)} px</span>
            {aspectRatio !== 'free' && (
              <span className="bg-slate-950/30 text-slate-900 px-1 rounded text-[10px] font-sans font-extrabold uppercase">
                {aspectRatio}
              </span>
            )}
          </div>

          {/* Action Confirmation Bar below the box */}
          {!selecting && (
            <div
              className="no-drag-area absolute -bottom-14 right-0 flex items-center space-x-2 bg-[#0a0d14]/95 border border-cyan-500/40 p-2 rounded-2xl shadow-2xl shadow-cyan-950/70"
              style={{ zIndex: 100 }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirm();
                }}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/30 transition-all active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Gravar Esta Área</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
