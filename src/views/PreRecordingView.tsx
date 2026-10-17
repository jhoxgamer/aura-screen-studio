import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Camera,
  Mic,
  Volume2,
  FolderOpen,
  X,
  Minus,
  PlayCircle,
  Crop,
  FileText,
  MousePointer,
  Globe,
  RefreshCw,
  Headphones,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { CaptureSource, RecordingMode, RecordingOptions, CropArea } from '../types';
import { LibraryView } from './LibraryView';

export const PreRecordingView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'library'>('record');
  const [mode, setMode] = useState<RecordingMode>(() => {
    return (localStorage.getItem('aura_recording_mode') as RecordingMode) || 'screen-cam';
  });
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>(() => {
    return localStorage.getItem('aura_video_device_id') || '';
  });
  
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>(() => {
    return localStorage.getItem('aura_audio_device_id') || '';
  });
  
  // Real Audio DSP controls
  const [micVolume, setMicVolume] = useState<number>(() => {
    const saved = localStorage.getItem('aura_mic_volume');
    return saved !== null ? Number(saved) : 100;
  });
  const [noiseSuppressionLevel, setNoiseSuppressionLevel] = useState<'off' | 'low' | 'medium' | 'high'>(() => {
    return (localStorage.getItem('aura_noise_suppression') as any) || 'medium';
  });
  const [isMonitoringAudio, setIsMonitoringAudio] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isClipping, setIsClipping] = useState<boolean>(false);
  
  const [includeSystemAudio, setIncludeSystemAudio] = useState<boolean>(() => {
    const saved = localStorage.getItem('aura_include_system_audio');
    return saved !== null ? saved === 'true' : true;
  });
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>(() => {
    return (localStorage.getItem('aura_resolution') as any) || '1080p';
  });
  const [fps, setFps] = useState<number>(() => {
    const saved = localStorage.getItem('aura_fps');
    return saved ? Number(saved) : 60;
  });

  // Advanced feature toggles
  const [speakerNotesEnabled, setSpeakerNotesEnabled] = useState<boolean>(() => {
    return localStorage.getItem('aura_speaker_notes_enabled') === 'true';
  });
  const [isSpeakerNotesOpen, setIsSpeakerNotesOpen] = useState(false);
  const [highlightCursor, setHighlightCursor] = useState<boolean>(() => {
    const saved = localStorage.getItem('aura_highlight_cursor');
    return saved !== null ? saved === 'true' : true;
  });
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [showLiveCamPreview, setShowLiveCamPreview] = useState(true);

  // Auto-Updater in-app state
  const [updaterStatus, setUpdaterStatus] = useState<{ state: string; version?: string; percent?: number }>({ state: 'idle' });
  const [appVersion, setAppVersion] = useState<string>('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  
  // Audio Graph Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const volumeGainRef = useRef<GainNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const clipTimeoutRef = useRef<any>(null);

  // Listen for crop area selection & auto-updater events
  useEffect(() => {
    const cleanupCrop = window.electronAPI.onCropAreaSelected((area) => {
      setCropArea(area);
      setMode('custom-area');
    });

    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => setAppVersion(v));
    }

    const cleanupUpdaterStatus = window.electronAPI?.onUpdateStatusChanged?.((status) => {
      setUpdaterStatus(status);
      if (status.state === 'idle') setIsCheckingUpdate(false);
    });

    const cleanupUpdaterProgress = window.electronAPI?.onUpdateProgress?.((pct) => {
      setUpdaterStatus((prev) => ({ ...prev, percent: pct, state: 'downloading' }));
    });

    const cleanupNotes = window.electronAPI?.onSpeakerNotesStateChanged?.((isOpen) => {
      setIsSpeakerNotesOpen(isOpen);
    });

    return () => {
      cleanupCrop();
      cleanupUpdaterStatus?.();
      cleanupUpdaterProgress?.();
      cleanupNotes?.();
    };
  }, []);

  // Save preferences
  useEffect(() => {
    localStorage.setItem('aura_recording_mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('aura_resolution', resolution);
  }, [resolution]);

  useEffect(() => {
    localStorage.setItem('aura_fps', String(fps));
  }, [fps]);

  useEffect(() => {
    localStorage.setItem('aura_include_system_audio', String(includeSystemAudio));
  }, [includeSystemAudio]);

  useEffect(() => {
    localStorage.setItem('aura_speaker_notes_enabled', String(speakerNotesEnabled));
  }, [speakerNotesEnabled]);

  useEffect(() => {
    localStorage.setItem('aura_highlight_cursor', String(highlightCursor));
  }, [highlightCursor]);

  useEffect(() => {
    localStorage.setItem('aura_mic_volume', String(micVolume));
  }, [micVolume]);

  useEffect(() => {
    localStorage.setItem('aura_noise_suppression', noiseSuppressionLevel);
  }, [noiseSuppressionLevel]);

  useEffect(() => {
    if (selectedAudioId) localStorage.setItem('aura_audio_device_id', selectedAudioId);
  }, [selectedAudioId]);

  useEffect(() => {
    if (selectedVideoId) localStorage.setItem('aura_video_device_id', selectedVideoId);
  }, [selectedVideoId]);

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
        const savedVideo = localStorage.getItem('aura_video_device_id');
        const matchedVideo = vInputs.find((d) => d.deviceId === savedVideo);
        if (matchedVideo) {
          setSelectedVideoId(matchedVideo.deviceId);
        } else if (vInputs.length > 0) {
          setSelectedVideoId(vInputs[0].deviceId);
        }

        setAudioDevices(aInputs);
        const savedAudio = localStorage.getItem('aura_audio_device_id');
        const matchedAudio = aInputs.find((d) => d.deviceId === savedAudio);
        if (matchedAudio) {
          setSelectedAudioId(matchedAudio.deviceId);
        } else if (aInputs.length > 0) {
          setSelectedAudioId(aInputs[0].deviceId);
        }
      } catch (err) {
        console.error('Error fetching devices:', err);
      }
    }
    initDevices();

    const interval = setInterval(async () => {
      try {
        const pub = await window.electronAPI.getPublicUrl();
        if (pub) {
          setPublicUrl(pub);
          clearInterval(interval);
        }
      } catch (e) {}
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Real Web Audio DSP Pipeline & Live Microphone Monitoring
  useEffect(() => {
    let isCancelled = false;

    async function setupAudioDSP() {
      // Teardown previous pipeline
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      if (activeTab !== 'record') return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedAudioId
            ? {
                deviceId: { exact: selectedAudioId },
                echoCancellation: true,
                noiseSuppression: noiseSuppressionLevel !== 'off',
                autoGainControl: false
              }
            : {
                echoCancellation: true,
                noiseSuppression: noiseSuppressionLevel !== 'off',
                autoGainControl: false
              },
          video: false
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        micStreamRef.current = stream;

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;

        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }

        const source = ctx.createMediaStreamSource(stream);
        let lastNode: AudioNode = source;

        // 1. Noise suppression filters
        if (noiseSuppressionLevel === 'low') {
          const highpass = ctx.createBiquadFilter();
          highpass.type = 'highpass';
          highpass.frequency.setValueAtTime(80, ctx.currentTime);
          highpass.Q.setValueAtTime(0.707, ctx.currentTime);
          lastNode.connect(highpass);
          lastNode = highpass;
        } else if (noiseSuppressionLevel === 'medium') {
          const highpass = ctx.createBiquadFilter();
          highpass.type = 'highpass';
          highpass.frequency.setValueAtTime(120, ctx.currentTime);
          highpass.Q.setValueAtTime(0.8, ctx.currentTime);
          lastNode.connect(highpass);
          lastNode = highpass;

          const notch = ctx.createBiquadFilter();
          notch.type = 'peaking';
          notch.frequency.setValueAtTime(3500, ctx.currentTime);
          notch.gain.setValueAtTime(-5, ctx.currentTime);
          notch.Q.setValueAtTime(1.5, ctx.currentTime);
          lastNode.connect(notch);
          lastNode = notch;
        } else if (noiseSuppressionLevel === 'high') {
          const highpass = ctx.createBiquadFilter();
          highpass.type = 'highpass';
          highpass.frequency.setValueAtTime(160, ctx.currentTime);
          highpass.Q.setValueAtTime(0.9, ctx.currentTime);
          lastNode.connect(highpass);
          lastNode = highpass;

          const lowpass = ctx.createBiquadFilter();
          lowpass.type = 'lowpass';
          lowpass.frequency.setValueAtTime(7500, ctx.currentTime);
          lowpass.Q.setValueAtTime(0.707, ctx.currentTime);
          lastNode.connect(lowpass);
          lastNode = lowpass;
        }

        // 2. Volume Gain Node (0% to 200%)
        const gainNode = ctx.createGain();
        const gainMultiplier = Math.max(0, Math.min(200, micVolume)) / 100;
        gainNode.gain.setValueAtTime(gainMultiplier, ctx.currentTime);
        lastNode.connect(gainNode);
        lastNode = gainNode;
        volumeGainRef.current = gainNode;

        // 3. Transparent anti-clipping limiter (DynamicsCompressor)
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-2.5, ctx.currentTime);
        limiter.knee.setValueAtTime(4.0, ctx.currentTime);
        limiter.ratio.setValueAtTime(16.0, ctx.currentTime);
        limiter.attack.setValueAtTime(0.003, ctx.currentTime);
        limiter.release.setValueAtTime(0.12, ctx.currentTime);
        lastNode.connect(limiter);
        lastNode = limiter;

        // 4. Analyser for accurate post-gain & post-limiter VU metering
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.6;
        lastNode.connect(analyser);
        analyserRef.current = analyser;

        // 5. Monitor Output (Ouvir para Testar)
        const monitorGain = ctx.createGain();
        monitorGain.gain.setValueAtTime(isMonitoringAudio ? 1.0 : 0.0, ctx.currentTime);
        monitorGain.connect(ctx.destination);
        lastNode.connect(monitorGain);
        monitorGainRef.current = monitorGain;

        // VU meter and clipping detection loop
        const timeData = new Uint8Array(analyser.fftSize);
        const freqData = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyser.getByteFrequencyData(freqData);
          analyser.getByteTimeDomainData(timeData);

          // Calculate average frequency volume
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) {
            sum += freqData[i];
          }
          const avg = sum / freqData.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(level);

          // Detect clipping in time domain (values near 0 or 255 mean digital peak clipping)
          let clipped = false;
          for (let i = 0; i < timeData.length; i++) {
            if (timeData[i] >= 253 || timeData[i] <= 2) {
              clipped = true;
              break;
            }
          }

          if (clipped || level >= 92) {
            setIsClipping(true);
            if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
            clipTimeoutRef.current = setTimeout(() => setIsClipping(false), 350);
          }

          animFrameRef.current = requestAnimationFrame(tick);
        };

        tick();
      } catch (err) {
        console.warn('Microphone DSP setup error:', err);
      }
    }

    setupAudioDSP();

    return () => {
      isCancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
    };
  }, [selectedAudioId, noiseSuppressionLevel, activeTab]);

  // Dynamically update mic gain without tearing down audio graph
  useEffect(() => {
    if (volumeGainRef.current && audioContextRef.current) {
      const mult = Math.max(0, Math.min(200, micVolume)) / 100;
      volumeGainRef.current.gain.setValueAtTime(mult, audioContextRef.current.currentTime);
    }
  }, [micVolume]);

  // Dynamically toggle audio monitoring
  useEffect(() => {
    if (monitorGainRef.current && audioContextRef.current) {
      if (isMonitoringAudio && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      monitorGainRef.current.gain.setValueAtTime(
        isMonitoringAudio ? 1.0 : 0.0,
        audioContextRef.current.currentTime
      );
    }
  }, [isMonitoringAudio]);

  // Live Camera Framing Preview in Launcher
  useEffect(() => {
    let active = true;
    async function initCam() {
      if (mode === 'screen-only' || !showLiveCamPreview || activeTab !== 'record') {
        if (camStreamRef.current) {
          camStreamRef.current.getTracks().forEach((t) => t.stop());
          camStreamRef.current = null;
        }
        return;
      }
      try {
        if (camStreamRef.current) {
          camStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoId
            ? { deviceId: { exact: selectedVideoId }, width: { ideal: 640 }, height: { ideal: 360 } }
            : true,
          audio: false
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        camStreamRef.current = stream;
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Camera preview error:', err);
      }
    }
    initCam();

    return () => {
      active = false;
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((t) => t.stop());
        camStreamRef.current = null;
      }
    };
  }, [selectedVideoId, mode, showLiveCamPreview, activeTab]);

  const handleStart = () => {
    // Stop live test monitoring to avoid audio echo during recording
    if (isMonitoringAudio) {
      setIsMonitoringAudio(false);
      if (monitorGainRef.current && audioContextRef.current) {
        monitorGainRef.current.gain.setValueAtTime(0.0, audioContextRef.current.currentTime);
      }
    }

    // Release launcher camera preview so camera bubble takes exclusive hardware access
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }

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
      micVolume,
      noiseSuppressionLevel,
      cropArea: mode === 'custom-area' && cropArea ? cropArea : undefined
    };

    window.electronAPI.startRecording(options);
  };

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  // Formatter for dB gain readout
  const formatGainDb = (vol: number) => {
    if (vol === 0) return 'Mudo';
    if (vol === 100) return '0.0 dB (Padrão)';
    const db = 20 * Math.log10(vol / 100);
    return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
  };

  return (
    <div className="w-[460px] h-[730px] bg-[#0c0e14] text-slate-100 rounded-2xl border border-[#232838] shadow-2xl flex flex-col overflow-hidden select-none font-sans">
      {/* Title Bar / Drag Handle */}
      <div
        className="h-12 bg-[#121520] px-4 flex items-center justify-between border-b border-[#202534]"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center space-x-2.5">
          {/* Authentic Studio Emblem */}
          <div className="w-7 h-7 rounded-lg bg-[#1a1f2e] border border-[#2e374d] flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-400 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-sm tracking-tight text-white">Aura Screen Studio</span>
            <span className="text-[10px] text-slate-400 bg-[#181c28] border border-[#262c3e] px-1.5 py-0.5 rounded font-mono">
              v{appVersion || '1.7.2'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI.takeScreenshot()}
            title="Capturar Screenshot com Anotações (Alt+Shift+S)"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-[#1a1f2e] hover:bg-[#232a3d] text-slate-300 hover:text-indigo-300 text-[11px] font-medium transition-colors border border-[#2b334a]"
          >
            <Camera className="w-3.5 h-3.5 text-indigo-400" />
            <span>Screenshot</span>
          </button>
          <button
            onClick={() => window.electronAPI.checkForUpdates()}
            title="Verificar Atualizações"
            className="p-1.5 hover:bg-[#1f2434] rounded-md text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.electronAPI.minimizeCurrentWindow()}
            className="p-1.5 hover:bg-[#1f2434] rounded-md text-slate-400 hover:text-white transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.electronAPI.closeCurrentWindow()}
            className="p-1.5 hover:bg-rose-500/20 hover:text-rose-400 rounded-md text-slate-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#202534] px-4 bg-[#0f121a] pt-2">
        <button
          onClick={() => setActiveTab('record')}
          className={`flex items-center space-x-2 px-4 py-2 font-medium text-xs rounded-t-lg transition-all ${
            activeTab === 'record'
              ? 'text-white border-b-2 border-indigo-500 bg-[#151924]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PlayCircle className="w-3.5 h-3.5 text-indigo-400" />
          <span>Nova Gravação</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`flex items-center space-x-2 px-4 py-2 font-medium text-xs rounded-t-lg transition-all ${
            activeTab === 'library'
              ? 'text-white border-b-2 border-indigo-500 bg-[#151924]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
          <span>Biblioteca de Vídeos</span>
        </button>
      </div>

      {activeTab === 'library' ? (
        <LibraryView />
      ) : (
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {/* In-App Auto-Update Notification Banner */}
          {updaterStatus.state === 'downloading' && (
            <div className="p-3 bg-[#131b2e] border border-indigo-500/40 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-300">
                <span className="flex items-center space-x-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Baixando atualização v{updaterStatus.version || ''}...</span>
                </span>
                <span className="font-mono text-indigo-200">{updaterStatus.percent || 0}%</span>
              </div>
              <div className="w-full bg-[#0a0f1d] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${updaterStatus.percent || 0}%` }}
                />
              </div>
            </div>
          )}

          {updaterStatus.state === 'downloaded' && (
            <div className="p-3 bg-[#10201c] border border-emerald-500/50 rounded-xl flex items-center justify-between">
              <div className="text-xs">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Atualização v{updaterStatus.version || ''} Pronta
                </span>
                <span className="text-[11px] text-slate-300 block">
                  Reinicie para aplicar as melhorias no app.
                </span>
              </div>
              <button
                onClick={() => window.electronAPI?.installUpdateNow?.()}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
              >
                Reiniciar Agora
              </button>
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Modo de Gravação
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => setMode('screen-cam')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'screen-cam'
                    ? 'bg-indigo-500/15 border-indigo-500 text-white font-medium shadow-sm'
                    : 'bg-[#131620] border-[#222838] text-slate-400 hover:border-[#323b52] hover:text-white'
                }`}
              >
                <div className="relative mb-1">
                  <Monitor className="w-4 h-4 text-indigo-400" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 border border-[#131620]" />
                </div>
                <span className="text-[11px] leading-tight">Tela + Cam</span>
              </button>

              <button
                onClick={() => setMode('screen-only')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'screen-only'
                    ? 'bg-indigo-500/15 border-indigo-500 text-white font-medium shadow-sm'
                    : 'bg-[#131620] border-[#222838] text-slate-400 hover:border-[#323b52] hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4 mb-1 text-slate-300" />
                <span className="text-[11px] leading-tight">Só Tela</span>
              </button>

              <button
                onClick={() => setMode('cam-only')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'cam-only'
                    ? 'bg-indigo-500/15 border-indigo-500 text-white font-medium shadow-sm'
                    : 'bg-[#131620] border-[#222838] text-slate-400 hover:border-[#323b52] hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4 mb-1 text-rose-400" />
                <span className="text-[11px] leading-tight">Só Câmera</span>
              </button>

              <button
                onClick={() => {
                  setMode('custom-area');
                  if (!cropArea) window.electronAPI.startCropSelection();
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  mode === 'custom-area'
                    ? 'bg-indigo-500/15 border-indigo-500 text-white font-medium shadow-sm'
                    : 'bg-[#131620] border-[#222838] text-slate-400 hover:border-[#323b52] hover:text-white'
                }`}
              >
                <Crop className="w-4 h-4 mb-1 text-emerald-400" />
                <span className="text-[11px] leading-tight">Área Recorte</span>
              </button>
            </div>

            {/* Custom Area Details & Pick Button */}
            {mode === 'custom-area' && (
              <div className="mt-2 p-2.5 bg-[#131620] border border-[#222838] rounded-xl flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-slate-400">Região: </span>
                  <span className="font-mono text-indigo-300 font-semibold">
                    {cropArea ? `${Math.round(cropArea.width)} × ${Math.round(cropArea.height)} px` : 'Nenhuma definida'}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  {cropArea && (
                    <button
                      onClick={() => setCropArea(null)}
                      className="px-2 py-1 rounded-lg bg-[#1a1f2e] hover:bg-[#252c42] text-slate-400 hover:text-rose-400 text-xs transition-colors"
                      title="Redefinir para tela inteira"
                    >
                      Redefinir
                    </button>
                  )}
                  <button
                    onClick={() => window.electronAPI.startCropSelection()}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-semibold transition-colors"
                  >
                    {cropArea ? 'Alterar Área' : 'Selecionar na Tela'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Screen / Window Source Picker */}
          {mode !== 'cam-only' && (
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Fonte de Vídeo
              </label>
              <div className="bg-[#131620] border border-[#222838] rounded-xl p-2.5 flex items-center space-x-3">
                {selectedSource?.thumbnail ? (
                  <img
                    src={selectedSource.thumbnail}
                    alt="preview"
                    className="w-16 h-10 object-cover rounded border border-[#2a3147]"
                  />
                ) : (
                  <div className="w-16 h-10 bg-[#0c0e14] rounded flex items-center justify-center border border-[#222838]">
                    <Monitor className="w-5 h-5 text-slate-500" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <select
                    value={selectedSourceId}
                    onChange={(e) => setSelectedSourceId(e.target.value)}
                    className="w-full bg-[#0c0e14] border border-[#262c3e] rounded-lg text-xs text-white p-2 font-medium focus:outline-none focus:border-indigo-500"
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#121520]">
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Camera Selector & Live Framing Preview */}
          {mode !== 'screen-only' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Câmera / Webcam
                </label>
                <button
                  type="button"
                  onClick={() => setShowLiveCamPreview(!showLiveCamPreview)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  {showLiveCamPreview ? 'Ocultar Preview' : 'Exibir Preview'}
                </button>
              </div>

              <div className="bg-[#131620] border border-[#222838] rounded-xl p-2.5 flex items-center space-x-2">
                <Camera className="w-4 h-4 text-indigo-400 shrink-0" />
                <select
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none font-medium truncate"
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-[#121520]">
                      {d.label || `Câmera (${d.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Live Webcam Framing Box */}
              {showLiveCamPreview && (
                <div className="relative w-full h-28 bg-black rounded-xl overflow-hidden border border-[#242b3d]">
                  <video
                    ref={camVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover -scale-x-100"
                  />
                  <div className="absolute inset-0 border border-dashed border-white/20 rounded-xl pointer-events-none" />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] text-slate-300 font-medium flex items-center space-x-1.5 border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    <span>Enquadramento ao Vivo</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PROFESSIONAL STUDIO MICROPHONE & AUDIO PROCESSING SECTION */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Microfone & Áudio de Estúdio
              </label>
              {isClipping ? (
                <span className="text-[10px] text-rose-400 font-bold bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>CLIP / SATURAÇÃO</span>
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span>Nível: {audioLevel}%</span>
                </span>
              )}
            </div>

            <div className="bg-[#131620] border border-[#222838] rounded-xl p-3 space-y-3">
              {/* Microphone Device Dropdown */}
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-indigo-400 shrink-0" />
                <select
                  value={selectedAudioId}
                  onChange={(e) => setSelectedAudioId(e.target.value)}
                  className="w-full bg-[#0c0e14] border border-[#262c3e] rounded-lg text-xs text-white p-2 font-medium focus:outline-none focus:border-indigo-500 truncate"
                >
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-[#121520]">
                      {d.label || `Microfone (${d.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              {/* 16-Segment Calibrated LED VU Meter with Clipping Warning */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>-40 dB</span>
                  <span>-18 dB</span>
                  <span>-6 dB</span>
                  <span className={isClipping ? 'text-rose-400 font-bold' : 'text-slate-500'}>0 dB</span>
                </div>
                <div className="flex items-center space-x-1 h-3 w-full bg-[#090b10] p-0.5 rounded-lg border border-[#202534]">
                  {Array.from({ length: 16 }).map((_, idx) => {
                    const activeThreshold = ((idx + 1) / 16) * 100;
                    const isLit = audioLevel >= activeThreshold;
                    const isRed = idx >= 14;
                    const isYellow = idx >= 10 && idx < 14;
                    const barColor = isLit
                      ? isRed
                        ? 'bg-rose-500'
                        : isYellow
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                      : 'bg-[#181c28]';
                    return (
                      <div
                        key={idx}
                        className={`flex-1 h-full rounded-sm transition-all duration-75 ${barColor}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Volume & Gain Booster Slider (0% to 200%) */}
              <div className="space-y-1.5 pt-1 border-t border-[#202534]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ganho de Entrada:</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-semibold text-indigo-300">
                      {micVolume}% ({formatGainDb(micVolume)})
                    </span>
                    {micVolume !== 100 && (
                      <button
                        type="button"
                        onClick={() => setMicVolume(100)}
                        title="Restaurar nível padrão (100%)"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1f2e] hover:bg-[#252d42] text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>100%</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value={micVolume}
                    onChange={(e) => setMicVolume(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#0c0e14] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0% (Mudo)</span>
                  <span>100% (Padrão)</span>
                  <span>200% (+6 dB Boost)</span>
                </div>
              </div>

              {/* Noise Reduction (Redução de Ruído) - 4 Real DSP Levels */}
              <div className="space-y-1.5 pt-1 border-t border-[#202534]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Redução de Ruído:</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-300 capitalize">
                    {noiseSuppressionLevel === 'off' && 'Desativado'}
                    {noiseSuppressionLevel === 'low' && 'Leve (80Hz)'}
                    {noiseSuppressionLevel === 'medium' && 'Moderado (Recomendado)'}
                    {noiseSuppressionLevel === 'high' && 'Agressivo (Estrito)'}
                  </span>
                </div>

                {/* 4-Level Segmented Controls */}
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#0c0e14] rounded-lg border border-[#202534]">
                  {(['off', 'low', 'medium', 'high'] as const).map((lvl) => {
                    const labels = {
                      off: 'Desativado',
                      low: 'Leve',
                      medium: 'Moderado',
                      high: 'Agressivo'
                    };
                    const isActive = noiseSuppressionLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setNoiseSuppressionLevel(lvl)}
                        className={`py-1 text-[11px] font-medium rounded transition-all text-center ${
                          isActive
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-[#181c28]'
                        }`}
                      >
                        {labels[lvl]}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] text-slate-400 leading-tight">
                  {noiseSuppressionLevel === 'off' && 'Sinal original puro sem filtros adicionais.'}
                  {noiseSuppressionLevel === 'low' && 'Filtro passa-alta 80Hz: remove zumbidos de rede elétrica e batidas na mesa.'}
                  {noiseSuppressionLevel === 'medium' && 'Passa-alta 120Hz + Notch 3.5kHz: elimina ruído de ventoinhas, computadores e ar condicionado.'}
                  {noiseSuppressionLevel === 'high' && 'Isolamento estrito: corta ruídos e foca na frequência central da voz humana.'}
                </p>
              </div>

              {/* Listen to Test (Ouvir para Testar / Audio Monitoring) */}
              <div className="pt-2 border-t border-[#202534] space-y-2">
                <button
                  type="button"
                  onClick={() => setIsMonitoringAudio(!isMonitoringAudio)}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                    isMonitoringAudio
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-[#181c28] hover:bg-[#202536] text-slate-300 hover:text-white border border-[#262c3e]'
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {isMonitoringAudio ? 'Desligar Monitoração de Áudio' : 'Ouvir para Testar (Retorno ao Vivo)'}
                  </span>
                </button>

                {isMonitoringAudio ? (
                  <div className="p-2 bg-amber-950/40 border border-amber-500/30 rounded-lg text-[11px] text-amber-200 flex items-start space-x-2">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Monitoração ativa em tempo real</span>
                      <span>Você está ouvindo o áudio exatamente como será gravado (com ganho e filtros). Use fones de ouvido para evitar microfonia.</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-500 block text-center">
                    Dica: use fones de ouvido antes de ligar a monitoração para evitar eco com as caixas de som.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Advanced Recording Settings (Resolution, FPS, System Audio) */}
          <div className="bg-[#131620] border border-[#222838] rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-medium text-white">Gravar Som do Sistema</span>
              </div>
              <input
                type="checkbox"
                checked={includeSystemAudio}
                onChange={(e) => setIncludeSystemAudio(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-[#202534]">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-white">Teleprompter & Roteiro</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.electronAPI.toggleSpeakerNotes()}
                  className={`text-[10px] px-2 py-0.5 rounded font-medium transition-all ${
                    isSpeakerNotesOpen
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-[#181c28] text-slate-300 hover:text-white hover:bg-[#202536] border border-[#262c3e]'
                  }`}
                >
                  {isSpeakerNotesOpen ? 'Prompter Aberto' : 'Abrir / Editar'}
                </button>
                <input
                  type="checkbox"
                  checked={speakerNotesEnabled}
                  onChange={(e) => setSpeakerNotesEnabled(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                  title="Abrir automaticamente ao gravar"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-[#202534]">
              <div className="flex items-center space-x-2">
                <MousePointer className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-white">Destacar Cursor & Cliques</span>
              </div>
              <input
                type="checkbox"
                checked={highlightCursor}
                onChange={(e) => setHighlightCursor(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-[#202534]">
              <span className="text-xs font-medium text-white">Qualidade & Taxa</span>
              <div className="flex items-center space-x-2">
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  className="bg-[#0c0e14] border border-[#262c3e] rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                >
                  <option value="720p">720p (HD)</option>
                  <option value="1080p">1080p (FHD)</option>
                  <option value="4k">4K (Ultra)</option>
                </select>

                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="bg-[#0c0e14] border border-[#262c3e] rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                >
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </div>
            </div>
          </div>

          {/* Global Share Link Status Pill */}
          <div className="bg-[#131620] border border-[#222838] rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 truncate">
              <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-[11px] text-slate-400">Link Público:</span>
              {publicUrl ? (
                <span className="text-[11px] text-emerald-400 font-medium truncate flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span>Ativo para compartilhamento</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">Iniciando túnel seguro...</span>
              )}
            </div>
            {publicUrl && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  alert('Link do Hub Público copiado!\n' + publicUrl);
                }}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold shrink-0 ml-2"
              >
                Copiar Hub
              </button>
            )}
          </div>

          {/* Start Recording CTA Button */}
          <div className="pt-1">
            <button
              onClick={handleStart}
              className="w-full bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2.5 transition-all"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-white" />
              <span className="tracking-wide">INICIAR GRAVAÇÃO</span>
            </button>
            <div className="text-center mt-2 mb-2">
              <span className="text-[11px] text-slate-400">
                Ou use o atalho global <kbd className="bg-[#131620] px-1.5 py-0.5 rounded border border-[#222838] text-white font-mono text-[10px]">Alt + Shift + A</kbd>
              </span>
            </div>

            {/* App Version & Manual Update Check */}
            <div className="flex items-center justify-between pt-2 border-t border-[#202534] text-[11px] text-slate-500">
              <span className="font-mono flex items-center gap-1.5">
                <span>v{appVersion || '1.7.2'}</span>
                {updateFeedback && (
                  <span className="text-emerald-400 font-sans font-medium text-[10px] bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                    {updateFeedback}
                  </span>
                )}
              </span>
              <button
                onClick={async () => {
                  setIsCheckingUpdate(true);
                  setUpdateFeedback(null);
                  try {
                    const res = await window.electronAPI?.checkForUpdates?.();
                    setIsCheckingUpdate(false);
                    if (res?.isLatest) {
                      setUpdateFeedback('Versão mais recente!');
                      setTimeout(() => setUpdateFeedback(null), 3500);
                    }
                  } catch (e) {
                    setIsCheckingUpdate(false);
                  }
                }}
                disabled={isCheckingUpdate}
                className="flex items-center space-x-1.5 hover:text-indigo-400 text-slate-400 transition-colors"
                title="Checar se há novas versões"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingUpdate ? 'animate-spin text-indigo-400' : ''}`} />
                <span>{isCheckingUpdate ? 'Verificando...' : 'Buscar Atualizações'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
