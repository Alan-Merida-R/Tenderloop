
import { FileItem } from './types';

export const listDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  path: string[] = []
): Promise<FileItem[]> => {
  const entries = [];
  // @ts-ignore
  for await (const entry of directoryHandle.values()) {
    entries.push(entry);
  }

  const items: FileItem[] = await Promise.all(entries.map(async (entry) => {
    const item: FileItem = {
      name: entry.name,
      kind: entry.kind,
      handle: entry as unknown as FileSystemFileHandle | FileSystemDirectoryHandle,
      relativePath: [...path, entry.name]
    };

    if (item.kind === 'file') {
      item.extension = entry.name.split('.').pop()?.toLowerCase();
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        item.size = file.size;
        item.lastModified = file.lastModified;
      } catch (e) {}
    }
    return item;
  }));

  return items.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
};

export const createFolder = async (
  parentHandle: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> => {
  return await parentHandle.getDirectoryHandle(name, { create: true });
};

export const uploadFiles = async (
  targetHandle: FileSystemDirectoryHandle,
  files: FileList | File[]
): Promise<void> => {
  for (const file of Array.from(files)) {
    const fileHandle = await targetHandle.getFileHandle(file.name, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
  }
};

// Robust Copy Logic
export const copyEntryToDir = async (entry: FileItem, destDir: FileSystemDirectoryHandle, destName?: string) => {
  const name = destName || entry.name;
  if (entry.kind === 'file') {
    const file = await (entry.handle as FileSystemFileHandle).getFile();
    const newFile = await destDir.getFileHandle(name, { create: true });
    // @ts-ignore
    const writable = await newFile.createWritable();
    await writable.write(file);
    await writable.close();
  } else {
    const newDir = await destDir.getDirectoryHandle(name, { create: true });
    // @ts-ignore
    for await (const child of (entry.handle as FileSystemDirectoryHandle).values()) {
      await copyEntryToDir({
        name: child.name,
        kind: child.kind,
        handle: child as unknown as FileSystemFileHandle | FileSystemDirectoryHandle,
        relativePath: []
      }, newDir);
    }
  }
};

// Windows-style dedupe for a paste that lands on an existing name: "file.docx" -> "file - copy.docx"
// -> "file - copy (2).docx"... Without this, copyEntryToDir's create:true silently overwrites whatever
// was already there under that name.
export const getAvailableEntryName = async (
  destDir: FileSystemDirectoryHandle,
  name: string,
  kind: 'file' | 'directory'
): Promise<string> => {
  const dotIndex = kind === 'file' ? name.lastIndexOf('.') : -1;
  const hasExt = dotIndex > 0;
  const base = hasExt ? name.slice(0, dotIndex) : name;
  const ext = hasExt ? name.slice(dotIndex) : '';
  const exists = async (candidateName: string) => {
    try {
      if (kind === 'file') await destDir.getFileHandle(candidateName);
      else await destDir.getDirectoryHandle(candidateName);
      return true;
    } catch {
      return false;
    }
  };
  if (!(await exists(name))) return name;
  let attempt = 1;
  let candidate = `${base} - copy${ext}`;
  while (await exists(candidate)) {
    attempt++;
    candidate = `${base} - copy (${attempt})${ext}`;
  }
  return candidate;
};

export const copyFileAs = async (
  sourceHandle: FileSystemFileHandle,
  destDir: FileSystemDirectoryHandle,
  newName: string
): Promise<FileSystemFileHandle> => {
  const file = await sourceHandle.getFile();
  const newFileHandle = await destDir.getFileHandle(newName, { create: true });
  // @ts-ignore
  const writable = await newFileHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return newFileHandle;
};

export interface CopyTemplateResult {
  copied: number;
  skipped: { path: string; reason: string }[];
}

const shouldSkipTemplateEntry = (name: string): boolean => {
  const lower = name.toLowerCase();
  return (
    lower === 'desktop.ini' ||
    lower === 'thumbs.db' ||
    lower === '.ds_store' ||
    lower === '$recycle.bin' ||
    lower === 'system volume information'
  );
};

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message || err.name;
  return String(err || 'Unknown error');
};

/**
 * Best-effort recursive copy for opportunity templates. Some Windows folders
 * include protected/system metadata files; those should not abort the template
 * flow because they are not part of the user's project content.
 */
export const copyTemplateEntryToDir = async (
  entry: FileItem,
  destDir: FileSystemDirectoryHandle,
  result: CopyTemplateResult = { copied: 0, skipped: [] }
): Promise<CopyTemplateResult> => {
  const path = [...(entry.relativePath || []), entry.name].filter(Boolean).join('/');

  if (shouldSkipTemplateEntry(entry.name)) {
    result.skipped.push({ path, reason: 'System metadata file skipped' });
    return result;
  }

  try {
    if (entry.kind === 'file') {
      const file = await (entry.handle as FileSystemFileHandle).getFile();
      const newFile = await destDir.getFileHandle(entry.name, { create: true });
      // @ts-ignore
      const writable = await newFile.createWritable();
      await writable.write(file);
      await writable.close();
      result.copied += 1;
      return result;
    }

    const newDir = await destDir.getDirectoryHandle(entry.name, { create: true });
    result.copied += 1;
    // @ts-ignore
    for await (const child of (entry.handle as FileSystemDirectoryHandle).values()) {
      await copyTemplateEntryToDir({
        name: child.name,
        kind: child.kind,
        handle: child as unknown as FileSystemFileHandle | FileSystemDirectoryHandle,
        relativePath: [...(entry.relativePath || []), entry.name],
      }, newDir, result);
    }
  } catch (err) {
    result.skipped.push({ path, reason: errorMessage(err) });
  }

  return result;
};

export const copyTemplateFromOsPath = async (
  sourcePath: string,
  destParentPath: string,
  folderName: string
): Promise<CopyTemplateResult & { target?: string }> => {
  const qs = new URLSearchParams({
    source: sourcePath,
    destParent: destParentPath,
    folderName,
  }).toString();

  let resp: Response;
  try {
    resp = await fetch(`${OPEN_HELPER_URL}/copy-template?${qs}`);
  } catch {
    throw new Error('Could not connect to the local helper (port 3099). Open Tender Control with OPEN_OPPORTUNITYOS.');
  }

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body?.error || `Template copy failed with error ${resp.status}`);
  }

  return {
    copied: body?.copied || 0,
    skipped: Array.isArray(body?.skipped) ? body.skipped : [],
    target: body?.target,
  };
};

