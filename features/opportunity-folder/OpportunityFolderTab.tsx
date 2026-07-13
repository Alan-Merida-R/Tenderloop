
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
  HardDrive,
  Pin,
  PinOff,
  Files,
  FolderTree,
  CheckCheck,
  GitBranch,
  History,
  Download
} from 'lucide-react';
import { setFolderHandle, verifyPermission, setRootPathDisplay, getFolderHandleForRevision, getRootPathDisplayForRevision, folderKey, moveLegacyFolderLinkToRevision, getFolderHandle } from '../../services/opportunityFolderLink';
import { listDirectory, createFolder, uploadFiles, deleteEntry, renameEntry, openInNativeApp, searchFiles, copyEntryToDir, moveEntryToDir, locateFolderPath, locateFolderPathWithMarker, copyToOsClipboard, openManyNative, revealInExplorer, copyTemplateFromOsPath, copyFileAs, copyTemplateEntryToDir } from './fileOps';
import { getPins, addPin, removePin, isPinned, FolderPin } from '../../services/folderPinsStore';
import { assignFileRevisionFamilyId, getFileRevisionHistory, saveFileRevisionEntry, updateFileRevisionEntry, FileRevisionEntry } from '../../services/fileRevisionHistoryStore';
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
  /** True when viewing an old version snapshot. Navigation/open/edit still work,
   *  but we must not push the snapshot back into the live record via onUpdate. */
  isSnapshot?: boolean;
  /** Reports the currently browsed folder path up to the parent, so other pickers
   *  (e.g. attaching a file to a task) can default to it instead of the folder root. */
  onPathChange?: (path: string[]) => void;
}

const CLASSIFICATIONS = ['Editable', 'Info', 'Approvals', 'Not important', 'Proposal'];
const EDITABLE_STATUSES = ['In progress', 'Pending information', 'In approval / review', 'Not started', 'Done'];
const REVISION_RE = /\bR(\d+)\.(\d+)\b/i;

const splitFileName = (name: string) => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
};

const normalizeRevision = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  const bare = trimmed.startsWith('R') ? trimmed.slice(1) : trimmed;
  const match = bare.match(/^(\d+)\.(\d+)$/);
  return match ? `R${match[1]}.${match[2]}` : '';
};

const getRevisionFromName = (name: string) => {
  const match = name.match(REVISION_RE);
  return match ? `R${Number(match[1])}.${Number(match[2])}` : '';
};

const suggestNextRevision = (name: string) => {
  const current = getRevisionFromName(name);
  if (!current) return 'R0.0';
  const match = current.match(REVISION_RE);
  if (!match) return 'R0.0';
  return `R${Number(match[1])}.${Number(match[2]) + 1}`;
};

const buildRevisionFamilyKey = (relativePath: string[]) => {
  const fileName = relativePath[relativePath.length - 1] || '';
  const { base, ext } = splitFileName(fileName);
  const familyBase = base.replace(/\s*[-_ ]?\bR\d+\.\d+\b\s*$/i, '').trim();
  return [...relativePath.slice(0, -1), `${familyBase}${ext}`].join('/');
};

const buildRevisionFileName = (sourceName: string, revision: string) => {
  const { base, ext } = splitFileName(sourceName);
  const cleanedBase = base.replace(/\s*[-_ ]?\bR\d+\.\d+\b\s*$/i, '').trim() || base;
  return `${cleanedBase} ${revision}${ext}`;
};

const sanitizeExportName = (value: string) =>
  (value || 'file').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);

