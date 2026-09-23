
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
  X,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Link as LinkIcon,
  Search,
  Scissors,
  ClipboardPaste,
  ArrowRightLeft,
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
import { setFolderHandle, verifyPermission, setRootPathDisplay, clearRootPathDisplay, clearFolderHandleOnly, getFolderHandleForRevision, getRootPathDisplayForRevision, folderKey, moveLegacyFolderLinkToRevision, getFolderHandle, resolveFolderPathFromDb, listInheritableFolderPaths, inheritFolderLinkFromRevision } from '../../services/opportunityFolderLink';
import { inheritPins, reconcileDocsForDirectory, rebindDoc, getDoc, setFolderPath, clearFolderPath } from '../../services/opportunityFolderStore';
import { listDirectory, createFolder, uploadFiles, renameEntry, openInNativeApp, searchFiles, copyEntryToDir, moveEntryToDir, locateFolderPath, locateFolderPathWithMarker, copyToOsClipboard, openManyNative, copyTemplateFromOsPath, copyFileAs, copyTemplateEntryToDir, checkOsPath, listDirByPath, moveViaHelper, toAbsolutePath, rememberFolderPathHint, getFolderPathHints, getAvailableEntryName } from './fileOps';
import { getPins, addPin, removePin, movePin, isPinned, FolderPin } from '../../services/folderPinsStore';
import { assignFileRevisionFamilyId, deleteFileRevisionEntry, getAllFileRevisionHistory, getFileRevisionHistory, saveFileRevisionEntry, updateFileRevisionEntry, FileRevisionEntry } from '../../services/fileRevisionHistoryStore';
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
  /** Reports the single selected file/folder to the expediente-level shortcut. */
  onSelectionChange?: (path: string[] | null) => void;
}

/**
 * Shortcut for "copy the containing folder path(s)" [F-2].
 *
 * Declared here so the handler and every label stay in sync. It was Ctrl+Shift+C, which Chrome
 * and Edge reserve for DevTools' inspect-element, so the browser ate the combo before the app
 * saw it. U is free in Chrome, Edge and Firefox on Windows, is a mnemonic for "Ubicacion", and
 * avoids Ctrl+Alt (that is AltGr on Spanish keyboards). To change it again, edit these two
 * lines only: the key must stay lowercase and must not be c/x/v, which the file list uses.
 */
const COPY_FOLDER_PATH_KEY = 'u';
const COPY_FOLDER_PATH_SHORTCUT = 'Ctrl+Shift+U';

const REVISION_RE = /\bR(\d+)(?:\.(\d+))?\b/i;

/** Trailing folder name of an absolute Windows path. */
const basenameOf = (absolutePath: string) =>
  (absolutePath || '').trim().replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

/**
 * Does this directory handle really point at `absolutePath`?
 *
 * The two halves of a folder link are stored independently — the handle lives in
 * this browser's IndexedDB, the absolute path in the shared database — and nothing
 * used to check that they still agreed. When they drifted apart, the tab listed the
 * contents of the folder the HANDLE pointed at while opening, copying and moving all
 * used the PATH, which is exactly the reported "the path was right but it was showing
 * another folder's files, and files I downloaded never appeared".
 *
 * Returns 'unknown' when the helper cannot answer: an unverifiable link is left alone,
 * because dropping a working link on a transient failure is worse than a stale one.
 */
const handleMatchesPath = async (
  handle: FileSystemDirectoryHandle,
  absolutePath: string,
): Promise<'match' | 'mismatch' | 'unknown'> => {
  if (!absolutePath) return 'unknown';
  if (basenameOf(absolutePath).toLowerCase() !== handle.name.toLowerCase()) return 'mismatch';

  let onDisk: { name: string }[];
  try {
    onDisk = await listDirByPath(absolutePath, []);
  } catch {
    return 'unknown'; // helper offline / path unreadable — not evidence of anything
  }

  const diskNames = new Set(onDisk.map(entry => entry.name.toLowerCase()));
  let checked = 0;
  let hits = 0;
  try {
    // @ts-ignore
    for await (const entry of handle.values()) {
      checked += 1;
      if (diskNames.has(entry.name.toLowerCase())) hits += 1;
      if (checked >= 12) break;
    }
  } catch {
    return 'unknown'; // permission lapsed mid-enumeration
  }

  if (checked === 0) return diskNames.size === 0 ? 'match' : 'mismatch';
  // Tolerant on purpose: a file renamed or deleted between the two reads must not
  // invalidate the link. Only a listing that mostly disagrees means a different folder.
  return hits * 2 >= checked ? 'match' : 'mismatch';
};

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
  return match ? `R${Number(match[1])}.${Number(match[2] || 0)}` : '';
};

const suggestNextRevision = (name: string) => {
  const current = getRevisionFromName(name);
  if (!current) return 'R0.1';
  const match = current.match(REVISION_RE);
  if (!match) return 'R0.1';
  return `R${Number(match[1])}.${Number(match[2] || 0) + 1}`;
};

const buildRevisionFamilyKey = (relativePath: string[]) => {
  const fileName = relativePath[relativePath.length - 1] || '';
  const { base, ext } = splitFileName(fileName);
  const familyBase = base.replace(/\s*[-_ ]?\bR\d+(?:\.\d+)?\b\s*$/i, '').trim();
  return [...relativePath.slice(0, -1), `${familyBase}${ext}`].join('/');
};

const buildRevisionFileName = (sourceName: string, revision: string) => {
  const { base, ext } = splitFileName(sourceName);
  const cleanedBase = base.replace(/\s*[-_ ]?\bR\d+(?:\.\d+)?\b\s*$/i, '').trim() || base;
  return `${cleanedBase} ${revision}${ext}`;
};

const sanitizeExportName = (value: string) =>
  (value || 'file').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);

