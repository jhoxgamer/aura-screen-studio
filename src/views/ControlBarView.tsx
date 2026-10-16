import React, { useState, useEffect, useRef } from 'react';
import {
  Square,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  PenTool,
  GripVertical,
  FileText
} from 'lucide-react';
import { RecordingOptions } from '../types';
import { recorderService } from '../services/recorderService';
import { transcriptionService } from '../services/transcriptionService';

export const ControlBarView: React.FC = () => {
  const [seconds, setSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
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

      const title = aiTitle || `Gravação Loom ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      
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
      window.electronAPI.restartRecording();
    } catch (e) {
      console.error('Restart failed:', e);
    }
  };

  const handleCancel = () => {
    recorderService.cleanup();
    window.electronAPI.cancelRecording();
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
        className="flex items-center space-x-2 bg-loom-dark/95 backdrop-blur-md px-3 py-2 rounded-2xl border border-loom-border shadow-2xl"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Drag Handle Icon */}
        <div className="cursor-grab active:cursor-grabbing text-loom-muted hover:text-white transition-colors pl-0.5">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Stop Recording Button with dynamic counter */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleStopRecording}
            disabled={isStopping}
            className="flex items-center space-x-2 bg-loom-coral hover:brightness-110 active:scale-95 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md group"
          >
            <div className="w-2.5 h-2.5 rounded bg-white group-hover:scale-110 transition-transform" />
            <span className="font-mono text-[13px] tracking-tight">{formatTime(seconds)}</span>
          </button>
        </div>

        {/* Pause / Resume Button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleTogglePause}
            title={isPaused ? 'Retomar Gravação' : 'Pausar Gravação'}
            className={`p-2 rounded-xl transition-all ${
              isPaused
                ? 'bg-loom-warning text-loom-dark font-bold'
                : 'text-loom-muted hover:text-white hover:bg-loom-card'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
          </button>
        </div>

        {/* Restart Recording */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleRestart}
            title="Reiniciar Gravação"
            className="p-2 rounded-xl text-loom-muted hover:text-white hover:bg-loom-card transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Draw Tool Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleToggleDrawing}
            title="Anotar na Tela (Desenhar)"
            className={`p-2 rounded-xl transition-all ${
              isDrawing
                ? 'bg-loom-primary text-white shadow-sm'
                : 'text-loom-muted hover:text-white hover:bg-loom-card'
            }`}
          >
            <PenTool className="w-4 h-4" />
          </button>
        </div>

        {/* Teleprompter / Speaker Notes Toggle */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI.toggleSpeakerNotes()}
            title="Teleprompter / Notas do Orador"
            className="p-2 rounded-xl text-loom-muted hover:text-white hover:bg-loom-card transition-all"
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>

        {/* Cancel / Trash Recording */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleCancel}
            title="Descartar Gravação"
            className="p-2 rounded-xl text-loom-muted hover:text-red-400 hover:bg-red-500/20 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