export const OpportunityFolderTab: React.FC<Props> = ({ opportunityId, opportunity, onUpdate, initialFileKey, isSnapshot, onPathChange }) => {
  // Folder links are stored PER REVISION so each revision keeps its own folder.
  // storageKey is what we read/write in IndexedDB; opportunityId stays the key
  // for file metadata (DocMeta), which is shared across revisions.
  const revision = (opportunity.revision || '').trim();
  const storageKey = folderKey(opportunityId, revision);
  // Navigation & Handles
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [history, setHistory] = useState<{ handle: FileSystemDirectoryHandle, path: string[] }[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  useEffect(() => { onPathChange?.(path); }, [path, onPathChange]);

  // Metadata & Selection
  const [metas, setMetas] = useState<Record<string, DocMeta>>({});
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [filters, setFilters] = useState<string[]>([]);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingRoot, setIsResolvingRoot] = useState(true);
  const [isApiSupported, setIsApiSupported] = useState(true);
  const [pendingPermHandle, setPendingPermHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [rootPathInput, setRootPathInput] = useState('');
  const [rootPathDisplay, setRootPathDisplayVal] = useState('');
  const [isEditingPath, setIsEditingPath] = useState(false);
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

  // Multi-selection (Windows-Explorer style: click, Ctrl+click, Shift+click)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [osClipBusy, setOsClipBusy] = useState(false);

  // Quick-access pins (F5)
  const [pins, setPins] = useState<FolderPin[]>([]);
  const [showPins, setShowPins] = useState(true);

  // Auto path resolution (F1)
  const [isLocating, setIsLocating] = useState(false);      // blocking (link/template)
  const [autoDetecting, setAutoDetecting] = useState(false); // background (on load)

  // In-app drag-to-folder move (F2)
  const [dragOverDirKey, setDragOverDirKey] = useState<string | null>(null);

  // Template creation flow (F4) — choose root vs a subfolder (revision)
  const [templateChoice, setTemplateChoice] = useState<{
    newFolderHandle: FileSystemDirectoryHandle;
    folderName: string;
    absolutePath?: string;
    subfolders: { name: string; handle: FileSystemDirectoryHandle; absolutePath?: string }[];
  } | null>(null);

  const [templateNaming, setTemplateNaming] = useState<{
    templateHandle?: FileSystemDirectoryHandle;
    templatePath?: string;
    destParent?: FileSystemDirectoryHandle;
    name: string;
  } | null>(null);

  const [revisionModal, setRevisionModal] = useState<{
    source: FileItem;
    sourceRevision: string;
    newRevision: string;
    newFileName: string;
    contains: string;
    changes: string;
    reason: string;
  } | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<FileRevisionEntry[]>([]);
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [historyDraft, setHistoryDraft] = useState<{ contains: string; changes: string; reason: string }>({ contains: '', changes: '', reason: '' });
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) setIsApiSupported(false);
  }, []);

  // Load pins whenever the linked folder (per revision) changes.
  useEffect(() => {
    getPins(storageKey).then(setPins).catch(() => setPins([]));
  }, [storageKey]);

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
    let cancelled = false;
    const init = async () => {
      setIsResolvingRoot(true);
      // Reset view first so switching to a different revision never shows the
      // previous revision's folder while the new one resolves.
      setRootHandle(null);
      setCurrentHandle(null);
      setItems([]);
      setPath([]);
      setHistory([]);
      setHistoryIdx(-1);
      // Per-revision lookup, with migration for folders linked before
      // per-revision storage existed.
      if (!isSnapshot && revision) {
        const revisionHandle = await getFolderHandle(folderKey(opportunityId, revision));
        const legacyHandle = await getFolderHandle(opportunityId);
        if (!revisionHandle && legacyHandle) {
          await moveLegacyFolderLinkToRevision(opportunityId, revision);
        }
      }
      const handle = await getFolderHandleForRevision(opportunityId, revision);
      const rp = await getRootPathDisplayForRevision(opportunityId, revision);
      if (cancelled) return;
      setRootPathDisplayVal(rp);
      setPendingPermHandle(null);
      if (!handle) {
        setIsResolvingRoot(false);
        return;
      }
      // Only use queryPermission here — requestPermission requires a user gesture
      // and cannot be called from a useEffect without one.
      // @ts-ignore
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (cancelled) return;
      if (perm === 'granted') {
        setRootHandle(handle);
        setCurrentHandle(handle);
        setPath([]);
        setHistory([{ handle, path: [] }]);
        setHistoryIdx(0);
        // Revalidate even a previously stored path in the background. Older
        // versions could save the first similarly named folder returned by a
        // broad scan; a proven exact match safely replaces that legacy value.
        detectPathSilently(handle);
      } else {
        setPendingPermHandle(handle);
      }
      setIsResolvingRoot(false);
    };
    init().catch(e => {
      console.error('Failed to resolve linked folder', e);
      if (!cancelled) {
        setPendingPermHandle(null);
        setIsResolvingRoot(false);
      }
    });
    return () => { cancelled = true; };
  }, [opportunityId, revision]);

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
          setSearchResults(prev => {
            if (prev.some(p => p.relativePath.join('/') === item.relativePath.join('/'))) return prev;
            return [...prev, item];
          });
        },
        () => searchAbortRef.current,
        [],
        async (key) => {
          const m = await getMeta(opportunityId, key);
          return m?.alias;
        }
      );
      setIsSearching(false);
    };

    const timer = setTimeout(runSearch, 500); // Debounce
    return () => {
      clearTimeout(timer);
      searchAbortRef.current = true;
    };
  }, [searchQuery, rootHandle, opportunityId]);

  // --- Handlers ---

  const handleGrantPermission = async () => {
    if (!pendingPermHandle) return;
    try {
      if (await verifyPermission(pendingPermHandle, true)) {
        setRootHandle(pendingPermHandle);
        setCurrentHandle(pendingPermHandle);
        setPath([]);
        setHistory([{ handle: pendingPermHandle, path: [] }]);
        setHistoryIdx(0);
        if (!rootPathDisplay) detectPathSilently(pendingPermHandle);
        setPendingPermHandle(null);
      }
    } catch (e) { }
  };

  /**
   * Persist the link to a chosen directory handle as the root, auto-resolving the
   * absolute base path via the local helper (no manual typing). Falls back to a
   * prompt only if the helper cannot locate it. Shared by "link existing" and the
   * template flow.
   */
  const resolveExactFolderPath = async (handle: FileSystemDirectoryHandle, fallbackToNameSearch = true): Promise<string> => {
    try {
      const exact = await locateFolderPathWithMarker(handle);
      if (exact) return exact;
    } catch (err) {
      console.warn('Exact folder path detection failed', err);
    }
    if (fallbackToNameSearch) {
      try {
        return (await locateFolderPath(handle)) || '';
      } catch {
        return '';
      }
    }
    return '';
  };

  const finalizeRootLink = async (handle: FileSystemDirectoryHandle, presetPath?: string) => {
    await setFolderHandle(storageKey, handle);

    let resolved = (presetPath || '').trim();
    if (!resolved) {
      setIsLocating(true);
      try {
        resolved = await resolveExactFolderPath(handle);
      } finally {
        setIsLocating(false);
      }
    }
    // Never prompt the user for the path. If auto-detection didn't resolve it
    // (helper not running yet / unusual location), leave it empty — the sidebar
    // keeps trying / offers a manual "Re-detect" button without blocking.
    if (resolved) {
      await setRootPathDisplay(storageKey, resolved);
      setRootPathDisplayVal(resolved);
    } else {
      await setRootPathDisplay(storageKey, '');
      setRootPathDisplayVal('');
    }

    // Don't mutate the live record while viewing a snapshot — the link is
    // already persisted per-revision in IndexedDB above.
    if (!isSnapshot) onUpdate({ ...opportunity, folderLinked: true });
    setRootHandle(handle);
    navigateTo(handle, [], true);
  };

  const handleChangeRoot = async () => {
    try {
      // Request readwrite so we can write the locate-marker and operate on files.
      // @ts-ignore
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await finalizeRootLink(handle);
    } catch (e) { }
  };

  /**
   * Create a project folder from a template (F4):
   *  1. User picks the TEMPLATE folder (source).
   *  2. User picks WHERE to save it (destination parent).
   *  3. A copy of the template (all files + subfolders) is created, named after
   *     the opportunity.
   *  4. The user is asked whether this new folder is the root, or whether to pick
   *     a subfolder inside it (typically a revision folder) as the root.
   */
  const handleCreateFromTemplate = async () => {
    try {
      // ── 1. Pick the template SOURCE ───────────────────────────────────
      let templateHandle: FileSystemDirectoryHandle | undefined;
      let templateOsPath: string | undefined;
      try {
        // @ts-ignore
        templateHandle = await window.showDirectoryPicker({ id: 'tl-template-src' });
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        const entered = window.prompt(
          'The browser cannot open that folder (it may contain system files).\n\nPaste the FULL Windows path of the TEMPLATE folder:\n\nExample:  C:\\Users\\Alan\\Documents\\MyTemplate',
          ''
        );
        if (!entered?.trim()) return;
        templateOsPath = entered.trim().replace(/^"|"$/g, '');
      }

      // ── 2. Pick the DESTINATION parent ────────────────────────────────
      // @ts-ignore
      const destParent = await window.showDirectoryPicker({ id: 'tl-template-dest', mode: 'readwrite' });
      if (!(await verifyPermission(destParent, true))) {
        alert('Write permission is required on the destination folder.');
        return;
      }

      // ── 3. Build the default folder name & open the naming dialog ─────
      // Default = the expediente title as-is (it already starts with the OP
      // reference since the SR import prepends it) — no extra id prefix.
      const safeTitle = (opportunity.title || '').replace(/[\/\\?%*:|"<>]/g, '').trim();
      const defaultName = safeTitle || `${opportunityId}`;
      
      setTemplateNaming({
        templateHandle,
        templatePath: templateOsPath,
        destParent,
        name: defaultName,
      });
    } catch (e: any) {
      console.error('Template creation failed', e);
      alert('Error en handleCreateFromTemplate: ' + (e.message || e));
    }
  };

  /** Runs after the user confirms the folder name in the naming dialog. */
  const confirmTemplateCreation = async () => {
    if (!templateNaming) return;
    const { templateHandle, templatePath: templateOsPath, destParent } = templateNaming as any;
    const folderName = templateNaming.name.replace(/[\/\\?%*:|"<>]/g, '').trim();
    if (!folderName) return;
    setTemplateNaming(null);

    setIsLocating(true);
    try {
      let newFolderHandle: FileSystemDirectoryHandle | undefined;
      let newFolderAbsolutePath: string | undefined;
      let resolvedDestParentPath: string | undefined;
      const resolveDestParentPath = async () => {
        if (!resolvedDestParentPath) {
          resolvedDestParentPath = (await locateFolderPathWithMarker(destParent)) ?? undefined;
        }
        return resolvedDestParentPath;
      };

      if (templateOsPath || !templateHandle) {
        // ── OS-level copy via the local helper ────────────────────────
        // Determine the destination OS path: use the typed path, or auto-detect
        // from the handle the browser opened successfully.
        const resolvedDest = await resolveDestParentPath();
        if (!resolvedDest) {
          throw new Error(
            'Could not determine the destination path.\n\n' +
            'Make sure TenderLoop is running via LANZAR_TENDERLOOP.'
          );
        }
        const helperResult = await copyTemplateFromOsPath(templateOsPath!, resolvedDest, folderName);
        if (helperResult.copied === 0 && helperResult.skipped.length > 0) {
          throw new Error(helperResult.skipped.map((i: any) => `${i.path}: ${i.reason}`).join('\n'));
        }
        newFolderAbsolutePath = helperResult.target || `${resolvedDest.replace(/[\\/]+$/, '')}\\${folderName}`;
        // Try to re-open the created folder via File System API (for the subfolder step).
        if (destParent) {
          newFolderHandle = await destParent.getDirectoryHandle(folderName, { create: false }).catch(() => undefined);
        }
      } else {
        // ── File System API copy (no system files in either folder) ───
        newFolderHandle = await destParent!.getDirectoryHandle(folderName, { create: true });
        const resolvedDest = await resolveDestParentPath();
        if (resolvedDest) {
          newFolderAbsolutePath = `${resolvedDest.replace(/[\\/]+$/, '')}\\${folderName}`;
        }
        const copyResult = { copied: 0, skipped: [] as { path: string; reason: string }[] };
        // @ts-ignore
        for await (const child of templateHandle.values()) {
          await copyTemplateEntryToDir({
            name: child.name,
            kind: child.kind,
            handle: child as unknown as FileSystemFileHandle | FileSystemDirectoryHandle,
            relativePath: [],
          }, newFolderHandle, copyResult);
        }
        if (copyResult.copied === 0 && copyResult.skipped.length > 0) {
          throw new Error(copyResult.skipped.map(i => `${i.path}: ${i.reason}`).join('\n'));
        }
        if (copyResult.skipped.length > 0) {
          alert(
            `Template copied with ${copyResult.skipped.length} skipped item(s).\n\n` +
            copyResult.skipped.slice(0, 10).map(i => `${i.path}: ${i.reason}`).join('\n') +
            (copyResult.skipped.length > 10 ? '\n...' : '')
          );
        }
      }

      setIsLocating(false);

      if (!newFolderHandle) {
        alert(`Folder "${folderName}" was created successfully.\n\nUse "Link Existing Folder" to link it to this opportunity.`);
        return;
      }

      // 4. Gather subfolders so the user can pick the root (e.g. a revision folder).
      const subfolders: { name: string; handle: FileSystemDirectoryHandle; absolutePath?: string }[] = [];
      // @ts-ignore
      for await (const child of newFolderHandle.values()) {
        if (child.kind === 'directory') {
          subfolders.push({
            name: child.name,
            handle: child as FileSystemDirectoryHandle,
            absolutePath: newFolderAbsolutePath ? `${newFolderAbsolutePath}\\${child.name}` : undefined,
          });
        }
      }
      subfolders.sort((a, b) => a.name.localeCompare(b.name));

      if (subfolders.length === 0) {
        await finalizeRootLink(newFolderHandle, newFolderAbsolutePath);
      } else {
        setTemplateChoice({ newFolderHandle, folderName, absolutePath: newFolderAbsolutePath, subfolders });
      }
    } catch (e) {
      console.error('Template creation failed', e);
      alert(e instanceof Error ? e.message : 'Could not create the folder from the template. Check permissions on the destination and try again.');
    } finally {
      setIsLocating(false);
    }
  };



  const handleGoToPath = async () => {
    if (!goToPath.trim() || !rootHandle) return;

    // Clean path
    let cleanPath = goToPath.trim().replace(/\\/g, '/');
    let rootDisplay = (rootPathInput || rootPathDisplay).replace(/\\/g, '/');

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
    setSelectedKeys(new Set());
    setAnchorKey(null);
    setSearchQuery(''); // Clear search on nav
    if (isNew) {
      const newHist = history.slice(0, historyIdx + 1);
      newHist.push({ handle, path: newPath });
      setHistory(newHist);
      setHistoryIdx(newHist.length - 1);
    }
  };

  // --- Selection (Windows-Explorer style) ---
  const displayedItems = () => (searchQuery ? searchResults : items);

  const handleRowSelect = (item: FileItem, e: React.MouseEvent) => {
    const key = item.relativePath.join('/');
    const list = displayedItems().map(i => i.relativePath.join('/'));
    if (e.ctrlKey || e.metaKey) {
      setSelectedKeys(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
      setAnchorKey(key);
    } else if (e.shiftKey && anchorKey && list.includes(anchorKey)) {
      const a = list.indexOf(anchorKey);
      const b = list.indexOf(key);
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      setSelectedKeys(new Set(list.slice(lo, hi + 1)));
    } else {
      setSelectedKeys(new Set([key]));
      setAnchorKey(key);
    }
    setSelectedItem(item);
  };

  const clearSelection = () => { setSelectedKeys(new Set()); setSelectedItem(null); setAnchorKey(null); };
  const selectedItems = (): FileItem[] => displayedItems().filter(i => selectedKeys.has(i.relativePath.join('/')));

  const ensureRevisionFamilyId = useCallback(async (item: FileItem) => {
    const fileKey = item.relativePath.join('/');
    const meta = await getMeta(opportunityId, fileKey);
    if (meta?.revisionFamilyId) return meta.revisionFamilyId;

    const legacyFamilyKey = buildRevisionFamilyKey(item.relativePath);
    const legacyHistory = await getFileRevisionHistory(opportunityId, legacyFamilyKey);
    const familyId = legacyHistory.find(entry => entry.familyId)?.familyId || crypto.randomUUID();

    await saveMeta(opportunityId, fileKey, { revisionFamilyId: familyId });
    if (legacyHistory.length > 0) {
      await assignFileRevisionFamilyId(opportunityId, legacyFamilyKey, familyId);
    }
    return familyId;
  }, [opportunityId]);

  const copyRevisionMetadataToPath = useCallback(async (item: FileItem, destRelativePath: string[]) => {
    if (item.kind !== 'file') return;
    const sourceKey = item.relativePath.join('/');
    const destKey = destRelativePath.join('/');
    const sourceMeta = await getMeta(opportunityId, sourceKey);
    const revisionFamilyId = await ensureRevisionFamilyId(item);
    await saveMeta(opportunityId, destKey, {
      ...(sourceMeta || {}),
      revisionFamilyId,
    });
  }, [ensureRevisionFamilyId, opportunityId]);

  const refreshRevisionHistory = useCallback(async (item: FileItem | null) => {
    if (!item || item.kind !== 'file') {
      setRevisionHistory([]);
      return;
    }
    try {
      const familyId = await ensureRevisionFamilyId(item);
      setRevisionHistory(await getFileRevisionHistory(opportunityId, familyId));
    } catch {
      setRevisionHistory([]);
    }
  }, [ensureRevisionFamilyId, opportunityId]);

  useEffect(() => {
    refreshRevisionHistory(selectedItem);
  }, [selectedItem, refreshRevisionHistory]);

  const handleOpenCreateRevision = async () => {
    const sel = selectedItems();
    if (sel.length !== 1 || sel[0].kind !== 'file') {
      alert('Select exactly one file to create a revision.');
      return;
    }
    const nextRevision = suggestNextRevision(sel[0].name);
    setRevisionModal({
      source: sel[0],
      sourceRevision: getRevisionFromName(sel[0].name),
      newRevision: nextRevision,
      newFileName: buildRevisionFileName(sel[0].name, nextRevision),
      contains: '',
      changes: '',
      reason: '',
    });
  };

  const handleOpenRevisionHistory = async () => {
    const sel = selectedItems();
    if (sel.length !== 1 || sel[0].kind !== 'file') {
      alert('Select exactly one file to analyze its revision history.');
      return;
    }
    await refreshRevisionHistory(sel[0]);
    setShowRevisionHistory(true);
  };

  const confirmCreateRevision = async () => {
    if (!revisionModal || !currentHandle) return;
    const newRevision = normalizeRevision(revisionModal.newRevision);
    if (!newRevision) {
      alert('Use revision format R0.0, R0.1, R1.0, etc.');
      return;
    }
    if (!revisionModal.contains.trim() || !revisionModal.changes.trim() || !revisionModal.reason.trim()) {
      alert('Complete what the file contains, what changed, and why the revision is being created.');
      return;
    }
    if (!(await verifyPermission(currentHandle, true))) {
      alert('Write permission is required on this folder.');
      return;
    }

    const source = revisionModal.source;
    const newName = revisionModal.newFileName.trim() || buildRevisionFileName(source.name, newRevision);
    if (/[\/\\?%*:|"<>]/.test(newName)) {
      alert('The file name contains invalid Windows characters.');
      return;
    }
    if (items.some(item => item.name.toLowerCase() === newName.toLowerCase())) {
      alert(`A file named "${newName}" already exists in this folder.`);
      return;
    }

    setIsCreatingRevision(true);
    try {
      const familyId = await ensureRevisionFamilyId(source);
      await copyFileAs(source.handle as FileSystemFileHandle, currentHandle, newName);
      const newRelativePath = [...source.relativePath.slice(0, -1), newName];
      const familyKey = buildRevisionFamilyKey(source.relativePath);
      await saveMeta(opportunityId, newRelativePath.join('/'), { revisionFamilyId: familyId });
      await saveFileRevisionEntry({
        opportunityId,
        familyId,
        familyKey,
        sourceFileKey: source.relativePath.join('/'),
        newFileKey: newRelativePath.join('/'),
        sourceFileName: source.name,
        newFileName: newName,
        sourceRevision: revisionModal.sourceRevision || 'No revision',
        newRevision,
        contains: revisionModal.contains.trim(),
        changes: revisionModal.changes.trim(),
        reason: revisionModal.reason.trim(),
      });
      setRevisionModal(null);
      clearSelection();
      await loadCurrentDirectory();
      setTimeout(async () => {
        const contents = await listDirectory(currentHandle, path);
        const created = contents.find(item => item.name === newName);
        if (created) {
          setSelectedItem(created);
          setSelectedKeys(new Set([created.relativePath.join('/')]));
          refreshRevisionHistory(created);
        }
      }, 80);
    } catch (err: any) {
      console.error('Create revision failed', err);
      alert(err?.message || 'Could not create the revision.');
    } finally {
      setIsCreatingRevision(false);
    }
  };

  const startEditHistory = (entry: FileRevisionEntry) => {
    setEditingHistoryId(entry.id);
    setHistoryDraft({
      contains: entry.contains,
      changes: entry.changes,
      reason: entry.reason,
    });
  };

  const saveHistoryEdit = async (entry: FileRevisionEntry) => {
    if (!historyDraft.contains.trim() || !historyDraft.changes.trim() || !historyDraft.reason.trim()) {
      alert('Complete the three history fields before saving.');
      return;
    }
    await updateFileRevisionEntry(entry.id, {
      contains: historyDraft.contains.trim(),
      changes: historyDraft.changes.trim(),
      reason: historyDraft.reason.trim(),
    });
    setEditingHistoryId(null);
    await refreshRevisionHistory(selectedItem);
  };

  const exportRevisionHistoryToExcel = async () => {
    if (!selectedItem || revisionHistory.length === 0) return;
    const XLSX = await import('xlsx');
    const rows = revisionHistory.map(entry => ({
      Revision: entry.newRevision,
      Date: new Date(entry.createdAt),
      'Updated At': entry.updatedAt ? new Date(entry.updatedAt) : '',
      'Source File': entry.sourceFileName,
      'Source Revision': entry.sourceRevision,
      'New File': entry.newFileName,
      Contains: entry.contains,
      Changes: entry.changes,
      Reason: entry.reason,
      'Source Path': entry.sourceFileKey,
      'New Path': entry.newFileKey,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 36 },
      { wch: 16 },
      { wch: 36 },
      { wch: 48 },
      { wch: 48 },
      { wch: 48 },
      { wch: 42 },
      { wch: 42 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Revision History');
    XLSX.writeFile(wb, `${sanitizeExportName(selectedItem.name)}_revision_history.xlsx`);
  };

  // --- Quick-access pins (F5) ---
  const handleTogglePin = async (item: FileItem) => {
    const key = item.relativePath.join('/');
    const next = isPinned(pins, key)
      ? await removePin(storageKey, key)
      : await addPin(storageKey, { key, name: item.name, kind: item.kind, relativePath: item.relativePath });
    setPins(next);
  };

  const handlePinSelected = async () => {
    let next = pins;
    for (const item of selectedItems()) {
      const key = item.relativePath.join('/');
      if (!isPinned(next, key)) next = await addPin(storageKey, { key, name: item.name, kind: item.kind, relativePath: item.relativePath });
    }
    setPins(next);
  };

  const openPin = async (pin: FolderPin) => {
    if (!rootHandle) return;
    try {
      if (pin.kind === 'directory') {
        let t = rootHandle;
        for (const seg of pin.relativePath) t = await t.getDirectoryHandle(seg);
        navigateTo(t, pin.relativePath, true);
      } else {
        // Navigate to the parent dir and select the file.
        const dirPath = pin.relativePath.slice(0, -1);
        let t = rootHandle;
        for (const seg of dirPath) t = await t.getDirectoryHandle(seg);
        navigateTo(t, dirPath, true);
        setTimeout(async () => {
          const contents = await listDirectory(t, dirPath);
          const found = contents.find(i => i.name === pin.name);
          if (found) { setSelectedItem(found); setSelectedKeys(new Set([pin.key])); }
        }, 120);
      }
    } catch {
      alert('Could not open the quick access. It may have been moved or deleted.');
    }
  };

  // --- Bulk OS operations (F3) ---
  const handleOpenSelected = async () => {
    const sel = selectedItems();
    if (sel.length === 0) return;
    const base = await ensureRootPath();
    if (!base) { alert(PATH_UNAVAILABLE_MSG); return; }
    try {
      await openManyNative(base, sel.map(i => i.relativePath));
    } catch (e: any) {
      alert(e?.message || 'Could not open the files.');
    }
  };

  const handleCopyToWindows = async () => {
    const sel = selectedItems();
    if (sel.length === 0) return;
    setOsClipBusy(true);
    try {
      const base = await ensureRootPath();
      if (!base) { alert(PATH_UNAVAILABLE_MSG); return; }
      await copyToOsClipboard(base, sel.map(i => i.relativePath));
      setCopySuccess('os');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (e: any) {
      alert(e?.message || 'Could not copy the files to the Windows clipboard.');
    } finally {
      setOsClipBusy(false);
    }
  };

  const handleDeleteSelected = () => {
    const sel = selectedItems();
    if (sel.length === 0 || !currentHandle) return;
    setConfirmation({
      op: 'delete',
      title: `Delete ${sel.length} item(s)`,
      source: sel.map(i => i.name).join(', '),
      sourcePath: path.join('/') || 'Root',
      onConfirm: async () => {
        for (const item of sel) {
          // @ts-ignore
          try { await currentHandle.removeEntry(item.name, { recursive: true }); } catch (e) { console.error(e); }
        }
        clearSelection();
        loadCurrentDirectory();
      }
    });
  };

  // Operations
  const handleCopy = (item: FileItem) => setClipboard({ op: 'copy', items: [item] });
  const handleCut = (item: FileItem) => setClipboard({ op: 'move', items: [item] });

  // --- In-app drag to move into a folder (F2) ---
  const TL_DRAG_MIME = 'application/x-tl-files';

  const handleRowDragStart = (item: FileItem, e: React.DragEvent) => {
    const key = item.relativePath.join('/');
    // If the dragged row isn't part of the current selection, drag just it.
    const dragging = selectedKeys.has(key) ? selectedItems() : [item];
    const keys = dragging.map(i => i.relativePath.join('/'));
    e.dataTransfer.setData(TL_DRAG_MIME, JSON.stringify(keys));
    // Best-effort OS hint: absolute path(s) as text (real file drag-out to
    // Teams/Outlook is not supported from the browser — use "Copy to Windows").
    if (rootPathDisplay) {
      const paths = dragging.map(i => `${rootPathDisplay}\\${i.relativePath.join('\\')}`);
      e.dataTransfer.setData('text/plain', paths.join('\n'));
    }
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDirDrop = async (targetDir: FileItem, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDirKey(null);
    const raw = e.dataTransfer.getData(TL_DRAG_MIME);
    if (!raw) return; // external OS files fall through to container upload handler
    let keys: string[] = [];
    try { keys = JSON.parse(raw); } catch { return; }
    const targetKey = targetDir.relativePath.join('/');
    const movers = displayedItems().filter(i =>
      keys.includes(i.relativePath.join('/')) && i.relativePath.join('/') !== targetKey
    );
    if (movers.length === 0) return;
    const destHandle = targetDir.handle as FileSystemDirectoryHandle;
    try {
      if (!(await verifyPermission(destHandle, true))) { alert('Write permission denied on the destination folder.'); return; }
      for (const item of movers) {
        if (!(await verifyPermission(item.handle, true))) {
          // @ts-ignore
          await item.handle.requestPermission({ mode: 'readwrite' });
        }
        await moveEntryToDir(item, destHandle);
        await copyRevisionMetadataToPath(item, [...targetDir.relativePath, item.name]);
      }
      clearSelection();
      loadCurrentDirectory();
    } catch (err: any) {
      console.error('Move via drag failed', err);
      alert(`Could not move: ${err.message}`);
    }
  };

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
            await copyRevisionMetadataToPath(item, [...path, item.name]);
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
        const meta = item.kind === 'file' ? await getMeta(opportunityId, item.relativePath.join('/')) : null;
        const revisionFamilyId = item.kind === 'file' ? await ensureRevisionFamilyId(item) : '';
        await renameEntry(currentHandle, item, newName);
        if (item.kind === 'file') {
          await saveMeta(opportunityId, [...item.relativePath.slice(0, -1), newName].join('/'), {
            ...(meta || {}),
            revisionFamilyId,
          });
        }
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
    const filesList = Array.from(e.dataTransfer.files) as File[];
    if (filesList.length === 0 || !currentHandle) return;

    setConfirmation({
      op: 'upload',
      title: 'Confirm Upload',
      source: `${filesList.length} files`,
      sourcePath: 'External OS Drag & Drop',
      destPath: path.join('/'),
      files: filesList,
      onConfirm: async () => {
        if (currentHandle && filesList.length > 0) {
          // Request permission to write
          if (await verifyPermission(currentHandle, true)) {
            try {
              await uploadFiles(currentHandle, filesList);
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
  const handleGoBack = () => { if (historyIdx > 0) { const e = history[historyIdx - 1]; setHistoryIdx(historyIdx - 1); setCurrentHandle(e.handle); setPath(e.path); setSelectedItem(null); } };
  const handleGoForward = () => { if (historyIdx < history.length - 1) { const e = history[historyIdx + 1]; setHistoryIdx(historyIdx + 1); setCurrentHandle(e.handle); setPath(e.path); setSelectedItem(null); } };
  const handleGoUp = async () => { if (path.length > 0 && rootHandle) { let t = rootHandle; const np = path.slice(0, -1); for (const s of np) t = await t.getDirectoryHandle(s); navigateTo(t, np); } };
  const handleBreadcrumbClick = async (idx: number) => { if (!rootHandle) return; let t = rootHandle; const np = path.slice(0, idx + 1); for (const s of np) t = await t.getDirectoryHandle(s); navigateTo(t, np); };

  // Helpers
  const handleCopyPath = async () => {
    if (!selectedItem) return;
    const base = await ensureRootPath();
    const t = `${base}\\${selectedItem.relativePath.join('\\')}`;
    navigator.clipboard.writeText(t);
    setCopySuccess('full');
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleOpenNative = async (item: FileItem) => {
    const base = await ensureRootPath();
    if (!base) { alert(PATH_UNAVAILABLE_MSG); return; }
    try {
      await openInNativeApp(base, item.relativePath);
    } catch (err: any) {
      console.error('Open native failed', err);
      alert(err?.message || 'Could not open the file.');
    }
  };
  const handleSaveRootPath = async () => { if (!rootPathInput.trim()) return; await setRootPathDisplay(storageKey, rootPathInput.trim()); setRootPathDisplayVal(rootPathInput.trim()); };

  /** Detect the absolute base path silently (no blocking spinner). Used on load. */
  const detectPathSilently = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setAutoDetecting(true);
    try {
      const p = await resolveExactFolderPath(handle);
      if (p) { await setRootPathDisplay(storageKey, p); setRootPathDisplayVal(p); return p; }
    } catch { /* ignore */ } finally { setAutoDetecting(false); }
    return null;
  }, [storageKey]);

  /**
   * Return the absolute base path, resolving it on the fly if it isn't known yet.
   * Opening / copying files needs it; rather than failing, we auto-detect now.
   */
  const ensureRootPath = async (): Promise<string> => {
    if (rootPathDisplay) return rootPathDisplay;
    if (rootHandle) {
      const p = await detectPathSilently(rootHandle);
      if (p) return p;
    }
    return '';
  };

  const PATH_UNAVAILABLE_MSG =
    'Could not detect the folder path. Make sure the local helper is running (open TenderLoop with LANZAR_TENDERLOOP), then click "Re-detect" in the Base Path panel.';

  /** User-initiated re-detection of the base path (blocking, shows spinner). */
  const handleRedetectPath = async () => {
    if (!rootHandle) return;
    setIsLocating(true);
    try {
      const p = await resolveExactFolderPath(rootHandle);
      if (p) { await setRootPathDisplay(storageKey, p); setRootPathDisplayVal(p); }
      else alert('Could not auto-detect the path. The folder may be outside the searched locations — you can set it manually.');
    } finally {
      setIsLocating(false);
    }
  };
  const updateMetaField = async (key: string, field: keyof DocMeta, value: any) => { await saveMeta(opportunityId, key, { [field]: value }); await loadMetas(items); };

  // Render Helpers
  const renderList = (fileItems: FileItem[]) => (
    <table className="w-full text-left border-collapse min-w-[800px]">
      <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
        <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          <th className="px-4 py-3 w-[30%]">Name</th>
          <th className="px-4 py-3 w-[25%]">Alias / Label</th>
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
          const isSelected = selectedKeys.has(key);
          const pinned = isPinned(pins, key);
          const isDir = item.kind === 'directory';
          const isDropTarget = dragOverDirKey === key;
          return (
            <tr
              key={key}
              onClick={(e) => handleRowSelect(item, e)}
              onDoubleClick={() => {
                if (isDir) {
                  navigateTo(item.handle as FileSystemDirectoryHandle, item.relativePath);
                } else {
                  handleOpenNative(item);
                }
              }}
              className={`group hover:bg-gray-50 cursor-pointer transition-colors select-none ${isSelected ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200' : ''} ${isDropTarget ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
              draggable
              onDragStart={(e) => handleRowDragStart(item, e)}
              onDragOver={isDir ? (e) => {
                if (e.dataTransfer.types.includes(TL_DRAG_MIME)) { e.preventDefault(); e.stopPropagation(); setDragOverDirKey(key); }
              } : undefined}
              onDragLeave={isDir ? () => setDragOverDirKey(prev => prev === key ? null : prev) : undefined}
              onDrop={isDir ? (e) => handleDirDrop(item, e) : undefined}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="shrink-0">{getFileIcon(item.extension, item.kind === 'directory')}</div>
                  <span className={`text-sm font-medium whitespace-normal break-words py-1 ${item.kind === 'directory' ? 'font-bold' : ''}`}>{item.name}</span>
                </div>
              </td>
              <td className="px-4 py-2">
                {item.kind === 'file' && (
                  <input
                    value={meta?.alias || ''}
                    onChange={(e) => updateMetaField(key, 'alias', e.target.value)}
                    placeholder="Add alias..."
                    className="w-full bg-transparent border-none text-xs font-bold text-[#3DCD58] focus:ring-1 focus:ring-[#3DCD58]/20 rounded p-1 placeholder:text-gray-300 placeholder:font-normal"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
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
                <div className={`${pinned ? 'flex' : 'hidden group-hover:flex'} gap-1 justify-end`}>
                  <button onClick={(e) => { e.stopPropagation(); handleTogglePin(item); }} title={pinned ? 'Remove quick access' : 'Create quick access'} className={`p-1 rounded ${pinned ? 'text-[#3DCD58] hover:bg-emerald-50' : 'hover:bg-gray-200'}`}>{pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}</button>
                  <button onClick={(e) => { e.stopPropagation(); handleRename(item); }} title="Rename" className="p-1 hover:bg-gray-200 rounded"><Edit3 className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleCopy(item); }} title="Copy" className="p-1 hover:bg-gray-200 rounded"><Copy className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleCut(item); }} title="Cut" className="p-1 hover:bg-gray-200 rounded"><Scissors className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} title="Delete" className="p-1 hover:bg-red-50 text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  if (!isApiSupported) return <div className="p-10 text-center">FileSystem API not supported.</div>;

  if (isResolvingRoot || isLocating) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center text-gray-400">
        <RefreshCw className="w-8 h-8 mb-4 animate-spin text-[#3DCD58]" />
        <p className="text-sm font-bold uppercase tracking-widest">{isLocating ? 'Processing folder…' : 'Loading linked folder...'}</p>
        {isLocating && <p className="text-[11px] mt-2 text-gray-400">Detecting path / copying files. This may take a few seconds.</p>}
      </div>
    );
  }

  const renderTemplateModals = () => (
    <>
      {/* Template naming (F4) — edit/confirm the new folder's name BEFORE copying */}
      {templateNaming && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in-right">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg"><FolderTree className="w-5 h-5 text-[#3DCD58]" /></div>
              <h3 className="text-lg font-bold text-gray-900">Name the new folder</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              A copy of the template will be created with this name in the folder you selected. Edit it if you want — nothing is copied until you confirm.
            </p>
            <input
              autoFocus
              value={templateNaming.name}
              onChange={e => setTemplateNaming({ ...templateNaming, name: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && templateNaming.name.trim()) confirmTemplateCreation();
                if (e.key === 'Escape') setTemplateNaming(null);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none"
              placeholder="Folder name"
            />
            {!templateNaming.name.trim() && (
              <p className="text-[10px] text-red-500 font-bold mt-1">The name cannot be empty.</p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setTemplateNaming(null)}
                className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmTemplateCreation}
                disabled={!templateNaming.name.trim()}
                className="px-4 py-2 bg-[#3DCD58] hover:bg-[#2db64a] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg font-bold text-sm"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template root/revision choice (F4) */}
      {templateChoice && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in-right">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg"><FolderTree className="w-5 h-5 text-[#3DCD58]" /></div>
              <h3 className="text-lg font-bold text-gray-900">Folder created</h3>
            </div>
            <p className="text-sm text-gray-500 mb-1 break-all"><span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded">{templateChoice.folderName}</span></p>
            <p className="text-sm text-gray-600 mb-4">Which folder should be the root for this revision?</p>

            <button
              onClick={async () => { const tc = templateChoice; setTemplateChoice(null); await finalizeRootLink(tc.newFolderHandle, tc.absolutePath); }}
              className="w-full mb-3 px-4 py-2.5 bg-[#3DCD58] text-white rounded-lg font-bold text-sm hover:bg-[#2db64a] transition-colors flex items-center justify-center gap-2"
            >
              <HardDrive className="w-4 h-4" /> Use the whole folder as root
            </button>

            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Or select a subfolder (revision)</p>
            <div className="max-h-56 overflow-y-auto space-y-1.5 mb-4">
              {templateChoice.subfolders.map(sf => (
                <button
                  key={sf.name}
                  onClick={async () => { const h = sf.handle; const absolutePath = sf.absolutePath; setTemplateChoice(null); await finalizeRootLink(h, absolutePath); }}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-emerald-50 border border-gray-100 hover:border-emerald-200 rounded-lg text-sm text-gray-700 transition-colors text-left"
                >
                  <FolderOpen className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate font-medium">{sf.name}</span>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setTemplateChoice(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {revisionModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 animate-slide-in-right">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-emerald-50 rounded-lg shrink-0"><GitBranch className="w-5 h-5 text-[#3DCD58]" /></div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900">Create revision</h3>
                  <p className="text-xs text-gray-500 truncate">{revisionModal.source.name}</p>
                </div>
              </div>
              <button onClick={() => setRevisionModal(null)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current revision</label>
                <input
                  value={revisionModal.sourceRevision || 'No revision'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">New revision</label>
                <input
                  autoFocus
                  value={revisionModal.newRevision}
                  onChange={e => {
                    const value = e.target.value.toUpperCase();
                    const normalized = normalizeRevision(value);
                    setRevisionModal({
                      ...revisionModal,
                      newRevision: value,
                      newFileName: normalized ? buildRevisionFileName(revisionModal.source.name, normalized) : revisionModal.newFileName,
                    });
                  }}
                  placeholder="R0.1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Format: R0.0, R0.1, R1.0, R1.1</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">New file name</label>
              <input
                value={revisionModal.newFileName}
                onChange={e => setRevisionModal({ ...revisionModal, newFileName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none"
                placeholder="Final file name"
              />
              <p className="text-[10px] text-gray-400 mt-1">You can edit the final copy name before creating it.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">What does this file contain?</label>
                <textarea
                  value={revisionModal.contains}
                  onChange={e => setRevisionModal({ ...revisionModal, contains: e.target.value })}
                  className="w-full min-h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none resize-y"
                  placeholder="Briefly describe the content of this revision."
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">What changed vs the previous file?</label>
                <textarea
                  value={revisionModal.changes}
                  onChange={e => setRevisionModal({ ...revisionModal, changes: e.target.value })}
                  className="w-full min-h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none resize-y"
                  placeholder="List the differences, additions, corrections, or confirm if there are no content changes."
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Why is this revision being created?</label>
                <textarea
                  value={revisionModal.reason}
                  onChange={e => setRevisionModal({ ...revisionModal, reason: e.target.value })}
                  className="w-full min-h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none resize-y"
                  placeholder="Internal review, client delivery, correction request, scope change, etc."
                />
              </div>
            </div>

            {revisionHistory.length > 0 && (
              <div className="mt-5 border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">Revision history</div>
                <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {revisionHistory.map(entry => (
                    <div key={entry.id} className="p-3 text-xs">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="font-mono font-black text-gray-900">{entry.newRevision}</span>
                        <span className="text-[10px] text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="font-bold text-gray-700 break-all">{entry.newFileName}</p>
                      <p className="text-gray-500 mt-1"><span className="font-bold">Changes:</span> {entry.changes}</p>
                      <p className="text-gray-500 mt-1"><span className="font-bold">Reason:</span> {entry.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRevisionModal(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium text-sm">Cancel</button>
              <button
                onClick={confirmCreateRevision}
                disabled={isCreatingRevision}
                className="px-4 py-2 bg-[#3DCD58] hover:bg-[#2db64a] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg font-bold text-sm flex items-center gap-2"
              >
                {isCreatingRevision && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Create revision
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevisionHistory && selectedItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-slide-in-right">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0 p-6 pb-0">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><GitBranch className="w-5 h-5 text-[#3DCD58]" /> Revision history</h3>
                <p className="text-xs text-gray-500 truncate mt-1">{selectedItem.name}</p>
              </div>
              <div className="flex items-center gap-2 p-6 pb-0">
                <button
                  onClick={exportRevisionHistoryToExcel}
                  disabled={revisionHistory.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" /> Export Excel
                </button>
                <button onClick={() => { setShowRevisionHistory(false); setEditingHistoryId(null); }} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 pb-6">
              {revisionHistory.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl mb-6">
                No revision history registered for this file family yet.
              </div>
            ) : (
              <table className="w-full min-w-[1050px] text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-gray-50 border-y border-gray-100">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="px-3 py-2 w-20">Rev</th>
                    <th className="px-3 py-2 w-32">Date</th>
                    <th className="px-3 py-2 w-52">File</th>
                    <th className="px-3 py-2">Contains</th>
                    <th className="px-3 py-2">Changes</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {revisionHistory.map(entry => {
                  const isEditing = editingHistoryId === entry.id;
                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="align-top hover:bg-gray-50">
                        <td className="px-3 py-3 font-mono font-black text-gray-900 whitespace-nowrap">
                          {entry.newRevision}
                          {entry.updatedAt && <div className="text-[9px] text-amber-600 font-sans mt-1">edited</div>}
                        </td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{new Date(entry.createdAt).toLocaleDateString()}<br /><span className="text-[10px]">{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                        <td className="px-3 py-3 font-bold text-gray-700 break-all">{entry.newFileName}</td>
                        {isEditing ? (
                          <>
                            <td className="px-3 py-3"><textarea value={historyDraft.contains} onChange={e => setHistoryDraft({ ...historyDraft, contains: e.target.value })} className="w-full min-h-24 px-2 py-1.5 border border-gray-200 rounded text-xs resize-y" /></td>
                            <td className="px-3 py-3"><textarea value={historyDraft.changes} onChange={e => setHistoryDraft({ ...historyDraft, changes: e.target.value })} className="w-full min-h-24 px-2 py-1.5 border border-gray-200 rounded text-xs resize-y" /></td>
                            <td className="px-3 py-3"><textarea value={historyDraft.reason} onChange={e => setHistoryDraft({ ...historyDraft, reason: e.target.value })} className="w-full min-h-24 px-2 py-1.5 border border-gray-200 rounded text-xs resize-y" /></td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              <button onClick={() => saveHistoryEdit(entry)} className="px-2 py-1 bg-[#3DCD58] text-white rounded text-[10px] font-bold mr-1">Save</button>
                              <button onClick={() => setEditingHistoryId(null)} className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold text-gray-500">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-3 text-gray-600 max-w-[220px]"><div className="line-clamp-3" title={entry.contains}>{entry.contains}</div></td>
                            <td className="px-3 py-3 text-gray-600 max-w-[220px]"><div className="line-clamp-3" title={entry.changes}>{entry.changes}</div></td>
                            <td className="px-3 py-3 text-gray-600 max-w-[220px]"><div className="line-clamp-3" title={entry.reason}>{entry.reason}</div></td>
                            <td className="px-3 py-3 text-right">
                              <button onClick={() => startEditHistory(entry)} className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold text-gray-600 hover:bg-gray-50">
                                Edit
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    </React.Fragment>
                  );
                })}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!rootHandle) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <FolderOpen className="w-16 h-16 text-gray-200 mb-4" />
        {pendingPermHandle ? (
          <>
            <h3 className="text-xl font-bold">Folder Access Required</h3>
            <p className="text-gray-500 mb-6 max-w-sm">A folder was previously linked. Click below to restore access.</p>
            <button onClick={handleGrantPermission} className="bg-[#3DCD58] text-white px-6 py-2 rounded-lg font-bold mb-3">Grant Folder Access</button>
            <button onClick={handleChangeRoot} className="text-sm text-gray-400 hover:text-gray-600 underline">Select a different folder</button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Project Folder Not Linked</h2>
          <p className="text-sm text-gray-500 max-w-md mb-8">
            Link a local folder to sync documents directly from your operating system without uploading them.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <button onClick={handleChangeRoot} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-6 py-2 rounded-lg font-bold shadow-sm transition-colors">
              Link Existing Folder
            </button>
            <button onClick={handleCreateFromTemplate} className="bg-[#3DCD58] hover:bg-[#2db64a] text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-colors">
              Create from Template
            </button>
          </div>
          
          <div className="mt-8 text-left bg-blue-50 p-4 rounded-xl border border-blue-100 max-w-md">  </div>
          {renderTemplateModals()}
        </div>
        )}
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
            <ArrowRightLeft className="w-3 h-3" /> Change Linked Folder
          </button>
          <button onClick={handleCreateFromTemplate} className="w-full flex items-center justify-center gap-2 text-xs font-bold bg-[#3DCD58] text-white border border-[#3DCD58] py-2 rounded-lg hover:bg-[#2db64a] shadow-sm transition-all mb-4">
            <FolderTree className="w-3.5 h-3.5" /> New from Template
          </button>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                Base Path
                <span className="text-[8px] font-bold text-[#3DCD58] bg-emerald-50 px-1 py-0.5 rounded normal-case tracking-normal">Auto</span>
              </label>
              <div className="bg-white border border-gray-200 rounded-lg p-2 space-y-2">
                {isEditingPath ? (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <input
                      autoFocus
                      value={rootPathInput}
                      onChange={e => setRootPathInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { handleSaveRootPath(); setIsEditingPath(false); }
                        if (e.key === 'Escape') setIsEditingPath(false);
                      }}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:ring-[#3DCD58] focus:border-[#3DCD58] font-mono"
                      placeholder="e.g. C:/Users/Docs/..."
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => { handleSaveRootPath(); setIsEditingPath(false); }}
                        className="flex-1 py-1.5 bg-[#3DCD58] text-white text-[10px] font-black uppercase rounded hover:bg-[#2db64a] transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingPath(false)}
                        className="flex-1 py-1.5 bg-gray-100 text-gray-500 text-[10px] font-black uppercase rounded hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] font-mono break-all bg-gray-50 p-1.5 rounded border border-gray-100 min-h-[2.5rem] flex items-center">
                      {rootPathDisplay
                        ? <span className="text-gray-500">{rootPathDisplay}</span>
                        : (autoDetecting || isLocating)
                          ? <span className="text-gray-400 italic flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Detecting automatically…</span>
                          : <span className="text-gray-300 italic">Not detected yet — click Re-detect</span>}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={handleRedetectPath}
                        title="Detect the absolute path automatically"
                        className="flex-1 py-1.5 px-2 bg-[#3DCD58] text-white text-[10px] font-black uppercase tracking-widest rounded-md hover:bg-[#2db64a] transition-colors flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3" /> Re-detect
                      </button>
                      <button
                        onClick={() => { setRootPathInput(rootPathDisplay); setIsEditingPath(true); }}
                        title="Edit manually"
                        className="py-1.5 px-2 bg-gray-100 text-gray-500 rounded-md hover:bg-gray-200 transition-colors flex items-center justify-center"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
              <p className="text-[9px] text-gray-400 leading-tight">Detected automatically when you link the folder. Used to open files in their native app.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Global Search</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                  placeholder="Search entire root..."
                />
                {isSearching && <RefreshCw className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-[#3DCD58]" />}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Go To Path</label>
              <div className="flex gap-1">
                <input
                  value={goToPath}
                  onChange={e => setGoToPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGoToPath()}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                  placeholder="C:/..."
                />
                <button onClick={handleGoToPath} className="p-1.5 bg-gray-200 rounded-lg hover:bg-gray-300"><ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <div className="text-center text-xs text-gray-400 mt-10">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
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
              <button onClick={() => navigateTo(rootHandle!, [])} className="hover:text-[#3DCD58] font-bold flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Root</button>
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
                <ClipboardPaste className="w-3.5 h-3.5" /> Paste {clipboard.op === 'move' ? 'Cut' : 'Copied'} ({clipboard.items.length})
              </button>
            )}
            <button onClick={() => createFolder(currentHandle!, prompt("Folder Name:") || '').then(() => loadCurrentDirectory())} className="p-2 hover:bg-gray-100 rounded-lg border border-transparent hover:border-gray-200 text-gray-500"><Plus className="w-4 h-4" /></button>

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
              } catch (e) { }
            }}>
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-48">
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

      {/* Quick Access (Pins) right rail — F5 */}
      <div className={`border-l border-gray-100 bg-gray-50/50 shrink-0 flex flex-col transition-all duration-200 ${showPins ? 'w-60' : 'w-10'}`}>
        <div className="p-2 border-b border-gray-100 flex items-center gap-1">
          {showPins && <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2 flex items-center gap-1.5"><Pin className="w-3 h-3" /> Quick Access</span>}
          <button onClick={() => setShowPins(s => !s)} className="p-1.5 hover:bg-gray-200 rounded ml-auto" title={showPins ? 'Collapse' : 'Quick Access'}>
            {showPins ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <Pin className="w-4 h-4 text-[#3DCD58]" />}
          </button>
        </div>
        {showPins && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {pins.length === 0 ? (
              <div className="text-center text-[11px] text-gray-400 mt-8 px-3 leading-relaxed">
                <Pin className="w-6 h-6 mx-auto mb-2 opacity-20" />
                Pin files or folders with the pin icon to keep them within reach here.
              </div>
            ) : pins.map(pin => (
              <div key={pin.key} className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 cursor-pointer transition-colors" onClick={() => openPin(pin)} title={pin.relativePath.join('/')}>
                <div className="shrink-0">{getFileIcon(pin.kind === 'directory' ? undefined : pin.name.split('.').pop()?.toLowerCase(), pin.kind === 'directory')}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{pin.name}</div>
                  <div className="text-[9px] text-gray-400 truncate">{pin.relativePath.slice(0, -1).join('/') || 'Root'}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removePin(storageKey, pin.key).then(setPins); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded shrink-0" title="Remove quick access"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
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
              <button onClick={() => handleOpenNative(selectedItem!)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50">
                <ExternalLink className="w-3.5 h-3.5" />
                Open
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
                  <button onClick={() => handleOpenNative(selectedItem!)} className="px-6 py-2.5 bg-[#3DCD58] text-white text-xs font-bold rounded-xl hover:bg-[#2db64a] shadow-lg shadow-emerald-200 transition-all">Open</button>
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

      {/* Floating Action Bar (Bottom Overlay) — supports multi-selection (F3) */}
      {selectedKeys.size >= 1 && !confirmation && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-slide-in-up border border-gray-700/50 max-w-[95vw] flex-wrap justify-center">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-[#3DCD58]" />
            <span className="text-sm font-bold truncate max-w-[220px]">
              {selectedKeys.size === 1 ? (selectedItem?.name || '1 selected') : `${selectedKeys.size} selected`}
            </span>
          </div>
          <div className="w-px h-5 bg-gray-700"></div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleOpenSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3DCD58] hover:bg-[#2db64a] rounded-lg text-xs font-bold transition-all" title="Open all in their native app"><ExternalLink className="w-3.5 h-3.5" /> Open{selectedKeys.size > 1 ? ' all' : ''}</button>
            <button onClick={handleCopyToWindows} disabled={osClipBusy} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all disabled:opacity-50" title="Copy to the Windows clipboard (paste in Explorer/Teams/Outlook)">
              {copySuccess === 'os' ? <Check className="w-3.5 h-3.5 text-[#3DCD58]" /> : <Files className="w-3.5 h-3.5" />} Copy to Windows
            </button>
            {selectedKeys.size === 1 && selectedItems()[0]?.kind === 'file' && (
              <>
                <button onClick={handleOpenCreateRevision} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-bold transition-all" title="Copy this file and register a revision history entry">
                  <GitBranch className="w-3.5 h-3.5" /> Crear revision
                </button>
                <button onClick={handleOpenRevisionHistory} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title="Analyze revision history for this file">
                  <History className="w-3.5 h-3.5" /> Historial
                </button>
              </>
            )}
            <button onClick={() => setClipboard({ op: 'copy', items: selectedItems() })} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title="Copy within the app (paste into another folder)"><Copy className="w-3.5 h-3.5" /> Copy</button>
            <button onClick={() => setClipboard({ op: 'move', items: selectedItems() })} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title="Move within the app (paste into another folder)"><Scissors className="w-3.5 h-3.5" /> Move</button>
            <button onClick={handlePinSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title="Create quick access"><Pin className="w-3.5 h-3.5" /> Pin</button>
            {selectedKeys.size === 1 && (
              <>
                <button onClick={handleCopyPath} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title="Copy path">{copySuccess === 'full' ? <Check className="w-3.5 h-3.5 text-[#3DCD58]" /> : <Copy className="w-3.5 h-3.5" />}</button>
                {isFileSelected && <button onClick={() => setShowLinkedItems(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title="Linked items"><LinkIcon className="w-3.5 h-3.5" /></button>}
              </>
            )}
            <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-lg text-xs font-bold transition-all" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <button onClick={clearSelection} className="text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700 p-1.5 rounded-full transition-colors"><X className="w-4 h-4" /></button>
        </div>
      )}


      {renderTemplateModals()}

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
