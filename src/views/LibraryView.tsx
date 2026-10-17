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
  Download,
  Search,
  Check
} from 'lucide-react';
import { RecordingMeta } from '../types';

export const LibraryView: React.FC = () => {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const totalBytes = recordings.reduce((acc, r) => acc + (r.fileSize || 0), 0);
  const filtered = recordings.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
        <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin mr-2" />
        <span>Carregando biblioteca Aura...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3 font-sans">
      {/* Search & Stats Bar */}
      <div className="space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar gravações por título..."
            className="w-full bg-[#131620] border border-[#222838] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>{recordings.length} {recordings.length === 1 ? 'vídeo gravado' : 'vídeos gravados'}</span>
          <span className="font-mono text-indigo-300 font-medium">{formatSize(totalBytes)} em disco</span>
        </div>
      </div>

      {/* Videos List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-2 text-center p-4">
            <Film className="w-10 h-10 text-slate-700 stroke-[1.5]" />
            <p className="text-xs font-semibold text-slate-300">
              {searchQuery ? 'Nenhum vídeo com esse nome' : 'Nenhuma gravação encontrada'}
            </p>
            <p className="text-[11px] max-w-[240px] text-slate-500">
              {searchQuery ? 'Tente buscar com outras palavras-chave.' : 'Inicie sua primeira gravação na aba "Nova Gravação".'}
            </p>
          </div>
        ) : (
          filtered.map((rec) => (
            <div
              key={rec.id}
              onClick={() => window.electronAPI.openPreview(rec)}
              className="bg-[#131620] border border-[#222838] hover:border-indigo-500/40 rounded-xl p-3 flex items-center justify-between transition-all group shadow-sm cursor-pointer hover:bg-[#161a26]"
              title="Clique para assistir e editar este vídeo no Studio"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#191e2b] border border-[#283044] flex items-center justify-center shrink-0 group-hover:border-indigo-500/50 group-hover:bg-indigo-600 transition-colors">
                  <Play className="w-4 h-4 text-indigo-400 group-hover:text-white fill-current transition-colors ml-0.5" />
                </div>

                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-white truncate max-w-[190px] group-hover:text-indigo-200 transition-colors" title={rec.title}>
                    {rec.title}
                  </h3>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formatDuration(rec.durationMs)}</span>
                    </span>
                    <span>•</span>
                    <span>{formatSize(rec.fileSize)}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-500">{rec.resolution || '1080p'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {/* Copy share link */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const url = rec.shareUrl || await window.electronAPI.getShareUrl(rec.id);
                    navigator.clipboard.writeText(url);
                    setCopiedId(rec.id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  title="Copiar Link Compartilhável"
                  className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/15 transition-colors"
                >
                  {copiedId === rec.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                </button>

                {/* Download video */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI.downloadRecording(rec.id);
                  }}
                  title="Baixar Vídeo no Computador"
                  className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>

                {/* Open in web browser */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const url = await window.electronAPI.getShareUrl(rec.id);
                    window.electronAPI.openExternalUrl(url);
                  }}
                  title="Assistir no Navegador"
                  className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                {/* Open folder */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenFolder(rec.filePath);
                  }}
                  title="Abrir Pasta no Windows Explorer"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(rec.id);
                  }}
                  title="Excluir Gravação"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
