import { DatabaseSchema } from '../types';

const API_BASE = 'http://127.0.0.1:3099/api';

export interface BackendDbStatus {
  open: boolean;
  path: string | null;
  name: string | null;
  revision: number;
  lastLoadedAt: string | null;
  lastSavedAt: string | null;
}

export interface BackendDbSnapshot {
  ok: true;
  data: DatabaseSchema;
  status: BackendDbStatus;
}

export interface BackendDbStatusResponse {
  ok: true;
  status: BackendDbStatus;
}

let serializeWorker: Worker | null = null;

const getSerializeWorker = (): Worker => {
  if (!serializeWorker) {
    serializeWorker = new Worker(
      new URL('./save.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return serializeWorker;
};

const serializeJson = (data: unknown): Promise<string> => {
  return new Promise((resolve, reject) => {
    const worker = getSerializeWorker();
    const onMessage = (event: MessageEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (event.data?.success) resolve(event.data.serialized);
      else reject(new Error(event.data?.error || 'Failed to serialize backend request.'));
    };
    const onError = (event: ErrorEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(event.error || new Error(event.message));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(data);
  });
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.error || `Backend request failed (${response.status})`);
    (err as any).status = response.status;
    throw err;
  }
  return payload as T;
};

export const isBackendAvailable = async (): Promise<boolean> => {
  try {
    const health = await request<{ ok: boolean }>('/health');
    return Boolean(health.ok);
  } catch {
    return false;
  }
};

export const openDefaultBackendDb = () =>
  request<BackendDbSnapshot>('/db/default');

export const createDefaultBackendDb = (overwrite = false) =>
  request<BackendDbSnapshot>('/db/default', {
    method: 'POST',
    body: JSON.stringify({ overwrite }),
  });

export const importBackendDb = async (data: DatabaseSchema) =>
  request<BackendDbSnapshot>('/db/import', {
    method: 'POST',
    body: await serializeJson({ data }),
  });

export const saveBackendDb = async (data: DatabaseSchema, expectedRevision?: number) =>
  request<BackendDbStatusResponse>('/db/current?compact=1', {
    method: 'PUT',
    body: await serializeJson({ data, expectedRevision }),
  });

export const archiveRecoveryBackup = async (data: DatabaseSchema, name: string) =>
  request<{ ok: true; backup: { path: string } | null }>('/db/recovery-backup', {
    method: 'POST',
    body: await serializeJson({ data, name }),
  });

export const resolveNativeDbPath = async (file: File): Promise<string | null> => {
  const query = new URLSearchParams({
    name: file.name,
    size: String(file.size),
    mtime: String(file.lastModified),
  });
  try {
    const result = await request<{ ok: true; path: string }>(`/os/find-db-file?${query}`);
    return result.path;
  } catch {
    return null;
  }
};

export const revealNativePath = async (nativePath: string): Promise<void> => {
  const query = new URLSearchParams({ path: nativePath });
  const response = await fetch(`${API_BASE}/os/reveal?${query}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Could not open Explorer (${response.status}).`);
};

export const revealCurrentBackendDb = async (): Promise<void> => {
  const current = await request<BackendDbStatusResponse>('/db/status');
  if (!current.status.open || !current.status.path) {
    throw new Error('No database is currently open.');
  }

  const query = new URLSearchParams({ path: current.status.path });
  const response = await fetch(`${API_BASE}/os/reveal?${query}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Could not open Explorer (${response.status}).`);
  }
};
