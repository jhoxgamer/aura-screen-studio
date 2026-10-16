import React, { useState, useEffect } from 'react';
import {
  Film,
  Play,
  FolderOpen,
  Trash2,
  Calendar,
  Clock,
  HardDrive,
  Share2,
  ExternalLink,
  Download
} from 'lucide-react';
import { RecordingMeta } from '../types';

export const LibraryView: React.FC = () => {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadList();
  }, []);

  async function loadList() {
    try {
      if (window.electronAPI?.getRecordings) {
        const list = await window.electronAPI.getRecordings();
        setRecordings(list);
      }
    } catch (err) {
      console.error('Failed to load recordings:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta gravação?')) {
      await window.electronAPI.deleteRecording(id);
      loadList();
    }
  };

  const handleOpenFolder = (filePath: string) => {
    window.electronAPI.openFileFolder(filePath);
  };

  const formatDuration = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-loom-muted text-xs">
        Carregando vídeos...
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-y-auto space-y-3">
      {recordings.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-loom-muted space-y-2 text-center p-4">
          <Film className="w-10 h-10 text-loom-border stroke-[1.5]" />
          <p className="text-xs font-semibold text-white/80">Nenhuma gravação encontrada</p>
          <p className="text-[11px] max-w-[240px] text-loom-muted">
            Grave seu primeiro vídeo para vê-lo aqui na sua biblioteca local.
          </p>
        </div>
      ) : (
        recordings.map((rec) => (
          <div
            key={rec.id}
            className="bg-loom-card border border-loom-border hover:border-loom-primary/40 rounded-xl p-3 flex items-center justify-between transition-all group shadow-sm"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-loom-panel border border-loom-border flex items-center justify-center shrink-0">
                <Film className="w-5 h-5 text-loom-primary" />
              </div>

              <div className="min-w-0">
                <h3 className="text-xs font-bold text-white truncate max-w-[200px]" title={rec.title}>
                  {rec.title}
                </h3>
                <div className="flex items-center space-x-2 text-[10px] text-loom-muted mt-0.5">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDuration(rec.durationMs)}</span>
                  </span>
                  <span>•</span>
                  <span>{formatSize(rec.fileSize)}</span>
                  <span>•</span>
                  <span>{rec.resolution}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {/* Copy share link */}
              <button
                onClick={async () => {
                  const url = rec.shareUrl || await window.electronAPI.getShareUrl(rec.id);
                  navigator.clipboard.writeText(url);
                  alert('Link de compartilhamento copiado!');
                }}
                title="Copiar Link Compartilhável"
                className="p-1.5 rounded-lg text-loom-primary hover:bg-loom-primary/20 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>

              {/* Download video */}
              <button
                onClick={() => window.electronAPI.downloadRecording(rec.id)}
                title="Baixar Vídeo no Computador"
                className="p-1.5 rounded-lg text-loom-accent hover:bg-loom-hover transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {/* Open in web browser */}
              <button
                onClick={async () => {
                  const url = await window.electronAPI.getShareUrl(rec.id);
                  window.electronAPI.openExternalUrl(url);
                }}
                title="Assistir no Navegador"
                className="p-1.5 rounded-lg text-loom-secondary hover:bg-loom-hover transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleOpenFolder(rec.filePath)}
                title="Abrir Pasta"
                className="p-1.5 rounded-lg text-loom-muted hover:text-white hover:bg-loom-hover transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleDelete(rec.id)}
                title="Excluir"
                className="p-1.5 rounded-lg text-loom-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
