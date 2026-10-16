import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Camera,
  Layers,
  Mic,
  Volume2,
  Sparkles,
  Settings2,
  FolderOpen,
  X,
  Minus,
  PlayCircle
} from 'lucide-react';
import { CaptureSource, RecordingMode, RecordingOptions, CropArea } from '../types';
import { LibraryView } from './LibraryView';
import { Crop, FileText, MousePointer, Globe } from 'lucide-react';

export const PreRecordingView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'library'>('record');
  const [mode, setMode] = useState<RecordingMode>('screen-cam');
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [fps, setFps] = useState<number>(60);

  // Advanced feature toggles
  const [speakerNotesEnabled, setSpeakerNotesEnabled] = useState(false);
  const [highlightCursor, setHighlightCursor] = useState(true);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Listen for crop area selection
  useEffect(() => {
    const cleanupCrop = window.electronAPI.onCropAreaSelected((area) => {
      setCropArea(area);
      setMode('custom-area');
    });
    return cleanupCrop;
  }, []);

  // Load capture sources & media devices
  useEffect(() => {
    async function initDevices() {
      try {
        if (window.electronAPI?.getSources) {
          const srcList = await window.electronAPI.getSources();
          setSources(srcList);
          if (srcList.length > 0) {
            setSelectedSourceId(srcList[0].id);
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const vInputs = devices.filter((d) => d.kind === 'videoinput');
        const aInputs = devices.filter((d) => d.kind === 'audioinput');

        setVideoDevices(vInputs);
        if (vInputs.length > 0) setSelectedVideoId(vInputs[0].deviceId);

        setAudioDevices(aInputs);
        if (aInputs.length > 0) setSelectedAudioId(aInputs[0].deviceId);
      } catch (err) {
        console.error('Error fetching devices:', err);
      }
    }
    initDevices();

    const interval = setInterval(async () => {
      try {
        const pub = await window.electronAPI.getPublicUrl();
        if (pub) setPublicUrl(pub);
      } catch (e) {}
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Microphone VU Meter
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function monitorMic() {
      try {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

        stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
          video: false
        });

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        console.warn('Microphone preview error:', err);
      }
    }

    if (activeTab === 'record') {
      monitorMic();
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, [selectedAudioId, activeTab]);

  const handleStart = () => {
    const options: RecordingOptions = {
      mode,
      sourceId: selectedSourceId,
      audioDeviceId: selectedAudioId,
      videoDeviceId: selectedVideoId,
      includeSystemAudio,
      resolution,
      fps,
      speakerNotesEnabled,
      highlightCursor,
      cropArea: mode === 'custom-area' && cropArea ? cropArea : undefined
    };

    window.electronAPI.startRecording(options);
  };

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  return (
    <div className="w-[450px] h-[700px] bg-loom-panel rounded-2xl shadow-loom-float border border-loom-border flex flex-col overflow-hidden select-none">
      {/* Title Bar / Drag handle */}
      <div className="h-12 bg-loom-dark px-4 flex items-center justify-between border-b border-loom-border" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-loom-primary flex items-center justify-center shadow-md">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide text-white">Loom Clone</span>
          <span className="text-[10px] bg-loom-border px-1.5 py-0.5 rounded text-loom-muted font-mono font-medium">v1.1</span>
        </div>

        <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI.minimizeCurrentWindow()}
            className="p-1 hover:bg-loom-hover rounded-md text-loom-muted hover:text-white transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.electronAPI.closeCurrentWindow()}
            className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded-md text-loom-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-loom-border px-4 bg-loom-panel pt-2">
        <button
          onClick={() => setActiveTab('record')}
          className={`flex items-center space-x-2 px-4 py-2 font-medium text-xs rounded-t-lg transition-all ${
            activeTab === 'record'
              ? 'text-loom-primary border-b-2 border-loom-primary bg-loom-card/40'
              : 'text-loom-muted hover:text-white'
          }`}
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span>Nova Gravação</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`flex items-center space-x-2 px-4 py-2 font-medium text-xs rounded-t-lg transition-all ${
            activeTab === 'library'
              ? 'text-loom-primary border-b-2 border-loom-primary bg-loom-card/40'
              : 'text-loom-muted hover:text-white'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Biblioteca de Vídeos</span>
        </button>
      </div>

      {activeTab === 'library' ? (
        <LibraryView />
      ) : (
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {/* Mode Selector */}
          <div>
            <label className="text-xs font-semibold text-loom-muted uppercase tracking-wider block mb-2">
              Modo de Gravação
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => setMode('screen-cam')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'screen-cam'
                    ? 'bg-loom-primary/10 border-loom-primary text-white shadow-sm'
                    : 'bg-loom-card border-loom-border text-loom-muted hover:border-loom-hover hover:text-white'
                }`}
              >
                <div className="relative mb-1">
                  <Monitor className="w-4 h-4 text-loom-primary" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-loom-coral border border-loom-card" />
                </div>
                <span className="text-[11px] font-medium leading-tight">Tela + Cam</span>
              </button>

              <button
                onClick={() => setMode('screen-only')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'screen-only'
                    ? 'bg-loom-primary/10 border-loom-primary text-white shadow-sm'
                    : 'bg-loom-card border-loom-border text-loom-muted hover:border-loom-hover hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4 mb-1 text-loom-secondary" />
                <span className="text-[11px] font-medium leading-tight">Só Tela</span>
              </button>

              <button
                onClick={() => setMode('cam-only')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'cam-only'
                    ? 'bg-loom-primary/10 border-loom-primary text-white shadow-sm'
                    : 'bg-loom-card border-loom-border text-loom-muted hover:border-loom-hover hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4 mb-1 text-loom-coral" />
                <span className="text-[11px] font-medium leading-tight">Só Câmera</span>
              </button>

              <button
                onClick={() => {
                  setMode('custom-area');
                  if (!cropArea) window.electronAPI.startCropSelection();
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'custom-area'
                    ? 'bg-loom-primary/10 border-loom-primary text-white shadow-sm'
                    : 'bg-loom-card border-loom-border text-loom-muted hover:border-loom-hover hover:text-white'
                }`}
              >
                <Crop className="w-4 h-4 mb-1 text-loom-accent" />
                <span className="text-[11px] font-medium leading-tight">Área Recorte</span>
              </button>
            </div>

            {/* Custom Area Details & Pick Button */}
            {mode === 'custom-area' && (
              <div className="mt-2.5 p-2.5 bg-loom-card border border-loom-border rounded-xl flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-loom-muted">Área: </span>
                  <span className="font-mono text-white font-semibold">
                    {cropArea ? `${Math.round(cropArea.width)} × ${Math.round(cropArea.height)} px` : 'Nenhuma definida'}
                  </span>
                </div>
                <button
                  onClick={() => window.electronAPI.startCropSelection()}
                  className="px-2.5 py-1 rounded-lg bg-loom-primary/20 hover:bg-loom-primary/30 text-loom-primary text-xs font-semibold transition-colors"
                >
                  {cropArea ? 'Alterar Área' : 'Selecionar na Tela'}
                </button>
              </div>
            )}
          </div>

          {/* Screen / Window Source Picker */}
          {mode !== 'cam-only' && (
            <div>
              <label className="text-xs font-semibold text-loom-muted uppercase tracking-wider block mb-2">
                Fonte de Vídeo
              </label>
              <div className="bg-loom-card border border-loom-border rounded-xl p-3">
                <div className="flex items-center space-x-3 mb-2">
                  {selectedSource?.thumbnail ? (
                    <img
                      src={selectedSource.thumbnail}
                      alt="preview"
                      className="w-16 h-10 object-cover rounded border border-loom-border shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-10 bg-loom-panel rounded flex items-center justify-center">
                      <Monitor className="w-5 h-5 text-loom-muted" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <select
                      value={selectedSourceId}
                      onChange={(e) => setSelectedSourceId(e.target.value)}
                      className="w-full bg-loom-panel border border-loom-border rounded-lg text-xs text-white p-2 font-medium focus:outline-none focus:border-loom-primary"
                    >
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Camera Selector */}
          {mode !== 'screen-only' && (
            <div>
              <label className="text-xs font-semibold text-loom-muted uppercase tracking-wider block mb-2">
                Câmera / Webcam
              </label>
              <div className="bg-loom-card border border-loom-border rounded-xl p-2.5 flex items-center space-x-2">
                <Camera className="w-4 h-4 text-loom-primary shrink-0" />
                <select
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none font-medium truncate"
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-loom-panel">
                      {d.label || `Câmera (${d.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Microphone Selector & VU Meter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-loom-muted uppercase tracking-wider">
                Microfone
              </label>
              <span className="text-[10px] text-loom-accent font-medium flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-loom-accent animate-pulse" />
                <span>Ativo</span>
              </span>
            </div>

            <div className="bg-loom-card border border-loom-border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-loom-primary shrink-0" />
                <select
                  value={selectedAudioId}
                  onChange={(e) => setSelectedAudioId(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none font-medium truncate"
                >
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-loom-panel">
                      {d.label || `Microfone (${d.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              {/* VU Meter Visualizer */}
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-loom-panel rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-loom-accent via-loom-warning to-loom-coral rounded-full transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Recording Settings (Resolution, FPS, System Audio) */}
          <div className="bg-loom-card/60 border border-loom-border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-loom-secondary" />
                <span className="text-xs font-medium text-white">Gravar Som do Sistema</span>
              </div>
              <input
                type="checkbox"
                checked={includeSystemAudio}
                onChange={(e) => setIncludeSystemAudio(e.target.checked)}
                className="w-4 h-4 accent-loom-primary rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-loom-border/60">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-loom-primary" />
                <span className="text-xs font-medium text-white">Teleprompter / Notas do Orador</span>
              </div>
              <input
                type="checkbox"
                checked={speakerNotesEnabled}
                onChange={(e) => setSpeakerNotesEnabled(e.target.checked)}
                className="w-4 h-4 accent-loom-primary rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-loom-border/60">
              <div className="flex items-center space-x-2">
                <MousePointer className="w-4 h-4 text-loom-warning" />
                <span className="text-xs font-medium text-white">Destacar Cursor & Cliques</span>
              </div>
              <input
                type="checkbox"
                checked={highlightCursor}
                onChange={(e) => setHighlightCursor(e.target.checked)}
                className="w-4 h-4 accent-loom-primary rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-loom-border/60">
              <div className="flex items-center space-x-2">
                <Settings2 className="w-4 h-4 text-loom-muted" />
                <span className="text-xs font-medium text-white">Qualidade & FPS</span>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  className="bg-loom-panel border border-loom-border rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p (FHD)</option>
                  <option value="4k">4K (Ultra)</option>
                </select>

                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="bg-loom-panel border border-loom-border rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                >
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </div>
            </div>
          </div>

          {/* Global Share Link Status Pill */}
          <div className="bg-loom-card/80 border border-loom-border/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 truncate">
              <Globe className="w-3.5 h-3.5 text-loom-primary shrink-0" />
              <span className="text-[11px] text-loom-muted">Link Público:</span>
              {publicUrl ? (
                <span className="text-[11px] text-emerald-400 font-semibold font-mono truncate flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <span>Ativo para qualquer pessoa</span>
                </span>
              ) : (
                <span className="text-[11px] text-loom-muted flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-loom-primary animate-pulse inline-block" />
                  <span>Iniciando túnel seguro...</span>
                </span>
              )}
            </div>
            {publicUrl && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  alert('Link do Hub Público copiado!\n' + publicUrl);
                }}
                className="text-[11px] text-loom-primary hover:underline font-bold shrink-0 ml-2"
              >
                Copiar Hub
              </button>
            )}
          </div>

          {/* Start Recording CTA Button */}
          <div className="pt-1">
            <button
              onClick={handleStart}
              className="w-full bg-gradient-to-r from-loom-primary to-loom-primaryHover hover:brightness-110 active:scale-[0.99] text-white font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2.5 transition-all"
            >
              <div className="w-3 h-3 rounded-full bg-loom-coral animate-ping" />
              <span className="tracking-wide">INICIAR GRAVAÇÃO</span>
            </button>
            <div className="text-center mt-2">
              <span className="text-[11px] text-loom-muted">
                Ou use o atalho global <kbd className="bg-loom-card px-1.5 py-0.5 rounded border border-loom-border text-white font-mono text-[10px]">Alt + Shift + L</kbd>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
