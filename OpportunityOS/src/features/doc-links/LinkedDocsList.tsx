
import React, { useEffect, useState, useCallback } from 'react';
import { FileText, X, RefreshCw, Copy, Check, FolderSearch, Eye, AlertTriangle } from 'lucide-react';
import { listLinkedForTask, listLinkedForNote, saveMeta, DocMeta } from '../../services/opportunityDocMetaStore';
import { resolveEffectiveRootPath } from '../../services/opportunityFolderLink';
import { openInNativeApp } from '../opportunity-folder/fileOps';

interface Props {
  opportunityId: string;
  /** The opportunity's current revision — folders are linked per-revision, needed to resolve the right root path. */
  revision?: string;
  taskId?: string;
  noteId?: string;
  onNavigateToFile?: (fileKey: string) => void;
  onCountChange?: (taskId: string, count: number) => void;
}

export const LinkedDocsList: React.FC<Props> = ({ opportunityId, revision, taskId, noteId, onNavigateToFile, onCountChange }) => {
  const [links, setLinks] = useState<{ fileKey: string; meta: DocMeta }[]>([]);
  const [loading, setLoading] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const [copying, setCopying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Resolves through the shared DB too, so a browser that never linked the folder
      // itself can still open the documents.
      const rp = await resolveEffectiveRootPath(opportunityId, revision);
      setRootPath(rp);
      const data = taskId
        ? await listLinkedForTask(opportunityId, taskId)
        : noteId
          ? await listLinkedForNote(opportunityId, noteId)
          : [];
      setLinks(data);
      // Reported for notes as well, so the note editor can show a count on its
      // collapsed "Linked items" bar without mounting a second loader.
      if (taskId || noteId) onCountChange?.((taskId || noteId)!, data.length);
    } catch (err) {
      console.error("Failed to load linked docs", err);
    } finally {
      setLoading(false);
    }
  }, [opportunityId, revision, taskId, noteId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Detach the document from this task/note. This is the ONLY way an attachment
   * disappears from the app — a file vanishing from disk never removes it, so a
   * document that comes back keeps every link the user made.
   */
  const handleUnlink = async (fileKey: string) => {
    const link = links.find(l => l.fileKey === fileKey);
    if (link?.meta.missingSince && !window.confirm(
      'Remove this attachment record?\n\n' +
      'The file is currently missing from the folder. If it is only renamed or moved, ' +
      'it will be picked up again automatically and keep its links — removing the record here is permanent.'
    )) return;

    const meta = taskId
      ? { linkedTaskIds: (link?.meta.linkedTaskIds ?? []).filter(id => id !== taskId) }
      : { linkedNoteIds: (link?.meta.linkedNoteIds ?? []).filter(id => id !== noteId) };

    await saveMeta(opportunityId, fileKey, meta);
    load();
  };

  const handleOpen = async (fileKey: string) => {
    const link = links.find(l => l.fileKey === fileKey);
    if (link?.meta.missingSince) {
      alert(
        `"${fileKey.split('/').pop()}" was deleted (or moved out of the opportunity folder) on ` +
        `${new Date(link.meta.missingSince).toLocaleString()}.\n\n` +
        'The attachment is kept here on purpose: put a file back with this name and it will ' +
        'open again with all its links intact.'
      );
      return;
    }
    if (!rootPath) {
      alert('Set the opportunity folder base path in the Folder tab first.');
      return;
    }
    try {
      await openInNativeApp(rootPath, fileKey.split('/'));
    } catch (err: any) {
      alert(err?.message || 'Could not open the file.');
    }
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
    <div className="min-w-0 max-w-full space-y-2 mt-4 pt-4 border-t border-gray-100 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Linked Documents</h5>
        {loading && <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />}
      </div>
      <div className="flex max-w-full flex-wrap gap-2">
        {links.map((link) => {
          const missing = !!link.meta.missingSince;
          return (
          <div key={link.fileKey} className={`flex min-w-0 max-w-full items-center gap-2 border rounded-lg px-2.5 py-1.5 group transition-all ${missing ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-gray-200 hover:border-[#3DCD58] hover:shadow-sm'}`}>
            {missing
              ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              : <FileText className="w-3.5 h-3.5 shrink-0 text-gray-400 group-hover:text-[#3DCD58]" />}
            <button
              onClick={() => handleOpen(link.fileKey)}
              className={`min-w-0 flex-1 text-left text-xs font-bold truncate transition-colors ${missing ? 'text-amber-700 line-through decoration-amber-400' : 'text-gray-700 hover:text-[#3DCD58]'}`}
              title={missing
                ? `File deleted or moved on ${new Date(link.meta.missingSince as string).toLocaleString()} — the attachment is kept, and restoring the file re-links it automatically.`
                : 'Open'}
            >
              {link.fileKey.split('/').pop()}
            </button>
            {missing && (
              <span className="shrink-0 text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 border border-amber-200 rounded uppercase tracking-tighter">
                Deleted
              </span>
            )}
            {link.meta.docType && (
              <span className="shrink-0 text-[9px] font-black bg-gray-50 text-gray-400 px-1.5 py-0.5 border border-gray-100 rounded uppercase tracking-tighter">
                {link.meta.docType === 'Editable' ? 'Editable' : link.meta.docType}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1 border-l border-gray-100 ml-1 pl-1">
              <button
                onClick={() => handleOpen(link.fileKey)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Open"
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
                title="Remove this attachment (the file on disk is not touched)"
              >
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
