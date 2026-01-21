
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Upload, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ExternalLink,
  Info,
  AlertTriangle,
  MoreVertical,
  X,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Filter,
  Eye,
  FileText,
  Link as LinkIcon
} from 'lucide-react';
import { getFolderHandle, setFolderHandle, verifyPermission, clearFolderHandle, getRootPathDisplay, setRootPathDisplay } from '../../services/opportunityFolderLink';
import { listDirectory, createFolder, uploadFiles, deleteEntry, renameEntry, openFileNative } from './fileOps';
import { getFileIcon } from './icons';
import { FileItem } from './types';
import { DocTypeSelector } from '../doc-links/DocTypeSelector';
import { getMeta, saveMeta, DocMeta } from '../../services/opportunityDocMetaStore';
import { OfficePreview } from './preview/OfficePreview';
import { LinkedItemsPanel } from './LinkedItemsPanel';
import { Opportunity } from '../../types';

interface Props {
  opportunityId: string;
  opportunity: Opportunity;
  onUpdate: (updated: Opportunity) => void;
  initialFileKey?: string;
}

const CLASSIFICATIONS = ['Editable', 'Info', 'Approvals', 'Not important', 'Proposal'];
const EDITABLE_STATUSES = ['In progress', 'Pending information', 'In approval / review', 'Not started', 'Done'];