// Robust Move Logic (Copy + Delete)
export const moveEntryToDir = async (entry: FileItem, destDir: FileSystemDirectoryHandle) => {
  // Native move is often restricted or flaky across handles. We use Copy + Delete.
  await copyEntryToDir(entry, destDir);
  // @ts-ignore
  await entry.handle.remove({ recursive: true });
};

// Robust Rename Logic
export const renameEntry = async (
  parentHandle: FileSystemDirectoryHandle,
  entry: FileItem,
  newName: string
): Promise<void> => {
  if (entry.name === newName) return;

  // @ts-ignore
  if (entry.handle.move) {
    try {
      // @ts-ignore
      await entry.handle.move(newName);
      return;
    } catch (e) {
      // Fallback if native move/rename fails
      console.warn("Native rename failed, falling back to copy-delete", e);
    }
  }

  // Fallback: Copy to new name, delete old
  if (entry.kind === 'file') {
    const file = await (entry.handle as FileSystemFileHandle).getFile();
    const newFileHandle = await parentHandle.getFileHandle(newName, { create: true });
    // @ts-ignore
    const writable = await newFileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    // @ts-ignore
    await entry.handle.remove();
  } else {
    const newDir = await parentHandle.getDirectoryHandle(newName, { create: true });
    // Recursively copy content
    // @ts-ignore
    for await (const child of (entry.handle as FileSystemDirectoryHandle).values()) {
      await copyEntryToDir({
        name: child.name,
        kind: child.kind,
        handle: child as unknown as FileSystemFileHandle | FileSystemDirectoryHandle,
        relativePath: []
      }, newDir);
    }
    // @ts-ignore
    await entry.handle.remove({ recursive: true });
  }
};

export const deleteEntry = async (
  parentHandle: FileSystemDirectoryHandle,
  name: string
): Promise<void> => {
  await parentHandle.removeEntry(name, { recursive: true });
};

const OPEN_HELPER_URL = 'http://127.0.0.1:3099';

const buildAbsolutePath = (rootPathDisplay: string, relativePath: string[]): string => {
  const root = (rootPathDisplay || '').trim().replace(/[\/\\]+$/, '');
  if (!root) throw new Error('Base path is not set. Configure the "Base Path" in the sidebar first.');
  const rel = relativePath.join('\\');
  return `${root}\\${rel}`;
};

