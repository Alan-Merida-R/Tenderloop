
import React, { useEffect, useState, useCallback } from 'react';
import { FileText, X, ExternalLink, RefreshCw, Copy, Check, FolderSearch, Eye } from 'lucide-react';
import { listLinkedForTask, listLinkedForNote, saveMeta, DocMeta } from '../../services/opportunityDocMetaStore';
import { getRootPathDisplay } from '../../services/opportunityFolderLink';

interface Props {
  opportunityId: string;
  taskId?: string;
  noteId?: string;
  onNavigateToFile?: (fileKey: string) => void;
  onPreview?: (fileKey: string) => void;
}

export const LinkedDocsList: React.FC<Props> = ({ opportunityId, taskId, noteId, onNavigateToFile, onPreview }) => {
  const [links, setLinks] = useState<{ fileKey: string; meta: DocMeta }[]>([]);
  const [loading, setLoading] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const [copying, setCopying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rp = await getRootPathDisplay(opportunityId);
      setRootPath(rp);
      const data = taskId 
        ? await listLinkedForTask(opportunityId, taskId)
        : noteId 
          ? await listLinkedForNote(opportunityId, noteId)
          : [];
      setLinks(data);
    } catch (err) {
      console.error("Failed to load linked docs", err);
    } finally {
      setLoading(false);
    }
  }, [opportunityId, taskId, noteId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnlink = async (fileKey: string) => {
    const meta = taskId 
      ? { linkedTaskIds: (links.find(l => l.fileKey === fileKey)?.meta.linkedTaskIds ?? []).filter(id => id !== taskId) }
      : { linkedNoteIds: (links.find(l => l.fileKey === fileKey)?.meta.linkedNoteIds ?? []).filter(id => id !== noteId) };
    
    await saveMeta(opportunityId, fileKey, meta);
    load();
  };

  const handleCopyPath = (fileKey: string) => {
    const p = fileKey.replace(/\//g, '\\');
    const text = rootPath ? `${rootPath}\\${p}` : p;
    navigator.clipboard.writeText(text);
    setCopying(fileKey);
    setTimeout(() => setCopying(null), 2000);
  };

  if (links.length === 0 && !loading) return null;

  return (
    <div className="space-y-2 mt-4 pt-4 border-t border-gray-100 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Linked Documents</h5>
        {loading && <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />}
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <div key={link.fileKey} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 group hover:border-[#3DCD58] hover:shadow-sm transition-all">
            <FileText className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#3DCD58]" />
            <button 
              onClick={() => onPreview?.(link.fileKey)}
              className="text-xs font-bold text-gray-700 max-w-[180px] truncate hover:text-[#3DCD58] transition-colors flex items-center gap-1" 
              title="Preview"
            >
              {link.fileKey.split('/').pop()}
            </button>
            {link.meta.docType && (
              <span className="text-[9px] font-black bg-gray-50 text-gray-400 px-1.5 py-0.5 border border-gray-100 rounded uppercase tracking-tighter">
                {link.meta.docType === 'Editable' ? 'Editable' : link.meta.docType}
              </span>
            )}
            <div className="flex items-center gap-1 border-l border-gray-100 ml-1 pl-1">
              <button
                onClick={() => onPreview?.(link.fileKey)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Preview"
              >
                <Eye className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
              </button>
              <button 
                onClick={() => onNavigateToFile?.(link.fileKey)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Open in file browser"
              >
                <FolderSearch className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
              </button>
              <button 
                onClick={() => handleCopyPath(link.fileKey)} 
                className="p-1 hover:bg-emerald-50 rounded transition-colors" 
                title="Copy Full Path"
              >
                {copying === link.fileKey ? <Check className="w-3.5 h-3.5 text-[#3DCD58]" /> : <Copy className="w-3.5 h-3.5 text-gray-400 hover:text-[#3DCD58]" />}
              </button>
              <button 
                onClick={() => handleUnlink(link.fileKey)} 
                className="p-1 hover:bg-red-50 rounded transition-colors" 
                title="Unlink"
              >
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
