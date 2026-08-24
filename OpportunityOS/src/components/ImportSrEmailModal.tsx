import React, { useMemo, useRef, useState } from 'react';
import { Mail, UploadCloud, ClipboardPaste, X, AlertTriangle, CheckCircle, FileText, ArrowLeft, Sparkles } from 'lucide-react';
import { parseSrEmail, buildSrPrefill, isSrEmail, SrPrefill } from '../services/srEmailParser';
import { readEmailFile } from '../services/emailFileReader';
import { sanitizeHtml } from '../services/sanitizeHtml';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** The opportunity being auto-filled (excluded from the duplicate check). */
    currentOppId: string;
    /** Light list used to detect an already-existing OP. */
    existingOpps: { id: string; title: string; srId?: string }[];
    currentRequestedDate: string;
    taskStandards?: { id: string; name: string; taskCount: number }[];
    onApply: (prefill: SrPrefill, decision: SrImportDecision) => void;
}

export type SrImportDecision =
    | { kind: 'new' }
    | { kind: 'revision'; targetOppId: string; commitMessage: string; tags: string; taskStandardId: string };

type EditableField = 'opId' | 'title' | 'alias' | 'customer' | 'seller' | 'srId' | 'requestedDate' | 'expectedDate' | 'srLink';

const FIELD_LABELS: { key: EditableField; label: string; type?: 'date' }[] = [
    { key: 'opId', label: 'OP ID' },
    { key: 'srId', label: 'SR ID' },
    { key: 'title', label: 'Title' },
    { key: 'alias', label: 'Alias' },
    { key: 'customer', label: 'Customer' },
    { key: 'seller', label: 'Seller / Leader' },
    { key: 'requestedDate', label: 'Requested Date', type: 'date' },
    { key: 'expectedDate', label: 'Expected Date', type: 'date' },
    { key: 'srLink', label: 'SR Link' },
];

/** Identity fields carried over untouched when the SR turns out to be a revision. */
const REVISION_LOCKED_FIELDS = new Set<EditableField>(['opId', 'title', 'alias']);

