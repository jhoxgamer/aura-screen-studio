import React, { useEffect, useState, useRef } from 'react';
import {
  Users,
  Copy,
  Check,
  QrCode,
  PenTool,
  Pause,
  Play,
  Square,
  MessageSquare,
  Sparkles,
  ExternalLink
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
  const [liveUrls, setLiveUrls] = useState<{ networkUrl: string; localUrl: string; publicUrl: string | null }>({
    networkUrl: '',
    localUrl: '',
    publicUrl: null
  });
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<FloatingQuestion | null>(null);

  useEffect(() => {
    // 1. Start live screen frame capture engine
    liveShareService.startCapture();

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

    return () => {
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

  const handleStopSharing = () => {
    liveShareService.stopCapture();
    window.electronAPI?.stopLiveShare?.();
  };

  const shareUrl = liveUrls.publicUrl || liveUrls.networkUrl || 'http://localhost:4545/live';

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-start select-none pt-1">
      {/* Floating Zoom Screen Sharing Bar */}
      <div className="flex items-center space-x-2 bg-[#0b0e17]/95 border border-[#1e2538] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-2xl rounded-2xl px-3 py-1.5 text-xs text-white">
        
        {/* Status Pill (Green when live, Amber when paused) */}
        <div
          className={`flex items-center space-x-2 px-3 py-1 rounded-xl font-bold text-xs shadow-sm transition-colors ${
            isPaused
              ? 'bg-amber-950/70 border border-amber-500/50 text-amber-300'
              : 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-300'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'
            }`}
          />
          <span>{isPaused ? 'Compartilhamento Pausado' : 'Você está compartilhando a tela'}</span>
        </div>

        {/* Viewers Counter */}
        <div
          className="flex items-center space-x-1.5 bg-[#141926] border border-[#23293a] px-2.5 py-1 rounded-xl text-slate-300 font-medium"
          title="Espectadores conectados na transmissão ao vivo"
        >
          <Users className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-bold text-white">{viewersCount}</span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">ao vivo</span>
        </div>

        {/* Copy Link Button */}
        <button
          onClick={handleCopyLink}
          title="Copiar Link de Visualização ao Vivo"
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-[#141926] hover:bg-[#1e2638] border border-[#23293a] text-slate-300 hover:text-white transition-all active:scale-95"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
          <span>{isCopied ? 'Link Copiado!' : 'Copiar Link'}</span>
        </button>

        {/* QR Code Button */}
        <button
          onClick={() => setShowQrModal(!showQrModal)}
          title="Exibir QR Code para Conectar no Celular"
          className={`p-1.5 rounded-xl border transition-all active:scale-95 ${
            showQrModal
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-[#141926] hover:bg-[#1e2638] border-[#23293a] text-slate-300 hover:text-white'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Pro Annotate Button */}
        <button
          onClick={handleToggleDrawing}
          title="Abrir Ferramentas de Anotação Zoom Pro (S, Z, M, W...)"
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 text-indigo-200 hover:text-white font-medium transition-all active:scale-95"
        >
          <PenTool className="w-3.5 h-3.5 text-indigo-400" />
          <span>Anotar</span>
        </button>

        {/* Pause / Resume Sharing */}
        <button
          onClick={handleTogglePause}
          title={isPaused ? 'Retomar Compartilhamento' : 'Pausar Compartilhamento'}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl border transition-all active:scale-95 font-medium ${
            isPaused
              ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500'
              : 'bg-[#141926] hover:bg-[#1e2638] border-[#23293a] text-slate-300 hover:text-white'
          }`}
        >
          {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
          <span>{isPaused ? 'Retomar' : 'Pausar'}</span>
        </button>

        {/* Stop Sharing Button (Red Zoom Style) */}
        <button
          onClick={handleStopSharing}
          title="Interromper Compartilhamento de Tela"
          className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold transition-all shadow-sm"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>Interromper</span>
        </button>
      </div>

      {/* QR Code Modal Drawer */}
      {showQrModal && (
        <div className="mt-2 p-4 bg-[#0b0e17]/98 border border-[#23293a] shadow-2xl rounded-2xl flex flex-col items-center space-y-3 z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between w-full border-b border-[#181d2a] pb-2">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Conectar no Celular</span>
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>

          <div className="bg-white p-2.5 rounded-xl shadow-md">
            {/* Native SVG QR Code Placeholder / Renderer */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                shareUrl
              )}`}
              alt="QR Code"
              className="w-36 h-36 rounded-lg"
            />
          </div>

          <p className="text-[11px] text-slate-400 text-center max-w-[200px]">
            Aponte a câmera do celular para assistir à apresentação ao vivo
          </p>

          <div className="text-[10px] text-indigo-300 font-mono bg-[#141926] px-2 py-1 rounded-lg break-all max-w-[220px]">
            {shareUrl}
          </div>
        </div>
      )}

      {/* Floating Audience Question HUD Toast */}
      {activeQuestion && (
        <div className="fixed bottom-4 right-4 max-w-sm bg-[#0f1422] border border-indigo-500/50 shadow-2xl p-3 rounded-2xl flex items-start space-x-2.5 z-50 animate-in slide-in-from-bottom duration-300">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-300">{activeQuestion.author || 'Espectador'}</span>
              <button
                onClick={() => setActiveQuestion(null)}
                className="text-slate-500 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-white mt-0.5 leading-relaxed">{activeQuestion.text}</p>
          </div>
        </div>
      )}

      {/* Floating Animated Emojis */}
      <div className="fixed bottom-6 right-8 pointer-events-none z-50 flex flex-col items-center">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="text-3xl animate-bounce mb-1 drop-shadow-lg"
          >
            {r.emoji}
          </div>
        ))}
      </div>
    </div>
  );
};
