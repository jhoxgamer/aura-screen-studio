import React, { useState, useEffect, useRef } from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Trash2,
  X,
  Sparkles,
  Check
} from 'lucide-react';

interface StrokePoint {
  x: number;
  y: number;
}

interface PathStroke {
  points: StrokePoint[];
  color: string;
  width: number;
  tool: 'pen' | 'highlighter';
  vanishing: boolean;
  timestamp: number;
}

export const DrawingOverlayView: React.FC = () => {
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#ff5b4f'); // Loom Coral
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [vanishingInk, setVanishingInk] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<PathStroke[]>([]);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);

  const colors = [
    { name: 'Coral', hex: '#ff5b4f' },
    { name: 'Roxo', hex: '#625df5' },
    { name: 'Verde', hex: '#10b981' },
    { name: 'Amarelo', hex: '#f59e0b' },
    { name: 'Azul', hex: '#3b82f6' },
    { name: 'Branco', hex: '#ffffff' }
  ];

  useEffect(() => {
    const cleanupToggled = window.electronAPI.onDrawingToggled((isActive) => {
      setActive(isActive);
      if (!isActive) {
        // Clear when closed
        strokesRef.current = [];
        redraw();
      }
    });

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        redraw();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Vanishing ink cleanup loop
    const vanishingLoop = setInterval(() => {
      const now = Date.now();
      let changed = false;

      strokesRef.current = strokesRef.current.filter((stroke) => {
        if (stroke.vanishing && now - stroke.timestamp > 3000) {
          changed = true;
          return false;
        }
        return true;
      });

      if (changed) {
        redraw();
      }
    }, 100);

    return () => {
      cleanupToggled();
      window.removeEventListener('resize', handleResize);
      clearInterval(vanishingLoop);
    };
  }, []);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();

    strokesRef.current.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
      } else if (stroke.vanishing) {
        // Fade out in the last 1000ms
        const age = now - stroke.timestamp;
        if (age > 2000) {
          const fadeProgress = (3000 - age) / 1000;
          ctx.globalAlpha = Math.max(0, fadeProgress);
        } else {
          ctx.globalAlpha = 1.0;
        }
      } else {
        ctx.globalAlpha = 1.0;
      }

      ctx.stroke();
      ctx.restore();
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true;
    currentPointsRef.current = [{ x: e.clientX, y: e.clientY }];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    const newPoint = { x: e.clientX, y: e.clientY };
    currentPointsRef.current.push(newPoint);

    // Live draw stroke
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = tool === 'eraser' ? '#000000' : color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else if (tool === 'highlighter') {
      ctx.globalAlpha = 0.35;
    } else {
      ctx.globalAlpha = 1.0;
    }

    const pts = currentPointsRef.current;
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(newPoint.x, newPoint.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (tool !== 'eraser' && currentPointsRef.current.length > 1) {
      strokesRef.current.push({
        points: [...currentPointsRef.current],
        color,
        width: strokeWidth,
        tool,
        vanishing: vanishingInk,
        timestamp: Date.now()
      });
    }

    currentPointsRef.current = [];
    redraw();
  };

  const handleClear = () => {
    strokesRef.current = [];
    redraw();
  };

  const handleClose = () => {
    window.electronAPI.setDrawingActive(false);
  };

  if (!active) {
    return null;
  }

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-transparent cursor-crosshair select-none">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="w-full h-full block"
      />

      {/* Floating Toolbar Palette */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center space-x-3 bg-loom-dark/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-loom-border shadow-2xl">
        {/* Tools */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setTool('pen')}
            title="Caneta"
            className={`p-2 rounded-xl transition-colors ${
              tool === 'pen' ? 'bg-loom-primary text-white shadow-sm' : 'text-loom-muted hover:text-white'
            }`}
          >
            <Pen className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool('highlighter')}
            title="Marca-texto"
            className={`p-2 rounded-xl transition-colors ${
              tool === 'highlighter' ? 'bg-loom-primary text-white shadow-sm' : 'text-loom-muted hover:text-white'
            }`}
          >
            <Highlighter className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool('eraser')}
            title="Borracha"
            className={`p-2 rounded-xl transition-colors ${
              tool === 'eraser' ? 'bg-loom-primary text-white shadow-sm' : 'text-loom-muted hover:text-white'
            }`}
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-loom-border" />

        {/* Color Palette */}
        <div className="flex items-center space-x-1.5">
          {colors.map((c) => (
            <button
              key={c.hex}
              onClick={() => {
                setColor(c.hex);
                if (tool === 'eraser') setTool('pen');
              }}
              className={`w-6 h-6 rounded-full transition-all flex items-center justify-center ${
                color === c.hex && tool !== 'eraser' ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            >
              {color === c.hex && tool !== 'eraser' && (
                <Check className={`w-3.5 h-3.5 ${c.hex === '#ffffff' ? 'text-black' : 'text-white'}`} />
              )}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-loom-border" />

        {/* Stroke Width Selector */}
        <div className="flex items-center space-x-1">
          {[2, 5, 10].map((w) => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                strokeWidth === w ? 'bg-loom-card text-white border border-loom-border' : 'text-loom-muted hover:text-white'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-loom-border" />

        {/* Vanishing Ink Toggle (Loom signature feature) */}
        <button
          onClick={() => setVanishingInk(!vanishingInk)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            vanishingInk
              ? 'bg-loom-coral/20 text-loom-coral border border-loom-coral/40'
              : 'text-loom-muted hover:text-white bg-loom-card'
          }`}
          title="Tinta que desaparece automaticamente após 3 segundos"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Tinta Mágica (Some)</span>
        </button>

        {/* Clear All */}
        <button
          onClick={handleClear}
          title="Limpar Desenhos"
          className="p-2 rounded-xl text-loom-muted hover:text-white hover:bg-loom-card transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Close Drawing Mode */}
        <button
          onClick={handleClose}
          className="flex items-center space-x-1 bg-loom-primary hover:bg-loom-primaryHover text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md"
        >
          <span>Concluir</span>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
