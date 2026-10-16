import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Edit3,
  Tv,
  Type,
  Eye,
  GripHorizontal,
  X,
  FlipHorizontal,
  Clock,
  BookOpen,
  Sparkles,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

const PRESET_SCRIPTS = [
  {
    title: 'Apresentação Rápida',
    text: `Olá! Neste vídeo rápido vou mostrar as novidades que preparamos para você.\n\nPrimeiro, confira como ficou mais rápido navegar pelas gravações.\nEm seguida, veja a qualidade do áudio e como o compartilhamento é instantâneo.\n\nFicou com alguma dúvida? Deixe seu comentário aqui embaixo!`
  },
  {
    title: 'Demonstração de Produto',
    text: `Seja muito bem-vindo a esta demonstração!\n\nHoje vou te guiar passo a passo pelas principais funcionalidades da nossa plataforma.\n\nObserve como a interface foi projetada para ser simples e intuitiva.\nCom apenas um clique, você inicia sua gravação e compartilha o link globalmente.`
  },
  {
    title: 'Tutorial Passo a Passo',
    text: `Neste tutorial, você vai aprender a configurar sua gravação de tela com perfeição.\n\nPasso 1: Selecione a resolução desejada.\nPasso 2: Ative a bolha de câmera e teste o medidor de som.\nPasso 3: Use a caneta na tela para destacar pontos importantes.\n\nVamos começar!`
  }
];

