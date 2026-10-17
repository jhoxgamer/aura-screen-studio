import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Edit3,
  Tv,
  Eye,
  GripHorizontal,
  X,
  FlipHorizontal,
  Clock,
  Sparkles,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Download,
  Upload,
  Maximize2,
  Minimize2,
  Anchor,
  ListChecks,
  Sliders,
  Type,
  MousePointer
} from 'lucide-react';
import { getShortcutLabel } from '../utils/shortcuts';

interface BulletNote {
  id: string;
  text: string;
  done: boolean;
}

const PRESET_SCRIPTS = [
  {
    title: 'Pitch Rápido (30s)',
    text: `Olá! Neste vídeo rápido de 30 segundos, vou te mostrar a nova versão da nossa ferramenta.\n\nPrincipais destaques:\n• Desempenho 2x mais rápido com aceleração por hardware\n• Teleprompter integrado diretamente alinhado à câmera\n• Compartilhamento instantâneo via link global\n\nFicou com alguma dúvida ou sugestão? Deixe seu comentário logo abaixo!`
  },
  {
    title: 'Demonstração de Produto',
    text: `Seja muito bem-vindo a esta demonstração!\n\nHoje vou te guiar passo a passo pelas funcionalidades essenciais do produto.\n\nObserve como a interface foi projetada para ser ágil e sem atritos.\nCom apenas um clique, você inicia a gravação com webcam em alta resolução e tela cristalina.\n\nVamos conferir os detalhes na prática.`
  },
  {
    title: 'Tutorial Passo a Passo',
    text: `Neste tutorial, você vai aprender a configurar sua apresentação com máxima qualidade.\n\nPasso 1: Selecione a resolução adequada (1080p ou 4K a 60 FPS).\nPasso 2: Ative a bolha de câmera circular e verifique o medidor de áudio.\nPasso 3: Utilize a caneta de tinta efêmera na tela para focar a atenção do público.\n\nVamos iniciar a explicação agora!`
  },
  {
    title: 'Standup / Atualização Diária',
    text: `Atualização rápida da equipe:\n\n1. O que foi concluído ontem:\n• Finalização dos testes da versão 1.3\n• Otimização dos codecs H.264\n\n2. Foco de hoje:\n• Ajustes finos na experiência de gravação\n• Revisão do teleprompter inteligente\n\n3. Bloqueios:\n• Nenhum no momento!`
  }
];

