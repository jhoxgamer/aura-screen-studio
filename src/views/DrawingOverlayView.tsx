import React, { useState, useEffect, useRef } from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Trash2,
  X,
  Sparkles,
  ArrowUpRight,
  Square,
  Clock,
  Check
} from 'lucide-react';

export type DrawingTool = 'pen' | 'highlighter' | 'arrow' | 'rectangle' | 'eraser';

interface StrokePoint {
  x: number;
  y: number;
}

interface PathStroke {
  points: StrokePoint[];
  color: string;
  width: number;
  tool: DrawingTool;
  vanishing: boolean;
  timestamp: number;
}

interface ClickRipple {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

export const DrawingOverlayView: React.FC = () => {
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState('#06b6d4'); // Aura Cyan
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [vanishingInk, setVanishingInk] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<PathStroke[]>([]);
  const ripplesRef = useRef<ClickRipple[]>([]);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);

  const colors = [
    { name: 'Ciano Elétrico', hex: '#06b6d4' },
    { name: 'Violeta Cósmico', hex: '#8b5cf6' },
    { name: 'Rosa Neon', hex: '#f43f5e' },
    { name: 'Esmeralda', hex: '#10b981' },
    { name: 'Âmbar Dourado', hex: '#f59e0b' },
    { name: 'Branco Puro', hex: '#ffffff' }
  ];

  useEffect(() => {
    const cleanupToggled = window.electronAPI.onDrawingToggled((isActive) => {
      setActive(isActive);
      if (!isActive) {
        // Clear strokes when tool closed
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && active) {
        handleClose();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    // Continuous smooth animation loop for click ripples and vanishing ink
    let animId: number;
    const renderLoop = () => {
      const now = Date.now();
      let changed = false;

      if (strokesRef.current.some((s) => s.vanishing && now - s.timestamp > 3000)) {
        strokesRef.current = strokesRef.current.filter((s) => !s.vanishing || now - s.timestamp <= 3000);
        changed = true;
      }

      if (ripplesRef.current.length > 0 || isDrawingRef.current || changed || strokesRef.current.length > 0) {
        redraw();
      }

      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);

    return () => {
      cleanupToggled();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animId);
    };
  }, [active]);

  const drawArrowShape = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, width: number) => {
    const headLen = Math.max(14, width * 3.5);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  };

  const drawBoxShape = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
    ctx.stroke();
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();

    // 1. Render all past committed strokes
    strokesRef.current.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
      } else if (stroke.vanishing) {
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

      if (stroke.tool === 'arrow') {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        drawArrowShape(ctx, start.x, start.y, end.x, end.y, stroke.width);
      } else if (stroke.tool === 'rectangle') {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        drawBoxShape(ctx, start.x, start.y, end.x, end.y);
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    });

