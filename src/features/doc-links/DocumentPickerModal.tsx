import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Folder, File, ChevronRight, HardDrive, RefreshCw, Check, ArrowLeft, ChevronUp } from 'lucide-react';
import { getFolderHandleForRevision, verifyPermission } from '../../services/opportunityFolderLink';
import { listDirectory } from '../opportunity-folder/fileOps';
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
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getFolderHandleForRevision(opportunityId, revision).then(async (handle) => {
      if (handle && await verifyPermission(handle, false)) {
        setRootHandle(handle);
        if (initialPath && initialPath.length > 0) {
          try {
            let h = handle;
            for (const seg of initialPath) {
              h = await h.getDirectoryHandle(seg);
            }
            setCurrentHandle(h);
            setPath(initialPath);
            return;
          } catch {
            // Folder may have moved/been renamed — fall back to root below.
          }
        }
        setCurrentHandle(handle);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, revision]);

  const load = useCallback(async () => {
    if (!currentHandle) return;
    setLoading(true);
    const data = await listDirectory(currentHandle, path);
    setItems(data);
    setLoading(false);
  }, [currentHandle, path]);

  useEffect(() => {
    load();
  }, [load]);

  const handleNavigate = (item: FileItem) => {
    if (item.kind === 'directory') {
      setCurrentHandle(item.handle as FileSystemDirectoryHandle);
      setPath([...path, item.name]);
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
    if (path.length === 0 || !rootHandle) return;
    let h = rootHandle;
    const newPath = path.slice(0, -1);
    for (const seg of newPath) {
      h = await h.getDirectoryHandle(seg);
    }
    setCurrentHandle(h);
    setPath(newPath);
  };

  const handleJumpToPath = async (idx: number) => {
    if (!rootHandle) return;
    const newPath = path.slice(0, idx + 1);
    let h = rootHandle;
    for (const seg of newPath) {
      h = await h.getDirectoryHandle(seg);
    }
    setCurrentHandle(h);
    setPath(newPath);
  };

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
              placeholder="Search files..."
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
          {filteredItems.map(item => {
            const key = item.relativePath.join('/');
            const isSelected = selectedKeys.includes(key);
            return (
              <div 
                key={item.name}
                onClick={() => handleNavigate(item)}
                className={`flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {getFileIcon(item.extension, item.kind === 'directory')}
                  <span className={`text-sm ${item.kind === 'directory' ? 'font-bold' : 'font-medium'} text-gray-700 truncate max-w-sm`}>{item.name}</span>
                </div>
                {item.kind === 'file' && (
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300'}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                )}
              </div>
            );
          })}
          {filteredItems.length === 0 && !loading && (
             <div className="p-10 text-center text-gray-400 italic">No files found.</div>
          )}
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