export const openInNativeApp = async (
  rootPathDisplay: string,
  relativePath: string[]
): Promise<void> => {
  const absolute = buildAbsolutePath(rootPathDisplay, relativePath);
  return openAbsolutePath(absolute);
};

/** Open an absolute Windows file or folder path through the local OS helper. */
export const openAbsolutePath = async (absolute: string): Promise<void> => {
  const qs = new URLSearchParams({ path: absolute }).toString();

  let resp: Response;
  try {
    resp = await fetch(`${OPEN_HELPER_URL}/open?${qs}`);
  } catch (err) {
    throw new Error(
      'Could not connect to the local helper (port 3099).\n' +
      'Close Tender Control and reopen it with OPEN_OPPORTUNITYOS to start the helper.'
    );
  }

  if (!resp.ok) {
    let msg = `Error ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(`Could not open "${absolute}": ${msg}`);
  }
};

/**
 * Build an absolute path from the linked root display path + a relative path.
 * Exported so the UI can compute paths for multi-file OS operations.
 */
export const toAbsolutePath = (rootPathDisplay: string, relativePath: string[]): string =>
  buildAbsolutePath(rootPathDisplay, relativePath);

/**
 * Open several files/folders in their native apps. Tries the batch endpoint
 * (`/open-many`), but falls back to opening each one via the always-present
 * `/open` endpoint so it works even if the local helper hasn't been updated.
 */
export const openManyNative = async (rootPathDisplay: string, relativePaths: string[][]): Promise<void> => {
  const absolutes = relativePaths.map(rel => buildAbsolutePath(rootPathDisplay, rel));
  const qs = new URLSearchParams({ paths: JSON.stringify(absolutes) }).toString();
  const resp = await fetch(`${OPEN_HELPER_URL}/open-many?${qs}`).catch(() => null);
  if (resp && resp.ok) return;
  // Fallback: open each path individually via the legacy single-open endpoint.
  for (const rel of relativePaths) {
    await openInNativeApp(rootPathDisplay, rel);
  }
};

/**
 * Copy real files to the Windows clipboard via the local helper, so the user
 * can paste them (Ctrl+V) into Explorer, Outlook or Teams.
 */
export const copyToOsClipboard = async (rootPathDisplay: string, relativePaths: string[][]): Promise<number> => {
  const absolutes = relativePaths.map(rel => buildAbsolutePath(rootPathDisplay, rel));
  const qs = new URLSearchParams({ paths: JSON.stringify(absolutes) }).toString();
  let resp: Response;
  try {
    resp = await fetch(`${OPEN_HELPER_URL}/clipboard?${qs}`);
  } catch {
    throw new Error('Could not connect to the local helper (port 3099). Open Tender Control with OPEN_OPPORTUNITYOS.');
  }
  if (!resp.ok) {
    let msg = `Error ${resp.status}`;
    try { const b = await resp.json(); if (b?.error) msg = b.error; } catch {}
    throw new Error(`Could not copy the files: ${msg}`);
  }
  const body = await resp.json().catch(() => ({}));
  return body?.count || relativePaths.length;
};

export interface MoveResult {
  moved: { source: string; target: string }[];
  failed: { source: string; error: string }[];
}

/**
 * Move files/folders on disk through the local helper (a real OS rename).
 *
 * The File System Access API has no move: the app had to copy the entry and then
 * delete the original. When the delete half failed — locked file, OneDrive
 * placeholder, a handle whose permission had quietly lapsed — the UI had already
 * re-listed the destination, so the document appeared in its new folder while the
 * bytes were still in the old one, and opening it failed with "does not exist".
 * The helper renames and then verifies, so the result is never half-applied.
 */
/**
 * Thrown when the helper itself could not be reached. Callers may retry a move
 * through the browser only in this case — a helper that answered and REFUSED (a name
 * collision, a locked file) has made a decision that must not be worked around, or
 * the browser fallback would happily overwrite the file the helper protected.
 */
export class HelperUnreachableError extends Error {
  readonly helperUnreachable = true;
  constructor(message: string) {
    super(message);
    this.name = 'HelperUnreachableError';
  }
}

export const moveViaHelper = async (absoluteSources: string[], absoluteDestDir: string): Promise<MoveResult> => {
  let resp: Response;
  try {
    resp = await fetch(`${OPEN_HELPER_URL}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: absoluteSources, destDir: absoluteDestDir }),
    });
  } catch {
    throw new HelperUnreachableError('Could not connect to the local helper (port 3099). Open Tender Control with OPEN_OPPORTUNITYOS.');
  }
  // A helper that predates this endpoint 404s on it; that is "unreachable" too.
  if (resp.status === 404) throw new HelperUnreachableError('The local helper does not support moving files yet. Restart Tender Control with OPEN_OPPORTUNITYOS.');
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body?.error || `Move failed with error ${resp.status}`);
  return {
    moved: Array.isArray(body?.moved) ? body.moved : [],
    failed: Array.isArray(body?.failed) ? body.failed : [],
  };
};