    // 2. Render live in-progress stroke if currently drawing
    if (isDrawingRef.current && currentPointsRef.current.length >= 2) {
      const pts = currentPointsRef.current;
      ctx.save();
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
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

      if (tool === 'arrow') {
        drawArrowShape(ctx, pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y, strokeWidth);
      } else if (tool === 'rectangle') {
        drawBoxShape(ctx, pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Draw active click ripples with glowing ring effect
    ripplesRef.current.forEach((r) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 91, 79, ${r.alpha})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff5b4f';
      ctx.shadowBlur = 10;
      ctx.stroke();

      // Golden center pip
      ctx.beginPath();
      ctx.arc(r.x, r.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 215, 0, ${r.alpha * 0.9})`;
      ctx.fill();
      ctx.restore();

      r.radius += 2.5;
      r.alpha -= 0.045;
    });
    ripplesRef.current = ripplesRef.current.filter((r) => r.alpha > 0);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    ripplesRef.current.push({ x: e.clientX, y: e.clientY, radius: 8, alpha: 0.95 });
    if (active) {
      isDrawingRef.current = true;
      currentPointsRef.current = [{ x: e.clientX, y: e.clientY }];
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!active || !isDrawingRef.current) return;
    const newPoint = { x: e.clientX, y: e.clientY };

    if (tool === 'arrow' || tool === 'rectangle') {
      // For shapes, keep start point and update current end point
      currentPointsRef.current = [currentPointsRef.current[0], newPoint];
    } else {
      currentPointsRef.current.push(newPoint);
    }
    redraw();
  };

  const handleMouseUp = () => {
    if (!active || !isDrawingRef.current) return;
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

  return (
    <div
      className={`w-screen h-screen relative overflow-hidden bg-transparent select-none ${
        active ? 'cursor-crosshair' : 'cursor-default pointer-events-none'
      }`}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="w-full h-full block pointer-events-auto"
      />

      {/* Floating Toolbar Palette only when active */}
      {active && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center space-x-3 bg-[#111216]/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-loom-border shadow-2xl pointer-events-auto">
          {/* Drawing Tools */}
          <div className="flex items-center space-x-1 border-r border-loom-border/80 pr-2.5">
            <button
              onClick={() => setTool('pen')}
              title="Caneta Livre (P)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'pen' ? 'bg-loom-primary text-white shadow-md' : 'text-loom-muted hover:text-white hover:bg-loom-card'
              }`}
            >
              <Pen className="w-4 h-4" />
            </button>

            <button
              onClick={() => setTool('arrow')}
              title="Seta Indicadora (A)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'arrow' ? 'bg-loom-primary text-white shadow-md' : 'text-loom-muted hover:text-white hover:bg-loom-card'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setTool('rectangle')}
              title="Caixa de Destaque / Retângulo (R)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'rectangle' ? 'bg-loom-primary text-white shadow-md' : 'text-loom-muted hover:text-white hover:bg-loom-card'
              }`}
            >
              <Square className="w-4 h-4" />
            </button>

            <button
              onClick={() => setTool('highlighter')}
              title="Marca-texto Translúcido (H)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'highlighter' ? 'bg-loom-primary text-white shadow-md' : 'text-loom-muted hover:text-white hover:bg-loom-card'
              }`}
            >
              <Highlighter className="w-4 h-4" />
            </button>

            <button
              onClick={() => setTool('eraser')}
              title="Borracha (E)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'eraser' ? 'bg-loom-coral text-white shadow-md' : 'text-loom-muted hover:text-white hover:bg-loom-card'
              }`}
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>

          {/* Color Palette */}
          {tool !== 'eraser' && (
            <div className="flex items-center space-x-1.5 border-r border-loom-border/80 pr-2.5">
              {colors.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    color === c.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-110 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}

          {/* Stroke Width Selector */}
          <div className="flex items-center space-x-1 border-r border-loom-border/80 pr-2.5">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                title={`Espessura: ${w}px`}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  strokeWidth === w ? 'bg-loom-card text-white font-bold' : 'text-loom-muted hover:text-white'
                }`}
              >
                <div
                  className="rounded-full bg-current"
                  style={{ width: `${w * 1.5}px`, height: `${w * 1.5}px` }}
                />
              </button>
            ))}
          </div>

          {/* Vanishing Ink Mode Toggle */}
          <button
            onClick={() => setVanishingInk(!vanishingInk)}
            title="Tinta inteligente que desaparece em 3 segundos (Aura Evanescent Ink)"
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              vanishingInk
                ? 'bg-loom-primary/20 text-loom-primary border border-loom-primary/40 shadow-sm'
                : 'text-loom-muted hover:text-white bg-loom-card/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>3s Auto-apagar</span>
            {vanishingInk && <Check className="w-3 h-3 text-loom-primary ml-0.5" />}
          </button>

          {/* Clear Canvas */}
          <button
            onClick={handleClear}
            title="Limpar todos os desenhos"
            className="p-2 rounded-xl text-loom-muted hover:text-white hover:bg-loom-card transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Done / Close Drawing Mode */}
          <button
            onClick={handleClose}
            className="flex items-center space-x-1 bg-loom-primary hover:bg-loom-primaryHover text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <span>Concluir</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
