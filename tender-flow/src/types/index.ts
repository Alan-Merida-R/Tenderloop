/**
 * Core Types for Tender Executive Flow
 * Todas las interfaces visibles en inglés, comentarios en español.
 */

export type ItemType = 
  | 'question'      
  | 'decision'      
  | 'required_data' 
  | 'assumption'    
  | 'risk_check'    
  | 'link'           // Nuevo: Pide Link Name + URL (Punto 10)
  | 'action'         // Nuevo: Sincronizado con Loop Tasks
  | 'end';            // Nuevo: Nodo final de flujo

export type Priority = 'low' | 'medium' | 'high' | 'critical' | 'mandatory';

export type LogicOperator = 'AND' | 'OR' | 'NOT';

export type ResponseStatus = 
  | 'not_started'
  | 'pending'
  | 'answered'
  | 'partially_answered'
  | 'not_applicable'
  | 'waiting_external'
  | 'blocked'
  | 'confirmed';

export interface DependencyRule {
  targetId: string;       // El ID del item del que depende
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists' | 'any_value';
  value: any | any[];     // SOPORTE MULTI-VALOR (Lógica OR) (Punto 28 Fix)
}

export type ResponseType = 'text' | 'select' | 'boolean' | 'number' | 'date' | 'table' | 'string' | 'any';

export interface StandardItem {
  id: string;             
  active: boolean;        
  area: string;           
  stage: string;          
  itemType: ItemType;     
  content: string;        
  description?: string;   
  deliverableTarget?: string[]; 
  responseType: ResponseType;
  allowedValues?: string[]; 
  mandatory: boolean;           
  priority: Priority;
  dependencyRules?: DependencyRule[];
  dependencyOperator?: LogicOperator; 
  triggerNewBranch?: boolean; 
  branchGroup?: string;       
  tags: string[];            
  order: number;              
  commercialImpact?: string;
  deliverableTags?: string[];
  logicString?: string;       
  isMultipleSelection?: boolean; // Nuevo: Soporta selecciones múltiples en Decisiones (Punto 28)
  linkedTaskId?: string;         // Vincular a Tarea de Loop (ID de la fila de Loop DB)
  visualPosition?: { x: number; y: number }; // Posición en el mapa lógico
}

/**
 * Representa la respuesta y estado de un item en un caso real
 */
export interface ItemResponse {
  itemId: string;
  value: any;
  linkInfo?: { name: string; url: string }; // Solo para tipo 'link'
  status: ResponseStatus;
  note?: string;              
  answeredBy?: string;        
  updatedAt: string;          
  isFlagged: boolean;         // Marcado como importante (Punto 19)
  isLocked: boolean;          // Candado activado (Punto 17)
  isSynced?: boolean;         // Nuevo: Indica si el valor viene de un Loop Task
}

/**
 * The principal container for an opportunity in the Executive Flow strategic layer.
 */
export interface ExecutiveFlowCase {
  id: string;                 
  loopId?: string;           
  keyName?: string;          // "Key Name" descriptivo (Punto 8)
  metadata: {
    name: string;             
    customer: string;
    createdAt: string;
    lastModified: string;
    standardVersion: string;  
    isArchived: boolean;
    status: 'active' | 'inactive';
    sourceDb?: string;        // Nombre de la BD de Loop conectada (Punto 24)
  };
  initialWizData: {
    proposalType: string;
    scopeTags: string[];
    region?: string;
    estimatedAmount?: number;
    industry?: string;
    dueDate?: string;
    salesOwner?: string;
    tscOwner?: string;
    sellerName?: string;       // Nuevo (Punto 27)
    customerAddress?: string;  // Nuevo (Punto 27)
    city?: string;
    state?: string;
    excelH2?: string;
  };
  responses: Record<string, ItemResponse>; 
  activeFilters: {
    areas: string[];
    stages: string[];
    priorities: Priority[];
    deliverables: string[];
  };
  isArchived?: boolean; // Top-level flag for My Operations (Archive)
  originalLoopId?: string; // Sincronización con TenderLoop (Punto 24)
  // Snapshot de la estructura lógica al momento de creación (Punto 25 - Preservar Diagrama)
  snapshot?: {
    questions: StandardItem[];
    stages: { id: string; name: string; order: number; active: boolean }[];
    areas: { id: string; name: string; order: number; active: boolean; color?: string }[];
  };
}

export type WorkspaceStatus = 'Synced' | 'Saving' | 'Save pending' | 'File disconnected' | 'Invalid path' | 'Write permission required';

export interface WorkspaceMetadata {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  lastModified: string;
}

export interface WorkspaceSettings {
  theme: 'dark' | 'light';
  language: 'en';
  defaultFilters?: ExecutiveFlowCase['activeFilters'];
}

/**
 * Represents a complete Tender Flow workspace, including the standard logic backbone and all specific cases.
 */
export interface TenderFlowWorkspace {
  metadata: WorkspaceMetadata;
  settings: WorkspaceSettings;
  standard: {
    questions: StandardItem[];
    stages: { id: string; name: string; order: number; active: boolean }[];
    areas: { id: string; name: string; order: number; active: boolean; color?: string }[];
  };
  cases: ExecutiveFlowCase[];
}

export interface RecentDB {
  id: string;
  name: string;
  path?: string; // Optional if using handles
  lastOpened: string;
}