/** Reveal (select) a file/folder in Windows Explorer. */
export const revealInExplorer = async (rootPathDisplay: string, relativePath: string[]): Promise<void> => {
  const absolute = buildAbsolutePath(rootPathDisplay, relativePath);
  const qs = new URLSearchParams({ path: absolute }).toString();
  await fetch(`${OPEN_HELPER_URL}/reveal?${qs}`).catch(() => null);
};

/**
 * Check whether an absolute path still exists on disk via the local helper.
 * 'helper-offline' means the helper couldn't be reached (or predates the
 * /check-path endpoint) — treat it as UNKNOWN, never as missing.
 */
export const checkOsPath = async (absPath: string): Promise<'ok' | 'missing' | 'helper-offline'> => {
  const qs = new URLSearchParams({ path: absPath }).toString();
  let resp: Response;
  try {
    resp = await fetch(`${OPEN_HELPER_URL}/check-path?${qs}`);
  } catch {
    return 'helper-offline';
  }
  if (resp.ok) return 'ok';
  if (resp.status === 404) return 'missing';
  return 'helper-offline';
};

export interface OsDirEntry {
  name: string;
  kind: 'file' | 'directory';
  size: number;
  mtime: number;
}

/**
 * List a directory's entries by absolute path via the local helper — lets the
 * folder tab browse (read-only) without a FileSystemDirectoryHandle, e.g. in a
 * browser that never linked the folder.
 */
export const listDirByPath = async (rootPathDisplay: string, relativePath: string[]): Promise<OsDirEntry[]> => {
  const absolute = relativePath.length
    ? buildAbsolutePath(rootPathDisplay, relativePath)
    : (rootPathDisplay || '').trim().replace(/[\/\\]+$/, '');
  if (!absolute) throw new Error('Base path is not set.');
  const qs = new URLSearchParams({ path: absolute }).toString();
  let resp: Response;
  try {
    resp = await fetch(`${OPEN_HELPER_URL}/list-dir?${qs}`);
  } catch {
    throw new Error('Could not connect to the local helper (port 3099). Open Tender Control with OPEN_OPPORTUNITYOS.');
  }
  if (!resp.ok) {
    let msg = `Error ${resp.status}`;
    try { const b = await resp.json(); if (b?.error) msg = b.error; } catch {}
    throw new Error(`Could not list "${absolute}": ${msg}`);
  }
  const body = await resp.json().catch(() => ({}));
  return Array.isArray(body?.entries) ? body.entries : [];
};

const PATH_HINTS_KEY = 'TenderLoop_FolderPathHints_V1';
const PATH_HINTS_MAX = 12;

/**
 * Remember an absolute folder path that resolved successfully.
 *
 * Opportunity folders cluster in a handful of parent directories, so the folder a
 * user links next is almost always a sibling of one they linked before. Feeding
 * those paths back to the helper as `near` hints turns a multi-second search into a
 * couple of milliseconds — and, because every candidate still has to match on
 * content, a stale hint can only cost time, never correctness.
 */
export const rememberFolderPathHint = (absolutePath: string): void => {
  const clean = (absolutePath || '').trim();
  if (!clean) return;
  try {
    const current = getFolderPathHints();
    const next = [clean, ...current.filter(p => p.toLowerCase() !== clean.toLowerCase())].slice(0, PATH_HINTS_MAX);
    localStorage.setItem(PATH_HINTS_KEY, JSON.stringify(next));
  } catch { /* private mode / quota — hints are an optimisation, never a requirement */ }
};

/** Absolute folder paths that resolved recently, most recent first. */
export const getFolderPathHints = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(PATH_HINTS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string' && !!p.trim()) : [];
  } catch {
    return [];
  }
};

