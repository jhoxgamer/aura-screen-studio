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
  Check,
  Edit3,
  X,
  Copy
} from 'lucide-react';
import { RecordingMeta } from '../types';
import { formatRelativeDate, sortRecordings, LibrarySortCriteria } from '../utils/formatters';

export interface LibraryViewProps {
  onNavigateToRecord?: () => void;
  isStandalone?: boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onNavigateToRecord, isStandalone = false }) => {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCriteria, setSortCriteria] = useState<LibrarySortCriteria>('newest');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');

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
    try {
      await window.electronAPI.deleteRecording(id);
      setConfirmDeleteId(null);
      loadList();
    } catch (err) {
      console.error('Failed to delete recording:', err);
    }
  };

  const handleOpenFolder = (filePath: string) => {
    window.electronAPI.openFileFolder(filePath);
  };

  const handleSaveRename = async (id: string) => {
    const trimmed = editedTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      if (window.electronAPI?.updateTitle) {
        await window.electronAPI.updateTitle(id, trimmed);
        setRecordings((prev) =>
          prev.map((r) => (r.id === id ? { ...r, title: trimmed } : r))
        );
      }
    } catch (err) {
      console.error('Failed to update title:', err);
    } finally {
      setEditingId(null);
    }
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
  const sortedAndFiltered = sortRecordings(filtered, sortCriteria);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#929CAF] text-xs">
        <div className="w-5 h-5 rounded-full border-2 border-[#78A5FF] border-t-transparent animate-spin mr-2" />
        <span>Carregando biblioteca Aura...</span>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col ${isStandalone ? 'w-full h-full min-h-screen bg-[#0B0E14]' : ''} p-4 overflow-hidden space-y-3 font-sans`}>
      {isStandalone && (
        <div className="h-10 bg-[#121722] -mx-4 -mt-4 px-4 flex items-center justify-between border-b border-[#303A4B] mb-2" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="flex items-center space-x-2">
            <Film className="w-4 h-4 text-[#78A5FF]" />
            <h1 className="text-xs font-bold text-[#F3F5F9]">Aura Screen Studio — Biblioteca de Vídeos</h1>
          </div>
          <button
            onClick={() => window.electronAPI?.closeCurrentWindow?.()}
            className="p-1 hover:bg-[#B83A48]/20 hover:text-[#FF647C] rounded text-[#929CAF] transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className="space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-[#929CAF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('');
            }}
            placeholder="Buscar gravações por título..."
            className="w-full bg-[#121722] border border-[#303A4B] rounded-xl pl-9 pr-8 py-2 text-xs text-[#F3F5F9] placeholder-[#929CAF] focus:outline-none focus:border-[#78A5FF] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Limpar busca (Esc)"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#929CAF] hover:text-[#F3F5F9] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#B7C0CE] px-0.5 gap-2 flex-nowrap overflow-x-auto scrollbar-none">
          <div className="flex items-center space-x-1 shrink-0">
            <span className="text-[#929CAF] text-[10px] uppercase font-bold tracking-wider mr-0.5">Ordem:</span>
            {(
              [
                { id: 'newest', label: 'Recentes' },
                { id: 'duration', label: 'Duração' },
                { id: 'size', label: 'Tamanho' },
                { id: 'oldest', label: 'Antigos' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setSortCriteria(item.id)}
                className={`px-1.5 py-0.5 rounded-lg text-[10px] font-medium transition-all ${
                  sortCriteria === item.id
                    ? 'bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/40'
                    : 'text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 text-[10px] text-[#B7C0CE]">
            <span>
              {searchQuery ? (
                <>
                  <span className="font-semibold text-[#F3F5F9]">{sortedAndFiltered.length}</span> de {recordings.length} vídeos
                </>
              ) : (
                `${recordings.length} ${recordings.length === 1 ? 'vídeo gravado' : 'vídeos gravados'}`
              )}
            </span>
            <span>•</span>
            <span className="font-mono text-[#78A5FF] font-medium">{formatSize(totalBytes)} em disco</span>
          </div>
        </div>
      </div>

      {/* Videos List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1" role="region" aria-label="Lista de Gravações">
        {sortedAndFiltered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-[#929CAF] space-y-2 text-center p-4">
            <Film className="w-10 h-10 text-[#303A4B] stroke-[1.5]" />
            <p className="text-xs font-semibold text-[#F3F5F9]">
              {searchQuery ? 'Nenhum vídeo com esse nome' : 'Nenhuma gravação encontrada'}
            </p>
            <p className="text-[11px] max-w-[260px] text-[#929CAF]">
              {searchQuery ? 'Tente buscar com outras palavras-chave ou limpe o filtro.' : 'Suas gravações salvas aparecerão aqui com acesso direto ao player e ao estúdio de corte.'}
            </p>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3 py-1 bg-[#1A2A47] hover:bg-[#1A2A47]/80 border border-[#78A5FF]/30 text-[#78A5FF] text-xs rounded-lg transition-colors font-medium"
              >
                Limpar Busca
              </button>
            ) : (
              <button
                onClick={() => {
                  if (onNavigateToRecord) {
                    onNavigateToRecord();
                  } else if (window.electronAPI?.openPreRecording) {
                    window.electronAPI.openPreRecording('record');
                  }
                }}
                className="mt-2 px-3.5 py-1.5 bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] text-xs rounded-xl font-bold transition-all shadow-md flex items-center space-x-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Nova Gravação</span>
              </button>
            )}
          </div>
        ) : (
          sortedAndFiltered.map((rec) => (
            <div
              key={rec.id}
              tabIndex={0}
              role="button"
              aria-label={`Assistir gravação ${rec.title}`}
              onClick={() => window.electronAPI.openPreview(rec)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  window.electronAPI.openPreview(rec);
                }
              }}
              className="bg-[#121722] border border-[#303A4B] hover:border-[#78A5FF]/50 rounded-xl p-3 flex items-center justify-between transition-all group shadow-sm cursor-pointer hover:bg-[#191F2B] focus:outline-none focus:ring-1 focus:ring-[#78A5FF]"
              title="Clique para assistir e editar este vídeo no Studio (Enter)"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#191F2B] border border-[#303A4B] flex items-center justify-center shrink-0 group-hover:border-[#78A5FF]/60 group-hover:bg-[#78A5FF] transition-colors">
                  <Play className="w-4 h-4 text-[#78A5FF] group-hover:text-[#101A32] fill-current transition-colors ml-0.5" />
                </div>

                <div className="min-w-0 flex-1">
                  {editingId === rec.id ? (
                    <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(rec.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="bg-[#0B0E14] border border-[#78A5FF]/60 rounded px-2 py-0.5 text-xs text-[#F3F5F9] focus:outline-none focus:ring-1 focus:ring-[#78A5FF] w-36 sm:w-48"
                      />
                      <button
                        onClick={() => handleSaveRename(rec.id)}
                        className="p-1 rounded bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32]"
                        title="Salvar nome"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded bg-[#191F2B] hover:bg-[#222B39] text-[#B7C0CE]"
                        title="Cancelar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5 group/title">
                      <h3 className="text-xs font-semibold text-[#F3F5F9] truncate max-w-[150px] sm:max-w-xs md:max-w-md group-hover:text-[#78A5FF] transition-colors" title={rec.title}>
                        {rec.title}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(rec.id);
                          setEditedTitle(rec.title);
                        }}
                        className="opacity-0 group-hover/title:opacity-100 p-0.5 text-[#929CAF] hover:text-[#78A5FF] transition-opacity"
                        title="Renomear gravação"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center space-x-2 text-[10px] text-[#929CAF] mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-[#929CAF]" />
                      <span>{formatDuration(rec.durationMs)}</span>
                    </span>
                    <span>•</span>
                    <span>{formatSize(rec.fileSize)}</span>
                    <span>•</span>
                    <span className="font-mono text-[#B7C0CE]">{rec.resolution || '1080p'}</span>
                    {rec.createdAt && (
                      <>
                        <span>•</span>
                        <span className="flex items-center space-x-1 text-[#929CAF]" title={new Date(rec.createdAt).toLocaleString()}>
                          <Calendar className="w-2.5 h-2.5 text-[#929CAF]" />
                          <span>{formatRelativeDate(rec.createdAt)}</span>
                        </span>
                      </>
                    )}
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
                  className="p-1.5 rounded-lg text-[#78A5FF] hover:bg-[#1A2A47] transition-colors"
                >
                  {copiedId === rec.id ? <Check className="w-3.5 h-3.5 text-[#83B8FF]" /> : <Share2 className="w-3.5 h-3.5" />}
                </button>

                {/* Download video */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI.downloadRecording(rec.id);
                  }}
                  title="Baixar Vídeo no Computador"
                  className="p-1.5 rounded-lg text-[#83B8FF] hover:bg-[#83B8FF]/10 transition-colors"
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
                  className="p-1.5 rounded-lg text-[#78A5FF] hover:bg-[#1A2A47] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                {/* Copy local file path */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(rec.filePath);
                    setCopiedPathId(rec.id);
                    setTimeout(() => setCopiedPathId(null), 2000);
                  }}
                  title="Copiar Caminho do Arquivo (C:\...)"
                  className="p-1.5 rounded-lg text-[#929CAF] hover:text-[#78A5FF] hover:bg-[#191F2B] transition-colors"
                >
                  {copiedPathId === rec.id ? (
                    <Check className="w-3.5 h-3.5 text-[#83B8FF]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Open folder */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenFolder(rec.filePath);
                  }}
                  title="Abrir Pasta no Windows Explorer"
                  className="p-1.5 rounded-lg text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B] transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>

                {/* Delete with inline confirmation */}
                {confirmDeleteId === rec.id ? (
                  <div className="flex items-center space-x-1 bg-[#FF647C]/20 border border-[#FF647C]/40 rounded-lg px-1.5 py-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(rec.id)}
                      title="Confirmar exclusão definitiva"
                      className="text-[10px] text-white font-bold px-1.5 py-0.5 bg-[#B83A48] hover:bg-[#A83240] rounded transition-colors"
                    >
                      Excluir
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      title="Cancelar"
                      className="text-[10px] text-[#B7C0CE] hover:text-[#F3F5F9] px-1 py-0.5 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(rec.id);
                    }}
                    title="Excluir Gravação"
                    className="p-1.5 rounded-lg text-[#929CAF] hover:text-[#FF647C] hover:bg-[#FF647C]/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
