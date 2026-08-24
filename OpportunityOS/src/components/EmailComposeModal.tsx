import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Mail, X, Paperclip, Folder as FolderIcon, FileText, ChevronRight, Search,
    AlertTriangle, AlertCircle, RefreshCw, Trash2, ArrowLeft, Loader2, Link as LinkIcon
} from 'lucide-react';
import type { Opportunity, Task, Person, GlobalContact, GeneratedEmailRecord, GeneratedEmailKind } from '../types';
import type { SowTeamMember } from '../services/sowTeamMembers';
import type { EmailComposeSettings, EmailTemplate } from '../services/emailTemplates';
import { resolveTemplates } from '../services/emailTemplates';
import {
    buildEmailDraft, validateComposedEmail, resolveTaskResponsibleRecipients,
    resolveTeamMemberRecipients, resolveSellerRecipient, EMAIL_ADDRESS_REGEX,
    buildGreeting, recipientFirstNames, toneForKind, kindHasStage, sectionOn,
    GREETING_STYLES, fmtFriendlyDate,
} from '../services/emailComposer';
import type { ComposeManualFields, EmailRecipient } from '../services/emailComposer';
import { composeOutlookDraft } from '../services/emailDraftService';
import { sanitizeHtml } from '../services/sanitizeHtml';
import { getFolderHandleForRevision, resolveEffectiveRootPath } from '../services/opportunityFolderLink';
import { listDirectory, toAbsolutePath } from '../features/opportunity-folder/fileOps';
import type { FileItem } from '../features/opportunity-folder/types';
import { getMeta, listLinkedForNote, listLinkedForTask } from '../services/opportunityDocMetaStore';

export interface EmailComposeAttachment {
    name: string;
    fileKey: string;
    absolutePath: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    opportunity: Opportunity;
    emailSettings: EmailComposeSettings;
    userName: string;
    globalContacts?: GlobalContact[];
    /** Template to preselect: a built-in kind id ('status_report', ...) or a custom template id. */
    initialTemplateId?: string;
    /** Tasks to preselect (assignment / reminder flows). */
    initialTaskIds?: string[];
    onGenerated: (record: GeneratedEmailRecord) => void;
    /** Called when the user wants to turn a regular task into an assignment — closes this modal and opens the task editor. */
    onRequestAssignTask?: (taskId: string) => void;
    /** SOW team members available to assign a task to, for the inline "assign without leaving the composer" picker. */
    sowTeamMembers?: SowTeamMember[];
    /** Turns a regular task into a tracked assignment in place (responsible, owner, status) without leaving the composer. */
    onAssignTask?: (taskId: string, teamMemberIds: string[]) => void;
    onCreateMeetingTask?: (input: { title: string; description: string; teamMemberIds: string[] }) => string;
}

// ---------------------------------------------------------------------------
// Recipient chips field with stakeholder/directory typeahead
// ---------------------------------------------------------------------------

interface RecipientFieldProps {
    label: string;
    emails: string[];
    onChange: (emails: string[]) => void;
    people: EmailRecipient[];
}