export const OpportunityFolderTab: React.FC<Props> = ({ opportunityId, opportunity, onUpdate, initialFileKey }) => {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [metas, setMetas] = useState<Record<string, DocMeta>>({});
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApiSupported, setIsApiSupported] = useState(true);
  const [rootPathInput, setRootPathInput] = useState('');
  const [rootPathDisplay, setRootPathDisplayVal] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showLinkedItems, setShowLinkedItems] = useState(false);
  const [filters, setFilters] = useState<string[]>([]);
  const [history, setHistory] = useState<{handle: FileSystemDirectoryHandle, path: string[]}[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) setIsApiSupported(false);
  }, []);

  const loadMetas = useCallback(async (fileItems: FileItem[]) => {
    const newMetas: Record<string, DocMeta> = {};
    for (const item of fileItems) {
      if (item.kind === 'file') {
        const key = item.relativePath.join('/');
        const meta = await getMeta(opportunityId, key);
        if (meta) newMetas[key] = meta;
      }
    }
    setMetas(newMetas);
  }, [opportunityId]);

  const loadCurrentDirectory = useCallback(async () => {
    if (!currentHandle) return;
    setIsLoading(true);
    try {
      const contents = await listDirectory(currentHandle, path);
      setItems(contents);
      await loadMetas(contents);
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [currentHandle, path, loadMetas]);

  useEffect(() => {
    const init = async () => {
      const handle = await getFolderHandle(opportunityId);
      const rp = await getRootPathDisplay(opportunityId);
      setRootPathDisplayVal(rp);
      if (handle && await verifyPermission(handle, true)) {
        setRootHandle(handle);
        setCurrentHandle(handle);
        setPath([]);
        setHistory([{ handle, path: [] }]);
        setHistoryIdx(0);
      }
    };
    init();
  }, [opportunityId]);

  useEffect(() => {
    loadCurrentDirectory();
  }, [loadCurrentDirectory]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && selectedItem && selectedItem.kind === 'file' && e.target === document.body) {
        e.preventDefault();
        setShowPreview(prev => !prev);
      }
      if (e.code === 'Escape') {
        if (showPreview) {
            setShowPreview(false);
            setIsPreviewExpanded(false);
        }
        setShowLinkedItems(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, showPreview]);

  // Object URL management
  useEffect(() => {
    const updatePreview = async () => {
      if (!showPreview || !selectedItem || selectedItem.kind === 'directory') return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewText(null);

      try {
        const file = await (selectedItem.handle as FileSystemFileHandle).getFile();
        const ext = selectedItem.extension || '';
        
        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf'].includes(ext)) {
          setPreviewUrl(URL.createObjectURL(file));
        } else if (['txt', 'csv', 'md', 'json', 'log'].includes(ext)) {
          const text = await file.text();
          setPreviewText(text.slice(0, 50000)); // Safety limit
        }
      } catch (err) {
        console.error("Preview fail", err);
      }
    };
    updatePreview();
  }, [showPreview, selectedItem]);

  const navigateTo = (handle: FileSystemDirectoryHandle, newPath: string[], isNew = true) => {
    setCurrentHandle(handle);
    setPath(newPath);
    setSelectedItem(null);
    if (isNew) {
      const newHist = history.slice(0, historyIdx + 1);
      newHist.push({ handle, path: newPath });
      setHistory(newHist);
      setHistoryIdx(newHist.length - 1);
    }
  };

  const handleGoBack = () => {
    if (historyIdx > 0) {
      const entry = history[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      setCurrentHandle(entry.handle);
      setPath(entry.path);
      setSelectedItem(null);
    }
  };

  const handleGoForward = () => {
    if (historyIdx < history.length - 1) {
      const entry = history[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      setCurrentHandle(entry.handle);
      setPath(entry.path);
      setSelectedItem(null);
    }
  };

  const handleGoUp = async () => {
    if (path.length === 0 || !rootHandle) return;
    let target = rootHandle;
    const newPath = path.slice(0, -1);
    for (const seg of newPath) {
      target = await target.getDirectoryHandle(seg);
    }
    navigateTo(target, newPath);
  };

  const handleBreadcrumbClick = async (idx: number) => {
    if (!rootHandle) return;
    let target = rootHandle;
    const newPath = path.slice(0, idx + 1);
    for (const seg of newPath) {
      target = await target.getDirectoryHandle(seg);
    }
    navigateTo(target, newPath);
  };

  const handleCopyPath = () => {
    if (!selectedItem) return;
    const rel = selectedItem.relativePath.join('\\');
    const text = `${rootPathDisplay}\\${rel}`;
    navigator.clipboard.writeText(text);
    setCopySuccess('full');
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleSaveRootPath = async () => {
    if (!rootPathInput.trim()) return;
    await setRootPathDisplay(opportunityId, rootPathInput.trim());
    setRootPathDisplayVal(rootPathInput.trim());
  };

  const updateMetaField = async (key: string, field: keyof DocMeta, value: any) => {
    await saveMeta(opportunityId, key, { [field]: value });
    await loadMetas(items);
  };

  const filteredItems = items.filter(item => {
    if (item.kind === 'directory') return true;
    if (filters.length === 0) return true;
    const key = item.relativePath.join('/');
    const meta = metas[key];
    return meta && filters.includes(meta.docType);
  });

  if (!isApiSupported) return <div className="p-10 text-center">FileSystem API not supported in this browser.</div>;

  if (!rootHandle) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <FolderOpen className="w-16 h-16 text-gray-200 mb-4" />
        <h3 className="text-xl font-bold">Link Opportunity Folder</h3>
        <p className="text-gray-500 mb-6 max-w-sm">Select a local directory to manage files. If this opportunity was imported, linking the original root will restore all document links.</p>
        <button onClick={async () => {
          try {
            // @ts-ignore
            const handle = await window.showDirectoryPicker();
            await setFolderHandle(opportunityId, handle);
            setRootHandle(handle);
            navigateTo(handle, [], true);
          } catch(e) {}
        }} className="bg-[#3DCD58] text-white px-6 py-2 rounded-lg font-bold">Select Folder</button>
      </div>
    );
  }

  const isFileSelected = selectedItem && selectedItem.kind === 'file';
  const selectedFileKey = selectedItem ? selectedItem.relativePath.join('/') : '';
  const selectedMeta = selectedItem ? metas[selectedFileKey] : null;

  return (
    <div className="flex h-full bg-white rounded-xl border border-gray-200 overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
              <button onClick={handleGoBack} disabled={historyIdx <= 0} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
              <button onClick={handleGoForward} disabled={historyIdx >= history.length - 1} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
              <button onClick={handleGoUp} disabled={path.length === 0} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
            </div>
            
            <div className="flex items-center gap-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1 shadow-sm font-medium">
              <button onClick={() => navigateTo(rootHandle, [])} className="text-gray-400 hover:text-[#3DCD58]">Root</button>
              {path.map((seg, i) => (
                <React.Fragment key={i}>
                  <ChevronRight className="w-3 h-3 text-gray-300" />
                  <button onClick={() => handleBreadcrumbClick(i)} className="text-gray-600 hover:text-[#3DCD58]">{seg}</button>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <div className="flex gap-1">
                {CLASSIFICATIONS.map(c => (
                  <button 
                    key={c} 
                    onClick={() => setFilters(prev => prev.includes(c) ? prev.filter(f => f !== c) : [...prev, c])}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${filters.includes(c) ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-gray-300'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={loadCurrentDirectory} className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200"><RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {!rootPathDisplay && (
          <div className="bg-amber-50 p-3 border-b border-amber-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-amber-800">Root path (for copying only):</span>
              <input 
                value={rootPathInput} 
                onChange={e => setRootPathInput(e.target.value)} 
                placeholder="C:\Users\Name\Documents" 
                className="text-xs p-1 border border-amber-200 rounded w-64 bg-white"
              />
              <button onClick={handleSaveRootPath} className="text-[10px] font-black uppercase bg-amber-500 text-white px-3 py-1 rounded">Save</button>
            </div>
            <p className="text-[10px] text-amber-600">The browser cannot detect absolute OS paths automatically.</p>
          </div>
        )}

        {/* Main List */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-4 py-3 w-[45%]">Name</th>
                <th className="px-4 py-3 w-32 text-center">Classification</th>
                <th className="px-4 py-3 w-40 text-center">Status</th>
                <th className="px-4 py-3 w-28 text-center">Related</th>
                <th className="px-4 py-3 w-20 text-right">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredItems.map(item => {
                const key = item.relativePath.join('/');
                const meta = metas[key];
                const isEditable = meta?.docType === 'Editable';
                const isSelected = selectedItem?.name === item.name;

                return (
                  <tr 
                    key={item.name} 
                    onClick={() => setSelectedItem(item)}
                    onDoubleClick={() => item.kind === 'directory' ? navigateTo(item.handle as FileSystemDirectoryHandle, [...path, item.name]) : setShowPreview(true)}
                    className={`group hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0">{getFileIcon(item.extension, item.kind === 'directory')}</div>
                        <span className={`text-sm font-medium whitespace-normal break-words py-1 ${item.kind === 'directory' ? 'font-bold' : ''}`}>{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {item.kind === 'file' && (
                        <DocTypeSelector opportunityId={opportunityId} fileKey={key} onUpdate={() => loadCurrentDirectory()} />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isEditable && (
                        <select 
                          value={meta.editableStatus || 'Not started'}
                          onChange={e => updateMetaField(key, 'editableStatus', e.target.value)}
                          className="text-[10px] bg-gray-50 border border-gray-100 rounded px-1 py-0.5 outline-none font-bold text-gray-600 uppercase w-full text-center"
                        >
                          {EDITABLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isEditable && (
                        <div className="flex justify-center gap-2 text-[9px] font-bold text-gray-400">
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded" title="Linked Notes">N: {meta.linkedNoteIds?.length || 0}</span>
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded" title="Linked Tasks">T: {meta.linkedTaskIds?.length || 0}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[10px] text-gray-400">
                      {item.kind === 'file' ? ((item.size || 0) / 1024).toFixed(1) + ' KB' : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Linked Items Sidebar */}
      {showLinkedItems && isFileSelected && (
        <LinkedItemsPanel
          opportunity={opportunity}
          meta={selectedMeta}
          fileKey={selectedFileKey}
          onClose={() => setShowLinkedItems(false)}
          onUpdate={onUpdate}
        />
      )}

      {/* Preview Overlay */}
      {showPreview && isFileSelected && (
        <div className={`fixed z-[100] bg-white flex flex-col animate-fade-in shadow-2xl transition-all duration-300 ${isPreviewExpanded ? 'inset-4 rounded-2xl' : 'absolute inset-0 z-[60]'}`}>
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0 rounded-t-xl">
            <div className="flex items-center gap-3">
              {getFileIcon(selectedItem!.extension, false)}
              <div>
                <h4 className="font-bold text-gray-800 leading-tight break-all max-w-lg">{selectedItem!.name}</h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{selectedItem!.extension || 'file'} • {((selectedItem!.size || 0) / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsPreviewExpanded(!isPreviewExpanded)} 
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50"
              >
                {isPreviewExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                {isPreviewExpanded ? 'Collapse' : 'Expand'}
              </button>
              <button onClick={handleCopyPath} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50">
                {copySuccess === 'full' ? <Check className="w-3.5 h-3.5 text-[#3DCD58]" /> : <Copy className="w-3.5 h-3.5" />} 
                Full path
              </button>
              <button onClick={() => setShowLinkedItems(true)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50">
                <LinkIcon className="w-3.5 h-3.5" />
                Linked items
              </button>
              <button onClick={() => openFileNative(selectedItem!.handle as FileSystemFileHandle)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50">
                <ExternalLink className="w-3.5 h-3.5" />
                Download / Open
              </button>
              <button onClick={() => { setShowPreview(false); setIsPreviewExpanded(false); }} className="p-2 hover:bg-gray-100 rounded-full ml-4"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden p-4 md:p-8 flex flex-col items-center justify-center bg-gray-50/50">
            {['xlsx', 'xlsm', 'docx'].includes(selectedItem!.extension || '') ? (
              <OfficePreview item={selectedItem!} sizeLimit={20 * 1024 * 1024} />
            ) : previewUrl ? (
              selectedItem!.extension === 'pdf' ? (
                <iframe src={previewUrl} className="w-full h-full rounded-lg shadow-2xl bg-white border-none" />
              ) : (
                <img src={previewUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
              )
            ) : previewText !== null ? (
              <div className="w-full h-full bg-white rounded-lg shadow-2xl p-6 overflow-auto font-mono text-xs text-gray-600 leading-relaxed border border-gray-200">
                <pre>{previewText}</pre>
              </div>
            ) : (
              <div className="text-center bg-white p-12 rounded-3xl shadow-xl border border-gray-100">
                <div className="p-6 bg-gray-50 rounded-full inline-block mb-6">
                  {getFileIcon(selectedItem!.extension, false)}
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{selectedItem!.name}</h3>
                <p className="text-sm text-gray-500 mb-8 max-w-sm">Preview not available for this file type in-app.</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleCopyPath} className="px-6 py-2.5 bg-gray-800 text-white text-xs font-bold rounded-xl hover:bg-gray-900 shadow-lg shadow-gray-200 transition-all">Copy full path</button>
                  <button onClick={() => openFileNative(selectedItem!.handle as FileSystemFileHandle)} className="px-6 py-2.5 bg-[#3DCD58] text-white text-xs font-bold rounded-xl hover:bg-[#2db64a] shadow-lg shadow-emerald-200 transition-all">Download / Open</button>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 bg-white flex justify-center gap-4 shrink-0 rounded-b-xl">
             <div className="flex items-center gap-2 text-[10px] text-gray-400">
               <Info className="w-3 h-3" />
               <span>Use Space to toggle preview</span>
             </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar (Files Only) */}
      {isFileSelected && !showPreview && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gray-900 text-white p-1 rounded-xl shadow-2xl animate-slide-in-right z-[55]">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-lg text-xs font-bold transition-all"><Eye className="w-4 h-4" /> Preview</button>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <button onClick={handleCopyPath} className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-lg text-xs font-bold transition-all"><Copy className="w-4 h-4" /> Full path</button>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <button onClick={() => setShowLinkedItems(true)} className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-lg text-xs font-bold transition-all"><LinkIcon className="w-4 h-4" /> Linked items</button>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <button onClick={() => openFileNative(selectedItem!.handle as FileSystemFileHandle)} className="flex items-center gap-2 px-4 py-2 hover:bg-[#3DCD58] rounded-lg text-xs font-bold transition-all">Download / Open</button>
        </div>
      )}
    </div>
  );
};
