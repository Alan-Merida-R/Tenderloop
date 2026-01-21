
import React, { useRef } from 'react';
import { Download, Upload, FileJson } from 'lucide-react';
import { Opportunity } from '../../types';
import { exportOpportunity, importOpportunity, downloadJSON } from '../../services/opportunityExportImport';

interface Props {
  opportunity?: Opportunity; // Optional for Import-only mode (if used elsewhere)
  onImport?: (newOpp: Opportunity) => void;
}

export const OpportunityExportImportButtons: React.FC<Props> = ({ opportunity, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!opportunity) return;
    try {
      const pkg = await exportOpportunity(opportunity);
      const filename = `${opportunity.id}_Export.oppkg.json`;
      downloadJSON(pkg, filename);
    } catch (e) {
      alert("Export failed: " + e);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const pkg = JSON.parse(text);
      // We pass empty array for existing opps as we generate new ID anyway, 
      // but in a real app we might check for duplicates.
      const newOpp = await importOpportunity(pkg, []); 
      if (onImport) onImport(newOpp);
      alert(`Imported successfully as ${newOpp.id}`);
    } catch (err: any) {
      console.error(err);
      alert("Import failed: " + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input 
        type="file" 
        accept=".json" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange}
      />
      {opportunity && (
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:text-[#3DCD58] transition-all shadow-sm"
          title="Export Opportunity Package"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      )}
      <button 
        onClick={handleImportClick}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:text-[#3DCD58] transition-all shadow-sm"
        title="Import Opportunity Package"
      >
        <Upload className="w-4 h-4" /> Import
      </button>
    </div>
  );
};
