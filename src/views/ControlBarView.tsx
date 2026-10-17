import React, { useState, useEffect, useRef } from 'react';
import {
  Square,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  PenTool,
  GripVertical,
  FileText,
  Mic,
  MicOff,
  Plus,
  Layers,
  Sparkles
} from 'lucide-react';
import { RecordingOptions } from '../types';
import { recorderService } from '../services/recorderService';
import { transcriptionService } from '../services/transcriptionService';
import { getShortcutLabel } from '../utils/shortcuts';

export const ControlBarView: React.FC = () => {
  const [seconds, setSeconds] = useState(0);
  const [sceneSeconds, setSceneSeconds] = useState(0);
  const [sceneNumber, setSceneNumber] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSpeakerNotesOpen, setIsSpeakerNotesOpen] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const [retakeNotice, setRetakeNotice] = useState<string | null>(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const confirmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const optionsRef = useRef<RecordingOptions | null>(null);

  useEffect(() => {
    recorderService.setMicLevelListener((lvl) => {
      setMicLevel(lvl);
    });

    // Listen for recording options to start the actual recorder
    const cleanupOptions = window.electronAPI.onRecordingOptions(async (options: RecordingOptions) => {
      optionsRef.current = options;
      try {
        transcriptionService.start();
        await recorderService.start(options, (totalMs, scMs, scNum) => {
          setSeconds(Math.floor(totalMs / 1000));
          setSceneSeconds(Math.floor(scMs / 1000));
          setSceneNumber(scNum);
        });
      } catch (err) {
        console.error('Failed to start recorder service:', err);
      }
    });

    const cleanupDrawing = window.electronAPI.onDrawingToggled((active) => {
      setIsDrawing(active);
    });

    const cleanupSpeakerNotes = window.electronAPI.onSpeakerNotesStateChanged?.((isOpen) => {
      setIsSpeakerNotesOpen(isOpen);
    });

    const cleanupState = window.electronAPI.onRecordingStateChanged((state) => {
      if (state === 'paused') setIsPaused(true);
      if (state === 'recording') setIsPaused(false);
      if (state === 'stopped') handleStopRecording();
    });

    recorderService.setOnTrackEnded(() => {
      handleStopRecording();
    });

    const cleanupToggleMic = window.electronAPI.onToggleMic?.(() => {
      handleToggleMic();
    });

    return () => {
      recorderService.setMicLevelListener(undefined);
      recorderService.setOnTrackEnded(undefined);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      cleanupToggleMic?.();
      cleanupOptions();
      cleanupDrawing();
      cleanupSpeakerNotes?.();
      cleanupState();
    };
  }, [isMicMuted]);

  const handleStopRecording = async () => {
    if (isStopping) return;
    setIsStopping(true);

    try {
      const { buffer, durationMs, chapters } = await recorderService.stop();
      const { transcript, aiSummary, aiTitle } = transcriptionService.stop();

      const title = aiTitle || `Gravação Aura ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      
      await window.electronAPI.saveRecording(buffer, {
        title,
        createdAt: Date.now(),
        durationMs,
        resolution: optionsRef.current?.resolution || '1080p',
        aiTitle,
        aiSummary,
        transcript,
        chapters
      });
    } catch (err) {
      console.error('Error saving recording:', err);
      setIsStopping(false);
    }
  };

  const handleTogglePause = () => {
    if (isPaused) {
      recorderService.resume();
      window.electronAPI.resumeRecording();
      setIsPaused(false);
    } else {
      recorderService.pause();
      window.electronAPI.pauseRecording();
      setIsPaused(true);
    }
  };

  const handleRetakeScene = () => {
    recorderService.retakeCurrentScene();
    setSceneSeconds(0);
    setRetakeNotice(`Cena ${sceneNumber} reiniciada!`);
    setTimeout(() => setRetakeNotice(null), 2200);
  };

  const handleNewScene = () => {
    recorderService.sealCurrentScene();
    const nextNum = recorderService.getCurrentSceneNumber();
    setSceneNumber(nextNum);
    setSceneSeconds(0);
    setRetakeNotice(`Nova Cena ${nextNum} iniciada!`);
    setTimeout(() => setRetakeNotice(null), 2000);
  };

  const handleRestart = async () => {
    try {
      recorderService.cleanup();
      setSeconds(0);
      setSceneSeconds(0);
      setSceneNumber(1);
      setIsPaused(false);
      if (optionsRef.current) {
        await recorderService.start(optionsRef.current, (totalMs, scMs, scNum) => {
          setSeconds(Math.floor(totalMs / 1000));
          setSceneSeconds(Math.floor(scMs / 1000));
          setSceneNumber(scNum);
        });
      }
    } catch (err) {
      console.error('Error restarting recorder:', err);
    }
  };

  const handleCancelClick = () => {
    if (!isConfirmingCancel) {
      setIsConfirmingCancel(true);
      setRetakeNotice('Clique no lixo novamente para confirmar o descarte');
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => {
        setIsConfirmingCancel(false);
        setRetakeNotice(null);
      }, 3500);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    recorderService.cleanup();
    window.electronAPI.cancelRecording();
  };

  const handleToggleMic = () => {
    const nextMuted = !isMicMuted;
    recorderService.setMicMuted(nextMuted);
    setIsMicMuted(nextMuted);
    const micShortcut = getShortcutLabel('m');
    setRetakeNotice(nextMuted ? `Microfone Silenciado (${micShortcut})` : `Microfone Ativado (${micShortcut})`);
    setTimeout(() => setRetakeNotice(null), 2000);
  };

  const handleToggleDrawing = () => {
    window.electronAPI.toggleDrawing();
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-1 select-none relative">
      {/* Toast Notice for Scene Retake / New Scene */}
      {retakeNotice && (
        <div className="absolute -top-7 px-3 py-0.5 rounded-full bg-indigo-600 text-white font-medium text-[11px] shadow-lg flex items-center space-x-1.5 border border-indigo-400/30">
          <span>{retakeNotice}</span>
        </div>
      )}

      <div
        className="flex items-center space-x-1.5 bg-[#0e1119]/95 backdrop-blur-xl px-2.5 py-1.5 rounded-2xl border border-[#232838] shadow-2xl"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Drag Handle */}
        <div className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 transition-colors pl-0.5">
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Stop Recording & Timer Pill */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleStopRecording}
            disabled={isStopping}
            title={`Concluir e Salvar Gravação (${getShortcutLabel('a')})`}
            className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-3 py-1.5 rounded-xl font-medium text-xs transition-all shadow-sm group"
          >
            <div className="w-2.5 h-2.5 rounded-sm bg-white group-hover:scale-105 transition-transform" />
            <span className="font-mono text-xs tracking-tight font-semibold">{formatTime(seconds)}</span>
            {isPaused && (
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1 py-0.2 rounded font-bold uppercase">
                Pausa
              </span>
            )}
          </button>
        </div>

        {/* Scene Pill */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center space-x-1">
          <div
            className="flex items-center space-x-1 bg-[#171b26] border border-[#252c3e] px-2 py-1 rounded-xl text-[11px] font-medium text-slate-300"
            title={`Cena atual ${sceneNumber}: ${formatTime(sceneSeconds)}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span>Cena {sceneNumber}</span>
          </div>

          {/* Retake Current Scene Button */}
          <button
            onClick={handleRetakeScene}
            title="Regravar apenas esta cena (descarta o take atual e reinicia esta cena)"
            className={`p-1.5 rounded-xl transition-all flex items-center space-x-1 ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'text-slate-400 hover:text-amber-400 hover:bg-[#1a1f2e]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {isPaused && <span className="text-[10px] font-medium">Regravar</span>}
          </button>

          {/* Add / Next Scene Button (when paused) */}
          {isPaused && (
            <button
              onClick={handleNewScene}
              title="Nova Cena (finaliza este take e inicia a próxima cena/capítulo)"
              className="px-2 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 text-[10px] font-medium transition-all flex items-center space-x-1"
            >
              <Plus className="w-3 h-3" />
              <span>Nova Cena</span>
            </button>
          )}
        </div>

        {/* Pause / Resume Button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleTogglePause}
            title={isPaused ? `Retomar Gravação (${getShortcutLabel('p')})` : `Pausar Gravação (${getShortcutLabel('p')})`}
            className={`p-2 rounded-xl transition-all ${
              isPaused
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Microphone Mute / Unmute & Live Audio VU Meter */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleToggleMic}
            title={isMicMuted ? `Ativar Microfone (${getShortcutLabel('m')})` : `Microfone Ativo (${Math.round(micLevel * 100)}%) • Silenciar (${getShortcutLabel('m')})`}
            className={`px-2 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 ${
              isMicMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            {isMicMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-indigo-400" />}

            {/* Live 3-bar Audio VU Indicator */}
            <div className="flex items-end space-x-0.5 h-3.5 pl-0.5">
              <span
                className={`w-0.5 rounded-full transition-all duration-75 ${
                  isMicMuted
                    ? 'bg-rose-500/30'
                    : micLevel > 0.04
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                    : 'bg-slate-700'
                }`}
                style={{ height: '6px' }}
              />
              <span
                className={`w-0.5 rounded-full transition-all duration-75 ${
                  isMicMuted
                    ? 'bg-rose-500/30'
                    : micLevel > 0.20
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                    : 'bg-slate-700'
                }`}
                style={{ height: '9px' }}
              />
              <span
                className={`w-0.5 rounded-full transition-all duration-75 ${
                  isMicMuted
                    ? 'bg-rose-500/30'
                    : micLevel > 0.50
                    ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                    : 'bg-slate-700'
                }`}
                style={{ height: '12px' }}
              />
            </div>
          </button>
        </div>

        {/* Restart Recording Entirely */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleRestart}
            title="Reiniciar Gravação Inteira do Zero"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#1a1f2e] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Draw Tool Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleToggleDrawing}
            title={`Anotações na Tela (${getShortcutLabel('d')})`}
            className={`p-2 rounded-xl transition-all ${
              isDrawing
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Teleprompter / Speaker Notes Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI.toggleSpeakerNotes()}
            title={`Teleprompter / Roteiro (${getShortcutLabel('t')})`}
            className={`p-2 rounded-xl transition-all ${
              isSpeakerNotesOpen
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#1a1f2e]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Cancel / Trash Recording with Confirmation Guard */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleCancelClick}
            title={isConfirmingCancel ? "Confirmar descarte definitivo da gravação" : "Descartar Gravação"}
            className={`p-2 rounded-xl transition-all ${
              isConfirmingCancel
                ? 'bg-rose-600 text-white font-bold ring-2 ring-rose-400 animate-pulse'
                : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
