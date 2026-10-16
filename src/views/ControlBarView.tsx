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
  MicOff
} from 'lucide-react';
import { RecordingOptions } from '../types';
import { recorderService } from '../services/recorderService';
import { transcriptionService } from '../services/transcriptionService';

export const ControlBarView: React.FC = () => {
  const [seconds, setSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const optionsRef = useRef<RecordingOptions | null>(null);

  useEffect(() => {
    // Listen for recording options to start the actual recorder
    const cleanupOptions = window.electronAPI.onRecordingOptions(async (options: RecordingOptions) => {
      optionsRef.current = options;
      try {
        transcriptionService.start();
        await recorderService.start(options, (ms) => {
          setSeconds(Math.floor(ms / 1000));
        });
      } catch (err) {
        console.error('Failed to start recorder service:', err);
      }
    });

    const cleanupDrawing = window.electronAPI.onDrawingToggled((active) => {
      setIsDrawing(active);
    });

    const cleanupState = window.electronAPI.onRecordingStateChanged((state) => {
      if (state === 'paused') setIsPaused(true);
      if (state === 'recording') setIsPaused(false);
      if (state === 'stopped') handleStopRecording();
    });

    return () => {
      cleanupOptions();
      cleanupDrawing();
      cleanupState();
    };
  }, []);

  const handleStopRecording = async () => {
    if (isStopping) return;
    setIsStopping(true);

    try {
      const { buffer, durationMs } = await recorderService.stop();
      const { transcript, aiSummary, aiTitle } = transcriptionService.stop();

      const title = aiTitle || `Gravação Aura ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      
      await window.electronAPI.saveRecording(buffer, {
        title,
        createdAt: Date.now(),
        durationMs,
        resolution: optionsRef.current?.resolution || '1080p',
        aiTitle,
        aiSummary,
        transcript
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

  const handleRestart = async () => {
    try {
      recorderService.cleanup();
      setSeconds(0);
      setIsPaused(false);
      if (optionsRef.current) {
        await recorderService.start(optionsRef.current, (ms) => {
          setSeconds(Math.floor(ms / 1000));
        });
      }
    } catch (err) {
      console.error('Error restarting recorder:', err);
    }
  };

  const handleCancel = () => {
    recorderService.cleanup();
    window.electronAPI.cancelRecording();
  };

  const handleToggleMic = () => {
    const nextMuted = !isMicMuted;
    recorderService.setMicMuted(nextMuted);
    setIsMicMuted(nextMuted);
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
    <div className="w-full h-full flex items-center justify-center p-1 select-none">
      <div
        className="flex items-center space-x-1.5 bg-[#0b0e17]/95 backdrop-blur-xl px-2.5 py-1.5 rounded-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/10"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Drag Handle */}
        <div className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-cyan-400 transition-colors pl-0.5">
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Stop Recording & Timer Pill */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleStopRecording}
            disabled={isStopping}
            title="Concluir e Salvar Gravação"
            className="flex items-center space-x-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:brightness-110 active:scale-95 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md shadow-rose-600/30 group"
          >
            <div className="w-2.5 h-2.5 rounded-sm bg-white group-hover:scale-110 transition-transform" />
            <span className="font-mono text-xs tracking-tight font-semibold">{formatTime(seconds)}</span>
            {isPaused && (
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1 py-0.2 rounded font-bold uppercase">
                Pausa
              </span>
            )}
          </button>
        </div>

        {/* Pause / Resume Button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleTogglePause}
            title={isPaused ? 'Retomar Gravação (Alt+Shift+P)' : 'Pausar Gravação (Alt+Shift+P)'}
            className={`p-2 rounded-xl transition-all ${
              isPaused
                ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/30 scale-105'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Microphone Mute / Unmute Button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleToggleMic}
            title={isMicMuted ? 'Ativar Microfone' : 'Silenciar Microfone'}
            className={`p-2 rounded-xl transition-all ${
              isMicMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {isMicMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Restart Recording */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleRestart}
            title="Reiniciar Gravação do Zero"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Draw Tool Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleToggleDrawing}
            title="Anotações na Tela (Caneta & Formas)"
            className={`p-2 rounded-xl transition-all ${
              isDrawing
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30 scale-105'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Teleprompter / Speaker Notes Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI.toggleSpeakerNotes()}
            title="Teleprompter / Roteiro do Apresentador"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Cancel / Trash Recording */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleCancel}
            title="Descartar Gravação"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