/**
 * Auto-resolve the absolute path of a just-linked folder WITHOUT asking the user
 * to type it — and WITHOUT writing anything into the folder.
 *
 * What is sent is the folder's own name plus, for a handful of entries inside it,
 * the NAME, SIZE and LAST-MODIFIED time. Size and mtime are what make the answer
 * trustworthy: several opportunities can own a folder called "R0", but they will
 * not also contain the same file at the same byte size and timestamp. The helper
 * refuses to answer at all unless exactly one folder on disk matches, so a folder
 * that cannot be identified reports "unknown" instead of silently resolving to
 * somebody else's documents.
 *
 * `near` are absolute paths already known for this opportunity (or its other
 * revisions). A new folder is nearly always a sibling of the previous one, so
 * checking there first usually answers in a couple of milliseconds.
 */
export const locateFolderPath = async (
  dirHandle: FileSystemDirectoryHandle,
  near: string[] = [],
): Promise<string | null> => {
  const children: { name: string; kind: 'file' | 'directory'; size?: number; mtime?: number }[] = [];
  try {
    // @ts-ignore
    for await (const entry of dirHandle.values()) {
      const child: { name: string; kind: 'file' | 'directory'; size?: number; mtime?: number } = {
        name: entry.name,
        kind: entry.kind,
      };
      if (entry.kind === 'file') {
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          child.size = file.size;
          child.mtime = file.lastModified;
        } catch { /* unreadable entry — the name alone still narrows the search */ }
      }
      children.push(child);
      if (children.length >= 12) break;
    }
  } catch { /* unreadable — search by name alone */ }

  const qs = new URLSearchParams({
    name: dirHandle.name,
    children: JSON.stringify(children),
    near: JSON.stringify(near.filter(Boolean)),
    // Older helpers only understand `hints`; keep them working.
    hints: JSON.stringify(children.map(c => c.name)),
  }).toString();
  const resp = await fetch(`${OPEN_HELPER_URL}/find-dir?${qs}`).catch(() => null);
  if (resp && resp.ok) {
    const body = await resp.json().catch(() => null);
    if (body?.path) return body.path as string;
  }
  return null;
};

/**
 * Resolve an exact absolute path for a directory handle by dropping a temporary
 * marker file into it and asking the helper to locate that marker. This is more
 * reliable than name-based lookup for standard Windows folders such as
 * Documents, Downloads or Pictures.
 */
export const locateFolderPathWithMarker = async (dirHandle: FileSystemDirectoryHandle): Promise<string | null> => {
  const marker = `.tenderloop_marker_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
  try {
    const fileHandle = await dirHandle.getFileHandle(marker, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write('marker');
    await writable.close();

    const qs = new URLSearchParams({ marker, name: dirHandle.name }).toString();
    // Windows Search indexes a newly-created marker asynchronously, so one shot
    // races the index. Three quick attempts are enough now that locateFolderPath
    // does the real work: this only runs when content matching already failed,
    // and nine seconds of spinner was worse than reporting "not detected yet".
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const resp = await fetch(`${OPEN_HELPER_URL}/locate?${qs}`).catch(() => null);
      if (resp && resp.ok) {
        const body = await resp.json().catch(() => null);
        if (body?.path) return body.path as string;
      }
      if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 600));
    }
    return null;
  } finally {
    try {
      // @ts-ignore
      await dirHandle.removeEntry(marker);
    } catch {
      // Ignore cleanup failures.
    }
  }
};

export const searchFiles = async (
  dirHandle: FileSystemDirectoryHandle,
  query: string,
  onResult: (item: FileItem) => void,
  shouldStop: () => boolean,
  path: string[] = [],
  getAlias?: (key: string) => Promise<string | undefined>
): Promise<void> => {
  const q = query.toLowerCase();
  // @ts-ignore
  for await (const entry of dirHandle.values()) {
    if (shouldStop()) return;

    const entryPath = [...path, entry.name];
    const key = entryPath.join('/');
    const alias = getAlias ? await getAlias(key) : '';

    const matchesName = entry.name.toLowerCase().includes(q);
    const matchesAlias = alias ? alias.toLowerCase().includes(q) : false;
    const matches = matchesName || matchesAlias;

    const item: FileItem = {
      name: entry.name,
      kind: entry.kind,
      handle: entry as unknown as FileSystemFileHandle | FileSystemDirectoryHandle,
      relativePath: entryPath
    };

    if (entry.kind === 'file') {
      item.extension = entry.name.split('.').pop()?.toLowerCase();
      if (matches) {
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          item.size = file.size;
          item.lastModified = file.lastModified;
        } catch (e) { }
      }
    }

    if (matches) onResult(item);

    if (entry.kind === 'directory') {
      await searchFiles(entry as FileSystemDirectoryHandle, query, onResult, shouldStop, entryPath, getAlias);
    }
  }
};
