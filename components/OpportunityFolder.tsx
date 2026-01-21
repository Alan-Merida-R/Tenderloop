
import React, { useState, useEffect, useRef } from 'react';
/* Added X to imports */
import { Folder, File, ChevronRight, ChevronDown, MoreVertical, Trash2, Edit3, Plus, ArrowLeft, Download, FileSpreadsheet, FileText, Presentation, FileCode, Archive, Image as ImageIcon, Box, ExternalLink, HardDrive, Upload, Move, X, AlertTriangle } from 'lucide-react';
import { setFolderHandle, clearFolderHandle, verifyPermission } from '../services/folderStorage';

interface FileItem {
    name: string;
    kind: 'file' | 'directory';
    handle: FileSystemHandle;
    extension?: string;
    size?: number;
    lastModified?: number;
}

interface TreeItem extends FileItem {
    isOpen: boolean;
    children: TreeItem[];
    isLoading: boolean;
}

interface Props {
    oppId: string;
    rootHandle: FileSystemDirectoryHandle;
    onFolderLinked: (linked: boolean) => void;
}

export const OpportunityFolder: React.FC<Props> = ({ oppId, rootHandle, onFolderLinked }) => {
    const [currentPath, setCurrentPath] = useState<FileSystemDirectoryHandle[]>([]);
    const [items, setItems] = useState<FileItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
    const [tree, setTree] = useState<TreeItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewContent, setPreviewContent] = useState<{ type: 'img' | 'pdf' | 'text' | 'none', url?: string, text?: string } | null>(null);

    const activeHandle = currentPath.length > 0 ? currentPath[currentPath.length - 1] : rootHandle;

    useEffect(() => {
        loadDirectory(rootHandle);
        buildTree(rootHandle);
    }, [rootHandle]);

    const loadDirectory = async (handle: FileSystemDirectoryHandle) => {
        setIsLoading(true);
        setError(null);
        try {
            const list: FileItem[] = [];
            // @ts-ignore
            for await (const entry of handle.values()) {
                const item: FileItem = {
                    name: entry.name,
                    kind: entry.kind,
                    handle: entry,
                };
                if (entry.kind === 'file') {
                    item.extension = entry.name.split('.').pop()?.toLowerCase();
                    try {
                        const file = await (entry as FileSystemFileHandle).getFile();
                        item.size = file.size;
                        item.lastModified = file.lastModified;
                    } catch (e) {
                        console.warn(`Could not get file info for ${entry.name}`, e);
                    }
                }
                list.push(item);
            }
            setItems(list.sort((a, b) => {
                if (a.kind === b.kind) return a.name.localeCompare(b.name);
                return a.kind === 'directory' ? -1 : 1;
            }));
        } catch (err: any) {
            console.error("Failed to load directory", err);
            setError(err.message || "Access denied or unsupported operation in this environment.");
        } finally {
            setIsLoading(false);
        }
    };

    const buildTree = async (handle: FileSystemDirectoryHandle) => {
        const root: TreeItem = {
            name: handle.name,
            kind: 'directory',
            handle,
            isOpen: true,
            children: [],
            isLoading: false
        };
        await expandTreeNode(root);
        setTree([root]);
    };

    const expandTreeNode = async (item: TreeItem) => {
        if (item.kind !== 'directory') return;
        item.isLoading = true;
        const children: TreeItem[] = [];
        try {
            // @ts-ignore
            for await (const entry of (item.handle as FileSystemDirectoryHandle).values()) {
                if (entry.kind === 'directory') {
                    children.push({
                        name: entry.name,
                        kind: 'directory',
                        handle: entry,
                        isOpen: false,
                        children: [],
                        isLoading: false
                    });
                }
            }
            item.children = children.sort((a, b) => a.name.localeCompare(b.name));
        } catch (err) {
            console.warn("Could not expand tree node", err);
        }
        item.isLoading = false;
    };

    const handleNavigate = (handle: FileSystemDirectoryHandle) => {
        const newPath = [...currentPath, handle];
        setCurrentPath(newPath);
        loadDirectory(handle);
        setSelectedItem(null);
    };

    const goBack = () => {
        const newPath = [...currentPath];
        newPath.pop();
        setCurrentPath(newPath);
        loadDirectory(newPath.length > 0 ? newPath[newPath.length - 1] : rootHandle);
        setSelectedItem(null);
    };

    const handleSelect = async (item: FileItem) => {
        setSelectedItem(item);
        if (item.kind === 'file') {
            try {
                const file = await (item.handle as FileSystemFileHandle).getFile();
                const ext = item.extension;

                if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
                    const url = URL.createObjectURL(file);
                    setPreviewContent({ type: 'img', url });
                } else if (ext === 'pdf') {
                    const url = URL.createObjectURL(file);
                    setPreviewContent({ type: 'pdf', url });
                } else if (['txt', 'csv', 'json', 'log'].includes(ext || '')) {
                    const text = await file.text();
                    setPreviewContent({ type: 'text', text: text.slice(0, 10000) });
                } else {
                    setPreviewContent({ type: 'none' });
                }
            } catch (err) {
                console.error("Failed to preview file", err);
                setPreviewContent({ type: 'none' });
            }
        } else {
            setPreviewContent(null);
        }
    };

    const openNative = async (item: FileItem) => {
        if (item.kind === 'file') {
            try {
                const file = await (item.handle as FileSystemFileHandle).getFile();
                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = item.name;
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                alert("Cannot open file: Operation restricted.");
            }
        }
    };

    const createFolder = async () => {
        const name = prompt("Enter folder name:");
        if (!name) return;
        try {
            await activeHandle.getDirectoryHandle(name, { create: true });
            loadDirectory(activeHandle);
        } catch (err) {
            alert("Failed to create folder: " + err);
        }
    };

    const deleteItem = async (item: FileItem) => {
        if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;
        try {
            // @ts-ignore
            await activeHandle.removeEntry(item.name, { recursive: true });
            loadDirectory(activeHandle);
            setSelectedItem(null);
        } catch (err) {
            alert("Failed to delete: " + err);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files) as File[];
        if (files.length === 0) return;

        for (const file of files) {
            try {
                const newFileHandle = await activeHandle.getFileHandle(file.name, { create: true });
                // @ts-ignore
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            } catch (err) {
                console.error("Failed to upload file", err);
            }
        }
        loadDirectory(activeHandle);
    };

    const getFileIcon = (ext?: string, kind?: string) => {
        if (kind === 'directory') return <Folder className="w-5 h-5 text-yellow-500 fill-yellow-500" />;
        const e = ext?.toLowerCase();
        if (['xlsx', 'xls', 'csv'].includes(e || '')) return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
        if (['docx', 'doc'].includes(e || '')) return <FileText className="w-5 h-5 text-blue-600" />;
        if (['pptx', 'ppt'].includes(e || '')) return <Presentation className="w-5 h-5 text-orange-600" />;
        if (e === 'pdf') return <FileText className="w-5 h-5 text-red-600" />;
        if (['png', 'jpg', 'jpeg', 'gif'].includes(e || '')) return <ImageIcon className="w-5 h-5 text-purple-600" />;
        if (['zip', 'rar', '7z'].includes(e || '')) return <Archive className="w-5 h-5 text-gray-600" />;
        if (['dwg', 'dxf'].includes(e || '')) return <Box className="w-5 h-5 text-indigo-600" />;
        if (['txt', 'json', 'js', 'ts'].includes(e || '')) return <FileCode className="w-5 h-5 text-gray-500" />;
        return <File className="w-5 h-5 text-gray-400" />;
    };

    const formatSize = (bytes?: number) => {
        if (!bytes) return '-';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="flex h-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            {/* Sidebar Tree */}
            <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50/50">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Library</span>
                    <button onClick={async () => { if (confirm("Remove folder link?")) { await clearFolderHandle(oppId); onFolderLinked(false); } }} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {/* Standard map on typed state without confusing casts */}
                    {tree.map((node: TreeItem) => (
                        <div key={node.name} className="space-y-1">
                            <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm ${activeHandle === node.handle ? 'bg-[#3DCD58]/10 text-[#3DCD58]' : 'hover:bg-gray-100'}`} onClick={() => handleNavigate(node.handle as FileSystemDirectoryHandle)}>
                                <Folder className="w-4 h-4 shrink-0" />
                                <span className="truncate">{node.name}</span>
                            </div>
                            <div className="pl-4">
                                {node.children.map((child: TreeItem) => (
                                    <div key={child.name} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${activeHandle === child.handle ? 'bg-[#3DCD58]/10 text-[#3DCD58]' : 'hover:bg-gray-100'}`} onClick={() => handleNavigate(child.handle as FileSystemDirectoryHandle)}>
                                        <Folder className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{child.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Explorer Toolbar */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                            <button onClick={goBack} disabled={currentPath.length === 0} className="p-1.5 hover:bg-gray-100 rounded-md disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                            <HardDrive className="w-4 h-4" />
                            <span className="mx-1">/</span>
                            {currentPath.map((p, i) => (
                                <React.Fragment key={i}>
                                    <span className="hover:text-gray-900 cursor-pointer">{p.name}</span>
                                    <span className="mx-1">/</span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={createFolder} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
                            <Plus className="w-3.5 h-3.5" /> New Folder
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors" onClick={async () => {
                            try {
                                // @ts-ignore
                                const [handle] = await window.showOpenFilePicker({ multiple: true });
                                if (handle) {
                                    const file = await handle.getFile();
                                    const newHandle = await activeHandle.getFileHandle(file.name, { create: true });
                                    // @ts-ignore
                                    const writable = await newHandle.createWritable();
                                    await writable.write(file);
                                    await writable.close();
                                    loadDirectory(activeHandle);
                                }
                            } catch (e) {
                                console.warn("File upload picker interaction error", e);
                            }
                        }}>
                            <Upload className="w-3.5 h-3.5" /> Upload
                        </button>
                    </div>
                </div>

                {/* Content area */}
                <div className="flex-1 flex overflow-hidden relative">
                    {error ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 bg-red-50/20">
                            <AlertTriangle className="w-12 h-12 text-red-300 mb-2" />
                            <p className="font-bold text-gray-700">Access Error</p>
                            <p className="text-xs max-w-xs">{error}</p>
                            <button onClick={() => loadDirectory(activeHandle)} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-xs font-bold">Retry</button>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">Name</th>
                                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">Modified</th>
                                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Size</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item) => (
                                        <tr 
                                            key={item.name} 
                                            onClick={() => handleSelect(item)}
                                            onDoubleClick={() => item.kind === 'directory' ? handleNavigate(item.handle as FileSystemDirectoryHandle) : openNative(item)}
                                            className={`group hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors ${selectedItem?.name === item.name ? 'bg-blue-50/50' : ''}`}
                                        >
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-3">
                                                    {getFileIcon(item.extension, item.kind)}
                                                    <span className="text-sm font-medium text-gray-700 truncate">{item.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-xs text-gray-400">
                                                {item.lastModified ? new Date(item.lastModified).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-6 py-3 text-xs text-gray-400 text-right">
                                                {item.kind === 'file' ? formatSize(item.size) : 'Folder'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {items.length === 0 && !isLoading && (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-300">
                                    <Folder className="w-12 h-12 mb-2 opacity-20" />
                                    <span className="text-sm font-medium">Empty Folder</span>
                                    <span className="text-xs">Drag files here to upload</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Preview Panel */}
                    {selectedItem && !error && (
                        <div className="w-80 border-l border-gray-100 bg-gray-50/30 flex flex-col animate-slide-in-right">
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
                                <span className="text-xs font-bold text-gray-400 uppercase">Preview</span>
                                <div className="flex gap-1">
                                    <button onClick={() => deleteItem(selectedItem)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                                <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col items-center justify-center mb-4 overflow-hidden p-2 relative">
                                    {previewContent ? (
                                        previewContent.type === 'img' ? <img src={previewContent.url} className="max-w-full max-h-full object-contain" /> :
                                        previewContent.type === 'pdf' ? <iframe src={previewContent.url} className="w-full h-full border-none" /> :
                                        previewContent.type === 'text' ? <pre className="w-full h-full text-[10px] overflow-auto whitespace-pre-wrap font-mono p-2 text-gray-600">{previewContent.text}</pre> :
                                        <div className="flex flex-col items-center text-gray-300">
                                            {getFileIcon(selectedItem.extension, selectedItem.kind)}
                                            <span className="text-xs mt-2">No preview available</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-300">
                                            <Folder className="w-12 h-12 opacity-20" />
                                            <span className="text-xs mt-2">Directory selected</span>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-800 break-words mb-1">{selectedItem.name}</h4>
                                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">{selectedItem.kind === 'directory' ? 'Folder' : (selectedItem.extension || 'Unknown file')}</p>
                                    </div>
                                    {selectedItem.kind === 'file' && (
                                        <button onClick={() => openNative(selectedItem)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm">
                                            <ExternalLink className="w-4 h-4" /> Open Native
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