export const OpportunityFolderTab: React.FC<Props> = ({ opportunityId, opportunity, onUpdate, initialFileKey, isSnapshot, onPathChange, onSelectionChange }) => {
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
  const [history, setHistory] = useState<{ handle: FileSystemDirectoryHandle | null, path: string[] }[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Path mode (no handle available in this browser, but the shared DB knows the
  // absolute path and the local helper confirmed it exists): browse read-only
  // by path via the helper. Write ops require linking the folder (picker).
  const [pathMode, setPathMode] = useState(false);
  const [helperOffline, setHelperOffline] = useState(false);
  const [missingPath, setMissingPath] = useState('');

  useEffect(() => { onPathChange?.(path); }, [path, onPathChange]);

  // Metadata & Selection
  const [metas, setMetas] = useState<Record<string, DocMeta>>({});
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingRoot, setIsResolvingRoot] = useState(true);
  // A failed directory listing used to fail silently (console.error only) — the folder just looked
  // empty or stuck, with no indication of what went wrong or how to fix it. See [F1].
  const [loadError, setLoadError] = useState<string | null>(null);
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

  useEffect(() => {
    onSelectionChange?.(selectedKeys.size === 1 && selectedItem ? selectedItem.relativePath : null);
  }, [selectedItem, selectedKeys, onSelectionChange]);

  // Quick-access pins (F5)
  const [pins, setPins] = useState<FolderPin[]>([]);
  const [showPins, setShowPins] = useState(true);

  // Auto path resolution (F1)
  const [isLocating, setIsLocating] = useState(false);      // blocking (link/template)
  const [autoDetecting, setAutoDetecting] = useState(false); // background (on load)
  /** Set when this browser's handle turned out to point somewhere else than the saved path. */
  const [handleMismatch, setHandleMismatch] = useState(false);
  /** Set when a fresh link could not be resolved to an absolute path. */
  const [pathUndetected, setPathUndetected] = useState(false);

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
    changes: string;
    reason: string;
  } | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<FileRevisionEntry[]>([]);
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const [revisionHistoryTitle, setRevisionHistoryTitle] = useState('All tracked files');
  const [revisionHistoryFamilyId, setRevisionHistoryFamilyId] = useState<string | null>(null);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [historyDraft, setHistoryDraft] = useState<{ changes: string; reason: string }>({ changes: '', reason: '' });
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) setIsApiSupported(false);
  }, []);

  // Load pins whenever the linked folder (per revision) changes.
  useEffect(() => {
    getPins(storageKey).then(setPins).catch(() => setPins([]));
  }, [storageKey]);

  // Latest opportunity/onUpdate without re-creating the callbacks that persist paths.
  const oppRef = useRef({ opportunity, onUpdate, isSnapshot: !!isSnapshot, revision });
  useEffect(() => { oppRef.current = { opportunity, onUpdate, isSnapshot: !!isSnapshot, revision }; });

  /**
   * Write-through of the resolved absolute path into the shared JSON DB
   * (opportunity.folderPaths, keyed by revision) so any other browser/machine
   * can browse/operate by path without re-linking.
   */
  const persistFolderPath = useCallback((p: string) => {
    const { isSnapshot: snap, revision: rev } = oppRef.current;
    if (snap || !p) return;
    setFolderPath(opportunityId, rev, p);
  }, [opportunityId]);

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
    if (!currentHandle && !(pathMode && rootPathDisplay)) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      let contents: FileItem[];
      if (currentHandle) {
        contents = await listDirectory(currentHandle, path);
      } else {
        // Path mode: list via the local helper by absolute path (read-only).
        const entries = await listDirByPath(rootPathDisplay, path);
        contents = entries
          .map((en): FileItem => ({
            name: en.name,
            kind: en.kind,
            pathOnly: true,
            extension: en.kind === 'file' ? en.name.split('.').pop()?.toLowerCase() : undefined,
            size: en.kind === 'file' ? en.size : undefined,
            lastModified: en.mtime,
            relativePath: [...path, en.name],
          }))
          .sort((a, b) => {
            if (a.kind === b.kind) return a.name.localeCompare(b.name);
            return a.kind === 'directory' ? -1 : 1;
          });
      }
      // Reconcile the stored attachment records against what is actually on disk
      // BEFORE reading metadata back, so a file the user renamed outside the app shows
      // up with its links intact instead of looking like an untracked new file.
      // A record whose file really is gone is flagged, never dropped.
      try {
        reconcileDocsForDirectory(
          opportunityId,
          path.join('/'),
          contents
            .filter(i => i.kind === 'file')
            .map(i => ({
              fileKey: i.relativePath.join('/'),
              name: i.name,
              size: i.size,
              mtime: i.lastModified,
            })),
        );
      } catch (err) {
        console.warn('Document reconciliation failed', err);
      }
      setItems(contents);
      await loadMetas(contents);
      // Re-validate selection: if selected item is no longer in list, clear it.
      setSelectedItem(prev => prev && contents.some(i => i.name === prev.name) ? prev : null);
    } catch (e: any) {
      console.error(e);
      const name = e?.name;
      setLoadError(
        name === 'NotAllowedError' ? 'Write/read permission was lost for this folder. Grant access again and retry.'
        : name === 'NotFoundError' ? 'This folder could not be found — it may have been moved, renamed or deleted.'
        : `Could not load this folder: ${e?.message || 'unknown error'}.`
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentHandle, path, loadMetas, pathMode, rootPathDisplay]);

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
      let handle = await getFolderHandleForRevision(opportunityId, revision);
      const rp = await getRootPathDisplayForRevision(opportunityId, revision);
      if (cancelled) return;
      // Shared-DB fallback: another browser or machine already resolved the path for
      // THIS revision, so a fresh browser starts with a working folder instead of an
      // empty "link a folder" screen. It no longer borrows a different revision's
      // path — that is what silently linked new opportunities to the wrong folder.
      const dbPath = resolveFolderPathFromDb(opportunity.folderPaths, revision);
      const effectivePath = rp || dbPath;
      setRootPathDisplayVal(effectivePath);
      setHandleMismatch(false);
      setPathUndetected(false);
      if (!rp && dbPath) {
        // Heal this browser's IndexedDB from the shared DB.
        try { await setRootPathDisplay(storageKey, dbPath); } catch { /* non-critical */ }
      }
      // Mirror an inherited/IndexedDB-only path back into the shared DB so the next
      // browser doesn't have to rediscover it either.
      if (effectivePath) persistFolderPath(effectivePath);
      // Quick access is stored relative to the folder root, so a new revision can adopt
      // the previous one's pins verbatim — the structure is the same, only the root moved.
      if (revision) {
        try {
          inheritPins(opportunityId, opportunityId, storageKey);
          const paths = opportunity.folderPaths || {};
          const donor = Object.keys(paths).find(key => key && key !== revision);
          if (donor) inheritPins(opportunityId, folderKey(opportunityId, donor), storageKey);
        } catch { /* non-critical */ }
      }
      setPendingPermHandle(null);
      setPathMode(false);
      setHelperOffline(false);
      setMissingPath('');

      // The handle and the path are stored in two different places (this browser's
      // IndexedDB and the shared database) and nothing used to check that they still
      // described the same folder. When they drifted, the tab listed one folder while
      // every native action addressed another: files dropped into the real folder
      // never appeared, renames looked ignored, and only re-linking fixed it. The path
      // is the half that is shared and helper-verified, so a mismatching handle is
      // dropped and the folder opens read-only by path until the user re-links.
      if (handle && effectivePath) {
        const agreement = await handleMatchesPath(handle, effectivePath);
        if (cancelled) return;
        if (agreement === 'mismatch') {
          try { await clearFolderHandleOnly(storageKey); } catch { /* non-critical */ }
          handle = null;
          setHandleMismatch(true);
        }
      }

      if (!handle) {
        // No handle in this browser. If the shared DB knows the path and it still
        // exists, browse read-only by path; only a truly missing path prompts a re-pick.
        if (effectivePath) {
          const status = await checkOsPath(effectivePath);
          if (cancelled) return;
          if (status === 'ok') {
            setPathMode(true);
            setHistory([{ handle: null, path: [] }]);
            setHistoryIdx(0);
          } else if (status === 'missing') {
            setMissingPath(effectivePath);
          } else {
            setHelperOffline(true);
          }
        }
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
        if (effectivePath) {
          // A path we already have has just been proven to match this handle, so leave
          // it alone. Re-detecting it on every load is what made a correct path turn
          // into a different, wrong one after restarting the app: detection can only
          // ever return a same-named folder, and replacing a verified value with a
          // fresh guess is a coin flip the user always loses.
          rememberFolderPathHint(effectivePath);
        } else {
          detectPathSilently(handle);
        }
      } else {
        // Browsers reset File System Access permission to "prompt" on almost every
        // restart, and re-granting needs a user gesture we don't have here. Rather than
        // blocking the whole tab behind a "Grant access" wall, open the folder read-only
        // by path whenever the path checks out — the contents, attachments and quick
        // links are all usable immediately, and the banner in the toolbar restores write
        // access in one click when the user actually needs it.
        setPendingPermHandle(handle);
        if (effectivePath) {
          const status = await checkOsPath(effectivePath);
          if (cancelled) return;
          if (status === 'ok') {
            setPathMode(true);
            setHistory([{ handle: null, path: [] }]);
            setHistoryIdx(0);
          }
        }
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


  /**
   * Re-list the folder whenever the user comes back to the app.
   *
   * Nothing tells a web page that a file appeared on disk, so a download saved into
   * the linked folder — or a rename done in Explorer — stayed invisible until the
   * user happened to navigate away and back. Coming back from another window is the
   * exact moment they are most likely to have just changed something out there.
   */
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (searchQuery) return;
      loadCurrentDirectory();
    };
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
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
      if (!(await verifyPermission(pendingPermHandle, true))) return;
      // The handle could not be enumerated while it was unreadable, so this is the
      // first chance to check it still describes the folder the saved path points at.
      if (rootPathDisplay && (await handleMatchesPath(pendingPermHandle, rootPathDisplay)) === 'mismatch') {
        try { await clearFolderHandleOnly(storageKey); } catch { /* non-critical */ }
        setPendingPermHandle(null);
        setHandleMismatch(true);
        alert(
          'The folder linked in this browser is not the folder this opportunity points at any more.\n\n' +
          'It has been unlinked. Use "Link folder in this browser" and pick the folder shown in Base Path.'
        );
        return;
      }
      setRootHandle(pendingPermHandle);
      setCurrentHandle(pendingPermHandle);
      setPath([]);
      setHistory([{ handle: pendingPermHandle, path: [] }]);
      setHistoryIdx(0);
      // Leave the read-only fallback now that a real handle is available.
      setPathMode(false);
      setHandleMismatch(false);
      if (!rootPathDisplay) detectPathSilently(pendingPermHandle);
      setPendingPermHandle(null);
    } catch (e) { }
  };

  /**
   * Persist the link to a chosen directory handle as the root, auto-resolving the
   * absolute base path via the local helper (no manual typing). Falls back to a
   * prompt only if the helper cannot locate it. Shared by "link existing" and the
   * template flow.
   */
  const resolveExactFolderPath = async (handle: FileSystemDirectoryHandle, fallbackToMarker = true): Promise<string> => {
    // Name + child-name hints (findDirByName / locateFolderPath) needs no write into
    // the target folder, so it's tried first. SharePoint/OneDrive-synced folders can
    // treat a write as a change to sync, and the marker file races the Windows Search
    // index before it's had a chance to pick up a file that was just created — both of
    // which made the old marker-first order unreliable (and browser-dependent, since
    // each browser's File System Access implementation flushes writes to disk on a
    // different schedule). The marker strategy is now only a fallback.
    // Paths we already know about. A folder being linked now is nearly always a
    // sibling of one linked before, so these turn a multi-second search into an
    // instant answer — and since the helper still verifies the folder's contents,
    // a stale hint can only cost time, never point at the wrong folder.
    const knownPaths: Record<string, string> = oppRef.current.opportunity.folderPaths || {};
    const near = [...Object.values(knownPaths), ...getFolderPathHints()].filter(Boolean);

    try {
      const byContent = await locateFolderPath(handle, near);
      if (byContent) {
        rememberFolderPathHint(byContent);
        return byContent;
      }
    } catch (err) {
      console.warn('Folder path detection by content failed', err);
    }
    if (fallbackToMarker) {
      try {
        return (await locateFolderPathWithMarker(handle)) || '';
      } catch {
        return '';
      }
    }
    return '';
  };

  /**
   * Point this revision at `handle` as its folder root.
   *
   * This always establishes a NEW link, so the previously stored path is never kept
   * as a fallback. Keeping it is what made "create a folder from a template for an
   * opportunity that already had one" leave the old path in place: the tab listed the
   * freshly created folder while opening, copying and Ctrl+Shift+E all went to the
   * previous one. If the path cannot be resolved we say so and clear it, because a
   * known-stale path is worse than a missing one — a missing path only disables
   * native actions, a stale path sends them somewhere else.
   */
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

    if (resolved) {
      await setRootPathDisplay(storageKey, resolved);
      rememberFolderPathHint(resolved);
      if (!isSnapshot) persistFolderPath(resolved);
    } else {
      // Drop the stale path in both stores rather than letting it survive the relink.
      try { await clearRootPathDisplay(storageKey); } catch { /* non-critical */ }
      if (!isSnapshot) clearFolderPath(opportunityId, revision);
    }
    setRootPathDisplayVal(resolved);
    setPathUndetected(!resolved);

    setPathMode(false);
    setHandleMismatch(false);
    setMissingPath('');
    setRootHandle(handle);
    navigateTo(handle, [], true);
  };

  /** Adopt another revision's folder for this one — the explicit form of what used
   *  to happen automatically (and often wrongly) whenever a revision was created. */
  const handleReuseRevisionFolder = async (fromRevision: string) => {
    setIsLocating(true);
    try {
      const { handle, path: inheritedPath } = await inheritFolderLinkFromRevision(opportunityId, fromRevision, revision);
      if (inheritedPath) {
        await setRootPathDisplay(storageKey, inheritedPath);
        setRootPathDisplayVal(inheritedPath);
        if (!isSnapshot) persistFolderPath(inheritedPath);
      }
      if (handle) {
        setPathMode(false);
        setRootHandle(handle);
        navigateTo(handle, [], true);
        return;
      }
      // No handle in this browser for the donor revision either: the path alone is
      // enough to browse read-only, which is the same state a second browser sees.
      if (inheritedPath && (await checkOsPath(inheritedPath)) === 'ok') {
        setPathMode(true);
        setHistory([{ handle: null, path: [] }]);
        setHistoryIdx(0);
        navigateTo(null, [], true);
      }
    } finally {
      setIsLocating(false);
    }
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
            'Make sure Tender Control is running via OPEN_OPPORTUNITYOS.'
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

  const navigateTo = (handle: FileSystemDirectoryHandle | null, newPath: string[], isNew = true) => {
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
      changes: '',
      reason: '',
    });
  };

  const handleOpenRevisionHistory = async () => {
    const sel = selectedItems();
    if (sel.length > 1 || (sel.length === 1 && sel[0].kind !== 'file')) {
      alert('Select one file, or clear the selection to view all revision histories.');
      return;
    }
    if (sel.length === 1) {
      const familyId = await ensureRevisionFamilyId(sel[0]);
      setRevisionHistoryFamilyId(familyId);
      setRevisionHistoryTitle(sel[0].name);
      setRevisionHistory(await getFileRevisionHistory(opportunityId, familyId));
    } else {
      setRevisionHistoryFamilyId(null);
      setRevisionHistoryTitle('All tracked files, including missing or deleted files');
      setRevisionHistory(await getAllFileRevisionHistory(opportunityId));
    }
    setShowRevisionHistory(true);
  };

  const handleOpenAllRevisionHistory = async () => {
    setRevisionHistoryFamilyId(null);
    setRevisionHistoryTitle('All tracked files, including missing or deleted files');
    setRevisionHistory(await getAllFileRevisionHistory(opportunityId));
    setShowRevisionHistory(true);
  };

  const confirmCreateRevision = async () => {
    if (!revisionModal || !currentHandle) return;
    const newRevision = normalizeRevision(revisionModal.newRevision);
    if (!newRevision) {
      alert('Use revision format R0.0, R0.1, R1.0, etc.');
      return;
    }
    if (!revisionModal.changes.trim() || !revisionModal.reason.trim()) {
      alert('Complete what changed and why the revision is being created.');
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
        contains: '',
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
      changes: entry.changes,
      reason: entry.reason,
    });
  };

  const saveHistoryEdit = async (entry: FileRevisionEntry) => {
    if (!historyDraft.changes.trim() || !historyDraft.reason.trim()) {
      alert('Complete what changed and why it changed before saving.');
      return;
    }
    await updateFileRevisionEntry(opportunityId, entry.id, {
      changes: historyDraft.changes.trim(),
      reason: historyDraft.reason.trim(),
    });
    setEditingHistoryId(null);
    setRevisionHistory(revisionHistoryFamilyId
      ? await getFileRevisionHistory(opportunityId, revisionHistoryFamilyId)
      : await getAllFileRevisionHistory(opportunityId));
  };

  const deleteHistoryEntry = async (entry: FileRevisionEntry) => {
    const confirmed = window.confirm(
      `Delete revision ${entry.newRevision} from the history?\n\nFile: ${entry.newFileName}\nDate: ${new Date(entry.createdAt).toLocaleString()}\n\nThis removes only the history entry. The physical file will not be deleted.`,
    );
    if (!confirmed) return;
    await deleteFileRevisionEntry(opportunityId, entry.id);
    setEditingHistoryId(current => current === entry.id ? null : current);
    setRevisionHistory(revisionHistoryFamilyId
      ? await getFileRevisionHistory(opportunityId, revisionHistoryFamilyId)
      : await getAllFileRevisionHistory(opportunityId));
  };

  const exportRevisionHistoryToExcel = async () => {
    if (revisionHistory.length === 0) return;
    const XLSX = await import('xlsx');
    const rows = revisionHistory.map(entry => ({
      Revision: entry.newRevision,
      Date: new Date(entry.createdAt),
      'Updated At': entry.updatedAt ? new Date(entry.updatedAt) : '',
      'Source File': entry.sourceFileName,
      'Source Revision': entry.sourceRevision,
      'New File': entry.newFileName,
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
      { wch: 42 },
      { wch: 42 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Revision History');
    XLSX.writeFile(wb, `${sanitizeExportName(selectedItem?.name || 'all_files')}_revision_history.xlsx`);
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

  /**
   * [F-3] A quick-access FILE opens directly in its native OS app, exactly like double-
   * clicking it in the list — it no longer just navigates the in-app view to where the
   * file lives. A quick-access FOLDER still navigates into it inside the Folder tab,
   * which is the behavior that already worked correctly.
   */
  const openPin = async (pin: FolderPin, revealInApp = false) => {
    if (!rootHandle) return;
    try {
      if (pin.kind === 'directory' || revealInApp) {
        const targetPath = pin.kind === 'directory' ? pin.relativePath : pin.relativePath.slice(0, -1);
        let t = rootHandle;
        for (const seg of targetPath) t = await t.getDirectoryHandle(seg);
        navigateTo(t, targetPath, true);
        if (pin.kind === 'file') {
          const contents = await listDirectory(t, targetPath);
          const file = contents.find(item => item.name === pin.name);
          if (file) {
            setSelectedItem(file);
            setSelectedKeys(new Set([file.relativePath.join('/')]));
            setAnchorKey(file.relativePath.join('/'));
          }
        }
      } else {
        await handleOpenNative({ name: pin.name, kind: 'file', relativePath: pin.relativePath } as FileItem);
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

  /**
   * Move entries into a destination folder.
   *
   * Goes through the local helper (a real OS rename) whenever the absolute base path
   * is known, and only falls back to the browser's copy-then-delete emulation when it
   * is not. The emulation is what produced "it moved in the app but not in the folder,
   * and then it would not open": if the delete half failed, the destination listing had
   * already been refreshed, so the app showed the file in a place it had never reached.
   * Both routes now verify before reporting success.
   */
  const performMove = async (movers: FileItem[], destRelativePath: string[], destHandle?: FileSystemDirectoryHandle): Promise<boolean> => {
    if (movers.length === 0) return false;

    const base = await ensureRootPath();
    if (base) {
      try {
        const destAbsolute = destRelativePath.length ? toAbsolutePath(base, destRelativePath) : base;
        const result = await moveViaHelper(movers.map(item => toAbsolutePath(base, item.relativePath)), destAbsolute);
        const movedNames = new Set(result.moved.map(entry => entry.source.split(/[\\/]/).pop()?.toLowerCase()));
        for (const item of movers) {
          if (!movedNames.has(item.name.toLowerCase())) continue;
          await copyRevisionMetadataToPath(item, [...destRelativePath, item.name]);
        }
        if (result.failed.length > 0) {
          alert(
            `${result.failed.length} item(s) could not be moved and were left where they were:\n\n` +
            result.failed.slice(0, 5).map(f => `${f.source.split(/[\\/]/).pop()}: ${f.error}`).join('\n')
          );
        }
        return result.moved.length > 0;
      } catch (err: any) {
        // Only an unreachable helper justifies the browser fallback. A helper that
        // answered and refused (name collision, locked file) made a deliberate
        // decision; copy+delete would overwrite exactly what it protected.
        if (!err?.helperUnreachable) throw err;
        console.warn('Local helper unreachable, falling back to the browser copy+delete', err);
      }
    }

    if (!destHandle) {
      alert(
        'This folder can only be moved through the local helper, which is not reachable.\n\n' +
        'Reopen Tender Control with OPEN_OPPORTUNITYOS and try again.'
      );
      return false;
    }

    if (!(await verifyPermission(destHandle, true))) {
      alert('Write permission denied on the destination folder.');
      return false;
    }

    let movedAny = false;
    for (const item of movers) {
      if (!(await verifyPermission(item.handle, true))) {
        // @ts-ignore
        await item.handle.requestPermission({ mode: 'readwrite' });
      }
      await moveEntryToDir(item, destHandle);
      // Confirm the original is really gone: a copy that survived as a duplicate is
      // not a move, and reporting it as one is how the file ended up "missing".
      let stillThere = false;
      try {
        if (item.kind === 'file') {
          // @ts-ignore
          await (currentHandle as FileSystemDirectoryHandle)?.getFileHandle(item.name);
        } else {
          // @ts-ignore
          await (currentHandle as FileSystemDirectoryHandle)?.getDirectoryHandle(item.name);
        }
        stillThere = true;
      } catch {
        stillThere = false;
      }
      if (stillThere) {
        throw new Error(`"${item.name}" was copied to the destination but could not be removed from its original folder. Both copies still exist — delete the one you do not want.`);
      }
      await copyRevisionMetadataToPath(item, [...destRelativePath, item.name]);
      movedAny = true;
    }
    return movedAny;
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
    try {
      await performMove(movers, targetDir.relativePath, targetDir.handle as FileSystemDirectoryHandle | undefined);
      clearSelection();
      loadCurrentDirectory();
    } catch (err: any) {
      console.error('Move via drag failed', err);
      alert(`Could not move: ${err.message}`);
      loadCurrentDirectory();
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
          if (clipboard.op === 'move') {
            await performMove(clipboard.items, path, currentHandle);
          } else {
            for (const item of clipboard.items) {
              if (!(await verifyPermission(item.handle, false))) {
                // @ts-ignore
                await item.handle.requestPermission({ mode: 'read' });
              }
              // Pasting a duplicate name would otherwise silently overwrite what's already there.
              const destName = await getAvailableEntryName(currentHandle, item.name, item.kind);
              await copyEntryToDir(item, currentHandle, destName);
              await copyRevisionMetadataToPath(item, [...path, destName]);
            }
          }
          setClipboard(null);
          loadCurrentDirectory();
        } catch (e: any) {
          console.error("Paste failed", e);
          alert(`Failed to ${opName.toLowerCase()} items: ${e.message}`);
          loadCurrentDirectory();
        }
      }
    });
  };

  // Ctrl/Cmd+C / X / V over the file list, matching Windows Explorer, plus the copy-folder-path
  // combo below. Skipped while an editable field (alias input, search box, rename prompt, etc.)
  // has focus so normal text copy/paste survives.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'x' && key !== 'v' && key !== COPY_FOLDER_PATH_KEY) return;
      const target = e.target as HTMLElement | null;
      const isEditable = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
      if (isEditable) return;
      const sel = selectedItems();
      // [F-2] Copy folder path(s). This used to be Ctrl+Shift+C, which Chrome and Edge reserve
      // for DevTools' inspect-element: the browser swallowed the combo and the copy silently
      // failed. Plain Ctrl+U (view source) is left alone — only the Shift variant is claimed.
      if (key === COPY_FOLDER_PATH_KEY) {
        if (e.shiftKey && sel.length > 0) { e.preventDefault(); handleCopyContainingFolderPaths(); }
        return;
      }
      if (key === 'c' && sel.length > 0) { e.preventDefault(); setClipboard({ op: 'copy', items: sel }); }
      else if (key === 'x' && sel.length > 0) { e.preventDefault(); setClipboard({ op: 'move', items: sel }); }
      else if (key === 'v' && clipboard) { e.preventDefault(); handlePaste(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // handleCopyContainingFolderPaths is intentionally omitted from deps: it is declared
    // later in this component and only invoked from the event callback (after render
    // completes), so referencing it here would throw a temporal-dead-zone error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys, displayedItems, clipboard, handlePaste]);

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
    // File extensions are part of the file type, not the editable display name.
    // Keep them out of the prompt and append the original one after the user edits
    // the base name so a rename cannot inadvertently change (or remove) it.
    const { base, ext } = item.kind === 'file' ? splitFileName(item.name) : { base: item.name, ext: '' };
    const requestedName = prompt(
      item.kind === 'file' ? 'Enter new name (extension will be kept):' : 'Enter new name:',
      base,
    );
    if (requestedName === null) return;
    const newName = item.kind === 'file' ? `${requestedName}${ext}` : requestedName;
    if (!newName || newName === item.name || !currentHandle) return;

    try {
      if (await verifyPermission(currentHandle, true)) {
        const oldKey = item.relativePath.join('/');
        const newKey = [...item.relativePath.slice(0, -1), newName].join('/');
        // Resolve the family id BEFORE the rename, while the record still answers to
        // the old key.
        if (item.kind === 'file') await ensureRevisionFamilyId(item);
        await renameEntry(currentHandle, item, newName);
        if (item.kind === 'file') {
          // MOVE the existing record instead of copying its fields to a second one.
          // Copying left the original behind as an orphan pointing at a path that no
          // longer exists, so the same document showed up twice — once linked, once
          // "missing". rebindDoc keeps a single record, keeps its links, and records
          // the old name so the file is still recognised if it is ever renamed back.
          const existing = getDoc(opportunityId, oldKey);
          if (existing) rebindDoc(opportunityId, existing.id, newKey);
        }
        // Quick-access pins address the same path, so move them with the file.
        const pinned = pins.find(p => p.key === oldKey);
        if (pinned) {
          await removePin(storageKey, oldKey);
          const next = await addPin(storageKey, {
            key: newKey,
            name: newName,
            kind: pinned.kind,
            relativePath: [...pinned.relativePath.slice(0, -1), newName],
          });
          setPins(next);
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
  const handleGoUp = async () => {
    if (path.length === 0) return;
    const np = path.slice(0, -1);
    if (!rootHandle) { if (pathMode) navigateTo(null, np); return; }
    let t = rootHandle; for (const s of np) t = await t.getDirectoryHandle(s); navigateTo(t, np);
  };
  const handleBreadcrumbClick = async (idx: number) => {
    const np = path.slice(0, idx + 1);
    if (!rootHandle) { if (pathMode) navigateTo(null, np); return; }
    let t = rootHandle; for (const s of np) t = await t.getDirectoryHandle(s); navigateTo(t, np);
  };

  // Helpers
  const handleCopyPath = async () => {
    if (!selectedItem) return;
    const base = await ensureRootPath();
    const t = `${base}\\${selectedItem.relativePath.join('\\')}`;
    navigator.clipboard.writeText(t);
    setCopySuccess('full');
    setTimeout(() => setCopySuccess(null), 2000);
  };

  /**
   * [F-2] Keyboard-only shortcut (COPY_FOLDER_PATH_SHORTCUT), distinct from the "Copy path" button
   * (handleCopyPath, which copies the exact path of the single selected item). This
   * one copies FOLDER paths: for a selected folder, its own path; for a selected file,
   * the path of the folder that CONTAINS it (never the file's own path). Works with
   * multi-selection, deduplicating repeated containing folders.
   */
  const handleCopyContainingFolderPaths = async () => {
    const sel = selectedItems();
    if (!sel.length) return;
    const base = await ensureRootPath();
    if (!base) { alert(PATH_UNAVAILABLE_MSG); return; }
    const folderRelPaths = new Map<string, string[]>();
    for (const item of sel) {
      const folderRel = item.kind === 'directory' ? item.relativePath : item.relativePath.slice(0, -1);
      folderRelPaths.set(folderRel.join('\\'), folderRel);
    }
    const text = [...folderRelPaths.values()]
      .map(rel => (rel.length ? `${base}\\${rel.join('\\')}` : base))
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopySuccess('folder');
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
  const handleSaveRootPath = async () => {
    if (!rootPathInput.trim()) return;
    const value = rootPathInput.trim();
    await setRootPathDisplay(storageKey, value);
    setRootPathDisplayVal(value);
    persistFolderPath(value);
    rememberFolderPathHint(value);
    setPathUndetected(false);
  };

  /** Detect the absolute base path silently (no blocking spinner). Used on load. */
  const detectPathSilently = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setAutoDetecting(true);
    try {
      const p = await resolveExactFolderPath(handle);
      if (p) {
        await setRootPathDisplay(storageKey, p);
        setRootPathDisplayVal(p);
        persistFolderPath(p);
        setPathUndetected(false);
        return p;
      }
    } catch { /* ignore */ } finally { setAutoDetecting(false); }
    return null;
  }, [storageKey, persistFolderPath]);

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
    'Could not detect the folder path. Make sure the local helper is running (open Tender Control with OPEN_OPPORTUNITYOS), then click "Re-detect" in the Base Path panel.';

  /** User-initiated re-detection of the base path (blocking, shows spinner). */
  const handleRedetectPath = async () => {
    if (!rootHandle) return;
    setIsLocating(true);
    try {
      const p = await resolveExactFolderPath(rootHandle);
      if (p) {
        await setRootPathDisplay(storageKey, p);
        setRootPathDisplayVal(p);
        persistFolderPath(p);
        setPathUndetected(false);
      }
      else alert('The folder path could not be detected yet. Keep Tender Control open and try again in a few seconds. You do not need to enter the path manually.');
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
                  <span
                    className={`text-sm font-medium whitespace-normal break-words py-1 ${item.kind === 'directory' ? 'font-bold' : ''}`}
                  >{item.name}</span>
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

  // Folders linked to OTHER revisions of this opportunity. Offered as a one-click
  // reuse on the unlinked screen instead of being adopted behind the user's back.
  const inheritableFolders = isSnapshot ? [] : listInheritableFolderPaths(opportunity.folderPaths, revision);

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
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">What changed?</label>
                <textarea
                  value={revisionModal.changes}
                  onChange={e => setRevisionModal({ ...revisionModal, changes: e.target.value })}
                  className="w-full min-h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none resize-y"
                  placeholder="List the differences, additions, corrections, or confirm if there are no content changes."
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Why did it change?</label>
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

      {showRevisionHistory && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-slide-in-right">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0 p-6 pb-0">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><GitBranch className="w-5 h-5 text-[#3DCD58]" /> Revision history</h3>
                <p className="text-xs text-gray-500 truncate mt-1">{revisionHistoryTitle}</p>
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
                No revision history is registered for this selection.
              </div>
            ) : (
              <table className="w-full min-w-[850px] text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-gray-50 border-y border-gray-100">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="px-3 py-2 w-20">Rev</th>
                    <th className="px-3 py-2 w-32">Date</th>
                    <th className="px-3 py-2 w-52">File</th>
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
                            <td className="px-3 py-3"><textarea value={historyDraft.changes} onChange={e => setHistoryDraft({ ...historyDraft, changes: e.target.value })} className="w-full min-h-24 px-2 py-1.5 border border-gray-200 rounded text-xs resize-y" /></td>
                            <td className="px-3 py-3"><textarea value={historyDraft.reason} onChange={e => setHistoryDraft({ ...historyDraft, reason: e.target.value })} className="w-full min-h-24 px-2 py-1.5 border border-gray-200 rounded text-xs resize-y" /></td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              <button onClick={() => saveHistoryEdit(entry)} className="px-2 py-1 bg-[#3DCD58] text-white rounded text-[10px] font-bold mr-1">Save</button>
                              <button onClick={() => setEditingHistoryId(null)} className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold text-gray-500">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-3 text-gray-600 max-w-[220px]"><div className="line-clamp-3" title={entry.changes}>{entry.changes}</div></td>
                            <td className="px-3 py-3 text-gray-600 max-w-[220px]"><div className="line-clamp-3" title={entry.reason}>{entry.reason}</div></td>
                            <td className="px-3 py-3 text-right">
                              <button onClick={() => startEditHistory(entry)} className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold text-gray-600 hover:bg-gray-50">
                                Edit
                              </button>
                              <button onClick={() => deleteHistoryEntry(entry)} className="ml-1 px-2 py-1 bg-white border border-red-200 rounded text-[10px] font-bold text-red-600 hover:bg-red-50">
                                Delete
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

  // PATH MODE must pass through here. This guard used to be `if (!rootHandle)`, which
  // made the whole shared-path fallback dead code: a browser that had never linked the
  // folder resolved the absolute path from the database, confirmed it on disk, set
  // pathMode — and was then shown "Project Folder Not Linked" anyway, because a
  // directory handle is by definition absent in that mode. That is why changing browser
  // looked like every folder had to be linked again.
  if (!rootHandle && !pathMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <FolderOpen className="w-16 h-16 text-gray-200 mb-4" />
        {missingPath ? (
          <>
            <h3 className="text-xl font-bold">Folder Path No Longer Valid</h3>
            <p className="text-gray-500 mb-2 max-w-md">This opportunity is linked to a folder that is no longer at:</p>
            <p className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-6 max-w-md break-all">{missingPath}</p>
            <p className="text-gray-500 mb-6 max-w-md text-sm">
              Point it at the folder's new location — every attachment, quick link and history entry is kept and will
              re-attach automatically, because they are all stored relative to this folder.
            </p>
            <button onClick={handleChangeRoot} className="bg-[#3DCD58] text-white px-6 py-2 rounded-lg font-bold mb-3">Select the folder's new location</button>
            {renderTemplateModals()}
          </>
        ) : helperOffline ? (
          <>
            <h3 className="text-xl font-bold">Local Helper Not Running</h3>
            <p className="text-gray-500 mb-6 max-w-md">
              This opportunity has a linked folder, but the path could not be verified because the local helper
              (port 3099) is not reachable. Nothing has been lost — close Tender Control and reopen it with
              OPEN_OPPORTUNITYOS, or link the folder directly in this browser.
            </p>
            <button onClick={handleChangeRoot} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-6 py-2 rounded-lg font-bold shadow-sm">Link the folder in this browser</button>
            {renderTemplateModals()}
          </>
        ) : pendingPermHandle ? (
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
            Choose how this opportunity gets its folder. Nothing is linked automatically — a folder picked for
            you is a folder that can be the wrong one.
          </p>
          <div data-tutorial="link-folder" className="flex gap-4 flex-wrap justify-center">
            <button onClick={handleChangeRoot} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-6 py-2 rounded-lg font-bold shadow-sm transition-colors">
              Link Existing Folder
            </button>
            <button onClick={handleCreateFromTemplate} className="bg-[#3DCD58] hover:bg-[#2db64a] text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-colors">
              Create from Template
            </button>
          </div>

          {/* Another revision of this same opportunity already has a folder. Reusing it
              is usually right, but it is offered rather than assumed: silently adopting
              it is what linked new revisions to the previous revision's folder before
              the user had chosen anything. */}
          {inheritableFolders.length > 0 && (
            <div className="mt-8 w-full max-w-md text-left bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Reuse a folder from another revision
              </p>
              <div className="space-y-2">
                {inheritableFolders.map(entry => (
                  <button
                    key={entry.revision}
                    onClick={() => handleReuseRevisionFolder(entry.revision)}
                    className="w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-[#3DCD58] hover:bg-emerald-50/40 transition-colors"
                  >
                    <span className="text-xs font-bold text-gray-700">{entry.revision}</span>
                    <span className="block text-[10px] font-mono text-gray-400 break-all">{entry.path}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
          {/* Read-only path mode: the folder is open and fully browsable, but editing
              files needs a directory handle this browser doesn't currently hold. */}
          {/* This browser's folder link no longer described the folder the saved path
              points at, so it was dropped in favour of the path. Without this the tab
              silently listed one folder while opening files from another. */}
          {handleMismatch && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Link repaired</p>
              <p className="mt-1 text-[11px] leading-snug text-rose-800">
                The folder linked in this browser pointed somewhere else than the saved path, so it was
                discarded. You are seeing the saved path. Re-link to restore editing.
              </p>
            </div>
          )}
          {/* A freshly linked folder whose absolute path could not be resolved. Saying so
              is the point: the old path is deliberately NOT kept, because native actions
              would then silently address the previous folder. */}
          {pathUndetected && !rootPathDisplay && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Path not detected</p>
              <p className="mt-1 text-[11px] leading-snug text-amber-800">
                The folder is linked and browsable, but its Windows path is unknown, so opening files in their
                native app is disabled. Use Re-detect below, or paste the path manually.
              </p>
            </div>
          )}
          {pathMode && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Read-only</p>
              <p className="mt-1 text-[11px] leading-snug text-amber-800">
                Opened by saved path. Files open normally; creating, renaming or deleting needs folder access.
              </p>
              <button
                onClick={pendingPermHandle ? handleGrantPermission : handleChangeRoot}
                className="mt-2 w-full rounded-md bg-amber-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
              >
                {pendingPermHandle ? 'Restore full access' : 'Link folder in this browser'}
              </button>
            </div>
          )}
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
              <button onClick={() => navigateTo(rootHandle, [])} className="hover:text-[#3DCD58] font-bold flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Root</button>
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

            <button onClick={handleOpenAllRevisionHistory} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm" title="View revision history even when a physical file was moved or deleted">
              <History className="w-3.5 h-3.5" /> All revision history
            </button>

            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] shadow-sm transition-colors" onClick={async () => {
              try {
                // @ts-ignore
                const handles = await window.showOpenFilePicker({ multiple: true });
                if (handles.length > 0 && currentHandle) {
                  if (await verifyPermission(currentHandle, true)) {
                    await uploadFiles(currentHandle, await Promise.all(handles.map(handle => handle.getFile())));
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
          {loadError && (
            <div className="m-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              <span>{loadError}</span>
              <button onClick={loadCurrentDirectory} className="shrink-0 flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 font-bold text-red-700 hover:bg-red-100">
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Retry
              </button>
            </div>
          )}
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
            ) : pins.map((pin, pinIndex) => (
              <div key={pin.key} className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 cursor-pointer transition-colors" onClick={(event) => openPin(pin, event.shiftKey)} title={`${pin.relativePath.join('/')} · Shift+click: show in Folder`}>
                <div className="shrink-0">{getFileIcon(pin.kind === 'directory' ? undefined : pin.name.split('.').pop()?.toLowerCase(), pin.kind === 'directory')}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{pin.name}</div>
                  <div className="text-[9px] text-gray-400 truncate">{pin.relativePath.slice(0, -1).join('/') || 'Root'}</div>
                </div>
                <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100">
                  <button disabled={pinIndex === 0} onClick={(e) => { e.stopPropagation(); movePin(storageKey, pin.key, -1).then(setPins); }} className="rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-25" title="Move up"><ChevronUp className="h-3 w-3" /></button>
                  <button disabled={pinIndex === pins.length - 1} onClick={(e) => { e.stopPropagation(); movePin(storageKey, pin.key, 1).then(setPins); }} className="rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-25" title="Move down"><ChevronDown className="h-3 w-3" /></button>
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
                <button data-tutorial="create-file-revision" onClick={handleOpenCreateRevision} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-bold transition-all" title="Copy this file and register a revision history entry">
                  <GitBranch className="w-3.5 h-3.5" /> Create revision
                </button>
                <button onClick={handleOpenRevisionHistory} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title="Analyze revision history for this file">
                  <History className="w-3.5 h-3.5" /> Revision history
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
            <button onClick={handleCopyContainingFolderPaths} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all" title={`Copy folder path(s) — ${COPY_FOLDER_PATH_SHORTCUT}. For a selected file, copies the path of the folder that contains it.`}>{copySuccess === 'folder' ? <Check className="w-3.5 h-3.5 text-[#3DCD58]" /> : <FolderOpen className="w-3.5 h-3.5" />}</button>
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
