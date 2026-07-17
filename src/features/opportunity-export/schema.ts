import { Opportunity } from '../../types';
import { DocMeta } from '../../services/opportunityDocMetaStore';

export interface OpportunityExportPackage {
  schemaVersion: string;
  exportedAt: string;
  appVersion: string;
  opportunity: Opportunity;
  docMetas: {
    relativePath: string;
    meta: DocMeta;
  }[];
}

export const CURRENT_SCHEMA_VERSION = '1.0';