import React, { useEffect, useState } from 'react';
import {
  Users,
  Copy,
  Check,
  QrCode,
  PenTool,
  Pause,
  Play,
  Square,
  Sparkles,
  ExternalLink,
  Zap
} from 'lucide-react';
import { liveShareService } from '../services/liveShareService';
import { audioService } from '../services/audioService';

interface FloatingReaction {
  id: string;
  emoji: string;
}

interface FloatingQuestion {
  id: string;
  text: string;
  author?: string;
}

export const ZoomShareBarView: React.FC = () => {
  const [viewersCount, setViewersCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [targetFps, setTargetFps] = useState<number>(60);
  const [currentFps, setCurrentFps] = useState<number>(60);
  const [liveUrls, setLiveUrls] = useState<{ networkUrl: string; localUrl: string; publicUrl: string | null }>({
    networkUrl: '',
    localUrl: '',
    publicUrl: null
  });
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<FloatingQuestion | null>(null);

  useEffect(() => {
    // 1. Start live screen frame capture engine at 60 FPS Ultra-Smooth
    liveShareService.startCapture(undefined, 60);

    // 2. Query initial URLs and status
    window.electronAPI?.getLiveUrls?.().then((urls) => {
      if (urls) setLiveUrls(urls);
    });

    window.electronAPI?.getLiveStatus?.().then((status) => {
      if (status) {
        setIsPaused(!!status.isPaused);
        setViewersCount(status.viewers || 0);
      }
    });

    // 3. Listen to live events from viewers
    const cleanupViewers = window.electronAPI?.onLiveViewersChanged?.((count) => {
      setViewersCount(count);
    });

    const cleanupStatus = window.electronAPI?.onLiveStatusChanged?.((status) => {
      setIsPaused(!!status?.isPaused);
      liveShareService.setPaused(!!status?.isPaused);
    });

    const cleanupReactions = window.electronAPI?.onLiveReactionReceived?.((r) => {
      const item: FloatingReaction = {
        id: `react_${Date.now()}_${Math.random()}`,
        emoji: r.emoji || '👍'
      };
      setReactions((prev) => [...prev.slice(-8), item]);
      audioService.play('pop');

      setTimeout(() => {
        setReactions((prev) => prev.filter((x) => x.id !== item.id));
      }, 2400);
    });

    const cleanupQuestions = window.electronAPI?.onLiveQuestionReceived?.((q) => {
      setActiveQuestion({
        id: `q_${Date.now()}`,
        text: q.text,
        author: q.author
      });
      audioService.play('dingdong');

      setTimeout(() => {
        setActiveQuestion((curr) => (curr?.text === q.text ? null : curr));
      }, 8000);
    });

    const fpsTimer = setInterval(() => {
      setCurrentFps(liveShareService.getCurrentFps());
    }, 1000);

    return () => {
      clearInterval(fpsTimer);
      liveShareService.stopCapture();
      cleanupViewers?.();
      cleanupStatus?.();
      cleanupReactions?.();
      cleanupQuestions?.();
    };
  }, []);

  const handleCopyLink = () => {
    const targetUrl = liveUrls.publicUrl || liveUrls.networkUrl || 'http://localhost:4545/live';
    navigator.clipboard.writeText(targetUrl);
    setIsCopied(true);
    audioService.play('pop');
    setTimeout(() => setIsCopied(false), 2200);
  };

  const handleTogglePause = async () => {
    const res = await window.electronAPI?.togglePauseLiveShare?.();
    if (res) {
      setIsPaused(res.isPaused);
      liveShareService.setPaused(res.isPaused);
    }
  };

  const handleToggleDrawing = () => {
    window.electronAPI?.toggleDrawing?.();
  };

  const handleToggleFps = () => {
    const nextFps = targetFps === 60 ? 30 : 60;
    setTargetFps(nextFps);
    liveShareService.setTargetFps(nextFps);
    audioService.play('pop');
  };

  const handleStopSharing = () => {
    liveShareService.stopCapture();
    window.electronAPI?.stopLiveShare?.();
  };

  const shareUrl = liveUrls.publicUrl || liveUrls.networkUrl || 'http://localhost:4545/live';

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-start select-none pt-1">
      {/* Floating Aura Screen Sharing Bar */}
      <div className="flex items-center space-x-2 bg-[#0B0E14]/95 border border-[#303A4B] shadow-[0_12px_36px_rgba(0,0,0,0.8)] backdrop-blur-2xl rounded-2xl px-3 py-1.5 text-xs text-[#F3F5F9]">
        
        {/* Status Pill (Nocturne Blue when live, Amber when paused) */}
        <div
          className={`flex items-center space-x-2 px-3 py-1 rounded-xl font-bold text-xs shadow-sm transition-colors shrink-0 whitespace-nowrap ${
            isPaused
              ? 'bg-[#191F2B] border border-[#F2B66D]/60 text-[#F2B66D]'
              : 'bg-[#1A2A47] border border-[#78A5FF]/50 text-[#78A5FF]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isPaused ? 'bg-[#F2B66D]' : 'bg-[#78A5FF] animate-ping'
            }`}
          />
          <span className="shrink-0">{isPaused ? 'Transmissão Pausada' : 'Você está transmitindo a tela'}</span>
        </div>

        {/* 60 FPS Ultra-Smooth Mode Badge */}
        <button
          onClick={handleToggleFps}
          title={`Taxa de quadros: ${targetFps} FPS. Clique para alternar entre 60 FPS Ultra e 30 FPS.`}
          className="flex items-center space-x-1.5 bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] px-2.5 py-1 rounded-xl text-[#F3F5F9] font-mono text-[11px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
        >
          <Zap className="w-3.5 h-3.5 text-[#78A5FF] shrink-0" />
          <span className="font-bold text-[#78A5FF] shrink-0">{targetFps} FPS</span>
          <span className="text-[10px] text-[#929CAF] shrink-0">({currentFps} real)</span>
        </button>

        {/* Viewers Counter */}
        <div
          className="flex items-center space-x-1.5 bg-[#121722] border border-[#303A4B] px-2.5 py-1 rounded-xl text-[#B7C0CE] font-medium shrink-0 whitespace-nowrap"
          title="Espectadores conectados na transmissão ao vivo"
        >
          <Users className="w-3.5 h-3.5 text-[#78A5FF] shrink-0" />
          <span className="font-bold text-[#F3F5F9] shrink-0">{viewersCount}</span>
          <span className="text-[11px] text-[#929CAF] hidden sm:inline shrink-0">ao vivo</span>
        </div>

        {/* Copy Link Button */}
        <button
          onClick={handleCopyLink}
          title="Copiar Link de Visualização ao Vivo"
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-[#121722] hover:bg-[#222B39] border border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9] transition-all active:scale-95 shrink-0 whitespace-nowrap"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-[#83B8FF] shrink-0" /> : <Copy className="w-3.5 h-3.5 text-[#78A5FF] shrink-0" />}
          <span className="shrink-0">{isCopied ? 'Link Copiado!' : 'Copiar Link'}</span>
        </button>

        {/* QR Code Button */}
        <button
          onClick={() => setShowQrModal(!showQrModal)}
          title="Exibir QR Code para Conectar no Celular"
          className={`p-1.5 rounded-xl border transition-all active:scale-95 shrink-0 ${
            showQrModal
              ? 'bg-[#78A5FF] text-[#101A32] border-[#9AB9FF]'
              : 'bg-[#121722] hover:bg-[#222B39] border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9]'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
        </button>

        {/* Anotações Aura Studio */}
        <button
          onClick={handleToggleDrawing}
          title="Abrir Ferramentas de Anotação em Tela (S, Z, M, W...)"
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-[#1A2A47] hover:bg-[#191F2B] border border-[#78A5FF]/50 text-[#78A5FF] hover:text-[#9AB9FF] font-medium transition-all active:scale-95 shrink-0 whitespace-nowrap"
        >
          <PenTool className="w-3.5 h-3.5 text-[#78A5FF] shrink-0" />
          <span className="shrink-0">Anotar</span>
        </button>

        {/* Pause / Resume Sharing */}
        <button
          onClick={handleTogglePause}
          title={isPaused ? 'Retomar Transmissão' : 'Pausar Transmissão'}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl border transition-all active:scale-95 font-medium shrink-0 whitespace-nowrap ${
            isPaused
              ? 'bg-[#F2B66D] hover:bg-[#F2B66D]/90 text-[#0B0E14] border-[#F2B66D]'
              : 'bg-[#121722] hover:bg-[#222B39] border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9]'
          }`}
        >
          {isPaused ? <Play className="w-3.5 h-3.5 fill-current shrink-0" /> : <Pause className="w-3.5 h-3.5 shrink-0" />}
          <span className="shrink-0">{isPaused ? 'Retomar' : 'Pausar'}</span>
        </button>

        {/* Stop Sharing Button */}
        <button
          onClick={handleStopSharing}
          title="Parar Compartilhamento de Tela"
          className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-[#B83A48] hover:bg-[#A83240] text-white font-bold transition-all active:scale-95 shadow-md shadow-[#B83A48]/30 shrink-0 whitespace-nowrap"
        >
          <Square className="w-3 h-3 fill-current shrink-0" />
          <span className="shrink-0">Parar Transmissão</span>
        </button>
      </div>

      {/* Floating Reactions Banner */}
      <div className="relative w-full max-w-md h-12 pointer-events-none overflow-visible flex items-center justify-center">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute text-3xl animate-bounce transition-all transform pointer-events-none"
            style={{
              left: `${Math.random() * 80 + 10}%`,
              bottom: '0px'
            }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Live Question Notification Toast */}
      {activeQuestion && (
        <div className="mt-2 bg-[#191F2B]/95 border border-[#78A5FF]/50 shadow-[0_8px_30px_rgba(0,0,0,0.8)] rounded-2xl px-4 py-2.5 max-w-md flex items-start space-x-3 animate-in fade-in slide-in-from-top-3 backdrop-blur-xl">
          <div className="w-8 h-8 rounded-xl bg-[#1A2A47] flex items-center justify-center text-[#78A5FF] shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#78A5FF] uppercase tracking-wider">
                Pergunta da Audiência
              </span>
              <span className="text-[10px] text-[#929CAF]">{activeQuestion.author || 'Espectador'}</span>
            </div>
            <p className="text-xs text-[#F3F5F9] font-medium mt-0.5 truncate">{activeQuestion.text}</p>
          </div>
        </div>
      )}

      {/* QR Code Modal Overlay */}
      {showQrModal && (
        <div className="mt-3 bg-[#121722]/95 border border-[#303A4B] shadow-[0_16px_48px_rgba(0,0,0,0.8)] rounded-2xl p-4 flex flex-col items-center backdrop-blur-2xl animate-in fade-in zoom-in-95 text-center">
          <h3 className="font-bold text-sm text-[#F3F5F9] mb-1">Acessar no Celular ou Tablet</h3>
          <p className="text-[11px] text-[#929CAF] max-w-xs mb-3">
            Aponte a câmera do seu celular para assistir à tela ao vivo a 60 FPS:
          </p>

          <div className="p-3 bg-white rounded-xl shadow-inner mb-3">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`}
              alt="QR Code da Transmissão"
              className="w-36 h-36"
            />
          </div>

          <div className="flex items-center space-x-2 w-full max-w-xs bg-[#191F2B] px-2.5 py-1.5 rounded-xl border border-[#303A4B] mb-3">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="bg-transparent text-[11px] text-[#B7C0CE] outline-none flex-1 truncate font-mono"
            />
            <button
              onClick={handleCopyLink}
              className="text-[#78A5FF] hover:text-[#9AB9FF] text-xs font-semibold shrink-0"
            >
              {isCopied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.electronAPI?.openExternalUrl?.(shareUrl)}
              className="flex items-center space-x-1 text-xs text-[#929CAF] hover:text-[#F3F5F9] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Abrir no Navegador</span>
            </button>
            <span className="text-[#303A4B]">•</span>
            <button
              onClick={() => setShowQrModal(false)}
              className="text-xs text-[#929CAF] hover:text-[#FF647C] transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
