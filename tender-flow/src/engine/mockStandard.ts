import { StandardItem } from '../types';

/**
 * Mock Standard Data (General Standard) v2.8
 * Actualizado a modelo de Área Única.
 */

export const MOCK_STANDARD: StandardItem[] = [
  {
    id: 'GEN-Q-001',
    active: true,
    area: 'Sales',
    stage: 'Preliminary Research',
    itemType: 'decision',
    content: 'Is it firm or budgetary proposal?',
    description: 'Determina el nivel de detalle requerido en el costeo y las contingencias.',
    responseType: 'select',
    allowedValues: ['Firm', 'Budgetary', 'Budgetary with assumptions'],
    mandatory: true,
    priority: 'high',
    tags: ['initial', 'strategy'],
    order: 1
  },
  {
    id: 'GEN-Q-002',
    active: true,
    area: 'TSC',
    stage: 'Scope Clarification',
    itemType: 'decision',
    content: 'Is this a migration or a new system?',
    description: 'Afecta si necesitamos inventario de base instalada.',
    responseType: 'select',
    allowedValues: ['Migration', 'New System / Greenfield', 'Expansion'],
    mandatory: true,
    priority: 'critical',
    tags: ['scope'],
    order: 2
  },
  {
    id: 'MIG-Q-001',
    active: true,
    area: 'TSC',
    stage: 'Technical Definition',
    itemType: 'question',
    content: 'Which equipment qualifies for advantage, spare parts or software update?',
    description: 'Específico para migraciones. Revisar política de descuentos por base instalada.',
    responseType: 'text',
    mandatory: true,
    priority: 'high',
    dependencyRules: [
      {
        targetId: 'GEN-Q-002',
        operator: 'equals',
        value: 'Migration'
      }
    ],
    tags: ['migration', 'tsc'],
    order: 3
  },
  {
    id: 'GEN-Q-003',
    active: true,
    area: 'Delivery',
    stage: 'Service Definition',
    itemType: 'question',
    content: 'Are cabinets included in the scope?',
    description: 'Impacta SCM y logística de ensamble.',
    responseType: 'boolean',
    mandatory: true,
    priority: 'medium',
    tags: ['hardware', 'cabinets'],
    order: 4
  },
  {
    id: 'CAB-Q-001',
    active: true,
    area: 'SCM',
    stage: 'Service Definition',
    itemType: 'question',
    content: 'Where will the cabinets be located?',
    description: 'Indoor/Outdoor, condiciones ambientales, requerimientos de enfriamiento.',
    responseType: 'text',
    mandatory: false,
    priority: 'medium',
    dependencyRules: [
      {
        targetId: 'GEN-Q-003',
        operator: 'equals',
        value: true
      }
    ],
    tags: ['cabinets', 'logistics'],
    order: 5
  },
  {
    id: 'GEN-Q-004',
    active: true,
    area: 'Sales',
    stage: 'Preliminary Research',
    itemType: 'question',
    content: 'What is the estimated amount of the opportunity?',
    description: 'Monto estimado en USD.',
    responseType: 'number',
    mandatory: true,
    priority: 'high',
    tags: ['pricing', 'strategy'],
    order: 6
  }
];

export const SYSTEM_QUESTIONS_AREA = 'Basic Proposal Data';

export const getSystemItems = (): any[] => [
  {
    id: 'SYS_ALIAS',
    active: true,
    area: 'General',
    stage: 'Intake',
    itemType: 'question',
    content: 'Investigative Alias',
    description: 'The primary name or ID identifying this research effort.',
    responseType: 'text',
    mandatory: true,
    priority: 'mandatory',
    order: -100
  },
  {
    id: 'SYS_OPID',
    active: true,
    area: 'General',
    stage: 'Intake',
    itemType: 'question',
    content: 'OP / ID',
    description: 'Official tracking number from CRM.',
    responseType: 'text',
    mandatory: true,
    priority: 'mandatory',
    order: -99
  },
  {
    id: 'SYS_COMPANY',
    active: true,
    area: 'General',
    stage: 'Intake',
    itemType: 'question',
    content: 'Company Name',
    description: 'Official client entity name.',
    responseType: 'text',
    mandatory: true,
    priority: 'mandatory',
    order: -98
  },
  {
    id: 'SYS_AMOUNT',
    active: true,
    area: 'General',
    stage: 'Intake',
    itemType: 'question',
    content: 'Cost Forecast (USD)',
    description: 'Estimated investment size.',
    responseType: 'number',
    mandatory: false,
    priority: 'medium',
    order: -97
  },
  {
    id: 'SYS_ADDRESS',
    active: true,
    area: 'General',
    stage: 'Intake',
    itemType: 'question',
    content: 'Client Address',
    description: 'Physical location of the delivery or client headquarters.',
    responseType: 'text',
    mandatory: false,
    priority: 'low',
    order: -96
  },
  {
    id: 'SYS_DUEDATE',
    active: true,
    area: 'General',
    stage: 'Intake',
    itemType: 'question',
    content: 'Submitted Due Date',
    description: 'Critical deadline for the strategy phase.',
    responseType: 'text',
    mandatory: false,
    priority: 'high',
    order: -95
  }
];
