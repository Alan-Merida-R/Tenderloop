
import React, { useEffect, useState } from 'react';
import { getMeta, saveMeta } from '../../services/opportunityDocMetaStore';

const DOC_TYPES = ['', 'Editable', 'Info', 'Approvals', 'Not important', 'Proposal'];

export const DocTypeSelector: React.FC<{ opportunityId: string; fileKey: string; onUpdate?: () => void }> = ({ opportunityId, fileKey, onUpdate }) => {
  const [docType, setDocType] = useState<string>('');

  useEffect(() => {
    getMeta(opportunityId, fileKey).then(meta => {
      if (meta) setDocType(meta.docType || '');
    });
  }, [opportunityId, fileKey]);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setDocType(val);
    await saveMeta(opportunityId, fileKey, { docType: val });
    if (onUpdate) onUpdate();
  };

  return (
    <select 
      value={docType}
      onChange={handleChange}
      className="text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-[#3DCD58] font-bold text-gray-600 uppercase tracking-tight w-full"
    >
      {DOC_TYPES.map(t => (
        <option key={t} value={t}>{t || '---'}</option>
      ))}
    </select>
  );
};