export const ImportSrEmailModal: React.FC<Props> = ({ isOpen, onClose, currentOppId, existingOpps, currentRequestedDate, taskStandards = [], onApply }) => {
    const [pasteText, setPasteText] = useState('');
    const [prefill, setPrefill] = useState<SrPrefill | null>(null);
    const [sourceLabel, setSourceLabel] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [showNotePreview, setShowNotePreview] = useState(false);
    const [duplicateAction, setDuplicateAction] = useState<'new' | 'revision'>('revision');
    const [revisionMessage, setRevisionMessage] = useState('');
    const [revisionTags, setRevisionTags] = useState('');
    const [revisionTaskStandardId, setRevisionTaskStandardId] = useState(taskStandards.length === 1 ? taskStandards[0].id : '');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const duplicateOpp = useMemo(() => {
        if (!prefill?.opId) return undefined;
        const opId = prefill.opId.trim().toUpperCase();
        return existingOpps.find(o => o.id !== currentOppId && o.id.trim().toUpperCase() === opId);
    }, [prefill?.opId, existingOpps, currentOppId]);

    const isRevision = !!duplicateOpp && duplicateAction === 'revision';

    // A revision belongs to the same OP: its identity (OP ID, Title, Alias) is inherited
    // from the existing opportunity, so those fields are neither shown nor applied.
    const visibleFields = useMemo(
        () => (isRevision ? FIELD_LABELS.filter(f => !REVISION_LOCKED_FIELDS.has(f.key)) : FIELD_LABELS),
        [isRevision]
    );

    if (!isOpen) return null;

    const reset = () => {
        setPasteText('');
        setPrefill(null);
        setSourceLabel('');
        setError('');
        setShowNotePreview(false);
        setDuplicateAction('revision');
        setRevisionMessage('');
        setRevisionTags('');
        setRevisionTaskStandardId(taskStandards.length === 1 ? taskStandards[0].id : '');
    };

    const handleClose = () => { reset(); onClose(); };

    const analyzeText = (text: string, source: string) => {
        const parsed = parseSrEmail(text);
        if (!isSrEmail(parsed)) {
            setError('No SR fields detected. Make sure this is a bFO Support Request email (it should contain lines like "Support Request Status:" and "Opportunity Name:").');
            return;
        }
        setError('');
        setSourceLabel(source);
        setPrefill({
            ...buildSrPrefill(parsed),
            requestedDate: currentRequestedDate,
        });
    };

    const handleFile = async (file: File) => {
        setBusy(true);
        setError('');
        try {
            const content = await readEmailFile(file);
            analyzeText(content.text, content.fileName);
        } catch (err: any) {
            setError(err?.message || 'Could not read the email file.');
        } finally {
            setBusy(false);
        }
    };

    const setField = (key: EditableField, value: string) => {
        setPrefill(prev => prev ? { ...prev, [key]: value } : prev);
    };

    const filledCount = prefill ? visibleFields.filter(f => (prefill[f.key] || '').toString().trim()).length : 0;

    return (
        <div className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#3DCD58]/10 rounded-xl"><Mail className="w-5 h-5 text-[#3DCD58]" /></div>
                        <div>
                            <h2 className="font-bold text-gray-900 leading-tight">Auto-fill from SR Email</h2>
                            <p className="text-xs text-gray-400">Select the downloaded email (.msg / .eml) or paste its content — the expediente fields fill automatically.</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {!prefill ? (
                        <div className="flex flex-col gap-4">
                            {/* File picker / drop zone */}
                            <div
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => {
                                    e.preventDefault();
                                    setDragOver(false);
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) handleFile(file);
                                }}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-all ${dragOver ? 'border-[#3DCD58] bg-[#3DCD58]/5' : 'border-gray-200 hover:border-[#3DCD58]/60 hover:bg-gray-50'}`}
                            >
                                <UploadCloud className={`w-8 h-8 ${dragOver ? 'text-[#3DCD58]' : 'text-gray-300'}`} />
                                <span className="text-sm font-bold text-gray-700">{busy ? 'Reading email…' : 'Select email file'}</span>
                                <span className="text-xs text-gray-400 text-center">
                                    .eml (new Outlook) or .msg (classic Outlook).<br />
                                    Tip: drag the email from Outlook to your Desktop/Downloads first, then drop it here.
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".msg,.eml,.txt"
                                    className="hidden"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFile(file);
                                        e.target.value = '';
                                    }}
                                />
                            </div>

                            <div className="flex items-center gap-3 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                                <div className="flex-1 h-px bg-gray-100" /> or paste the email <div className="flex-1 h-px bg-gray-100" />
                            </div>

                            {/* Paste zone */}
                            <div className="flex flex-col gap-2">
                                <textarea
                                    value={pasteText}
                                    onChange={e => setPasteText(e.target.value)}
                                    placeholder={'Open the SR email, select all (Ctrl+A), copy (Ctrl+C) and paste it here…'}
                                    className="w-full h-36 border border-gray-200 rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-[#3DCD58]/40 focus:border-[#3DCD58] outline-none resize-none"
                                />
                                <button
                                    onClick={() => analyzeText(pasteText, 'pasted text')}
                                    disabled={!pasteText.trim() || busy}
                                    className="self-end flex items-center gap-2 px-4 py-2 bg-[#3DCD58] hover:bg-[#2db64a] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                                >
                                    <ClipboardPaste className="w-4 h-4" /> Analyze
                                </button>
                            </div>

                            {error && (
                                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <CheckCircle className="w-4 h-4 text-[#3DCD58]" />
                                    <span><b>{filledCount}</b> of {visibleFields.length} fields detected from <b>{sourceLabel}</b>. Review and edit before applying.</span>
                                </div>
                                <button onClick={reset} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-medium">
                                    <ArrowLeft className="w-3.5 h-3.5" /> Use another email
                                </button>
                            </div>

                            {duplicateOpp && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-3">
                                    <div className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>The OP <b>{prefill.opId}</b> already exists in <b>{duplicateOpp.id}</b>. Choose how to continue.</span></div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setDuplicateAction('revision')} className={`px-3 py-1.5 rounded-lg font-bold border ${duplicateAction === 'revision' ? 'bg-[#3DCD58] text-white border-[#3DCD58]' : 'bg-white border-amber-200'}`}>Create revision</button>
                                        <button type="button" onClick={() => setDuplicateAction('new')} className={`px-3 py-1.5 rounded-lg font-bold border ${duplicateAction === 'new' ? 'bg-[#3DCD58] text-white border-[#3DCD58]' : 'bg-white border-amber-200'}`}>Keep as new OP</button>
                                    </div>
                                    {duplicateAction === 'revision' && <div className="grid grid-cols-1 gap-2 pt-1">
                                        <input value={revisionMessage} onChange={e => setRevisionMessage(e.target.value)} placeholder="Commit message for current work *" className="w-full rounded-lg border-amber-200 text-sm" />
                                        <input value={revisionTags} onChange={e => setRevisionTags(e.target.value)} placeholder="Tags (comma separated)" className="w-full rounded-lg border-amber-200 text-sm" />
                                        {taskStandards.length > 1 && <select value={revisionTaskStandardId} onChange={e => setRevisionTaskStandardId(e.target.value)} className="w-full rounded-lg border-amber-200 text-sm"><option value="">Task standard for the revision…</option>{taskStandards.map(s => <option key={s.id} value={s.id}>{s.name} ({s.taskCount} tasks)</option>)}</select>}
                                        {taskStandards.length === 1 && <p className="text-[10px] text-amber-700">Task standard: <b>{taskStandards[0].name}</b></p>}
                                        <p className="text-[10px] text-amber-700">OP ID, Title and Alias are kept from <b>{duplicateOpp.id}</b> — a revision belongs to the same opportunity.</p>
                                    </div>}
                                </div>
                            )}

                            {/* Editable field grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {visibleFields.map(({ key, label, type }) => {
                                    const value = (prefill[key] || '') as string;
                                    return (
                                        <div key={key} className={`flex flex-col gap-1 p-2.5 rounded-xl border ${value ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                                            <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                                {label}
                                                {!value && <span className="text-amber-500 normal-case font-bold tracking-normal">not found</span>}
                                            </label>
                                            <input
                                                type={type || 'text'}
                                                value={value}
                                                onChange={e => setField(key, e.target.value)}
                                                className="text-sm text-gray-800 bg-transparent border-none focus:ring-0 p-0 outline-none font-medium"
                                                placeholder="—"
                                            />
                                        </div>
                                    );
                                })}
                                {/* Amount + Quote type */}
                                <div className={`flex flex-col gap-1 p-2.5 rounded-xl border ${prefill.proposalAmountUSD !== undefined ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                        Amount (USD) → Proposal + CQA
                                        {prefill.proposalAmountUSD === undefined && <span className="text-amber-500 normal-case font-bold tracking-normal">not found</span>}
                                    </label>
                                    <input
                                        type="number"
                                        value={prefill.proposalAmountUSD ?? ''}
                                        onChange={e => setPrefill(prev => prev ? { ...prev, proposalAmountUSD: e.target.value === '' ? undefined : parseFloat(e.target.value) } : prev)}
                                        className="text-sm text-gray-800 bg-transparent border-none focus:ring-0 p-0 outline-none font-medium"
                                        placeholder="—"
                                    />
                                </div>
                                <div className="flex flex-col gap-1 p-2.5 rounded-xl border border-gray-200 bg-white">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-400">Quote Type</label>
                                    <div className="flex gap-2">
                                        {(['Firm', 'Budgetary'] as const).map(qt => (
                                            <button
                                                key={qt}
                                                onClick={() => setPrefill(prev => prev ? { ...prev, quoteType: prev.quoteType === qt ? undefined : qt } : prev)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${prefill.quoteType === qt ? 'bg-[#3DCD58] text-white border-[#2db64a]' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                            >
                                                {qt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* SR Comments → Overview / Description of the Request */}
                                <div className={`md:col-span-2 flex flex-col gap-1 p-2.5 rounded-xl border ${prefill.comments ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                        Description of the Request (SR Comments)
                                        {!prefill.comments && <span className="text-amber-500 normal-case font-bold tracking-normal">not found</span>}
                                    </label>
                                    <textarea
                                        value={prefill.comments || ''}
                                        onChange={e => setPrefill(prev => prev ? { ...prev, comments: e.target.value } : prev)}
                                        className="text-sm text-gray-800 bg-transparent border-none focus:ring-0 p-0 outline-none font-medium resize-y min-h-[70px] max-h-48"
                                        placeholder="—"
                                    />
                                </div>
                            </div>

                            {/* Import note preview */}
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <button onClick={() => setShowNotePreview(!showNotePreview)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
                                    <span className="flex items-center gap-2 text-xs font-bold text-gray-600">
                                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                                        A note “{prefill.noteTitle}” will be created with the SR comments and metadata
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-bold">{showNotePreview ? 'Hide' : 'Preview'}</span>
                                </button>
                                {showNotePreview && (
                                    <div className="p-3 text-xs text-gray-600 max-h-48 overflow-y-auto prose prose-xs" dangerouslySetInnerHTML={{ __html: sanitizeHtml(prefill.noteHtml) }} />
                                )}
                            </div>

                            {error && (
                                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
                    <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
                    <button
                        onClick={() => { if (prefill) { onApply(prefill, duplicateOpp && duplicateAction === 'revision' ? { kind: 'revision', targetOppId: duplicateOpp.id, commitMessage: revisionMessage, tags: revisionTags, taskStandardId: revisionTaskStandardId } : { kind: 'new' }); handleClose(); } }}
                        disabled={!prefill || (!!duplicateOpp && duplicateAction === 'revision' && (!revisionMessage.trim() || (taskStandards.length > 1 && !revisionTaskStandardId)))}
                        className="flex items-center gap-2 px-4 py-2 bg-[#3DCD58] hover:bg-[#2db64a] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                    >
                        <Sparkles className="w-4 h-4" /> Apply to expediente
                    </button>
                </div>
            </div>
        </div>
    );
};
