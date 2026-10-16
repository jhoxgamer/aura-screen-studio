import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  X,
  Type,
  Eye,
  GripHorizontal
} from 'lucide-react';

export const SpeakerNotesView: React.FC = () => {
  const [text, setText] = useState<string>(() => {
    return localStorage.getItem('loom_speaker_notes') ||
      '📝 Bem-vindo ao Teleprompter do Loom!\n\nCole ou digite aqui seu roteiro da apresentação.\n\n• Use o botão Play para iniciar a rolagem automática.\n• Ajuste a velocidade e o tamanho do texto nos controles acima.\n• Ajuste a transparência para posicionar esta janela logo abaixo da sua webcam e manter contato visual!';
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(2); // 1 to 5
  const [fontSize, setFontSize] = useState<number>(18);
  const [opacity, setOpacity] = useState<number>(95);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);

  // Save text to localStorage
  useEffect(() => {
    localStorage.setItem('loom_speaker_notes', text);
  }, [text]);

  // Teleprompter automatic scroll engine
  useEffect(() => {
    if (!isPlaying) {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      return;
    }

    let lastTime = performance.now();

    const step = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (containerRef.current) {
        // Scroll speed in px per second
        const pixelsPerSecond = speed * 25;
        containerRef.current.scrollTop += pixelsPerSecond * delta;

        // Stop if reached the bottom
        if (
          containerRef.current.scrollTop + containerRef.current.clientHeight >=
          containerRef.current.scrollHeight - 5
        ) {
          setIsPlaying(false);
          return;
        }
      }

      scrollAnimRef.current = requestAnimationFrame(step);
    };

    scrollAnimRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    };
  }, [isPlaying, speed]);

  const handleReset = () => {
    setIsPlaying(false);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };

  const handleClose = () => {
    window.electronAPI.toggleSpeakerNotes();
  };

  return (
    <div
      className="w-screen h-screen flex flex-col rounded-2xl border border-loom-border/90 bg-[#111216]/95 backdrop-blur-md text-white shadow-2xl overflow-hidden select-none"
      style={{ opacity: opacity / 100 }}
    >
      {/* Draggable Titlebar & Controls */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#181920]/90 border-b border-loom-border/80 cursor-grab active:cursor-grabbing"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-loom-primary"></span>
          <span className="text-xs font-bold tracking-tight text-white flex items-center gap-1">
            Teleprompter / Notas
          </span>
        </div>

        {/* Action Controls */}
        <div
          className="flex items-center space-x-1"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all ${
              isPlaying ? 'bg-loom-coral text-white' : 'bg-loom-card hover:bg-loom-hover text-loom-secondary'
            }`}
            title={isPlaying ? 'Pausar Rolagem' : 'Iniciar Rolagem'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>

          {/* Reset Scroll */}
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-loom-card hover:bg-loom-hover text-loom-muted hover:text-white transition-colors"
            title="Voltar ao início"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Speed Selector */}
          <button
            onClick={() => setSpeed((speed % 5) + 1)}
            className="px-2 py-1 rounded-lg bg-loom-card hover:bg-loom-hover text-[11px] font-bold text-loom-secondary transition-colors"
            title="Velocidade de rolagem"
          >
            {speed}x
          </button>

          {/* Font Size (+ / -) */}
          <button
            onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
            className="px-1.5 py-1 rounded-lg bg-loom-card hover:bg-loom-hover text-xs font-bold text-loom-muted hover:text-white"
            title="Aumentar fonte"
          >
            A+
          </button>
          <button
            onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
            className="px-1.5 py-1 rounded-lg bg-loom-card hover:bg-loom-hover text-xs font-bold text-loom-muted hover:text-white"
            title="Diminuir fonte"
          >
            A-
          </button>

          {/* Opacity Cycle */}
          <button
            onClick={() => {
              const opacities = [95, 75, 50, 30];
              const next = opacities[(opacities.indexOf(opacity) + 1) % opacities.length];
              setOpacity(next);
            }}
            className="px-2 py-1 rounded-lg bg-loom-card hover:bg-loom-hover text-[11px] font-medium text-loom-muted hover:text-white"
            title="Ajustar transparência"
          >
            {opacity}%
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-loom-muted hover:text-red-400 transition-colors ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Text Area / Prompter Container */}
      <div
        ref={containerRef}
        className="flex-1 p-4 overflow-y-auto scroll-smooth focus:outline-none"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Digite ou cole suas anotações aqui..."
          className="w-full h-full bg-transparent resize-none border-none focus:outline-none text-gray-100 leading-relaxed font-sans"
          style={{ fontSize: `${fontSize}px` }}
        />
      </div>
    </div>
  );
};
