import React, { useMemo, useState } from 'react';
import { GitPullRequest, Paperclip, X } from 'lucide-react';
import type { Person, TaskOwner } from '../types';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { suggestSharedDocumentRevision } from '../services/changeRevisionFiles';
import { PROCESS_SECTIONS, type ProcessSection } from '../services/processSections';

export interface ChangeRevisionFormValue {
  correctionTaskTitle: string;
  requiredChanges: string;
  reason: string;
  requestedByIds: string[];
  informedIds: string[];
  assignedTo: TaskOwner;
  responsibleTeamMemberIds: string[];
  requestedDate: string;
  committedDate: string;
  processSection: ProcessSection;
  fileRevisions: Array<{ sourceFileKey: string; newRevision: string }>;
}

interface Props {
  opportunityId: string;
  opportunityRevision?: string;
  sourceTaskTitle: string;
  stakeholders: Person[];
  initialPath?: string[];
  busy?: boolean;
  onClose: () => void;
  onSubmit: (value: ChangeRevisionFormValue) => void;
}

const today = () => new Date().toLocaleDateString('en-CA');

const PeopleChecklist = ({ people, selected, onChange }: {
  people: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) => (
  <div className="max-h-28 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 flex flex-wrap gap-1.5">
    {people.map(person => {
      const active = selected.includes(person.id);
      return (
        <label key={person.id} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold cursor-pointer ${active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
          <input type="checkbox" checked={active} onChange={() => onChange(active ? selected.filter(id => id !== person.id) : [...selected, person.id])} className="h-3 w-3 rounded text-blue-600" />
          {person.name}
        </label>
      );
    })}
    {!people.length && <span className="p-2 text-xs italic text-gray-400">Add stakeholders to this opportunity first.</span>}
  </div>
);

export const ChangeRevisionModal: React.FC<Props> = ({ opportunityId, opportunityRevision, sourceTaskTitle, stakeholders, initialPath, busy, onClose, onSubmit }) => {
  const [title, setTitle] = useState(`Changes requested: ${sourceTaskTitle}`);
  const [requiredChanges, setRequiredChanges] = useState('');
  const [reason, setReason] = useState('');
  const [requestedByIds, setRequestedByIds] = useState<string[]>([]);
  const [informedIds, setInformedIds] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState<TaskOwner>('Me');
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [requestedDate, setRequestedDate] = useState(today());
  const [committedDate, setCommittedDate] = useState('');
  const [processSection, setProcessSection] = useState<ProcessSection>('Revision & Rework');
  const [createFiles, setCreateFiles] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [files, setFiles] = useState<Array<{ sourceFileKey: string; newRevision: string }>>([]);

  const invalid = useMemo(() => (
    !title.trim() || !requiredChanges.trim() || !reason.trim() || !requestedByIds.length || !requestedDate ||
    (assignedTo === 'External Area' && !responsibleIds.length) ||
    (createFiles && !files.length)
  ), [title, requiredChanges, reason, requestedByIds, requestedDate, assignedTo, responsibleIds, createFiles, files]);

  const chooseFiles = (keys: string[]) => {
    const revision = suggestSharedDocumentRevision(keys);
    setFiles(keys.map(sourceFileKey => ({ sourceFileKey, newRevision: revision })));
    setShowPicker(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
        <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 font-black text-gray-900"><GitPullRequest className="h-5 w-5 text-orange-500" /> Create Change Revision</h3>
              <p className="mt-0.5 text-xs text-gray-500">Create one correction task and preserve a complete approval cycle.</p>
            </div>
            <button onClick={onClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-200"><X className="h-5 w-5" /></button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Correction Task Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border-gray-200 text-sm font-bold" />
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-orange-700">Process section reopened by this revision</label>
              <select value={processSection} onChange={e => setProcessSection(e.target.value as ProcessSection)} className="mt-1 w-full rounded-xl border-orange-200 bg-white text-sm font-bold text-gray-700">
                {PROCESS_SECTIONS.map(section => <option key={section} value={section}>{section}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-orange-700">Choose Scope Definition when architecture, BOM, services, integrations or responsibilities must be defined again.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Required Changes *</label>
                <textarea value={requiredChanges} onChange={e => setRequiredChanges(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border-gray-200 text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Reason for Changes *</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border-gray-200 text-sm" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Requested By *</label>
                <PeopleChecklist people={stakeholders} selected={requestedByIds} onChange={setRequestedByIds} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Keep Informed</label>
                <PeopleChecklist people={stakeholders} selected={informedIds} onChange={setInformedIds} />
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Assigned To *</label>
              <div className="mt-2 flex gap-2">
                {(['Me', 'External Area'] as TaskOwner[]).map(value => <button type="button" key={value} onClick={() => { setAssignedTo(value); if (value === 'Me') setResponsibleIds([]); }} className={`rounded-xl border px-4 py-2 text-xs font-black ${assignedTo === value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'}`}>{value === 'Me' ? 'Me' : 'Another Stakeholder'}</button>)}
              </div>
              {assignedTo === 'External Area' && <div className="mt-3"><PeopleChecklist people={stakeholders} selected={responsibleIds} onChange={setResponsibleIds} /></div>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Requested Date *</label><input type="date" value={requestedDate} onChange={e => setRequestedDate(e.target.value)} className="mt-1 w-full rounded-xl border-gray-200 text-sm" /></div>
              <div><label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Committed Date</label><input type="date" value={committedDate} min={requestedDate} onChange={e => setCommittedDate(e.target.value)} className="mt-1 w-full rounded-xl border-gray-200 text-sm" /></div>
            </div>
            <div className="rounded-2xl border border-gray-200 p-4">
              <label className="flex items-center gap-2 text-xs font-black text-gray-700"><input type="checkbox" checked={createFiles} onChange={e => { setCreateFiles(e.target.checked); if (!e.target.checked) setFiles([]); }} className="rounded text-[#3DCD58]" /> Create File Revisions?</label>
              {createFiles && <div className="mt-3 space-y-2">
                <button type="button" onClick={() => setShowPicker(true)} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><Paperclip className="h-4 w-4" /> Select Files</button>
                {files.map((file, index) => <div key={file.sourceFileKey} className="grid items-center gap-2 rounded-xl bg-gray-50 p-2 md:grid-cols-[1fr_110px_auto]">
                  <span className="truncate text-xs font-medium text-gray-700" title={file.sourceFileKey}>{file.sourceFileKey}</span>
                  <input value={file.newRevision} onChange={e => setFiles(prev => prev.map((item, i) => i === index ? { ...item, newRevision: e.target.value } : item))} className="rounded-lg border-gray-200 text-xs font-mono font-bold uppercase" />
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))} className="rounded p-1 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>)}
                {!files.length && <p className="text-xs italic text-amber-600">Select at least one file or turn this option off.</p>}
              </div>}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 p-4">
            <button onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-200">Cancel</button>
            <button disabled={invalid || busy} onClick={() => onSubmit({ correctionTaskTitle: title.trim(), requiredChanges: requiredChanges.trim(), reason: reason.trim(), requestedByIds, informedIds, assignedTo, responsibleTeamMemberIds: responsibleIds, requestedDate, committedDate, processSection, fileRevisions: files })} className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-black text-white shadow disabled:opacity-40">{busy ? 'Creating…' : 'Create Change Revision'}</button>
          </div>
        </div>
      </div>
      {showPicker && <DocumentPickerModal opportunityId={opportunityId} revision={opportunityRevision} multi onSelect={chooseFiles} onClose={() => setShowPicker(false)} title="Select files to revise" initialPath={initialPath} />}
    </>
  );
};
