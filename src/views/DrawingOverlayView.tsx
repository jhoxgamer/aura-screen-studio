import React, { useState, useEffect, useRef } from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Trash2,
  X,
  Sparkles,
  ArrowUpRight,
  ArrowLeftRight,
  Square,
  Circle,
  Triangle,
  Diamond,
  Minus,
  Type,
  EyeOff,
  Zap,
  Check,
  CheckCircle2,
  XCircle,
  Star,
  Heart,
  HelpCircle,
  Hash,
  Undo2,
  Redo2,
  Camera,
  Copy,
  Layers,
  Grid,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  Focus,
  MousePointer,
  Clock
} from 'lucide-react';
import { DrawingTool, FillMode, WhiteboardMode, StampType } from '../types';
import { detectShape, Point } from '../utils/shapeDetection';
import { audioService } from '../services/audioService';

interface StrokePoint {
  x: number;
  y: number;
}

interface PathStroke {
  points: StrokePoint[];
  color: string;
  width: number;
  tool: DrawingTool;
  fillMode?: FillMode;
  vanishing: boolean;
  timestamp: number;
  stampType?: StampType;
  stampNumber?: number;
  text?: string;
}

interface ClickRipple {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

interface LaserPoint {
  x: number;
  y: number;
  timestamp: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) {
    return { r: 244, g: 63, b: 94 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export const DrawingOverlayView: React.FC = () => {
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<DrawingTool>(() => {
    return (localStorage.getItem('aura_draw_tool') as DrawingTool) || 'pen';
  });
  const [fillMode, setFillMode] = useState<FillMode>(() => {
    return (localStorage.getItem('aura_draw_fill') as FillMode) || 'outline';
  });
  const [whiteboardMode, setWhiteboardMode] = useState<WhiteboardMode>('screen');
  const [stampType, setStampType] = useState<StampType>('number');
  const [color, setColor] = useState(() => {
    return localStorage.getItem('aura_draw_color') || '#78A5FF';
  });
  const [strokeWidth, setStrokeWidth] = useState(() => {
    const saved = localStorage.getItem('aura_draw_width');
    return saved ? Number(saved) : 4;
  });
  const [vanishingInk, setVanishingInk] = useState(() => {
    const saved = localStorage.getItem('aura_draw_vanishing');
    return saved !== null ? saved === 'true' : false;
  });
  const [mouseSpotlight, setMouseSpotlight] = useState(false);
  const [backgroundDimmer, setBackgroundDimmer] = useState(false);
  const [nextStampNumber, setNextStampNumber] = useState(1);
  const [toolToast, setToolToast] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dockPosition, setDockPosition] = useState<'top' | 'bottom'>('top');
  const [activeTextPrompt, setActiveTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textInputValue, setTextInputValue] = useState('');

  const colorRef = useRef(color);
  const toolRef = useRef(tool);
  const fillModeRef = useRef(fillMode);
  const strokeWidthRef = useRef(strokeWidth);

  const showToolToast = (msg: string) => {
    setToolToast(msg);
    setTimeout(() => setToolToast((prev) => (prev === msg ? null : prev)), 1400);
  };

  useEffect(() => {
    toolRef.current = tool;
    localStorage.setItem('aura_draw_tool', tool);
  }, [tool]);

  useEffect(() => {
    fillModeRef.current = fillMode;
    localStorage.setItem('aura_draw_fill', fillMode);
  }, [fillMode]);

  useEffect(() => {
    colorRef.current = color;
    localStorage.setItem('aura_draw_color', color);
  }, [color]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
    localStorage.setItem('aura_draw_width', String(strokeWidth));
  }, [strokeWidth]);

  useEffect(() => {
    localStorage.setItem('aura_draw_vanishing', String(vanishingInk));
  }, [vanishingInk]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<PathStroke[]>([]);
  const redoStackRef = useRef<PathStroke[]>([]);
  const ripplesRef = useRef<ClickRipple[]>([]);
  const laserTrailRef = useRef<LaserPoint[]>([]);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
  const nextStampRef = useRef(1);

  const colors = [
    { name: 'Azul Nocturne', hex: '#78A5FF' },
    { name: 'Coral Estúdio', hex: '#FF647C' },
    { name: 'Âmbar Alerta', hex: '#F2B66D' },
    { name: 'Azul Claro', hex: '#83B8FF' },
    { name: 'Azul Celeste', hex: '#9AB9FF' },
    { name: 'Branco Puro', hex: '#F3F5F9' }
  ];

  useEffect(() => {
    nextStampRef.current = nextStampNumber;
  }, [nextStampNumber]);

  const handleColorChange = (newColor: string, colorName?: string) => {
    setColor(newColor);
    colorRef.current = newColor;
    localStorage.setItem('aura_draw_color', newColor);

    // Retroactively update last stroke if placed recently
    if (strokesRef.current.length > 0) {
      const lastStroke = strokesRef.current[strokesRef.current.length - 1];
      if (Date.now() - lastStroke.timestamp < 15000) {
        lastStroke.color = newColor;
      }
    }

    if (canvasRef.current) {
      redraw();
    }

    const label =
      colorName ||
      colors.find((c) => c.hex.toLowerCase() === newColor.toLowerCase())?.name ||
      newColor.toUpperCase();
    showToolToast(`🎨 Cor: ${label}`);
    audioService.play('pop');
  };

  useEffect(() => {
    const cleanupToggled = window.electronAPI.onDrawingToggled((isActive) => {
      setActive(isActive);
      if (!isActive) {
        strokesRef.current = [];
        redoStackRef.current = [];
        laserTrailRef.current = [];
        setActiveTextPrompt(null);
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
      if (activeTextPrompt) {
        if (e.key === 'Escape') {
          setActiveTextPrompt(null);
          setTextInputValue('');
        }
        return;
      }

      if (e.key === 'Escape') {
        handleClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      ) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'c' || e.key === 'C') {
        handleClear();
        showToolToast('Quadro Limpo (C)');
      } else if (e.key === 'p' || e.key === 'P') {
        setTool('pen');
        showToolToast('Caneta Livre (P)');
      } else if (e.key === 's' || e.key === 'S') {
        setTool('smartpen');
        showToolToast('Caneta Inteligente / Auto-Snap (S)');
      } else if (e.key === 'a' || e.key === 'A') {
        setTool('arrow');
        showToolToast('Seta Direcional (A)');
      } else if (e.key === 'd' || e.key === 'D') {
        setTool('darrow');
        showToolToast('Seta Dupla (D)');
      } else if (e.key === 'l' || e.key === 'L') {
        setTool('line');
        showToolToast('Linha Reta (L)');
      } else if (e.key === 'r' || e.key === 'R') {
        setTool('rectangle');
        showToolToast('Retângulo (R)');
      } else if (e.key === 'o' || e.key === 'O') {
        setTool('ellipse');
        showToolToast('Círculo / Elipse (O)');
      } else if (e.key === 't' || e.key === 'T') {
        setTool('text');
        showToolToast('Texto na Tela (T)');
      } else if (e.key === 'm' || e.key === 'M') {
        setTool('mosaic');
        showToolToast('Mosaico de Privacidade (M)');
      } else if (e.key === 'z' || e.key === 'Z') {
        setTool('laser');
        showToolToast('Apontador Laser Aura (Z)');
      } else if (e.key === 'h' || e.key === 'H') {
        setTool('highlighter');
        showToolToast('Marca-texto (H)');
      } else if (e.key === 'e' || e.key === 'E') {
        setTool('eraser');
        showToolToast('Borracha (E)');
      } else if (e.key === 'w' || e.key === 'W') {
        cycleWhiteboard();
      } else if (e.key === '1') {
        handleColorChange(colors[0].hex, colors[0].name);
      } else if (e.key === '2') {
        handleColorChange(colors[1].hex, colors[1].name);
      } else if (e.key === '3') {
        handleColorChange(colors[2].hex, colors[2].name);
      } else if (e.key === '4') {
        handleColorChange(colors[3].hex, colors[3].name);
      } else if (e.key === '5') {
        handleColorChange(colors[4].hex, colors[4].name);
      } else if (e.key === '6') {
        handleColorChange(colors[5].hex, colors[5].name);
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

      // Filter vanishing ink
      if (strokesRef.current.some((s) => s.vanishing)) {
        hasVanishing = true;
        const initialLen = strokesRef.current.length;
        strokesRef.current = strokesRef.current.filter((s) => !s.vanishing || now - s.timestamp <= 3000);
        if (strokesRef.current.length !== initialLen) {
          redraw();
        }
      }

      // Filter laser particle trail (keep last 400ms)
      if (laserTrailRef.current.length > 0) {
        laserTrailRef.current = laserTrailRef.current.filter((p) => now - p.timestamp < 350);
      }

      if (
        ripplesRef.current.length > 0 ||
        isDrawingRef.current ||
        hasVanishing ||
        tool === 'laser' ||
        laserTrailRef.current.length > 0 ||
        mouseSpotlight ||
        backgroundDimmer ||
        whiteboardMode !== 'screen'
      ) {
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
  }, [active, tool, whiteboardMode, mouseSpotlight, backgroundDimmer, activeTextPrompt]);

  const cycleWhiteboard = () => {
    setWhiteboardMode((curr) => {
      let next: WhiteboardMode = 'screen';
      if (curr === 'screen') next = 'whiteboard';
      else if (curr === 'whiteboard') next = 'blackboard';
      else next = 'screen';

      audioService.play('whiteboard');
      const label =
        next === 'whiteboard'
          ? 'Quadro Branco Ativo (Whiteboard)'
          : next === 'blackboard'
          ? 'Quadro Negro Ativo (Blackboard)'
          : 'Anotações em Tela Transparente';
      showToolToast(label);
      return next;
    });
  };

  const drawArrowShape = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    width: number,
    isDouble: boolean = false
  ) => {
    const headLen = Math.max(14, width * 3.5);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead at destination
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();

    // Arrowhead at origin if double-ended
    if (isDouble) {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + headLen * Math.cos(angle - Math.PI / 6), fromY + headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(fromX + headLen * Math.cos(angle + Math.PI / 6), fromY + headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  };

  const applyFill = (ctx: CanvasRenderingContext2D, color: string, fillMode: FillMode = 'outline') => {
    if (fillMode === 'tint') {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.restore();
    } else if (fillMode === 'solid') {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = 1.0;
      ctx.fill();
      ctx.restore();
    }
  };

  const drawBoxShape = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    fillMode: FillMode = 'outline'
  ) => {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, 6);
    } else {
      ctx.rect(x, y, w, h);
    }
    applyFill(ctx, color, fillMode);
    ctx.stroke();
  };

  const drawEllipseShape = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    fillMode: FillMode = 'outline'
  ) => {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    applyFill(ctx, color, fillMode);
    ctx.stroke();
  };

  const drawDiamondShape = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    fillMode: FillMode = 'outline'
  ) => {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, Math.min(y1, y2));
    ctx.lineTo(Math.max(x1, x2), cy);
    ctx.lineTo(cx, Math.max(y1, y2));
    ctx.lineTo(Math.min(x1, x2), cy);
    ctx.closePath();
    applyFill(ctx, color, fillMode);
    ctx.stroke();
  };

  const drawTriangleShape = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    fillMode: FillMode = 'outline'
  ) => {
    const cx = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, Math.min(y1, y2));
    ctx.lineTo(Math.max(x1, x2), Math.max(y1, y2));
    ctx.lineTo(Math.min(x1, x2), Math.max(y1, y2));
    ctx.closePath();
    applyFill(ctx, color, fillMode);
    ctx.stroke();
  };

  // Zoom-style Privacy Mosaic / Blur Redaction Box
  const drawMosaicRedaction = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.max(8, Math.abs(x2 - x1));
    const h = Math.max(8, Math.abs(y2 - y1));

    ctx.save();
    // Frosted dark background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, h);

    // Diagonal security hash stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    const step = 12;
    for (let i = -h; i < w + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }
    ctx.restore();

    // Redaction border & privacy watermark pill
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    if (w > 60 && h > 20) {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x + 4, y + 4, Math.min(w - 8, 90), 16, 4) : ctx.rect(x + 4, y + 4, Math.min(w - 8, 90), 16);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒 PRIVACIDADE', x + 8, y + 12);
    }
    ctx.restore();
  };

  // Zoom signature visual stamp icons
  const drawStamp = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    type: StampType,
    num: number = 1,
    color: string,
    alpha: number = 1.0
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;

    const size = 18;

    if (type === 'number') {
      // Glowing step counter badge
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, size - 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0d14';
      ctx.shadowBlur = 0;
      ctx.fill();

      ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(num.toString(), x, y + 0.5);
    } else {
      const bg = color || '#f43f5e';
      let symbol = '';

      if (type === 'check') {
        symbol = '✓';
      } else if (type === 'cross') {
        symbol = '✕';
      } else if (type === 'star') {
        symbol = '★';
      } else if (type === 'heart') {
        symbol = '♥';
      } else if (type === 'question') {
        symbol = '?';
      } else if (type === 'arrow') {
        symbol = '➔';
      }

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.shadowColor = bg;
      ctx.shadowBlur = 10;
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText(symbol, x, y + 1);
    }

    ctx.restore();
  };

  // On-screen formatted text note
  const drawTextNote = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, alpha: number = 1.0) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const metrics = ctx.measureText(text);
    const padX = 10;
    const padY = 6;
    const boxW = metrics.width + padX * 2;
    const boxH = 28;

    // Dark sleek container pill with colored border
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x - padX, y - boxH / 2, boxW, boxH, 6);
    } else {
      ctx.rect(x - padX, y - boxH / 2, boxW, boxH);
    }
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();

    // 0. Whiteboard or Blackboard Backdrop
    if (whiteboardMode === 'whiteboard') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle engineering dot grid
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      const step = 28;
      for (let x = 0; x < canvas.width; x += step) {
        for (let y = 0; y < canvas.height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (whiteboardMode === 'blackboard') {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      const step = 28;
      for (let x = 0; x < canvas.width; x += step) {
        for (let y = 0; y < canvas.height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 1. Cinematic Background Dimmer with circular spotlight cutout
    if (backgroundDimmer && whiteboardMode === 'screen') {
      ctx.save();
      ctx.fillStyle = 'rgba(5, 7, 12, 0.65)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

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

    // 2. Mouse Spotlight Halo Follower
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

    // 3. Zoom-style Glowing Laser Pointer with Fading Comet Tail
    if (tool === 'laser' && laserTrailRef.current.length > 1) {
      ctx.save();
      const rgb = hexToRgb(colorRef.current);
      for (let i = 1; i < laserTrailRef.current.length; i++) {
        const p1 = laserTrailRef.current[i - 1];
        const p2 = laserTrailRef.current[i];
        const age = now - p2.timestamp;
        const progress = Math.max(0, 1.0 - age / 350);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${progress * 0.75})`;
        ctx.lineWidth = Math.max(2, 6 * progress);
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Bright laser tip
      if (mousePosRef.current.x >= 0) {
        const lx = mousePosRef.current.x;
        const ly = mousePosRef.current.y;

        const laserHalo = ctx.createRadialGradient(lx, ly, 2, lx, ly, 22);
        laserHalo.addColorStop(0, 'rgba(255, 255, 255, 1)');
        laserHalo.addColorStop(0.2, colorRef.current);
        laserHalo.addColorStop(0.6, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`);
        laserHalo.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

        ctx.fillStyle = laserHalo;
        ctx.beginPath();
        ctx.arc(lx, ly, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Render all past committed strokes
    strokesRef.current.forEach((stroke) => {
      const nowTime = Date.now();
      let strokeAlpha = 1.0;

      if (stroke.vanishing) {
        const age = nowTime - stroke.timestamp;
        if (age > 2000) {
          strokeAlpha = Math.max(0, (3000 - age) / 1000);
        }
      }

      if (stroke.tool === 'stamp' && stroke.stampType) {
        drawStamp(ctx, stroke.points[0].x, stroke.points[0].y, stroke.stampType, stroke.stampNumber, stroke.color, strokeAlpha);
        return;
      }

      if (stroke.tool === 'text' && stroke.text) {
        drawTextNote(ctx, stroke.points[0].x, stroke.points[0].y, stroke.text, stroke.color, strokeAlpha);
        return;
      }

      if (stroke.tool === 'mosaic' && stroke.points.length >= 2) {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        drawMosaicRedaction(ctx, start.x, start.y, end.x, end.y);
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

      const pStart = stroke.points[0];
      const pEnd = stroke.points[stroke.points.length - 1];

      if (stroke.tool === 'arrow') {
        drawArrowShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, stroke.width, false);
      } else if (stroke.tool === 'darrow') {
        drawArrowShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, stroke.width, true);
      } else if (stroke.tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
      } else if (stroke.tool === 'rectangle') {
        drawBoxShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, stroke.color, stroke.fillMode);
      } else if (stroke.tool === 'ellipse') {
        drawEllipseShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, stroke.color, stroke.fillMode);
      } else if (stroke.tool === 'diamond') {
        drawDiamondShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, stroke.color, stroke.fillMode);
      } else if (stroke.tool === 'triangle') {
        drawTriangleShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, stroke.color, stroke.fillMode);
      } else {
        // Freehand pen or snapped smartpen points
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    });

    // 5. Render live in-progress stroke if currently drawing
    if (isDrawingRef.current && currentPointsRef.current.length >= 2) {
      const pts = currentPointsRef.current;
      ctx.save();
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : colorRef.current;
      ctx.lineWidth = strokeWidthRef.current;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else if (tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
      } else {
        ctx.globalAlpha = 1.0;
      }

      const pStart = pts[0];
      const pEnd = pts[pts.length - 1];

      if (tool === 'mosaic') {
        drawMosaicRedaction(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y);
      } else if (tool === 'arrow') {
        drawArrowShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, strokeWidthRef.current, false);
      } else if (tool === 'darrow') {
        drawArrowShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, strokeWidthRef.current, true);
      } else if (tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
      } else if (tool === 'rectangle') {
        drawBoxShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, colorRef.current, fillModeRef.current);
      } else if (tool === 'ellipse') {
        drawEllipseShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, colorRef.current, fillModeRef.current);
      } else if (tool === 'diamond') {
        drawDiamondShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, colorRef.current, fillModeRef.current);
      } else if (tool === 'triangle') {
        drawTriangleShape(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, colorRef.current, fillModeRef.current);
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

    // 6. Draw active click ripples
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
    if (e.button !== 0) return;

    const x = e.clientX;
    const y = e.clientY;

    ripplesRef.current.push({ x, y, radius: 4, alpha: 0.9 });

    // Laser pointer mode: does not commit drawings, only records positions
    if (tool === 'laser') {
      audioService.play('laser');
      return;
    }

    // Text tool: open inline note prompt
    if (tool === 'text') {
      setActiveTextPrompt({ x, y });
      setTextInputValue('');
      return;
    }

    // Stamp tool: place stamp immediately
    if (tool === 'stamp') {
      const stampNum = nextStampRef.current;
      strokesRef.current.push({
        points: [{ x, y }],
        color: colorRef.current,
        width: strokeWidthRef.current,
        tool: 'stamp',
        stampType,
        stampNumber: stampNum,
        vanishing: vanishingInk,
        timestamp: Date.now()
      });
      redoStackRef.current = [];
      audioService.play('pop');

      if (stampType === 'number') {
        setNextStampNumber((prev) => prev + 1);
      }
      redraw();
      return;
    }

    isDrawingRef.current = true;
    currentPointsRef.current = [{ x, y }];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };

    if (tool === 'laser') {
      laserTrailRef.current.push({ x: e.clientX, y: e.clientY, timestamp: Date.now() });
      redraw();
      return;
    }

    if (!isDrawingRef.current || tool === 'stamp' || tool === 'text') {
      if (mouseSpotlight || backgroundDimmer) redraw();
      return;
    }

    currentPointsRef.current.push({ x: e.clientX, y: e.clientY });

    // Eraser performs immediate proximity stroke deletion
    if (tool === 'eraser') {
      const radius = 24;
      strokesRef.current = strokesRef.current.filter((stroke) => {
        return !stroke.points.some((p) => Math.hypot(p.x - e.clientX, p.y - e.clientY) < radius);
      });
    }

    redraw();
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentPointsRef.current.length >= 2 && tool !== 'eraser') {
      // Smart Pen auto shape detection
      if (tool === 'smartpen') {
        const detected = detectShape(currentPointsRef.current);
        if (detected.type !== 'none' && detected.confidence >= 0.75) {
          audioService.play('pop');
          const shapeLabels: Record<string, string> = {
            circle: 'Círculo Perfeito',
            rectangle: 'Retângulo Alinhado',
            triangle: 'Triângulo Geométrico',
            diamond: 'Losango / Diamante',
            line: 'Linha Reta Precisa'
          };
          showToolToast(`✨ ${shapeLabels[detected.type] || 'Forma Snapped'}`);

          strokesRef.current.push({
            points: detected.points,
            color: colorRef.current,
            width: strokeWidthRef.current,
            tool: (detected.type === 'circle' ? 'ellipse' : detected.type) as DrawingTool,
            fillMode: fillModeRef.current,
            vanishing: vanishingInk,
            timestamp: Date.now()
          });
        } else {
          // Freehand fallback
          strokesRef.current.push({
            points: [...currentPointsRef.current],
            color: colorRef.current,
            width: strokeWidthRef.current,
            tool: 'pen',
            vanishing: vanishingInk,
            timestamp: Date.now()
          });
        }
      } else {
        strokesRef.current.push({
          points: [...currentPointsRef.current],
          color: colorRef.current,
          width: strokeWidthRef.current,
          tool,
          fillMode: fillModeRef.current,
          vanishing: vanishingInk,
          timestamp: Date.now()
        });
      }
      redoStackRef.current = [];
    }

    currentPointsRef.current = [];
    redraw();
  };

  const commitTextNote = () => {
    if (activeTextPrompt && textInputValue.trim()) {
      strokesRef.current.push({
        points: [{ x: activeTextPrompt.x, y: activeTextPrompt.y }],
        color: colorRef.current,
        width: strokeWidthRef.current,
        tool: 'text',
        text: textInputValue.trim(),
        vanishing: vanishingInk,
        timestamp: Date.now()
      });
      redoStackRef.current = [];
      audioService.play('pop');
      showToolToast('Texto Adicionado na Tela');
    }
    setActiveTextPrompt(null);
    setTextInputValue('');
    redraw();
  };

  const handleUndo = () => {
    if (strokesRef.current.length > 0) {
      const removed = strokesRef.current.pop()!;
      redoStackRef.current.push(removed);

      if (removed.tool === 'stamp' && removed.stampType === 'number' && nextStampRef.current > 1) {
        setNextStampNumber(Math.max(1, nextStampRef.current - 1));
      }
      redraw();
      showToolToast('Desfeito (Ctrl+Z)');
    }
  };

  const handleRedo = () => {
    if (redoStackRef.current.length > 0) {
      const restored = redoStackRef.current.pop()!;
      strokesRef.current.push(restored);

      if (restored.tool === 'stamp' && restored.stampType === 'number') {
        setNextStampNumber((prev) => prev + 1);
      }
      redraw();
      showToolToast('Refeito (Ctrl+Y)');
    }
  };

  const handleClear = () => {
    strokesRef.current = [];
    redoStackRef.current = [];
    currentPointsRef.current = [];
    setNextStampNumber(1);
    redraw();
  };

  const handleSaveAnnotation = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      await window.electronAPI.copyScreenshotToClipboard(dataUrl);
      audioService.play('camera');
      showToolToast('📸 Anotações Copiadas para a Área de Transferência!');
    } catch (e) {
      console.error('Failed to copy annotation image:', e);
      showToolToast('Erro ao salvar anotação');
    }
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

      {/* Inline Text Input Bubble when typing */}
      {activeTextPrompt && (
        <div
          className="absolute z-50 p-2 bg-[#121722] border border-[#78A5FF] rounded-xl shadow-2xl flex items-center gap-2"
          style={{
            left: `${Math.min(window.innerWidth - 260, Math.max(20, activeTextPrompt.x - 20))}px`,
            top: `${Math.min(window.innerHeight - 80, Math.max(20, activeTextPrompt.y - 20))}px`,
            WebkitAppRegion: 'no-drag'
          } as any}
        >
          <Type className="w-4 h-4 text-[#78A5FF]" />
          <input
            type="text"
            autoFocus
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTextNote();
              if (e.key === 'Escape') setActiveTextPrompt(null);
            }}
            placeholder="Digite sua anotação..."
            className="bg-transparent text-white text-xs px-2 py-1 outline-none w-48 font-medium"
          />
          <button
            onClick={commitTextNote}
            className="bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] text-[10px] px-2 py-1 rounded font-bold"
          >
            OK
          </button>
        </div>
      )}

      {/* Collapsed Pill (Minimizable Zoom Dock) */}
      {isMinimized ? (
        <div
          className={`absolute ${
            dockPosition === 'top' ? 'top-4' : 'bottom-4'
          } left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-[#0B0E14]/95 backdrop-blur-2xl border border-[#303A4B] px-4 py-2 rounded-full shadow-2xl text-[#F3F5F9] z-50 cursor-pointer hover:border-[#78A5FF]/50 transition-all`}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={() => setIsMinimized(false)}
        >
          <Sparkles className="w-4 h-4 text-[#78A5FF] animate-pulse" />
          <span className="text-xs font-bold text-[#F3F5F9]">Anotações Aura Studio</span>
          <span className="text-[10px] text-[#929CAF] font-mono">({tool})</span>
          <Maximize2 className="w-3.5 h-3.5 text-[#929CAF] ml-1" />
        </div>
      ) : (
        /* Expanded Floating Toolbar Dock */
        <div
          className={`absolute ${
            dockPosition === 'top' ? 'top-3' : 'bottom-3'
          } left-1/2 -translate-x-1/2 flex items-center space-x-1.5 bg-[#0B0E14]/95 backdrop-blur-2xl border border-[#303A4B] px-3 py-1.5 rounded-2xl shadow-2xl text-[#F3F5F9] z-50 cursor-default max-w-[96vw] overflow-x-auto`}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Main Drawing Tools */}
          <div className="flex items-center space-x-1 border-r border-[#303A4B] pr-1.5">
            <button
              onClick={() => setTool('pen')}
              title="Caneta Livre (P)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'pen' ? 'bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/50 font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Pen className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('smartpen')}
              title="Caneta Inteligente Auto-Snap (S) • Converte traços livres em círculos, retângulos, triângulos e diamantes perfeitos!"
              className={`p-2 rounded-xl transition-all relative ${
                tool === 'smartpen'
                  ? 'bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/50 font-bold shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F2B66D]" />
            </button>

            <button
              onClick={() => setTool('laser')}
              title="Apontador Laser Dinâmico (Z) • Ponto neon e rastro brilhante para apresentações fluidas"
              className={`p-2 rounded-xl transition-all ${
                tool === 'laser'
                  ? 'bg-[#FF647C] text-[#2B0E13] font-bold shadow-sm ring-1 ring-[#FF647C]'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-[#F2B66D]" />
            </button>

            <button
              onClick={() => setTool('arrow')}
              title="Seta Direcional (A)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'arrow' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('darrow')}
              title="Seta Dupla (D)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'darrow' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('line')}
              title="Linha Reta (L)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'line' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('rectangle')}
              title="Retângulo / Caixa (R)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'rectangle' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('ellipse')}
              title="Círculo / Elipse (O)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'ellipse' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Circle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('diamond')}
              title="Losango / Diamante (Geometria Pro)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'diamond' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Diamond className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('triangle')}
              title="Triângulo Geométrico (Geometria Pro)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'triangle' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Triangle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('mosaic')}
              title="Mosaico de Privacidade / Redação (M) • Oculte senhas, tokens ou dados sensíveis em tempo real"
              className={`p-2 rounded-xl transition-all ${
                tool === 'mosaic'
                  ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm ring-1 ring-white/50'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('text')}
              title="Texto na Tela (T) • Clique para adicionar notas tipográficas"
              className={`p-2 rounded-xl transition-all ${
                tool === 'text' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('highlighter')}
              title="Marca-texto Translúcido (H)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'highlighter' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTool('eraser')}
              title="Borracha (E)"
              className={`p-2 rounded-xl transition-all ${
                tool === 'eraser' ? 'bg-[#FF647C] text-white shadow-sm font-bold' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Stamp Suite (6 Autostamps from Zoom + Step Number) */}
          <div className="flex items-center space-x-1 border-r border-[#232838] pr-1.5">
            <button
              onClick={() => {
                setTool('stamp');
                setStampType('check');
                showToolToast('Selo: Checkmark (✓)');
              }}
              title="Selo Checkmark (✓)"
              className={`p-1.5 rounded-lg transition-all ${
                tool === 'stamp' && stampType === 'check' ? 'bg-[#78A5FF] text-[#101A32]' : 'text-[#929CAF] hover:text-[#83B8FF]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                setTool('stamp');
                setStampType('cross');
                showToolToast('Selo: Cruz / X (✗)');
              }}
              title="Selo X / Cruz (✗)"
              className={`p-1.5 rounded-lg transition-all ${
                tool === 'stamp' && stampType === 'cross' ? 'bg-[#FF647C] text-white' : 'text-[#929CAF] hover:text-[#FF647C]'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                setTool('stamp');
                setStampType('star');
                showToolToast('Selo: Estrela (★)');
              }}
              title="Selo Estrela (★)"
              className={`p-1.5 rounded-lg transition-all ${
                tool === 'stamp' && stampType === 'star' ? 'bg-[#F2B66D] text-[#101A32]' : 'text-[#929CAF] hover:text-[#F2B66D]'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                setTool('stamp');
                setStampType('heart');
                showToolToast('Selo: Coração (♥)');
              }}
              title="Selo Coração (♥)"
              className={`p-1.5 rounded-lg transition-all ${
                tool === 'stamp' && stampType === 'heart' ? 'bg-[#FF647C] text-white' : 'text-[#929CAF] hover:text-[#FF647C]'
              }`}
            >
              <Heart className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                setTool('stamp');
                setStampType('number');
                showToolToast(`Selo Numerado #${nextStampNumber}`);
              }}
              title={`Selo Numerado de Passos (#${nextStampNumber})`}
              className={`px-1.5 py-1 rounded-lg transition-all flex items-center gap-0.5 font-mono text-[10px] font-bold ${
                tool === 'stamp' && stampType === 'number' ? 'bg-[#78A5FF] text-[#101A32]' : 'text-[#929CAF] hover:text-[#78A5FF]'
              }`}
            >
              <Hash className="w-3 h-3" />
              <span>{nextStampNumber}</span>
            </button>
          </div>

          {/* Fill Mode for Shapes (Outline / Tint / Solid) */}
          {['rectangle', 'ellipse', 'diamond', 'triangle', 'smartpen'].includes(tool) && (
            <div className="flex items-center space-x-1 border-r border-[#222B39] pr-1.5">
              <button
                onClick={() => setFillMode('outline')}
                title="Apenas Contorno (Transparente)"
                className={`px-1.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                  fillMode === 'outline' ? 'bg-[#78A5FF] text-[#101A32] font-bold' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
                }`}
              >
                Vazado
              </button>
              <button
                onClick={() => setFillMode('tint')}
                title="Preenchimento Translúcido (25%)"
                className={`px-1.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                  fillMode === 'tint' ? 'bg-[#78A5FF] text-[#101A32] font-bold' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
                }`}
              >
                Translúcido
              </button>
              <button
                onClick={() => setFillMode('solid')}
                title="Preenchimento Sólido (100%)"
                className={`px-1.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                  fillMode === 'solid' ? 'bg-[#78A5FF] text-[#101A32] font-bold' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
                }`}
              >
                Sólido
              </button>
            </div>
          )}

          {/* Color Palette */}
          {tool !== 'eraser' && tool !== 'mosaic' && (
            <div className="flex items-center space-x-1.5 border-r border-[#232838] pr-1.5">
              {colors.map((c, idx) => (
                <button
                  key={c.hex}
                  onClick={() => handleColorChange(c.hex, c.name)}
                  title={`${c.name} (Tecla ${idx + 1})`}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    color.toLowerCase() === c.hex.toLowerCase()
                      ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-black'
                      : 'hover:scale-110 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}

              {/* Custom Color Spectrum Picker */}
              <label
                title="Escolher Cor Personalizada (Espectro Completo)"
                className="relative w-4 h-4 rounded-full cursor-pointer overflow-hidden border border-slate-600 hover:border-white transition-all hover:scale-110 flex items-center justify-center shrink-0"
                style={{
                  background:
                    'conic-gradient(from 0deg, #f43f5e, #f59e0b, #10b981, #38bdf8, #6366f1, #ec4899, #f43f5e)'
                }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="absolute -top-4 -left-4 w-12 h-12 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          )}

          {/* Stroke Width Selector */}
          <div className="flex items-center space-x-1 border-r border-[#222B39] pr-1.5">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                title={`Espessura: ${w}px`}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                  strokeWidth === w ? 'bg-[#78A5FF] text-[#101A32] font-bold' : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
                }`}
              >
                <div className="rounded-full bg-current" style={{ width: `${w * 1.4}px`, height: `${w * 1.4}px` }} />
              </button>
            ))}
          </div>

          {/* Whiteboard / Blackboard Mode Switch (Zoom CAnnoPduSwitchWhiteboard) */}
          <button
            onClick={cycleWhiteboard}
            title="Alternar Modo Whiteboard (W) • Tela Transparente / Quadro Branco / Quadro Negro"
            className={`flex items-center space-x-1 px-2 py-1 rounded-xl text-xs font-medium transition-all border ${
              whiteboardMode === 'whiteboard'
                ? 'bg-white text-slate-900 border-white font-bold shadow-sm'
                : whiteboardMode === 'blackboard'
                ? 'bg-[#121722] text-[#83B8FF] border-[#78A5FF]/50 font-bold shadow-sm'
                : 'text-[#929CAF] border-[#222B39] hover:text-[#F3F5F9] hover:bg-[#222B39]'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="text-[10px]">
              {whiteboardMode === 'whiteboard' ? 'Branco' : whiteboardMode === 'blackboard' ? 'Negro' : 'Quadro'}
            </span>
          </button>

          {/* Focus & Spotlight Toggles */}
          <div className="flex items-center space-x-1 border-r border-[#222B39] pr-1.5">
            <button
              onClick={() => setMouseSpotlight(!mouseSpotlight)}
              title="Holofote de Mouse (Halo luminoso)"
              className={`p-1.5 rounded-xl transition-all ${
                mouseSpotlight
                  ? 'bg-[#78A5FF]/20 text-[#83B8FF] border border-[#78A5FF]/40 shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setBackgroundDimmer(!backgroundDimmer)}
              title="Foco de Luz Cinematográfico (Dimmer de Fundo)"
              className={`p-1.5 rounded-xl transition-all ${
                backgroundDimmer
                  ? 'bg-[#78A5FF]/20 text-[#83B8FF] border border-[#78A5FF]/40 shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
              }`}
            >
              <Focus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Vanishing Ink Mode Toggle */}
          <button
            onClick={() => setVanishingInk(!vanishingInk)}
            title="Tinta Inteligente Auto-apagar em 3 segundos"
            className={`flex items-center space-x-1 px-2 py-1 rounded-xl text-[10px] font-medium transition-all ${
              vanishingInk
                ? 'bg-[#78A5FF]/20 text-[#83B8FF] border border-[#78A5FF]/30'
                : 'text-[#929CAF] hover:text-[#F3F5F9] bg-[#191F2B]'
            }`}
          >
            <Clock className="w-3 h-3 text-[#78A5FF]" />
            <span>3s Fade</span>
            {vanishingInk && <Check className="w-2.5 h-2.5 text-[#83B8FF]" />}
          </button>

          {/* Undo & Redo (Zoom CAnnoCmdStack) */}
          <button
            onClick={handleUndo}
            title="Desfazer (Ctrl+Z ou U)"
            className="p-1.5 rounded-xl text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39] transition-colors active:scale-95"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleRedo}
            title="Refazer (Ctrl+Y ou Ctrl+Shift+Z)"
            className="p-1.5 rounded-xl text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39] transition-colors active:scale-95"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          {/* Save / Screenshot Annotation */}
          <button
            onClick={handleSaveAnnotation}
            title="Copiar Anotação para Área de Transferência / Snapshot Aura"
            className="p-1.5 rounded-xl text-[#83B8FF] hover:text-[#9AB9FF] hover:bg-[#78A5FF]/10 transition-colors active:scale-95"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          {/* Clear Canvas */}
          <button
            onClick={handleClear}
            title="Limpar todos os desenhos (C)"
            className="p-1.5 rounded-xl text-[#929CAF] hover:text-[#FF647C] hover:bg-[#FF647C]/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Dock Position Flip & Minimize */}
          <button
            onClick={() => setDockPosition(dockPosition === 'top' ? 'bottom' : 'top')}
            title={dockPosition === 'top' ? 'Fixar Barra no Rodapé' : 'Fixar Barra no Topo'}
            className="p-1.5 rounded-xl text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39] transition-colors"
          >
            {dockPosition === 'top' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsMinimized(true)}
            title="Minimizar Barra Flutuante"
            className="p-1.5 rounded-xl text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39] transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          {/* Done / Close Drawing Mode */}
          <button
            onClick={handleClose}
            className="flex items-center space-x-1 bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] font-bold px-2.5 py-1 rounded-xl text-xs transition-colors shadow-sm active:scale-95 ml-1"
          >
            <span>Concluir</span>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Floating Shortcut HUD Toast */}
      {toolToast && (
        <div
          className={`absolute ${
            dockPosition === 'top' ? 'top-14' : 'bottom-14'
          } left-1/2 -translate-x-1/2 bg-[#121722]/95 backdrop-blur-xl border border-[#78A5FF]/40 text-[#83B8FF] text-xs font-semibold px-4 py-1.5 rounded-full shadow-2xl z-40 pointer-events-none animate-in fade-in zoom-in-95`}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <span>{toolToast}</span>
        </div>
      )}
    </div>
  );
};
