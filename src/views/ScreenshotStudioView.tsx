import React, { useState, useEffect, useRef } from 'react';
import {
  MousePointer,
  ArrowRight,
  Square,
  PenTool,
  Hash,
  EyeOff,
  Type,
  Undo2,
  Copy,
  Check,
  Download,
  X,
  Sparkles,
  Crop
} from 'lucide-react';

type Tool = 'select' | 'crop' | 'arrow' | 'rect' | 'step' | 'blur' | 'pen' | 'text';

interface Annotation {
  id: string;
  type: Tool;
  color: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  points?: { x: number; y: number }[];
  text?: string;
  stepNumber?: number;
}

const COLORS = [
  { id: 'blue', hex: '#78A5FF', name: 'Azul Nocturne' },
  { id: 'coral', hex: '#FF647C', name: 'Coral Gravação' },
  { id: 'amber', hex: '#F2B66D', name: 'Âmbar Alerta' },
  { id: 'light-blue', hex: '#83B8FF', name: 'Azul Sucesso' },
  { id: 'ice', hex: '#9AB9FF', name: 'Azul Gelo' }
];

export const ScreenshotStudioView: React.FC = () => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('arrow');
  const [activeColor, setActiveColor] = useState<string>('#78A5FF');
  const activeColorRef = useRef(activeColor);

  useEffect(() => {
    activeColorRef.current = activeColor;
  }, [activeColor]);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const [stepCounter, setStepCounter] = useState(1);
  const [isCopied, setIsCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentAnnotRef = useRef<Annotation | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleColorChange = (newColor: string, colorName?: string) => {
    setActiveColor(newColor);
    activeColorRef.current = newColor;

    // If there is an existing annotation created recently, update its color
    setAnnotations((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        color: newColor
      };
      return updated;
    });

    const label =
      colorName ||
      COLORS.find((c) => c.hex.toLowerCase() === newColor.toLowerCase())?.name ||
      newColor.toUpperCase();
    showToast(`🎨 Cor: ${label}`);
  };

  useEffect(() => {
    const cleanup = window.electronAPI.onScreenshotData((url) => {
      setDataUrl(url);
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        drawAll();
      };
      img.src = url;
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') {
        window.electronAPI.closeCurrentWindow();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'a') {
          setActiveTool('arrow');
          showToast('Ferramenta: Seta (Tecla A)');
        } else if (k === 'r') {
          setActiveTool('rect');
          showToast('Ferramenta: Retângulo (Tecla R)');
        } else if (k === 's') {
          setActiveTool('step');
          showToast(`Ferramenta: Passo #${stepCounter} (Tecla S)`);
        } else if (k === 'p') {
          setActiveTool('pen');
          showToast('Ferramenta: Caneta Livre (Tecla P)');
        } else if (k === 'b') {
          setActiveTool('blur');
          showToast('Ferramenta: Tarja Confidencial (Tecla B)');
        } else if (k === 't') {
          setActiveTool('text');
          showToast('Ferramenta: Texto (Tecla T)');
        } else if (k === 'c') {
          setActiveTool('crop');
          showToast('Ferramenta: Recortar (Tecla C)');
        } else if (k === 'u') {
          handleUndo();
        } else if (k === '1') {
          handleColorChange(COLORS[0].hex, COLORS[0].name);
        } else if (k === '2') {
          handleColorChange(COLORS[1].hex, COLORS[1].name);
        } else if (k === '3') {
          handleColorChange(COLORS[2].hex, COLORS[2].name);
        } else if (k === '4') {
          handleColorChange(COLORS[3].hex, COLORS[3].name);
        } else if (k === '5') {
          handleColorChange(COLORS[4].hex, COLORS[4].name);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cleanup();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [annotations, cropRect, stepCounter]);

  const drawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Draw base screenshot
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);

    // Draw annotations
    const list = currentAnnotRef.current ? [...annotations, currentAnnotRef.current] : annotations;

    list.forEach((item) => {
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (item.type === 'rect') {
        const x = Math.min(item.startX, item.endX);
        const y = Math.min(item.startY, item.endY);
        const w = Math.abs(item.endX - item.startX);
        const h = Math.abs(item.endY - item.startY);
        ctx.strokeRect(x, y, w, h);
      } else if (item.type === 'blur') {
        const x = Math.min(item.startX, item.endX);
        const y = Math.min(item.startY, item.endY);
        const w = Math.abs(item.endX - item.startX);
        const h = Math.abs(item.endY - item.startY);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.fillRect(x, y, w, h);
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('CONFIDENCIAL', x + 6, y + Math.min(h / 2 + 4, 16));
      } else if (item.type === 'arrow') {
        drawArrow(ctx, item.startX, item.startY, item.endX, item.endY, item.color);
      } else if (item.type === 'pen' && item.points && item.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) {
          ctx.lineTo(item.points[i].x, item.points[i].y);
        }
        ctx.stroke();
      } else if (item.type === 'step') {
        const radius = 15;
        ctx.beginPath();
        ctx.arc(item.startX, item.startY, radius, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item.stepNumber || 1), item.startX, item.startY);
      } else if (item.type === 'text' && item.text) {
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, item.startX, item.startY);
      }
    });

    // Dim outside crop rect if crop tool is active
    if (cropRect) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, canvas.width, cropRect.y);
      ctx.fillRect(0, cropRect.y + cropRect.h, canvas.width, canvas.height - (cropRect.y + cropRect.h));
      ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h);
      ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, canvas.width - (cropRect.x + cropRect.w), cropRect.h);

      ctx.strokeStyle = '#78A5FF';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.setLineDash([]);
    }
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string
  ) => {
    const headLength = 16;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'step') {
      const newStep: Annotation = {
        id: 'annot_' + Date.now(),
        type: 'step',
        color: activeColor,
        startX: x,
        startY: y,
        endX: x,
        endY: y,
        stepNumber: stepCounter
      };
      setAnnotations([...annotations, newStep]);
      setStepCounter(stepCounter + 1);
      drawAll();
      return;
    }

    if (activeTool === 'text') {
      const text = prompt('Digite o texto para anotação:');
      if (text && text.trim()) {
        const newText: Annotation = {
          id: 'annot_' + Date.now(),
          type: 'text',
          color: activeColor,
          startX: x,
          startY: y,
          endX: x,
          endY: y,
          text: text.trim()
        };
        setAnnotations([...annotations, newText]);
        drawAll();
      }
      return;
    }

    isDrawingRef.current = true;
    currentAnnotRef.current = {
      id: 'annot_' + Date.now(),
      type: activeTool,
      color: activeColor,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      points: activeTool === 'pen' ? [{ x, y }] : undefined
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentAnnotRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'crop') {
      const sx = currentAnnotRef.current.startX;
      const sy = currentAnnotRef.current.startY;
      setCropRect({
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        w: Math.abs(x - sx),
        h: Math.abs(y - sy)
      });
      drawAll();
      return;
    }

    currentAnnotRef.current.endX = x;
    currentAnnotRef.current.endY = y;
    if (activeTool === 'pen' && currentAnnotRef.current.points) {
      currentAnnotRef.current.points.push({ x, y });
    }
    drawAll();
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (currentAnnotRef.current && activeTool !== 'crop') {
      setAnnotations([...annotations, currentAnnotRef.current]);
    }
    currentAnnotRef.current = null;
    drawAll();
  };

  const handleUndo = () => {
    if (cropRect) {
      setCropRect(null);
      drawAll();
      return;
    }
    if (annotations.length > 0) {
      const next = annotations.slice(0, -1);
      setAnnotations(next);
      if (annotations[annotations.length - 1]?.type === 'step') {
        setStepCounter(Math.max(1, stepCounter - 1));
      }
      drawAll();
    }
  };

  const getExportCanvas = (): HTMLCanvasElement => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas not found');

    if (!cropRect || cropRect.w < 10 || cropRect.h < 10) {
      return canvas;
    }

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropRect.w;
    croppedCanvas.height = cropRect.h;
    const cctx = croppedCanvas.getContext('2d');
    if (cctx) {
      cctx.drawImage(canvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
    }
    return croppedCanvas;
  };

  const handleCopy = async () => {
    try {
      const exportCanvas = getExportCanvas();
      const exportUrl = exportCanvas.toDataURL('image/png');
      await window.electronAPI.copyScreenshotToClipboard(exportUrl);
      setIsCopied(true);
      showToast('✨ Imagem copiada para a Área de Transferência!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Error copying screenshot:', err);
      showToast('Falha ao copiar imagem.');
    }
  };

  const handleSave = async () => {
    try {
      const exportCanvas = getExportCanvas();
      const exportUrl = exportCanvas.toDataURL('image/png');
      const savedPath = await window.electronAPI.saveScreenshotFile(exportUrl);
      showToast(`💾 Salvo em: ${savedPath}`);
    } catch (err) {
      console.error('Error saving screenshot file:', err);
      showToast('Falha ao salvar imagem.');
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="w-full h-full cursor-crosshair"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-[#121722]/95 border border-[#78A5FF]/40 text-[#F3F5F9] px-5 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs font-medium backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-[#78A5FF]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Modern Annotation Toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#121722]/95 border border-[#303A4B] backdrop-blur-xl px-4 py-2 rounded-2xl shadow-2xl flex items-center space-x-3">
        {/* Tools */}
        <div className="flex items-center space-x-1 border-r border-[#303A4B] pr-3">
          <button
            onClick={() => setActiveTool('crop')}
            title="Recortar Área (Tecla C)"
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'crop'
                ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
            }`}
          >
            <Crop className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('arrow')}
            title="Seta Direcional (Tecla A)"
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'arrow'
                ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('rect')}
            title="Destaque Retângulo (Tecla R)"
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'rect'
                ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
            }`}
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('step')}
            title="Etapas Numeradas (Tecla S)"
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'step'
                ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
            }`}
          >
            <Hash className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('pen')}
            title="Desenho Livre (Tecla P)"
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'pen'
                ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
            }`}
          >
            <PenTool className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('blur')}
            title="Tarja de Confidencialidade (Tecla B)"
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'blur'
                ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
            }`}
          >
            <EyeOff className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('text')}
            title="Anotação de Texto (Tecla T)"
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'text'
                ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
            }`}
          >
            <Type className="w-4 h-4" />
          </button>
        </div>

        {/* Colors */}
        <div className="flex items-center space-x-1.5 border-r border-[#303A4B] pr-3">
          {COLORS.map((c, idx) => (
            <button
              key={c.id}
              onClick={() => handleColorChange(c.hex, c.name)}
              title={`${c.name} (Tecla ${idx + 1})`}
              className={`w-5 h-5 rounded-full transition-transform ${
                activeColor.toLowerCase() === c.hex.toLowerCase()
                  ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}

          {/* Custom Color Spectrum Picker */}
          <label
            title="Escolher Cor Personalizada (Espectro Completo)"
            className="relative w-5 h-5 rounded-full cursor-pointer overflow-hidden border border-[#303A4B] hover:border-white transition-all hover:scale-110 flex items-center justify-center shrink-0"
            style={{
              background:
                'conic-gradient(from 0deg, #78A5FF, #FF647C, #F2B66D, #83B8FF, #9AB9FF, #78A5FF)'
            }}
          >
            <input
              type="color"
              value={activeColor}
              onChange={(e) => handleColorChange(e.target.value)}
              className="absolute -top-4 -left-4 w-12 h-12 opacity-0 cursor-pointer"
            />
          </label>
        </div>

        {/* Undo */}
        <button
          onClick={handleUndo}
          title="Desfazer (Ctrl+Z ou U)"
          className="p-2 rounded-xl text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B] transition-all"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Copy Image Button */}
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1.5 bg-[#78A5FF] hover:bg-[#9AB9FF] active:scale-95 text-[#101A32] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm"
          title="Copiar imagem para área de transferência (Ctrl+C)"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{isCopied ? 'Copiado!' : 'Copiar Imagem'}</span>
        </button>

        {/* Save PNG Button */}
        <button
          onClick={handleSave}
          className="p-2 rounded-xl text-[#B7C0CE] hover:text-[#78A5FF] hover:bg-[#191F2B] transition-all"
          title="Salvar arquivo PNG em Fotos"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Close Button */}
        <button
          onClick={() => window.electronAPI.closeCurrentWindow()}
          title="Fechar (Esc)"
          className="p-2 rounded-xl text-[#929CAF] hover:text-[#FF647C] hover:bg-[#FF647C]/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
