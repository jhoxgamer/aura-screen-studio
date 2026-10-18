import React, { useState, useEffect } from 'react';
import {
  Radio,
  Lock,
  Unlock,
  AlertTriangle,
  Play,
  Square,
  ShieldCheck,
  Activity,
  Wifi,
  Cpu,
  Key,
  Eye,
  EyeOff,
  X,
  ExternalLink,
  Check
} from 'lucide-react';
import { BroadcastConfig, BroadcastTelemetry, StorageBackendStatus } from '../types';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BroadcastModal: React.FC<BroadcastModalProps> = ({ isOpen, onClose }) => {
  const [streamKey, setStreamKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [serverUrl, setServerUrl] = useState('rtmps://a.rtmps.youtube.com/live2');
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');
  const [fps, setFps] = useState<30 | 60>(60);
  const [bitrateKbps, setBitrateKbps] = useState<number>(6000);
  const [storageStatus, setStorageStatus] = useState<StorageBackendStatus | null>(null);
  const [telemetry, setTelemetry] = useState<BroadcastTelemetry | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Fetch safeStorage status
    window.electronAPI?.getBroadcastStorageStatus?.().then((status) => {
      if (status) setStorageStatus(status);
    });

    // 2. Load saved stream key (if any)
    window.electronAPI?.loadBroadcastStreamKey?.().then((key) => {
      if (key) setStreamKey(key);
    });

    // 3. Query telemetry periodically if open
    const timer = setInterval(() => {
      window.electronAPI?.getBroadcastTelemetry?.().then((t) => {
        if (t) setTelemetry(t);
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const isStreaming = telemetry?.isStreaming ?? false;

  const handleSaveKey = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await window.electronAPI?.saveBroadcastStreamKey?.(streamKey);
      if (res?.isVolatile) {
        setSaveSuccessMsg(res.warning || 'Chave retida em memória volátil.');
      } else {
        setSaveSuccessMsg('Chave salva com criptografia do sistema operacional!');
      }
      const updatedStatus = await window.electronAPI?.getBroadcastStorageStatus?.();
      if (updatedStatus) setStorageStatus(updatedStatus);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (e: any) {
      setActionError(e?.message || 'Erro ao salvar chave');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearKey = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await window.electronAPI?.clearBroadcastStreamKey?.();
      setStreamKey('');
      const updatedStatus = await window.electronAPI?.getBroadcastStorageStatus?.();
      if (updatedStatus) setStorageStatus(updatedStatus);
      setSaveSuccessMsg('Chave removida.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (e: any) {
      setActionError(e?.message || 'Erro ao limpar chave');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBroadcast = async () => {
    setActionError(null);
    setIsLoading(true);
    try {
      if (isStreaming) {
        await window.electronAPI?.stopBroadcast?.();
      } else {
        const config: BroadcastConfig = {
          serverUrl,
          streamKey,
          resolution,
          fps,
          bitrateKbps,
          keyframeIntervalSec: 2.0,
          audioBitrateKbps: 128,
          audioSampleRate: 48000
        };
        const res = await window.electronAPI?.startBroadcast?.(config);
        if (!res?.success) {
          setActionError(res?.message || 'Falha ao iniciar transmissão.');
        }
      }
      const t = await window.electronAPI?.getBroadcastTelemetry?.();
      if (t) setTelemetry(t);
    } catch (e: any) {
      setActionError(e?.message || 'Erro de transmissão');
    } finally {
      setIsLoading(false);
    }
  };

  const formatUptime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#10141D] border border-[#303A4B] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#303A4B] flex items-center justify-between bg-[#141A26]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF0000]/15 border border-[#FF0000]/30 flex items-center justify-center">
              <Radio className="w-4 h-4 text-[#FF4E4E]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-[#F3F5F9]">Aura Broadcast — YouTube Live</h2>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                  Beta
                </span>
              </div>
              <p className="text-[11px] text-[#929CAF]">RTMPS 1080p60 CBR com Proteção safeStorage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#929CAF] hover:text-white hover:bg-[#1E2638] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Experimental Notice Banner */}
          <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-[11px] text-amber-200 flex items-start space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Recurso Experimental (Beta):</span> Transmissão direta RTMPS via FFmpeg para o YouTube Live. A ingestão ao vivo depende da estabilidade do seu provedor e chave de transmissão. Recomendamos realizar transmissões de teste em modo &quot;Não listado&quot; no YouTube Studio.
            </div>
          </div>
          {/* safeStorage Security Status Pill */}
          <div className={`p-3 rounded-xl border flex items-start space-x-2.5 text-xs ${
            storageStatus?.isVolatileOnly
              ? 'bg-amber-950/20 border-amber-600/30 text-amber-200'
              : 'bg-emerald-950/20 border-emerald-600/30 text-emerald-200'
          }`}>
            {storageStatus?.isVolatileOnly ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-semibold">
                  {storageStatus?.isVolatileOnly ? 'Armazenamento Volátil (Sem Keyring)' : 'Criptografia Nativa Ativa'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30 border border-white/10 uppercase">
                  {storageStatus?.storageBackend || 'DPAPI'}
                </span>
              </div>
              <p className="text-[11px] text-white/70 mt-1 leading-snug">
                {storageStatus?.isVolatileOnly
                  ? 'O keyring seguro do sistema operacional não está disponível. A Stream Key será mantida estritamente na memória da sessão e não será gravada em disco.'
                  : 'A chave de transmissão é criptografada com as credenciais do sistema operacional antes de ser armazenada no disco.'}
              </p>
            </div>
          </div>

          {/* Stream Key Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-[#B7C0CE] flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-[#78A5FF]" />
                <span>Chave de Transmissão (Stream Key):</span>
              </label>
              <a
                href="https://studio.youtube.com/channel/live"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[#78A5FF] hover:underline flex items-center space-x-1"
              >
                <span>Obter no YouTube Studio</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                placeholder="ex: ab12-cd34-ef56-gh78-ijkl"
                className="w-full bg-[#0B0E14] border border-[#303A4B] rounded-xl px-3 py-2 text-xs text-white pr-20 font-mono focus:outline-none focus:border-[#78A5FF]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 px-2 py-1 text-[#929CAF] hover:text-white text-xs flex items-center space-x-1"
                title={showKey ? 'Ocultar chave' : 'Mostrar chave'}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Action Buttons for Key */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={isLoading || !streamKey.trim()}
                  className="px-2.5 py-1 rounded-lg bg-[#192231] hover:bg-[#202C3F] border border-[#78A5FF]/30 text-[#78A5FF] text-[11px] font-semibold transition-colors disabled:opacity-50"
                >
                  Salvar Chave
                </button>
                {storageStatus?.hasSavedKey && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-lg bg-red-950/20 hover:bg-red-900/30 border border-red-500/30 text-red-300 text-[11px] font-semibold transition-colors"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {saveSuccessMsg && (
                <span className="text-[11px] text-emerald-400 font-medium flex items-center space-x-1 animate-in fade-in">
                  <Check className="w-3 h-3" />
                  <span>{saveSuccessMsg}</span>
                </span>
              )}
            </div>
          </div>

          {/* YouTube Live Encoder Specs Grid (Official Google Presets) */}
          <div className="bg-[#0B0E14] border border-[#303A4B] rounded-xl p-3 space-y-2.5 text-xs">
            <h3 className="text-[11px] font-bold text-[#929CAF] uppercase tracking-wider">
              Parâmetros Oficiais do Codificador (YouTube Live)
            </h3>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-[#929CAF]">Resolução & Taxa:</span>
                <div className="font-semibold text-white mt-0.5 flex items-center space-x-2">
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    className="bg-[#141A26] border border-[#303A4B] rounded px-1.5 py-0.5 text-white"
                  >
                    <option value="1080p">1080p (Full HD)</option>
                    <option value="720p">720p (HD)</option>
                  </select>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value) as any)}
                    className="bg-[#141A26] border border-[#303A4B] rounded px-1.5 py-0.5 text-white"
                  >
                    <option value={60}>60 fps</option>
                    <option value={30}>30 fps</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="text-[#929CAF]">Bitrate (CBR Estrito):</span>
                <div className="font-semibold text-white mt-0.5">
                  <select
                    value={bitrateKbps}
                    onChange={(e) => setBitrateKbps(Number(e.target.value))}
                    className="w-full bg-[#141A26] border border-[#303A4B] rounded px-1.5 py-0.5 text-white font-mono"
                  >
                    <option value={6000}>6.000 Kbps (Padrão 1080p60)</option>
                    <option value={9000}>9.000 Kbps (Alta Nitidez)</option>
                    <option value={12000}>12.000 Kbps (Movimento Intenso)</option>
                    <option value={17000}>17.000 Kbps (Máximo YouTube)</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="text-[#929CAF]">Intervalo de Keyframe:</span>
                <p className="font-mono font-semibold text-emerald-400 mt-0.5">2,0 segundos (Obrigatório)</p>
              </div>

              <div>
                <span className="text-[#929CAF]">Áudio AAC Estéreo:</span>
                <p className="font-mono font-semibold text-emerald-400 mt-0.5">128 Kbps / 48 kHz</p>
              </div>
            </div>
          </div>

          {/* Real-Time Telemetry Dashboard (When Live) */}
          {isStreaming && telemetry && (
            <div className="bg-[#121A2A] border border-[#78A5FF]/40 rounded-xl p-3 space-y-2 text-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#78A5FF] flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                  <span>Telemetria em Tempo Real</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {formatUptime(telemetry.uptimeSec)}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-center pt-1 font-mono text-[11px]">
                <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                  <div className="text-[9px] text-[#929CAF]">FPS REAL</div>
                  <div className="text-white font-bold text-xs">{telemetry.fps.toFixed(1)}</div>
                </div>
                <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                  <div className="text-[9px] text-[#929CAF]">BITRATE</div>
                  <div className="text-white font-bold text-xs">{telemetry.bitrateKbps}k</div>
                </div>
                <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                  <div className="text-[9px] text-[#929CAF] flex items-center justify-center gap-1">
                    <Wifi className="w-2.5 h-2.5 text-amber-400" />
                    <span>QUEDAS REDE</span>
                  </div>
                  <div className={`font-bold text-xs ${telemetry.droppedFramesNetwork > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {telemetry.droppedFramesNetwork}
                  </div>
                </div>
                <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                  <div className="text-[9px] text-[#929CAF] flex items-center justify-center gap-1">
                    <Cpu className="w-2.5 h-2.5 text-purple-400" />
                    <span>ENCODER LAG</span>
                  </div>
                  <div className={`font-bold text-xs ${telemetry.encoderLagFrames > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {telemetry.encoderLagFrames}
                  </div>
                </div>
              </div>
            </div>
          )}

          {actionError && (
            <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/40 text-red-200 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#303A4B] bg-[#141A26] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#929CAF] hover:text-white hover:bg-[#1E2638] transition-colors"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleToggleBroadcast}
            disabled={isLoading || (!isStreaming && !streamKey.trim())}
            className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer shadow-lg disabled:opacity-50 ${
              isStreaming
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/40'
                : 'bg-[#FF0000] hover:bg-[#FF2020] text-white shadow-[#FF0000]/30'
            }`}
          >
            {isStreaming ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>ENCERRAR TRANSMISSÃO</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>INICIAR TRANSMISSÃO NO YOUTUBE</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
