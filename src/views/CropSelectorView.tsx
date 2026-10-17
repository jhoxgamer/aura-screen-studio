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

  const applyRatio = (ratio: AspectRatio) => {
    setAspectRatio(ratio);
    if (area && area.width > 10 && area.height > 10) {
      const adjusted = calculateWithRatio(area.width, area.height, ratio);
      setArea({
        ...area,
        width: Math.min(adjusted.width, window.innerWidth - area.x),
        height: Math.min(adjusted.height, window.innerHeight - area.y)
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && area && area.width >= 40 && area.height >= 40) {
        handleConfirm();
      } else if (e.key === '1') {
        setAspectRatio('free');
      } else if (e.key === '2') {
        applyRatio('16:9');
      } else if (e.key === '3') {
        applyRatio('9:16');
      } else if (e.key === '4') {
        applyRatio('1:1');
      } else if (e.key === '5') {
        applyRatio('4:3');
      } else if (area && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 2;
        let newX = area.x;
        let newY = area.y;
        if (e.code === 'ArrowUp') newY = Math.max(0, area.y - delta);
        if (e.code === 'ArrowDown') newY = Math.min(window.innerHeight - area.height, area.y + delta);
        if (e.code === 'ArrowLeft') newX = Math.max(0, area.x - delta);
        if (e.code === 'ArrowRight') newX = Math.min(window.innerWidth - area.width, area.x + delta);
        setArea({ ...area, x: newX, y: newY });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [area, aspectRatio]);

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
        className="fixed top-0 bottom-0 pointer-events-none border-l border-[#78A5FF]/30 z-10"
        style={{ left: `${mousePos.x}px` }}
      />
      <div
        className="fixed left-0 right-0 pointer-events-none border-t border-[#78A5FF]/30 z-10"
        style={{ top: `${mousePos.y}px` }}
      />

      {/* Top Floating Control Toolbar */}
      <div className="absolute top-6 inset-x-0 flex justify-center pointer-events-none z-50">
        <div className="no-drag-area pointer-events-auto bg-[#121722]/95 backdrop-blur-xl border border-[#303A4B] px-4 py-2 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs text-[#F3F5F9] font-sans">
          <div className="flex items-center space-x-2 text-[#78A5FF] font-bold border-r border-[#303A4B] pr-3">
            <Crop className="w-4 h-4" />
            <span>Recorte de Área</span>
          </div>

          {/* Aspect Ratio Presets */}
          <div className="flex items-center space-x-1 border-r border-[#303A4B] pr-3">
            <button
              onClick={() => applyRatio('free')}
              title="Proporção Livre (Tecla 1)"
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                aspectRatio === 'free'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
              }`}
            >
              Livre (1)
            </button>
            <button
              onClick={() => applyRatio('16:9')}
              title="Widescreen 16:9 (Tecla 2)"
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                aspectRatio === '16:9'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
              }`}
            >
              <Monitor className="w-3 h-3" />
              <span>16:9 (2)</span>
            </button>
            <button
              onClick={() => applyRatio('9:16')}
              title="Vertical 9:16 Shorts/Reels (Tecla 3)"
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                aspectRatio === '9:16'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>9:16 (3)</span>
            </button>
            <button
              onClick={() => applyRatio('1:1')}
              title="Quadrado 1:1 (Tecla 4)"
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                aspectRatio === '1:1'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
              }`}
            >
              <Square className="w-3 h-3" />
              <span>1:1 (4)</span>
            </button>
            <button
              onClick={() => applyRatio('4:3')}
              title="Clássico 4:3 (Tecla 5)"
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                aspectRatio === '4:3'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
              }`}
            >
              <Tv className="w-3 h-3" />
              <span>4:3 (5)</span>
            </button>
          </div>

          <div className="text-[11px] text-[#929CAF]">
            Arraste ou use as <span className="text-[#78A5FF] font-medium">Setas</span> para ajuste fino <span className="text-[#B7C0CE] font-mono">(ESC cancela)</span>
          </div>

          <button
            onClick={handleCancel}
            className="p-1 rounded-lg text-[#929CAF] hover:text-[#FF647C] hover:bg-[#FF647C]/10 transition-colors"
            title="Cancelar seleção (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Selected Box cutout */}
      {area && area.width > 5 && area.height > 5 && (
        <div
          className="absolute border-2 border-[#78A5FF] bg-transparent rounded-lg shadow-[0_0_0_9999px_rgba(4,6,11,0.7)] pointer-events-auto transition-shadow"
          style={{
            left: `${area.x}px`,
            top: `${area.y}px`,
            width: `${area.width}px`,
            height: `${area.height}px`
          }}
        >
          {/* Studio Corner Handles */}
          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-[#78A5FF] border border-white/50 shadow-sm" />
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-[#78A5FF] border border-white/50 shadow-sm" />
          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full bg-[#78A5FF] border border-white/50 shadow-sm" />
          <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full bg-[#78A5FF] border border-white/50 shadow-sm" />

          {/* Center Move Handle */}
          <div
            onMouseDown={startMovingBox}
            className="absolute inset-0 flex items-center justify-center cursor-move group opacity-0 hover:opacity-100 transition-opacity bg-[#78A5FF]/10"
          >
            <div className="bg-[#121722]/95 px-3 py-1.5 rounded-xl border border-[#303A4B] shadow-lg text-xs font-medium text-[#78A5FF] flex items-center space-x-1.5">
              <Move className="w-3.5 h-3.5" />
              <span>Arraste para Mover</span>
            </div>
          </div>

          {/* Dimension Tag */}
          <div className="absolute -top-8 left-0 flex items-center space-x-1.5 bg-[#121722] border border-[#303A4B] text-[#78A5FF] text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-lg shadow-lg">
            <span>{Math.round(area.width)} × {Math.round(area.height)} px</span>
            {aspectRatio !== 'free' && (
              <span className="bg-[#191F2B] text-[#B7C0CE] px-1 rounded text-[10px] font-sans uppercase">
                {aspectRatio}
              </span>
            )}
          </div>

          {/* Action Confirmation Bar below the box */}
          {!selecting && (
            <div
              className="no-drag-area absolute -bottom-14 right-0 flex items-center space-x-2 bg-[#121722]/95 border border-[#303A4B] p-2 rounded-2xl shadow-2xl"
              style={{ zIndex: 100 }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                className="px-3 py-1.5 rounded-xl bg-[#191F2B] hover:bg-[#222B39] text-xs font-medium text-[#B7C0CE] hover:text-[#F3F5F9] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirm();
                }}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-[#78A5FF] hover:bg-[#9AB9FF] text-xs font-bold text-[#101A32] shadow-sm transition-all active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Gravar Esta Área</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
