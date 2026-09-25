import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, ChevronRight, RefreshCw, Check, ArrowLeft, ChevronUp } from 'lucide-react';
import { getFolderHandleForRevision, resolveEffectiveRootPath, verifyPermission } from '../../services/opportunityFolderLink';
import { listDirectory, listDirByPath, searchFiles } from '../opportunity-folder/fileOps';
import { getFileIcon } from '../opportunity-folder/icons';
import { FileItem } from '../opportunity-folder/types';

interface Props {
  opportunityId: string;
  /** The opportunity's current revision (e.g. "R0.1") — folders are linked per-revision, so this must match OpportunityFolderTab's lookup or the picker won't find the assigned folder. */
  revision?: string;
  onSelect: (fileKeys: string[]) => void;
  onClose: () => void;
  title?: string;
  multi?: boolean;
  /** Folder path to open into on load — e.g. the folder currently selected in the Folder tab, so attaching a file doesn't force a re-navigation from root. */
  initialPath?: string[];
}

export const DocumentPickerModal: React.FC<Props> = ({ opportunityId, revision, onSelect, onClose, title = "Select Document", multi = false, initialPath }) => {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [rootPath, setRootPath] = useState('');
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getFolderHandleForRevision(opportunityId, revision),
      resolveEffectiveRootPath(opportunityId, revision),
    ]).then(async ([handle, absolutePath]) => {
      if (cancelled) return;
      setRootPath(absolutePath || '');
      if (handle && await verifyPermission(handle, false)) {
        let h = handle;
        let initial = initialPath || [];
        if (initial.length > 0) {
          try {
            for (const seg of initial) h = await h.getDirectoryHandle(seg);
          } catch {
            h = handle;
            initial = [];
          }
        }
        if (!cancelled) {
          setRootHandle(handle);
          setCurrentHandle(h);
          setPath(initial);
        }
      } else if (!cancelled) {
        // A saved absolute path is enough for read-only browsing through the
        // helper. This keeps Files usable after the browser revokes its handle.
        setRootHandle(null);
        setCurrentHandle(null);
        setPath(initialPath || []);
        if (!absolutePath) {
          setLoadError('No folder path is linked to this revision yet.');
        }
      }
    }).catch((error) => {
      if (!cancelled) setLoadError(error?.message || 'Could not load the linked folder.');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, revision]);

  const load = useCallback(async () => {
    if (!currentHandle && !rootPath) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = currentHandle
        ? await listDirectory(currentHandle, path)
        : (await listDirByPath(rootPath, path)).map((entry): FileItem => ({
            name: entry.name,
            kind: entry.kind,
            pathOnly: true,
            extension: entry.kind === 'file' ? entry.name.split('.').pop()?.toLowerCase() : undefined,
            size: entry.size,
            lastModified: entry.mtime,
            relativePath: [...path, entry.name],
          }));
      setItems(data);
    } catch (error: any) {
      setItems([]);
      setLoadError(error?.message || 'Could not load this folder.');
    } finally {
      setLoading(false);
    }
  }, [currentHandle, path, rootPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!rootHandle || !search.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let stopped = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const found: FileItem[] = [];
      try {
        await searchFiles(rootHandle, search.trim(), item => {
          if (item.kind === 'file') found.push(item);
        }, () => stopped);
        if (!stopped) setSearchResults(found);
      } catch (error: any) {
        // A revoked permission or a folder removed mid-search: show it instead of an endless empty list.
        if (!stopped) setLoadError(error?.message || 'Search failed.');
      } finally {
        if (!stopped) setSearching(false);
      }
    }, 180);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [rootHandle, search]);

  const handleNavigate = (item: FileItem) => {
    if (item.kind === 'directory') {
      setCurrentHandle((item.handle as FileSystemDirectoryHandle | undefined) || null);
      setPath(item.relativePath);
    } else {
      const key = item.relativePath.join('/');
      if (multi) {
        setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
      } else {
        setSelectedKeys([key]);
      }
    }
  };

  const handleBack = async () => {
    if (path.length === 0) return;
    const newPath = path.slice(0, -1);
    if (rootHandle) {
      let h = rootHandle;
      for (const seg of newPath) h = await h.getDirectoryHandle(seg);
      setCurrentHandle(h);
    } else {
      setCurrentHandle(null);
    }
    setPath(newPath);
  };

  const handleJumpToPath = async (idx: number) => {
    const newPath = path.slice(0, idx + 1);
    if (rootHandle) {
      let h = rootHandle;
      for (const seg of newPath) h = await h.getDirectoryHandle(seg);
      setCurrentHandle(h);
    } else {
      setCurrentHandle(null);
    }
    setPath(newPath);
  };

  const displayedItems = search.trim() ? searchResults : items;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl h-[75vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-3 border-b border-gray-100 flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shadow-inner">
            <button 
              onClick={handleBack}
              disabled={path.length === 0}
              className="p-1.5 hover:bg-white rounded disabled:opacity-30 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={handleBack}
              disabled={path.length === 0}
              className="p-1.5 hover:bg-white rounded disabled:opacity-30 transition-all"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              disabled={!rootHandle}
              placeholder={rootHandle ? 'Search files...' : 'Browse by folder (search needs folder permission)'}
              className="w-full pl-9 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm focus:ring-1 focus:ring-[#3DCD58]"
            />
          </div>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-50 flex items-center gap-1 text-xs text-gray-500 overflow-x-auto whitespace-nowrap bg-gray-50/30">
          <button 
            onClick={() => { setCurrentHandle(rootHandle); setPath([]); }}
            className="hover:text-[#3DCD58] font-bold transition-colors"
          >
            Root
          </button>
          {path.map((p, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
              <button 
                onClick={() => handleJumpToPath(i)}
                className="hover:text-[#3DCD58] transition-colors"
              >
                {p}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayedItems.map(item => {
            const key = item.relativePath.join('/');
            const isSelected = selectedKeys.includes(key);
            return (
              <div 
                key={key}
                onClick={() => handleNavigate(item)}
                className={`flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {getFileIcon(item.extension, item.kind === 'directory')}
                  <div className="min-w-0">
                    <div className={`truncate text-sm ${item.kind === 'directory' ? 'font-bold' : 'font-medium'} text-gray-700`}>{item.name}</div>
                    {search.trim() && <div className="truncate text-[10px] text-gray-400">{item.relativePath.slice(0, -1).join('/') || 'Root'}</div>}
                  </div>
                </div>
                {item.kind === 'file' && (
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300'}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                )}
              </div>
            );
          })}
          {displayedItems.length === 0 && !loading && !searching && (
             <div className="p-10 text-center text-gray-400 italic">No files found.</div>
          )}
          {loadError && <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{loadError}</div>}
          {searching && <div className="p-10 text-center text-sm font-medium text-gray-400">Searching the entire opportunity folder…</div>}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{selectedKeys.length} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>
            <button 
              disabled={selectedKeys.length === 0}
              onClick={() => onSelect(selectedKeys)} 
              className="px-8 py-2 bg-[#3DCD58] hover:bg-[#2db64a] text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all active:scale-95"
            >
              Link Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
