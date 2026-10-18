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
  Camera,
  CameraOff,
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
  const [isCameraVisible, setIsCameraVisible] = useState(true);
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

    const cleanupCamera = window.electronAPI.onBubbleVisibilityChanged?.((visible) => {
      setIsCameraVisible(visible);
    });

    return () => {
      recorderService.setMicLevelListener(undefined);
      recorderService.setOnTrackEnded(undefined);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      cleanupToggleMic?.();
      cleanupCamera?.();
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
        <div className="absolute -top-7 px-3 py-0.5 rounded-full bg-[#1A2A47] text-[#78A5FF] font-bold text-[11px] shadow-lg flex items-center space-x-1.5 border border-[#78A5FF]/40">
          <span>{retakeNotice}</span>
        </div>
      )}

      <div
        className="flex items-center space-x-1.5 bg-[#0B0E14]/95 backdrop-blur-xl px-2.5 py-1.5 rounded-2xl border border-[#303A4B] shadow-2xl shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Drag Handle */}
        <div className="cursor-grab active:cursor-grabbing text-[#929CAF] hover:text-[#F3F5F9] transition-colors pl-0.5 shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Stop Recording & Timer Pill */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
          <button
            onClick={handleStopRecording}
            disabled={isStopping}
            title={`Concluir e Salvar Gravação (${getShortcutLabel('a')})`}
            className="flex items-center space-x-2 bg-[#FF647C] hover:bg-[#FF647C]/90 active:scale-95 text-[#2B0E13] px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm group"
          >
            <div className="w-2.5 h-2.5 rounded-sm bg-[#2B0E13] group-hover:scale-105 transition-transform" />
            <span className="font-mono text-xs tracking-tight font-black">{formatTime(seconds)}</span>
            {isPaused && (
              <span className="text-[10px] bg-[#191F2B] text-[#F2B66D] border border-[#F2B66D]/50 px-1 py-0.2 rounded font-bold uppercase">
                Pausa
              </span>
            )}
          </button>
        </div>

        {/* Scene Pill */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center space-x-1 shrink-0">
          <div
            className="flex items-center space-x-1 bg-[#121722] border border-[#303A4B] px-2 py-1 rounded-xl text-[11px] font-semibold text-[#B7C0CE]"
            title={`Cena atual ${sceneNumber}: ${formatTime(sceneSeconds)}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#78A5FF]" />
            <span>Cena {sceneNumber}</span>
          </div>

          {/* Retake Current Scene Button */}
          <button
            onClick={handleRetakeScene}
            title="Regravar apenas esta cena (descarta o take atual e reinicia esta cena)"
            className={`p-1.5 rounded-xl transition-all flex items-center space-x-1 ${
              isPaused
                ? 'bg-[#191F2B] text-[#F2B66D] border border-[#F2B66D]/50 hover:bg-[#222B39]'
                : 'text-[#929CAF] hover:text-[#F2B66D] hover:bg-[#222B39]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {isPaused && <span className="text-[10px] font-bold">Regravar</span>}
          </button>

          {/* Add / Next Scene Button (when paused) */}
          {isPaused && (
            <button
              onClick={handleNewScene}
              title="Nova Cena (finaliza este take e inicia a próxima cena/capítulo)"
              className="px-2 py-1 rounded-xl bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/40 hover:bg-[#191F2B] text-[10px] font-bold transition-all flex items-center space-x-1"
            >
              <Plus className="w-3 h-3" />
              <span>Nova Cena</span>
            </button>
          )}
        </div>

        {/* Pause / Resume Button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
          <button
            onClick={handleTogglePause}
            title={isPaused ? `Retomar Gravação (${getShortcutLabel('p')})` : `Pausar Gravação (${getShortcutLabel('p')})`}
            className={`p-2 rounded-xl transition-all ${
              isPaused
                ? 'bg-[#F2B66D] text-[#0B0E14] font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Microphone Mute / Unmute & Live Audio VU Meter */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
          <button
            onClick={handleToggleMic}
            title={isMicMuted ? `Ativar Microfone (${getShortcutLabel('m')})` : `Microfone Ativo (${Math.round(micLevel * 100)}%) • Silenciar (${getShortcutLabel('m')})`}
            className={`px-2 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 ${
              isMicMuted
                ? 'bg-[#B83A48]/20 text-[#FF647C] border border-[#B83A48]/40 shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
            }`}
          >
            {isMicMuted ? <MicOff className="w-3.5 h-3.5 text-[#FF647C]" /> : <Mic className="w-3.5 h-3.5 text-[#78A5FF]" />}

            {/* Live 3-bar Audio VU Indicator */}
            <div className="flex items-end space-x-0.5 h-3.5 pl-0.5">
              <span
                className={`w-0.5 rounded-full transition-all duration-75 ${
                  isMicMuted
                    ? 'bg-[#FF647C]/30'
                    : micLevel > 0.04
                    ? 'bg-[#83B8FF] shadow-sm shadow-[#83B8FF]/50'
                    : 'bg-[#303A4B]'
                }`}
                style={{ height: '6px' }}
              />
              <span
                className={`w-0.5 rounded-full transition-all duration-75 ${
                  isMicMuted
                    ? 'bg-[#FF647C]/30'
                    : micLevel > 0.20
                    ? 'bg-[#83B8FF] shadow-sm shadow-[#83B8FF]/50'
                    : 'bg-[#303A4B]'
                }`}
                style={{ height: '9px' }}
              />
              <span
                className={`w-0.5 rounded-full transition-all duration-75 ${
                  isMicMuted
                    ? 'bg-[#FF647C]/30'
                    : micLevel > 0.50
                    ? 'bg-[#F2B66D] shadow-sm shadow-[#F2B66D]/50'
                    : 'bg-[#303A4B]'
                }`}
                style={{ height: '12px' }}
              />
            </div>
          </button>
        </div>

        {/* Camera Bubble Toggle (when recording mode includes camera) */}
        {optionsRef.current?.mode !== 'screen-only' && (
          <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
            <button
              onClick={() => window.electronAPI.toggleBubbleVisible?.()}
              title={isCameraVisible ? "Ocultar Câmera Flutuante" : "Exibir Câmera Flutuante"}
              className={`p-2 rounded-xl transition-all ${
                !isCameraVisible
                  ? 'bg-[#191F2B] text-[#929CAF] hover:text-[#F3F5F9]'
                  : 'text-[#78A5FF] hover:text-[#9AB9FF] hover:bg-[#222B39]'
              }`}
            >
              {isCameraVisible ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5 text-[#FF647C]" />}
            </button>
          </div>
        )}

        {/* Restart Recording Entirely */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
          <button
            onClick={handleRestart}
            title="Reiniciar Gravação Inteira do Zero"
            className="p-2 rounded-xl text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Draw Tool Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
          <button
            onClick={handleToggleDrawing}
            title={`Anotações na Tela (${getShortcutLabel('d')})`}
            className={`p-2 rounded-xl transition-all ${
              isDrawing
                ? 'bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/50 font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Teleprompter / Speaker Notes Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
          <button
            onClick={() => window.electronAPI.toggleSpeakerNotes()}
            title={`Teleprompter / Roteiro (${getShortcutLabel('t')})`}
            className={`p-2 rounded-xl transition-all ${
              isSpeakerNotesOpen
                ? 'bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/50 font-bold shadow-sm'
                : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#222B39]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Cancel / Trash Recording with Confirmation Guard */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="shrink-0">
          <button
            onClick={handleCancelClick}
            title={isConfirmingCancel ? "Confirmar descarte definitivo da gravação" : "Descartar Gravação"}
            className={`p-2 rounded-xl transition-all ${
              isConfirmingCancel
                ? 'bg-[#B83A48] hover:bg-[#A83240] text-white font-bold ring-2 ring-[#FF647C] animate-pulse'
                : 'text-[#929CAF] hover:text-[#FF647C] hover:bg-[#B83A48]/15'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