export const SpeakerNotesView: React.FC = () => {
  const [mode, setMode] = useState<'prompt' | 'edit'>('prompt');
  const [text, setText] = useState<string>(() => {
    return localStorage.getItem('aura_speaker_notes') ||
      localStorage.getItem('loom_speaker_notes') ||
      '📝 Bem-vindo ao Aura Teleprompter!\n\nCole ou digite aqui seu roteiro de apresentação.\n\n• Pressione [ESPAÇO] para iniciar ou pausar a rolagem suave.\n• Use [SETA CIMA] e [SETA BAIXO] para ajustar a velocidade em tempo real.\n• Mantenha o olhar na linha guia cyan para contato visual perfeito com a câmera!\n• Clique no botão de lápis para editar este roteiro a qualquer momento.';
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(() => {
    return Number(localStorage.getItem('aura_teleprompter_speed')) || 2;
  });
  const [fontSize, setFontSize] = useState<number>(20);
  const [opacity, setOpacity] = useState<number>(95);
  const [isMirrored, setIsMirrored] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);

  // Save text & speed to localStorage
  useEffect(() => {
    localStorage.setItem('aura_speaker_notes', text);
  }, [text]);

  useEffect(() => {
    localStorage.setItem('aura_teleprompter_speed', speed.toString());
  }, [speed]);

  // Keyboard navigation: Space = Play/Pause, Up/Down = speed, Esc = Close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'prompt') {
        if (e.code === 'Space') {
          e.preventDefault();
          setIsPlaying(prev => !prev);
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          setSpeed(prev => Math.min(6, prev + 0.5));
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          setSpeed(prev => Math.max(0.5, prev - 0.5));
        }
      }
      if (e.key === 'Escape') {
        window.electronAPI.toggleSpeakerNotes();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  // Teleprompter automatic smooth scroll engine
  useEffect(() => {
    if (!isPlaying || mode !== 'prompt') {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      return;
    }

    let lastTime = performance.now();

    const step = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (containerRef.current) {
        const pixelsPerSecond = speed * 28;
        containerRef.current.scrollTop += pixelsPerSecond * delta;

        // Auto pause if reached the end
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
  }, [isPlaying, speed, mode]);

  const handleReset = () => {
    setIsPlaying(false);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleClose = () => {
    window.electronAPI.toggleSpeakerNotes();
  };

  // Word count & estimated speaking time (avg 130 words per minute)
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((wordCount / 130) * 60);
  const estimatedMinutes = Math.floor(estimatedSeconds / 60);
  const remainingSeconds = estimatedSeconds % 60;

  return (
    <div
      className="w-screen h-screen flex flex-col rounded-2xl border border-cyan-500/30 bg-[#07090e]/95 backdrop-blur-xl text-white shadow-2xl overflow-hidden select-none font-sans"
      style={{ opacity: opacity / 100 }}
    >
      {/* Draggable Titlebar & Controls */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#0b0e17]/95 border-b border-cyan-500/20 cursor-grab active:cursor-grabbing"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/80 animate-pulse" />
          <span className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5 font-mono">
            Aura Prompter
          </span>
          <span className="text-[10px] text-cyan-400/80 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30 font-mono">
            {speed.toFixed(1)}x
          </span>
        </div>

        {/* Action Controls */}
        <div
          className="flex items-center space-x-1"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Mode Switcher */}
          <button
            onClick={() => setMode(mode === 'prompt' ? 'edit' : 'prompt')}
            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all ${
              mode === 'edit'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
            }`}
            title={mode === 'prompt' ? 'Editar Roteiro' : 'Voltar ao Prompter'}
          >
            {mode === 'prompt' ? <Edit3 className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
          </button>

          {mode === 'prompt' && (
            <>
              {/* Play/Pause */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all ${
                  isPlaying
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                    : 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
                }`}
                title={isPlaying ? 'Pausar (Espaço)' : 'Iniciar Rolagem (Espaço)'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              </button>

              {/* Reset Scroll */}
              <button
                onClick={handleReset}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="Voltar ao início"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Speed Decrease / Increase */}
              <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5">
                <button
                  onClick={() => setSpeed(prev => Math.max(0.5, prev - 0.5))}
                  className="p-1 hover:text-cyan-400 text-slate-400 transition-colors"
                  title="Diminuir velocidade (Seta Baixo)"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-mono font-bold px-1 text-slate-200">
                  {speed}x
                </span>
                <button
                  onClick={() => setSpeed(prev => Math.min(6, prev + 0.5))}
                  className="p-1 hover:text-cyan-400 text-slate-400 transition-colors"
                  title="Aumentar velocidade (Seta Cima)"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
              </div>

              {/* Mirror Flip */}
              <button
                onClick={() => setIsMirrored(!isMirrored)}
                className={`p-1.5 rounded-lg transition-all ${
                  isMirrored
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white'
                }`}
                title="Espelhar Horizontalmente (Para teleprompters ópticos)"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>

              {/* Font Size (+ / -) */}
              <button
                onClick={() => setFontSize(prev => Math.min(36, prev + 2))}
                className="px-1.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-bold text-slate-400 hover:text-white"
                title="Aumentar fonte"
              >
                A+
              </button>
              <button
                onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                className="px-1.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-bold text-slate-400 hover:text-white"
                title="Diminuir fonte"
              >
                A-
              </button>

              {/* Opacity Cycle */}
              <button
                onClick={() => {
                  const opacities = [95, 80, 60, 40];
                  const next = opacities[(opacities.indexOf(opacity) + 1) % opacities.length];
                  setOpacity(next);
                }}
                className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[10px] font-mono text-slate-400 hover:text-white"
                title="Transparência"
              >
                {opacity}%
              </button>
            </>
          )}

          {/* Close */}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors ml-1"
            title="Fechar (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Prompter Mode View */}
      {mode === 'prompt' && (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* Eyeline Visual Indicator Bar */}
          <div className="absolute top-24 inset-x-0 pointer-events-none z-20 flex items-center px-4">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
            <div className="bg-[#0b0e17]/90 border border-cyan-400/40 text-[9px] font-mono text-cyan-300 px-2 py-0.5 rounded-full shadow-lg flex items-center space-x-1 mx-2">
              <Eye className="w-2.5 h-2.5" />
              <span>Linha do Olhar</span>
            </div>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
          </div>

          {/* Scrollable Prompter Text */}
          <div
            ref={containerRef}
            className={`flex-1 p-6 overflow-y-auto scroll-smooth ${
              isMirrored ? 'scale-x-[-1]' : ''
            }`}
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            {/* Top spacing padding so first sentence starts below eyeline */}
            <div className="h-20" />

            <div
              className="font-medium text-slate-100 leading-relaxed tracking-wide transition-all whitespace-pre-wrap select-text"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
            >
              {text}
            </div>

            {/* Bottom spacing padding so last sentence can scroll to the top */}
            <div className="h-64" />
          </div>

          {/* Footer Status Bar */}
          <div className="px-3.5 py-1.5 bg-[#0b0e17]/80 border-t border-cyan-500/10 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center space-x-2">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>
                {estimatedMinutes > 0 ? `${estimatedMinutes}m ` : ''}
                {remainingSeconds}s de fala estimada
              </span>
              <span>•</span>
              <span>{wordCount} palavras</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              [Espaço] Pausa • [Setas] Vel.
            </span>
          </div>
        </div>
      )}

      {/* Script Editor Mode */}
      {mode === 'edit' && (
        <div className="flex-1 flex flex-col p-4 space-y-3 overflow-hidden" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* Preset Buttons */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold whitespace-nowrap">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Modelos:
            </span>
            {PRESET_SCRIPTS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => setText(preset.text)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] text-slate-300 hover:text-white whitespace-nowrap transition-colors border border-slate-700/50"
              >
                {preset.title}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva ou cole seu roteiro aqui..."
            className="flex-1 w-full bg-[#0a0d14] border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none font-sans leading-relaxed"
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400">
              {wordCount} palavras • ~{estimatedMinutes}m {remainingSeconds}s
            </span>
            <button
              onClick={() => {
                setMode('prompt');
                handleReset();
              }}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 transition-all active:scale-95"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Apresentar no Prompter</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
