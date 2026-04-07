import { ExecutiveFlowCase, StandardItem, TenderFlowWorkspace, WorkspaceStatus, RecentDB } from '../types';

/**
 * STRATEGIC WORKSPACE ENGINE v5.0 - FILE SYSTEM FIRST
 * Fuente principal de verdad: Archivo JSON (Workspace BD)
 * Capa de resiliencia: IndexedDB (Handles & Cache)
 */

const DB_NAME = 'TenderFlow_Workspace_Sync';
const HANDLE_STORE = 'handles';
const RECENT_STORE = 'recent_dbs';
const DB_VERSION = 1;

// --- INDEXEDDB HANDLER ---
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RECENT_STORE)) {
        db.createObjectStore(RECENT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// --- FILE SYSTEM UTILS ---
let currentFileHandle: any = null;

const verifyPermission = async (handle: any, readWrite: boolean) => {
  const options: any = {};
  if (readWrite) options.mode = 'readwrite';
  if ((await handle.queryPermission(options)) === 'granted') return true;
  if ((await handle.requestPermission(options)) === 'granted') return true;
  return false;
};

// --- MIGRATION & VALIDATION ---
export const validateWorkspace = (data: any): { isValid: boolean; error?: string } => {
  if (!data.metadata || !data.metadata.id) return { isValid: false, error: 'Missing metadata.id' };
  if (!data.standard) return { isValid: false, error: 'Missing standard backbone' };
  if (!Array.isArray(data.cases)) return { isValid: false, error: 'Cases must be an array' };
  return { isValid: true };
};

export const migrateWorkspace = (data: any): TenderFlowWorkspace => {
  // Simple migration logic
  return {
    metadata: {
      id: data.metadata?.id || `WS-${Date.now()}`,
      name: data.metadata?.name || 'Untitled Workspace',
      version: '5.0',
      createdAt: data.metadata?.createdAt || new Date().toISOString(),
      lastModified: new Date().toISOString(),
    },
    settings: {
      theme: data.settings?.theme || 'dark',
      language: 'en'
    },
    standard: data.standard || { questions: [], stages: [], areas: [] },
    cases: (data.cases || []).map((c: any) => ({
      ...c,
      id: c.id || `EF-${Date.now()}-${Math.random()}`,
      metadata: {
        ...c.metadata,
        isArchived: c.isArchived || c.metadata?.isArchived || false
      }
    }))
  };
};

/**
 * WORKSPACE MANAGER
 */
export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private currentWorkspace: TenderFlowWorkspace | null = null;
  private status: WorkspaceStatus = 'File disconnected';
  private onStatusChange?: (status: WorkspaceStatus) => void;
  private onWorkspaceChange?: (ws: TenderFlowWorkspace) => void;
  private saveTimeout: any = null;

  private constructor() {}

  static getInstance() {
    if (!WorkspaceManager.instance) WorkspaceManager.instance = new WorkspaceManager();
    return WorkspaceManager.instance;
  }

  setCallbacks(onStatus: (s: WorkspaceStatus) => void, onWS: (ws: TenderFlowWorkspace) => void) {
    this.onStatusChange = onStatus;
    this.onWorkspaceChange = onWS;
  }

  getStatus() { return this.status; }
  getWorkspace() { return this.currentWorkspace; }
  getHandle() { return currentFileHandle; }

  private updateStatus(s: WorkspaceStatus) {
    this.status = s;
    this.onStatusChange?.(s);
  }

  // --- CORE OPS ---

  async newWorkspace() {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `My_TF_Strategy_Workspace.json`,
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
      });
      
      const { MOCK_STANDARD } = require('../engine/mockStandard');

      const newWS: TenderFlowWorkspace = {
        metadata: {
          id: `WS-${Date.now()}`,
          name: handle.name.replace('.json', ''),
          version: '5.0',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString()
        },
        settings: { theme: 'dark', language: 'en' },
        standard: { 
          questions: MOCK_STANDARD, 
          stages: [
            { id: 'STG_INTAKE', name: 'Intake', order: 0, active: true },
            { id: 'STG_PRELIM', name: 'Preliminary Research', order: 1, active: true },
            { id: 'STG_TECH', name: 'Technical Definition', order: 2, active: true },
            { id: 'STG_COMM', name: 'Commercial Proposal', order: 3, active: true }
          ], 
          areas: [
            { id: 'AREA_GEN', name: 'General', order: 0, active: true, color: '#3b82f6' },
            { id: 'AREA_TSC', name: 'Technical', order: 1, active: true, color: '#10b981' }
          ] 
        },
        cases: []
      };

      await this.saveFileDirectly(handle, newWS);
      currentFileHandle = handle;
      this.currentWorkspace = newWS;
      await this.persistHandle(handle);
      this.updateStatus('Synced');
      this.onWorkspaceChange?.(newWS);
    } catch (e) {
      console.error('Error creating new DB', e);
    }
  }

  async openWorkspace() {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
      });
      
      const file = await handle.getFile();
      const content = await file.text();
      const data = JSON.parse(content);
      
      const validation = validateWorkspace(data);
      if (!validation.isValid) {
        alert(`Invalid Workspace: ${validation.error}`);
        return;
      }

      const migrated = migrateWorkspace(data);
      currentFileHandle = handle;
      this.currentWorkspace = migrated;
      await this.persistHandle(handle);
      this.updateStatus('Synced');
      this.onWorkspaceChange?.(migrated);
    } catch (e) {
      console.error('Error opening DB', e);
    }
  }

  async tryAutoReopen() {
    try {
      const db = await getDB();
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const store = tx.objectStore(HANDLE_STORE);
      const req = store.get('last_active');
      
      return new Promise<boolean>((resolve) => {
        req.onsuccess = async () => {
          if (req.result && req.result.handle) {
            const handle = req.result.handle;
            try {
              if (await verifyPermission(handle, true)) {
                const file = await handle.getFile();
                const content = await file.text();
                const data = JSON.parse(content);
                this.currentWorkspace = migrateWorkspace(data);
                currentFileHandle = handle;
                this.updateStatus('Synced');
                this.onWorkspaceChange?.(this.currentWorkspace);
                resolve(true);
              } else {
                this.updateStatus('Write permission required');
                resolve(false);
              }
            } catch {
              this.updateStatus('File disconnected');
              resolve(false);
            }
          } else {
            resolve(false);
          }
        };
        req.onerror = () => resolve(false);
      });
    } catch { return false; }
  }

  // --- AUTOSAVE LOGIC ---
  
  markDirty(updatedWS: TenderFlowWorkspace) {
    this.currentWorkspace = updatedWS;
    this.updateStatus('Save pending');
    
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.commitChanges(), 3000);
  }

  private async commitChanges() {
    if (!this.currentWorkspace || !currentFileHandle) return;
    
    this.updateStatus('Saving');
    try {
      await this.saveFileDirectly(currentFileHandle, this.currentWorkspace);
      this.updateStatus('Synced');
    } catch (e) {
      console.error('Failed to autosave', e);
      this.updateStatus('Write permission required');
    }
  }

  private async saveFileDirectly(handle: any, data: TenderFlowWorkspace) {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    
    // Update metadata locally
    data.metadata.lastModified = new Date().toISOString();
    
    // Recent list update
    this.updateRecentList(handle.name, data.metadata.id);
  }

  private async persistHandle(handle: any, type: 'last_active' | 'loop_db' = 'last_active') {
    const db = await getDB();
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).put({ id: type, handle });
  }

  async setLoopDbHandle(handle: any) {
    if (!handle) return;
    if (await verifyPermission(handle, true)) {
       await this.persistHandle(handle, 'loop_db');
    }
  }

  async getLoopDbHandle(): Promise<any> {
    const db = await getDB();
    const tx = db.transaction(HANDLE_STORE, 'readonly');
    const store = tx.objectStore(HANDLE_STORE);
    const req = store.get('loop_db');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.handle || null);
      req.onerror = () => resolve(null);
    });
  }

  private async updateRecentList(name: string, id: string) {
    const db = await getDB();
    const tx = db.transaction(RECENT_STORE, 'readwrite');
    tx.objectStore(RECENT_STORE).put({ 
      id, 
      name, 
      lastOpened: new Date().toISOString() 
    });
  }

  async getRecentDBs(): Promise<RecentDB[]> {
    const db = await getDB();
    const tx = db.transaction(RECENT_STORE, 'readonly');
    const store = tx.objectStore(RECENT_STORE);
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a: any, b: any) => 
          new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
        );
        resolve(sorted);
      };
    });
  }

  async downloadImmediate() {
    if (!this.currentWorkspace) return;
    const blob = new Blob([JSON.stringify(this.currentWorkspace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentWorkspace.metadata.name.replace(/\s+/g, '_')}_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Singleton export
export const workspaceManager = WorkspaceManager.getInstance();