const RecipientField: React.FC<RecipientFieldProps> = ({ label, emails, onChange, people }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        return people
            .filter(p => !emails.includes(p.email))
            .filter(p => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
            .slice(0, 8);
    }, [people, emails, query]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const add = (email: string) => {
        const clean = email.trim().replace(/[;,]$/, '');
        if (!clean || emails.includes(clean)) return;
        onChange([...emails, clean]);
        setQuery('');
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ';' || e.key === ',') && query.trim()) {
            e.preventDefault();
            if (suggestions.length && !EMAIL_ADDRESS_REGEX.test(query.trim())) add(suggestions[0].email);
            else add(query);
        } else if (e.key === 'Backspace' && !query && emails.length) {
            onChange(emails.slice(0, -1));
        }
    };

    return (
        <div ref={wrapRef} className="relative">
            <label className="text-[9px] font-bold text-gray-500 uppercase">{label}</label>
            <div className="flex flex-wrap items-center gap-1 border border-gray-200 rounded-lg bg-white px-2 py-1.5 min-h-[38px] focus-within:ring-2 focus-within:ring-[#3DCD58]">
                {emails.map(email => (
                    <span key={email} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${EMAIL_ADDRESS_REGEX.test(email) ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        {email}
                        <button onClick={() => onChange(emails.filter(e2 => e2 !== email))} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                    </span>
                ))}
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder={emails.length ? '' : 'Type a name or email...'}
                    className="flex-1 min-w-[120px] text-xs border-none focus:ring-0 p-0.5 bg-transparent"
                />
            </div>
            {open && suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                    {suggestions.map(p => (
                        <button
                            key={p.email}
                            onClick={() => { add(p.email); setOpen(false); }}
                            className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-xs flex justify-between gap-2"
                        >
                            <span className="font-medium text-gray-700 truncate">{p.name}</span>
                            <span className="text-gray-400 truncate">{p.email}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Folder attachment picker (File System Access API, like the Folder tab)
// ---------------------------------------------------------------------------

interface FolderPickerProps {
    opportunityId: string;
    revision?: string;
    onAdd: (files: EmailComposeAttachment[]) => void;
    onClose: () => void;
}

interface PickerItem extends FileItem {
    docType?: string;
    alias?: string;
}

const FolderPicker: React.FC<FolderPickerProps> = ({ opportunityId, revision, onAdd, onClose }) => {
    const [rootPath, setRootPath] = useState('');
    const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [pathStack, setPathStack] = useState<{ name: string; handle: FileSystemDirectoryHandle }[]>([]);
    const [items, setItems] = useState<PickerItem[]>([]);
    const [selected, setSelected] = useState<Record<string, PickerItem>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');

    const loadDir = useCallback(async (handle: FileSystemDirectoryHandle, relPath: string[]) => {
        setLoading(true);
        try {
            const list = await listDirectory(handle, relPath);
            const withMeta: PickerItem[] = await Promise.all(list.map(async item => {
                if (item.kind !== 'file') return item;
                try {
                    const meta = await getMeta(opportunityId, item.relativePath.join('/'));
                    return { ...item, docType: meta?.docType, alias: meta?.alias };
                } catch { return item; }
            }));
            setItems(withMeta);
        } catch (err: any) {
            setError(err?.message || 'Could not read the folder.');
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        (async () => {
            try {
                const [handle, rp] = await Promise.all([
                    getFolderHandleForRevision(opportunityId, revision),
                    resolveEffectiveRootPath(opportunityId, revision),
                ]);
                if (!handle) { setError('No folder linked to this opportunity. Link it in the Folder tab first.'); setLoading(false); return; }
                if (!rp) { setError('The folder base path is not set. Open the Folder tab and set the base path first.'); setLoading(false); return; }
                setDirHandle(handle);
                setRootPath(rp);
                await loadDir(handle, []);
            } catch (err: any) {
                setError(err?.message || 'Could not open the opportunity folder.');
                setLoading(false);
            }
        })();
    }, [opportunityId, revision, loadDir]);

    const currentRel = pathStack.map(p => p.name);

    const enterDir = async (item: PickerItem) => {
        const handle = item.handle as FileSystemDirectoryHandle;
        setPathStack([...pathStack, { name: item.name, handle }]);
        await loadDir(handle, item.relativePath);
    };

    const goUp = async () => {
        if (!pathStack.length || !dirHandle) return;
        const next = pathStack.slice(0, -1);
        setPathStack(next);
        const handle = next.length ? next[next.length - 1].handle : dirHandle;
        await loadDir(handle, next.map(p => p.name));
    };

    const toggle = (item: PickerItem) => {
        const key = item.relativePath.join('/');
        setSelected(prev => {
            const copy = { ...prev };
            if (copy[key]) delete copy[key]; else copy[key] = item;
            return copy;
        });
    };

    const confirm = () => {
        const files = (Object.values(selected) as PickerItem[]).map(item => ({
            name: item.name,
            fileKey: item.relativePath.join('/'),
            absolutePath: toAbsolutePath(rootPath, item.relativePath),
        }));
        onAdd(files);
        onClose();
    };

    const visible = items.filter(i => !filter.trim() || i.name.toLowerCase().includes(filter.trim().toLowerCase()) || (i.alias || '').toLowerCase().includes(filter.trim().toLowerCase()));

    return (
        <div className="border border-gray-200 rounded-xl bg-gray-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-xs text-gray-600 min-w-0">
                    <button onClick={goUp} disabled={!pathStack.length} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"><ArrowLeft className="w-3.5 h-3.5" /></button>
                    <FolderIcon className="w-3.5 h-3.5 text-[#3DCD58] shrink-0" />
                    <span className="truncate font-medium">{currentRel.length ? currentRel.join(' / ') : 'Opportunity folder'}</span>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-gray-200"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter files in this folder..." className="w-full text-xs border-gray-200 rounded-lg pl-7 py-1.5 bg-white" />
            </div>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{error}</div>}
            <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 bg-white rounded-lg border border-gray-100">
                {loading && <div className="flex items-center gap-2 p-3 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>}
                {!loading && visible.length === 0 && !error && <div className="p-3 text-xs italic text-gray-400">Empty folder.</div>}
                {!loading && visible.map(item => {
                    const key = item.relativePath.join('/');
                    return item.kind === 'directory' ? (
                        <button key={key} onClick={() => enterDir(item)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-emerald-50 text-left">
                            <FolderIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-medium text-gray-700 truncate flex-1">{item.name}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                        </button>
                    ) : (
                        <label key={key} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-emerald-50 cursor-pointer">
                            <input type="checkbox" checked={!!selected[key]} onChange={() => toggle(item)} className="rounded text-[#3DCD58] focus:ring-[#3DCD58]" />
                            <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-gray-700 truncate flex-1" title={key}>{item.alias || item.name}</span>
                            {item.docType && <span className="text-[9px] font-black bg-gray-50 text-gray-400 px-1.5 py-0.5 border border-gray-100 rounded uppercase">{item.docType}</span>}
                            <span className="text-[9px] text-gray-300 uppercase">{item.extension || ''}</span>
                        </label>
                    );
                })}
            </div>
            <div className="flex justify-end">
                <button
                    onClick={confirm}
                    disabled={!Object.keys(selected).length}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#3DCD58] text-white hover:bg-[#2db64a] disabled:opacity-40"
                >
                    Attach {Object.keys(selected).length || ''} file(s)
                </button>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Optional content sections (checkboxes) and quick-pick helpers
// ---------------------------------------------------------------------------

/** Checkboxes shown per email type; state lives in manual.sections (defaults in the engine). */
const SECTION_DEFS: Partial<Record<GeneratedEmailKind, { key: string; label: string }[]>> = {
    status_report: [
        { key: 'nextTask', label: 'Next step' },
        { key: 'missingInfo', label: 'Waiting on information' },
        { key: 'history', label: 'Latest update' },
        { key: 'progress', label: 'Progress counters' },
        { key: 'expectedDate', label: 'Expected delivery' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    info_request: [
        { key: 'missingInfo', label: 'Tasks waiting on info' },
        { key: 'wellWish', label: '"I hope you\'re doing well"' },
        { key: 'callOffer', label: 'Offer a quick call' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    task_assignment: [
        { key: 'description', label: 'Details (task description)' },
        { key: 'deliverable', label: 'Expected deliverable' },
        { key: 'subtasks', label: 'Checklist (subtasks)' },
        { key: 'wellWish', label: '"I hope you\'re doing well"' },
        { key: 'callOffer', label: 'Offer a quick call' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    reminder: [
        { key: 'expectedDate', label: 'Expected delivery' },
        { key: 'wellWish', label: '"I hope you\'re doing well"' },
        { key: 'callOffer', label: 'Offer a quick call' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    price_approval: [
        { key: 'summary', label: 'Executive summary' },
        { key: 'commercialTable', label: 'Commercial breakdown table' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    proposal_approval: [
        { key: 'meta', label: 'Revision / version info' },
        { key: 'docs', label: 'Documents list' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    meeting_recap: [
        { key: 'agreements', label: 'Agreements' },
        { key: 'nextSteps', label: 'Next steps (from tasks)' },
        { key: 'nextMeeting', label: 'Next meeting date' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    change_revision: [
        { key: 'wellWish', label: '"I hope you\'re doing well"' },
        { key: 'links', label: 'Links (SR / CQA / bFO)' },
    ],
    approval_resubmission: [{ key: 'links', label: 'Links (SR / CQA / bFO)' }],
    approval_confirmation: [{ key: 'links', label: 'Links (SR / CQA / bFO)' }],
};

/** Frequent deliverables offered as one-click chips in Information Request. */
const SUGGESTED_REQUEST_ITEMS = ['BOM', 'Quotation', 'Updated SLD', 'Datasheets', 'Drawings', 'Site survey', 'Scope confirmation', 'Lead times'];

const isoAddDays = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA');
};

/** This week's Friday, or next Friday if today is Friday or later in the week. */
const isoNextFriday = (): string => {
    const d = new Date();
    const diff = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toLocaleDateString('en-CA');
};

const DUE_DATE_CHIPS: { label: string; iso: () => string }[] = [
    { label: 'Tomorrow', iso: () => isoAddDays(1) },
    { label: '+2 days', iso: () => isoAddDays(2) },
    { label: 'Friday', iso: isoNextFriday },
];

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export const EmailComposeModal: React.FC<Props> = ({
    isOpen, onClose, opportunity, emailSettings, userName,
    globalContacts = [], initialTemplateId, initialTaskIds, onGenerated, onRequestAssignTask,
    sowTeamMembers = [], onAssignTask, onCreateMeetingTask,
}) => {
    const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
    const [assignPickIds, setAssignPickIds] = useState<string[]>([]);
    const templates = useMemo(() => resolveTemplates(emailSettings), [emailSettings]);
    const [templateId, setTemplateId] = useState(initialTemplateId || 'status_report');
    const [to, setTo] = useState<string[]>([]);
    const [cc, setCc] = useState<string[]>([]);
    const [bcc, setBcc] = useState<string[]>([]);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(initialTaskIds || []);
    const [manual, setManual] = useState<ComposeManualFields>({});
    const [attachments, setAttachments] = useState<EmailComposeAttachment[]>([]);
    // Removing an auto-added file only affects this draft. Remember that choice
    // while the composer stays open so task-selection changes do not add it back.
    const excludedAutoAttachmentKeysRef = useRef<Set<string>>(new Set());
    const [taskLinkedDocNames, setTaskLinkedDocNames] = useState<string[]>([]);
    const [subject, setSubject] = useState('');
    const [subjectDirty, setSubjectDirty] = useState(false);
    const [bodyDirty, setBodyDirty] = useState(false);
    const [regenCounter, setRegenCounter] = useState(0);
    const [recipientsTouched, setRecipientsTouched] = useState(false);
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [missingAttachmentPaths, setMissingAttachmentPaths] = useState<string[]>([]);
    const [stageTouched, setStageTouched] = useState(false);
    const [requestItemInput, setRequestItemInput] = useState('');
    const [taskSearch, setTaskSearch] = useState('');
    const [newMeetingTaskTitle, setNewMeetingTaskTitle] = useState('');
    const [newMeetingTaskDescription, setNewMeetingTaskDescription] = useState('');
    const [newMeetingTaskMemberIds, setNewMeetingTaskMemberIds] = useState<string[]>([]);
    const bodyRef = useRef<HTMLDivElement>(null);
    /** Per-block baseline of what we last wrote to the DOM, to tell user edits apart. */
    const writtenBlocksRef = useRef<Map<string, string>>(new Map());
    /** The previous fresh draft HTML (to detect which blocks a state change actually altered). */
    const prevDraftHtmlRef = useRef('');

    const template: EmailTemplate = useMemo(
        () => templates.find(t => t.id === templateId) || templates[0],
        [templates, templateId]
    );
    const kind = template.kind;
    const tone = toneForKind(kind);

    const stakeholders: Person[] = opportunity.stakeholders || [];
    // Recipient suggestions are scoped to people already involved in this opportunity
    // (its stakeholders), not the entire global contacts directory — the user can still
    // type any other address by hand, this only limits what the dropdown suggests.
    const people: EmailRecipient[] = useMemo(() => {
        const out: EmailRecipient[] = [];
        const seen = new Set<string>();
        for (const p of stakeholders) {
            if (p.email && !seen.has(p.email.toLowerCase())) { seen.add(p.email.toLowerCase()); out.push({ name: p.name || p.email, email: p.email }); }
        }
        return out;
    }, [stakeholders]);

    const tasks = opportunity.tasks || [];
    const selectedTasks = useMemo(() => tasks.filter(t =>
        selectedTaskIds.includes(t.id)
        && (!(kind === 'reminder' || kind === 'info_request') || (t.status !== 'Done' && t.status !== 'Canceled'))
    ), [tasks, selectedTaskIds, kind]);
    const primaryTask: Task | undefined = selectedTasks[0];
    const correctionTask = primaryTask?.reworkForTaskId
        ? primaryTask
        : tasks.find(item => item.reworkForTaskId === primaryTask?.id && !!item.changeRevisionId);
    const originalApprovalTask = correctionTask?.reworkForTaskId
        ? tasks.find(item => item.id === correctionTask.reworkForTaskId)
        : primaryTask;

    /** Task ids already covered by a previously generated assignment/reminder email. */
    const informedTaskIds = useMemo(() => {
        const ids = new Set<string>();
        for (const rec of opportunity.emails?.generatedEmails || []) {
            if (rec.kind === 'task_assignment') for (const id of rec.relatedTaskIds || []) ids.add(id);
        }
        return ids;
    }, [opportunity.emails?.generatedEmails]);

    // Reset per-open state
    useEffect(() => {
        if (!isOpen) return;
        setTemplateId(initialTemplateId || 'status_report');
        setSelectedTaskIds(initialTaskIds || []);
        setTo([]); setCc([]); setBcc([]);
        setManual({});
        setAttachments([]);
        excludedAutoAttachmentKeysRef.current = new Set();
        setSubjectDirty(false);
        setBodyDirty(false);
        setRecipientsTouched(false);
        setSendError('');
        setMissingAttachmentPaths([]);
        setShowFolderPicker(false);
        setStageTouched(false);
        setRequestItemInput('');
        setTaskSearch('');
        writtenBlocksRef.current = new Map();
        prevDraftHtmlRef.current = '';
        setRegenCounter(c => c + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Preload documents linked to the selected tasks, plus documents linked to
    // their notes. These are copied into the email draft only; the task/note
    // links in IndexedDB remain untouched if the user removes an attachment.
    useEffect(() => {
        if (!isOpen || selectedTaskIds.length === 0) return;
        let cancelled = false;

        (async () => {
            try {
                const rootPath = await resolveEffectiveRootPath(opportunity.id, opportunity.revision);
                if (!rootPath || cancelled) return;

                const selected = (opportunity.tasks || []).filter(task => selectedTaskIds.includes(task.id));
                const noteIds = Array.from(new Set<string>(selected.flatMap(task => [
                    ...(task.linkedNoteIds || []),
                    ...(task.linkedNoteId ? [task.linkedNoteId] : []),
                ])));
                const linkedGroups = await Promise.all([
                    ...selected.map(task => listLinkedForTask(opportunity.id, task.id)),
                    ...noteIds.map(noteId => listLinkedForNote(opportunity.id, noteId)),
                ]);
                if (cancelled) return;

                const byKey = new Map<string, EmailComposeAttachment>();
                for (const { fileKey } of linkedGroups.flat()) {
                    if (!fileKey || excludedAutoAttachmentKeysRef.current.has(fileKey)) continue;
                    const relativePath = fileKey.split('/').filter(Boolean);
                    byKey.set(fileKey, {
                        name: relativePath[relativePath.length - 1] || fileKey,
                        fileKey,
                        absolutePath: toAbsolutePath(rootPath, relativePath),
                    });
                }
                setAttachments(prev => {
                    const existing = new Set(prev.map(item => item.fileKey));
                    return [...prev, ...Array.from(byKey.values()).filter(item => !existing.has(item.fileKey))];
                });
            } catch (error) {
                console.warn('Could not preload task/note attachments for email:', error);
            }
        })();

        return () => { cancelled = true; };
    }, [isOpen, opportunity.id, opportunity.revision, opportunity.tasks, selectedTaskIds.join('|')]);

    // Docs linked to the primary task → deliverable fallback
    useEffect(() => {
        let cancelled = false;
        if (!primaryTask) { setTaskLinkedDocNames([]); return; }
        listLinkedForTask(opportunity.id, primaryTask.id)
            .then(links => { if (!cancelled) setTaskLinkedDocNames(links.map(l => l.fileKey.split('/').pop() || l.fileKey)); })
            .catch(() => { if (!cancelled) setTaskLinkedDocNames([]); });
        return () => { cancelled = true; };
    }, [opportunity.id, primaryTask?.id]);

    /** The seller/CSE always approves price approvals — resolved from opp.seller or a stakeholder tagged CSE/Seller. */
    const sellerRecipient = useMemo(() => resolveSellerRecipient(opportunity, stakeholders, globalContacts), [opportunity, stakeholders, globalContacts]);

    /** Latest previously generated email of this kind that this one would be following up on. */
    const priorRecord = useMemo(() => {
        if (!kindHasStage(kind)) return undefined;
        const matches = (opportunity.emails?.generatedEmails || []).filter(r => {
            if (r.kind !== kind) return false;
            if (kind === 'task_assignment' || kind === 'change_revision') return (r.relatedTaskIds || []).some(id => selectedTaskIds.includes(id));
            if (kind === 'price_approval' || kind === 'proposal_approval') return !r.relatedRevision || r.relatedRevision === opportunity.revision;
            if (kind === 'info_request') {
                const cur = (manual.requestItems || []).map(s => s.toLowerCase());
                const prev = (r.requestItems || []).map(s => s.toLowerCase());
                return cur.length && prev.length ? prev.some(p => cur.includes(p)) : true;
            }
            return true;
        });
        return [...matches].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    }, [opportunity.emails?.generatedEmails, opportunity.revision, kind, selectedTaskIds, manual.requestItems]);

    // Auto-suggest Follow-up (with the original request date) until the user picks a stage manually.
    useEffect(() => {
        if (!isOpen || stageTouched || !kindHasStage(kind)) return;
        if (priorRecord) {
            setManual(m => ({ ...m, requestStage: 'followup', firstRequestDate: (priorRecord.createdAt || '').slice(0, 10) }));
        } else {
            setManual(m => (m.requestStage || m.firstRequestDate) ? { ...m, requestStage: 'first', firstRequestDate: undefined } : m);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, kind, priorRecord, stageTouched]);

    // Smart recipient prefill per template kind (until the user edits recipients)
    useEffect(() => {
        if (!isOpen || recipientsTouched) return;
        const kind = template.kind;
        const uniq = (list: EmailRecipient[], exclude: string[] = []) => {
            const seen = new Set(exclude.map(e => e.toLowerCase()));
            return list.filter(r => r.email && !seen.has(r.email.toLowerCase()) && !!seen.add(r.email.toLowerCase())).map(r => r.email);
        };
        if ((kind === 'task_assignment' || kind === 'reminder' || kind === 'info_request' || kind === 'change_revision') && selectedTasks.length) {
            const changeRequesters = kind === 'change_revision' && correctionTask
                ? resolveTeamMemberRecipients(correctionTask.changeRequestedByIds, stakeholders, globalContacts)
                : [];
            const toRecipients = kind === 'change_revision' && correctionTask?.owner === 'Me'
                ? changeRequesters
                : selectedTasks.flatMap(t => resolveTaskResponsibleRecipients(t, stakeholders, globalContacts));
            const ccRecipients = kind === 'change_revision' && correctionTask
                ? [
                    ...(correctionTask.owner === 'Me' ? [] : changeRequesters),
                    ...resolveTeamMemberRecipients(correctionTask.changeInformedIds, stakeholders, globalContacts),
                ]
                : kind === 'task_assignment' && primaryTask
                ? [
                    ...resolveTeamMemberRecipients(primaryTask.approverTeamMemberIds, stakeholders, globalContacts),
                    ...resolveTeamMemberRecipients(primaryTask.informedTeamMemberIds, stakeholders, globalContacts),
                ]
                : [];
            const newTo = uniq(toRecipients);
            setTo(newTo);
            setCc(uniq(ccRecipients, newTo));
        } else if (kind === 'approval_resubmission' && originalApprovalTask) {
            const toRecipients = resolveTeamMemberRecipients(originalApprovalTask.approverTeamMemberIds, stakeholders, globalContacts);
            const ccRecipients = correctionTask ? [
                ...resolveTeamMemberRecipients(correctionTask.changeRequestedByIds, stakeholders, globalContacts),
                ...resolveTeamMemberRecipients(correctionTask.changeInformedIds, stakeholders, globalContacts),
                ...resolveTaskResponsibleRecipients(correctionTask, stakeholders, globalContacts),
            ] : [];
            const newTo = uniq(toRecipients);
            setTo(newTo);
            setCc(uniq(ccRecipients, newTo));
        } else if (kind === 'approval_confirmation' && originalApprovalTask) {
            const requesters = resolveTeamMemberRecipients(correctionTask?.changeRequestedByIds, stakeholders, globalContacts);
            const responsible = correctionTask ? resolveTaskResponsibleRecipients(correctionTask, stakeholders, globalContacts) : [];
            const approvers = resolveTeamMemberRecipients(originalApprovalTask.approverTeamMemberIds, stakeholders, globalContacts);
            const informed = resolveTeamMemberRecipients(correctionTask?.changeInformedIds, stakeholders, globalContacts);
            const newTo = uniq(requesters.length ? requesters : (responsible.length ? responsible : approvers));
            setTo(newTo);
            setCc(uniq([...responsible, ...approvers, ...informed], newTo));
        } else if (kind === 'price_approval' && sellerRecipient?.email) {
            setTo(uniq([sellerRecipient]));
        }
    }, [isOpen, template.kind, selectedTaskIds.join('|'), recipientsTouched, sellerRecipient]); // eslint-disable-line react-hooks/exhaustive-deps

    // When the embedded price-approval section is turned on in Proposal Approval, auto-fill the seller
    // name (still editable) and make sure they're CC'd so they can actually approve the price section.
    useEffect(() => {
        if (!isOpen || !manual.includePriceApproval || !sellerRecipient) return;
        if (!manual.sellerName) setManual(m => ({ ...m, sellerName: sellerRecipient.name }));
        if (sellerRecipient.email) {
            const already = [...to, ...cc].some(e => e.toLowerCase() === sellerRecipient.email.toLowerCase());
            if (!already) setCc(prev => [...prev, sellerRecipient.email]);
        }
    }, [isOpen, manual.includePriceApproval, sellerRecipient]); // eslint-disable-line react-hooks/exhaustive-deps

    const draft = useMemo(() => buildEmailDraft(template, opportunity, emailSettings, {
        userName,
        task: primaryTask,
        selectedTasks,
        attachmentNames: attachments.map(a => a.name),
        taskLinkedDocNames,
        manual,
        stakeholders,
        globalContacts,
        toEmails: to,
    }), [template, opportunity, emailSettings, userName, primaryTask, selectedTasks, attachments, taskLinkedDocNames, manual, stakeholders, globalContacts, to]);

    // Keep subject/body in sync with the draft until the user edits them
    useEffect(() => { if (!subjectDirty) setSubject(draft.subject); }, [draft.subject, subjectDirty]);

    /** Record what we last wrote per block, so we can tell user edits from our own writes. */
    const snapshotBlockBaselines = () => {
        const root = bodyRef.current;
        if (!root) return;
        const map = new Map<string, string>();
        root.querySelectorAll('[data-tl-block]').forEach(el => map.set(el.getAttribute('data-tl-block')!, (el as HTMLElement).innerHTML));
        writtenBlocksRef.current = map;
    };

    /**
     * Once the user edited the body, changing a checkbox/selection must not wipe their edits:
     * only the blocks whose fresh content actually changed are added, removed or refreshed,
     * and a block the user edited (or deleted) by hand is left alone.
     */
    const syncBlocks = (freshHtml: string) => {
        const root = bodyRef.current;
        if (!root) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = freshHtml;
        const freshEls = Array.from(tpl.content.querySelectorAll('[data-tl-block]')) as HTMLElement[];
        const freshIds = freshEls.map(el => el.getAttribute('data-tl-block') || '');
        const prevTpl = document.createElement('template');
        prevTpl.innerHTML = prevDraftHtmlRef.current;
        const prevIds = new Set(Array.from(prevTpl.content.querySelectorAll('[data-tl-block]')).map(el => el.getAttribute('data-tl-block') || ''));

        // Blocks the new draft no longer has (section switched off) — remove even if edited.
        root.querySelectorAll('[data-tl-block]').forEach(el => {
            const id = el.getAttribute('data-tl-block') || '';
            if (!freshIds.includes(id)) { el.remove(); writtenBlocksRef.current.delete(id); }
        });
        freshEls.forEach((freshEl, i) => {
            const id = freshIds[i];
            const domEl = root.querySelector(`[data-tl-block="${id}"]`) as HTMLElement | null;
            if (!domEl) {
                // Only (re)insert blocks that are NEW vs. the previous draft — if the user
                // deleted a block by hand, we respect that deletion.
                if (prevIds.has(id)) return;
                const clone = freshEl.cloneNode(true) as HTMLElement;
                let anchor: Element | null = null;
                for (let j = i + 1; j < freshIds.length && !anchor; j++) anchor = root.querySelector(`[data-tl-block="${freshIds[j]}"]`);
                root.insertBefore(clone, anchor);
                writtenBlocksRef.current.set(id, clone.innerHTML);
            } else if (writtenBlocksRef.current.get(id) === domEl.innerHTML) {
                // Untouched by the user -> safe to refresh with the new content.
                if (domEl.innerHTML !== freshEl.innerHTML) {
                    domEl.innerHTML = freshEl.innerHTML;
                    writtenBlocksRef.current.set(id, domEl.innerHTML);
                }
            }
            // else: the user edited this block — leave their version alone.
        });
    };

    useEffect(() => {
        if (!bodyRef.current) return;
        if (!bodyDirty) {
            bodyRef.current.innerHTML = sanitizeHtml(draft.bodyHtml);
            snapshotBlockBaselines();
        } else {
            syncBlocks(draft.bodyHtml);
        }
        prevDraftHtmlRef.current = draft.bodyHtml;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft.bodyHtml, bodyDirty, regenCounter]);

    /** The DOM is the source of truth once rendered (it may contain per-block user edits). */
    const currentBodyHtml = () => (bodyRef.current ? bodyRef.current.innerHTML : draft.bodyHtml);

    /** Inserts a clickable link at the cursor in the body preview. */
    const insertLinkIntoBody = () => {
        const root = bodyRef.current;
        if (!root) return;
        const url = window.prompt('Link URL:', 'https://')?.trim();
        if (!url) return;
        const selectedText = window.getSelection()?.toString();
        const label = selectedText?.trim() || window.prompt('Link text:', url)?.trim() || url;
        root.focus();
        const escaped = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const escapedLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        document.execCommand('insertHTML', false, `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${escapedLabel}</a>`);
        setBodyDirty(true);
    };

    const validation = useMemo(() => validateComposedEmail({
        to, cc, bcc, subject,
        bodyHtml: draft.bodyHtml,
        unknownVariables: draft.unknownVariables,
        emptyVariables: draft.emptyVariables,
        outlookMode: emailSettings.outlookMode,
    }), [to, cc, bcc, subject, draft, emailSettings.outlookMode]);

    const resetPreview = () => {
        setBodyDirty(false);
        setSubjectDirty(false);
        setRegenCounter(c => c + 1);
        if (bodyRef.current) bodyRef.current.innerHTML = sanitizeHtml(draft.bodyHtml);
    };

    const handleOpenInOutlook = async () => {
        if (validation.errors.length || sending) return;
        setSending(true);
        setSendError('');
        setMissingAttachmentPaths([]);
        const bodyHtml = currentBodyHtml();
        const outgoing = document.createElement('div');
        outgoing.innerHTML = bodyHtml;
        outgoing.querySelectorAll('[data-tl-block="signature"]').forEach(node => node.remove());
        const outgoingBodyHtml = outgoing.innerHTML;
        const result = await composeOutlookDraft({
            to, cc, bcc, subject,
            htmlBody: `<div style="font-family:Arial,sans-serif;font-size:12pt">${outgoingBodyHtml}</div>`,
            attachments: attachments.map(a => a.absolutePath),
            mode: emailSettings.outlookMode,
        });
        setSending(false);
        if (!result.ok) {
            setSendError(result.error || 'Could not open the email in Outlook.');
            if (result.missingAttachments?.length) setMissingAttachmentPaths(result.missingAttachments);
            return;
        }
        const record: GeneratedEmailRecord = {
            id: crypto.randomUUID(),
            kind: template.kind,
            templateId: template.id,
            subject,
            to, cc, bcc,
            bodyHtml,
            attachments,
            relatedTaskIds: selectedTaskIds.length ? selectedTaskIds : undefined,
            relatedDocKeys: attachments.length ? attachments.map(a => a.fileKey) : undefined,
            relatedRevision: (template.kind === 'price_approval' || template.kind === 'proposal_approval') ? opportunity.revision : undefined,
            openedWith: result.openedWith === 'eml' ? 'eml' : 'com',
            createdAt: new Date().toISOString(),
            createdBy: userName || undefined,
            toNames: recipientFirstNames(to, stakeholders, globalContacts),
            requestStage: kindHasStage(kind) ? (manual.emailNotes?.trim() ? 'followup' : (manual.requestStage || 'first')) : undefined,
            requestItems: manual.requestItems?.length ? manual.requestItems : undefined,
            emailNotes: manual.emailNotes?.trim() || undefined,
        };
        onGenerated(record);
        onClose();
    };

    if (!isOpen) return null;

    const showTaskSelector = kind === 'task_assignment' || kind === 'reminder' || kind === 'info_request' || kind === 'meeting_recap'
        || kind === 'change_revision' || kind === 'approval_resubmission' || kind === 'approval_confirmation';
    const isAssignmentTask = (t: Task) => t.isAssignment || (t.approverTeamMemberIds?.length ?? 0) > 0;
    // Task Assignment only lists actual assignments, but never hides a task that was
    // explicitly preselected (e.g. opened directly from that task's own "Email"/"Remind" button).
    const selectableTasks = kind === 'task_assignment'
        ? tasks.filter(t => isAssignmentTask(t) || (initialTaskIds || []).includes(t.id))
        : kind === 'change_revision' || kind === 'approval_resubmission'
            ? tasks.filter(t => !!t.reworkForTaskId || (initialTaskIds || []).includes(t.id))
        : kind === 'approval_confirmation'
            ? tasks.filter(t => t.status === 'Done' || (initialTaskIds || []).includes(t.id))
        : tasks.filter(t => t.status !== 'Done' && t.status !== 'Canceled');
    const visibleSelectableTasks = selectableTasks.filter(task =>
        !taskSearch.trim() || `${task.title} ${task.description || ''}`.toLowerCase().includes(taskSearch.trim().toLowerCase())
    );
    // Tasks that could be turned into an assignment (only offered for Task Assignment).
    const otherAssignableTasks = kind === 'task_assignment'
        ? tasks.filter(t => !isAssignmentTask(t) && t.status !== 'Done' && t.status !== 'Canceled')
        : [];

    return (
        <div className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2">
                        <Mail className="w-5 h-5 text-[#3DCD58]" />
                        <div>
                            <h2 className="font-black text-gray-800">Compose Email</h2>
                            <p className="text-[10px] text-gray-400">Opens in Outlook for you to review before sending — nothing is sent automatically.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                {/* Body */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-0 min-h-0">
                    {/* Left: configuration */}
                    <div className="overflow-y-auto border-r border-gray-100 p-4 space-y-4">
                        {/* Template selector */}
                        <div>
                            <label className="text-[9px] font-bold text-gray-500 uppercase">Email type</label>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {templates.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => { setTemplateId(t.id); setBodyDirty(false); setSubjectDirty(false); setRegenCounter(c => c + 1); }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${t.id === template.id ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-[#3DCD58]'}`}
                                    >
                                        {t.topicLabel}{t.isCustom ? ' ✳' : ''}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Recipients */}
                        <div className="space-y-2" onFocusCapture={() => setRecipientsTouched(true)}>
                            <RecipientField label="To" emails={to} onChange={v => { setRecipientsTouched(true); setTo(v); }} people={people} />
                            <RecipientField label="CC" emails={cc} onChange={v => { setRecipientsTouched(true); setCc(v); }} people={people} />
                            <RecipientField label="BCC" emails={bcc} onChange={v => { setRecipientsTouched(true); setBcc(v); }} people={people} />
                            {!people.length && <p className="text-[10px] text-amber-600">This opportunity has no stakeholders with email — add them in the Stakeholders section, or type addresses manually.</p>}
                        </div>

                        {/* Greeting style (click to cycle Hi/Hello/name — Dear/name on approvals) */}
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] font-bold text-gray-500 uppercase shrink-0">Greeting</label>
                            <button
                                onClick={() => setManual(m => ({ ...m, greetingStyle: ((m.greetingStyle ?? 0) + 1) % GREETING_STYLES[tone].length }))}
                                title="Click to cycle the greeting style"
                                className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-[#3DCD58]"
                            >
                                {buildGreeting(to, stakeholders, globalContacts, tone, manual.greetingStyle ?? 0)} <RefreshCw className="w-3 h-3 inline text-gray-300" />
                            </button>
                        </div>

                        {/* First request vs. follow-up */}
                        {kindHasStage(kind) && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Request stage</label>
                                <div className="flex gap-1.5 mt-1">
                                    <button
                                        onClick={() => { setStageTouched(true); setManual(m => ({ ...m, requestStage: 'first' })); }}
                                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border ${(manual.requestStage || 'first') === 'first' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300'}`}
                                    >
                                        First request
                                    </button>
                                    <button
                                        onClick={() => { setStageTouched(true); setManual(m => ({ ...m, requestStage: 'followup', firstRequestDate: m.firstRequestDate || (priorRecord?.createdAt || '').slice(0, 10) || undefined })); }}
                                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border ${manual.requestStage === 'followup' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300'}`}
                                    >
                                        Follow-up
                                    </button>
                                </div>
                                {priorRecord && (
                                    <p className="text-[10px] text-amber-600 mt-1">
                                        A "{priorRecord.subject.match(/\(([^)]*)\)/)?.[1] || priorRecord.kind}" email was already sent on {(priorRecord.createdAt || '').slice(0, 10)}.
                                    </p>
                                )}
                                {manual.requestStage === 'followup' && (
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase shrink-0">First requested on</label>
                                        <input
                                            type="date"
                                            value={manual.firstRequestDate || ''}
                                            onChange={e => setManual(m => ({ ...m, firstRequestDate: e.target.value || undefined }))}
                                            className="text-xs border-gray-200 rounded-lg bg-white py-1"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Shared notes: useful for any email type. A change note makes
                            request-style messages a follow-up even if the original was
                            sent outside the app. */}
                        <div>
                            <label className="text-[9px] font-bold text-gray-500 uppercase">Notes / changes for this email</label>
                            <textarea
                                value={manual.emailNotes || ''}
                                onChange={e => {
                                    const emailNotes = e.target.value;
                                    setManual(m => ({
                                        ...m,
                                        emailNotes: emailNotes || undefined,
                                        ...(emailNotes.trim() && kindHasStage(kind) ? { requestStage: 'followup' as const } : {}),
                                    }));
                                }}
                                rows={3}
                                placeholder="Add context or describe what changed..."
                                className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1"
                            />
                            {kindHasStage(kind) && manual.emailNotes?.trim() && (
                                <p className="text-[10px] text-amber-600 mt-1">Notes entered: this email uses the follow-up wording.</p>
                            )}
                        </div>

                        {/* Needed-by date with quick chips */}
                        {kind !== 'status_report' && kind !== 'meeting_recap' && kind !== 'custom' && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Needed by</label>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <input
                                        type="date"
                                        value={manual.dueDate || ''}
                                        onChange={e => setManual(m => ({ ...m, dueDate: e.target.value || undefined }))}
                                        className="text-xs border-gray-200 rounded-lg bg-white py-1"
                                    />
                                    {DUE_DATE_CHIPS.map(chip => (
                                        <button
                                            key={chip.label}
                                            onClick={() => setManual(m => ({ ...m, dueDate: chip.iso() }))}
                                            className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-gray-200 bg-white text-gray-500 hover:border-[#3DCD58] hover:text-[#3DCD58]"
                                        >
                                            {chip.label}
                                        </button>
                                    ))}
                                    {manual.dueDate && (
                                        <button onClick={() => setManual(m => ({ ...m, dueDate: undefined }))} className="text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                                    )}
                                </div>
                                {manual.dueDate && <p className="text-[10px] text-gray-400 mt-0.5">Will read: "by <b>{fmtFriendlyDate(manual.dueDate)}</b>"</p>}
                            </div>
                        )}

                        {/* Task selector */}
                        {showTaskSelector && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Tasks {kind === 'task_assignment' ? '(first selected = assigned task)' : ''}</label>
                                <div className="relative mt-1">
                                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="search"
                                        value={taskSearch}
                                        onChange={event => setTaskSearch(event.target.value)}
                                        placeholder="Search tasks..."
                                        className="w-full rounded-lg border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-[#3DCD58] focus:ring-[#3DCD58]"
                                    />
                                </div>
                                <div className="mt-1 max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50 bg-white">
                                    {visibleSelectableTasks.length === 0 && <div className="p-2 text-xs italic text-gray-400">No matching active tasks.</div>}
                                    {visibleSelectableTasks.map(t => {
                                        const overdue = !!t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== 'Done' && t.status !== 'Canceled';
                                        return (
                                            <label key={t.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-emerald-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTaskIds.includes(t.id)}
                                                    onChange={() => setSelectedTaskIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                                                    className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                                                />
                                                <span className="flex-1 truncate font-medium text-gray-700" title={t.title}>{t.title}</span>
                                                {(t.isAssignment || (t.approverTeamMemberIds?.length ?? 0) > 0) && <span className="text-[9px] font-black bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded uppercase">Assig.</span>}
                                                {informedTaskIds.has(t.id) && <span title="An assignment email was already generated for this task" className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded uppercase">✓ Informed</span>}
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${overdue ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>{overdue ? 'Overdue' : t.status}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                {kind === 'task_assignment' && otherAssignableTasks.length > 0 && (
                                    <div className="mt-2 border border-dashed border-gray-200 rounded-lg p-2 bg-gray-50/60">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Want to assign a different task?</p>
                                        <div className="max-h-44 overflow-y-auto space-y-1">
                                            {otherAssignableTasks.map(t => (
                                                <div key={t.id} className="text-xs px-1.5 py-1 rounded hover:bg-white">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex-1 truncate text-gray-600" title={t.title}>{t.title}</span>
                                                        {sowTeamMembers.length > 0 && onAssignTask ? (
                                                            <button
                                                                onClick={() => { setAssigningTaskId(assigningTaskId === t.id ? null : t.id); setAssignPickIds(t.responsibleTeamMemberIds || []); }}
                                                                title="Pick who this is assigned to, right here"
                                                                className="text-[10px] font-bold text-blue-600 hover:underline shrink-0"
                                                            >
                                                                {assigningTaskId === t.id ? 'Cancel' : 'Assign'}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => onRequestAssignTask?.(t.id)}
                                                                disabled={!onRequestAssignTask}
                                                                title="Open this task to fill in responsible, dates, priority and approvers before assigning it"
                                                                className="text-[10px] font-bold text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline shrink-0"
                                                            >
                                                                Open task to assign
                                                            </button>
                                                        )}
                                                    </div>
                                                    {assigningTaskId === t.id && (
                                                        <div className="mt-1.5 p-2 bg-white border border-gray-200 rounded-lg space-y-1.5" onClick={e => e.stopPropagation()}>
                                                            {sowTeamMembers.map(m => (
                                                                <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={assignPickIds.includes(m.id)}
                                                                        onChange={() => setAssignPickIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                                                                        className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                                                                    />
                                                                    <span className="text-xs text-gray-700">{m.name}{m.area ? ` · ${m.area}` : ''}</span>
                                                                </label>
                                                            ))}
                                                            <button
                                                                onClick={() => {
                                                                    onAssignTask?.(t.id, assignPickIds);
                                                                    setSelectedTaskIds(prev => prev.includes(t.id) ? prev : [...prev, t.id]);
                                                                    setAssigningTaskId(null);
                                                                }}
                                                                disabled={assignPickIds.length === 0}
                                                                className="w-full mt-1 rounded-lg bg-[#3DCD58] px-2 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                                                            >
                                                                Assign & use this task
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Manual fields per kind */}
                        {kind === 'proposal_approval' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Revision type</label>
                                    <div className="flex gap-1.5 mt-1">
                                        <button
                                            onClick={() => setManual(m => ({ ...m, revisionType: 'draft' }))}
                                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border ${(manual.revisionType || 'draft') === 'draft' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300'}`}
                                        >
                                            Draft revision
                                        </button>
                                        <button
                                            onClick={() => setManual(m => ({ ...m, revisionType: 'final' }))}
                                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border ${manual.revisionType === 'final' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300'}`}
                                        >
                                            Final revision
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">What changed in this version</label>
                                    <textarea value={manual.changeNotes || ''} onChange={e => setManual(m => ({ ...m, changeNotes: e.target.value }))} rows={3} placeholder="Describe what changed since the last version..." className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Points / questions to review</label>
                                    <textarea value={manual.reviewPoints || ''} onChange={e => setManual(m => ({ ...m, reviewPoints: e.target.value }))} rows={3} placeholder="Any doubts or points per section for the approver..." className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1" />
                                </div>
                                {(manual.revisionType || 'draft') === 'draft' && (
                                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5">
                                        <label className="text-[9px] font-bold text-emerald-800 uppercase">Questions / important notes for the team</label>
                                        <textarea
                                            value={manual.approvalQuestions || ''}
                                            onChange={e => setManual(m => ({ ...m, approvalQuestions: e.target.value }))}
                                            rows={3}
                                            placeholder={'Please confirm the proposed scope for phase 2\nImportant: customer requires the delivery date to remain unchanged'}
                                            className="w-full text-xs border-emerald-200 rounded-lg bg-white mt-1"
                                        />
                                        <p className="text-[10px] text-emerald-700 mt-1">This will appear as a highlighted section in the draft approval email.</p>
                                    </div>
                                )}
                                <div className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50 space-y-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={!!manual.includePriceApproval} onChange={e => setManual(m => ({ ...m, includePriceApproval: e.target.checked }))} className="rounded text-[#3DCD58] focus:ring-[#3DCD58]" />
                                        Also include price approval in this email
                                    </label>
                                    {manual.includePriceApproval && (
                                        <div>
                                            <label className="text-[9px] font-bold text-gray-500 uppercase">Seller / CSE to tag</label>
                                            <input
                                                value={manual.sellerName ?? ''}
                                                onChange={e => setManual(m => ({ ...m, sellerName: e.target.value }))}
                                                placeholder={opportunity.seller || 'Who is the Seller / CSE for this opportunity?'}
                                                list="seller-name-options"
                                                className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1"
                                            />
                                            <datalist id="seller-name-options">
                                                {opportunity.seller && <option value={opportunity.seller} />}
                                                {stakeholders.map(p => <option key={p.id} value={p.name} />)}
                                            </datalist>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {kind === 'info_request' && (
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">What do you need?</label>
                                    <div className="flex flex-wrap items-center gap-1 border border-gray-200 rounded-lg bg-white px-2 py-1.5 min-h-[34px] mt-1 focus-within:ring-2 focus-within:ring-[#3DCD58]">
                                        {(manual.requestItems || []).map(item => (
                                            <span key={item} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-800">
                                                {item}
                                                <button onClick={() => setManual(m => ({ ...m, requestItems: (m.requestItems || []).filter(i => i !== item) }))} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                        <input
                                            value={requestItemInput}
                                            onChange={e => setRequestItemInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && requestItemInput.trim()) {
                                                    e.preventDefault();
                                                    const item = requestItemInput.trim();
                                                    setManual(m => (m.requestItems || []).includes(item) ? m : { ...m, requestItems: [...(m.requestItems || []), item] });
                                                    setRequestItemInput('');
                                                }
                                            }}
                                            placeholder={(manual.requestItems || []).length ? '' : 'Type an item and press Enter...'}
                                            className="flex-1 min-w-[110px] text-xs border-none focus:ring-0 p-0.5 bg-transparent"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {SUGGESTED_REQUEST_ITEMS.filter(s => !(manual.requestItems || []).includes(s)).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setManual(m => ({ ...m, requestItems: [...(m.requestItems || []), s] }))}
                                                className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-dashed border-gray-200 bg-white text-gray-400 hover:border-[#3DCD58] hover:text-[#3DCD58]"
                                            >
                                                + {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Extra details (optional, one per line)</label>
                                    <textarea value={manual.infoNeededBullets || ''} onChange={e => setManual(m => ({ ...m, infoNeededBullets: e.target.value }))} rows={2} placeholder={'Voltage level of the main board\nPreferred delivery terms'} className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1" />
                                </div>
                            </div>
                        )}
                        {kind === 'price_approval' && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">What are you asking for?</label>
                                <div className="flex gap-1.5 mt-1">
                                    <button
                                        onClick={() => setManual(m => ({ ...m, priceMode: 'approve' }))}
                                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border ${(manual.priceMode || 'approve') === 'approve' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300'}`}
                                    >
                                        Approve the price
                                    </button>
                                    <button
                                        onClick={() => setManual(m => ({ ...m, priceMode: 'verify' }))}
                                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border ${manual.priceMode === 'verify' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'}`}
                                        title="Ask the seller to confirm the sell price is right, or advise a change"
                                    >
                                        Verify / adjust the price
                                    </button>
                                </div>
                            </div>
                        )}
                        {kind === 'status_report' && (opportunity.history || []).filter(h => (h.content || '').trim()).length > 1 && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Latest update to quote</label>
                                <select
                                    value={manual.historyEntryId || ''}
                                    onChange={e => setManual(m => ({ ...m, historyEntryId: e.target.value || undefined }))}
                                    className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1"
                                >
                                    <option value="">Most recent</option>
                                    {[...(opportunity.history || [])].filter(h => (h.content || '').trim()).sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(h => (
                                        <option key={h.id} value={h.id}>{h.date} — {(h.content || '').slice(0, 60)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {kind === 'meeting_recap' && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Meeting date</label>
                                        <input type="date" value={manual.meetingDate || new Date().toLocaleDateString('en-CA')} onChange={e => setManual(m => ({ ...m, meetingDate: e.target.value || undefined }))} className="block text-xs border-gray-200 rounded-lg bg-white mt-1 py-1" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Next meeting (optional)</label>
                                        <input type="date" value={manual.nextMeetingDate || ''} onChange={e => setManual(m => ({ ...m, nextMeetingDate: e.target.value || undefined }))} className="block text-xs border-gray-200 rounded-lg bg-white mt-1 py-1" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Agreements (one per line)</label>
                                    <textarea value={manual.agreements || ''} onChange={e => setManual(m => ({ ...m, agreements: e.target.value }))} rows={3} placeholder={'Scope confirmed for buildings A and B\nCustomer to send the load list'} className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1" />
                                    <p className="text-[10px] text-gray-400 mt-0.5">Next steps come from the tasks you check above — owner and due date included automatically.</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Next step note (optional)</label>
                                    <textarea value={manual.nextStepNote || ''} onChange={e => setManual(m => ({ ...m, nextStepNote: e.target.value }))} rows={2} placeholder="Describe what happens next, including tasks that run in parallel." className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1" />
                                </div>
                                {onCreateMeetingTask && (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                                        <label className="text-[9px] font-bold text-emerald-700 uppercase">Create and include a new task</label>
                                        <input value={newMeetingTaskTitle} onChange={e => setNewMeetingTaskTitle(e.target.value)} placeholder="Task title" className="w-full text-xs border-gray-200 rounded-lg bg-white" />
                                        <textarea value={newMeetingTaskDescription} onChange={e => setNewMeetingTaskDescription(e.target.value)} rows={2} placeholder="Task description" className="w-full text-xs border-gray-200 rounded-lg bg-white" />
                                        <div className="flex flex-wrap gap-1">
                                            {sowTeamMembers.map(member => <button key={member.id} type="button" onClick={() => setNewMeetingTaskMemberIds(ids => ids.includes(member.id) ? ids.filter(id => id !== member.id) : [...ids, member.id])} className={`px-2 py-1 rounded-full border text-[10px] font-bold ${newMeetingTaskMemberIds.includes(member.id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>{member.name}</button>)}
                                        </div>
                                        <button type="button" disabled={!newMeetingTaskTitle.trim()} onClick={() => {
                                            const id = onCreateMeetingTask({ title: newMeetingTaskTitle.trim(), description: newMeetingTaskDescription.trim(), teamMemberIds: newMeetingTaskMemberIds });
                                            setSelectedTaskIds(ids => [...new Set([...ids, id])]);
                                            setNewMeetingTaskTitle(''); setNewMeetingTaskDescription(''); setNewMeetingTaskMemberIds([]);
                                        }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Create task</button>
                                    </div>
                                )}
                            </div>
                        )}
                        {SECTION_DEFS[kind] && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Include in the email</label>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
                                    {SECTION_DEFS[kind]!.map(({ key, label }) => {
                                        const checked = sectionOn(kind, manual, key);
                                        return (
                                            <label key={key} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => setManual(m => ({ ...m, sections: { ...m.sections, [key]: !checked } }))}
                                                    className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                                                />
                                                <span className="truncate" title={label}>{label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {kind === 'task_assignment' && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Deliverable (defaults to linked docs)</label>
                                <input value={manual.taskDeliverable ?? ''} onChange={e => setManual(m => ({ ...m, taskDeliverable: e.target.value }))} placeholder={taskLinkedDocNames.join(', ') || primaryTask?.deliverable || 'Describe the expected deliverable...'} className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1" />
                                {primaryTask && informedTaskIds.has(primaryTask.id) && (
                                    <p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">✓ Already informed — this will send a new assignment email/reminder.</p>
                                )}
                            </div>
                        )}
                        {(kind === 'price_approval' || (kind === 'proposal_approval' && manual.includePriceApproval)) && !(typeof opportunity.commercial?.paCost === 'number') && (
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">PA Cost (not set in Commercial)</label>
                                <input value={manual.paCost || ''} onChange={e => setManual(m => ({ ...m, paCost: e.target.value }))} placeholder="e.g. 12,500.00" className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1" />
                            </div>
                        )}

                        {/* Attachments */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Attachments (from Folder)</label>
                                <button onClick={() => setShowFolderPicker(v => !v)} className="flex items-center gap-1 text-xs font-bold text-[#3DCD58] hover:text-[#2db64a]">
                                    <Paperclip className="w-3.5 h-3.5" /> Add from Folder
                                </button>
                            </div>
                            {showFolderPicker && (
                                <FolderPicker
                                    opportunityId={opportunity.id}
                                    revision={opportunity.revision}
                                    onAdd={files => setAttachments(prev => {
                                        const keys = new Set(prev.map(a => a.fileKey));
                                        return [...prev, ...files.filter(f => !keys.has(f.fileKey))];
                                    })}
                                    onClose={() => setShowFolderPicker(false)}
                                />
                            )}
                            {attachments.length > 0 && (
                                <div className="space-y-1">
                                    {attachments.map(a => {
                                        const missing = missingAttachmentPaths.some(p => p.toLowerCase() === a.absolutePath.toLowerCase());
                                        return (
                                            <div key={a.fileKey} className={`flex items-center gap-2 text-xs border rounded-lg px-2 py-1.5 ${missing ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                                                <FileText className={`w-3.5 h-3.5 shrink-0 ${missing ? 'text-red-500' : 'text-gray-400'}`} />
                                                <span className="flex-1 truncate" title={a.absolutePath}>{a.name}</span>
                                                {missing && <span className="text-[9px] font-bold text-red-600 uppercase">Not found</span>}
                                                <button onClick={() => {
                                                    excludedAutoAttachmentKeysRef.current.add(a.fileKey);
                                                    setAttachments(prev => prev.filter(x => x.fileKey !== a.fileKey));
                                                }} className="text-gray-300 hover:text-red-500" title="Remove from this email only"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: editable preview */}
                    <div className="flex flex-col min-h-0 p-4 gap-2">
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] font-bold text-gray-500 uppercase shrink-0">Subject</label>
                            <input
                                value={subject}
                                onChange={e => { setSubject(e.target.value); setSubjectDirty(true); }}
                                className="flex-1 text-sm font-medium border-gray-200 rounded-lg bg-white"
                            />
                            <button onClick={resetPreview} title="Regenerate subject and body from the template" className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-[#3DCD58] shrink-0">
                                <RefreshCw className="w-3.5 h-3.5" /> Reset
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-[9px] font-bold text-gray-500 uppercase">Body (editable preview)</label>
                            <button onClick={insertLinkIntoBody} title="Insert a link at the cursor" className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-[#3DCD58]">
                                <LinkIcon className="w-3.5 h-3.5" /> Insert Link
                            </button>
                        </div>
                        <div
                            key={`preview-${regenCounter}`}
                            ref={bodyRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={() => setBodyDirty(true)}
                            className="flex-1 overflow-y-auto border border-gray-200 rounded-xl bg-white p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DCD58]"
                        />
                    </div>
                </div>

                {/* Footer: validation + actions */}
                <div className="border-t border-gray-100 px-5 py-3 shrink-0 space-y-2">
                    {(validation.errors.length > 0 || validation.warnings.length > 0 || sendError) && (
                        <div className="max-h-24 overflow-y-auto space-y-1">
                            {sendError && <div className="flex items-start gap-1.5 text-xs text-red-600"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{sendError}</div>}
                            {validation.errors.map((e2, i) => <div key={`e${i}`} className="flex items-start gap-1.5 text-xs text-red-600"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{e2}</div>)}
                            {validation.warnings.map((w, i) => <div key={`w${i}`} className="flex items-start gap-1.5 text-xs text-amber-600"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{w}</div>)}
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] text-gray-400">Mode: {emailSettings.outlookMode === 'auto' ? 'Auto (COM → .eml fallback)' : emailSettings.outlookMode === 'com' ? 'Classic Outlook (COM)' : '.eml file (new Outlook compatible)'}</p>
                        <div className="flex items-center gap-2">
                            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                            <button
                                onClick={handleOpenInOutlook}
                                disabled={validation.errors.length > 0 || sending}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-[#3DCD58] text-white hover:bg-[#2db64a] disabled:opacity-40"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                Open in Outlook
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmailComposeModal;