export const SpeakerNotesView: React.FC = () => {
  const [mode, setMode] = useState<'prompt' | 'notes' | 'edit'>('prompt');
  
  // Script text
  const [text, setText] = useState<string>(() => {
    return localStorage.getItem('aura_speaker_notes_v2') ||
      localStorage.getItem('aura_speaker_notes') ||
      `📝 Bem-vindo ao Teleprompter Aura!\n\nCole ou digite aqui seu roteiro de apresentação.\n\n• Pressione [ESPAÇO] para iniciar ou pausar a rolagem suave sem travar.\n• Use [SETA CIMA] e [SETA BAIXO] para acelerar ou desacelerar.\n• Mantenha o olhar na linha guia visual (índigo) para contato visual perfeito com a câmera!\n• Mude para a aba "Tópicos" se preferir falar por tópicos e marcar os itens abordados.`;
  });

  // Bullet Notes list (Loom Style checklist)
  const [bulletNotes, setBulletNotes] = useState<BulletNote[]>(() => {
    try {
      const saved = localStorage.getItem('aura_speaker_notes_bullets');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: '1', text: 'Boas-vindas e introdução ao tema', done: false },
      { id: '2', text: 'Mostrar a tela principal e novidades', done: false },
      { id: '3', text: `Demonstrar atalhos rápidos (${getShortcutLabel('a')})`, done: false },
      { id: '4', text: 'Conclusão e chamada para ação (Call to Action)', done: false }
    ];
  });

  const [newBulletText, setNewBulletText] = useState('');

  // Prompter controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(() => {
    return Number(localStorage.getItem('aura_prompter_speed')) || 1.25;
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('aura_prompter_font_size');
    return saved ? Number(saved) : 20;
  });
  const [opacity, setOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('aura_prompter_opacity');
    return saved ? Number(saved) : 95;
  });
  const [isMirrored, setIsMirrored] = useState<boolean>(() => {
    return localStorage.getItem('aura_prompter_mirrored') === 'true';
  });
  const [pauseOnHover, setPauseOnHover] = useState<boolean>(() => {
    return localStorage.getItem('aura_prompter_pause_on_hover') === 'true';
  });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentLinePreview, setCurrentLinePreview] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);
  const scrollPosRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('aura_speaker_notes_v2', text);
  }, [text]);

  useEffect(() => {
    localStorage.setItem('aura_prompter_speed', speed.toString());
  }, [speed]);

  useEffect(() => {
    localStorage.setItem('aura_prompter_font_size', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('aura_prompter_opacity', opacity.toString());
  }, [opacity]);

  useEffect(() => {
    localStorage.setItem('aura_prompter_mirrored', String(isMirrored));
  }, [isMirrored]);

  useEffect(() => {
    localStorage.setItem('aura_prompter_pause_on_hover', String(pauseOnHover));
  }, [pauseOnHover]);

  useEffect(() => {
    localStorage.setItem('aura_speaker_notes_bullets', JSON.stringify(bulletNotes));
  }, [bulletNotes]);

  // Keep line preview updated for collapsed pill mode
  useEffect(() => {
    const firstLine = text.split('\n').find(l => l.trim().length > 0) || 'Roteiro Aura';
    setCurrentLinePreview(firstLine.length > 38 ? firstLine.slice(0, 35) + '...' : firstLine);
  }, [text]);

  // Global window keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in textarea or input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return;
      }

      if (mode === 'prompt' && !isCollapsed) {
        if (e.code === 'Space') {
          e.preventDefault();
          setIsPlaying(prev => !prev);
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          setSpeed(prev => Math.min(4.0, Math.round((prev + 0.25) * 100) / 100));
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          setSpeed(prev => Math.max(0.25, Math.round((prev - 0.25) * 100) / 100));
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          handleReset();
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setFontSize(prev => Math.min(48, prev + 2));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setFontSize(prev => Math.max(14, prev - 2));
        }
      }

      if (e.key === 'Escape') {
        window.electronAPI?.toggleSpeakerNotes?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isCollapsed]);

  // Butter-smooth 60fps auto-scroll engine with smart pause-on-hover support
  useEffect(() => {
    if (!isPlaying || mode !== 'prompt' || isCollapsed) {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      return;
    }

    let lastTime = performance.now();

    const step = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (containerRef.current) {
        if (!pauseOnHover || !isHovered) {
          // Base: 24 pixels per second per speed unit
          const pixelsPerSecond = speed * 30;
          scrollPosRef.current += pixelsPerSecond * delta;
          containerRef.current.scrollTop = scrollPosRef.current;

          // Auto pause when reaching the end of the text
          const maxScroll = containerRef.current.scrollHeight - containerRef.current.clientHeight;
          if (scrollPosRef.current >= maxScroll - 4) {
            setIsPlaying(false);
            return;
          }
        }
      }

      scrollAnimRef.current = requestAnimationFrame(step);
    };

    scrollAnimRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    };
  }, [isPlaying, speed, mode, isCollapsed, pauseOnHover, isHovered]);

  // Sync scroll position when user manually scrolls
  const handleScroll = () => {
    if (containerRef.current) {
      scrollPosRef.current = containerRef.current.scrollTop;
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    scrollPosRef.current = 0;
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };

  // Toggle Collapse / Pill mode
  const handleToggleCollapse = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    if (nextCollapsed) {
      window.electronAPI?.resizeSpeakerNotes?.(360, 52);
    } else {
      window.electronAPI?.resizeSpeakerNotes?.(440, 520);
    }
  };

  // Quick Window Size Presets
  const handleSetSize = (w: number, h: number) => {
    if (isCollapsed) setIsCollapsed(false);
    window.electronAPI?.resizeSpeakerNotes?.(w, h);
  };

  // Docking
  const handleDock = (target: 'top-center' | 'near-camera') => {
    window.electronAPI?.dockSpeakerNotes?.(target);
  };

  // Checklist Actions
  const handleToggleBullet = (id: string) => {
    setBulletNotes(prev =>
      prev.map(item => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const handleAddBullet = () => {
    if (!newBulletText.trim()) return;
    const newItem: BulletNote = {
      id: `note_${Date.now()}`,
      text: newBulletText.trim(),
      done: false
    };
    setBulletNotes(prev => [...prev, newItem]);
    setNewBulletText('');
  };

  const handleDeleteBullet = (id: string) => {
    setBulletNotes(prev => prev.filter(item => item.id !== id));
  };

  const handleResetChecklist = () => {
    setBulletNotes(prev => prev.map(item => ({ ...item, done: false })));
  };

  // Convert prompter script into bullet points
  const handleConvertScriptToBullets = () => {
    const lines = text
      .split('\n')
      .map(l => l.replace(/^[-•*0-9.)\s]+/, '').trim())
      .filter(l => l.length > 2);

    if (lines.length > 0) {
      const newItems: BulletNote[] = lines.slice(0, 15).map((l, i) => ({
        id: `conv_${Date.now()}_${i}`,
        text: l,
        done: false
      }));
      setBulletNotes(newItems);
      setMode('notes');
    }
  };

  // Import file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          setText(content);
          setMode('prompt');
          handleReset();
        }
      };
      reader.readAsText(file);
    }
  };

  // Export script
  const handleExportScript = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aura_Roteiro_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Word count & metrics
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((wordCount / 130) * 60);
  const estimatedMinutes = Math.floor(estimatedSeconds / 60);
  const remainingSeconds = estimatedSeconds % 60;
  const approximateWpm = Math.round(130 * speed);

  const completedBullets = bulletNotes.filter(b => b.done).length;
  const bulletProgressPct = bulletNotes.length > 0 ? Math.round((completedBullets / bulletNotes.length) * 100) : 0;

  // -------------------------------------------------------------
  // RENDER: Collapsed Mini Pill View (Saves 90% Screen Space)
  // -------------------------------------------------------------
  if (isCollapsed) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-between px-3 bg-[#121520]/95 backdrop-blur-xl border border-[#232838] rounded-full shadow-2xl text-white select-none font-sans"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center space-x-2 overflow-hidden pr-2">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0 shadow-sm shadow-indigo-400/50" />
          <span className="text-xs font-semibold font-mono text-indigo-300 shrink-0">Prompter</span>
          <span className="text-[11px] text-slate-300 truncate max-w-[150px] font-medium">
            {currentLinePreview}
          </span>
        </div>

        <div className="flex items-center space-x-1.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {mode === 'prompt' && (
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-1.5 rounded-full text-xs font-medium transition-all ${
                isPlaying
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
              title={isPlaying ? 'Pausar (Espaço)' : 'Iniciar (Espaço)'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </button>
          )}

          <button
            onClick={handleToggleCollapse}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Expandir Janela Completa"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => window.electronAPI?.toggleSpeakerNotes?.()}
            className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Full Teleprompter / Notes Window
  // -------------------------------------------------------------
  return (
    <div
      className="w-screen h-screen flex flex-col rounded-2xl border border-[#232838] bg-[#0c0e14]/95 backdrop-blur-2xl text-white shadow-2xl overflow-hidden select-none font-sans"
      style={{ opacity: opacity / 100 }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Header & Draggable Titlebar */}
      <div
        className="flex items-center justify-between px-3.5 py-2 bg-[#121520] border-b border-[#202534] cursor-grab active:cursor-grabbing"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Left Title and Status */}
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50 animate-pulse" />
          <span className="text-xs font-semibold tracking-tight text-white flex items-center gap-1.5 font-mono">
            Aura Prompter
          </span>
          {mode === 'prompt' && (
            <span className="text-[10px] text-indigo-300 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-500/20 font-mono font-medium">
              {approximateWpm} WPM ({speed.toFixed(2)}x)
            </span>
          )}
          {mode === 'notes' && (
            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono font-medium">
              {completedBullets}/{bulletNotes.length} Feito ({bulletProgressPct}%)
            </span>
          )}
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* Quick Dock to Camera Center */}
          <button
            onClick={() => handleDock('top-center')}
            className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 transition-colors"
            title="Ancorar no Topo Central (Sob a Câmera)"
          >
            <Anchor className="w-3.5 h-3.5" />
          </button>

          {/* Preset Window Sizes */}
          <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 space-x-0.5 text-[9px] font-mono font-bold text-slate-400">
            <button
              onClick={() => handleSetSize(360, 320)}
              className="px-1.5 py-0.5 hover:text-indigo-400 hover:bg-slate-700 rounded transition-colors"
              title="Tamanho Compacto (P)"
            >
              P
            </button>
            <button
              onClick={() => handleSetSize(440, 520)}
              className="px-1.5 py-0.5 hover:text-indigo-400 hover:bg-slate-700 rounded transition-colors"
              title="Tamanho Padrão (M)"
            >
              M
            </button>
            <button
              onClick={() => handleSetSize(540, 660)}
              className="px-1.5 py-0.5 hover:text-indigo-400 hover:bg-slate-700 rounded transition-colors"
              title="Tamanho Expandido (G)"
            >
              G
            </button>
          </div>

          {/* Opacity Cycle */}
          <button
            onClick={() => {
              const opacities = [95, 80, 60, 40];
              const next = opacities[(opacities.indexOf(opacity) + 1) % opacities.length];
              setOpacity(next);
            }}
            className="px-1.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[10px] font-mono text-slate-400 hover:text-white"
            title="Alternar Transparência da Janela"
          >
            {opacity}%
          </button>

          {/* Minimize into Pill */}
          <button
            onClick={handleToggleCollapse}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Colapsar em Pílula Flutuante"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Window */}
          <button
            onClick={() => window.electronAPI?.toggleSpeakerNotes?.()}
            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors ml-0.5"
            title="Fechar (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0e111a] border-b border-[#202534]">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setMode('prompt')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              mode === 'prompt'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Teleprompter</span>
          </button>

          <button
            onClick={() => setMode('notes')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              mode === 'notes'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Tópicos & Checklist</span>
          </button>

          <button
            onClick={() => setMode('edit')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              mode === 'edit'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editor & Roteiro</span>
          </button>
        </div>

        {/* Quick file load / export */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-[#1a1f2e] transition-colors"
            title="Importar Roteiro (.txt ou .md)"
          >
            <Upload className="w-3 h-3" />
          </button>
          <button
            onClick={handleExportScript}
            className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-[#1a1f2e] transition-colors"
            title="Exportar Roteiro para Arquivo"
          >
            <Download className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. TELEPROMPTER VIEW (Fluid Auto-Scroll)                     */}
      {/* ============================================================ */}
      {mode === 'prompt' && (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* Prompter Control Bar */}
          <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#121520]/80 border-b border-[#202534] text-xs">
            {/* Play / Pause / Reset */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all shadow-sm ${
                  isPlaying
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
                title={isPlaying ? 'Pausar Rolagem (Espaço)' : 'Iniciar Rolagem (Espaço)'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPlaying ? 'Pausar' : 'Iniciar'}</span>
              </button>

              <button
                onClick={handleReset}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="Reiniciar Roteiro para o Início (R)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Speed & Tuning */}
            <div className="flex items-center space-x-2">
              {/* Speed Decrease / Increase */}
              <div className="flex items-center bg-[#171b26] rounded-lg p-0.5 border border-[#232838]">
                <button
                  onClick={() => setSpeed(prev => Math.max(0.25, Math.round((prev - 0.25) * 100) / 100))}
                  className="p-1 hover:text-indigo-400 text-slate-400 transition-colors"
                  title="Diminuir velocidade (Seta Baixo)"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className="text-[11px] font-mono font-medium px-1.5 text-indigo-300">
                  {speed.toFixed(2)}x
                </span>
                <button
                  onClick={() => setSpeed(prev => Math.min(4.0, Math.round((prev + 0.25) * 100) / 100))}
                  className="p-1 hover:text-indigo-400 text-slate-400 transition-colors"
                  title="Aumentar velocidade (Seta Cima)"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
              </div>

              {/* Font Size (+ / -) */}
              <div className="flex items-center bg-[#171b26] rounded-lg p-0.5 border border-[#232838]">
                <button
                  onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                  className="px-1.5 py-0.5 hover:text-indigo-400 text-[11px] font-medium text-slate-400 transition-colors"
                  title="Diminuir tamanho da fonte"
                >
                  A-
                </button>
                <span className="text-[10px] font-mono px-1 text-slate-300">{fontSize}px</span>
                <button
                  onClick={() => setFontSize(prev => Math.min(38, prev + 2))}
                  className="px-1.5 py-0.5 hover:text-indigo-400 text-[11px] font-medium text-slate-400 transition-colors"
                  title="Aumentar tamanho da fonte"
                >
                  A+
                </button>
              </div>

              {/* Pause on Hover */}
              <button
                onClick={() => setPauseOnHover(!pauseOnHover)}
                className={`p-1.5 rounded-lg transition-all ${
                  pauseOnHover
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-[#171b26] border border-[#232838] hover:bg-slate-700 text-slate-400 hover:text-white'
                }`}
                title={pauseOnHover ? 'Pausar rolagem ao passar o mouse: ATIVADO' : 'Pausar rolagem ao passar o mouse: DESATIVADO'}
              >
                <MousePointer className="w-3.5 h-3.5" />
              </button>

              {/* Mirror Horizontal */}
              <button
                onClick={() => setIsMirrored(!isMirrored)}
                className={`p-1.5 rounded-lg transition-all ${
                  isMirrored
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'bg-[#171b26] border border-[#232838] hover:bg-slate-700 text-slate-400 hover:text-white'
                }`}
                title="Espelhar Horizontalmente (Para teleprompters ópticos com vidro)"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Eyeline Visual Indicator Bar (Linha do Olhar) */}
          <div className="absolute top-28 inset-x-0 pointer-events-none z-20 flex items-center px-4">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
            <div className="bg-[#121520]/95 border border-indigo-500/40 text-[9px] font-mono font-medium text-indigo-300 px-2.5 py-0.5 rounded-full shadow-lg flex items-center space-x-1.5 mx-2 backdrop-blur-md">
              <Eye className="w-3 h-3 text-indigo-400" />
              <span>Linha do Olhar</span>
            </div>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
          </div>

          {/* Temporary Pause Badge when hovered */}
          {pauseOnHover && isHovered && isPlaying && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-amber-500/90 text-slate-950 font-bold text-[10px] px-2.5 py-0.5 rounded-full shadow-lg z-30 tracking-wide uppercase flex items-center space-x-1 animate-in fade-in zoom-in-95">
              <Pause className="w-2.5 h-2.5 fill-current" />
              <span>Pausa por Mouse</span>
            </div>
          )}

          {/* Soft Vignette / Gradient Mask (Top & Bottom focus mask) */}
          <div className="absolute top-10 inset-x-0 h-10 bg-gradient-to-b from-[#0c0e14] to-transparent pointer-events-none z-10" />
          <div className="absolute bottom-6 inset-x-0 h-12 bg-gradient-to-t from-[#0c0e14] to-transparent pointer-events-none z-10" />

          {/* Scrollable Prompter Container (No scroll-smooth to prevent jitter) */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`flex-1 p-6 overflow-y-auto ${
              isMirrored ? 'scale-x-[-1]' : ''
            }`}
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            {/* Top padding so initial text starts right below the eyeline */}
            <div className="h-24" />

            <div
              className="font-normal text-slate-100 tracking-wide select-text transition-none"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.65 }}
            >
              {text}
            </div>

            {/* Bottom padding so last sentences can scroll comfortably past the eyeline */}
            <div className="h-72" />
          </div>

          {/* Footer Status Bar */}
          <div className="px-3.5 py-1.5 bg-[#121520] border-t border-[#202534] flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center space-x-2">
              <Clock className="w-3 h-3 text-indigo-400" />
              <span>
                {estimatedMinutes > 0 ? `${estimatedMinutes}m ` : ''}
                {remainingSeconds}s de fala estimada (~{wordCount} palavras)
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              [Espaço] Play • [Setas] Vel. • [R] Reiniciar
            </span>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. NOTES & CHECKLIST VIEW (Loom Authentic Style)             */}
      {/* ============================================================ */}
      {mode === 'notes' && (
        <div className="flex-1 flex flex-col p-4 space-y-3 overflow-hidden" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* Header & Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                Tópicos da Apresentação
              </h3>
              <p className="text-[11px] text-slate-400">
                Marque os pontos conforme for falando no vídeo
              </p>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleResetChecklist}
                className="px-2 py-1 rounded bg-[#171b26] border border-[#232838] hover:bg-slate-700 text-[10px] text-slate-300 font-mono transition-colors"
                title="Desmarcar todos os itens"
              >
                Desmarcar Todos
              </button>
              <button
                onClick={handleConvertScriptToBullets}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors shadow-sm"
                title="Importar linhas do roteiro para tópicos"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Gerar do Roteiro</span>
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[#171b26] rounded-full h-1.5 overflow-hidden border border-[#232838]">
            <div
              className="bg-indigo-500 h-full transition-all duration-300"
              style={{ width: `${bulletProgressPct}%` }}
            />
          </div>

          {/* Bullet List Container */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {bulletNotes.map((item, index) => (
              <div
                key={item.id}
                onClick={() => handleToggleBullet(item.id)}
                className={`flex items-start justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                  item.done
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-400'
                    : 'bg-[#121520] border-[#202534] hover:border-indigo-500/40 text-slate-100 shadow-sm'
                }`}
              >
                <div className="flex items-start space-x-2.5 flex-1 pr-2">
                  <button className="mt-0.5 text-indigo-400 shrink-0">
                    {item.done ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
                    )}
                  </button>
                  <div className="flex-1">
                    <span
                      className={`text-xs leading-relaxed ${
                        item.done ? 'line-through text-slate-500' : 'font-medium'
                      }`}
                    >
                      {item.text}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteBullet(item.id);
                  }}
                  className="p-1 rounded text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Excluir tópico"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {bulletNotes.length === 0 && (
              <div className="text-center py-10 text-slate-500 text-xs">
                Nenhum tópico adicionado. Digite abaixo ou clique em "Gerar do Roteiro".
              </div>
            )}
          </div>

          {/* Add new bullet note input */}
          <div className="flex items-center space-x-2 pt-1 border-t border-[#202534]">
            <input
              type="text"
              value={newBulletText}
              onChange={(e) => setNewBulletText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddBullet()}
              placeholder="Adicionar novo tópico (pressione Enter)..."
              className="flex-1 bg-[#0e111a] border border-[#202534] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={handleAddBullet}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-sm"
              title="Adicionar"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. SCRIPT EDITOR & TEMPLATES VIEW                            */}
      {/* ============================================================ */}
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
                className="px-2.5 py-1 rounded-lg bg-[#171b26] hover:bg-[#1f2433] text-[11px] text-slate-300 hover:text-white whitespace-nowrap transition-colors border border-[#232838]"
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
            className="flex-1 w-full bg-[#0e111a] border border-[#202534] rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 resize-none font-sans leading-relaxed"
          />

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-slate-400 space-x-2">
              <span>{wordCount} palavras</span>
              <span>•</span>
              <span>{text.length} caracteres</span>
              <span>•</span>
              <span>~{estimatedMinutes}m {remainingSeconds}s de fala</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleConvertScriptToBullets}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#171b26] hover:bg-[#1f2433] text-xs font-medium text-slate-200 transition-all border border-[#232838]"
              >
                <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                <span>Converter em Tópicos</span>
              </button>

              <button
                onClick={() => {
                  setMode('prompt');
                  handleReset();
                }}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white shadow-sm transition-colors active:scale-95"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Apresentar no Prompter</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
