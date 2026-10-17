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
  Check,
  Hash,
  Focus,
  MousePointer,
  Sun
} from 'lucide-react';

export type DrawingTool = 'pen' | 'highlighter' | 'arrow' | 'rectangle' | 'stamp' | 'eraser';

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
  stampNumber?: number;
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
  const [color, setColor] = useState('#f43f5e'); // Studio Coral/Rose
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [vanishingInk, setVanishingInk] = useState(true);
  const [mouseSpotlight, setMouseSpotlight] = useState(false);
  const [backgroundDimmer, setBackgroundDimmer] = useState(false);
  const [nextStampNumber, setNextStampNumber] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<PathStroke[]>([]);
  const ripplesRef = useRef<ClickRipple[]>([]);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
  const nextStampRef = useRef(1);

  const colors = [
    { name: 'Coral Rose', hex: '#f43f5e' },
    { name: 'Âmbar Dourado', hex: '#f59e0b' },
    { name: 'Índigo Studio', hex: '#6366f1' },
    { name: 'Esmeralda', hex: '#10b981' },
    { name: 'Céu Claro', hex: '#38bdf8' },
    { name: 'Branco Puro', hex: '#ffffff' }
  ];

  useEffect(() => {
    nextStampRef.current = nextStampNumber;
  }, [nextStampNumber]);

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
      if (!active) return;
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'c' || e.key === 'C') {
        handleClear();
      } else if (e.key === 'p' || e.key === 'P') {
        setTool('pen');
      } else if (e.key === 'a' || e.key === 'A') {
        setTool('arrow');
      } else if (e.key === 'r' || e.key === 'R') {
        setTool('rectangle');
      } else if (e.key === 's' || e.key === 'S') {
        setTool('stamp');
      } else if (e.key === 'h' || e.key === 'H') {
        setTool('highlighter');
      } else if (e.key === 'e' || e.key === 'E') {
        setTool('eraser');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    // Continuous 60fps render loop
    let animId: number;
    const renderLoop = () => {
      const now = Date.now();
      let hasVanishing = false;

      if (strokesRef.current.some((s) => s.vanishing)) {
        hasVanishing = true;
        const initialLen = strokesRef.current.length;
        strokesRef.current = strokesRef.current.filter((s) => !s.vanishing || now - s.timestamp <= 3000);
        if (strokesRef.current.length !== initialLen) {
          redraw();
        }
      }

      if (ripplesRef.current.length > 0 || isDrawingRef.current || hasVanishing || mouseSpotlight || backgroundDimmer) {
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
  }, [active, mouseSpotlight, backgroundDimmer]);

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

  // Draw numbered badge stamp: (1), (2), (3)...
  const drawStampBadge = (ctx: CanvasRenderingContext2D, x: number, y: number, num: number, color: string, alpha: number = 1.0) => {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Glowing outer ring
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fill();

    // Dark inner circle with contrast
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0d14';
    ctx.shadowBlur = 0;
    ctx.fill();

    // Badge step number text
    ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num.toString(), x, y + 0.5);

    ctx.restore();
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();

    // 0. Cinematic Background Dimmer with circular spotlight cutout
    if (backgroundDimmer) {
      ctx.save();
      ctx.fillStyle = 'rgba(5, 7, 12, 0.65)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Cut spotlight hole around cursor
      if (mousePosRef.current.x >= 0) {
        ctx.globalCompositeOperation = 'destination-out';
        const grad = ctx.createRadialGradient(
          mousePosRef.current.x,
          mousePosRef.current.y,
          40,
          mousePosRef.current.x,
          mousePosRef.current.y,
          180
        );
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mousePosRef.current.x, mousePosRef.current.y, 180, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 1. Mouse Spotlight / Halo Follower
    if (mouseSpotlight && mousePosRef.current.x >= 0) {
      ctx.save();
      const spotGrad = ctx.createRadialGradient(
        mousePosRef.current.x,
        mousePosRef.current.y,
        0,
        mousePosRef.current.x,
        mousePosRef.current.y,
        70
      );
      spotGrad.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
      spotGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.12)');
      spotGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');

      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.arc(mousePosRef.current.x, mousePosRef.current.y, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. Render all past committed strokes
    strokesRef.current.forEach((stroke) => {
      const nowTime = Date.now();
      let strokeAlpha = 1.0;

      if (stroke.vanishing) {
        const age = nowTime - stroke.timestamp;
        if (age > 2000) {
          strokeAlpha = Math.max(0, (3000 - age) / 1000);
        }
      }

      if (stroke.tool === 'stamp' && stroke.stampNumber !== undefined) {
        drawStampBadge(ctx, stroke.points[0].x, stroke.points[0].y, stroke.stampNumber, stroke.color, strokeAlpha);
        return;
      }

      if (stroke.points.length < 2) return;

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'highlighter') {
        ctx.globalAlpha = 0.35 * strokeAlpha;
      } else {
        ctx.globalAlpha = strokeAlpha;
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

    // 3. Render live in-progress stroke if currently drawing
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

    // 4. Draw active click ripples with glowing ring effect
    ripplesRef.current.forEach((r) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(99, 102, 241, ${r.alpha})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#6366f1';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();
      r.radius += 2.2;
      r.alpha -= 0.045;
    });

    ripplesRef.current = ripplesRef.current.filter((r) => r.alpha > 0);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Left click only
    if (e.button !== 0) return;

    const x = e.clientX;
    const y = e.clientY;

    // Trigger visual click ripple
    ripplesRef.current.push({ x, y, radius: 4, alpha: 0.9 });

    // If Stamp tool is active, place a numbered step badge immediately
    if (tool === 'stamp') {
      const stampNum = nextStampRef.current;
      strokesRef.current.push({
        points: [{ x, y }],
        color,
        width: strokeWidth,
        tool: 'stamp',
        vanishing: vanishingInk,
        timestamp: Date.now(),
        stampNumber: stampNum
      });
      setNextStampNumber(prev => prev + 1);
      redraw();
      return;
    }

    isDrawingRef.current = true;
    currentPointsRef.current = [{ x, y }];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };

    if (!isDrawingRef.current || tool === 'stamp') {
      if (mouseSpotlight || backgroundDimmer) redraw();
      return;
    }

    currentPointsRef.current.push({ x: e.clientX, y: e.clientY });

    // Eraser performs immediate stroke deletion
    if (tool === 'eraser') {
      const radius = 24;
      strokesRef.current = strokesRef.current.filter((stroke) => {
        return !stroke.points.some(
          (p) => Math.hypot(p.x - e.clientX, p.y - e.clientY) < radius
        );
      });
    }

    redraw();
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentPointsRef.current.length >= 2 && tool !== 'eraser') {
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
    currentPointsRef.current = [];
    setNextStampNumber(1);
    redraw();
  };

  const handleClose = () => {
    window.electronAPI.toggleDrawing();
  };

  if (!active) return null;

  return (
    <div className="w-screen h-screen relative overflow-hidden select-none cursor-crosshair">
      {/* Fullscreen Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="w-full h-full block"
      />

      {/* Floating Toolbar Dock at Top Center */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-[#121520]/95 backdrop-blur-2xl border border-[#232838] px-3.5 py-2 rounded-2xl shadow-2xl text-white z-50 cursor-default"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {/* Tool Selector Buttons */}
        <div className="flex items-center space-x-1 border-r border-[#232838] pr-2.5">
          <button
            onClick={() => setTool('pen')}
            title="Caneta Livre (P)"
            className={`p-2 rounded-xl transition-all ${
              tool === 'pen' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Pen className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool('arrow')}
            title="Seta Direcional (A)"
            className={`p-2 rounded-xl transition-all ${
              tool === 'arrow' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool('rectangle')}
            title="Caixa de Destaque / Retângulo (R)"
            className={`p-2 rounded-xl transition-all ${
              tool === 'rectangle' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool('stamp')}
            title={`Selo Numerado de Passos (S) • Próximo: ${nextStampNumber}`}
            className={`p-2 rounded-xl transition-all flex items-center gap-1 font-mono font-medium text-xs ${
              tool === 'stamp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span className="text-[10px]">#{nextStampNumber}</span>
          </button>

          <button
            onClick={() => setTool('highlighter')}
            title="Marca-texto Translúcido (H)"
            className={`p-2 rounded-xl transition-all ${
              tool === 'highlighter' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Highlighter className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool('eraser')}
            title="Borracha (E)"
            className={`p-2 rounded-xl transition-all ${
              tool === 'eraser' ? 'bg-rose-600 text-white shadow-sm font-medium' : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* Color Palette */}
        {tool !== 'eraser' && (
          <div className="flex items-center space-x-1.5 border-r border-[#232838] pr-2.5">
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
        <div className="flex items-center space-x-1 border-r border-[#232838] pr-2.5">
          {[2, 4, 8].map((w) => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              title={`Espessura: ${w}px`}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                strokeWidth === w ? 'bg-indigo-600 text-white font-medium' : 'text-slate-500 hover:text-white hover:bg-[#1a1f2e]'
              }`}
            >
              <div
                className="rounded-full bg-current"
                style={{ width: `${w * 1.5}px`, height: `${w * 1.5}px` }}
              />
            </button>
          ))}
        </div>

        {/* Visual FX Toggles: Spotlight Halo & Dimmer */}
        <div className="flex items-center space-x-1 border-r border-[#232838] pr-2.5">
          <button
            onClick={() => setMouseSpotlight(!mouseSpotlight)}
            title="Holofote de Mouse (Halo luminoso que segue o ponteiro)"
            className={`p-2 rounded-xl transition-all ${
              mouseSpotlight
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <button
            onClick={() => setBackgroundDimmer(!backgroundDimmer)}
            title="Foco de Luz Cinematográfico (Escurece o fundo ao redor)"
            className={`p-2 rounded-xl transition-all ${
              backgroundDimmer
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Focus className="w-4 h-4" />
          </button>
        </div>

        {/* Vanishing Ink Mode Toggle */}
        <button
          onClick={() => setVanishingInk(!vanishingInk)}
          title="Tinta inteligente que desaparece em 3 segundos (Aura Evanescent Ink)"
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            vanishingInk
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white bg-[#1a1f2e]/60'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>3s Auto-apagar</span>
          {vanishingInk && <Check className="w-3 h-3 text-indigo-300 ml-0.5" />}
        </button>

        {/* Clear Canvas */}
        <button
          onClick={handleClear}
          title="Limpar todos os desenhos"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#1a1f2e] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Done / Close Drawing Mode */}
        <button
          onClick={handleClose}
          className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-1.5 rounded-xl text-xs transition-colors shadow-sm active:scale-95"
        >
          <span>Concluir</span>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
