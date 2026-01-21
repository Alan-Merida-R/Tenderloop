
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
  Link as LinkIcon,
  Search,
  MapPin,
  Scissors,
  ClipboardPaste,
  ArrowRightLeft,
  FolderInput,
  HardDrive
} from 'lucide-react';
import { getFolderHandle, setFolderHandle, verifyPermission, clearFolderHandle, getRootPathDisplay, setRootPathDisplay } from '../../services/opportunityFolderLink';
import { listDirectory, createFolder, uploadFiles, deleteEntry, renameEntry, openFileNative, searchFiles, copyEntryToDir, moveEntryToDir } from './fileOps';
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
  // Navigation & Handles
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [history, setHistory] = useState<{handle: FileSystemDirectoryHandle, path: string[]}[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Metadata & Selection
  const [metas, setMetas] = useState<Record<string, DocMeta>>({});
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [filters, setFilters] = useState<string[]>([]);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isApiSupported, setIsApiSupported] = useState(true);
  const [rootPathInput, setRootPathInput] = useState('');
  const [rootPathDisplay, setRootPathDisplayVal] = useState('');
  const [goToPath, setGoToPath] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  
  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [showLinkedItems, setShowLinkedItems] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<boolean>(false);

  // File Operations
  const [clipboard, setClipboard] = useState<{ op: 'copy' | 'move', items: FileItem[] } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    op: 'move' | 'copy' | 'delete' | 'upload';
    title: string;
    source: string;
    sourcePath: string;
    destPath?: string;
    files?: File[]; // For upload
    onConfirm: () => Promise<void>;
  } | null>(null);

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
      // Re-validate selection: if selected item is no longer in list, clear it.
      setSelectedItem(prev => prev && contents.some(i => i.name === prev.name) ? prev : null);
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
    if (!searchQuery) {
        loadCurrentDirectory();
    }
  }, [loadCurrentDirectory, searchQuery]);

  // Deep Navigation Effect
  useEffect(() => {
    const navigateToInitialFile = async () => {
        if (!initialFileKey || !rootHandle) return;
        const segments = initialFileKey.split('/');
        if (segments.length === 0) return;

        const fileName = segments[segments.length - 1];
        const dirPath = segments.slice(0, -1);

        try {
            let targetHandle = rootHandle;
            for (const seg of dirPath) {
                targetHandle = await targetHandle.getDirectoryHandle(seg);
            }
            navigateTo(targetHandle, dirPath, true);
            
            // Wait for list update then find item
            setTimeout(async () => {
                const contents = await listDirectory(targetHandle, dirPath);
                const foundItem = contents.find(i => i.name === fileName);
                if (foundItem) {
                    setSelectedItem(foundItem);
                } else {
                    console.warn("File not found:", fileName);
                }
            }, 100);
        } catch (e) {
            console.error("Failed to navigate:", e);
            alert("Could not locate the linked file. It may have been moved or deleted.");
        }
    };
    navigateToInitialFile();
  }, [initialFileKey, rootHandle]);

  // Search Logic
  useEffect(() => {
      if (!searchQuery.trim() || !rootHandle) {
          setSearchResults([]);
          setIsSearching(false);
          searchAbortRef.current = true;
          return;
      }

      searchAbortRef.current = false;
      setIsSearching(true);
      setSearchResults([]);

      const runSearch = async () => {
          await searchFiles(
              rootHandle,
              searchQuery,
              (item) => {
                  setSearchResults(prev => [...prev, item]);
              },
              () => searchAbortRef.current,
              []
          );
          setIsSearching(false);
      };

      const timer = setTimeout(runSearch, 500); // Debounce
      return () => { 
          clearTimeout(timer); 
          searchAbortRef.current = true; 
      };
  }, [searchQuery, rootHandle]);

  // --- Handlers ---

  const handleChangeRoot = async () => {
      try {
          // @ts-ignore
          const handle = await window.showDirectoryPicker();
          await setFolderHandle(opportunityId, handle);
          setRootHandle(handle);
          navigateTo(handle, [], true);
          alert("Root folder updated. Document links will resolve relative to this new root.");
      } catch (e) {}
  };

  const handleGoToPath = async () => {
      if (!goToPath.trim() || !rootHandle) return;
      
      // Clean path
      let cleanPath = goToPath.trim().replace(/\\/g, '/');
      let rootDisplay = rootPathDisplay.replace(/\\/g, '/');
      
      if (!cleanPath.toLowerCase().startsWith(rootDisplay.toLowerCase())) {
          alert("Path is outside the linked folder root.");
          return;
      }

      // Extract relative path
      const relPath = cleanPath.slice(rootDisplay.length).replace(/^\//, '');
      if (!relPath) {
          navigateTo(rootHandle, []);
          return;
      }

      const segments = relPath.split('/');
      
      try {
          let h = rootHandle;
          let targetPath: string[] = [];
          
          for (let i = 0; i < segments.length; i++) {
              const seg = segments[i];
              try {
                  const nextH = await h.getDirectoryHandle(seg);
                  h = nextH;
                  targetPath.push(seg);
              } catch (e) {
                  // If fails, maybe it's a file at the end
                  if (i === segments.length - 1) {
                      // It might be a file in current 'h'
                      navigateTo(h, targetPath, true);
                      // Try to highlight file
                      const contents = await listDirectory(h, targetPath);
                      const file = contents.find(f => f.name === seg);
                      if (file) setSelectedItem(file);
                      return;
                  }
                  throw e; // Path broken
              }
          }
          // If loop finishes, it's a valid folder
          navigateTo(h, targetPath, true);
      } catch (e) {
          alert("Could not find path inside linked folder.");
      }
  };

  const navigateTo = (handle: FileSystemDirectoryHandle, newPath: string[], isNew = true) => {
    setCurrentHandle(handle);
    setPath(newPath);
    setSelectedItem(null);
    setSearchQuery(''); // Clear search on nav
    if (isNew) {
      const newHist = history.slice(0, historyIdx + 1);
      newHist.push({ handle, path: newPath });
      setHistory(newHist);
      setHistoryIdx(newHist.length - 1);
    }
  };

  // Operations
  const handleCopy = (item: FileItem) => setClipboard({ op: 'copy', items: [item] });
  const handleCut = (item: FileItem) => setClipboard({ op: 'move', items: [item] });
  
  const handlePaste = async () => {
      if (!clipboard || !currentHandle) return;
      const opName = clipboard.op === 'move' ? 'Move' : 'Copy';
      
      setConfirmation({
          op: clipboard.op,
          title: `Confirm ${opName}`,
          source: clipboard.items.map(i => i.name).join(', '),
          sourcePath: clipboard.items[0].relativePath.join('/'),
          destPath: path.join('/'),
          onConfirm: async () => {
              if (!currentHandle) return;
              
              // 1. Verify Destination Write Permission
              if (!(await verifyPermission(currentHandle, true))) {
                  alert("Write permission denied for destination folder. Please grant access.");
                  return;
              }

              try {
                  for (const item of clipboard.items) {
                      // 2. Verify Source Permissions
                      // For move: need write (to delete) on source parent usually, 
                      // or at least read on item. We check item handle permission.
                      if (clipboard.op === 'move') {
                           if (!(await verifyPermission(item.handle, true))) {
                               // Try requesting readwrite
                               // @ts-ignore
                               await item.handle.requestPermission({ mode: 'readwrite' });
                           }
                      } else {
                           if (!(await verifyPermission(item.handle, false))) {
                               // @ts-ignore
                               await item.handle.requestPermission({ mode: 'read' });
                           }
                      }

                      if (clipboard.op === 'move') await moveEntryToDir(item, currentHandle);
                      else await copyEntryToDir(item, currentHandle);
                  }
                  setClipboard(null);
                  loadCurrentDirectory();
              } catch (e: any) {
                  console.error("Paste failed", e);
                  alert(`Failed to ${opName.toLowerCase()} items: ${e.message}. Ensure you have permissions on both source and destination.`);
              }
          }
      });
  };

  const handleDelete = (item: FileItem) => {
      setConfirmation({
          op: 'delete',
          title: 'Confirm Delete',
          source: item.name,
          sourcePath: item.relativePath.join('/'),
          onConfirm: async () => {
              // @ts-ignore
              await currentHandle?.removeEntry(item.name, { recursive: true });
              loadCurrentDirectory();
              setSelectedItem(null);
          }
      });
  };

  const handleRename = async (item: FileItem) => {
      const newName = prompt("Enter new name:", item.name);
      if (!newName || newName === item.name || !currentHandle) return;
      
      try {
          if (await verifyPermission(currentHandle, true)) {
              await renameEntry(currentHandle, item, newName);
              loadCurrentDirectory();
              setSelectedItem(null);
          } else {
              alert("Write permission required to rename.");
          }
      } catch (e: any) {
          console.error("Rename failed", e);
          alert("Rename failed: " + e.message);
      }
  };

  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0 || !currentHandle) return;

      setConfirmation({
          op: 'upload',
          title: 'Confirm Upload',
          source: `${files.length} files`,
          sourcePath: 'External OS Drag & Drop',
          destPath: path.join('/'),
          files: files,
          onConfirm: async () => {
              if (currentHandle && files.length > 0) {
                  // Request permission to write
                  if (await verifyPermission(currentHandle, true)) {
                      try {
                          await uploadFiles(currentHandle, files);
                          loadCurrentDirectory();
                      } catch (e) {
                          console.error("Upload failed", e);
                          alert("Upload failed. Please check permissions.");
                      }
                  } else {
                      alert("Write permission denied for this folder.");
                  }
              }
          }
      });
  };

  // Boilerplate navigation logic
  const handleGoBack = () => { if (historyIdx > 0) { const e = history[historyIdx - 1]; setHistoryIdx(historyIdx - 1); setCurrentHandle(e.handle); setPath(e.path); setSelectedItem(null); }};
  const handleGoForward = () => { if (historyIdx < history.length - 1) { const e = history[historyIdx + 1]; setHistoryIdx(historyIdx + 1); setCurrentHandle(e.handle); setPath(e.path); setSelectedItem(null); }};
  const handleGoUp = async () => { if (path.length > 0 && rootHandle) { let t = rootHandle; const np = path.slice(0, -1); for (const s of np) t = await t.getDirectoryHandle(s); navigateTo(t, np); }};
  const handleBreadcrumbClick = async (idx: number) => { if (!rootHandle) return; let t = rootHandle; const np = path.slice(0, idx + 1); for (const s of np) t = await t.getDirectoryHandle(s); navigateTo(t, np); };
  
  // Helpers
  const handleCopyPath = () => { if (!selectedItem) return; const t = `${rootPathDisplay}\\${selectedItem.relativePath.join('\\')}`; navigator.clipboard.writeText(t); setCopySuccess('full'); setTimeout(() => setCopySuccess(null), 2000); };
  const handleSaveRootPath = async () => { if (!rootPathInput.trim()) return; await setRootPathDisplay(opportunityId, rootPathInput.trim()); setRootPathDisplayVal(rootPathInput.trim()); };
  const updateMetaField = async (key: string, field: keyof DocMeta, value: any) => { await saveMeta(opportunityId, key, { [field]: value }); await loadMetas(items); };
  
  // Render Helpers
  const renderList = (fileItems: FileItem[]) => (
      <table className="w-full text-left border-collapse min-w-[800px]">
        <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
          <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <th className="px-4 py-3 w-[40%]">Name</th>
            <th className="px-4 py-3">Path</th>
            <th className="px-4 py-3 w-32 text-center">Class</th>
            <th className="px-4 py-3 w-20 text-right">Size</th>
            <th className="px-4 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {fileItems.map(item => {
            const key = item.relativePath.join('/');
            const meta = metas[key];
            const isSelected = selectedItem?.name === item.name && selectedItem?.relativePath.join('/') === key;
            return (
              <tr 
                key={key} 
                onClick={() => setSelectedItem(item)}
                onDoubleClick={() => {
                    if (item.kind === 'directory') {
                        navigateTo(item.handle as FileSystemDirectoryHandle, item.relativePath);
                    } else if (searchQuery) {
                        const parentPath = item.relativePath.slice(0, -1);
                        if (rootHandle) {
                            let h = rootHandle;
                            (async () => {
                                for(const s of parentPath) h = await h.getDirectoryHandle(s);
                                navigateTo(h, parentPath);
                                setTimeout(() => setSelectedItem(item), 100);
                            })();
                        }
                    } else {
                        openFileNative(item.handle as FileSystemFileHandle);
                    }
                }}
                className={`group hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', item.name); // Simple drag
                }}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">{getFileIcon(item.extension, item.kind === 'directory')}</div>
                    <span className={`text-sm font-medium whitespace-normal break-words py-1 ${item.kind === 'directory' ? 'font-bold' : ''}`}>{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-gray-400 truncate max-w-[200px]">
                    {searchQuery ? item.relativePath.slice(0, -1).join('/') || 'Root' : ''}
                </td>
                <td className="px-4 py-2">
                  {item.kind === 'file' && !searchQuery && (
                    <DocTypeSelector opportunityId={opportunityId} fileKey={key} onUpdate={() => loadCurrentDirectory()} />
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono text-[10px] text-gray-400">
                  {item.kind === 'file' ? ((item.size || 0) / 1024).toFixed(1) + ' KB' : '-'}
                </td>
                <td className="px-4 py-2 relative">
                    <div className="hidden group-hover:flex gap-1 justify-end">
                        <button onClick={(e) => { e.stopPropagation(); handleRename(item); }} title="Rename" className="p-1 hover:bg-gray-200 rounded"><Edit3 className="w-3 h-3"/></button>
                        <button onClick={(e) => { e.stopPropagation(); handleCopy(item); }} title="Copy" className="p-1 hover:bg-gray-200 rounded"><Copy className="w-3 h-3"/></button>
                        <button onClick={(e) => { e.stopPropagation(); handleCut(item); }} title="Cut" className="p-1 hover:bg-gray-200 rounded"><Scissors className="w-3 h-3"/></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} title="Delete" className="p-1 hover:bg-red-50 text-red-400 rounded"><Trash2 className="w-3 h-3"/></button>
                    </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
  );

  if (!isApiSupported) return <div className="p-10 text-center">FileSystem API not supported.</div>;

  if (!rootHandle) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <FolderOpen className="w-16 h-16 text-gray-200 mb-4" />
        <h3 className="text-xl font-bold">Link Opportunity Folder</h3>
        <p className="text-gray-500 mb-6 max-w-sm">Select a local directory to manage files.</p>
        <button onClick={handleChangeRoot} className="bg-[#3DCD58] text-white px-6 py-2 rounded-lg font-bold">Select Folder</button>
      </div>
    );
  }

  const isFileSelected = selectedItem && selectedItem.kind === 'file';
  const selectedFileKey = selectedItem ? selectedItem.relativePath.join('/') : '';
  const selectedMeta = selectedItem ? metas[selectedFileKey] : null;

  return (
    <div className="flex h-full bg-white rounded-xl border border-gray-200 overflow-hidden relative" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Sidebar Tree (Simplified) */}
      <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50/50 shrink-0">
          <div className="p-4 border-b border-gray-100">
              <button onClick={handleChangeRoot} className="w-full flex items-center justify-center gap-2 text-xs font-bold bg-white border border-gray-200 py-2 rounded-lg hover:bg-gray-50 shadow-sm transition-all mb-4">
                  <ArrowRightLeft className="w-3 h-3"/> Change Linked Folder
              </button>
              
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Global Search</label>
                  <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"/>
                      <input 
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                          placeholder="Search entire root..."
                      />
                      {isSearching && <RefreshCw className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-[#3DCD58]"/>}
                  </div>
              </div>

              <div className="mt-4 space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Go To Path</label>
                  <div className="flex gap-1">
                      <input 
                          value={goToPath}
                          onChange={e => setGoToPath(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleGoToPath()}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                          placeholder="C:/..."
                      />
                      <button onClick={handleGoToPath} className="p-1.5 bg-gray-200 rounded-lg hover:bg-gray-300"><ArrowRight className="w-3.5 h-3.5"/></button>
                  </div>
              </div>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto">
              <div className="text-center text-xs text-gray-400 mt-10">
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-20"/>
                  <p>Folder Library</p>
              </div>
          </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
              <button onClick={handleGoBack} disabled={historyIdx <= 0} className="p-1 hover:bg-white rounded disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
              <button onClick={handleGoForward} disabled={historyIdx >= history.length - 1} className="p-1 hover:bg-white rounded disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
              <button onClick={handleGoUp} disabled={path.length === 0} className="p-1 hover:bg-white rounded disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
            </div>
            
            <div className="flex items-center gap-1 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <button onClick={() => navigateTo(rootHandle!, [])} className="hover:text-[#3DCD58] font-bold flex items-center gap-1"><HardDrive className="w-3.5 h-3.5"/> Root</button>
              {path.map((seg, i) => (
                <React.Fragment key={i}>
                  <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                  <button onClick={() => handleBreadcrumbClick(i)} className="hover:text-[#3DCD58]">{seg}</button>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {clipboard && (
                <button onClick={handlePaste} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 mr-2 animate-pulse">
                    <ClipboardPaste className="w-3.5 h-3.5"/> Paste {clipboard.op === 'move' ? 'Cut' : 'Copied'} ({clipboard.items.length})
                </button>
            )}
            <button onClick={() => createFolder(currentHandle!, prompt("Folder Name:") || '') .then(() => loadCurrentDirectory())} className="p-2 hover:bg-gray-100 rounded-lg border border-transparent hover:border-gray-200 text-gray-500"><Plus className="w-4 h-4" /></button>
            
            {/* Added Manual Refresh Button */}
            <button onClick={loadCurrentDirectory} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
            </button>

            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] shadow-sm transition-colors" onClick={async () => {
                try {
                    // @ts-ignore
                    const [handle] = await window.showOpenFilePicker({ multiple: true });
                    if (handle && currentHandle) {
                        if (await verifyPermission(currentHandle, true)) {
                            await uploadFiles(currentHandle, [await handle.getFile()]);
                            loadCurrentDirectory();
                        } else {
                            alert("Write permission denied.");
                        }
                    }
                } catch (e) {}
            }}>
                <Upload className="w-3.5 h-3.5" /> Upload
            </button>
          </div>
        </div>

        {!rootPathDisplay && (
          <div className="bg-amber-50 p-2 border-b border-amber-100 flex items-center gap-2 justify-center shrink-0">
              <span className="text-[10px] font-bold text-amber-700">Set Root Path to enable "Copy Path":</span>
              <input value={rootPathInput} onChange={e => setRootPathInput(e.target.value)} placeholder="e.g. C:\Projects\Opp" className="text-[10px] p-1 border rounded w-48"/>
              <button onClick={handleSaveRootPath} className="text-[10px] bg-amber-200 px-2 py-1 rounded hover:bg-amber-300">Save</button>
          </div>
        )}

        {/* Actions Toolbar - Sticky at top of content area */}
        {selectedItem && !showPreview && !confirmation && (
            <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between shadow-md shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold truncate max-w-[200px]">{selectedItem.name}</span>
                    <div className="w-px h-4 bg-gray-700 mx-1"></div>
                    {selectedItem.kind === 'file' ? (
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowPreview(true)} className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold transition-all"><Eye className="w-3 h-3" /> Preview</button>
                            <button onClick={handleCopyPath} className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold transition-all"><Copy className="w-3 h-3" /> Path</button>
                            <button onClick={() => setShowLinkedItems(true)} className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold transition-all"><LinkIcon className="w-3 h-3" /> Links</button>
                            <button onClick={() => openFileNative(selectedItem.handle as FileSystemFileHandle)} className="flex items-center gap-1 px-3 py-1 bg-[#3DCD58] hover:bg-[#2db64a] text-white rounded text-[10px] font-bold transition-all">Open</button>
                        </div>
                    ) : (
                        <button onClick={handleCopyPath} className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold transition-all"><Copy className="w-3 h-3" /> Copy Path</button>
                    )}
                </div>
                <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4"/></button>
            </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
            {isSearching && searchResults.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">Searching...</div>
            )}
            {searchQuery ? renderList(searchResults) : renderList(items)}
            {!searchQuery && items.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-64 text-gray-300">
                    <FolderOpen className="w-12 h-12 mb-2 opacity-20" />
                    <span className="text-sm font-medium">Empty Folder</span>
                    <span className="text-xs">Drag files here to upload</span>
                </div>
            )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmation && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in-right">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmation.title}</h3>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm space-y-2 mb-6">
                      <div className="flex justify-between">
                          <span className="text-gray-500">Operation:</span>
                          <span className="font-bold uppercase text-gray-800">{confirmation.op}</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-gray-500">Source:</span>
                          <span className="font-medium text-gray-800 truncate max-w-[200px]">{confirmation.source}</span>
                      </div>
                      <div className="text-xs text-gray-400 break-all">{confirmation.sourcePath}</div>
                      {confirmation.destPath && (
                          <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                              <span className="text-gray-500">Destination:</span>
                              <span className="font-medium text-[#3DCD58]">{confirmation.destPath || 'Root'}</span>
                          </div>
                      )}
                  </div>
                  <div className="flex gap-3 justify-end">
                      <button onClick={() => setConfirmation(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium text-sm">Cancel</button>
                      <button 
                          onClick={async () => {
                              await confirmation.onConfirm();
                              setConfirmation(null);
                          }} 
                          className={`px-4 py-2 text-white rounded-lg font-bold text-sm shadow-lg ${confirmation.op === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#3DCD58] hover:bg-[#2db64a]'}`}
                      >
                          Confirm
                      </button>
                  </div>
              </div>
          </div>
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
    </div>
  );
};
