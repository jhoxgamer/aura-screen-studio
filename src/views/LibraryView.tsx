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

export const LibraryView: React.FC = () => {
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
      <div className="flex-1 flex items-center justify-center text-[#92A2AE] text-xs">
        <div className="w-5 h-5 rounded-full border-2 border-[#3AD6C6] border-t-transparent animate-spin mr-2" />
        <span>Carregando biblioteca Aura...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3 font-sans">
      {/* Search & Stats Bar */}
      <div className="space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-[#92A2AE] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('');
            }}
            placeholder="Buscar gravações por título..."
            className="w-full bg-[#111A22] border border-[#31414D] rounded-xl pl-9 pr-8 py-2 text-xs text-[#F4F7FA] placeholder-[#92A2AE] focus:outline-none focus:border-[#3AD6C6] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Limpar busca (Esc)"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#92A2AE] hover:text-[#F4F7FA] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#C0CDD6] px-1 gap-2 flex-wrap">
          <div className="flex items-center space-x-1">
            <span className="text-[#92A2AE] text-[10px] uppercase font-bold tracking-wider mr-0.5">Ordenar:</span>
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
                className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all ${
                  sortCriteria === item.id
                    ? 'bg-[#12312F] text-[#3AD6C6] border border-[#3AD6C6]/40'
                    : 'text-[#92A2AE] hover:text-[#F4F7FA] hover:bg-[#18242E]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 text-[10px] text-[#C0CDD6]">
            <span>
              {searchQuery ? (
                <>
                  <span className="font-semibold text-[#F4F7FA]">{sortedAndFiltered.length}</span> de {recordings.length} vídeos
                </>
              ) : (
                `${recordings.length} ${recordings.length === 1 ? 'vídeo gravado' : 'vídeos gravados'}`
              )}
            </span>
            <span>•</span>
            <span className="font-mono text-[#3AD6C6] font-medium">{formatSize(totalBytes)} em disco</span>
          </div>
        </div>
      </div>

      {/* Videos List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {sortedAndFiltered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-[#92A2AE] space-y-2 text-center p-4">
            <Film className="w-10 h-10 text-[#31414D] stroke-[1.5]" />
            <p className="text-xs font-semibold text-[#F4F7FA]">
              {searchQuery ? 'Nenhum vídeo com esse nome' : 'Nenhuma gravação encontrada'}
            </p>
            <p className="text-[11px] max-w-[240px] text-[#92A2AE]">
              {searchQuery ? 'Tente buscar com outras palavras-chave.' : 'Inicie sua primeira gravação na aba "Nova Gravação".'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3 py-1 bg-[#12312F] hover:bg-[#12312F]/80 border border-[#3AD6C6]/30 text-[#3AD6C6] text-xs rounded-lg transition-colors font-medium"
              >
                Limpar Busca
              </button>
            )}
          </div>
        ) : (
          sortedAndFiltered.map((rec) => (
            <div
              key={rec.id}
              onClick={() => window.electronAPI.openPreview(rec)}
              className="bg-[#111A22] border border-[#31414D] hover:border-[#3AD6C6]/50 rounded-xl p-3 flex items-center justify-between transition-all group shadow-sm cursor-pointer hover:bg-[#18242E]"
              title="Clique para assistir e editar este vídeo no Studio"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#18242E] border border-[#31414D] flex items-center justify-center shrink-0 group-hover:border-[#3AD6C6]/60 group-hover:bg-[#3AD6C6] transition-colors">
                  <Play className="w-4 h-4 text-[#3AD6C6] group-hover:text-[#062B2A] fill-current transition-colors ml-0.5" />
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
                        className="bg-[#0B1117] border border-[#3AD6C6]/60 rounded px-2 py-0.5 text-xs text-[#F4F7FA] focus:outline-none focus:ring-1 focus:ring-[#3AD6C6] w-48"
                      />
                      <button
                        onClick={() => handleSaveRename(rec.id)}
                        className="p-1 rounded bg-[#3AD6C6] hover:bg-[#65E6D8] text-[#062B2A]"
                        title="Salvar nome"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded bg-[#18242E] hover:bg-[#202E39] text-[#C0CDD6]"
                        title="Cancelar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5 group/title">
                      <h3 className="text-xs font-semibold text-[#F4F7FA] truncate max-w-[190px] group-hover:text-[#3AD6C6] transition-colors" title={rec.title}>
                        {rec.title}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(rec.id);
                          setEditedTitle(rec.title);
                        }}
                        className="opacity-0 group-hover/title:opacity-100 p-0.5 text-[#92A2AE] hover:text-[#3AD6C6] transition-opacity"
                        title="Renomear gravação"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center space-x-2 text-[10px] text-[#92A2AE] mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-[#92A2AE]" />
                      <span>{formatDuration(rec.durationMs)}</span>
                    </span>
                    <span>•</span>
                    <span>{formatSize(rec.fileSize)}</span>
                    <span>•</span>
                    <span className="font-mono text-[#C0CDD6]">{rec.resolution || '1080p'}</span>
                    {rec.createdAt && (
                      <>
                        <span>•</span>
                        <span className="flex items-center space-x-1 text-[#92A2AE]" title={new Date(rec.createdAt).toLocaleString()}>
                          <Calendar className="w-2.5 h-2.5 text-[#92A2AE]" />
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
                  className="p-1.5 rounded-lg text-[#3AD6C6] hover:bg-[#12312F] transition-colors"
                >
                  {copiedId === rec.id ? <Check className="w-3.5 h-3.5 text-[#4CD6A0]" /> : <Share2 className="w-3.5 h-3.5" />}
                </button>

                {/* Download video */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI.downloadRecording(rec.id);
                  }}
                  title="Baixar Vídeo no Computador"
                  className="p-1.5 rounded-lg text-[#4CD6A0] hover:bg-[#4CD6A0]/10 transition-colors"
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
                  className="p-1.5 rounded-lg text-[#3AD6C6] hover:bg-[#12312F] transition-colors"
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
                  className="p-1.5 rounded-lg text-[#92A2AE] hover:text-[#3AD6C6] hover:bg-[#18242E] transition-colors"
                >
                  {copiedPathId === rec.id ? (
                    <Check className="w-3.5 h-3.5 text-[#4CD6A0]" />
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
                  className="p-1.5 rounded-lg text-[#92A2AE] hover:text-[#F4F7FA] hover:bg-[#18242E] transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>

                {/* Delete with inline confirmation */}
                {confirmDeleteId === rec.id ? (
                  <div className="flex items-center space-x-1 bg-[#FF5F6D]/20 border border-[#FF5F6D]/40 rounded-lg px-1.5 py-0.5" onClick={(e) => e.stopPropagation()}>
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
                      className="text-[10px] text-[#C0CDD6] hover:text-[#F4F7FA] px-1 py-0.5 transition-colors"
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
                    className="p-1.5 rounded-lg text-[#92A2AE] hover:text-[#FF5F6D] hover:bg-[#FF5F6D]/10 transition-colors"
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
