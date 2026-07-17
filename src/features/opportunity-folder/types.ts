export interface FileItem {
  name: string;
  kind: 'file' | 'directory';
  /** Absent in path-mode (browsing by absolute path via the local helper, no handle available). */
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  /** True when this item was listed by absolute path via the local helper (read-only mode). */
  pathOnly?: boolean;
  extension?: string;
  size?: number;
  lastModified?: number;
  relativePath: string[];
}

export interface TreeFolder {
  name: string;
  handle: FileSystemDirectoryHandle;
  children: TreeFolder[];
  isExpanded: boolean;
  path: string[];
}
