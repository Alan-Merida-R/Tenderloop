export interface FileItem {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
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
