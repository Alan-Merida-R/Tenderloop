export const PROCESS_SECTIONS = [
  'Intake & Standardization',
  'Scope Definition',
  'Costing & Commercial',
  'Proposal Development',
  'Reviews & Approvals',
  'Submission & Closure',
  'Revision & Rework',
] as const;

export type ProcessSection = typeof PROCESS_SECTIONS[number];

export const SIMPLE_STANDARD_ID = 'tender-control-simple-standard-v1';
