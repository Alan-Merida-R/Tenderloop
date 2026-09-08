
import React, { useState, useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
/* Added Subtask to imports */
import { Opportunity, Task, Subtask, TaskStatus, TASK_STATUS_COLORS, TASK_STATUS_ORDER, taskStatusLabel, TaskPriority, PRIORITY_COLORS, HistoryEntry, PrdPresentation, STATUS_COLORS, OpportunityStatus, MeetingNote, NoteFolder, Commercial, CommercialQuickRef, KPIs, KPIArea, InlineTask, DayType, AreaDayRecord, KPITimeline, DeepLink, OpportunityLabel, OpportunityVersion, QuickLinkItem, TimeLog, FloatingTab, DETAILED_STATUS_COLORS, DETAILED_STATUS_ORDER, DETAILED_STATUS_LABELS, EmailConversation, EmailGhostFolder, EmailLabel, OpportunityEmailsData, Person, GlobalContact, Reminder, ApprovalEvent, AlarmConfig, RACI_LABELS } from '../types';
import { ArrowLeft, ExternalLink, Save, Plus, Trash2, Copy, FileText, CheckSquare, DollarSign, ListChecks, Bold, Heading1, List as ListIcon, ListOrdered, User, Search, AlignLeft, AlignCenter, AlignRight, CheckCircle, Table, Type, Italic, Calendar as CalendarIcon, X, Clock, History as HistoryIcon, Presentation, FileDown, Briefcase, Zap, Maximize2, Minimize2, ChevronUp, ChevronDown, Link, Unlink, Eraser, FolderOpen, Folder, FolderPlus, AlertCircle, Link as LinkIcon, Columns, LayoutGrid, Filter, RotateCcw, Lock, ArrowUpDown, BarChart3, Target, CalendarDays, Timer, ChevronLeft, ChevronRight, Edit3, Tag, GitBranch, GitPullRequest, Database, Minus, Layout, Pin, Percent, FileSpreadsheet, Mail, Inbox, EyeOff, Eye, Check, Paperclip, Bell } from 'lucide-react';
import { SearchableSelect, DateTimePicker, SearchableOption } from './RemindersBell';
import { OpportunityFolderTab } from '../features/opportunity-folder/OpportunityFolderTab';
import { LinkedDocsList } from '../features/doc-links/LinkedDocsList';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { openInNativeApp } from '../features/opportunity-folder/fileOps';
import { SowFormEmbed } from './SowFormEmbed';
import ScopeQuickViewModal from './ScopeQuickViewModal';
import { ScopeCatalog, DEFAULT_SCOPE_CATALOG, catalogContainsLabel, normalizeScopeCatalog, scopeLabelKey, scopeModuleKey, scopeOptionColor } from './scopeCatalog';
import { parseSowFields, pickPrimarySowNote, readScopeSelection } from '../services/scopeSummary';
import { collectSowTeamMembers, SowTeamMember } from '../services/sowTeamMembers';
import { resolveEffectiveRootPath, copyFolderLinkToRevision, moveLegacyFolderLinkToRevision } from '../services/opportunityFolderLink';
import { getMeta, saveMeta, listLinkedForNote, listLinkedForTask } from '../services/opportunityDocMetaStore';
import { CalendarView } from './CalendarView';
import { ImportSrEmailModal, type SrImportDecision } from './ImportSrEmailModal';
import { RevisionCarryoverModal } from './RevisionCarryoverModal';
import { normalizeOpportunityId, SrPrefill } from '../services/srEmailParser';
import { OpportunityExportImportButtons } from '../features/opportunity-export/OpportunityExportImportButtons';
import { NoteTemplate, SimpleMultiSelect, OPPORTUNITY_DETAIL_SECTIONS, normalizeOpportunityDetailSectionOrder, visibleTaskStandards, type OpportunityDetailSectionKey, type TaskStandard } from './SettingsModal';
import { countBusinessDays, countCalendarDays } from '../services/dateUtils';
import { moveAndReorderNote, moveAndReorderFolder, isFolderDescendantOf, sortWithOrderFallback } from '../services/noteUtils';
import { useTimer, useTimerActions } from '../contexts/TimerContext';
import { Play, Pause } from 'lucide-react';
import { CopyTasksModal } from './CopyTasksModal';
import { getNextTask, compareTasksGlobal, reorderTaskStrict, syncAssignmentSubtasks } from '../services/taskUtils';
import { OptimizedInput, OptimizedTextArea } from './OptimizedInput';
import { ExecutionScheduleSection } from '../features/schedule/ExecutionScheduleSection';
import { EmailComposeModal } from './EmailComposeModal';
import { mergeEmailComposeSettings, type EmailComposeSettings } from '../services/emailTemplates';
import { sanitizeHtml } from '../services/sanitizeHtml';
import { sortHistoryEntriesNewestFirst } from '../services/historyUtils';
import type { GeneratedEmailRecord, GeneratedEmailKind } from '../types';
import { ChangeRevisionModal, type ChangeRevisionFormValue } from './ChangeRevisionModal';
import { createChangeRevisionFiles, normalizeDocumentRevision } from '../services/changeRevisionFiles';
import { PROCESS_SECTIONS } from '../services/processSections';
import { calculateWeightedTaskProgress } from '../services/taskProgress';

const getTodayStr = () => new Date().toLocaleDateString('en-CA');

const escapeNoteText = (value: string) => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const appendChangeRevisionNoteEvent = (notes: MeetingNote[], changeRevisionId: string | undefined, label: string, detail: string, date: string) => {
    if (!changeRevisionId) return notes;
    const block = `<div data-change-revision-event="${escapeNoteText(label)}" style="margin-top:12px;padding:10px 12px;border-left:4px solid #3DCD58;background:#f8fafc"><p><strong>${escapeNoteText(label)}</strong> — ${escapeNoteText(date)}</p><p>${escapeNoteText(detail)}</p></div>`;
    return notes.map(note => note.changeRevisionId === changeRevisionId
        ? { ...note, content: `${note.content || ''}${block}` }
        : note);
};

// Once a task is assigned to someone, it can only move through this lifecycle —
// 'Pending'/'In Progress' don't apply once responsibility has been handed off.
const ASSIGNED_TASK_STATUSES: TaskStatus[] = ['Missing Info', 'On Hold', 'Approval', 'Changes Requested / Rework', 'Done', 'Canceled'];

const normalizeHistoryDate = (value?: string | null) => {
    if (!value) return getTodayStr();
    const raw = value.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? getTodayStr() : parsed.toLocaleDateString('en-CA');
};

const sortHistoryEntries = sortHistoryEntriesNewestFirst;

const approvalEventsForTask = (history: HistoryEntry[], taskId: string) =>
    history.filter(entry => entry.approval?.taskId === taskId).map(entry => entry.approval!);

/** "Ana", "Ana and Luis", "Ana, Luis and Marta" — used in history/approval wording. */
const formatNameList = (names: string[]): string => {
    if (names.length <= 1) return names[0] || '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * Crash-backup key for a SOW note. Scoped to the note, not just the opportunity: with the old
 * opportunity-only key a second SOW note read back the first one's answers and re-saved them as
 * its own, which is how duplicated SOWs appeared in Notes.
 */
const sowBackupKey = (opportunityId: string, noteId: string) => `tenderloop-sow-backup-${opportunityId}-${noteId}`;
/** Pre-note-scoping key, still read once as a fallback for the primary SOW note. */
const legacySowBackupKey = (opportunityId: string) => `tenderloop-sow-backup-${opportunityId}`;

/**
 * Sentinel returned by `resolveCompletionDate` when the "when did you finish this?" dialog was
 * opened: the caller must abort and let the dialog re-run the action with the picked date.
 */
const PENDING_COMPLETION_DATE = Symbol('pending-completion-date');

/**
 * A correction task closed with Done behaves like pressing "Send Back for Approval": the whole
 * point of the rework is to return the deliverable to its approvers.
 */
const shouldAutoSendBackForApproval = (task: Task, opportunity: Opportunity): boolean =>
    task.status === 'Done'
    && !!task.reworkForTaskId
    && !task.sentBackForApprovalAt
    && opportunity.tasks.some(candidate => candidate.id === task.reworkForTaskId);

const migrateLegacyApprovalEvents = (opportunity: Opportunity): Opportunity => {
    const legacy = (opportunity as Opportunity & { approvalHistory?: ApprovalEvent[] }).approvalHistory;
    if (!legacy?.length) return opportunity;
    const history = [...(opportunity.history || [])];
    legacy.forEach(event => {
        if (history.some(entry => entry.approval?.taskId === event.taskId && entry.approval.outcome === event.outcome && entry.approval.changeRevisionId === event.changeRevisionId && entry.date === (event.approvedAt || event.sentBackAt || event.requestedAt))) return;
        const taskTitle = opportunity.tasks.find(task => task.id === event.taskId)?.title || 'task';
        const action = event.outcome === 'approved' ? 'Approved' : event.outcome === 'resubmitted' ? 'Sent back for approval' : 'Changes requested';
        history.push({ id: crypto.randomUUID(), date: event.approvedAt || event.sentBackAt || event.requestedAt, createdAt: new Date().toISOString(), approval: event, content: `${action} for "${taskTitle}".${event.requiredChanges ? ` ${event.requiredChanges}` : ''}` });
    });
    const { approvalHistory: _legacy, ...migrated } = opportunity as Opportunity & { approvalHistory?: ApprovalEvent[] };
    return { ...migrated, history: sortHistoryEntries(history), lastUpdated: new Date().toISOString() };
};

// PERF FIX: jsPDF + autoTable are large libraries (~400KB combined).
// Loading them statically caused ~200-400ms of parse/execution on every
// OpportunityDetail mount, even when the user never exports a PDF.
// Lazy loading defers this cost to the first export action only.
let _pdfLibsCache: { jsPDF: any; autoTable: any } | null = null;
const loadPdfLibs = async (): Promise<{ jsPDF: any; autoTable: any }> => {
    if (!_pdfLibsCache) {
        const [jsPDFMod, autoTableMod] = await Promise.all([
            import('jspdf'),
            import('jspdf-autotable')
        ]);
        // Handle both named and default exports (jsPDF has changed its export style)
        _pdfLibsCache = {
            jsPDF: (jsPDFMod as any).jsPDF || jsPDFMod.default,
            autoTable: (autoTableMod as any).default || autoTableMod
        };
    }
    return _pdfLibsCache!;
};

interface Props {
    opportunity: Opportunity;
    opportunities?: Opportunity[];
    onBack: () => void;
    onUpdate: (updated: Opportunity, id?: string, immediate?: boolean) => void;
    onDelete: () => void;
    onSelectOpp?: (id: string, deepLink?: DeepLink) => void;
    noteTemplates?: NoteTemplate[];
    taskStandards?: TaskStandard[];
    holidays?: string[];
    trackedAreas?: string[];
    globalContacts?: GlobalContact[];
    /** Accepts a functional updater (preferred) so concurrent saves never race against a stale snapshot. */
    onGlobalContactsChange?: (update: GlobalContact[] | ((prev: GlobalContact[]) => GlobalContact[])) => void;
    onTrackedAreasChange?: (areas: string[]) => void;
    deepLink?: DeepLink;
    globalLabels?: OpportunityLabel[];
    onMinimize?: (tab: FloatingTab) => void;
    onCloseTab?: () => void;
    isSubView?: boolean;
    emailIntegrationEnabled?: boolean;
    /** Whether the "+ SOW" note-template button shows up in the Notes tab. Off by default. */
    sowSectionEnabled?: boolean;
    /** Whether the "Stakeholders" team panel button shows up in the Notes tab. Off by default. */
    stakeholdersSectionEnabled?: boolean;
    /** Whether the read-only CQA quick-open link shows in the Commercial tab's Project Financial View. On by default. */
    commercialCqaLinkVisible?: boolean;
    /** Persists commercialCqaLinkVisible = false so the user can hide the CQA link inline. */
    onHideCommercialCqaLink?: () => void;
    /** Persists commercialCqaLinkVisible = true so the user can restore the CQA link inline. */
    onShowCommercialCqaLink?: () => void;
    /** Whether the BFO Opportunity Lines link shows in the Commercial tab. On by default. */
    commercialOppLinesLinkVisible?: boolean;
    /** Persists commercialOppLinesLinkVisible = false so the user can hide the link inline. */
    onHideCommercialOppLinesLink?: () => void;
    /** Persists commercialOppLinesLinkVisible = true so the user can restore the link inline. */
    onShowCommercialOppLinesLink?: () => void;
    /** Whether the "Remind me" button shows up in the task edit panel. Off by default. */
    remindersEnabled?: boolean;
    /** Whether time-tracking controls and history are visible. */
    timerEnabled?: boolean;
    onAddReminder?: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => void;
    /** Header fields hidden from the top of the opportunity overview. */
    hiddenOpportunityHeaderFields?: import('./SettingsModal').OpportunityHeaderFieldKey[];
    hiddenOpportunityDetailSections?: OpportunityDetailSectionKey[];
    opportunityDetailSectionOrder?: OpportunityDetailSectionKey[];
    /** Expected-date thresholds and colors configured in Settings > Alarms. */
    alarms?: AlarmConfig[];
    /** Whether changing Expected opens the correction/schedule reason dialog. */
    confirmExpectedDateChanges?: boolean;
    /** Global user name inserted in bracketed form when copying History for bFO. */
    userName?: string;
    /** Email composer settings from AppSettings.emailCompose (merged with defaults internally). */
    emailComposeSettings?: Partial<EmailComposeSettings> | null;
    globalSowForm?: { sections: any[]; questions: any[] };
    /** Scope / System / Notes-at-a-glance option lists (Settings → Labels & Scope). */
    scopeCatalog?: ScopeCatalog;
    onGlobalSowFormChange?: (form: { sections: any[]; questions: any[] }) => void;
}

export interface RichTextEditorHandle {
    /** Reads the editor's current DOM content directly, bypassing the typing
     * debounce. Used to force a synchronous flush right before navigating
     * away (switching notes/tabs) so in-flight keystrokes are never lost. */
    getContent: () => string | null;
}

/**
 * innerHTML does NOT capture live form-field state: an <input>'s typed text
 * lives in its `value` PROPERTY, a checkbox in `checked`, a <select> in
 * `selectedIndex` â€” none of which serialize. Mirror them into attributes/child
 * nodes right before reading innerHTML so template forms survive save/reload.
 */
const syncFormFieldValues = (root: HTMLElement) => {
    root.querySelectorAll('input').forEach(el => {
        const input = el as HTMLInputElement;
        if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked) input.setAttribute('checked', 'checked');
            else input.removeAttribute('checked');
        } else {
            input.setAttribute('value', input.value);
        }
    });
    root.querySelectorAll('textarea').forEach(el => {
        const ta = el as HTMLTextAreaElement;
        if (ta.textContent !== ta.value) ta.textContent = ta.value;
    });
    root.querySelectorAll('select').forEach(el => {
        const sel = el as HTMLSelectElement;
        Array.from(sel.options).forEach((opt, i) => {
            if (i === sel.selectedIndex) opt.setAttribute('selected', 'selected');
            else opt.removeAttribute('selected');
        });
    });
};

/**
 * Form fields inside a contentEditable region behave erratically (typing can
 * edit around them instead of in them). Marking them contentEditable=false
 * restores native input behavior while keeping them part of the note.
 */
const prepareEmbeddedFormFields = (root: HTMLElement) => {
    root.querySelectorAll('input, textarea, select').forEach(el => {
        (el as HTMLElement).setAttribute('contenteditable', 'false');
    });
};

const LINE_BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'BLOCKQUOTE', 'PRE']);

/**
 * BULLET FIX: execCommand('insertUnorderedList'/'insertOrderedList') applies to
 * the caret's nearest BLOCK element. Lines in this editor are usually separated
 * by bare <br>s directly under the contentEditable root, so that "block" was the
 * whole editor and the browser swallowed every preceding line into the first
 * bullet - the bullet landed on the line above instead of the one being typed,
 * unless the user first pressed Enter to leave a blank line.
 *
 * Wrapping only the caret's visual line (the run of nodes between the
 * surrounding <br>s) in its own <div> scopes the command to that single line.
 * No-op when the caret already sits inside a real block, or when the selection
 * spans a range (the browser handles multi-line selections correctly).
 */
const isolateCaretLine = (editor: HTMLElement | null) => {
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return;

    for (let n: Node | null = range.startContainer; n && n !== editor; n = n.parentNode) {
        if (n.nodeType === Node.ELEMENT_NODE && LINE_BLOCK_TAGS.has((n as HTMLElement).tagName)) return;
    }

    // Mark the caret BEFORE restructuring: inserting the marker splits the text
    // node it lands in, so any sibling list captured earlier would be stale.
    const marker = document.createElement('span');
    range.insertNode(marker);

    const isBr = (n: Node | null): boolean => !!n && n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'BR';

    let top: Node = marker;
    while (top.parentNode && top.parentNode !== editor) top = top.parentNode;
    if (top.parentNode !== editor) { marker.remove(); return; }

    const lineNodes: Node[] = [top];
    for (let n = top.previousSibling; n && !isBr(n); n = n.previousSibling) lineNodes.unshift(n);
    for (let n = top.nextSibling; n && !isBr(n); n = n.nextSibling) lineNodes.push(n);

    const leadingBr = lineNodes[0].previousSibling;
    const trailingBr = lineNodes[lineNodes.length - 1].nextSibling;

    const wrapper = document.createElement('div');
    editor.insertBefore(wrapper, lineNodes[0]);
    lineNodes.forEach(n => wrapper.appendChild(n));
    // The <br>s that delimited this line are redundant now that it is its own
    // block; keeping them would add a blank line on every list conversion.
    if (isBr(leadingBr)) (leadingBr as HTMLElement).remove();
    if (isBr(trailingBr)) (trailingBr as HTMLElement).remove();

    const restored = document.createRange();
    restored.setStartBefore(marker);
    restored.collapse(true);
    marker.remove();
    // An otherwise empty block collapses to zero height; <br> is the standard
    // filler contentEditable uses to keep an empty line visible and editable.
    if (!wrapper.textContent && !wrapper.querySelector('br, img, input, table')) wrapper.appendChild(document.createElement('br'));
    sel.removeAllRanges();
    sel.addRange(restored);
};

export const RichTextEditor = forwardRef<RichTextEditorHandle, { content: string, onChange: (val: string) => void, onAttach?: () => void, onToggleLinkedTasks?: () => void, disabled?: boolean, mentionOptions?: Person[] }>(
    ({ content, onChange, onAttach, onToggleLinkedTasks, disabled, mentionOptions = [] }, ref) => {
        const editorRef = useRef<HTMLDivElement>(null);
        const isInternalUpdate = useRef(false);
        const plainTextPasteRef = useRef(false);

        /* IMAGE RESIZE
         * The old approach was a CSS `resize: both` rule on `.editor-content img`.
         * Chromium (and WebKit) ignore `resize` on replaced elements such as <img>,
         * so no handle ever appeared and images could not be resized at all.
         * Instead: clicking an image selects it and draws a real overlay on top of
         * the editor - a frame, a % size bar and a corner grip. Dragging the grip
         * writes an explicit inline width (height stays auto so the aspect ratio is
         * preserved) and flushes the new HTML through onChange like any other edit. */
        const wrapperRef = useRef<HTMLDivElement>(null);
        const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
        const [imageBox, setImageBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

        /** Positions the overlay over the image, in coordinates relative to the editor shell. */
        const measureImage = (img: HTMLImageElement | null) => {
            if (!img || !img.isConnected || !wrapperRef.current || !editorRef.current) { setImageBox(null); return; }
            const wrap = wrapperRef.current.getBoundingClientRect();
            const view = editorRef.current.getBoundingClientRect();
            const box = img.getBoundingClientRect();
            // Scrolled out of the editor viewport: hide the overlay instead of
            // letting it float over the toolbar or the panels below.
            if (box.bottom < view.top || box.top > view.bottom) { setImageBox(null); return; }
            setImageBox({ top: box.top - wrap.top, left: box.left - wrap.left, width: box.width, height: box.height });
        };

        useEffect(() => {
            if (!selectedImage) { setImageBox(null); return; }
            const update = () => measureImage(selectedImage);
            update();
            const scroller = editorRef.current;
            scroller?.addEventListener('scroll', update);
            window.addEventListener('resize', update);
            return () => { scroller?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
        }, [selectedImage]);

        // Undo, delete or a note switch can drop the selected node out of the DOM.
        useEffect(() => {
            if (selectedImage && !selectedImage.isConnected) setSelectedImage(null);
        });

        const commitEditorHtml = () => {
            if (!editorRef.current) return;
            isInternalUpdate.current = true;
            latestHtmlRef.current = editorRef.current.innerHTML;
            onChange(editorRef.current.innerHTML);
        };

        /** Editor's usable content width (minus its p-6 padding), the 100% reference. */
        const editorContentWidth = () => (editorRef.current ? Math.max(80, editorRef.current.clientWidth - 48) : 640);

        const applyImageWidth = (img: HTMLImageElement, width: number) => {
            // .editor-content img keeps max-width:100%, so anything wider than the
            // editor renders capped anyway - clamping here keeps the grip glued to
            // the image instead of drifting off past its right edge.
            const next = Math.round(Math.max(40, Math.min(width, editorContentWidth())));
            img.style.width = next + 'px';
            img.style.height = 'auto';
            // Legacy attributes would fight the inline width once it is set.
            img.removeAttribute('width');
            img.removeAttribute('height');
            measureImage(img);
        };

        const startImageResize = (e: React.MouseEvent) => {
            if (disabled || !selectedImage) return;
            e.preventDefault(); e.stopPropagation();
            const img = selectedImage;
            const startX = e.clientX;
            const startWidth = img.getBoundingClientRect().width;
            const onMove = (ev: MouseEvent) => applyImageWidth(img, startWidth + (ev.clientX - startX));
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                commitEditorHtml();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };

        const scaleSelectedImage = (percent: number) => {
            if (disabled || !selectedImage) return;
            applyImageWidth(selectedImage, editorContentWidth() * percent);
            commitEditorHtml();
        };

        const resetSelectedImage = () => {
            if (disabled || !selectedImage) return;
            selectedImage.style.width = '';
            selectedImage.style.height = '';
            selectedImage.removeAttribute('width');
            selectedImage.removeAttribute('height');
            measureImage(selectedImage);
            commitEditorHtml();
        };

        useImperativeHandle(ref, () => ({
            getContent: () => editorRef.current ? editorRef.current.innerHTML : null,
        }));

        useEffect(() => {
            if (editorRef.current) {
                const el = editorRef.current;
                // CARET/DATA-LOSS FIX: never rewrite the DOM while the user is typing
                // inside the editor (or an embedded form field). Rewriting innerHTML
                // collapses the caret to the start, so fast typers ended up typing
                // into the title/first line and losing formatting. Note switches are
                // safe: the editor remounts via key={note.id}, so this effect's job
                // is only to absorb EXTERNAL content changes, which by definition
                // happen while the editor is not focused.
                const isFocused = el === document.activeElement || el.contains(document.activeElement);
                const currentHTML = el.innerHTML;
                if (content !== currentHTML && !isInternalUpdate.current && !isFocused) {
                    const safeContent = sanitizeHtml(content);
                    el.innerHTML = safeContent;
                    latestHtmlRef.current = safeContent;
                    prepareEmbeddedFormFields(el);
                }
            }
            // Reset the internal update flag AFTER the prop sync attempt.
            // This ensures that if the content prop changes (e.g., switching notes),
            // it will be allowed to update the innerHTML.
            isInternalUpdate.current = false;
        }, [content]);

        // Initial mount: make embedded form fields behave natively.
        useEffect(() => {
            if (editorRef.current) prepareEmbeddedFormFields(editorRef.current);
        }, []);

        const exec = (command: string, value: string | undefined = undefined) => {
            if (disabled) return;
            if (editorRef.current) editorRef.current.focus();
            // See isolateCaretLine: without it a list command started on a <br>
            // separated line pulls the previous lines into the first bullet.
            if (command === 'insertUnorderedList' || command === 'insertOrderedList') isolateCaretLine(editorRef.current);
            document.execCommand(command, false, value);
            if (editorRef.current) {
                isInternalUpdate.current = true;
                // Freshly inserted form fields (e.g. toolbar checkbox) need native
                // behavior, and existing field values must survive serialization.
                prepareEmbeddedFormFields(editorRef.current);
                syncFormFieldValues(editorRef.current);
                latestHtmlRef.current = editorRef.current.innerHTML;
                onChange(editorRef.current.innerHTML);
            }
        };

        const insertHtml = (html: string) => {
            if (disabled) return;
            exec('insertHTML', html);
        };

        const highlightColor = (color: string) => {
            exec('hiliteColor', color);
        };

        const addLink = () => {
            if (disabled) return;
            const url = window.prompt('Enter URL:');
            if (url) {
                if (editorRef.current) editorRef.current.focus();
                exec('createLink', url);
            }
        };

        // Native CSS `resize` handles on <img> (see .editor-content img rule below) let the
        // user drag-resize images, but that drag doesn't fire a DOM 'input' event, so the
        // resized width/height would never reach onChange without this explicit sync on
        // mouseup (when the resize drag ends).
        const handleMouseUp = () => {
            if (disabled || !editorRef.current) return;
            const newHtml = editorRef.current.innerHTML;
            if (newHtml !== latestHtmlRef.current) {
                latestHtmlRef.current = newHtml;
                isInternalUpdate.current = true;
                onChange(newHtml);
            }
        };

        const insertDividerFromText = (range: Range) => {
            const del = range.cloneRange();
            del.setStart(range.startContainer, 0);
            del.deleteContents();
            document.execCommand('insertHTML', false, '<hr><p><br></p>');
            if (editorRef.current) {
                isInternalUpdate.current = true;
                onChange(editorRef.current.innerHTML);
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            // Markdown shortcuts: * or - + Space â†’ bullet list, 1. + Space â†’ numbered list,
            // --- + Space/Enter â†’ horizontal divider line
            if (e.key === ' ' || e.key === 'Enter') {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) || '';
                    if (textBefore === '---') {
                        e.preventDefault();
                        insertDividerFromText(range);
                        return;
                    }
                }
            }
            if (e.key === ' ') {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) || '';
                    // exec() isolates the caret's line first (see isolateCaretLine)
                    // and pushes the new html through onChange, which the raw
                    // execCommand calls used here previously never did.
                    if (textBefore === '*' || textBefore === '-') {
                        e.preventDefault();
                        const del = range.cloneRange();
                        del.setStart(range.startContainer, 0);
                        del.deleteContents();
                        exec('insertUnorderedList');
                        return;
                    }
                    if (/^\d+\.$/.test(textBefore)) {
                        e.preventDefault();
                        const del = range.cloneRange();
                        del.setStart(range.startContainer, 0);
                        del.deleteContents();
                        exec('insertOrderedList');
                        return;
                    }
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
                // Paste as plain text. Some browsers don't fire a paste event for
                // Ctrl+Shift+V on contentEditable, so read the clipboard directly
                // when the async Clipboard API is available.
                if (navigator.clipboard?.readText) {
                    e.preventDefault();
                    navigator.clipboard.readText()
                        .then(text => { if (text) document.execCommand('insertText', false, text); })
                        .catch(() => {
                            // Permission denied: arm the legacy flag so an immediate
                            // Ctrl+V is stripped to plain text by handlePaste.
                            plainTextPasteRef.current = true;
                            window.setTimeout(() => { plainTextPasteRef.current = false; }, 1500);
                        });
                    return;
                }
                // No Clipboard API: flag it and let the browser fire the paste
                // event (keydown has no clipboard access) â€” handlePaste intercepts.
                plainTextPasteRef.current = true;
                window.setTimeout(() => { plainTextPasteRef.current = false; }, 500);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                document.execCommand('bold');
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                e.preventDefault();
                document.execCommand('italic');
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                insertHtml('&nbsp;&nbsp;&nbsp;&nbsp;');
            }
        };

        const handleClick = (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            // Clicking an image selects it (shows the resize overlay); clicking
            // anywhere else in the editor clears that selection.
            setSelectedImage(!disabled && target.tagName === 'IMG' ? (target as HTMLImageElement) : null);
            if (target.tagName === 'A') {
                const href = (target as HTMLAnchorElement).getAttribute('href');
                if (href) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                }
            }
            if (target instanceof HTMLInputElement && target.type === 'checkbox') {
                if (disabled) {
                    e.preventDefault();
                    return;
                }
                if (target.checked) {
                    target.setAttribute('checked', 'checked');
                } else {
                    target.removeAttribute('checked');
                }
                isInternalUpdate.current = true;
                if (editorRef.current) onChange(editorRef.current.innerHTML);
            }
        };

        const debounceTimeoutRef = useRef<number | null>(null);
        // DATA-LOSS FIX: mirrors the DOM's innerHTML synchronously on every keystroke.
        // The unmount cleanup below cannot read editorRef.current â€” React detaches DOM
        // refs (sets them to null) synchronously during commit, BEFORE useEffect cleanup
        // functions run for unmounting components. Switching notes/tabs remounts this
        // editor (key={currentNote.id}), so any keystroke within the 150ms debounce
        // window was silently dropped: the old "if (editorRef.current)" guard was always
        // false by the time the cleanup ran, so onChange never fired with the final text.
        const latestHtmlRef = useRef(content);

        const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
            if (disabled) return;
            isInternalUpdate.current = true;
            // Let contentEditable paint immediately.  Serializing a large rich-text
            // note (and walking every embedded field) on *every* keypress was enough
            // to make the cursor visibly lag.  We only need the serialized HTML once
            // the user pauses; switching notes still reads the live DOM synchronously.
            const editor = e.currentTarget;
            if (debounceTimeoutRef.current) window.clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = window.setTimeout(() => {
                debounceTimeoutRef.current = null;
                syncFormFieldValues(editor);
                const newHtml = editor.innerHTML;
                latestHtmlRef.current = newHtml;
                onChange(newHtml);
            }, 250);
        };

        // <select> and <input type="date"> fire 'change' (not 'input') on commit.
        // React doesn't surface native change from arbitrary children of a
        // contentEditable div, so attach a native listener.
        useEffect(() => {
            const el = editorRef.current;
            if (!el || disabled) return;
            const onFormChange = (e: Event) => {
                const t = e.target;
                if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) {
                    isInternalUpdate.current = true;
                    syncFormFieldValues(el);
                    const newHtml = el.innerHTML;
                    latestHtmlRef.current = newHtml;
                    if (debounceTimeoutRef.current) window.clearTimeout(debounceTimeoutRef.current);
                    debounceTimeoutRef.current = window.setTimeout(() => {
                        debounceTimeoutRef.current = null;
                        onChange(newHtml);
                    }, 150);
                }
            };
            el.addEventListener('change', onFormChange);
            return () => el.removeEventListener('change', onFormChange);
        }, [disabled, onChange]);

        useEffect(() => {
            return () => {
                if (debounceTimeoutRef.current) {
                    window.clearTimeout(debounceTimeoutRef.current);
                    debounceTimeoutRef.current = null;
                    // Flush unconditionally on unmount, from the ref (not the DOM node).
                    onChange(latestHtmlRef.current);
                }
            };
        }, []);

        const MAX_IMAGE_DIMENSION = 1280;
        const IMAGE_QUALITY = 0.75;

        const compressImageFile = (file: File): Promise<string> =>
            new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        let { width, height } = img;
                        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
                            const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
                            width = Math.floor(width * ratio);
                            height = Math.floor(height * ratio);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) { reject(new Error('Canvas not available')); return; }
                        ctx.drawImage(img, 0, 0, width, height);
                        const mimeOut = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                        const dataUrl = canvas.toDataURL(mimeOut, IMAGE_QUALITY);
                        resolve(dataUrl);
                    };
                    img.onerror = reject;
                    img.src = ev.target?.result as string;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

        const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
            if (disabled) return;
            // Ctrl+Shift+V â†’ insert clipboard TEXT only, discarding formatting.
            if (plainTextPasteRef.current) {
                plainTextPasteRef.current = false;
                const text = e.clipboardData?.getData('text/plain');
                if (text) {
                    e.preventDefault();
                    // insertText keeps undo history and fires onInput (which serializes).
                    document.execCommand('insertText', false, text);
                    return;
                }
            }
            const items = Array.from(e.clipboardData?.items || []) as DataTransferItem[];
            const imageItem = items.find(i => i.type.startsWith('image/'));
            if (!imageItem) return;
            e.preventDefault();
            const file = imageItem.getAsFile();
            if (!file) return;
            try {
                const dataUrl = await compressImageFile(file);
                const html = `<img src="${dataUrl}" style="max-width:100%; height:auto;" />`;
                insertHtml(html);
            } catch {
                alert('Failed to compress image.');
            }
        };

        return (
            <div ref={wrapperRef} className={`flex flex-1 flex-col h-full min-h-0 min-w-0 relative border rounded-lg ${disabled ? 'bg-gray-50 border-gray-100' : 'border-gray-200 shadow-sm'}`}>
                {!disabled && (
                    <div className="flex items-center gap-0.5 border-b border-gray-200 p-1 bg-gray-50 overflow-x-auto shrink-0 select-none sticky top-0 z-10 [&>button:not(.note-tasks-trigger)]:p-1 [&>select]:h-6">
                        <select
                            onChange={(e) => exec('fontName', e.target.value)}
                            className="p-1 px-2 pr-6 text-[10px] bg-white border border-gray-200 rounded text-gray-700 h-7 focus:ring-0 focus:outline-none cursor-pointer appearance-none bg-no-repeat bg-[right_0.25rem_center] bg-[length:1em_1em]"
                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")' }}
                        >
                            <option value="">Font</option>
                            <option value="Arial">Arial</option>
                            <option value="Calibri">Calibri</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Courier New">Courier New</option>
                            <option value="Inter">Inter</option>
                        </select>

                        <select
                            onChange={(e) => {
                                const selection = window.getSelection()?.toString();
                                if (selection) {
                                    insertHtml(`<span style="font-size: ${e.target.value}px">${selection}</span>`);
                                }
                            }}
                            className="p-1 px-2 pr-6 text-[10px] bg-white border border-gray-200 rounded text-gray-700 h-7 focus:ring-0 focus:outline-none cursor-pointer appearance-none bg-no-repeat bg-[right_0.25rem_center] bg-[length:1em_1em]"
                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")' }}
                        >
                            <option value="">Size</option>
                            <option value="10">10</option>
                            <option value="12">12</option>
                            <option value="14">14</option>
                            <option value="16">16</option>
                            <option value="18">18</option>
                            <option value="24">24</option>
                            <option value="32">32</option>
                        </select>

                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={() => exec('formatBlock', 'H1')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Heading 1"><Heading1 className="w-4 h-4" /></button>
                        <button onClick={() => exec('bold')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Bold"><Bold className="w-4 h-4" /></button>
                        <button onClick={() => exec('italic')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Italic"><Italic className="w-4 h-4" /></button>
                        <button onClick={() => exec('underline')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Underline"><Type className="w-4 h-4" style={{ textDecoration: 'underline' }} /></button>
                        <button onClick={() => exec('removeFormat')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Clear Formatting"><Eraser className="w-4 h-4" /></button>

                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={() => exec('justifyLeft')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Align Left"><AlignLeft className="w-4 h-4" /></button>
                        <button onClick={() => exec('justifyCenter')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Align Center"><AlignCenter className="w-4 h-4" /></button>
                        <button onClick={() => exec('justifyRight')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Align Right"><AlignRight className="w-4 h-4" /></button>

                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={addLink} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Insert Link"><Link className="w-4 h-4" /></button>
                        <button onClick={() => exec('unlink')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Remove Link"><Unlink className="w-4 h-4" /></button>

                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={() => {
                            const tableHtml = `<table style="width:100%; border-collapse: collapse; border: 1px solid #ccc;" border="1"><tbody><tr><td style="border: 1px solid #ccc; padding: 8px;"></td><td style="border: 1px solid #ccc; padding: 8px;"></td></tr><tr><td style="border: 1px solid #ccc; padding: 8px;"></td><td style="border: 1px solid #ccc; padding: 8px;"></td></tr></tbody></table><p><br></p>`;
                            insertHtml(tableHtml);
                        }} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Insert Table"><Table className="w-4 h-4" /></button>
                        <button onClick={() => insertHtml('<hr><p><br></p>')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Insert Divider Line (or type --- )"><Minus className="w-4 h-4" /></button>

                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={onAttach} className="p-1.5 hover:bg-gray-200 rounded text-[#3DCD58] flex items-center gap-1" title="Attach Doc"><LinkIcon className="w-4 h-4" /> <span className="text-[10px] font-bold uppercase">Attach</span></button>
                        {onToggleLinkedTasks && <button onClick={onToggleLinkedTasks} className="note-tasks-trigger ml-1 inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-white shadow-sm hover:bg-blue-700" title="Open linked tasks panel"><CheckSquare className="w-3.5 h-3.5" /> <span className="text-[10px] font-black uppercase">Tasks</span></button>}
                        {mentionOptions.length > 0 && <select defaultValue="" onChange={e => { const person = mentionOptions.find(p => p.id === e.target.value); if (person) insertHtml(`<span contenteditable="false" data-stakeholder-id="${person.id}" style="color:#2563eb;font-weight:700">@${person.name}</span>&nbsp;`); e.currentTarget.value = ''; }} className="h-7 max-w-36 text-[10px] border-gray-200 rounded bg-white" title="Mention opportunity stakeholder">
                            <option value="">@ Mention</option>
                            {mentionOptions.map(p => <option key={p.id} value={p.id}>{p.name} Â· {(p.roles || (p.role ? [p.role] : [])).join(', ')}</option>)}
                        </select>}
                        
                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <div className="flex gap-1 items-center bg-white px-1 rounded border border-gray-200">
                            <button onClick={() => highlightColor('#fca5a5')} className="w-4 h-4 rounded-full bg-red-300 hover:scale-110 transition-transform"></button>
                            <button onClick={() => highlightColor('#fde047')} className="w-4 h-4 rounded-full bg-yellow-300 hover:scale-110 transition-transform"></button>
                            <button onClick={() => highlightColor('#86efac')} className="w-4 h-4 rounded-full bg-green-300 hover:scale-110 transition-transform"></button>
                            <button onClick={() => highlightColor('#93c5fd')} className="w-4 h-4 rounded-full bg-blue-300 hover:scale-110 transition-transform"></button>
                        </div>
                        
                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={() => exec('insertUnorderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Bullet List"><ListIcon className="w-4 h-4" /></button>
                        <button onClick={() => exec('insertOrderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Numbered List"><ListOrdered className="w-4 h-4" /></button>
                        <button onClick={() => insertHtml('<input type="checkbox"> ')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Checkbox"><CheckCircle className="w-4 h-4" /></button>
                    </div>
                )}
                <div
                    ref={editorRef}
                    className={`flex-1 p-6 overflow-y-scroll overflow-x-auto overscroll-contain focus:outline-none text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none min-h-0 editor-content ${disabled ? 'cursor-default' : 'bg-white cursor-text'}`}
                    style={{ scrollbarGutter: 'stable' }}
                    contentEditable={!disabled}
                    onInput={handleInput}
                    onPaste={handlePaste}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    onMouseUp={handleMouseUp}
                    suppressContentEditableWarning={true}
                />
                {!disabled && selectedImage && imageBox && (
                    <>
                        <div
                            className="pointer-events-none absolute z-20 rounded-sm border-2 border-[#3DCD58]"
                            style={{ top: imageBox.top, left: imageBox.left, width: imageBox.width, height: imageBox.height }}
                        />
                        <div
                            className="absolute z-30 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-md"
                            style={{ top: Math.max(2, imageBox.top - 26), left: imageBox.left }}
                        >
                            <span className="px-1 text-[9px] font-black uppercase tracking-wider text-gray-400">Size</span>
                            {[0.25, 0.5, 0.75, 1].map(percent => (
                                <button
                                    key={percent}
                                    type="button"
                                    /* Keep the current selection: a focus change would drop the
                                       selected image before the click handler could run. */
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => scaleSelectedImage(percent)}
                                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100"
                                >
                                    {percent * 100}%
                                </button>
                            ))}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={resetSelectedImage}
                                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-500 hover:bg-gray-100"
                                title="Back to the image's original size"
                            >
                                Reset
                            </button>
                        </div>
                        <div
                            onMouseDown={startImageResize}
                            title="Drag to resize"
                            className="absolute z-30 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-white bg-[#3DCD58] shadow"
                            style={{ top: imageBox.top + imageBox.height - 6, left: imageBox.left + imageBox.width - 6 }}
                        />
                    </>
                )}
                <style>{`
                    .editor-content ul { list-style-type: disc; padding-left: 1.5em; }
                    .editor-content ol { list-style-type: decimal; padding-left: 1.5em; }
                    .editor-content li { padding-left: 0.25em; }
                    .editor-content a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
                    .editor-content table { border-collapse: collapse; width: 100%; margin: 1em 0; border: 1px solid #ccc; }
                    .editor-content td { border: 1px solid #ccc; padding: 8px; min-width: 50px; }
                    .editor-content h1 { font-size: 1.5em; font-weight: bold; margin-top: 0.5em; margin-bottom: 0.25em; }
                    .editor-content hr { border: none; border-top: 2px solid #e5e7eb; margin: 1.25em 0; }
                    /* No 'resize: both' here - browsers ignore it on <img>. Resizing is
                       driven by the selection overlay above (click an image to get it). */
                    .editor-content img { display: inline-block; max-width: 100%; cursor: pointer; }
                    /* Nothing else hints that an image is clickable, so hovering one
                       shows the same green frame the selection draws. */
                    .editor-content img:hover { outline: 2px solid rgba(61, 205, 88, 0.45); outline-offset: 1px; }
                `}</style>
            </div>
        );
    }
);

/**
 * PERFORMANCE ALGORITHM: NoteEditorWrapper
 * This component isolates the 'activeNoteHtml' state to prevent the massive 
 * OpportunityDetail component from re-rendering on every single keystroke.
 */
const NoteEditorWrapper = forwardRef<RichTextEditorHandle, any>(({ initialContent, onChange, ...rest }, ref) => {
    const [localValue, setLocalValue] = useState(initialContent);
    const lastInitial = useRef(initialContent);

    // If the note ID changes in the parent, sync the new initial content
    useEffect(() => {
        if (initialContent !== lastInitial.current) {
            setLocalValue(initialContent);
            lastInitial.current = initialContent;
        }
    }, [initialContent]);

    const handleInnerChange = (val: string) => {
        setLocalValue(val);
        onChange(val); // Bubbles up to the debounced parent handler
    };

    return <RichTextEditor {...rest} ref={ref} content={localValue} onChange={handleInnerChange} />;
});

/**
 * PERF: Inline task text input. The previous implementation fired onChange on every
 * keystroke, which chained into handleInlineTaskChange -> setLocalOpp + onUpdate and
 * re-rendered the entire 6000-line OpportunityDetail per character. This variant keeps
 * an isolated local value and only bubbles up on blur or Enter (same pattern as
 * OptimizedInput), so typing inside an inline task no longer freezes the browser.
 */
/**
 * TITLE-TYPING FIX: the note title used to be a fully controlled input bound to
 * localOpp.notes. Every keystroke ran handleFieldChange, which commits the
 * expediente-wide re-render inside React.startTransition - a LOW PRIORITY,
 * interruptible update. React kept re-rendering the input from the not-yet
 * committed value, so anyone typing faster than that transition could finish saw
 * characters dropped, duplicated or reordered ("escribe cosas sin sentido").
 *
 * Holding the text in local state makes the DOM value independent of that
 * transition; the value is pushed up on blur / Enter, the same commit-on-blur
 * pattern already used by OptimizedInput and InlineTaskTextInput. Clicking
 * another note blurs the input first, so the rename always lands on the note it
 * was typed into.
 */
const NoteTitleInput = React.memo(({ value, onCommit, disabled, className, placeholder }: {
    value: string;
    onCommit: (val: string) => void;
    disabled?: boolean;
    className?: string;
    placeholder?: string;
}) => {
    const [localVal, setLocalVal] = useState(value || '');
    useEffect(() => { setLocalVal(value || ''); }, [value]);

    return (
        <input
            value={localVal}
            disabled={disabled}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={() => { if (!disabled && localVal !== (value || '')) onCommit(localVal); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
            className={className}
            placeholder={placeholder}
        />
    );
});

const InlineTaskTextInput = React.memo(({ value, onCommit, disabled, className, placeholder }: {
    value: string;
    onCommit: (val: string) => void;
    disabled?: boolean;
    className?: string;
    placeholder?: string;
}) => {
    const [localVal, setLocalVal] = useState(value || '');
    useEffect(() => { setLocalVal(value || ''); }, [value]);

    const sync = () => {
        if (!disabled && localVal !== (value || '')) onCommit(localVal);
    };

    return (
        <input
            value={localVal}
            disabled={disabled}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={sync}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
            className={className}
            placeholder={placeholder}
        />
    );
});

/**
 * Asked whenever a task with a due date is marked Done: the due date is a commitment, not proof
 * of when the work actually finished, so the user confirms the real day (due date / today / any
 * other date) and it is stored on `task.completionDate` for tracking.
 */
const CompletionDateModal = ({ taskTitle, dueDate, onConfirm, onCancel }: {
    taskTitle: string;
    dueDate: string;
    onConfirm: (date: string) => void;
    onCancel: () => void;
}) => {
    const today = getTodayStr();
    // The custom picker is capped at today, so never seed it with a future due date.
    const [customDate, setCustomDate] = useState(dueDate <= today ? dueDate : today);
    const late = dueDate < today;
    const options: { date: string; label: string; hint: string }[] = [
        { date: dueDate, label: 'On its due date', hint: `${dueDate}${late ? ' · the committed date' : ''}` },
        { date: today, label: 'Today', hint: `${today}${late ? ' · finished late' : ' · finished early'}` },
    ];
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onCancel}>
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600"><CalendarDays className="w-6 h-6" /></div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900">When was it finished?</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Completion tracking</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed truncate" title={taskTitle}>{taskTitle}</p>
                    </div>

                    <div className="space-y-2">
                        {options.map(option => (
                            <button
                                key={option.label}
                                onClick={() => onConfirm(option.date)}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-gray-100 hover:border-[#3DCD58] hover:bg-[#3DCD58]/5 transition-all text-left"
                            >
                                <span className="text-sm font-black text-gray-800">{option.label}</span>
                                <span className="text-[11px] font-bold text-gray-400">{option.hint}</span>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-gray-100">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Another date</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={customDate}
                                max={today}
                                onChange={e => setCustomDate(e.target.value)}
                                className="flex-1 border-gray-100 bg-gray-50 rounded-2xl text-sm font-bold p-3 focus:bg-white transition-all"
                            />
                            <button
                                onClick={() => customDate && onConfirm(customDate)}
                                disabled={!customDate}
                                className="px-5 rounded-2xl bg-gray-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-black disabled:opacity-40 transition-all"
                            >
                                Use
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={onCancel}
                        className="w-full py-3 rounded-2xl border border-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * Picker for the SOW "Team Involved" people, used to assign task responsibles.
 * Renders as a plain inline checklist (no absolutely-positioned dropdown) because
 * these pickers live inside scrollable card lists / modals â€” a floating dropdown
 * gets clipped by the ancestor's overflow box and silently fails to "drop down".
 */
export const ResponsibleTeamPicker = ({ options, selected, onChange, onCreate }: { options: SowTeamMember[], selected: string[], onChange: (ids: string[]) => void, onCreate?: (name: string) => string | undefined }) => {
    const [search, setSearch] = useState('');
    const filtered = options.filter(o => `${o.name} ${o.area}`.toLowerCase().includes(search.toLowerCase()));
    return (
        <div className="space-y-1.5">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                Opportunity team
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search or create contact..." className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]" />
            {options.length === 0 ? (
                search.trim() ? <button type="button" onClick={() => { onCreate?.(search.trim()); setSearch(''); }} className="text-[10px] text-blue-600 font-bold p-2 bg-blue-50 rounded border border-blue-200">+ Create "{search}" and involve</button> : <div className="text-[10px] text-gray-400 italic p-2 bg-white rounded border border-dashed border-gray-200">No people involved yet. Search to create one.</div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                        {filtered.map(opt => {
                            const isSel = selected.includes(opt.id);
                            return (
                                <label key={opt.id} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border cursor-pointer text-[10px] transition-colors ${isSel ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                    <input
                                        type="checkbox"
                                        checked={isSel}
                                        onChange={() => onChange(isSel ? selected.filter(id => id !== opt.id) : [...selected, opt.id])}
                                        className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    {opt.name} — {opt.area}
                                </label>
                            );
                        })}
                        {filtered.length === 0 && search.trim() && <button type="button" onClick={() => { const id = onCreate?.(search.trim()); if (id) onChange([...selected, id]); setSearch(''); }} className="text-[10px] text-blue-600 font-bold px-2 py-1 border border-blue-200 bg-blue-50 rounded-full">+ Create "{search}" and involve</button>}
                    </div>
                </>
            )}
        </div>
    );
};

// Keeps raw keystrokes (including spaces) in local draft state and only parses/commits
// the delimited value on blur, so a live trim()+split() re-render can't eat spaces mid-typing.
const DelimitedListInput: React.FC<{
    value: string;
    onCommit: (raw: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}> = ({ value, onCommit, placeholder, className, disabled }) => {
    const [draft, setDraft] = useState(value);
    const [focused, setFocused] = useState(false);
    useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);
    return (
        <input
            disabled={disabled}
            value={draft}
            placeholder={placeholder}
            className={className}
            onFocus={() => setFocused(true)}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { setFocused(false); onCommit(draft); }}
        />
    );
};

const MultiSelect = ({ options, selected, onChange, placeholder, onCreate, compact = false }: { options: string[], selected: string[], onChange: (val: string[]) => void, placeholder: string, onCreate?: (name: string) => void, compact?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [newOption, setNewOption] = useState('');
    const buttonRef = useRef<HTMLButtonElement>(null);
    // null until measured: rendering the menu before we know where the button is would paint it
    // at the viewport corner for one frame and then visibly jump into place.
    const [menuPosition, setMenuPosition] = useState<{ top: number, left: number, width: number } | null>(null);
    useLayoutEffect(() => {
        if (!isOpen) { setMenuPosition(null); return; }
        const positionMenu = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = 224;
            const spaceBelow = window.innerHeight - rect.bottom;
            const openAbove = spaceBelow < 280 && rect.top > spaceBelow;
            setMenuPosition({
                top: openAbove ? Math.max(8, rect.top - 268) : rect.bottom + 4,
                left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
                width,
            });
        };
        const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        positionMenu();
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', positionMenu, true);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            window.removeEventListener('resize', positionMenu);
            window.removeEventListener('scroll', positionMenu, true);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isOpen]);
    const submitNewOption = () => {
        const name = newOption.trim();
        if (!name) return;
        if (window.confirm(`"${name}" is not one of the default options. Add it and select it?`)) {
            onCreate?.(name);
            setNewOption('');
        }
    };
    return (
        <div className="relative">
            <button ref={buttonRef} type="button" onClick={() => setIsOpen(!isOpen)} className={compact ? "inline-flex items-center gap-1 rounded border border-dashed border-[#3DCD58]/50 bg-[#3DCD58]/5 px-1.5 py-1 text-[10px] font-bold text-[#278a3b] hover:bg-[#3DCD58]/10" : "w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 flex justify-between items-center text-gray-600 shadow-sm hover:bg-gray-50 min-w-[140px]"}>
                <span className="truncate">{compact ? '+ Role' : (selected.length ? `${selected.length} selected` : placeholder)}</span>
                {!compact && <ChevronDown className="w-3 h-3" />}
            </button>
            {isOpen && menuPosition && createPortal(
                <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
                    <div className="fixed bg-white border border-gray-200 shadow-xl z-[9999] max-h-64 overflow-y-auto rounded-xl p-1 animate-in fade-in duration-200" style={menuPosition}>
                        {options.map(opt => (
                            <div key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer rounded" onClick={() => {
                                if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
                                else onChange([...selected, opt]);
                            }}>
                                <div className={`w-3 h-3 border rounded flex items-center justify-center ${selected.includes(opt) ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300'}`}>
                                    {selected.includes(opt) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                <span className="text-xs">{opt}</span>
                            </div>
                        ))}
                        {onCreate && (
                            <div className="flex items-center gap-1 border-t border-gray-100 mt-1 pt-1 px-1">
                                <input
                                    value={newOption}
                                    onChange={(e) => setNewOption(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNewOption(); } }}
                                    placeholder="Not listed? Type to add..."
                                    className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-2 py-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                />
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); submitNewOption(); }}
                                    className="p-1 rounded bg-[#3DCD58] text-white shrink-0"
                                    title="Add"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

const HistoryEventsModal = ({
    date,
    history,
    onAdd,
    onEdit,
    onDelete,
    onClose
}: {
    date: string,
    history: HistoryEntry[],
    onAdd: (content: string) => void,
    onEdit: (id: string, content: string) => void,
    onDelete: (id: string) => void,
    onClose: () => void
}) => {
    const [isEditing, setIsEditing] = useState<string | null>(null); // Entry ID or 'new'
    const [editContent, setEditContent] = useState('');

    const dayEntries = sortHistoryEntries(history).filter(h => normalizeHistoryDate(h.date) === normalizeHistoryDate(date));

    const handleSave = () => {
        if (!editContent.trim()) return;
        if (isEditing === 'new') {
            onAdd(editContent);
        } else if (isEditing) {
            onEdit(isEditing, editContent);
        }
        setIsEditing(null);
        setEditContent('');
    };

    return (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-black text-gray-800 flex items-center gap-2">
                        <HistoryIcon className="w-5 h-5 text-[#3DCD58]" />
                        History Events â€” {date}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {isEditing ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Event Description</label>
                                <textarea
                                    className="w-full h-32 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-sm resize-none"
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSave} className="flex-1 bg-[#3DCD58] text-white py-2.5 rounded-xl font-bold hover:bg-[#2db64a] transition-all">Save Event</button>
                                <button onClick={() => setIsEditing(null)} className="flex-1 bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {dayEntries.length > 0 ? (
                                <div className="space-y-3">
                                    {dayEntries.map((h, i) => (
                                        <div key={h.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 relative group">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-black text-[#3DCD58] uppercase">Event #{i + 1}</span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setIsEditing(h.id); setEditContent(h.content); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                                                    <button onClick={() => { if (confirm("Delete this event?")) onDelete(h.id); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-700 leading-relaxed">{h.content}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No history events for this date</p>
                                </div>
                            )}
                            <button
                                onClick={() => { setIsEditing('new'); setEditContent(''); }}
                                className="w-full mt-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs font-black uppercase tracking-widest hover:border-[#3DCD58] hover:text-[#3DCD58] transition-all flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add Event
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AddAreaModal = ({
    availableAreas,
    onAdd,
    onClose
}: {
    availableAreas: string[],
    onAdd: (area: string) => void,
    onClose: () => void
}) => {
    const [selectedArea, setSelectedArea] = useState(availableAreas[0] || '');

    return (
        <div className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-black text-gray-800 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-purple-600" />
                        Add New Area
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-4">
                    {availableAreas.length > 0 ? (
                        <>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Select Area to Add</label>
                                <select
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-bold"
                                    value={selectedArea}
                                    onChange={(e) => setSelectedArea(e.target.value)}
                                >
                                    {availableAreas.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => onAdd(selectedArea)} className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg active:scale-95">Add Area</button>
                                <button onClick={onClose} className="flex-1 bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all">Cancel</button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-sm font-bold text-gray-500">All available areas have been added.</p>
                            <button onClick={onClose} className="mt-4 w-full bg-gray-900 text-white py-2.5 rounded-xl font-bold">Close</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const KpiCalendarModal = ({
    area,
    onClose,
    onSave,
    suggestedWaitingDates,
    holidays,
    history = [],
    onNavigateToHistory,
    onAddHistory,
    onEditHistory,
    onDeleteHistory
}: {
    area: KPIArea,
    onClose: () => void,
    onSave: (calendar: Record<string, AreaDayRecord>) => void,
    suggestedWaitingDates: string[],
    holidays: string[],
    history?: HistoryEntry[],
    onNavigateToHistory?: (eventId: string) => void,
    onAddHistory: (date: string, content: string) => void,
    onEditHistory: (id: string, content: string) => void,
    onDeleteHistory: (id: string) => void
}) => {
    const [calendar, setCalendar] = useState<Record<string, AreaDayRecord>>(area.calendar || {});
    const [viewDate, setViewDate] = useState(new Date());
    const [selectionStart, setSelectionStart] = useState<string | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<string | null>(null);
    const [viewingHistoryDate, setViewingHistoryDate] = useState<string | null>(null);

    const isTendering = area.area === 'Tendering';

    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(Date.UTC(year, month, 1));
        const days = [];
        const firstDay = date.getUTCDay();

        for (let i = 0; i < firstDay; i++) {
            const prev = new Date(Date.UTC(year, month, -i));
            days.unshift({ date: prev.toISOString().split('T')[0], isCurrent: false });
        }

        while (date.getUTCMonth() === month) {
            days.push({ date: date.toISOString().split('T')[0], isCurrent: true });
            date.setUTCDate(date.getUTCDate() + 1);
        }

        while (days.length % 7 !== 0) {
            days.push({ date: date.toISOString().split('T')[0], isCurrent: false });
            date.setUTCDate(date.getUTCDate() + 1);
        }

        return days;
    };

    const monthDays = getDaysInMonth(viewDate.getUTCFullYear(), viewDate.getUTCMonth());

    const handleDayClick = (date: string, shift: boolean) => {
        if (!selectionStart || (selectionStart && selectionEnd) || shift === false) {
            setSelectionStart(date);
            setSelectionEnd(null);
        } else {
            setSelectionEnd(date);
        }
    };

    const applyType = (type: DayType | null) => {
        const start = selectionStart || selectionEnd;
        const end = selectionEnd || selectionStart;
        if (!start || !end) return;

        const d1 = new Date(start < end ? start : end);
        const d2 = new Date(start < end ? end : start);
        const newCal = { ...calendar };

        let it = new Date(d1);
        while (it <= d2) {
            const dateStr = it.toISOString().split('T')[0];
            if (type === null) {
                delete newCal[dateStr];
            } else {
                newCal[dateStr] = { ...newCal[dateStr], type };
            }
            it.setUTCDate(it.getUTCDate() + 1);
        }
        setCalendar(newCal);
        setSelectionStart(null);
        setSelectionEnd(null);
    };

    const updateHours = (date: string, hours: number) => {
        setCalendar(prev => ({
            ...prev,
            [date]: { ...(prev[date] || { type: 'Worked' }), hours, type: hours > 0 ? 'Worked' : (prev[date]?.type || 'Worked') }
        }));
    };

    const applySuggestions = () => {
        if (!confirm("This will suggest Waiting days based on History and Inactive status for weekends/holidays. Continue?")) return;
        const newCal = { ...calendar };
        suggestedWaitingDates.forEach(d => {
            if (!newCal[d]) newCal[d] = { type: 'Waiting' };
        });

        monthDays.forEach(d => {
            const isHoliday = holidays.includes(d.date);
            const dayOfWeek = new Date(d.date).getUTCDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            if (isHoliday || isWeekend) {
                if (!newCal[d.date]) newCal[d.date] = { type: 'Inactive' };
            }
        });

        setCalendar(newCal);
    };

    const isInSelection = (date: string) => {
        if (!selectionStart) return false;
        if (!selectionEnd) return date === selectionStart;
        const s = selectionStart < selectionEnd ? selectionStart : selectionEnd;
        const e = selectionStart < selectionEnd ? selectionEnd : selectionStart;
        return date >= s && date <= e;
    };

    const changeMonth = (offset: number) => {
        const next = new Date(viewDate);
        next.setUTCMonth(next.getUTCMonth() + offset);
        setViewDate(next);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-4">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <CalendarIcon className="w-5 h-5 text-blue-500" />
                            Calendar: {area.area}
                        </h2>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
                            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-50 rounded"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
                            <span className="text-sm font-bold w-32 text-center text-gray-700 capitalize">
                                {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-50 rounded"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={applySuggestions} className="text-[10px] font-bold bg-yellow-50 text-yellow-700 px-3 py-1 rounded border border-yellow-200 hover:bg-yellow-100">Apply Suggestions</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-1">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-3">
                        {monthDays.map(d => {
                            const date = d.date;
                            const record = calendar[date];
                            const isSelected = isInSelection(date);
                            const isHoliday = holidays.includes(date);
                            const dayOfWeek = new Date(date).getUTCDay();
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            const dayHistory = history.filter(h => normalizeHistoryDate(h.date) === normalizeHistoryDate(date));

                            return (
                                <div
                                    key={date}
                                    onClick={(e) => handleDayClick(date, e.shiftKey)}
                                    className={`relative p-2 h-24 border rounded-xl flex flex-col transition-all group ${!d.isCurrent ? 'bg-gray-50/50 opacity-40' : 'bg-white'
                                        } ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10' : 'border-gray-100 hover:border-blue-200'} cursor-pointer shadow-sm hover:shadow-md`}
                                >
                                    <div className="flex justify-between items-start w-full">
                                        <span className={`text-[10px] font-black ${isWeekend || isHoliday ? 'text-red-400' : 'text-gray-400'}`}>
                                            {new Date(date).getUTCDate()}
                                        </span>
                                        {dayHistory.length > 0 && (
                                            <div className="flex gap-0.5">
                                                {dayHistory.map((h, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={(e) => { e.stopPropagation(); setViewingHistoryDate(date); }}
                                                        title="Click to view history events"
                                                        className="w-2 h-2 rounded-full bg-[#3DCD58] shadow-sm hover:scale-150 transition-transform cursor-help"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${record?.type === 'Worked' ? 'bg-blue-100 border-blue-500 text-blue-700' :
                                            record?.type === 'Waiting' ? 'bg-yellow-100 border-yellow-500 text-yellow-700' :
                                                record?.type === 'Inactive' ? 'bg-red-100 border-red-500 text-red-700' :
                                                    'bg-transparent border-transparent'
                                            }`}>
                                            {record?.type === 'Worked' ? <Zap className="w-4 h-4" /> :
                                                record?.type === 'Waiting' ? <Clock className="w-4 h-4" /> :
                                                    record?.type === 'Inactive' ? <X className="w-4 h-4" /> :
                                                        null}
                                        </div>

                                        {isTendering && (
                                            <div className="flex items-center gap-0.5 mt-0.5">
                                                <input
                                                    type="number"
                                                    placeholder="h"
                                                    className="w-8 text-[10px] text-center border-none bg-transparent focus:ring-0 font-bold p-0"
                                                    value={record?.hours || ''}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => updateHours(date, parseFloat(e.target.value) || 0)}
                                                />
                                                <span className="text-[8px] text-gray-400 font-black uppercase">h</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                    <div className="flex gap-2">
                        <button onClick={() => applyType('Worked')} className="flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors shadow-sm">Mark Worked</button>
                        <button onClick={() => applyType('Waiting')} className="flex items-center gap-1 bg-yellow-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-600 transition-colors shadow-sm">Mark Waiting</button>
                        <button onClick={() => applyType('Inactive')} className="flex items-center gap-1 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 transition-colors shadow-sm">Mark Inactive</button>
                        <button onClick={() => applyType(null)} className="flex items-center gap-1 bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors ml-4 shadow-sm">Clear</button>
                    </div>
                    <button onClick={() => onSave(calendar)} className="bg-[#3DCD58] text-white px-8 py-2.5 rounded-xl font-bold shadow-lg hover:bg-[#2db64a] transition-all active:scale-95 flex items-center gap-2">
                        <Save className="w-4 h-4" /> Save Calendar
                    </button>
                </div>
            </div>

            {viewingHistoryDate && (
                <HistoryEventsModal
                    date={viewingHistoryDate}
                    history={history}
                    onAdd={(content) => onAddHistory(viewingHistoryDate, content)}
                    onEdit={onEditHistory}
                    onDelete={onDeleteHistory}
                    onClose={() => setViewingHistoryDate(null)}
                />
            )}
        </div>
    );
};

const FullCalendarModal = ({
    areas,
    tasks,
    stakeholders,
    userName,
    onClose,
    onOpenTask,
    onRebuildAssignmentKpis,
    onSaveAreaCalendar,
    onAddArea,
    onRemoveArea,
    holidays,
    history = [],
    onAddHistory,
    onEditHistory,
    onDeleteHistory,
    trackedAreas,
    timeline,
    onUpdateTimeline
}: {
    areas: KPIArea[],
    tasks: Task[],
    stakeholders: Person[],
    userName: string,
    onClose: () => void,
    onOpenTask: (taskId: string) => void,
    onRebuildAssignmentKpis: () => void,
    onSaveAreaCalendar: (areaId: string, calendar: Record<string, AreaDayRecord>) => void,
    onAddArea: (area: string) => void,
    onRemoveArea: (id: string) => void,
    holidays: string[],
    history?: HistoryEntry[],
    onAddHistory: (date: string, content: string) => void,
    onEditHistory: (id: string, content: string) => void,
    onDeleteHistory: (id: string) => void,
    trackedAreas: string[],
    timeline: KPITimeline,
    onUpdateTimeline: (field: keyof KPITimeline, value: string | null) => void
}) => {
    // Determine initial view date based on project received date
    const getInitialDate = () => {
        if (timeline.receivedAt) {
            const [y, m, d] = timeline.receivedAt.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            if (!isNaN(date.getTime())) return date;
        }
        return new Date();
    };

    const [viewDate, setViewDate] = useState(getInitialDate());
    const [viewingHistoryDate, setViewingHistoryDate] = useState<string | null>(null);
    const [viewingDayDetails, setViewingDayDetails] = useState<string | null>(null);
    const [viewingAreaDetails, setViewingAreaDetails] = useState<string | null>(null);
    const [isInternalAddAreaOpen, setIsInternalAddAreaOpen] = useState(false);
    const [visibleAreaIds, setVisibleAreaIds] = useState<string[]>(areas.map(a => a.id));
    const [selectionStart, setSelectionStart] = useState<{ areaId: string, date: string } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ areaId: string, date: string } | null>(null);

    const [selectedCells, setSelectedCells] = useState<string[]>([]);
    const ensuredTenderingAreaRef = useRef(false);
    const revealedAutoTenderingRef = useRef(false);
    const rebuiltAssignmentKpisRef = useRef(false);

    useEffect(() => {
        if (rebuiltAssignmentKpisRef.current) return;
        rebuiltAssignmentKpisRef.current = true;
        onRebuildAssignmentKpis();
    }, [onRebuildAssignmentKpis]);

    useEffect(() => {
        if (ensuredTenderingAreaRef.current || areas.some(area => area.area === 'Tendering')) return;
        ensuredTenderingAreaRef.current = true;
        onAddArea('Tendering');
    }, [areas, onAddArea]);

    useEffect(() => {
        if (!ensuredTenderingAreaRef.current || revealedAutoTenderingRef.current) return;
        const tendering = areas.find(area => area.area === 'Tendering');
        if (!tendering) return;
        revealedAutoTenderingRef.current = true;
        setVisibleAreaIds(current => current.includes(tendering.id) ? current : [...current, tendering.id]);
    }, [areas]);

    // The grid scrolls horizontally (one column per day), so jumping to "today" needs both a
    // month change and a scroll. The scroll has to happen after the re-render that the new
    // viewDate causes, hence the nonce + effect instead of scrolling inside the click handler.
    const gridScrollRef = useRef<HTMLDivElement>(null);
    const [scrollToTodayNonce, setScrollToTodayNonce] = useState(0);

    useEffect(() => {
        if (scrollToTodayNonce === 0) return;
        const container = gridScrollRef.current;
        if (!container) return;
        const cell = container.querySelector<HTMLElement>(`[data-day="${getTodayStr()}"]`);
        if (!cell) return;
        const containerRect = container.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        // Centre the column, so the sticky 220px "Area Name" column never covers it.
        const left = container.scrollLeft + (cellRect.left - containerRect.left) - (container.clientWidth - cellRect.width) / 2;
        container.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }, [scrollToTodayNonce]);

    const goToToday = () => {
        setViewDate(new Date());
        setScrollToTodayNonce(n => n + 1);
    };

    // Initial sync
    useEffect(() => {
        if (visibleAreaIds.length === 0 && areas.length > 0) {
            setVisibleAreaIds(areas.map(a => a.id));
        }
    }, [areas]);

    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(year, month, 1);
        const days = [];
        while (date.getMonth() === month) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            days.push(`${y}-${m}-${d}`);
            date.setDate(date.getDate() + 1);
        }
        return days;
    };

    const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
    const todayKey = getTodayStr();

    const logDate = (log: TimeLog) => normalizeHistoryDate((log as TimeLog & { startTime?: string }).startTime || log.start);
    const taskCompletionDate = (task: Task) => {
        const value = task.completionDate || task.completedAt || task.responsibleDeliveredDate || task.approvalDeliveredDate;
        return value ? normalizeHistoryDate(value) : '';
    };
    const taskParticipantNames = (task: Task) => {
        const names = (task.responsibleTeamMemberIds || []).map(id => stakeholders.find(person => person.id === id)?.name).filter(Boolean) as string[];
        if (task.owner === 'Me') names.unshift(userName || 'Me');
        if (!names.length && task.responsible?.trim()) names.push(task.responsible.trim());
        return Array.from(new Set(names));
    };
    const durationLabel = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    const stakeholdersForArea = (areaName: string) => stakeholders.filter(person =>
        (person.roles?.length ? person.roles : (person.role ? [person.role] : []))
            .some(role => role.localeCompare(areaName, undefined, { sensitivity: 'accent' }) === 0)
    );
    const taskMatchesArea = (task: Task, areaName: string) => {
        if (areaName === 'Tendering' && task.owner === 'Me') return true;
        if ((task.externalAreas || []).some(area => area.localeCompare(areaName, undefined, { sensitivity: 'accent' }) === 0)) return true;
        const areaPeople = new Set(stakeholdersForArea(areaName).map(person => person.id));
        return (task.responsibleTeamMemberIds || []).some(id => areaPeople.has(id));
    };

    const selectedDaySummary = React.useMemo(() => {
        if (!viewingDayDetails) return null;
        const date = viewingDayDetails;
        const events = sortHistoryEntries(history).filter(entry => normalizeHistoryDate(entry.date) === date);
        const completed = tasks.filter(task => taskCompletionDate(task) === date || task.responsibleDeliveredDate === date || task.approvalDeliveredDate === date);
        const expected = tasks.filter(task => task.dueDate === date || task.responsibleDueDate === date || task.approvalDueDate === date);
        const missed = expected.filter(task => {
            const delivered = taskCompletionDate(task);
            return task.status !== 'Done' || !delivered || delivered > date;
        });
        const worked = tasks.flatMap(task => (task.timeLogs || [])
            .filter(log => logDate(log) === date)
            // The built-in timer belongs to the current OpportunityOS user. External
            // participants are tracked by assignment/delivery dates, not by this timer.
            .map(log => ({ task, log, people: [userName || 'Me'] })));
        const scheduled = tasks.filter(task => (task.executionBlocks || []).some(block => block.date === date));
        const totalSeconds = worked.reduce((sum, item) => sum + (item.log.durationSeconds || 0), 0);
        const hasRecordedWork = worked.length > 0 || completed.length > 0 || events.length > 0;
        const hasAnything = hasRecordedWork || expected.length > 0 || scheduled.length > 0;
        return { date, events, completed, expected, missed, worked, scheduled, totalSeconds, hasRecordedWork, hasAnything };
    }, [viewingDayDetails, history, tasks, stakeholders, userName]);

    const dailyOverview = React.useMemo(() => Object.fromEntries(days.map(date => {
        const completedTasks = tasks.filter(task => taskCompletionDate(task) === date || task.responsibleDeliveredDate === date || task.approvalDeliveredDate === date);
        const expectedTasks = tasks.filter(task => task.dueDate === date || task.responsibleDueDate === date || task.approvalDueDate === date);
        const missedTasks = expectedTasks.filter(task => {
            const delivered = taskCompletionDate(task);
            return task.status !== 'Done' || !delivered || delivered > date;
        });
        return [date, {
            timerSessions: tasks.reduce((sum, task) => sum + (task.timeLogs || []).filter(log => logDate(log) === date).length, 0),
            completed: completedTasks.length,
            missed: missedTasks.length,
            events: history.filter(entry => normalizeHistoryDate(entry.date) === date).length,
        }];
    })), [days.join('|'), tasks, history]);

    const automaticAreaWorkByDate = React.useMemo(() => {
        const result: Record<string, Record<string, string[]>> = {};
        const addWindow = (taskId: string, areaNames: string[], start?: string, end?: string) => {
            if (!start || !end) return;
            areaNames.forEach(areaName => {
                if (!areaName) return;
                if (!result[areaName]) result[areaName] = {};
                days.forEach(date => {
                    if (date < start || date > end) return;
                    const parsed = new Date(`${date}T00:00:00`);
                    if (parsed.getDay() === 0 || parsed.getDay() === 6 || holidays.includes(date)) return;
                    result[areaName][date] = Array.from(new Set([...(result[areaName][date] || []), taskId]));
                });
            });
        };
        const rolesForIds = (ids: string[] = []) => ids.flatMap(id => {
            const person = stakeholders.find(item => item.id === id || item.directoryContactId === id);
            if (person) return person.roles?.length ? person.roles : (person.role ? [person.role] : []);
            // Legacy SOW ids use "name|area" and still carry enough information
            // to place their work on the correct area timeline.
            return id.includes('|') ? [id.split('|').slice(1).join('|').trim()] : [];
        });
        tasks.forEach(task => {
            const executionAreas = Array.from(new Set([...(task.externalAreas || []), ...rolesForIds(task.responsibleTeamMemberIds || [])].filter(Boolean)));
            const approvalAreas = Array.from(new Set(rolesForIds(task.approverTeamMemberIds || []).filter(Boolean)));
            (task.assignmentCycles || []).forEach(cycle => {
                addWindow(task.id, executionAreas, cycle.executionRequested, cycle.executionDelivered || cycle.executionRequired);
                addWindow(task.id, approvalAreas, cycle.approvalRequested, cycle.approved || cycle.changesRequestedAt || cycle.approvalRequired);
            });
            addWindow(task.id, executionAreas, task.responsibleRequestedDate, task.responsibleDeliveredDate || task.responsibleDueDate || task.dueDate || todayKey);
            addWindow(task.id, approvalAreas, task.approvalRequestedDate, task.approvalDeliveredDate || task.approvalDueDate || todayKey);
        });
        return result;
    }, [days.join('|'), tasks, stakeholders, holidays, todayKey]);

    const selectedAreaSummary = React.useMemo(() => {
        if (!viewingAreaDetails) return null;
        const area = viewingAreaDetails === '__me__'
            ? (areas.find(item => item.area === 'Tendering') || { id: '__me__', area: 'Tendering', daysSpent: 0, waitingDays: 0, calendar: {} })
            : areas.find(item => item.id === viewingAreaDetails);
        if (!area) return null;
        const people = stakeholdersForArea(area.area);
        const areaTasks = tasks.filter(task => taskMatchesArea(task, area.area));
        return { area, people, tasks: areaTasks };
    }, [viewingAreaDetails, areas, stakeholders, tasks]);

    type WorkflowTimelineRow = {
        id: string;
        taskId: string;
        phase: 'Execution' | 'Approval';
        cycle: number;
        people: string[];
        unresolvedPeople: boolean;
        start?: string;
        committed?: string;
        end?: string;
        active: boolean;
        result: 'On time' | 'Late' | 'Overdue' | 'Open' | 'Completed' | 'Changes requested';
        evidence: 'Confirmed' | 'Calculated' | 'Incomplete';
        seconds?: number;
    };

    type WorkflowTimelineGroup = { task: Task; rows: WorkflowTimelineRow[] };

    const resolveParticipantIds = (ids: string[] = [], fallback?: string) => {
        let unresolved = false;
        const names = ids.map(id => {
            const person = stakeholders.find(item => item.id === id || item.directoryContactId === id);
            if (person) return person.name;
            unresolved = true;
            // Older SOW assignments used a stable "name|area" key instead of a stakeholder id.
            return id.includes('|') ? id.split('|')[0].trim() : id;
        }).filter(Boolean);
        if (!names.length && fallback?.trim()) {
            names.push(fallback.trim());
            unresolved = true;
        }
        return { names: Array.from(new Set(names)), unresolved };
    };

    const workflowGroups = React.useMemo<WorkflowTimelineGroup[]>(() => {
        const today = getTodayStr();
        const groups: WorkflowTimelineGroup[] = [];
        tasks.filter(task => (
            task.owner === 'External Area'
            || task.isAssignment
            || (task.externalAreas || []).length > 0
            || (task.responsibleTeamMemberIds || []).length > 0
        )).forEach(task => {
            const rows: WorkflowTimelineRow[] = [];
            const executionPeople = resolveParticipantIds(task.responsibleTeamMemberIds || [], task.responsible);
            const approvalPeople = resolveParticipantIds(task.approverTeamMemberIds || []);
            const externalLabels = executionPeople.names.length ? executionPeople.names : (task.externalAreas || []);
            const hasExternalAssignment = task.owner === 'External Area' || !!task.isAssignment || (task.externalAreas || []).length > 0 || (task.responsibleTeamMemberIds || []).length > 0;

            (task.assignmentCycles || []).forEach((cycle, index) => {
                if (cycle.executionRequested || cycle.executionDelivered || cycle.executionRequired) {
                    const late = !!cycle.executionDelivered && !!cycle.executionRequired && cycle.executionDelivered > cycle.executionRequired;
                    rows.push({ id: `${task.id}-cycle-${index}-execution`, taskId: task.id, phase: 'Execution', cycle: index + 1, people: externalLabels, unresolvedPeople: executionPeople.unresolved || !executionPeople.names.length, start: cycle.executionRequested, committed: cycle.executionRequired, end: cycle.executionDelivered, active: false, result: late ? 'Late' : 'On time', evidence: cycle.executionRequested && cycle.executionDelivered ? 'Confirmed' : 'Incomplete' });
                }
                if (cycle.approvalRequested || cycle.approved || cycle.approvalRequired || cycle.changesRequestedAt) {
                    rows.push({ id: `${task.id}-cycle-${index}-approval`, taskId: task.id, phase: 'Approval', cycle: index + 1, people: approvalPeople.names, unresolvedPeople: approvalPeople.unresolved || !approvalPeople.names.length, start: cycle.approvalRequested, committed: cycle.approvalRequired, end: cycle.approved || cycle.changesRequestedAt, active: false, result: cycle.reviewOutcome === 'changes_requested' ? 'Changes requested' : 'Completed', evidence: cycle.approvalRequested && (cycle.approved || cycle.changesRequestedAt) ? 'Confirmed' : 'Incomplete' });
                }
            });

            const cycle = (task.assignmentCycles?.length || 0) + 1;
            const executionActive = task.status === 'Missing Info' || task.status === 'On Hold';
            if (task.responsibleRequestedDate || task.responsibleDeliveredDate || task.responsibleDueDate || (hasExternalAssignment && (!(task.assignmentCycles || []).length || !['Done', 'Canceled'].includes(task.status)))) {
                const delivered = task.responsibleDeliveredDate;
                const committed = task.responsibleDueDate;
                const result = delivered
                    ? (committed && delivered > committed ? 'Late' : 'On time')
                    : (committed && today > committed ? 'Overdue' : 'Open');
                rows.push({ id: `${task.id}-current-execution`, taskId: task.id, phase: 'Execution', cycle, people: externalLabels, unresolvedPeople: executionPeople.unresolved || !executionPeople.names.length, start: task.responsibleRequestedDate, committed, end: delivered, active: executionActive && !delivered, result, evidence: delivered ? 'Confirmed' : (task.responsibleRequestedDate ? 'Calculated' : 'Incomplete') });
            }
            const approvalActive = task.status === 'Approval';
            if (task.approvalRequestedDate || task.approvalDeliveredDate || task.approvalDueDate || ((task.approverTeamMemberIds?.length || 0) > 0 && !['Done', 'Canceled'].includes(task.status))) {
                rows.push({ id: `${task.id}-current-approval`, taskId: task.id, phase: 'Approval', cycle, people: approvalPeople.names, unresolvedPeople: approvalPeople.unresolved || !approvalPeople.names.length, start: task.approvalRequestedDate, committed: task.approvalDueDate, end: task.approvalDeliveredDate, active: approvalActive && !task.approvalDeliveredDate, result: task.approvalDeliveredDate ? 'Completed' : 'Open', evidence: task.approvalDeliveredDate ? 'Confirmed' : (task.approvalRequestedDate ? 'Calculated' : 'Incomplete') });
            }
            if (rows.length) groups.push({ task, rows });
        });
        return groups.sort((a, b) => (a.task.order ?? 999999) - (b.task.order ?? 999999));
    }, [tasks, stakeholders, userName]);

    const changeMonth = (offset: number) => {
        const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
        setViewDate(next);
    };

    const toggleCell = (areaId: string, date: string) => {
        const area = areas.find(a => a.id === areaId);
        if (!area) return;
        const currentRecord = area.calendar?.[date];
        const currentType = currentRecord?.type;

        let newType: DayType | undefined = 'Worked';
        if (currentType === 'Worked') newType = 'Waiting';
        else if (currentType === 'Waiting') newType = 'Inactive';
        else if (currentType === 'Inactive') newType = undefined;

        const newCal = { ...(area.calendar || {}) };
        if (!newType) delete newCal[date];
        else newCal[date] = { ...newCal[date], type: newType };

        onSaveAreaCalendar(areaId, newCal);
    };

    const handleCellClick = (areaId: string, date: string, e: React.MouseEvent) => {
        const cellId = `${areaId}|${date}`;

        if (e.altKey || e.shiftKey) {
            // Range selection
            if (!selectionStart) {
                setSelectionStart({ areaId, date });
                setSelectedCells([cellId]);
            } else {
                setSelectionEnd({ areaId, date });
                // Re-calculate all cells in range
                if (selectionStart.areaId === areaId) {
                    const d1 = selectionStart.date < date ? selectionStart.date : date;
                    const d2 = selectionStart.date < date ? date : selectionStart.date;
                    const inRange = days.filter(d => d >= d1 && d <= d2).map(d => `${areaId}|${d}`);
                    setSelectedCells(inRange);
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            // Multi-select toggle
            setSelectionStart(null);
            setSelectionEnd(null);
            if (selectedCells.includes(cellId)) {
                setSelectedCells(prev => prev.filter(c => c !== cellId));
            } else {
                setSelectedCells(prev => [...prev, cellId]);
            }
        } else {
            // Toggle cycle
            setSelectionStart(null);
            setSelectionEnd(null);
            setSelectedCells([]);
            toggleCell(areaId, date);
        }
    };

    const applyBatchAction = (type: DayType | null) => {
        if (selectedCells.length === 0) return;

        const updates: Record<string, Record<string, AreaDayRecord>> = {};

        selectedCells.forEach(cell => {
            const [areaId, date] = cell.split('|');
            if (!updates[areaId]) {
                const area = areas.find(a => a.id === areaId);
                updates[areaId] = { ...(area?.calendar || {}) };
            }
            if (type === null) delete updates[areaId][date];
            else updates[areaId][date] = { ...updates[areaId][date], type };
        });

        // Batch save for each area
        Object.entries(updates).forEach(([areaId, cal]) => {
            onSaveAreaCalendar(areaId, cal);
        });

        setSelectedCells([]);
        setSelectionStart(null);
        setSelectionEnd(null);
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] h-[95vh] flex flex-col overflow-hidden animate-fade-in border border-gray-100">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50/80">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                                <Table className="w-7 h-7 text-purple-600" />
                                Implementation Timeline
                            </h2>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">External areas · execution, delivery and approval flow</p>
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm">
                            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors"><ChevronLeft className="w-6 h-6 text-gray-600" /></button>
                            <button
                                onClick={goToToday}
                                className="px-3 py-1 text-xs font-black text-[#3DCD58] hover:bg-[#3DCD58]/10 rounded-lg transition-all uppercase"
                            >
                                Hoy
                            </button>
                            <span className="text-xl font-black w-56 text-center text-gray-700 capitalize">
                                {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors"><ChevronRight className="w-6 h-6 text-gray-600" /></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => setViewingAreaDetails('__me__')}
                            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                            title="View my tasks, timer sessions and completion times"
                        >
                            <User className="h-4 w-4" /> My information
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase">Areas:</span>
                            <MultiSelect
                                placeholder="Filter Areas..."
                                options={areas.map(a => a.area)}
                                selected={areas.filter(a => visibleAreaIds.includes(a.id)).map(a => a.area)}
                                onChange={(sel) => {
                                    const ids = areas.filter(a => sel.includes(a.area)).map(a => a.id);
                                    setVisibleAreaIds(ids);
                                }}
                            />
                        </div>
                        <button
                            onClick={() => setIsInternalAddAreaOpen(true)}
                            className="bg-white border-2 border-purple-500 text-purple-600 px-6 py-2.5 rounded-xl font-black shadow-sm hover:bg-purple-50 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Plus className="w-5 h-5" /> Add New Area
                        </button>
                        <button onClick={onClose} className="p-3 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-gray-400"><X className="w-8 h-8" /></button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden bg-gray-200">
                    <div ref={gridScrollRef} className="flex-1 overflow-auto">
                        <div className="min-w-full">
                            <div
                                className="grid gap-0 bg-gray-200 border-b border-gray-200 shadow-xl"
                                style={{
                                    gridTemplateColumns: `minmax(220px, 260px) repeat(${days.length}, minmax(26px, 1fr))`,
                                    minWidth: `${220 + (days.length * 26)}px`,
                                    width: '100%',
                                }}
                            >
                                {/* Top-Left Corner Header */}
                                <div className="bg-gray-100 p-4 text-[11px] font-black text-gray-500 uppercase tracking-widest border-r border-b-2 border-gray-200 flex items-center justify-between sticky top-0 left-0 z-[50]">
                                    Workflow / Area
                                    <Filter className="w-3 h-3" />
                                </div>
                                {days.map(d => {
                                    const isHoliday = holidays.includes(d);
                                    const [y, m, day] = d.split('-').map(Number);
                                    const date = new Date(y, m - 1, day);
                                    const dayOfWeek = date.getDay();
                                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                    const isToday = d === todayKey;
                                    return (
                                        <button type="button" data-day={d} key={d} onClick={() => setViewingDayDetails(d)} className={`relative p-1.5 text-center border-l border-b-2 transition-colors sticky top-0 z-[30] shadow-sm ${isToday ? 'border-[#3DCD58] bg-[#3DCD58] text-white' : isWeekend || isHoliday ? 'border-gray-200 bg-red-50 text-red-500' : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'}`} title="View everything recorded for this day">
                                            <div className="text-[10px] font-black uppercase">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                                            <div className="text-sm font-black">{day}</div>
                                            {isToday && <div className="absolute inset-x-1 -bottom-0.5 h-1 rounded-full bg-white" />}
                                        </button>
                                    );
                                })}

                                {/* History Indicators Row Label */}
                                <div className="p-4 text-[10px] font-black text-[#3DCD58] uppercase flex items-center gap-2 border-r border-t border-b-4 border-b-slate-300 bg-white sticky left-0 z-[30]">
                                    <HistoryIcon className="w-4 h-4" /> Daily summary
                                </div>
                                {days.map(d => {
                                    const dayHistory = history.filter(h => normalizeHistoryDate(h.date) === normalizeHistoryDate(d));
                                    const isReceived = timeline.receivedAt === d;
                                    const isDelivered = timeline.deliveredAt === d;
                                    const summary = dailyOverview[d];

                                    return (
                                        <div
                                            key={d}
                                            onClick={() => setViewingDayDetails(d)}
                                            className={`group flex min-h-[52px] cursor-pointer flex-col items-center justify-center border-l border-t border-b-4 border-b-slate-300 p-0.5 transition-all hover:bg-[#3DCD58]/5 ${d === todayKey ? 'bg-emerald-50 ring-1 ring-inset ring-[#3DCD58]/40' : 'bg-white'}`}
                                            title={`Open ${d}: ${summary?.completed || 0} delivered, ${summary?.timerSessions || 0} timer sessions, ${summary?.missed || 0} missed, ${summary?.events || 0} events`}
                                        >
                                            <div className="flex flex-col gap-1 items-center">
                                                {/* Milestone Markers */}
                                                <div className="flex gap-1 mb-1">
                                                    {isReceived && (
                                                        <div className="px-1.5 py-0.5 rounded bg-purple-600 text-[8px] font-black text-white uppercase animate-pulse shadow-sm" title={`Received at ${d}`}>REC</div>
                                                    )}
                                                    {isDelivered && (
                                                        <div className="px-1.5 py-0.5 rounded bg-emerald-600 text-[8px] font-black text-white uppercase animate-pulse shadow-sm" title={`Delivered at ${d}`}>DEL</div>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 gap-0.5 text-[7px] font-black leading-none">
                                                    {!!summary?.completed && <span className="rounded bg-emerald-100 px-0.5 py-0.5 text-emerald-700" title="Delivered">✓{summary.completed}</span>}
                                                    {!!summary?.timerSessions && <span className="rounded bg-blue-100 px-0.5 py-0.5 text-blue-700" title="Timer sessions">▶{summary.timerSessions}</span>}
                                                    {!!summary?.missed && <span className="rounded bg-red-100 px-0.5 py-0.5 text-red-700" title="Not delivered on time">!{summary.missed}</span>}
                                                    {!!summary?.events && <span className="flex items-center gap-0.5 rounded bg-emerald-50 px-0.5 py-0.5 text-emerald-700" title={dayHistory.map(item => item.content).join('\n')}><span className="h-1.5 w-1.5 rounded-full bg-[#3DCD58]" />{summary.events}</span>}
                                                </div>
                                                {!summary?.completed && !summary?.timerSessions && !summary?.missed && !summary?.events && !isReceived && !isDelivered && <Plus className="h-3 w-3 text-gray-200 opacity-0 transition-opacity group-hover:opacity-100" />}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Workflow groups: one task owns all of its people, phases and cycles. */}
                                {workflowGroups.map(group => {
                                    const completion = taskCompletionDate(group.task);
                                    const hasIncompleteData = group.rows.some(row => row.evidence === 'Incomplete' || row.unresolvedPeople);
                                    const requested = group.task.responsibleRequestedDate || group.rows.map(row => row.start).filter(Boolean).sort()[0];
                                    const expected = group.task.responsibleDueDate || group.task.dueDate || group.rows.map(row => row.committed).filter(Boolean).sort()[0];
                                    const delivered = group.task.responsibleDeliveredDate || completion || group.rows.map(row => row.end).filter(Boolean).sort().slice(-1)[0];
                                    const summaryEnd = delivered || (!['Done', 'Canceled'].includes(group.task.status) ? todayKey : (expected || requested));
                                    return (
                                        <React.Fragment key={group.task.id}>
                                            <div className="order-2 sticky left-0 z-[32] flex min-h-[76px] items-center gap-2 border-r border-t border-blue-100 border-l-4 border-l-blue-500 bg-white p-2.5 text-gray-800 shadow-[2px_0_8px_-3px_rgba(15,23,42,0.2)]">
                                                <button type="button" onClick={() => onOpenTask(group.task.id)} className="min-w-0 flex-1 text-left" title="Open task and its tracker">
                                                    <span className="block truncate text-xs font-black text-gray-900 hover:text-blue-700 hover:underline"><span className="mr-1 text-[8px] uppercase text-blue-500">Task</span>{group.task.order ? `${group.task.order}. ` : ''}{group.task.title}</span>
                                                    <span className="mt-1 flex flex-wrap items-center gap-1 text-[8px] font-black uppercase tracking-wide text-gray-500">
                                                        <span className="rounded bg-gray-100 px-1.5 py-0.5">{taskStatusLabel(group.task.status)}</span>
                                                        {(group.task.externalAreas || []).slice(0, 2).map(area => <span key={area} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{area}</span>)}
                                                        {group.task.reworkForTaskId && <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700">Correction</span>}
                                                        {hasIncompleteData && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Missing data</span>}
                                                    </span>
                                                    <span className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                                                        <span className="min-w-0 rounded bg-blue-50 px-1 py-1"><span className="block text-[7px] font-black uppercase text-blue-500">Requested</span><span className="block truncate text-[9px] font-black text-blue-800">{requested?.slice(5) || '—'}</span></span>
                                                        <span className="min-w-0 rounded bg-orange-50 px-1 py-1"><span className="block text-[7px] font-black uppercase text-orange-500">Expected</span><span className="block truncate text-[9px] font-black text-orange-800">{expected?.slice(5) || '—'}</span></span>
                                                        <span className="min-w-0 rounded bg-emerald-50 px-1 py-1"><span className="block text-[7px] font-black uppercase text-emerald-500">Delivered</span><span className="block truncate text-[9px] font-black text-emerald-800">{delivered?.slice(5) || '—'}</span></span>
                                                    </span>
                                                </button>
                                            </div>
                                            {days.map(d => {
                                                const inSummaryRange = !!requested && !!summaryEnd && d >= requested && d <= summaryEnd;
                                                const isRequested = requested === d;
                                                const isExpected = expected === d;
                                                const isDelivered = delivered === d;
                                                return <div key={d} className={`order-2 relative flex min-h-[76px] items-center justify-center border-l border-t border-blue-100 ${d === todayKey ? 'bg-emerald-50 ring-1 ring-inset ring-[#3DCD58]/30' : inSummaryRange ? 'bg-blue-50' : 'bg-white'}`} title={`${group.task.title} · Requested ${requested || '—'} · Expected ${expected || '—'} · Delivered ${delivered || '—'}`}>
                                                    {inSummaryRange && <div className="absolute left-0 right-0 h-2 rounded-full bg-blue-400" />}
                                                    <div className="relative z-10 flex flex-col items-center gap-1">
                                                        {isRequested && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[7px] font-black text-white" title={`Requested ${d}`}>R</span>}
                                                        {isExpected && <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-black text-white ${delivered && delivered > d ? 'bg-red-500' : 'bg-orange-500'}`} title={`Expected ${d}`}>E</span>}
                                                        {isDelivered && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[7px] font-black text-white" title={`Delivered ${d}`}>D</span>}
                                                    </div>
                                                </div>;
                                            })}
                                        </React.Fragment>
                                    );
                                })}

                                {/* Area Rows */}
                                {areas.filter(a => visibleAreaIds.includes(a.id)).map(area => (
                                    <React.Fragment key={area.id}>
                                        <div className="order-1 min-h-[76px] self-stretch bg-white p-4 text-sm font-black text-gray-700 border-r border-b-2 border-b-slate-200 flex flex-col justify-center sticky left-0 z-[30] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center justify-between group">
                                                <span className="truncate pr-2 text-left">{area.area}</span>
                                                <button
                                                    onClick={() => onRemoveArea(area.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-red-400 hover:text-red-500 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="text-[10px] text-[#3DCD58] bg-[#3DCD58]/10 px-2 py-0.5 rounded-full font-black uppercase">{area.daysSpent}d Work</span>
                                                {area.waitingDays > 0 && <span className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full font-black uppercase">{area.waitingDays}d Wait</span>}
                                            </div>
                                            <div className="mt-1 truncate text-[9px] font-semibold text-gray-400" title={stakeholdersForArea(area.area).map(person => person.name).join(', ')}>
                                                {area.area === 'Tendering' && <span>{userName || 'Me'} · Tender (me)</span>}
                                                {area.area === 'Tendering' && stakeholdersForArea(area.area).length > 0 && <span> · </span>}
                                                {stakeholdersForArea(area.area).map(person => person.name).join(', ') || (area.area === 'Tendering' ? '' : 'No stakeholder assigned')}
                                            </div>
                                        </div>
                                        {days.map(d => {
                                            const storedRecord = (area.calendar?.[d]) as AreaDayRecord | undefined;
                                            const automaticWorkedTaskIds = automaticAreaWorkByDate[area.area]?.[d] || [];
                                            const areaRecord: AreaDayRecord | undefined = automaticWorkedTaskIds.length
                                                ? {
                                                    ...(storedRecord || { type: 'Worked' as DayType }),
                                                    type: 'Worked',
                                                    workedTaskIds: Array.from(new Set([...(storedRecord?.workedTaskIds || []), ...automaticWorkedTaskIds])),
                                                }
                                                : storedRecord;
                                            const externalWorkTaskIds = area.area === 'Tendering'
                                                ? Array.from(new Set([
                                                    ...Object.entries(automaticAreaWorkByDate).filter(([areaName]) => areaName !== 'Tendering').flatMap(([, byDate]) => byDate[d] || []),
                                                    ...areas.filter(otherArea => otherArea.area !== 'Tendering').flatMap(otherArea => {
                                                        const externalRecord = otherArea.calendar?.[d];
                                                        if (!externalRecord || externalRecord.type !== 'Worked') return [];
                                                        return externalRecord.workedTaskIds?.length ? externalRecord.workedTaskIds : [`area:${otherArea.id}`];
                                                    }),
                                                ]))
                                                : [];
                                            // Tendering mirrors every externally-worked assignment day as
                                            // waiting. If Tendering also worked, both blue and yellow lines show.
                                            const record: AreaDayRecord | undefined = externalWorkTaskIds.length
                                                ? {
                                                    ...(storedRecord || { type: 'Waiting' as DayType }),
                                                    ...(areaRecord || {}),
                                                    type: areaRecord?.type === 'Worked' ? 'Worked' : 'Waiting',
                                                    waitingTaskIds: Array.from(new Set([...(areaRecord?.waitingTaskIds || []), ...externalWorkTaskIds])),
                                                }
                                                : areaRecord;
                                            const cellId = `${area.id}|${d}`;
                                            const isSelected = selectedCells.includes(cellId);

                                            return (
                                                <div
                                                    key={d}
                                                    className={`order-1 relative min-h-[76px] self-stretch overflow-hidden border-l border-l-slate-200 border-b-2 border-b-slate-200 flex flex-col items-center justify-center transition-all cursor-pointer hover:z-10 hover:shadow-inner ${isSelected ? 'ring-4 ring-[#3DCD58] ring-inset z-20' : d === todayKey ? 'ring-1 ring-[#3DCD58]/30 ring-inset' : ''} ${record?.type === 'Worked' ? 'bg-blue-100/70' :
                                                        record?.type === 'Waiting' ? 'bg-yellow-50/40' :
                                                            record?.type === 'Inactive' ? 'bg-red-50/30' :
                                                                d === todayKey ? 'bg-emerald-50/60' : 'bg-white'
                                                        }`}
                                                    onClick={(e) => handleCellClick(area.id, d, e)}
                                                    title={`${area.area} · ${record?.type || 'No record'}${(record?.waitingTaskIds || []).length ? ' · Waiting in parallel' : ''}`}
                                                >
                                                    {record?.type === 'Worked' && <div className="pointer-events-none absolute inset-x-0 top-[42%] h-2 bg-blue-500 shadow-sm" />}
                                                    {record?.type === 'Waiting' && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 bg-yellow-400 shadow-sm" />}
                                                    {record?.type === 'Worked' && !!(record.waitingTaskIds || []).length && <div className="pointer-events-none absolute inset-x-0 top-[62%] h-1.5 bg-yellow-400" />}
                                                    {record?.type === 'Worked' && (
                                                        <div className="relative z-10 flex flex-col items-center gap-1 animate-in fade-in zoom-in duration-300">
                                                            <div className="relative w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm">
                                                                <Zap className="w-3 h-3" />
                                                                {!!(record.waitingTaskIds || []).length && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-yellow-400" title="Tendering was also waiting on an external assignment" />}
                                                            </div>
                                                            {area.area === 'Tendering' && (
                                                                <div className="mt-1 flex w-full max-w-[28px] flex-col items-center rounded border border-blue-100/60 bg-white/70 px-0 py-0.5" onClick={(e) => e.stopPropagation()} title={`${(record as AreaDayRecord).hours || 0}h ${(record as AreaDayRecord).minutes || 0}m`}>
                                                                    <div className="flex w-full items-center justify-center gap-px">
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            className="h-3 w-4 min-w-0 border-none bg-transparent p-0 text-center text-[8px] font-black text-blue-700 focus:ring-0"
                                                                            placeholder="0"
                                                                            value={(record as AreaDayRecord).hours || ''}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value) || 0;
                                                                                const newCal = { ...(area.calendar || {}) };
                                                                                newCal[d] = { ...newCal[d], hours: val, type: 'Worked' };
                                                                                onSaveAreaCalendar(area.id, newCal);
                                                                            }}
                                                                        />
                                                                        <span className="text-[7px] font-black text-blue-400 uppercase">h</span>
                                                                    </div>
                                                                    <div className="flex w-full items-center justify-center gap-px border-t border-blue-100/60">
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            className="h-3 w-4 min-w-0 border-none bg-transparent p-0 text-center text-[8px] font-black text-blue-700 focus:ring-0"
                                                                            placeholder="0"
                                                                            value={(record as AreaDayRecord).minutes || ''}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value) || 0;
                                                                                const newCal = { ...(area.calendar || {}) };
                                                                                newCal[d] = { ...newCal[d], minutes: val, type: 'Worked' };
                                                                                onSaveAreaCalendar(area.id, newCal);
                                                                            }}
                                                                        />
                                                                        <span className="text-[7px] font-black text-blue-400 uppercase">m</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {record?.type === 'Waiting' && (
                                                        <div className="relative z-10 w-5 h-5 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-sm animate-in fade-in zoom-in duration-300">
                                                            <Clock className="w-3 h-3" />
                                                        </div>
                                                    )}
                                                    {record?.type === 'Inactive' && (
                                                        <div className="relative z-10 w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                                            <X className="w-3 h-3" />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer for Timeline & Execution Status (Moved from sidebar to bottom) */}
                    <div className="border-t bg-gray-50/80 p-6 flex flex-wrap gap-8 items-start shadow-inner">
                        <div className="flex-1 min-w-[300px]">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <Timer className="w-4 h-4 text-purple-500" />
                                Execution Status
                            </h3>
                            <div className="flex flex-wrap gap-6">
                                <div className="flex-1 min-w-[200px]">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Received At</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-all"
                                        value={timeline.receivedAt || ''}
                                        onChange={(e) => onUpdateTimeline('receivedAt', e.target.value)}
                                    />
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Delivered At</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-[#3DCD58] transition-all"
                                        value={timeline.deliveredAt || ''}
                                        onChange={(e) => onUpdateTimeline('deliveredAt', e.target.value)}
                                    />
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                    <label className="block text-[10px] font-black text-red-400 uppercase tracking-widest mb-1.5">Cancelled At</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-red-500 transition-all"
                                        value={timeline.cancelledAt || ''}
                                        onChange={(e) => onUpdateTimeline('cancelledAt', e.target.value)}
                                    />
                                </div>
                                {timeline.cancelledAt && (
                                    <div className="w-full">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Cancellation Reason</label>
                                        <textarea
                                            className="w-full h-20 bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-red-500 transition-all resize-none"
                                            placeholder="Why was it cancelled?"
                                            value={timeline.cancelledReason || ''}
                                            onChange={(e) => onUpdateTimeline('cancelledReason', e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="w-64 p-4 bg-purple-50 rounded-2xl border border-purple-100 hidden lg:block self-center">
                            <p className="text-[10px] font-black text-purple-600 uppercase leading-relaxed text-center">
                                All changes in this view are immediate and persistent.
                            </p>
                        </div>
                    </div>

                    <div className="p-6 border-t bg-gray-50 flex justify-between items-center shadow-2xl">
                        <div className="flex gap-10">
                            <div className="flex items-center gap-4">
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => applyBatchAction('Worked')}
                                        disabled={selectedCells.length === 0}
                                        className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-lg disabled:opacity-30 hover:bg-blue-600 transition-all hover:scale-105 active:scale-95"
                                    >
                                        Mark Worked ({selectedCells.length})
                                    </button>
                                    <button
                                        onClick={() => applyBatchAction('Waiting')}
                                        disabled={selectedCells.length === 0}
                                        className="bg-yellow-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-lg disabled:opacity-30 hover:bg-yellow-600 transition-all hover:scale-105 active:scale-95"
                                    >
                                        Mark Waiting ({selectedCells.length})
                                    </button>
                                    <button
                                        onClick={() => applyBatchAction('Inactive')}
                                        disabled={selectedCells.length === 0}
                                        className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-lg disabled:opacity-30 hover:bg-red-600 transition-all hover:scale-105 active:scale-95"
                                    >
                                        Mark Inactive ({selectedCells.length})
                                    </button>
                                    <button
                                        onClick={() => applyBatchAction(null)}
                                        disabled={selectedCells.length === 0}
                                        className="bg-white border border-gray-200 text-gray-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm disabled:opacity-30 hover:bg-gray-50 transition-all"
                                    >
                                        Clear ({selectedCells.length})
                                    </button>
                                </div>
                            </div>
                            <div className="w-px h-8 bg-gray-200"></div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg border border-emerald-100">
                                    Delivered: {timeline.deliveredAt || '--'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[8px] font-black uppercase shadow-sm">
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Confirmed</span>
                                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">Calculated</span>
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Incomplete</span>
                                <span className="ml-1 text-gray-400">START · CMT commitment · DEL delivery · APR approval</span>
                            </div>
                            <button onClick={onClose} className="bg-gray-900 text-white px-10 py-3.5 rounded-2xl font-black shadow-2xl hover:bg-black transition-all active:scale-95 text-lg">Close Dashboard</button>
                        </div>
                    </div>
                </div>

                {selectedDaySummary && (
                    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setViewingDayDetails(null)}>
                        <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
                            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5">
                                <div><h3 className="text-lg font-black text-gray-900">Daily activity · {selectedDaySummary.date}</h3><p className="text-xs text-gray-500">Timer work, deliveries, commitments, schedule and history events.</p></div>
                                <button onClick={() => setViewingDayDetails(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                            </div>
                            <div className="p-5">
                                {!selectedDaySummary.hasAnything ? (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-14 text-center">
                                        <CalendarDays className="mx-auto mb-3 h-9 w-9 text-gray-300" />
                                        <h4 className="text-base font-black text-gray-700">No work was recorded for this project on this day</h4>
                                        <p className="mt-1 text-xs text-gray-400">There are no timer sessions, deliveries, commitments, scheduled work or project events.</p>
                                        <button onClick={() => setViewingHistoryDate(selectedDaySummary.date)} className="mt-5 rounded-xl bg-[#3DCD58] px-4 py-2 text-xs font-black text-white hover:bg-[#32b94b]">Add an event</button>
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        <section className="rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-5">
                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                <div className="max-w-2xl">
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Executive summary</h4>
                                                    <p className="mt-2 text-sm font-semibold leading-6 text-gray-800">
                                                        {selectedDaySummary.hasRecordedWork
                                                            ? `${selectedDaySummary.worked.length} work session${selectedDaySummary.worked.length === 1 ? '' : 's'} (${durationLabel(selectedDaySummary.totalSeconds)}), ${selectedDaySummary.completed.length} deliverable${selectedDaySummary.completed.length === 1 ? '' : 's'} completed and ${selectedDaySummary.events.length} project event${selectedDaySummary.events.length === 1 ? '' : 's'} recorded.`
                                                            : `No executed work was recorded. The day contained ${selectedDaySummary.expected.length} commitment${selectedDaySummary.expected.length === 1 ? '' : 's'} and ${selectedDaySummary.scheduled.length} planned task${selectedDaySummary.scheduled.length === 1 ? '' : 's'}.`}
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2 text-center">
                                                    <div className="rounded-xl bg-blue-50 px-3 py-2"><div className="text-lg font-black text-blue-700">{durationLabel(selectedDaySummary.totalSeconds)}</div><div className="text-[8px] font-black uppercase text-blue-500">Logged</div></div>
                                                    <div className="rounded-xl bg-emerald-50 px-3 py-2"><div className="text-lg font-black text-emerald-700">{selectedDaySummary.completed.length}</div><div className="text-[8px] font-black uppercase text-emerald-500">Delivered</div></div>
                                                    <div className="rounded-xl bg-red-50 px-3 py-2"><div className="text-lg font-black text-red-700">{selectedDaySummary.missed.length}</div><div className="text-[8px] font-black uppercase text-red-500">Missed</div></div>
                                                    <div className="rounded-xl bg-purple-50 px-3 py-2"><div className="text-lg font-black text-purple-700">{selectedDaySummary.events.length}</div><div className="text-[8px] font-black uppercase text-purple-500">Events</div></div>
                                                </div>
                                            </div>
                                        </section>

                                        <div className="grid gap-4 lg:grid-cols-2">
                                            {!!selectedDaySummary.worked.length && <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4"><h4 className="mb-3 text-xs font-black uppercase text-blue-700">Work performed · who and what</h4><div className="space-y-2">{selectedDaySummary.worked.map(({ task, log, people }) => <button key={`${task.id}-${log.id}`} onClick={() => onOpenTask(task.id)} className="flex w-full items-center justify-between rounded-lg bg-white p-3 text-left shadow-sm hover:ring-2 hover:ring-blue-200"><span><span className="block text-xs font-bold text-gray-800">{task.title}</span><span className="text-[10px] text-gray-500">{people.join(', ') || 'Unassigned'} · click to open tracker</span></span><span className="text-xs font-black text-blue-700">{durationLabel(log.durationSeconds || 0)}</span></button>)}</div></section>}

                                            {!!selectedDaySummary.completed.length && <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"><h4 className="mb-3 text-xs font-black uppercase text-emerald-700">Delivered / completed</h4><div className="space-y-2">{selectedDaySummary.completed.map(task => <button key={task.id} onClick={() => onOpenTask(task.id)} className="block w-full rounded-lg bg-white p-3 text-left text-xs font-bold text-gray-800 shadow-sm hover:underline">{task.title}<span className="mt-1 block text-[10px] font-normal text-gray-500">{taskParticipantNames(task).join(', ') || 'Unassigned'}</span></button>)}</div></section>}

                                            {!!selectedDaySummary.expected.length && <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-4"><h4 className="mb-3 text-xs font-black uppercase text-amber-700">Commitments expected that day</h4><div className="space-y-2">{selectedDaySummary.expected.map(task => <button key={task.id} onClick={() => onOpenTask(task.id)} className="flex w-full items-center justify-between rounded-lg bg-white p-3 text-left text-xs font-bold text-gray-800 shadow-sm"><span>{task.title}</span>{selectedDaySummary.missed.some(item => item.id === task.id) ? <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black uppercase text-red-700">Not delivered on time</span> : <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">Delivered</span>}</button>)}</div></section>}

                                            {(!!selectedDaySummary.events.length || !!selectedDaySummary.scheduled.length) && <section className="rounded-xl border border-purple-100 bg-purple-50/40 p-4"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-xs font-black uppercase text-purple-700">Events and planned work</h4><button onClick={() => setViewingHistoryDate(selectedDaySummary.date)} className="rounded-lg border border-purple-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase text-purple-700 hover:bg-purple-50">Add / edit events</button></div><div className="space-y-2">{selectedDaySummary.events.map(event => <button key={event.id} onClick={() => setViewingHistoryDate(selectedDaySummary.date)} className="flex w-full items-start gap-2 rounded-lg bg-white p-3 text-left text-xs text-gray-700 shadow-sm hover:ring-2 hover:ring-purple-100"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#3DCD58]" /><span>{event.content}</span></button>)}{selectedDaySummary.scheduled.map(task => <button key={task.id} onClick={() => onOpenTask(task.id)} className="block w-full rounded-lg bg-white p-3 text-left text-xs font-bold text-gray-800 shadow-sm hover:underline">Scheduled: {task.title}</button>)}</div></section>}
                                        </div>

                                        {!selectedDaySummary.events.length && <div className="flex justify-end"><button onClick={() => setViewingHistoryDate(selectedDaySummary.date)} className="rounded-xl border border-[#3DCD58]/30 bg-[#3DCD58]/5 px-4 py-2 text-xs font-black text-[#278a3b] hover:bg-[#3DCD58]/10">+ Add project event</button></div>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {selectedAreaSummary && (
                    <div className="fixed inset-0 z-[255] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setViewingAreaDetails(null)}>
                        <div className="max-h-[86vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
                            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><div><h3 className="text-lg font-black text-gray-900">{selectedAreaSummary.area.area}</h3><p className="text-xs text-gray-500">People in this proposal and every task attributed to the area.</p></div><button onClick={() => setViewingAreaDetails(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
                            <div className="p-5">
                                <div className="mb-5 flex flex-wrap gap-2">
                                    {selectedAreaSummary.area.area === 'Tendering' && <span className="rounded-full bg-[#3DCD58]/10 px-3 py-1 text-xs font-bold text-[#278a3b]">{userName || 'Me'} · Tender (me)</span>}
                                    {selectedAreaSummary.people.map(person => <span key={person.id} className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">{person.name}</span>)}
                                    {selectedAreaSummary.area.area !== 'Tendering' && !selectedAreaSummary.people.length && <span className="text-xs italic text-gray-400">No opportunity stakeholder has this area in Roles.</span>}
                                </div>
                                <div className="space-y-2">{selectedAreaSummary.tasks.map(task => {
                                    const seconds = (task.timeLogs || []).reduce((sum, log) => sum + (log.durationSeconds || 0), 0);
                                    const requested = task.responsibleRequestedDate || task.approvalRequestedDate;
                                    const delivered = taskCompletionDate(task);
                                    const elapsed = requested && delivered ? Math.max(0, Math.round((new Date(`${delivered}T00:00:00`).getTime() - new Date(`${requested}T00:00:00`).getTime()) / 86400000)) : null;
                                    return <button key={task.id} onClick={() => onOpenTask(task.id)} className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl border border-gray-100 p-4 text-left hover:border-purple-200 hover:bg-purple-50/30"><span><span className="block text-sm font-black text-gray-800">{task.title}</span><span className="mt-1 block text-[10px] text-gray-500">{taskParticipantNames(task).join(', ') || selectedAreaSummary.area.area} · {task.status}</span></span><span className="text-right text-[10px] font-bold text-gray-500">My timer: {durationLabel(seconds)}<br />Assignment cycle: {elapsed === null ? 'Open / no dates' : `${elapsed} days`}</span></button>;
                                })}</div>
                                {!selectedAreaSummary.tasks.length && <p className="rounded-xl bg-gray-50 p-6 text-center text-xs italic text-gray-400">No tasks are assigned to this area or its stakeholders.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {viewingHistoryDate && (
                    <HistoryEventsModal
                        date={viewingHistoryDate}
                        history={history}
                        onAdd={(content) => onAddHistory(viewingHistoryDate, content)}
                        onEdit={onEditHistory}
                        onDelete={onDeleteHistory}
                        onClose={() => setViewingHistoryDate(null)}
                    />
                )}

                {isInternalAddAreaOpen && (
                    <AddAreaModal
                        availableAreas={(trackedAreas || []).filter(ta => !areas.some(a => a.area === ta))}
                        onAdd={(areaName) => {
                            onAddArea(areaName);
                            setIsInternalAddAreaOpen(false);
                        }}
                        onClose={() => setIsInternalAddAreaOpen(false)}
                    />
                )}
            </div>
        </div >
    );
};

const translateStatus = (status: string) => {
    const mapping: Record<string, string> = {
        ...DETAILED_STATUS_LABELS,
        'Submitted': 'Completed',
        'No Status': 'No Status',
        'Waiting': 'Waiting',
    };
    return mapping[status] || taskStatusLabel(status);
};

const TaskTimerButtonList = React.memo(({ task, oppId }: { task: Task, oppId: string }) => {
    const { timerState } = useTimer();
    const { startTimer, pauseTimer } = useTimerActions();
    const isActive = timerState.taskId === task.id && timerState.isRunning;

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                if (isActive) pauseTimer();
                else if (task && oppId) startTimer(task.id, oppId, task.title || 'Untitled Task');
            }}
            className={`p-1 rounded transition-colors ${isActive ? 'bg-red-50 text-red-500 animate-pulse' : 'hover:bg-gray-200 text-gray-400 hover:text-green-600'}`}
            title={isActive ? 'Pause Timer' : 'Start Timer'}
        >
            {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
    );
});



const incrementRevision = (rev: string): string => {
    const match = rev?.match(/R(\d+)/i);
    if (match) {
        return `R${parseInt(match[1]) + 1}`;
    }
    const numMatch = rev?.match(/(\d+)/);
    if (numMatch) return `R${parseInt(numMatch[1]) + 1}`;
    return 'R1';
};

const resetCommercialData = (): Commercial => ({
    currency: 'USD',
    customSections: [],
    agreementsLink: '',
    cfLink: '',
    discountsAndNotes: '',
    quickRefs: [],
    internalRevisions: [],
    cqaOfficialSellPrice: 0,
    cqaOfficialMargin: 0
});

const DEFAULT_QUICK_LINKS = [
    { id: 'srLink', label: 'SRLink', locked: true, placeholder: 'SR / Support Request URL', aliases: ['srlink', 'sr link', 'sr', 'support request', 'support request link'] },
    { id: 'bfo', label: 'BFO', locked: true, placeholder: 'BFO / CRM URL', aliases: ['bfo', 'bfo link'] },
    { id: 'cqaLink', label: 'CQA', locked: true, placeholder: 'CQA 2.0 URL', aliases: ['cqa', 'cqa link', 'cqa 2.0', 'cqa 2.0 link'] },
    { id: 'folder', label: 'Sharepoint', locked: false, placeholder: 'Sharepoint URL', aliases: ['sharepoint', 'sharepoint link', 'folder', 'internalfolder', 'internal folder', 'officialfolder', 'official folder'] },
    { id: 'ba', label: 'BA', locked: false, placeholder: 'Basket / BA URL', aliases: ['ba', 'ba link', 'basket', 'basket link'] },
    { id: 'geet', label: 'GEET', locked: false, placeholder: 'GEET URL', aliases: ['geet', 'geet link'] },
] as const;

// Icon palette offered for the unlocked default quick links (Sharepoint, BA, GEET).
// `name` is what gets stored in opportunity.quickLinkIcons; all icons are already
// imported at the top of this file.
const QUICK_LINK_ICON_OPTIONS: { name: string; Icon: React.ComponentType<{ className?: string; title?: string }> }[] = [
    { name: 'folder', Icon: FolderOpen },
    { name: 'folderClosed', Icon: Folder },
    { name: 'link', Icon: LinkIcon },
    { name: 'file', Icon: FileText },
    { name: 'sheet', Icon: FileSpreadsheet },
    { name: 'table', Icon: Table },
    { name: 'dollar', Icon: DollarSign },
    { name: 'percent', Icon: Percent },
    { name: 'briefcase', Icon: Briefcase },
    { name: 'database', Icon: Database },
    { name: 'calendar', Icon: CalendarIcon },
    { name: 'mail', Icon: Mail },
    { name: 'inbox', Icon: Inbox },
    { name: 'chart', Icon: BarChart3 },
    { name: 'target', Icon: Target },
    { name: 'checks', Icon: ListChecks },
    { name: 'tag', Icon: Tag },
    { name: 'pin', Icon: Pin },
    { name: 'zap', Icon: Zap },
    { name: 'presentation', Icon: Presentation },
];
const QUICK_LINK_ICON_MAP: Record<string, React.ComponentType<{ className?: string; title?: string }>> =
    Object.fromEntries(QUICK_LINK_ICON_OPTIONS.map(o => [o.name, o.Icon]));

type DefaultQuickLinkId = typeof DEFAULT_QUICK_LINKS[number]['id'];
type NormalizedQuickLinks = {
    defaultUrls: Record<DefaultQuickLinkId, string>;
    customLinks: QuickLinkItem[];
};

const normalizeQuickLinkKey = (value: string | undefined) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const findDefaultQuickLink = (value: string | undefined) => {
    const key = normalizeQuickLinkKey(value);
    if (!key) return undefined;
    return DEFAULT_QUICK_LINKS.find(link =>
        normalizeQuickLinkKey(link.id) === key
        || normalizeQuickLinkKey(link.label) === key
        || link.aliases.some(alias => normalizeQuickLinkKey(alias) === key)
    );
};

const coerceQuickLinkItems = (links: Opportunity['links']): QuickLinkItem[] => {
    if (Array.isArray(links)) {
        return links.map((item, index) => ({
            id: item.id || crypto.randomUUID(),
            type: item.type || 'link',
            label: item.label || `Link ${index + 1}`,
            url: item.url || '',
            order: item.order
        }));
    }

    return Object.entries(links || {}).map(([key, value]) => {
        const valueObj = typeof value === 'object' && value !== null ? value as any : null;
        return {
            id: key,
            type: 'link',
            label: valueObj?.label || valueObj?.title || key,
            url: valueObj?.url || (typeof value === 'string' ? value : '')
        } as QuickLinkItem;
    });
};

const normalizeQuickLinks = (links: Opportunity['links']): NormalizedQuickLinks => {
    const defaultUrls = DEFAULT_QUICK_LINKS.reduce((acc, link) => {
        acc[link.id] = '';
        return acc;
    }, {} as Record<DefaultQuickLinkId, string>);
    const customLinks: QuickLinkItem[] = [];
    const seenCustomIds = new Set<string>();

    coerceQuickLinkItems(links).forEach(item => {
        const defaultLink = item.type === 'link'
            ? (findDefaultQuickLink(item.id) || findDefaultQuickLink(item.label))
            : undefined;

        if (defaultLink) {
            const url = item.url || '';
            if (url && (!defaultUrls[defaultLink.id] || item.id === 'officialFolder')) {
                defaultUrls[defaultLink.id] = url;
            }
            return;
        }

        const id = item.id || crypto.randomUUID();
        if (seenCustomIds.has(id)) return;
        seenCustomIds.add(id);
        customLinks.push({ ...item, id });
    });

    return { defaultUrls, customLinks };
};

const composeQuickLinks = (defaultUrls: Record<DefaultQuickLinkId, string>, customLinks: QuickLinkItem[]) => ([
    ...DEFAULT_QUICK_LINKS.map(link => ({
        id: link.id,
        type: 'link' as const,
        label: link.label,
        url: defaultUrls[link.id] || ''
    })),
    ...customLinks
]);

const resetPresentationData = (): PrdPresentation => ({
    executiveSummary: '',
    issues: '',
    kpis: '',
    requirements: '',
    proposalAnalysis: {
        trigger: '',
        missingInfo: '',
        risks: '',
        competition: '',
        strategy: '',
        checklist: {}
    }
});

const createEmptyEmailsData = (): OpportunityEmailsData => ({
    folders: [],
    labels: [],
    conversations: [],
    selectedOutlookFolderIds: []
});

const resetKPIData = (current: KPIs): KPIs => ({
    ...current,
    languageSkill: null,
    technicalUnderstanding: null,
    dealProbability: null,
    effortContribution: null,
    sold: null,
    proposalAmountUSD: null,
    timeline: {
        receivedAt: new Date().toISOString(),
        deliveredAt: null,
        cancelledAt: null,
        cancelledReason: null
    },
    execution: {
        myWorkDays: null,
        waitingOnOthersDays: null
    },
    areasInvolved: []
});

const instantiateTaskStandard = (standard: TaskStandard, stage: Opportunity['stage']): Task[] => {
    const idMap = new Map<string, string>();
    standard.tasks.forEach(task => idMap.set(task.id, crypto.randomUUID()));
    return standard.tasks.map(task => ({
        id: idMap.get(task.id)!,
        title: task.title,
        description: task.description || '',
        processSection: task.processSection,
        status: 'Pending',
        priority: task.priority || 'Medium',
        owner: task.owner || 'Me',
        externalAreas: task.externalAreas || [],
        responsible: '',
        dueDate: '',
        stageContext: stage,
        subtasks: (task.subtasks || []).map(subtask => ({ ...subtask, id: crypto.randomUUID(), completed: false })),
        order: task.order,
        dependsOnTaskIds: (task.dependsOnTaskIds || []).map(id => idMap.get(id)).filter(Boolean) as string[],
        blockDoneUntilDependenciesDone: task.blockDoneUntilDependenciesDone || false,
        subtasksPerSystem: task.subtasksPerSystem || false,
    }));
};

const TaskTimerButtonModal = React.memo(({ task, oppId }: { task: Task, oppId: string }) => {
    const { timerState } = useTimer();
    const { startTimer } = useTimerActions();
    const isActive = timerState.taskId === task.id && timerState.isRunning;

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                if (!isActive) startTimer(task.id, oppId, task.title);
            }}
            className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isActive ? 'bg-red-500 text-white animate-pulse' : 'bg-[#3DCD58] text-white hover:bg-[#2db64a]'}`}
            title={isActive ? 'Timer Active' : 'Start Timer'}
        >
            <Play className="w-3 h-3 shrink-0" />
            {isActive ? 'Active' : 'Start'}
        </button>
    );
});

/**
 * "Remind me" button + inline popover, reused for tasks and notes. When
 * `taskOptions` is passed (Notes context), the popover also lets the user
 * link an optional task in addition to the note — a reminder can be linked
 * to a task, a note, or both.
 */
const RemindMeButton: React.FC<{
    defaultTitle: string;
    opportunityId: string;
    taskId?: string;
    noteId?: string;
    taskOptions?: SearchableOption[];
    popoverAlign?: 'left' | 'right';
    onAdd: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => void;
}> = ({ defaultTitle, opportunityId, taskId, noteId, taskOptions, popoverAlign = 'right', onAdd }) => {
    const [open, setOpen] = useState(false);
    const [picking, setPicking] = useState(false);
    const [when, setWhen] = useState('');
    const [linkedTaskId, setLinkedTaskId] = useState('');

    const reset = () => { setOpen(false); setPicking(false); setWhen(''); setLinkedTaskId(''); };

    const submit = () => {
        if (!when) return;
        onAdd({
            title: defaultTitle,
            dueAt: new Date(when).toISOString(),
            opportunityId,
            taskId: taskId || linkedTaskId || undefined,
            noteId,
        });
        reset();
    };

    return (
        <div className="relative">
            <button
                onClick={() => { setOpen(o => !o); setPicking(false); }}
                title="Schedule a reminder"
                className="flex items-center gap-1 text-xs font-bold bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
            >
                <Bell className="w-3 h-3" /> Remind me
            </button>
            {open && (
                <div className={`absolute ${popoverAlign === 'left' ? 'left-0' : 'right-0'} mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-50 p-3 space-y-2`} onClick={(e) => e.stopPropagation()}>
                    {taskOptions && (
                        <SearchableSelect
                            value={linkedTaskId}
                            onChange={setLinkedTaskId}
                            options={taskOptions}
                            placeholder="Link a task too (optional)…"
                        />
                    )}
                    {!picking ? (
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="w-full text-left border border-gray-200 rounded-lg text-sm p-2 bg-white hover:bg-gray-50"
                        >
                            {when ? new Date(when).toLocaleString() : <span className="text-gray-400">Pick date &amp; time…</span>}
                        </button>
                    ) : (
                        <DateTimePicker
                            value={when}
                            onConfirm={(isoLocal) => { setWhen(isoLocal); setPicking(false); }}
                            onCancel={() => setPicking(false)}
                        />
                    )}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={submit}
                            disabled={!when}
                            className="flex-1 py-1.5 text-sm font-medium bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Save
                        </button>
                        <button type="button" onClick={reset} className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

type OpportunityDetailTab = 'overview' | 'commercial' | 'notes' | 'tasks' | 'history' | 'folder' | 'kpi' | 'emails';

const isOpportunityDetailTabVisible = (tab: OpportunityDetailTab, hiddenSections: OpportunityDetailSectionKey[] = [], emailIntegrationEnabled = false) => {
    if (tab === 'overview') return true;
    if (tab === 'emails' && !emailIntegrationEnabled) return false;
    return !hiddenSections.includes(tab as OpportunityDetailSectionKey);
};

const renderOpportunityDetailTabIcon = (tab: OpportunityDetailTab) => {
    switch (tab) {
        case 'kpi': return <BarChart3 className="w-4 h-4" />;
        case 'history': return <HistoryIcon className="w-4 h-4" />;
        case 'tasks': return <ListChecks className="w-4 h-4" />;
        case 'commercial': return <DollarSign className="w-4 h-4" />;
        case 'notes': return <FileText className="w-4 h-4" />;
        case 'emails': return <Mail className="w-4 h-4" />;
        case 'folder': return <FolderOpen className="w-4 h-4" />;
        default: return null;
    }
};

const OpportunityDetail: React.FC<Props> = ({ opportunity, opportunities, onBack, onUpdate: parentOnUpdate, onDelete, onSelectOpp, noteTemplates = [], taskStandards = [], holidays = [], trackedAreas = [], globalContacts = [], onGlobalContactsChange, onTrackedAreasChange, deepLink = undefined, globalLabels = [], onMinimize, onCloseTab, isSubView, emailIntegrationEnabled = false, sowSectionEnabled = false, stakeholdersSectionEnabled = false, commercialCqaLinkVisible = true, onHideCommercialCqaLink, onShowCommercialCqaLink, commercialOppLinesLinkVisible = true, onHideCommercialOppLinesLink, onShowCommercialOppLinesLink, remindersEnabled = false, timerEnabled = true, onAddReminder, hiddenOpportunityHeaderFields = [], hiddenOpportunityDetailSections = [], opportunityDetailSectionOrder = [], alarms = [], confirmExpectedDateChanges = false, userName = 'User', emailComposeSettings = null, globalSowForm = { sections: [], questions: [] }, onGlobalSowFormChange, scopeCatalog }) => {
    const { getTimerState, confirmStop } = useTimerActions();
    const requestedTab = (deepLink?.tab || 'overview') as OpportunityDetailTab;
    const initialTab = isOpportunityDetailTabVisible(requestedTab, hiddenOpportunityDetailSections, emailIntegrationEnabled) ? requestedTab : 'overview';
    const [activeTab, setActiveTab] = useState<OpportunityDetailTab>(initialTab);
    const [isDeferring, setIsDeferring] = useState(false);
    const isTabVisible = useCallback((tab: OpportunityDetailTab) => isOpportunityDetailTabVisible(tab, hiddenOpportunityDetailSections, emailIntegrationEnabled), [hiddenOpportunityDetailSections, emailIntegrationEnabled]);
    const orderedDetailTabs = useMemo(() => normalizeOpportunityDetailSectionOrder(opportunityDetailSectionOrder).filter((tab) => isOpportunityDetailTabVisible(tab as OpportunityDetailTab, hiddenOpportunityDetailSections, emailIntegrationEnabled)) as OpportunityDetailTab[], [opportunityDetailSectionOrder, hiddenOpportunityDetailSections, emailIntegrationEnabled]);

    useEffect(() => {
        if (!isTabVisible(activeTab)) {
            setActiveTabSafe('overview');
        }
    }, [activeTab, isTabVisible]);

    const [editingAreaCalendar, setEditingAreaCalendar] = useState<string | null>(null); // Area ID
    const [showFullCalendar, setShowFullCalendar] = useState(false);
    const [showAddAreaModal, setShowAddAreaModal] = useState(false);
    const [localOpp, setLocalOpp] = useState<Opportunity>(() => migrateLegacyApprovalEvents(opportunity));
    const hiddenHeaderFields = useMemo(() => new Set(hiddenOpportunityHeaderFields), [hiddenOpportunityHeaderFields]);
    const deliveryAlarm = useMemo(() => {
        const expected = localOpp.dates?.expected;
        if (!expected) return null;
        const [year, month, day] = expected.split('-').map(Number);
        if (!year || !month || !day) return null;
        const due = new Date(year, month - 1, day);
        // Once the proposal is delivered, freeze this metric on the real delivery date.
        // Continuing to compare against today made a completed on-time delivery eventually
        // look overdue. Open opportunities still use today as their moving reference.
        const deliveredAt = localOpp.kpis?.timeline?.deliveredAt || '';
        const [deliveredYear, deliveredMonth, deliveredDay] = deliveredAt.split('-').map(Number);
        const hasDeliveryDate = !!(deliveredYear && deliveredMonth && deliveredDay);
        const referenceDate = hasDeliveryDate
            ? new Date(deliveredYear, deliveredMonth - 1, deliveredDay)
            : new Date();
        referenceDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.round((due.getTime() - referenceDate.getTime()) / 86400000);
        const alarm = [...alarms].sort((a, b) => a.daysThreshold - b.daysThreshold).find(item => daysLeft <= item.daysThreshold);
        const absoluteDays = Math.abs(daysLeft);
        const dayLabel = `${absoluteDays} day${absoluteDays === 1 ? '' : 's'}`;
        const label = hasDeliveryDate
            ? (daysLeft < 0 ? `Delivered ${dayLabel} late` : daysLeft === 0 ? 'Delivered on time' : `Delivered ${dayLabel} early`)
            : (daysLeft < 0 ? `${dayLabel} overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`);
        return {
            daysLeft,
            label,
            deliveredAt: hasDeliveryDate ? deliveredAt : '',
            className: alarm?.backgroundColor ? '' : (alarm?.color || 'bg-gray-700 text-white'),
            style: alarm?.backgroundColor ? { backgroundColor: alarm.backgroundColor, color: alarm.textColor || '#ffffff' } : undefined,
        };
    }, [localOpp.dates?.expected, localOpp.kpis?.timeline?.deliveredAt, alarms]);

    const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
    const isSnapshot = !!viewingVersionId;
    const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
    const [showAddSectionModal, setShowAddSectionModal] = useState(false);
    const [scopeModalOpen, setScopeModalOpen] = useState(false);
    const [expectedDateChange, setExpectedDateChange] = useState<{
        previous: string;
        next: string;
        kind: 'correction' | 'schedule' | null;
        reason: string;
    } | null>(null);
    const [expandedCommercialRevisionNotes, setExpandedCommercialRevisionNotes] = useState<Set<string>>(new Set());
    const [newSectionName, setNewSectionName] = useState('');

    const updateTimeoutRef = useRef<number | null>(null);
    const pendingUpdateRef = useRef<{ opp: Opportunity, id?: string } | null>(null);

    const onUpdate = useCallback((updated: Opportunity, id?: string, immediate = false) => {
        pendingUpdateRef.current = { opp: updated, id };
        
        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
        
        const flush = () => {
            if (pendingUpdateRef.current) {
                console.debug("[OpportunityDetail] Flushing update to parent...");
                parentOnUpdate(pendingUpdateRef.current.opp, pendingUpdateRef.current.id, immediate);
                pendingUpdateRef.current = null;
                updateTimeoutRef.current = null;
            }
        };

        if (immediate) {
            flush();
        } else {
            // Reduced from 500ms to 200ms so edits reach App state (and the cross-tab
            // broadcast + disk autosave pipeline) faster. Callers that need heavier
            // debouncing (handleFieldChange, updateOfficialSellPrice) already apply
            // their own delay upstream.
            updateTimeoutRef.current = window.setTimeout(flush, 200);
        }
    }, [parentOnUpdate]);

    const migratedApprovalOppIdsRef = useRef(new Set<string>());
    useEffect(() => {
        const legacy = (opportunity as Opportunity & { approvalHistory?: ApprovalEvent[] }).approvalHistory;
        if (!legacy?.length || migratedApprovalOppIdsRef.current.has(opportunity.id)) return;
        migratedApprovalOppIdsRef.current.add(opportunity.id);
        const migrated = migrateLegacyApprovalEvents(opportunity);
        setLocalOpp(migrated);
        onUpdate(migrated, opportunity.id, true);
    }, [opportunity, onUpdate]);

    useEffect(() => {
        return () => {
            // Level 2 Flush (onUpdate -> parentOnUpdate)
            if (updateTimeoutRef.current && pendingUpdateRef.current) {
                parentOnUpdate(pendingUpdateRef.current.opp, pendingUpdateRef.current.id);
            }
        };
    }, [parentOnUpdate]); // localOpp is not in deps to avoid infinite loop, but parentOnUpdate is stable.

    useEffect(() => {
        if (deepLink?.tab) {
            const nextTab = deepLink.tab as OpportunityDetailTab;
            setActiveTabSafe(isOpportunityDetailTabVisible(nextTab, hiddenOpportunityDetailSections, emailIntegrationEnabled) ? nextTab : 'overview');
        }
    }, [deepLink?.tab, hiddenOpportunityDetailSections]);

    const lastScrolledTaskId = useRef<string | null>(null);
    const focusTaskInTasksList = useCallback((taskId: string) => {
        if (!isTabVisible('tasks')) {
            setActiveTabSafe('overview');
            return;
        }
        setActiveTabSafe('tasks');
        setTaskViewMode('list');
        setTaskFilter('');
        setTaskStatusFilters(TASK_STATUS_ORDER);
        setHighlightTaskId(taskId);

        const scrollToTask = (attempt = 0) => {
            const el = document.getElementById(`task-${taskId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (attempt < 10) {
                window.setTimeout(() => scrollToTask(attempt + 1), 100);
            }
        };

        window.setTimeout(() => scrollToTask(), 80);
        window.setTimeout(() => {
            setHighlightTaskId(current => current === taskId ? null : current);
        }, 3500);
    }, [isTabVisible]);

    useEffect(() => {
        // Reset last scrolled when deepLink officially changes from parent
        if (!deepLink) lastScrolledTaskId.current = null;
        
        if (deepLink?.taskId && lastScrolledTaskId.current !== deepLink.taskId) {
            lastScrolledTaskId.current = deepLink.taskId;
            focusTaskInTasksList(deepLink.taskId);
        }
    }, [deepLink?.taskId, focusTaskInTasksList]);
    const [showVersionMenu, setShowVersionMenu] = useState(false);
    const [showMoreActionsMenu, setShowMoreActionsMenu] = useState(false);
    const [showCreateVersionModal, setShowCreateVersionModal] = useState(false);
    // Lists flagged as hidden in Settings stay out of the picker until the user asks for them.
    const selectableStandards = useMemo(() => visibleTaskStandards(taskStandards), [taskStandards]);
    const hasHiddenStandards = taskStandards.some(standard => standard.hidden);
    const [showHiddenRevisionStandards, setShowHiddenRevisionStandards] = useState(false);
    const [revisionTaskStandardId, setRevisionTaskStandardId] = useState(selectableStandards[0]?.id || '');
    const [newVersionData, setNewVersionData] = useState({ commitMessage: '', revisionReason: '', tags: '', srId: '' });
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [diffCompareId, setDiffCompareId] = useState<string | null>(null);
    const [showCopyTasksModal, setShowCopyTasksModal] = useState(false);
    const [showRevisionCarryoverModal, setShowRevisionCarryoverModal] = useState(false);
    const [revisionCarryoverSource, setRevisionCarryoverSource] = useState<{
        sourceLabel: string;
        notes: MeetingNote[];
        defaultLinks: { id: string; label: string; url: string }[];
        customLinks: QuickLinkItem[];
        targetOppId?: string;
        initialDefaultUrls?: Record<DefaultQuickLinkId, string>;
        deleteCurrentOppAfterClose?: boolean;
        baseOpportunity?: Opportunity;
    } | null>(null);
    const [showSrImport, setShowSrImport] = useState(false);
    const [versionSearchTerm, setVersionSearchTerm] = useState('');
    const versionMenuButtonRef = useRef<HTMLButtonElement>(null);
    // null until measured: portalling to document.body avoids the header's overflow-hidden clipping
    // and the stakeholders/toolbar/delivery boxes stacking on top of this dropdown (see V0/V1).
    const [versionMenuPosition, setVersionMenuPosition] = useState<{ top: number, right: number } | null>(null);
    useLayoutEffect(() => {
        if (!showVersionMenu) { setVersionMenuPosition(null); return; }
        const positionMenu = () => {
            const rect = versionMenuButtonRef.current?.getBoundingClientRect();
            if (!rect) return;
            setVersionMenuPosition({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
        };
        positionMenu();
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', positionMenu, true);
        return () => {
            window.removeEventListener('resize', positionMenu);
            window.removeEventListener('scroll', positionMenu, true);
        };
    }, [showVersionMenu]);

    const handleVersionSwitch = (vId: string | null) => {
        if (vId === viewingVersionId && vId !== null) {
            handleVersionSwitch(null); // Toggle off
            return;
        }

        if (vId) {
            // Load Snapshot
            const ver = localOpp.versions?.find(v => v.id === vId);
            if (ver) {
                // Merge snapshot with current containers to keep UI functional & prevent data loss
                const snapshotWithContainers = {
                    ...ver.snapshot,
                    versions: localOpp.versions,
                    history: ver.snapshot.history || [],
                    srId: ver.srId
                } as Opportunity;
                setLocalOpp(snapshotWithContainers);
                setViewingVersionId(vId);
                setShowVersionMenu(false);
            }
        } else {
            // Restore Live
            setLocalOpp(opportunity);
            setViewingVersionId(null);
            setShowVersionMenu(false);
        }
    };
    const [searchTerm, setSearchTerm] = useState('');
    const [isNoteTasksExpanded, setIsNoteTasksExpanded] = useState(false);
    /* The note editor's "Linked items" footer (documents, emails, linked tasks) was
     * permanently expanded and claimed up to 12rem at the bottom of the editor, so a
     * note with several links left barely any of its own content visible. It collapses
     * now, and the choice is remembered across sessions. */
    const NOTE_LINKED_PANEL_KEY = 'TenderLoop_NoteLinkedPanel_Open';
    const [noteLinkedPanelOpen, setNoteLinkedPanelOpen] = useState<boolean>(() => {
        try { return localStorage.getItem(NOTE_LINKED_PANEL_KEY) !== '0'; } catch { return true; }
    });
    const toggleNoteLinkedPanel = () => setNoteLinkedPanelOpen(prev => {
        const next = !prev;
        try { localStorage.setItem(NOTE_LINKED_PANEL_KEY, next ? '1' : '0'); } catch { /* storage disabled */ }
        return next;
    });
    /** Linked-document count for the note being edited, so the collapsed bar can show it. */
    const [noteLinkedDocCount, setNoteLinkedDocCount] = useState(0);
    const handleNoteLinkedDocCount = useCallback((_id: string, count: number) => setNoteLinkedDocCount(count), []);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const noteEditorRef = useRef<RichTextEditorHandle>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    // Clear the count while the next note's documents load, so the bar never shows
    // the previous note's number.
    useEffect(() => { setNoteLinkedDocCount(0); }, [selectedNoteId]);
    const [activeNoteHtml, setActiveNoteHtml] = useState<string>('');
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
    const flushNoteRef = useRef<(() => void) | null>(null);
    const syncNoteTimeoutRef = useRef<number | null>(null);

    // Refs updated directly in render body (not useEffect) so they are always current
    // when effect cleanups run. useEffect-based updates would be one render behind,
    // causing the flush to read stale notes and overwrite recently added ones.
    const localOppRef = useRef(localOpp);
    localOppRef.current = localOpp;

    // DATA-LOSS FIX: activeNoteHtmlRef must NOT mirror activeNoteHtml unconditionally
    // in the render body. handleNoteContentChange intentionally updates only this ref
    // while the user types (to avoid re-rendering this 6000-line component per
    // keystroke) and never calls setActiveNoteHtml. But this component re-renders for
    // countless unrelated reasons (any tab, any field, any timer). Mirroring on every
    // render â€” including the render triggered by clicking a different note â€” overwrote
    // the freshly-typed content with the stale activeNoteHtml state milliseconds before
    // the note-switch flush read it, so the flush saw "no change" and silently dropped
    // the edit. Only resync when activeNoteHtml itself legitimately changes (i.e. when
    // a note is freshly loaded by the lazy-load effect below).
    const activeNoteHtmlRef = useRef(activeNoteHtml);
    useEffect(() => {
        activeNoteHtmlRef.current = activeNoteHtml;
    }, [activeNoteHtml]);

    // Stable ref to onUpdate so flushNoteRef can call it without capturing a stale closure.
    // onUpdate itself is a useCallback, but its identity changes when parentOnUpdate changes;
    // using a ref guarantees the flush always calls the latest version.
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    // Ref for viewingVersionId so flush can guard against saving snapshot content
    const viewingVersionIdRef = useRef(viewingVersionId);
    viewingVersionIdRef.current = viewingVersionId;

    // HOTFIX PERFORMANCE: Isolated Note Sync (v5000-compatible)
    // We keep the heavy HTML local and only sync it to localOpp/App when switching notes or closing.
    useEffect(() => {
        if (!selectedNoteId) return;

        flushNoteRef.current = () => {
            if (syncNoteTimeoutRef.current) window.clearTimeout(syncNoteTimeoutRef.current);
            if (viewingVersionIdRef.current) return; // LOCK: never save snapshot content
            const currentNote = localOppRef.current.notes.find(n => n.id === selectedNoteId);
            // SOW notes are persisted directly by SowFormEmbed as serialized JSON. The generic
            // rich-text buffer does not follow those edits and can still contain the JSON that
            // was loaded before the Scope change. Flushing that stale buffer while leaving the
            // opportunity overwrote the newly saved Scope — which is why only opportunities
            // whose selected note was the SOW appeared to lose changes after closing.
            if (!currentNote || currentNote.format === 'sow') return;
            const content = activeNoteHtmlRef.current;

            // Sync ONLY if content actually changed
            if (currentNote.content !== content) {
                const updatedNotes = localOppRef.current.notes.map(n =>
                    n.id === selectedNoteId ? { ...n, content } : n
                );
                // Build the full update from localOppRef.current (always latest) instead of
                // calling handleFieldChange (which closes over a stale localOpp snapshot).
                // This prevents the flush from overwriting notes that were added after the
                // effect last ran (e.g. creating a new note while typing in the current one).
                const updated = {
                    ...localOppRef.current,
                    notes: updatedNotes,
                    lastUpdated: new Date().toISOString()
                };
                setLocalOpp(updated);
                // DATA-LOSS FIX: keep the ref in sync synchronously. The unmount persistence
                // guarantee (effect on [opportunity.id]) reads localOppRef.current, and since
                // setLocalOpp is async and no re-render happens during unmount, without this
                // line that cleanup would save the pre-flush notes and overwrite the content
                // we just pushed via onUpdateRef.
                localOppRef.current = updated;
                // DATA-LOSS FIX: write the crash-recovery backup FIRST â€” before
                // any async hop â€” so an exception or window close in the next
                // line can't skip it. Cleared after saveToDisk succeeds.
                try {
                    localStorage.setItem(
                        `tl-note-backup-${updated.id}-${selectedNoteId}`,
                        JSON.stringify({ content, ts: Date.now() })
                    );
                } catch {}
                // Cancel any in-flight debounced save so the immediate flush wins
                if (saveToParentTimeoutRef.current) window.clearTimeout(saveToParentTimeoutRef.current);
                onUpdateRef.current(updated, updated.id, true); // IMMEDIATE SYNC
            }
        };

        return () => {
            if (syncNoteTimeoutRef.current) window.clearTimeout(syncNoteTimeoutRef.current);
            // Flush on unmount, note switch, or tab switch
            if (flushNoteRef.current) flushNoteRef.current();
        };
    }, [selectedNoteId, activeTab]); // Added activeTab to ensure we save when leaving 'notes' view

    // DATA-LOSS FIX: the typing debounce above (handleNoteContentChange) waits up to 1.5s
    // before flushing to localOpp/localStorage. The note-switch/tab-switch cleanup covers
    // most cases, but it never runs if the user closes the tab/window or backgrounds the app
    // while still inside that 1.5s window â€” the keystroke is lost with no backup written.
    // These listeners force the same flush on tab hide/close so it always lands first.
    useEffect(() => {
        const flushNow = () => { if (flushNoteRef.current) flushNoteRef.current(); };
        const handleVisibilityChange = () => { if (document.hidden) flushNow(); };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', flushNow);
        window.addEventListener('beforeunload', flushNow);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', flushNow);
            window.removeEventListener('beforeunload', flushNow);
        };
    }, []);

    // DATA-LOSS FIX: the flush above relies on activeNoteHtmlRef, which is only
    // as fresh as the editor's own internal 150ms debounce (or its unmount
    // cleanup, whose ordering relative to this component's own effects isn't
    // guaranteed). Reading the DOM directly via the imperative handle — right
    // here, synchronously, BEFORE the note/tab actually changes — sidesteps
    // that entirely: at this exact moment the editor for the note being left
    // is still mounted and live, so this is always the freshest possible copy.
    const flushActiveNoteNow = () => {
        if (selectedNoteId) {
            const fresh = noteEditorRef.current?.getContent();
            if (fresh != null) activeNoteHtmlRef.current = fresh;
        }
        if (flushNoteRef.current) flushNoteRef.current();
    };
    const setSelectedNoteIdSafe = (id: string | null) => {
        flushActiveNoteNow();
        setIsNoteTasksExpanded(false);
        setSelectedNoteId(id);
    };
    const setActiveTabSafe = (tab: OpportunityDetailTab) => {
        flushActiveNoteNow();
        setActiveTab(tab);
    };

    // Handle note content changes with local debouncing (UI only)
    const handleNoteContentChange = (val: string) => {
        // Do NOT call setActiveNoteHtml here â€” that state is only needed when switching notes
        // to initialize NoteEditorWrapper. Calling it during typing triggers a full re-render
        // of the 6000-line OpportunityDetail component on every debounce cycle (TASK-034 fix).
        activeNoteHtmlRef.current = val;
        if (syncNoteTimeoutRef.current) window.clearTimeout(syncNoteTimeoutRef.current);
        syncNoteTimeoutRef.current = window.setTimeout(() => {
            if (flushNoteRef.current) flushNoteRef.current();
        }, 1500);
    };

    // Handle note selection (lazy load content to local editing state)
    const lastNoteId = useRef<string | null>(null);
    useEffect(() => {
        // AUTO-SELECT: If no note is selected but we have notes, pick the first one (usually latest)
        // This fixes the "empty editor" issue on old opportunities. It must pick from the same
        // browsable set the list shows — auto-selecting a note the user cannot see (hidden, or a
        // SOW while the SOW setting is off) would fight the effect that deselects it.
        if (!selectedNoteId && localOpp.notes.length > 0) {
            const firstBrowsable = localOpp.notes.find(n => !n.hidden && (sowSectionEnabled || n.format !== 'sow'));
            if (firstBrowsable) setSelectedNoteIdSafe(firstBrowsable.id);
            return;
        }

        if (selectedNoteId !== lastNoteId.current) {
            // DATA-LOSS FIX: do NOT call flushNoteRef here. The [selectedNoteId, activeTab]
            // effect cleanup already flushed the previous note; by the time we run, the
            // flushNoteRef closure has been replaced with one bound to the NEW selectedNoteId,
            // so calling it would save the old note's activeNoteHtml as the new note's
            // content and wipe real data.
            const n = localOpp.notes.find(nn => nn.id === selectedNoteId);
            setActiveNoteHtml(n?.content || '');
            lastNoteId.current = selectedNoteId;
        }
    }, [selectedNoteId, sowSectionEnabled]); // Note: We removed localOpp.notes from dependency to prevent typing wipe-out

    // STALE-EDITOR FIX: when the user LEAVES the notes tab, the cleanup above
    // flushes the typed content into localOpp.notes â€” but activeNoteHtml (the
    // editor's initial content) still holds the html from when the note was
    // first loaded. Returning to the tab remounts NoteEditorWrapper from that
    // stale state, so the user's latest edits seemed lost until they switched
    // notes back and forth. Re-sync from the (already flushed) note on re-entry.
    useEffect(() => {
        if (activeTab !== 'notes' || !selectedNoteId) return;
        const n = localOppRef.current.notes.find(nn => nn.id === selectedNoteId);
        if (n) {
            setActiveNoteHtml(n.content || '');
            activeNoteHtmlRef.current = n.content || '';
        }
    }, [activeTab]);
    const [isNoteFullScreen, setIsNoteFullScreen] = useState(false);
    const [sowNavigationOpen, setSowNavigationOpen] = useState(false);
    const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<{ task: Task } | null>(null);
    /** Open "when was this finished?" dialog; `onPick` replays the aborted Done with the chosen day. */
    const [completionPrompt, setCompletionPrompt] = useState<{ taskTitle: string; dueDate: string; onPick: (date: string) => void } | null>(null);
    const [taskViewMode, setTaskViewMode] = useState<'list' | 'calendar' | 'kanban'>('list');
    const [taskFilter, setTaskFilter] = useState('');
    const filterKey = `opportunityTasksFilters:${opportunity.id}`;
    const [taskStatusFilters, setTaskStatusFilters] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(filterKey);
            if (!saved) return TASK_STATUS_ORDER;
            const parsed = JSON.parse(saved) as string[];
            const knownPreviousStatuses = TASK_STATUS_ORDER.filter(status => status !== 'Changes Requested / Rework');
            return knownPreviousStatuses.every(status => parsed.includes(status))
                ? Array.from(new Set([...parsed, 'Changes Requested / Rework']))
                : parsed;
        } catch (e) { return TASK_STATUS_ORDER; }
    });
    const [showDocPicker, setShowDocPicker] = useState<{ type: 'task' | 'note'; id: string } | null>(null);
    const [changeRevisionTaskId, setChangeRevisionTaskId] = useState<string | null>(null);
    const [creatingChangeRevision, setCreatingChangeRevision] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [linkedTaskDocCounts, setLinkedTaskDocCounts] = useState<Record<string, number>>({});
    const [selectedEmailFolderId, setSelectedEmailFolderId] = useState<string>('all');
    const [selectedEmailConversationId, setSelectedEmailConversationId] = useState<string | null>(null);
    const [showEmailLinkPicker, setShowEmailLinkPicker] = useState<
        | { mode: 'target'; targetType: 'task' | 'note'; targetId: string }
        | { mode: 'conversation'; targetType: 'task' | 'note'; conversationId: string }
        | null
    >(null);
    const [showOutlookSelector, setShowOutlookSelector] = useState(false);

    // Document links live in IndexedDB rather than in the opportunity payload. Keep
    // a light count cache so task cards can show an expander only when it has content.
    useEffect(() => {
        let cancelled = false;
        Promise.all((localOpp.tasks || []).map(async task => {
            try {
                const docs = await listLinkedForTask(opportunity.id, task.id);
                return [task.id, docs.length] as const;
            } catch {
                return [task.id, 0] as const;
            }
        })).then(entries => {
            if (!cancelled) setLinkedTaskDocCounts(Object.fromEntries(entries));
        });
        return () => { cancelled = true; };
    }, [opportunity.id, localOpp.tasks.length, refreshKey]);

    // Commercial Quick References state
    const [commercialRootPath, setCommercialRootPath] = useState<string>('');
    const [showQuickRefFilePicker, setShowQuickRefFilePicker] = useState(false);
    const [addLinkRefForm, setAddLinkRefForm] = useState<{ name: string; url: string } | null>(null);
    const [editingQuickRefId, setEditingQuickRefId] = useState<string | null>(null);

    const [showNotePickerForTask, setShowNotePickerForTask] = useState<string | null>(null);
    const [noteSearch, setNoteSearch] = useState('');
    const [selectedNotesToLink, setSelectedNotesToLink] = useState<string[]>([]);

    const [splitViewNoteId, setSplitViewNoteId] = useState<string | null>(null);
    const [taskSort, setTaskSort] = useState<'none' | 'dueDate' | 'order'>('order');
    const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
    const [expandedSubtaskIds, setExpandedSubtaskIds] = useState<Set<string>>(new Set());
    const [assignPopoverTaskId, setAssignPopoverTaskId] = useState<string | null>(null);
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
    const [folderNavTarget, setFolderNavTarget] = useState<string | null>(null);
    const [currentFolderPath, setCurrentFolderPath] = useState<string[]>([]);
    const [selectedFolderEntryPath, setSelectedFolderEntryPath] = useState<string[] | null>(null);
    const [showLabelMenu, setShowLabelMenu] = useState(false);
    const [versionToRestore, setVersionToRestore] = useState<OpportunityVersion | null>(null);

    /**
     * Root folder path, resolved as soon as the expediente opens.
     *
     * Ctrl+Shift+E used to resolve it on every keypress, which meant an IndexedDB
     * round trip (and, on a cold store, a shared-DB read) before Explorer was even
     * asked to open — the delay the user felt. Resolving it once up front makes the
     * shortcut fire immediately, and the ref keeps the listener from being torn down
     * and re-registered every time the value changes.
     */
    const expedienteRootPathRef = useRef<string>('');
    useEffect(() => {
        let cancelled = false;
        expedienteRootPathRef.current = '';
        resolveEffectiveRootPath(opportunity.id, localOpp.revision)
            .then(resolved => { if (!cancelled) expedienteRootPathRef.current = resolved || ''; })
            .catch(() => { /* the shortcut falls back to resolving on demand */ });
        return () => { cancelled = true; };
    }, [opportunity.id, localOpp.revision, refreshKey]);

    // Where the shortcut should point, kept in a ref so the listener below can stay
    // registered for the lifetime of the expediente instead of being swapped out on
    // every navigation — re-registration during a keypress is why the shortcut
    // sometimes did nothing at all.
    const shortcutTargetRef = useRef<{ activeTab: string; currentFolderPath: string[]; selectedFolderEntryPath: string[] | null; isSubView: boolean }>({
        activeTab, currentFolderPath, selectedFolderEntryPath, isSubView: !!isSubView,
    });
    useEffect(() => {
        shortcutTargetRef.current = { activeTab, currentFolderPath, selectedFolderEntryPath, isSubView: !!isSubView };
    });

    // This component exists only while an expediente is open, which naturally scopes
    // the shortcut to expediente views. In Folder it follows the current selection or
    // directory; from every other section it opens the opportunity's root folder.
    useEffect(() => {
        const openExpedienteFolder = async (event: KeyboardEvent) => {
            if (!event.ctrlKey || !event.shiftKey || event.altKey) return;
            // `code` survives layouts and modifier combinations that rewrite `key`
            // (AltGr maps, non-Latin layouts), which is why the shortcut worked only
            // some of the time. `key` is still accepted so a remapped E also matches.
            if (event.code !== 'KeyE' && event.key.toLowerCase() !== 'e') return;
            const target = shortcutTargetRef.current;
            // A split-view expediente can remain mounted behind the full expediente
            // overlay. Only the visible/topmost expediente may consume the shortcut.
            if (target.isSubView && document.querySelector('[data-opportunity-detail-overlay="true"]')) return;
            event.preventDefault();
            event.stopPropagation();
            try {
                const rootPath = expedienteRootPathRef.current
                    || await resolveEffectiveRootPath(opportunity.id, localOppRef.current.revision);
                if (!rootPath) {
                    alert('This expediente does not have a saved folder path yet. Link its folder once from the Folder section.');
                    return;
                }
                expedienteRootPathRef.current = rootPath;
                const relativePath = target.activeTab === 'folder'
                    ? (target.selectedFolderEntryPath || target.currentFolderPath)
                    : [];
                await openInNativeApp(rootPath, relativePath);
            } catch (error: any) {
                alert(error?.message || 'Could not open the expediente folder.');
            }
        };
        window.addEventListener('keydown', openExpedienteFolder, true);
        return () => window.removeEventListener('keydown', openExpedienteFolder, true);
    }, [opportunity.id]);

    useEffect(() => {
        const closeCurrentLayer = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;

            const handled = () => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            };

            if (addLinkRefForm) { setAddLinkRefForm(null); handled(); return; }
            if (showDocPicker) { setShowDocPicker(null); handled(); return; }
            if (showEmailLinkPicker) { setShowEmailLinkPicker(null); handled(); return; }
            if (showOutlookSelector) { setShowOutlookSelector(false); handled(); return; }
            if (showQuickRefFilePicker) { setShowQuickRefFilePicker(false); handled(); return; }
            if (showNotePickerForTask) { setShowNotePickerForTask(null); handled(); return; }
            if (showLabelMenu) { setShowLabelMenu(false); handled(); return; }
            if (showVersionMenu) { setShowVersionMenu(false); handled(); return; }
            if (showMoreActionsMenu) { setShowMoreActionsMenu(false); handled(); return; }
            if (showFullCalendar) { setShowFullCalendar(false); handled(); return; }
            if (showAddAreaModal) { setShowAddAreaModal(false); handled(); return; }
            if (showAddSectionModal) { setShowAddSectionModal(false); setNewSectionName(''); handled(); return; }
            if (showCreateVersionModal) { setShowCreateVersionModal(false); setVersionToRestore(null); handled(); return; }
            if (showDiffModal) { setShowDiffModal(false); handled(); return; }
            if (showCopyTasksModal) { setShowCopyTasksModal(false); handled(); return; }
            if (showRevisionCarryoverModal) { setShowRevisionCarryoverModal(false); setRevisionCarryoverSource(null); handled(); return; }
            if (showSrImport) { setShowSrImport(false); handled(); return; }
            if (splitViewNoteId) { setSplitViewNoteId(null); handled(); return; }
            if (selectedTaskForEdit) {
                if (isSubView) onBack();
                else setSelectedTaskForEdit(null);
                handled();
                return;
            }
            if (viewingVersionId) { setViewingVersionId(null); handled(); return; }
            if (activeTab !== 'overview') { setActiveTabSafe('overview'); handled(); return; }

            onBack();
            handled();
        };

        document.addEventListener('keydown', closeCurrentLayer);
        return () => document.removeEventListener('keydown', closeCurrentLayer);
    }, [
        activeTab,
        addLinkRefForm,
        onBack,
        selectedTaskForEdit,
        showAddAreaModal,
        showAddSectionModal,
        showCopyTasksModal,
        showRevisionCarryoverModal,
        showCreateVersionModal,
        showDiffModal,
        showDocPicker,
        showEmailLinkPicker,
        showFullCalendar,
        showLabelMenu,
        showMoreActionsMenu,
        showNotePickerForTask,
        showOutlookSelector,
        showQuickRefFilePicker,
        showSrImport,
        showVersionMenu,
        isSubView,
        splitViewNoteId,
        viewingVersionId
    ]);

    useEffect(() => {
        // Only sync from props if ID changed (navigation) or versions changed (external update/restore)
        // This prevents overwriting local state while typing Title/ID due to parent re-renders.
        // OR if lastUpdated changed (syncing from other tabs or background timer)
        // LOCK: never replace localOpp while viewing a snapshot â€” it would discard snapshot data
        if (viewingVersionId) return;
        if (opportunity.id !== localOpp.id || (opportunity.versions?.length !== localOpp.versions?.length)) {
            setLocalOpp(opportunity);
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTo(0, 0);
        } else if (opportunity.lastUpdated !== localOpp.lastUpdated) {
            // Keep state in sync without scrolling to top
            setLocalOpp(opportunity);
        }
    }, [opportunity.id, opportunity.versions?.length, opportunity.lastUpdated, viewingVersionId]);

    // Guard ref to prevent KPI init from causing infinite loop:
    // kpi init -> onUpdate -> lastUpdated change -> sync effect -> kpi init again
    const kpiInitializedForOppRef = useRef<string | null>(null);

    useEffect(() => {
        // Lazy KPI Migration / Initialization â€” intentionally separated from the sync effect
        // to avoid the loop: setLocalOpp -> onUpdate -> lastUpdated -> re-trigger -> repeat
        if (activeTab !== 'kpi') return;

        // Only initialize once per opportunity
        if (kpiInitializedForOppRef.current === localOpp.id && localOpp.kpis?.areasInvolved) return;
        kpiInitializedForOppRef.current = localOpp.id;

        const currentOpp = localOpp;
        const baseTimeline = currentOpp.kpis?.timeline || { receivedAt: currentOpp.dates?.requested || getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null };
        const baseKpis: KPIs = {
            languageSkill: currentOpp.kpis?.languageSkill ?? 0,
            technicalUnderstanding: currentOpp.kpis?.technicalUnderstanding ?? 0,
            dealProbability: currentOpp.kpis?.dealProbability ?? 0,
            effortContribution: currentOpp.kpis?.effortContribution ?? 0,
            sold: currentOpp.kpis?.sold ?? null,
            proposalAmountUSD: currentOpp.kpis?.proposalAmountUSD ?? currentOpp.commercial?.cqaOfficialSellPrice ?? 0,
            timeline: baseTimeline,
            execution: currentOpp.kpis?.execution || { myWorkDays: 0, waitingOnOthersDays: 0 },
            areasInvolved: currentOpp.kpis?.areasInvolved || []
        };

        // Ensure Tendering area exists
        if (!baseKpis.areasInvolved.some(a => a.area === 'Tendering')) {
            baseKpis.areasInvolved.push({ id: crypto.randomUUID(), area: 'Tendering', daysSpent: 0, waitingDays: 0, calendar: {} });
        }

        // Only persist if something actually changed
        const kpisChanged = JSON.stringify(currentOpp.kpis) !== JSON.stringify(baseKpis);
        const updated = { ...currentOpp, kpis: baseKpis };
        setLocalOpp(updated);
        if (kpisChanged) {
            onUpdate(updated, currentOpp.id);
        }
    }, [activeTab, localOpp.id]);

    const lastProcessedDeepLink = useRef<string | null>(null);

    useEffect(() => {
        if (deepLink) {
            const deepLinkKey = `${deepLink.tab}-${deepLink.taskId || ''}-${deepLink.noteId || ''}-${deepLink.eventId || ''}-${deepLink._nonce ?? ''}`;
            if (lastProcessedDeepLink.current === deepLinkKey) return;
            lastProcessedDeepLink.current = deepLinkKey;

            if (deepLink.tab) setActiveTabSafe(deepLink.tab as any);

            if (deepLink.tab === 'notes' && deepLink.noteId) {
                setSelectedNoteIdSafe(deepLink.noteId);
            }

            if (deepLink.tab === 'tasks' && deepLink.taskId) {
                const task = localOpp.tasks.find(t => t.id === deepLink.taskId);
                if (deepLink.noteId) {
                    // Reminder linked to both a task and a note: open the same split
                    // view (task editor + linked note side by side) used elsewhere.
                    if (task) {
                        setSelectedTaskForEdit({ task });
                        setSplitViewNoteId(deepLink.noteId);
                    }
                } else if (isSubView) {
                    if (task && (!selectedTaskForEdit || selectedTaskForEdit.task.id !== task.id)) {
                        setSelectedTaskForEdit({ task });
                    }
                }
            }

            // Small delay to ensure tab content is rendered
            setTimeout(() => {
                let elementId = '';
                if (deepLink.tab === 'tasks' && deepLink.taskId) elementId = `task-${deepLink.taskId}`;
                else if (deepLink.tab === 'history' && deepLink.eventId) elementId = `history-entry-${deepLink.eventId}`;
                else if (deepLink.tab === 'notes' && deepLink.noteId) elementId = `note-item-${deepLink.noteId}`;

                if (elementId) {
                    const el = document.getElementById(elementId);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        el.classList.add('ring-2', 'ring-[#3DCD58]', 'ring-offset-4', 'z-10');
                        setTimeout(() => el.classList.remove('ring-2', 'ring-[#3DCD58]', 'ring-offset-4', 'z-10'), 3000);
                    }
                }
            }, 300);
        }
    }, [deepLink]); // Restricted dependencies: only trigger on deepLink change, not task changes

    const saveToParentTimeoutRef = useRef<number | null>(null);

    const handleFieldChange = (field: keyof Opportunity, value: any, immediate = false) => {
        if (viewingVersionId) return; // LOCK: No mutations in read-only snapshots

        // The revision can also be edited directly in the header. Preserve a legacy
        // (single-folder) link under the revision we are leaving before React switches
        // the tab to the new value. This makes the next revision start unlinked, just
        // like a freshly selected opportunity, until the user chooses a folder or a
        // template.
        if (
            field === 'revision' &&
            String(value || '').trim() !== String(localOpp.revision || '').trim() &&
            String(localOpp.revision || '').trim()
        ) {
            moveLegacyFolderLinkToRevision(localOpp.id, String(localOpp.revision).trim()).catch(() => {});
        }

        const autoFields: Partial<Opportunity> = {};
        if (field === 'statusLabel') {
            if (value === 'Canceled') {
                autoFields.detailedStatus = 'Canceled';
            } else if (['Submitted', 'Won', 'Lost'].includes(value)) {
                autoFields.detailedStatus = 'Completed';
            } else if (value === 'On Hold') {
                autoFields.detailedStatus = 'Paused';
            } else {
                autoFields.detailedStatus = 'Review';
            }
        }
        if (field === 'detailedStatus') {
            if (value === 'Canceled') {
                autoFields.statusLabel = 'Canceled';
            } else if (value === 'Completed') {
                autoFields.statusLabel = 'Submitted';
            } else if (value === 'Paused') {
                autoFields.statusLabel = 'On Hold';
            } else {
                autoFields.statusLabel = 'In Progress';
            }
        }
        if (field === 'dates' && value?.requested !== localOpp.dates?.requested) {
            autoFields.kpis = {
                ...localOpp.kpis,
                timeline: {
                    ...localOpp.kpis?.timeline,
                    receivedAt: value?.requested || '',
                },
            } as KPIs;
        }

        const nextStatusLabel = (field === 'statusLabel' ? value : autoFields.statusLabel || localOpp.statusLabel) as OpportunityStatus;
        if (localOpp.statusLabel !== nextStatusLabel) {
            const today = new Date().toISOString().split('T')[0];
            const currentKpis = localOpp.kpis || {};
            const currentTimeline = (currentKpis as any).timeline || {};
            const soldUpdate = nextStatusLabel === 'Won'
                ? { sold: true }
                : nextStatusLabel === 'Lost'
                    ? { sold: false }
                    : { sold: null };
            if (['Submitted', 'Won', 'Lost'].includes(nextStatusLabel)) {
                autoFields.kpis = { ...currentKpis, ...soldUpdate, timeline: { ...currentTimeline, deliveredAt: currentTimeline.deliveredAt || today } } as any;
            } else if (['Submitted', 'Won', 'Lost'].includes(localOpp.statusLabel)) {
                autoFields.kpis = { ...currentKpis, ...soldUpdate, timeline: { ...currentTimeline, deliveredAt: null } } as any;
            } else {
                autoFields.kpis = { ...currentKpis, ...soldUpdate } as any;
            }
        }

        const updated = { ...localOpp, [field]: value, ...autoFields, lastUpdated: new Date().toISOString() };
        // Performance: Debounce typing but keep structural changes snappy.
        // We bypass debounce if 'immediate' is true OR if it's a critical field.
        const isCritical = field === 'statusLabel' || field === 'priority' || field === 'detailedStatus';

        // PERF: for non-critical edits, mark the expediente-wide re-render as a
        // transition so that clicking/typing on unrelated controls (or the next
        // keystroke on a raw input like note title / question text) isn't blocked
        // waiting for the full OpportunityDetail tree to reconcile. Critical fields
        // still update synchronously so status chips update instantly.
        if (isCritical || immediate) {
            setLocalOpp(updated);
        } else {
            React.startTransition(() => setLocalOpp(updated));
        }

        if (isCritical || immediate) {
            if (saveToParentTimeoutRef.current) window.clearTimeout(saveToParentTimeoutRef.current);
            syncToParentNow(updated);
        } else {
            // 300ms keeps rapid typing debounced while still pushing changes to the parent
            // within half a second â€” important for commercial/CQA fields that users expect
            // to persist quickly after blur. The previous 1s delay combined with the inner
            // 500ms onUpdate wrapper (1.5s total) made quick-click-away sometimes lose data.
            if (saveToParentTimeoutRef.current) window.clearTimeout(saveToParentTimeoutRef.current);
            saveToParentTimeoutRef.current = window.setTimeout(() => {
                onUpdate(updated, opportunity.id);
            }, 300);
        }
    };

    // Ensure we save on unmount if dirty
    useEffect(() => {
        return () => {
            if (saveToParentTimeoutRef.current) {
                window.clearTimeout(saveToParentTimeoutRef.current);
            }
            // PERSISTENCE GUARANTEE: Force save on unmount, but NOT when viewing a snapshot
            // â€” saving snapshot content would overwrite the current live version.
            if (!viewingVersionIdRef.current) {
                onUpdate(localOppRef.current, opportunity.id);
            }
        };
    }, [opportunity.id]);

    // Helper to immediately sync (e.g. on blur of critical fields)
    const syncToParentNow = (updated: Opportunity) => {
        if (saveToParentTimeoutRef.current) window.clearTimeout(saveToParentTimeoutRef.current);
        onUpdate(updated, opportunity.id, true); // true = immediate
    };

    /**
     * Adds a note and selects it as one synchronous operation.  Creating the
     * note through handleFieldChange and immediately selecting it used two
     * independent React updates.  On a busy render the selection could win,
     * making the editor look up an id that was not in its local notes yet.
     * That is why templates and the SOW needed a second click.
     */
    const addAndSelectNote = (newNote: MeetingNote) => {
        if (viewingVersionId) return;

        // Preserve the note the user is leaving before replacing its selection.
        flushActiveNoteNow();

        // flushActiveNoteNow can synchronously update the ref, so use it as the
        // source of truth rather than the render's possibly older localOpp.
        const base = localOppRef.current;
        // Notes with a manual order are shown before legacy notes without one.
        // Give every new note position 1 in its own container and shift existing
        // ordered siblings down, so creation consistently places it at the top.
        const noteAtTop: MeetingNote = { ...newNote, order: 1 };
        const notes = base.notes.map(note =>
            note.folderId === noteAtTop.folderId && note.parentId === noteAtTop.parentId && note.order != null
                ? { ...note, order: note.order + 1 }
                : note
        );
        const updated: Opportunity = {
            ...base,
            notes: [noteAtTop, ...notes],
            lastUpdated: new Date().toISOString(),
        };

        // Keep both the state and its synchronous companion ref aligned.  The
        // selection effect can therefore always find the newly-created note on
        // the first click, even before React completes its next render.
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
        setSelectedNoteId(noteAtTop.id);
    };

    const normalizedQuickLinks = useMemo(() => normalizeQuickLinks(localOpp.links), [localOpp.links]);
    const commercialCqaUrl = normalizedQuickLinks.defaultUrls.cqaLink.trim();
    const sowPrefill = useMemo(() => {
        const customUrl = (...labels: string[]) => {
            const keys = new Set(labels.map(normalizeQuickLinkKey));
            return normalizedQuickLinks.customLinks.find(link => keys.has(normalizeQuickLinkKey(link.label)))?.url || '';
        };
        const srNumber = localOpp.srId?.trim() || '';
        const dsoUrl = customUrl('SharePoint / DSO', 'DSO');
        const rfqUrl = customUrl('RFQ / Specifications', 'RFQ', 'Specifications');
        const installedBaseUrl = customUrl('Installed base / prior opportunity', 'Installed-base / prior opportunity');
        const msaUrl = customUrl('MSA');
        const cfaUrl = customUrl('CFA');
        const bfoUrl = normalizedQuickLinks.defaultUrls.bfo || '';
        return {
            op_id: localOpp.id,
            op_name: localOpp.title,
            alias: localOpp.alias || '',
            sr_qlk: localOpp.qlk || '',
            customer: localOpp.customer,
            team_cse: localOpp.seller || '',
            site: localOpp.customerAddress || '',
            objective: localOpp.description || '',
            proposal_type: localOpp.quoteType === 'Firm' ? 'Firm' : localOpp.quoteType || '',
            // "Expected proposal delivery" in the SOW and Expected Date in the expediente are
            // one date. The SOW pushes its edits back through sync-opportunity; this is the
            // other half of that link, so a date changed in the header lands in the SOW too.
            proposal_delivery: localOpp.dates?.expected || '',
            flow_B001: localOpp.id,
            flow_B002: localOpp.alias || '',
            flow_B003: localOpp.customer,
            flow_B004: localOpp.dates?.expected || '',
            flow_B006: localOpp.seller || '',
            flow_B007: localOpp.customerAddress || '',
            flow_C006: srNumber ? 'Yes' : 'No',
            flow_C007: srNumber,
            flow_C012: String(localOpp.commercial?.cqaOfficialSellPrice ?? ''),
            flow_C013: String(localOpp.commercial?.cqaOfficialMargin ?? ''),
            flow_C014: localOpp.commercial?.discountsAndNotes || '',
            sr_link: normalizedQuickLinks.defaultUrls.srLink || '',
            link_bfo: bfoUrl,
            link_dso: dsoUrl,
            link_rfq: rfqUrl,
            link_installed_base: installedBaseUrl,
            msa_link: msaUrl,
            cfa_link: cfaUrl,
            quick_link_exists_link_bfo: bfoUrl ? 'true' : 'false',
            quick_link_exists_link_dso: dsoUrl ? 'true' : 'false',
            quick_link_exists_link_rfq: rfqUrl ? 'true' : 'false',
            quick_link_exists_link_installed_base: installedBaseUrl ? 'true' : 'false',
            quick_link_exists_msa_link: msaUrl ? 'true' : 'false',
            quick_link_exists_cfa_link: cfaUrl ? 'true' : 'false',
        };
    }, [localOpp.id, localOpp.title, localOpp.alias, localOpp.qlk, localOpp.customer, localOpp.seller, localOpp.customerAddress, localOpp.description, localOpp.quoteType, localOpp.dates?.expected, localOpp.srId, localOpp.commercial, normalizedQuickLinks]);

    // All default quick links â€” locked (SRLink, BFO, CQA) and unlocked (Folder, BA, GEET)
    // alike â€” render in the single manual order stored in quickLinksOrder. Any link not yet
    // present there (e.g. newly added to DEFAULT_QUICK_LINKS) is appended in its built-in order.
    const orderedDefaultLinks = useMemo(() => {
        const storedOrder = localOpp.quickLinksOrder || [];
        const allIds = DEFAULT_QUICK_LINKS.map(l => l.id) as readonly string[];
        const ids = [
            ...storedOrder.filter(id => allIds.includes(id)),
            ...allIds.filter(id => !storedOrder.includes(id))
        ];
        return ids.map(id => DEFAULT_QUICK_LINKS.find(l => l.id === id)!).filter(Boolean);
    }, [localOpp.quickLinksOrder]);

    // A default quick link the user hid (e.g. an empty locked SRLink/BFO/CQA) is
    // kept out of the overview list but its URL is never dropped â€” unhiding brings it back.
    const hiddenQuickLinkIds = useMemo(() => new Set(localOpp.hiddenQuickLinks || []), [localOpp.hiddenQuickLinks]);
    const visibleDefaultLinks = useMemo(() => orderedDefaultLinks.filter(l => !hiddenQuickLinkIds.has(l.id)), [orderedDefaultLinks, hiddenQuickLinkIds]);
    const hiddenDefaultLinks = useMemo(() => orderedDefaultLinks.filter(l => hiddenQuickLinkIds.has(l.id)), [orderedDefaultLinks, hiddenQuickLinkIds]);
    // Defaults and custom items share one display order.  Old records only contain
    // default ids in quickLinksOrder, so any missing custom ids are appended safely.
    const orderedQuickLinkIds = useMemo(() => {
        const allIds = [...DEFAULT_QUICK_LINKS.map(link => link.id), ...normalizedQuickLinks.customLinks.map(link => link.id)];
        const storedOrder = localOpp.quickLinksOrder || [];
        return [
            ...storedOrder.filter(id => allIds.includes(id)),
            ...allIds.filter(id => !storedOrder.includes(id))
        ];
    }, [localOpp.quickLinksOrder, normalizedQuickLinks.customLinks]);
    const quickLinkOrderIndex = useMemo(
        () => new Map(orderedQuickLinkIds.map((id, index) => [id, index])),
        [orderedQuickLinkIds]
    );
    const visibleQuickLinkIds = useMemo(
        () => orderedQuickLinkIds.filter(id => !hiddenQuickLinkIds.has(id)),
        [orderedQuickLinkIds, hiddenQuickLinkIds]
    );
    const hiddenCustomLinks = useMemo(
        () => normalizedQuickLinks.customLinks.filter(link => hiddenQuickLinkIds.has(link.id)),
        [normalizedQuickLinks.customLinks, hiddenQuickLinkIds]
    );
    const getQuickLinkLabel = useCallback(
        (link: { id: string; label: string }) => localOpp.quickLinkLabels?.[link.id]?.trim() || link.label,
        [localOpp.quickLinkLabels]
    );
    // Icon shown for a default quick link: locked ones are always the padlock; unlocked
    // ones use the user's override if set, else the built-in default (Folder â†’ folder icon).
    const getQuickLinkIcon = useCallback((link: { id: string; locked: boolean }): React.ComponentType<{ className?: string; title?: string }> => {
        if (link.locked) return Lock;
        const override = localOpp.quickLinkIcons?.[link.id];
        if (override && QUICK_LINK_ICON_MAP[override]) return QUICK_LINK_ICON_MAP[override];
        return link.id === 'folder' ? FolderOpen : LinkIcon;
    }, [localOpp.quickLinkIcons]);
    const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);

    // Move any link (default or custom) through the shared visible list. Hidden
    // items retain their position and are skipped while reordering.
    const moveQuickLink = (id: string, direction: -1 | 1) => {
        if (viewingVersionId) return;
        const vIdx = visibleQuickLinkIds.indexOf(id);
        const neighbor = visibleQuickLinkIds[vIdx + direction];
        if (vIdx === -1 || neighbor === undefined) return;
        const fullOrder = orderedQuickLinkIds;
        const from = fullOrder.indexOf(id);
        const to = fullOrder.indexOf(neighbor);
        const reordered = [...fullOrder];
        [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
        handleFieldChange('quickLinksOrder', reordered, true);
    };

    const updateQuickLinks = (defaultUrls: Record<DefaultQuickLinkId, string>, customLinks: QuickLinkItem[]) => {
        if (viewingVersionId) return;
        const updated = {
            ...localOpp,
            links: composeQuickLinks(defaultUrls, customLinks),
            lastUpdated: new Date().toISOString()
        };
        setLocalOpp(updated);

        if (saveToParentTimeoutRef.current) window.clearTimeout(saveToParentTimeoutRef.current);
        saveToParentTimeoutRef.current = window.setTimeout(() => {
            onUpdate(updated, opportunity.id);
        }, 300);
    };

    const setDefaultQuickLinkUrl = (id: DefaultQuickLinkId, url: string) => {
        updateQuickLinks({ ...normalizedQuickLinks.defaultUrls, [id]: url }, normalizedQuickLinks.customLinks);
    };

    // Rename an unlocked default link (Folder/BA/GEET). Storing the built-in label (or
    // blank) removes the override so it falls back to the default name.
    const setDefaultQuickLinkLabel = (id: DefaultQuickLinkId, label: string) => {
        if (viewingVersionId) return;
        const fallback = DEFAULT_QUICK_LINKS.find(l => l.id === id)?.label;
        const trimmed = label.trim();
        const next = { ...(localOpp.quickLinkLabels || {}) };
        if (trimmed && trimmed !== fallback) next[id] = trimmed;
        else delete next[id];
        handleFieldChange('quickLinkLabels', next, true);
    };

    const toggleQuickLinkHidden = (id: string) => {
        if (viewingVersionId) return;
        const current = localOpp.hiddenQuickLinks || [];
        const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
        handleFieldChange('hiddenQuickLinks', next, true);
    };

    // Set (or clear, with name === '') the icon override for an unlocked default link.
    const setDefaultQuickLinkIcon = (id: DefaultQuickLinkId, name: string) => {
        if (viewingVersionId) return;
        const next = { ...(localOpp.quickLinkIcons || {}) };
        if (name) next[id] = name;
        else delete next[id];
        handleFieldChange('quickLinkIcons', next, true);
        setIconPickerFor(null);
    };

    /**
     * Auto-fill from a bFO SR email: applies every parsed field in ONE batch
     * update (single setLocalOpp + immediate sync) so the expediente can't end
     * up half-filled if the user closes right after applying. Parsed values win
     * over placeholders; existing values are kept when the email had no data.
     */
    const applySrPrefill = (prefill: SrPrefill, decision: SrImportDecision = { kind: 'new' }) => {
        if (viewingVersionId) return;
        if (decision.kind === 'revision') {
            const target = (opportunities || []).find(candidate => candidate.id === decision.targetOppId);
            if (!target) return alert('The existing opportunity is no longer available. Please try again.');
            if ((target.versions?.length || 0) >= 10) return alert('Maximum revision limit (10) reached for this opportunity.');

            const targetLinks = normalizeQuickLinks(target.links);
            const previousRevision = target.revision || 'R1';
            const nextRevision = incrementRevision(previousRevision);
            const snapshot = JSON.parse(JSON.stringify(target));
            delete snapshot.versions;
            const targetSnapshot: OpportunityVersion = {
                id: crypto.randomUUID(), opportunityId: target.id, srId: target.srId || '',
                commitMessage: decision.commitMessage.trim(), tags: decision.tags.split(',').map(tag => tag.trim()).filter(Boolean),
                createdAt: new Date().toISOString(), createdBy: 'User', source: 'live', snapshot: snapshot as any
            };
            const standard = taskStandards.find(item => item.id === decision.taskStandardId) || (selectableStandards.length === 1 ? selectableStandards[0] : undefined);
            const today = getTodayStr();
            const importNote: MeetingNote = { id: crypto.randomUUID(), title: prefill.noteTitle, date: today, type: 'General', content: prefill.noteHtml, attendees: '' };
            const requestedDate = prefill.requestedDate || today;
            const initialDefaultUrls: Record<DefaultQuickLinkId, string> = {
                folder: '', ba: '', geet: '', srLink: prefill.srLink?.trim() || '', cqaLink: '', bfo: ''
            };
            const revised: Opportunity = {
                ...target, revision: nextRevision, srId: prefill.srId?.trim() || '', qlk: '', description: prefill.comments?.trim() || '',
                // Identity stays with the opportunity: a revision never renames the OP.
                title: target.title, alias: target.alias,
                customer: prefill.customer?.trim() || target.customer, seller: prefill.seller?.trim() || target.seller,
                quoteType: prefill.quoteType || target.quoteType, statusLabel: 'In Progress', detailedStatus: 'Working on it', stage: '1. Intake', priority: 'Medium',
                dates: { requested: requestedDate, expected: prefill.expectedDate || '', assigned: '' }, links: composeQuickLinks(initialDefaultUrls, []),
                presentation: resetPresentationData(), history: [{ id: crypto.randomUUID(), date: today, content: 'The SR is assigned to me and I start working on it.', createdAt: new Date().toISOString() }],
                notes: [importNote], emails: target.emails || createEmptyEmailsData(), kpis: {
                    ...resetKPIData(target.kpis), ...(prefill.proposalAmountUSD !== undefined && !isNaN(prefill.proposalAmountUSD) ? { proposalAmountUSD: prefill.proposalAmountUSD } : {}),
                    timeline: { ...resetKPIData(target.kpis).timeline, receivedAt: requestedDate }
                } as KPIs,
                commercial: prefill.proposalAmountUSD !== undefined && !isNaN(prefill.proposalAmountUSD) ? { ...resetCommercialData(), cqaOfficialSellPrice: prefill.proposalAmountUSD } : resetCommercialData(),
                folderLinked: false,
                tasks: standard ? instantiateTaskStandard(standard, '1. Intake') : (target.tasks || []).map(task => ({ ...task, status: 'Pending', dueDate: '', description: '', timeLogs: [], subtasks: (task.subtasks || []).map(subtask => ({ ...subtask, completed: false })) })),
                versions: [targetSnapshot, ...(target.versions || [])], lastUpdated: new Date().toISOString()
            };
            moveLegacyFolderLinkToRevision(target.id, previousRevision).catch(() => {});
            onUpdate(revised, target.id, true);
            setRevisionCarryoverSource({
                sourceLabel: `${previousRevision}${target.title ? ` - ${target.title}` : ''}`,
                notes: JSON.parse(JSON.stringify(target.notes || [])),
                defaultLinks: DEFAULT_QUICK_LINKS.map(link => ({ id: link.id, label: link.label, url: targetLinks.defaultUrls[link.id] || '' })).filter(link => !!link.url),
                customLinks: JSON.parse(JSON.stringify(targetLinks.customLinks)), targetOppId: target.id, initialDefaultUrls, deleteCurrentOppAfterClose: true
                , baseOpportunity: revised
            });
            setShowRevisionCarryoverModal(true);
            return;
        }
        const today = new Date().toISOString().split('T')[0];
        const importNote: MeetingNote = {
            id: crypto.randomUUID(),
            title: prefill.noteTitle,
            date: today,
            type: 'General',
            content: prefill.noteHtml,
            attendees: ''
        };
        const historyEntry: HistoryEntry = {
            id: crypto.randomUUID(),
            date: today,
            content: 'The SR is assigned to me and I start working on it.',
            createdAt: new Date().toISOString(),
        };
        const requestedDate = prefill.requestedDate || localOpp.dates.requested;
        const updated: Opportunity = {
            ...localOpp,
            id: normalizeOpportunityId(prefill.opId) || localOpp.id,
            title: prefill.title?.trim() || localOpp.title,
            alias: prefill.alias?.trim() || localOpp.alias,
            customer: prefill.customer?.trim() || localOpp.customer,
            seller: prefill.seller?.trim() || localOpp.seller,
            srId: prefill.srId?.trim() || localOpp.srId,
            quoteType: prefill.quoteType || localOpp.quoteType,
            description: prefill.comments?.trim() || localOpp.description,
            dates: {
                ...localOpp.dates,
                requested: requestedDate,
                expected: prefill.expectedDate || localOpp.dates.expected
            },
            // Amount lands in BOTH linked fields: KPI Proposal Amount and CQA Official Sell Price
            kpis: {
                ...localOpp.kpis,
                ...(prefill.proposalAmountUSD !== undefined && !isNaN(prefill.proposalAmountUSD)
                    ? { proposalAmountUSD: prefill.proposalAmountUSD }
                    : {}),
                timeline: { ...localOpp.kpis?.timeline, receivedAt: requestedDate },
            } as KPIs,
            commercial: prefill.proposalAmountUSD !== undefined && !isNaN(prefill.proposalAmountUSD)
                ? { ...localOpp.commercial, cqaOfficialSellPrice: prefill.proposalAmountUSD }
                : localOpp.commercial,
            links: prefill.srLink?.trim()
                ? composeQuickLinks({ ...normalizedQuickLinks.defaultUrls, srLink: prefill.srLink.trim() }, normalizedQuickLinks.customLinks)
                : localOpp.links,
            notes: [importNote, ...localOpp.notes],
            history: [...(localOpp.history || []), historyEntry],
            lastUpdated: new Date().toISOString()
        };
        setLocalOpp(updated);
        syncToParentNow(updated);
    };

    const addQuickLinkItem = (item: QuickLinkItem) => {
        updateQuickLinks(normalizedQuickLinks.defaultUrls, [...normalizedQuickLinks.customLinks, item]);
    };

    const upsertQuickLinkFromPrompt = (label: string, url: string) => {
        const defaultLink = findDefaultQuickLink(label);
        if (defaultLink) {
            setDefaultQuickLinkUrl(defaultLink.id, url);
            return;
        }
        const labelKey = normalizeQuickLinkKey(label);
        const equivalentLabelKeys = new Set([labelKey]);
        if (labelKey === 'dso') equivalentLabelKeys.add('sharepointdso');
        const existing = normalizedQuickLinks.customLinks.find(link => equivalentLabelKeys.has(normalizeQuickLinkKey(link.label)));
        if (existing) {
            updateQuickLinks(
                normalizedQuickLinks.defaultUrls,
                normalizedQuickLinks.customLinks.map(link => link.id === existing.id ? { ...link, label, url } : link)
            );
            return;
        }
        addQuickLinkItem({ id: crypto.randomUUID(), type: 'link', label, url });
    };

    const emailsData: OpportunityEmailsData = useMemo(() => ({
        ...createEmptyEmailsData(),
        ...(localOpp.emails || {}),
        folders: localOpp.emails?.folders || [],
        labels: localOpp.emails?.labels || [],
        conversations: localOpp.emails?.conversations || [],
        selectedOutlookFolderIds: localOpp.emails?.selectedOutlookFolderIds || []
    }), [localOpp.emails]);

    const emailConversations = useMemo(() => {
        const list = [...emailsData.conversations];
        return list.sort((a, b) => {
            const orderA = a.order ?? 999999;
            const orderB = b.order ?? 999999;
            if (orderA !== orderB) return orderA - orderB;
            return (b.lastReceivedAt || b.updatedAt || '').localeCompare(a.lastReceivedAt || a.updatedAt || '');
        });
    }, [emailsData.conversations]);

    const selectedEmailConversation = useMemo(
        () => emailConversations.find(c => c.id === selectedEmailConversationId) || emailConversations[0] || null,
        [emailConversations, selectedEmailConversationId]
    );

    const updateEmailsData = (next: OpportunityEmailsData) => {
        handleFieldChange('emails', next, true);
    };

    // --- Email composer (Outlook draft generator) ---
    const mergedEmailComposeSettings = useMemo(() => mergeEmailComposeSettings(emailComposeSettings), [emailComposeSettings]);
    const [emailComposeState, setEmailComposeState] = useState<{ open: boolean; templateId?: string; taskIds?: string[] }>({ open: false });
    const openEmailCompose = (templateId?: string, taskIds?: string[]) => setEmailComposeState({ open: true, templateId, taskIds });

    // The interactive tutorial fires this event when a new step activates so any
    // modal the user left open (task editor, email composer, revision dialogs…)
    // closes and the step's spotlight target is actually visible.
    useEffect(() => {
        const closeOverlays = () => {
            setSelectedTaskForEdit(null);
            setEmailComposeState({ open: false });
            setShowCreateVersionModal(false);
            setShowDiffModal(false);
            setShowCopyTasksModal(false);
            setShowRevisionCarryoverModal(false);
            setShowAddAreaModal(false);
            setShowAddSectionModal(false);
        };
        window.addEventListener('oos-tutorial-prepare', closeOverlays);
        return () => window.removeEventListener('oos-tutorial-prepare', closeOverlays);
    }, []);
    const emailKindForTask = (task: Task): GeneratedEmailKind => {
        if (task.reworkForTaskId) {
            return task.status === 'Done' || !!task.sentBackForApprovalAt ? 'approval_resubmission' : 'change_revision';
        }
        const hasResubmission = approvalEventsForTask(localOpp.history || [], task.id).some(entry => entry.outcome === 'resubmitted');
        const hasApproval = approvalEventsForTask(localOpp.history || [], task.id).some(entry => entry.outcome === 'approved');
        if (task.status === 'Approval' && hasResubmission) return 'approval_resubmission';
        if (task.status === 'Done' && hasApproval) return 'approval_confirmation';
        return 'task_assignment';
    };
    const emailLabelForTask = (task: Task) => {
        const kind = emailKindForTask(task);
        if (kind === 'change_revision') return 'Email Change Request';
        if (kind === 'approval_resubmission') return 'Email Resubmission';
        if (kind === 'approval_confirmation') return 'Email Approval';
        return 'Email';
    };
    /** Task ids already covered by a previously generated assignment email (shows the "Informed" badge). */
    const informedTaskIds = useMemo(() => {
        const ids = new Set<string>();
        for (const rec of emailsData.generatedEmails || []) {
            if (rec.kind === 'task_assignment') for (const id of rec.relatedTaskIds || []) ids.add(id);
        }
        return ids;
    }, [emailsData.generatedEmails]);

    /** "(Status Report) - OP-..." -> "Status Report" — the bit between the first parentheses of the subject. */
    const emailTopicFromSubject = (subject: string): string => subject.match(/\(([^)]*)\)/)?.[1]?.trim() || subject;

    /** "I sent an email to Luis / to Luis and Maria / to the team ..." for the History event. */
    const EMAIL_HISTORY_ACTION: Record<string, string> = {
        task_assignment: 'asking for help with a task',
        info_request: 'asking for information',
        price_approval: 'requesting an approval',
        proposal_approval: 'requesting an approval',
        reminder: 'following up',
        status_report: 'sharing the status',
        meeting_recap: 'with the meeting agreements',
        change_revision: 'requesting a change revision',
        approval_resubmission: 'resubmitting revised deliverables for approval',
        approval_confirmation: 'confirming the approval',
    };

    /** Saves the record in emails.generatedEmails AND logs a History event, in one combined update. */
    const handleEmailGenerated = (record: GeneratedEmailRecord) => {
        const names = record.toNames?.length ? record.toNames : record.to.map(e => e.split('@')[0]);
        const who = names.length >= 3 ? 'to the team'
            : names.length === 2 ? `to ${names[0]} and ${names[1]}`
            : `to ${names[0] || '—'}`;
        const assignedTaskNames = record.kind === 'task_assignment' || record.kind === 'change_revision' || record.kind === 'approval_resubmission' || record.kind === 'approval_confirmation'
            ? (record.relatedTaskIds || [])
                .map(taskId => localOpp.tasks?.find(task => task.id === taskId)?.title)
                .filter((title): title is string => !!title?.trim())
            : [];
        const assignedTaskLabel = assignedTaskNames.length === 1
            ? `: ${assignedTaskNames[0]}`
            : assignedTaskNames.length > 1
                ? `: ${assignedTaskNames.join(', ')}`
                : '';
        const action = `${EMAIL_HISTORY_ACTION[record.kind] || ''}${assignedTaskLabel}`;
        const historyEntry: HistoryEntry = {
            id: crypto.randomUUID(),
            date: getTodayStr(),
            content: `I sent an email ${who}${action ? ` ${action}` : ''} - ${emailTopicFromSubject(record.subject)}`,
            createdAt: new Date().toISOString(),
        };
        // A task is only actually "requested" from its responsible/approver once the
        // assignment email is truly sent — not the moment someone ticks "Track as
        // assignment" in the editor. So responsibleRequestedDate is stamped here, with
        // this email's send date, instead of at checkbox-toggle time.
        const relatedTaskIds = new Set(record.kind === 'task_assignment' || record.kind === 'change_revision' ? (record.relatedTaskIds || []) : []);
        const tasksWithRequestDate = relatedTaskIds.size
            ? (localOpp.tasks || []).map(t => relatedTaskIds.has(t.id) && !t.responsibleRequestedDate
                ? { ...t, responsibleRequestedDate: getTodayStr() }
                : t)
            : localOpp.tasks;
        const updated: Opportunity = {
            ...localOpp,
            tasks: tasksWithRequestDate,
            emails: { ...emailsData, generatedEmails: [...(emailsData.generatedEmails || []), record] },
            history: [...(localOpp.history || []), historyEntry],
            lastUpdated: new Date().toISOString(),
        };
        setLocalOpp(updated);
        syncToParentNow(updated);
    };

    const addEmailGhostFolder = () => {
        const name = prompt('Email folder name:');
        if (!name?.trim()) return;
        const folder: EmailGhostFolder = {
            id: crypto.randomUUID(),
            name: name.trim(),
            order: emailsData.folders.length + 1
        };
        updateEmailsData({ ...emailsData, folders: [...emailsData.folders, folder] });
    };

    const addEmailLabel = () => {
        const text = prompt('Email label name:');
        if (!text?.trim()) return;
        const color = prompt('Label color hex:', '#3DCD58') || '#3DCD58';
        const label: EmailLabel = { id: crypto.randomUUID(), text: text.trim(), color };
        updateEmailsData({ ...emailsData, labels: [...emailsData.labels, label] });
    };

    const addLocalEmailConversation = () => {
        const subject = prompt('Conversation subject:');
        if (!subject?.trim()) return;
        const summary = prompt('Summary:', '') || '';
        const now = new Date().toISOString();
        const conversation: EmailConversation = {
            id: crypto.randomUUID(),
            subject: subject.trim(),
            participants: [],
            summary,
            folderId: selectedEmailFolderId !== 'all' && selectedEmailFolderId !== 'unfiled' ? selectedEmailFolderId : undefined,
            labelIds: [],
            linkedTaskIds: [],
            linkedNoteIds: [],
            messages: [{
                id: crypto.randomUUID(),
                subject: subject.trim(),
                from: '',
                receivedAt: now,
                bodyPreview: summary,
            }],
            order: emailsData.conversations.length + 1,
            lastReceivedAt: now,
            createdAt: now,
            updatedAt: now
        };
        updateEmailsData({ ...emailsData, conversations: [...emailsData.conversations, conversation] });
        setSelectedEmailConversationId(conversation.id);
    };

    const updateEmailConversation = (id: string, updates: Partial<EmailConversation>) => {
        updateEmailsData({
            ...emailsData,
            conversations: emailsData.conversations.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)
        });
    };

    const moveEmailConversation = (id: string, direction: -1 | 1) => {
        const ordered = [...emailConversations];
        const idx = ordered.findIndex(c => c.id === id);
        const nextIdx = idx + direction;
        if (idx < 0 || nextIdx < 0 || nextIdx >= ordered.length) return;
        [ordered[idx], ordered[nextIdx]] = [ordered[nextIdx], ordered[idx]];
        const orderMap = new Map(ordered.map((c, index) => [c.id, index + 1]));
        updateEmailsData({
            ...emailsData,
            conversations: emailsData.conversations.map(c => ({ ...c, order: orderMap.get(c.id) || c.order }))
        });
    };

    const toggleEmailLabel = (conversationId: string, labelId: string) => {
        const conv = emailsData.conversations.find(c => c.id === conversationId);
        if (!conv) return;
        const current = conv.labelIds || [];
        updateEmailConversation(conversationId, {
            labelIds: current.includes(labelId) ? current.filter(id => id !== labelId) : [...current, labelId]
        });
    };

    const openEmailConversation = (conversation: EmailConversation) => {
        const link = conversation.webLink || conversation.messages.find(m => m.webLink)?.webLink;
        if (link) {
            window.open(link, '_blank', 'noopener,noreferrer');
            return;
        }
        alert('Outlook connector is ready in the UI, but no Outlook link is stored for this conversation yet.');
    };

    const linkEmailConversationToTarget = (conversationId: string, target: { type: 'task' | 'note'; id: string }) => {
        const conv = emailsData.conversations.find(c => c.id === conversationId);
        if (!conv) return;
        const linkedTaskIds = target.type === 'task'
            ? Array.from(new Set([...(conv.linkedTaskIds || []), target.id]))
            : conv.linkedTaskIds || [];
        const linkedNoteIds = target.type === 'note'
            ? Array.from(new Set([...(conv.linkedNoteIds || []), target.id]))
            : conv.linkedNoteIds || [];

        let nextTasks = localOpp.tasks;
        let nextNotes = localOpp.notes;
        if (target.type === 'task') {
            nextTasks = localOpp.tasks.map(t => t.id === target.id ? {
                ...t,
                linkedEmailConversationIds: Array.from(new Set([...(t.linkedEmailConversationIds || []), conversationId]))
            } : t);
        } else {
            const reference = `<p><strong>[Email]</strong> ${conv.subject}</p>`;
            nextNotes = localOpp.notes.map(n => n.id === target.id ? {
                ...n,
                linkedEmailConversationIds: Array.from(new Set([...(n.linkedEmailConversationIds || []), conversationId])),
                content: n.content?.includes(`[Email]</strong> ${conv.subject}`) ? n.content : `${n.content || ''}${reference}`
            } : n);
            if (selectedNoteId === target.id) {
                setActiveNoteHtml(prev => prev.includes(`[Email]</strong> ${conv.subject}`) ? prev : `${prev || ''}${reference}`);
            }
        }

        const nextEmails = {
            ...emailsData,
            conversations: emailsData.conversations.map(c => c.id === conversationId ? { ...c, linkedTaskIds, linkedNoteIds, updatedAt: new Date().toISOString() } : c)
        };
        const updated = { ...localOpp, tasks: nextTasks, notes: nextNotes, emails: nextEmails, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        onUpdate(updated, opportunity.id, true);
        setShowEmailLinkPicker(null);
    };

    const getLinkedEmailConversations = (target: { type: 'task' | 'note'; id: string }) =>
        emailConversations.filter(c => target.type === 'task'
            ? (c.linkedTaskIds || []).includes(target.id)
            : (c.linkedNoteIds || []).includes(target.id));

    const renderLinkedEmailsForTarget = (target: { type: 'task' | 'note'; id: string }) => {
        if (!emailIntegrationEnabled) return null;
        const linked = getLinkedEmailConversations(target);
        return (
            <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Linked Emails</h5>
                    {!isSnapshot && (
                        <button
                            className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline"
                            onClick={() => setShowEmailLinkPicker({ mode: 'target', targetType: target.type, targetId: target.id })}
                        >
                            + Link Email
                        </button>
                    )}
                </div>
                {linked.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {linked.map(conv => (
                            <button
                                key={conv.id}
                                onClick={() => {
                                    setActiveTabSafe('emails');
                                    setSelectedEmailConversationId(conv.id);
                                }}
                                className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:border-[#3DCD58] hover:text-[#3DCD58] transition-colors"
                            >
                                <Mail className="w-3.5 h-3.5 text-gray-400" />
                                <span className="max-w-[220px] truncate">{conv.subject}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-[10px] text-gray-300 italic">No linked emails.</p>
                )}
            </div>
        );
    };

    const updateOfficialSellPrice = (value: number) => {
        const newCommercial = { ...localOpp.commercial, cqaOfficialSellPrice: value };
        const newKpis = { ...localOpp.kpis, proposalAmountUSD: value };
        const updated = { ...localOpp, commercial: newCommercial, kpis: newKpis, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        
        // Use debounce for calculations to prevent UI freeze
        if (saveToParentTimeoutRef.current) window.clearTimeout(saveToParentTimeoutRef.current);
        saveToParentTimeoutRef.current = window.setTimeout(() => {
            onUpdate(updated, opportunity.id);
        }, 2000);
    };

    /** BFO Opportunity Lines URL. Typed by hand here, or filled by the bFO autofill. */
    const updateOppLinesLink = (value: string) => {
        const updated = { ...localOpp, commercial: { ...localOpp.commercial, oppLinesLink: value }, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        if (saveToParentTimeoutRef.current) window.clearTimeout(saveToParentTimeoutRef.current);
        saveToParentTimeoutRef.current = window.setTimeout(() => {
            onUpdate(updated, opportunity.id);
        }, 2000);
    };

    const updateKpiField = (path: string, value: any) => {
        let newKpis: KPIs;
        const baseKpis = localOpp.kpis as any;
        if (path.includes('.')) {
            const parts = path.split('.');
            newKpis = {
                ...baseKpis,
                [parts[0]]: {
                    ...baseKpis?.[parts[0]],
                    [parts[1]]: value
                }
            } as KPIs;
        } else {
            newKpis = { ...baseKpis, [path]: value } as KPIs;
        }

        let updatedOpp = { ...localOpp, kpis: newKpis, lastUpdated: new Date().toISOString() };

        if (path === 'sold') {
            const nextStatusLabel: OpportunityStatus | null = value === true
                ? 'Won'
                : value === false
                    ? 'Lost'
                    : null;

            if (nextStatusLabel) {
                const currentTimeline = newKpis.timeline || { receivedAt: getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null };
                updatedOpp = {
                    ...updatedOpp,
                    statusLabel: nextStatusLabel,
                    detailedStatus: 'Completed',
                    kpis: {
                        ...newKpis,
                        sold: value,
                        timeline: {
                            ...currentTimeline,
                            deliveredAt: currentTimeline.deliveredAt || getTodayStr(),
                        },
                    },
                };
            }
        }

        // Sync Logic for Proposal Amount -> CQA Official Sell
        if (path === 'proposalAmountUSD') {
            updatedOpp.commercial = {
                ...updatedOpp.commercial,
                cqaOfficialSellPrice: Number(value)
            };
        }
        if (path === 'timeline.receivedAt') {
            updatedOpp.dates = { ...localOpp.dates, requested: value || '' };
        }

        setLocalOpp(updatedOpp);
        onUpdate(updatedOpp, opportunity.id);
    };

    // PERF: Defer the heavy arrays so React treats list re-renders as low-priority,
    // interruptible work. When the user is typing or clicking rapidly (modal fields,
    // inline tasks, filter inputs), keystrokes get priority and the task/note list
    // rebuild is scheduled in the idle slice after the input commit â€” avoiding the
    // "browser freezes on every change" symptom on large opportunities.
    const deferredTasks = React.useDeferredValue(localOpp.tasks);
    const deferredNotes = React.useDeferredValue(localOpp.notes);

    const filteredNotes = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        // Hidden notes keep their data but are not part of the browsable list (see setNoteHidden).
        // Turning the SOW off in Settings hides the note itself, not just the "+ SOW" button —
        // every answer stays in the opportunity and the Scope quick view still reads it.
        const visible = deferredNotes.filter(n => !n.hidden && (sowSectionEnabled || n.format !== 'sow'));
        // Skip the expensive HTML strip + content scan when there's no search term.
        // On opportunities with 50+ heavy notes this was the dominant cost of the
        // Notes tab render and made tab navigation feel sticky.
        const filtered = term
            ? visible.filter(n => {
                if (n.title.toLowerCase().includes(term)) return true;
                const plainContent = n.content.replace(/<[^>]*>/g, '').toLowerCase();
                return plainContent.includes(term);
            })
            : visible;
        return [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [deferredNotes, searchTerm, sowSectionEnabled]);

    // A SOW switched off in Settings is not "hidden by the user", so it must not appear in the
    // Hidden strip either — the only way back is turning the setting on again.
    const hiddenNotes = useMemo(
        () => (localOpp.notes || []).filter(n => n.hidden && (sowSectionEnabled || n.format !== 'sow')),
        [localOpp.notes, sowSectionEnabled],
    );

    const filteredTasks = useMemo(() => deferredTasks.filter(t => {
        const matchesText = t.title.toLowerCase().includes(taskFilter.toLowerCase()) ||
            t.description.toLowerCase().includes(taskFilter.toLowerCase()) ||
            (t.externalAreas && t.externalAreas.some(area => area.toLowerCase().includes(taskFilter.toLowerCase())));
        const matchesStatus = taskStatusFilters.length === 0 || taskStatusFilters.includes(t.status);
        return matchesText && matchesStatus;
    }).sort((a, b) => {
        if (taskSort === 'order') {
            const ao = a.order ?? 999999;
            const bo = b.order ?? 999999;
            if (ao !== bo) return ao - bo;
            // Tie-break with dueDate
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return (a.title || '').localeCompare(b.title || '');
        }
        if (taskSort === 'dueDate') {
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return (a.order ?? 9999) - (b.order ?? 9999);
        }
        // Unified global compare as fallback (which also considers order at level 3)
        return compareTasksGlobal(
            { task: a, oppStatus: localOpp.statusLabel, oppPriorityRank: localOpp.priorityOrder },
            { task: b, oppStatus: localOpp.statusLabel, oppPriorityRank: localOpp.priorityOrder }
        );
    }), [deferredTasks, localOpp.statusLabel, localOpp.priorityOrder, taskFilter, taskStatusFilters, taskSort]);

    const commercialTotals = useMemo(() => {
        const sections = localOpp.commercial.customSections || [];
        const t = sections.reduce((acc, sec) => {
            const sp = sec.sellPrice || 0;
            const ds = sec.discount || 0;
            const netPrice = sp * (1 - (ds / 100));
            const cost = netPrice * (1 - ((sec.margin || 0) / 100));
            
            acc.cost += cost;
            acc.sellPrice += sp;
            acc.finalPrice += netPrice;
            return acc;
        }, { cost: 0, sellPrice: 0, finalPrice: 0 });
        
        const margin = t.finalPrice ? ((1 - (t.cost / t.finalPrice)) * 100).toFixed(1) : '0';
        return { ...t, margin };
    }, [localOpp.commercial.customSections]);

    const commercialRevisionHistory = useMemo(() => {
        return [...(localOpp.versions || [])]
            .filter(v => v.snapshot?.commercial)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map(v => ({
                id: v.id,
                revision: v.snapshot.revision || v.commitMessage || 'previous',
                createdAt: v.createdAt,
                sellPrice: v.snapshot.commercial?.cqaOfficialSellPrice || 0,
                margin: v.snapshot.commercial?.cqaOfficialMargin || 0,
                notes: v.snapshot.commercial?.discountsAndNotes || '',
            }));
    }, [localOpp.versions]);

    const commercialInternalRevisions = useMemo(() => {
        return [...(localOpp.commercial.internalRevisions || [])]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [localOpp.commercial.internalRevisions]);

    const getCommercialRevisionBase = () => {
        const match = (localOpp.revision || 'R0').match(/R?(\d+)/i);
        return `R${match ? Number(match[1]) : 0}`;
    };

    const getNextCommercialInternalRevision = () => {
        const base = getCommercialRevisionBase();
        const maxInternal = (localOpp.commercial.internalRevisions || [])
            .map(rev => {
                const match = rev.revision.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`, 'i'));
                return match ? Number(match[1]) : 0;
            })
            .reduce((max, value) => Math.max(max, value), 0);
        return `${base}.${maxInternal + 1}`;
    };

    const createCommercialInternalRevision = () => {
        if (isSnapshot) return;
        const revision = getNextCommercialInternalRevision();
        const note = window.prompt(`Commercial internal revision ${revision}\n\nWhat changed in prices/margins?`, '') || '';
        const nextRevision = {
            id: crypto.randomUUID(),
            revision,
            createdAt: new Date().toISOString(),
            createdBy: userName || 'User',
            note: note.trim(),
            customSections: JSON.parse(JSON.stringify(localOpp.commercial.customSections || [])),
            discountsAndNotes: localOpp.commercial.discountsAndNotes || '',
            cqaOfficialSellPrice: localOpp.commercial.cqaOfficialSellPrice || 0,
            cqaOfficialMargin: localOpp.commercial.cqaOfficialMargin || 0,
            calculatedFinalPrice: commercialTotals.finalPrice || 0,
            calculatedMargin: String(commercialTotals.margin || '0'),
        };
        handleFieldChange('commercial', {
            ...localOpp.commercial,
            internalRevisions: [nextRevision, ...(localOpp.commercial.internalRevisions || [])],
        }, true);
    };

    const totalMargin = commercialTotals.margin;

    useEffect(() => {
        let cancelled = false;
        // Resolves through the shared DB as well, so this works in a browser that never
        // linked the folder itself.
        resolveEffectiveRootPath(localOpp.id, localOpp.revision).then(p => { if (!cancelled) setCommercialRootPath(p || ''); }).catch(() => {});
        return () => { cancelled = true; };
    }, [localOpp.id, localOpp.revision]);

    const quickRefs = localOpp.commercial.quickRefs || [];

    const persistQuickRefs = (next: CommercialQuickRef[]) => {
        handleFieldChange('commercial', { ...localOpp.commercial, quickRefs: next });
    };

    const handleAddFileQuickRef = (fileKeys: string[]) => {
        if (fileKeys.length === 0) { setShowQuickRefFilePicker(false); return; }
        const newRefs: CommercialQuickRef[] = fileKeys.map(fk => {
            const segs = fk.split('/');
            const fileName = segs[segs.length - 1] || fk;
            return { id: crypto.randomUUID(), name: fileName, type: 'file', fileKey: fk };
        });
        persistQuickRefs([...(localOpp.commercial.quickRefs || []), ...newRefs]);
        setShowQuickRefFilePicker(false);
    };

    const handleSaveLinkQuickRef = () => {
        if (!addLinkRefForm) return;
        const name = addLinkRefForm.name.trim();
        let url = addLinkRefForm.url.trim();
        if (!name || !url) { alert('Name and URL are required.'); return; }
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        const ref: CommercialQuickRef = { id: crypto.randomUUID(), name, type: 'link', url };
        persistQuickRefs([...(localOpp.commercial.quickRefs || []), ref]);
        setAddLinkRefForm(null);
    };

    const handleRemoveQuickRef = (id: string) => {
        if (!window.confirm('Remove this reference?')) return;
        persistQuickRefs((localOpp.commercial.quickRefs || []).filter(r => r.id !== id));
    };

    const handleRenameQuickRef = (id: string, name: string) => {
        persistQuickRefs((localOpp.commercial.quickRefs || []).map(r => r.id === id ? { ...r, name } : r));
    };

    const handleOpenQuickRef = async (ref: CommercialQuickRef) => {
        if (ref.type === 'link' && ref.url) {
            window.open(ref.url, '_blank', 'noopener,noreferrer');
            return;
        }
        if (ref.type === 'file' && ref.fileKey) {
            if (!commercialRootPath) {
                alert('Set the opportunity folder base path in the Folder tab first.');
                return;
            }
            try {
                await openInNativeApp(commercialRootPath, ref.fileKey.split('/'));
            } catch (err: any) {
                alert(err?.message || 'Could not open the file.');
            }
        }
    };

    const addStakeholder = () => {
        const newPerson: Person = { id: crypto.randomUUID(), name: '', email: '', role: '', roles: [], roleContexts: {} };
        handleFieldChange('stakeholders', [...(localOpp.stakeholders || []), newPerson], true);
    };
    const selectableGlobalContacts = useMemo(() => {
        const unique = new Map<string, GlobalContact>();
        globalContacts.forEach(contact => {
            const email = contact.email.trim().toLowerCase();
            const name = contact.name.trim().toLowerCase();
            const identity = email ? `email:${email}` : `name:${name}`;
            const existing = unique.get(identity);
            const roles = [...(existing?.availableRoles || []), ...(contact.availableRoles || [])].reduce<string[]>((result, role) => {
                const cleanRole = role.trim();
                if (cleanRole && !result.some(item => item.localeCompare(cleanRole, undefined, { sensitivity: 'accent' }) === 0)) result.push(cleanRole);
                return result;
            }, []);
            unique.set(identity, existing ? { ...existing, availableRoles: roles } : { ...contact, availableRoles: roles });
        });
        return Array.from(unique.values());
    }, [globalContacts]);
    const addStakeholderFromDirectory = (directoryId: string) => {
        const contact = selectableGlobalContacts.find(c => c.id === directoryId);
        if (!contact || (localOpp.stakeholders || []).some(p => p.directoryContactId === directoryId || (!!p.email && p.email.toLowerCase() === contact.email.toLowerCase()))) return;
        const person: Person = { id: crypto.randomUUID(), directoryContactId: contact.id, name: contact.name, email: contact.email, roles: contact.availableRoles?.[0] ? [contact.availableRoles[0]] : [], roleContexts: {}, aliases: contact.aliases || [] };
        handleFieldChange('stakeholders', [...(localOpp.stakeholders || []), person], true);
    };
    const updateStakeholder = (id: string, field: keyof Person, value: any) => {
        const updated = (localOpp.stakeholders || []).map(p => p.id === id ? { ...p, [field]: value } : p);
        handleFieldChange('stakeholders', updated);
    };
    const saveStakeholderToDirectory = (person: Person) => {
        if (!person.name.trim()) return;
        const email = person.email.trim();
        const roles = person.roles?.length ? person.roles : (person.role ? [person.role] : []);
        // Functional updater: resolves "existing vs. new" against the freshest directory at
        // apply time, so saving several stakeholders in quick succession never clobbers a
        // previous save with a stale snapshot (the root cause of contacts "disappearing").
        onGlobalContactsChange?.(prev => {
            const existing = prev.find(c => email && c.email.toLowerCase() === email.toLowerCase());
            return existing
                ? prev.map(c => c.id === existing.id ? { ...c, name: person.name, email, availableRoles: Array.from(new Set([...(c.availableRoles || []), ...roles])), aliases: Array.from(new Set([...(c.aliases || []), ...(person.aliases || [])])) } : c)
                : [...prev, { id: crypto.randomUUID(), name: person.name, email, availableRoles: roles, aliases: person.aliases || [] }];
        });
    };
    const removeStakeholder = (id: string) => {
        handleFieldChange('stakeholders', (localOpp.stakeholders || []).filter(p => p.id !== id), true);
    };
    // Clean up duplicates created by the historical Seller/CSE sync issue. A
    // directory ID or email is authoritative; for blank-email legacy entries,
    // the normalized name is the best available identity.
    useEffect(() => {
        const seen = new Set<string>();
        const unique = (localOpp.stakeholders || []).filter(person => {
            const key = person.directoryContactId
                ? `directory:${person.directoryContactId}`
                : person.email.trim()
                    ? `email:${person.email.trim().toLowerCase()}`
                    : `name:${person.name.trim().toLowerCase()}`;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (unique.length !== (localOpp.stakeholders || []).length) handleFieldChange('stakeholders', unique, true);
        // This is intentionally per opportunity load: it repairs legacy data
        // once without interfering with normal editing in the table.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localOpp.id]);
    // Backfill legacy involved contacts that were saved before directory roles
    // were copied into the opportunity. Never replace an existing opportunity
    // role: users remain free to choose a different role for this specific OP.
    useEffect(() => {
        const current = localOppRef.current;
        let changed = false;
        const stakeholders = (current.stakeholders || []).map(person => {
            const hasOpportunityRole = (person.roles || []).length > 0 || !!person.role?.trim();
            if (hasOpportunityRole || !person.directoryContactId) return person;
            const directoryContact = globalContacts.find(contact => contact.id === person.directoryContactId);
            const defaultRole = directoryContact?.availableRoles?.[0];
            if (!defaultRole) return person;
            changed = true;
            return { ...person, roles: [defaultRole] };
        });
        if (changed) handleFieldChange('stakeholders', stakeholders, true);
        // Run when the opportunity or DB-backed directory changes, not when a
        // user edits this opportunity's role.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localOpp.id, globalContacts]);
    // Opens the native New Contact modal instead of chained window.prompt() dialogs.
    // Callers historically expected a synchronous id back, but since contact creation
    // is now async (waits for the modal), they all already discard the return value.
    /**
     * Opens the "new contact" modal. It cannot return the new person's id — the user still has to
     * fill the form — so callers that need to assign the person somewhere pass `onCreated`, which
     * runs with the resulting stakeholder id when the modal is submitted.
     */
    const createContactAndInvolve = (suggestedName = '', onCreated?: (personId: string) => void): undefined => {
        setNewContactModal({ name: suggestedName, email: '', area: '', onCreated });
        return undefined;
    };
    const submitNewContactModal = () => {
        if (!newContactModal) return;
        const name = newContactModal.name.trim();
        if (!name) return;
        const email = newContactModal.email.trim();
        const areaInput = newContactModal.area.trim();
        let role: string | undefined;
        if (areaInput) {
            const existingArea = trackedAreas.find(a => a.toLowerCase() === areaInput.toLowerCase());
            if (existingArea) {
                role = existingArea;
            } else {
                if (!window.confirm(`"${areaInput}" is not a tracked area yet. Create it and assign it to ${name}?`)) return;
                onTrackedAreasChange?.([...trackedAreas, areaInput]);
                role = areaInput;
            }
        }
        const existing = globalContacts.find(c => c.name.toLowerCase() === name.toLowerCase() || (!!email && c.email.toLowerCase() === email.toLowerCase()) || (c.aliases || []).some(a => a.toLowerCase() === name.toLowerCase()));
        // The stakeholder this submit ends up pointing at, so a picker that asked for the contact
        // can assign it. Without this the person was created and involved but never assigned.
        let resolvedPersonId: string | undefined;
        /**
         * `handleFieldChange` only schedules `setLocalOpp`, so `localOppRef` still holds the
         * pre-stakeholder opportunity until the next render. `onCreated` runs before that render
         * and writes through the ref, so publish the new list here or the stakeholder is dropped.
         */
        const involvePerson = (person: Person) => {
            const nextStakeholders = [...(localOpp.stakeholders || []), person];
            handleFieldChange('stakeholders', nextStakeholders, true);
            localOppRef.current = { ...localOppRef.current, stakeholders: nextStakeholders };
            resolvedPersonId = person.id;
        };

        if (existing) {
            // Match existing manual entries too. Previously a seller typed in the
            // SOW could create a second stakeholder because only directoryContactId
            // was checked.
            const involved = (localOpp.stakeholders || []).find(p =>
                p.directoryContactId === existing.id ||
                (!!email && !!p.email && p.email.toLowerCase() === email.toLowerCase()) ||
                p.name.trim().toLowerCase() === existing.name.trim().toLowerCase()
            );
            if (involved) {
                if (role && !(involved.roles || []).includes(role)) updateStakeholder(involved.id, 'roles', [...(involved.roles || []), role]);
                resolvedPersonId = involved.id;
            } else {
                involvePerson({ id: crypto.randomUUID(), directoryContactId: existing.id, name: existing.name, email: existing.email, roles: role ? [role] : [], roleContexts: {}, aliases: existing.aliases || [] });
            }
            if (role && !(existing.availableRoles || []).some(r => r.toLowerCase() === role!.toLowerCase())) {
                onGlobalContactsChange?.(prev => prev.map(c => c.id === existing.id ? { ...c, availableRoles: [...(c.availableRoles || []), role!] } : c));
            }
        } else {
            const contact: GlobalContact = { id: crypto.randomUUID(), name, email, availableRoles: role ? [role] : [] };
            onGlobalContactsChange?.(prev => [...prev, contact]);
            involvePerson({ id: crypto.randomUUID(), directoryContactId: contact.id, name, email, roles: role ? [role] : [], roleContexts: {} });
        }
        if (resolvedPersonId) newContactModal.onCreated?.(resolvedPersonId);
        setNewContactModal(null);
    };
    const createTrackedArea = () => {
        const area = (window.prompt('New tracked area / role:') || '').trim();
        if (!area) return;
        if (!trackedAreas.some(a => a.toLowerCase() === area.toLowerCase())) onTrackedAreasChange?.([...trackedAreas, area]);
    };
    // Opening the panel unmounts the note editor, so persist whatever is in it
    // first (same guarantee as switching notes).
    const renderTeamPanelButton = () => (
        <button
            type="button"
            onClick={() => { flushActiveNoteNow(); setTeamPanelOpen(true); }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${teamPanelOpen ? 'bg-[#3DCD58]/10 border-[#3DCD58]/30 ring-1 ring-[#3DCD58]/20 shadow-md' : 'bg-white border-gray-200 hover:border-gray-300'}`}
        >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#3DCD58]/10 text-[#3DCD58] text-[10px] font-black shrink-0">I</span>
            <div className="min-w-0 flex-1">
                <span className="font-bold text-xs text-gray-900 truncate block">Stakeholders</span>
                <span className="text-[10px] text-gray-400">{(localOpp.stakeholders || []).length} people</span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        </button>
    );

    const renderOpportunityTeamPanel = () => (
        <>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50 shrink-0">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Opportunity team</p>
                    <p className="font-black text-lg text-gray-800">Stakeholders</p>
                </div>
                <button type="button" onClick={() => setTeamPanelOpen(false)} className="p-2 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 shrink-0" title="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-gray-500">Fixed section for the opportunity. It cannot be deleted.</p>
                    <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={createTrackedArea} className="rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-700">+ Area</button>
                        <button type="button" onClick={() => createContactAndInvolve()} className="rounded bg-[#3DCD58] px-2 py-1 text-[10px] font-bold text-white">+ Contact</button>
                    </div>
                </div>
                {renderDirectorySearch()}
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full min-w-[1080px] text-left text-xs">
                        <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-wider text-gray-400">
                            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Areas / roles (RACI)</th><th className="px-3 py-2">Context</th><th className="px-3 py-2">Aliases</th><th className="w-10 px-2 py-2"></th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                    {(localOpp.stakeholders || []).map(person => {
                        const personRoles = person.roles || (person.role ? [person.role] : []);
                        const addNewAreaForPerson = (area: string) => {
                            if (!trackedAreas.some(a => a.toLowerCase() === area.toLowerCase())) onTrackedAreasChange?.([...trackedAreas, area]);
                            if (!personRoles.some(r => r.toLowerCase() === area.toLowerCase())) updateStakeholder(person.id, 'roles', [...personRoles, area]);
                            if (person.directoryContactId) {
                                const contactId = person.directoryContactId;
                                onGlobalContactsChange?.(prev => {
                                    const contact = prev.find(c => c.id === contactId);
                                    if (!contact || (contact.availableRoles || []).some(r => r.toLowerCase() === area.toLowerCase())) return prev;
                                    return prev.map(c => c.id === contactId ? { ...c, availableRoles: [...(c.availableRoles || []), area] } : c);
                                });
                            }
                        };
                        const setPersonRaci = (role: string, value: '' | 'R' | 'A' | 'C' | 'I') => {
                            const next = { ...(person.raci || {}) };
                            if (value) next[role] = value; else delete next[role];
                            updateStakeholder(person.id, 'raci', next);
                        };
                        return (
                            <tr key={person.id} className="align-top hover:bg-gray-50/70">
                                <td className="p-2"><input value={person.name} onChange={e => updateStakeholder(person.id, 'name', e.target.value)} placeholder="Name" className="w-full rounded border-gray-200 text-xs font-bold" /></td>
                                <td className="p-2"><input value={person.email} onChange={e => updateStakeholder(person.id, 'email', e.target.value)} placeholder="Email" type="email" className="w-full rounded border-gray-200 text-xs" /></td>
                                <td className="p-2 min-w-[260px]"><div className="flex flex-wrap items-center gap-1.5">{personRoles.map(role => (
                                    <span key={role} className="inline-flex items-center gap-1 rounded-full bg-[#3DCD58]/10 pl-2 pr-1 py-0.5 text-[10px] font-bold text-[#278a3b]">
                                        {role}
                                        <select
                                            value={person.raci?.[role] || ''}
                                            onChange={e => setPersonRaci(role, e.target.value as '' | 'R' | 'A' | 'C' | 'I')}
                                            title={person.raci?.[role] ? RACI_LABELS[person.raci[role]!] : 'Set RACI for this area'}
                                            className="rounded border-none bg-white/70 py-0 pl-1 pr-4 text-[9px] font-black text-[#1f6b30] focus:ring-1 focus:ring-[#3DCD58]"
                                        >
                                            <option value="">–</option>
                                            <option value="R">R</option>
                                            <option value="A">A</option>
                                            <option value="C">C</option>
                                            <option value="I">I</option>
                                        </select>
                                    </span>
                                ))}<MultiSelect options={trackedAreas} selected={personRoles} onChange={roles => updateStakeholder(person.id, 'roles', roles)} onCreate={addNewAreaForPerson} placeholder="Select areas..." compact /></div></td>
                                <td className="p-2 min-w-[170px]"><DelimitedListInput value={Object.entries(person.roleContexts || {}).map(([r,c]) => `${r}: ${c}`).join('; ')} onCommit={raw => updateStakeholder(person.id, 'roleContexts', Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => { const [role, ...rest] = v.split(':'); return [role.trim(), rest.join(':').trim()]; })))} placeholder="TSC: Foxboro" className="w-full rounded border-gray-200 text-[10px]" /></td>
                                <td className="p-2 min-w-[150px]"><DelimitedListInput value={(person.aliases || []).join('; ')} onCommit={raw => { const aliases = raw.split(';').map(v => v.trim()).filter(Boolean); updateStakeholder(person.id, 'aliases', aliases); if (person.directoryContactId) { const contactId = person.directoryContactId; onGlobalContactsChange?.(prev => prev.map(c => c.id === contactId ? { ...c, aliases } : c)); } }} placeholder="Aliases" className="w-full rounded border-gray-200 text-[10px]" /></td>
                                <td className="p-2 text-center"><button onClick={() => removeStakeholder(person.id)} className="p-1 text-gray-300 hover:text-red-500" title="Remove"><X className="h-3.5 w-3.5" /></button></td>
                            </tr>
                        );
                    })}
                    {(localOpp.stakeholders || []).length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs italic text-gray-400">No involved people yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <p className="mt-2 text-[10px] text-gray-400 italic">RACI: pick R (Responsible), A (Accountable), C (Consulted) or I (Informed) next to each area a person is tied to.</p>
            </div>
        </>
    );

    const addNote = (templateTitle?: string, content?: string, parentId?: string, folderId?: string) => {
        const newNote: MeetingNote = {
            id: crypto.randomUUID(),
            title: templateTitle ? `New ${templateTitle}` : (parentId ? 'Sub-note' : 'New Note'),
            date: getTodayStr(),
            type: 'General',
            attendees: '',
            content: content || '',
            inlineTasks: [],
            ...(parentId ? { parentId } : {}),
            ...(folderId ? { folderId } : {}),
        };
        addAndSelectNote(newNote);
    };

    const addGeneratedSowNote = (note: { title?: string; content?: string }) => {
        const newNote: MeetingNote = {
            id: crypto.randomUUID(),
            title: note.title || 'KOM - Information Capture',
            date: getTodayStr(),
            type: 'General',
            attendees: '',
            content: note.content || '',
            inlineTasks: [],
        };
        addAndSelectNote(newNote);
    };

    // Older opportunities predate the auto-created SOW note (only new ones get it â€” see App.tsx
    // createOpportunity). This lets the user add one manually to any existing opportunity.
    // An opportunity has exactly ONE SOW: clicking the button again reopens it (un-hiding it if
    // needed) instead of piling up copies that then compete for the Overview Scope button.
    const addSowNote = () => {
        const existing = pickPrimarySowNote(localOppRef.current.notes);
        if (existing) {
            if (existing.hidden) setNoteHidden(existing.id, false);
            setTeamPanelOpen(false);
            setSelectedNoteIdSafe(existing.id);
            return;
        }
        const newNote: MeetingNote = {
            id: crypto.randomUUID(),
            title: 'SOW - Scope of Work',
            date: getTodayStr(),
            type: 'Scope',
            attendees: '',
            content: '',
            format: 'sow',
        };
        addAndSelectNote(newNote);
    };

    const sowNote = useMemo(() => pickPrimarySowNote(localOpp.notes), [localOpp.notes]);
    const headerTaskProgress = useMemo(() => calculateWeightedTaskProgress(localOpp.tasks || []), [localOpp.tasks]);
    const resolvedScopeCatalog = useMemo(() => normalizeScopeCatalog(scopeCatalog) || DEFAULT_SCOPE_CATALOG, [scopeCatalog]);
    const headerScopeSelection = useMemo(
        () => readScopeSelection(parseSowFields(sowNote), resolvedScopeCatalog),
        [sowNote, resolvedScopeCatalog]
    );
    const headerSystems = useMemo(() => {
        const systemKeys = new Set(resolvedScopeCatalog.systems.map(option => scopeLabelKey(option.label)));
        const legacySystems = (localOpp.labels || []).filter(label => systemKeys.has(scopeLabelKey(label.text))).map(label => label.text);
        return Array.from(new Map([...headerScopeSelection.systems, ...legacySystems].filter(Boolean).map(label => [scopeLabelKey(label), label])).values());
    }, [headerScopeSelection.systems, localOpp.labels, resolvedScopeCatalog]);
    const headerScopeSelections = useMemo(() => {
        const subsystems = headerSystems.flatMap(label => {
            const option = resolvedScopeCatalog.systems.find(item => scopeLabelKey(item.label) === scopeLabelKey(label));
            return option?.children?.length ? (headerScopeSelection.modules[scopeModuleKey('systems', option)] || []) : [];
        });
        const quickNoteDetails = headerScopeSelection.quickNotes.flatMap(label => {
            const option = resolvedScopeCatalog.quickNotes.find(item => item.label === label);
            return option?.children?.length ? (headerScopeSelection.modules[scopeModuleKey('quickNotes', option)] || []) : [];
        });
        const extras = [
            ...headerScopeSelection.extras,
            ...(localOpp.labels || []).filter(label => !catalogContainsLabel(resolvedScopeCatalog, label.text)).map(label => label.text),
        ];
        return {
            scope: headerScopeSelection.scope,
            systems: headerSystems,
            subsystems: Array.from(new Map(subsystems.filter(Boolean).map(label => [scopeLabelKey(label), label])).values()),
            notes: Array.from(new Map([...headerScopeSelection.quickNotes, ...quickNoteDetails, ...extras]
                .filter(Boolean).map(label => [scopeLabelKey(label), label])).values()),
        };
    }, [headerScopeSelection, headerSystems, localOpp.labels, resolvedScopeCatalog]);

    /**
     * "The Scope is filled" = the two questions that define the work are answered (what kind of
     * proposal, and on which system). Quick notes are colour, not a completion signal.
     */
    const isScopeFilled = headerScopeSelections.scope.length > 0 && headerScopeSelections.systems.length > 0;
    /** Changes whenever the Scope answers change, so a task asks again only after a real edit. */
    const scopeSignature = useMemo(
        () => [headerScopeSelections.scope.join('|'), headerScopeSelections.systems.join('|'), headerScopeSelections.subsystems.join('|'), headerScopeSelections.notes.join('|')].join('§'),
        [headerScopeSelections]
    );


    /**
     * Systems the Scope currently selects, top-level only. Sub-modules are deliberately excluded:
     * the per-system subtasks track "which system are we scoping/costing", not its internals.
     */
    const scopeSystems = headerScopeSelection.systems;
    const scopeSystemsKey = scopeSystems.join('§');

    /**
     * Reconciles the subtasks of every task flagged `subtasksPerSystem` with the Scope systems.
     *
     * Rules: a newly selected system adds a subtask; a system that comes back clears its
     * `outOfScope` mark; a deselected system marks its subtask `outOfScope` instead of deleting it,
     * so work already recorded is never lost to a stray click. Subtasks the user wrote by hand
     * (no `systemKey`) are never touched. Writes only when something actually changed, so this
     * cannot feed itself through the `localOpp` dependency.
     */
    useEffect(() => {
        if (viewingVersionId || isSnapshot) return;
        const selected = scopeSystems;
        let changed = false;
        const nextTasks = localOpp.tasks.map(task => {
            if (!task.subtasksPerSystem) return task;
            const existing = task.subtasks || [];
            let taskChanged = false;
            const reconciled = existing.map(sub => {
                if (!sub.systemKey) return sub;
                const stillSelected = selected.some(system => system === sub.systemKey);
                const hidesLegacySystemName = !sub.title || sub.title === sub.systemKey;
                const normalized = hidesLegacySystemName ? { ...sub, title: 'Scope item' } : sub;
                if (hidesLegacySystemName) taskChanged = true;
                if (stillSelected && normalized.outOfScope) { taskChanged = true; const { outOfScope, ...rest } = normalized; return rest; }
                if (!stillSelected && !normalized.outOfScope) { taskChanged = true; return { ...normalized, outOfScope: true }; }
                return normalized;
            });
            selected.forEach(system => {
                if (reconciled.some(sub => sub.systemKey === system)) return;
                reconciled.push({ id: crypto.randomUUID(), title: 'Scope item', completed: false, systemKey: system });
                taskChanged = true;
            });
            if (!taskChanged) return task;
            changed = true;
            return { ...task, subtasks: reconciled };
        });
        if (!changed) return;
        const updated = { ...localOpp, tasks: nextTasks, lastUpdated: new Date().toISOString() };
        localOppRef.current = updated;
        setLocalOpp(updated);
        onUpdate(updated);
    }, [scopeSystemsKey, localOpp.tasks, viewingVersionId, isSnapshot]);

    /**
     * Subtasks that still count towards finishing a task. A subtask whose system left the Scope is
     * excluded, so a leftover from a deselected system cannot keep the task open forever.
     */
    const countableSubtasks = (subtasks: Subtask[] = []) => subtasks.filter(sub => !sub.outOfScope);

    const systemOptions = useMemo(() => {
        const configured = (scopeCatalog?.systems || []).map(option => option.label);
        return Array.from(new Set([...configured, ...(globalLabels || []).map(label => label.text), ...headerSystems]));
    }, [scopeCatalog, globalLabels, headerSystems]);
    const saveSowContent = useCallback((noteId: string, json: string) => {
        if (viewingVersionIdRef.current) return;
        const current = localOppRef.current;
        const updated: Opportunity = {
            ...current,
            notes: current.notes.map(note => note.id === noteId ? { ...note, content: json } : note),
            lastUpdated: new Date().toISOString(),
        };
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
    }, [opportunity.id]);

    const syncSowOpportunityFields = useCallback((fields: Record<string, unknown>) => {
        if (viewingVersionIdRef.current) return;
        // A SOW edit emits both `save` and `sync-opportunity`. Always merge the
        // expediente fields into the latest ref so the sync message cannot put
        // back an older `notes` array and erase the answer saved just before it.
        const current = localOppRef.current;
        const proposalType = String(fields.proposal_type ?? '');
        const quoteType = proposalType
            ? (proposalType.includes('Budgetary') ? 'Budgetary' : proposalType.includes('Firm') ? 'Firm' : proposalType)
            : current.quoteType;
        const incomingQlk = String(fields.sr_qlk ?? '').trim();
        const safeQlk = !incomingQlk || incomingQlk === current.srId || /^SR[-\s]/i.test(incomingQlk)
            ? current.qlk
            : incomingQlk;
        const updated: Opportunity = {
            ...current,
            title: String(fields.op_name ?? current.title),
            alias: String(fields.alias ?? current.alias ?? ''),
            qlk: safeQlk,
            customer: String(fields.customer ?? current.customer),
            seller: String(fields.team_cse ?? current.seller ?? ''),
            customerAddress: String(fields.site ?? current.customerAddress ?? ''),
            description: String(fields.objective ?? current.description ?? ''),
            quoteType,
            dates: { ...current.dates, expected: String(fields.proposal_delivery ?? current.dates?.expected ?? '') },
            commercial: {
                ...current.commercial,
                cqaOfficialSellPrice: Number(fields.commercialSell ?? current.commercial?.cqaOfficialSellPrice ?? 0),
                cqaOfficialMargin: Number(fields.commercialMargin ?? current.commercial?.cqaOfficialMargin ?? 0),
                discountsAndNotes: String(fields.commercialNotes ?? current.commercial?.discountsAndNotes ?? ''),
            },
            lastUpdated: new Date().toISOString(),
        };
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
    }, [opportunity.id]);

    const addSowLinkToOverview = useCallback(({ label, url }: { label: string; url: string }) => {
        if (!url || !window.confirm(`Add "${label}" to Overview Quick Links?`)) return;
        upsertQuickLinkFromPrompt(label, url);
    }, [localOpp.links]);

    const openSowTask = useCallback((taskId: string) => {
        const task = localOppRef.current.tasks.find(candidate => candidate.id === taskId);
        if (!task) return;
        setActiveTabSafe('tasks');
        setSelectedTaskForEdit({ task });
    }, []);

    const updateSowTaskRaci = useCallback((patch: { taskId: string; responsibleTeamMemberIds: string[]; approverTeamMemberIds: string[]; informedTeamMemberIds: string[] }) => {
        if (viewingVersionIdRef.current) return;
        const current = localOppRef.current;
        let updatedTask: Task | undefined;
        const responsibleNames = patch.responsibleTeamMemberIds
            .map(id => current.stakeholders?.find(person => person.id === id)?.name)
            .filter(Boolean)
            .join(', ');
        const tasks = current.tasks.map(task => {
            if (task.id !== patch.taskId) return task;
            updatedTask = syncAssignmentSubtasks({
                ...task,
                responsibleTeamMemberIds: patch.responsibleTeamMemberIds,
                approverTeamMemberIds: patch.approverTeamMemberIds,
                informedTeamMemberIds: patch.informedTeamMemberIds,
                responsible: responsibleNames,
                owner: patch.responsibleTeamMemberIds.length ? 'External Area' : task.owner,
                isAssignment: patch.responsibleTeamMemberIds.length > 0 || patch.approverTeamMemberIds.length > 0,
                responsibleRequestedDate: patch.responsibleTeamMemberIds.length ? (task.responsibleRequestedDate || getTodayStr()) : '',
            });
            return updatedTask;
        });
        let updated = { ...current, tasks, lastUpdated: new Date().toISOString() };
        if (updatedTask) updated = syncAssignmentKpi(updated, updatedTask);
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
    }, [opportunity.id]);

    const convertSowTaskToAssignment = useCallback((taskId: string) => {
        if (viewingVersionIdRef.current) return;
        const current = localOppRef.current;
        let updatedTask: Task | undefined;
        const tasks = current.tasks.map(task => {
            if (task.id !== taskId) return task;
            updatedTask = syncAssignmentSubtasks({
                ...task,
                isAssignment: true,
                owner: 'External Area',
                responsibleRequestedDate: task.responsibleRequestedDate || getTodayStr(),
            });
            return updatedTask;
        });
        let updated = { ...current, tasks, lastUpdated: new Date().toISOString() };
        if (updatedTask) updated = syncAssignmentKpi(updated, updatedTask);
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
    }, [opportunity.id]);

    const createSowTask = useCallback((draft: { title: string; description: string; priority: Task['priority']; dueDate: string; responsibleRequestedDate: string; responsibleDueDate: string; responsibleTeamMemberIds: string[]; approverTeamMemberIds: string[]; informedTeamMemberIds: string[] }) => {
        if (viewingVersionIdRef.current) return;
        const current = localOppRef.current;
        const orders = current.tasks.map(task => task.order || 0).filter(Boolean);
        const responsibleNames = draft.responsibleTeamMemberIds
            .map(id => current.stakeholders?.find(person => person.id === id)?.name)
            .filter(Boolean)
            .join(', ');
        const task = syncAssignmentSubtasks({
            id: crypto.randomUUID(),
            title: draft.title.trim() || 'New Task',
            description: draft.description || '',
            status: 'Pending',
            priority: draft.priority || 'Medium',
            owner: draft.responsibleTeamMemberIds.length ? 'External Area' : 'Me',
            externalAreas: [],
            responsible: responsibleNames,
            responsibleTeamMemberIds: draft.responsibleTeamMemberIds,
            approverTeamMemberIds: draft.approverTeamMemberIds,
            informedTeamMemberIds: draft.informedTeamMemberIds,
            isAssignment: draft.responsibleTeamMemberIds.length > 0 || draft.approverTeamMemberIds.length > 0,
            dueDate: draft.dueDate || '',
            responsibleRequestedDate: draft.responsibleRequestedDate || getTodayStr(),
            responsibleDueDate: draft.responsibleDueDate || draft.dueDate || '',
            stageContext: current.stage,
            subtasks: [],
            linkedNoteIds: [],
            order: orders.length ? Math.max(...orders) + 1 : 1,
            dependsOnTaskIds: [],
            blockDoneUntilDependenciesDone: false,
        });
        let updated = { ...current, tasks: [...current.tasks, task], lastUpdated: new Date().toISOString() };
        updated = syncAssignmentKpi(updated, task);
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
    }, [opportunity.id]);

    const createSowStakeholder = useCallback(({ name, email, role }: { name: string; email: string; role: string }) => {
        if (viewingVersionIdRef.current) return;
        const cleanName = name.trim();
        const cleanEmail = email.trim();
        const cleanRole = role.trim();
        if (!cleanName) return;
        const current = localOppRef.current;
        const directoryMatch = globalContacts.find(contact =>
            contact.name.trim().toLowerCase() === cleanName.toLowerCase()
            || (!!cleanEmail && contact.email.trim().toLowerCase() === cleanEmail.toLowerCase())
        );
        const directoryId = directoryMatch?.id || crypto.randomUUID();
        const existing = (current.stakeholders || []).find(person =>
            person.name.trim().toLowerCase() === cleanName.toLowerCase()
            || (!!cleanEmail && person.email.trim().toLowerCase() === cleanEmail.toLowerCase())
        );
        const roles = Array.from(new Set([...(existing?.roles || []), ...(cleanRole ? [cleanRole] : [])]));
        const person: Person = existing
            ? { ...existing, name: cleanName, email: cleanEmail || existing.email, directoryContactId: existing.directoryContactId || directoryId, roles }
            : { id: crypto.randomUUID(), directoryContactId: directoryId, name: cleanName, email: cleanEmail, roles, roleContexts: {} };
        const stakeholders = existing
            ? (current.stakeholders || []).map(candidate => candidate.id === existing.id ? person : candidate)
            : [...(current.stakeholders || []), person];
        const updated = { ...current, stakeholders, lastUpdated: new Date().toISOString() };
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
        onGlobalContactsChange?.(contacts => {
            const match = contacts.find(contact => contact.id === directoryId || contact.name.trim().toLowerCase() === cleanName.toLowerCase() || (!!cleanEmail && contact.email.trim().toLowerCase() === cleanEmail.toLowerCase()));
            if (match) return contacts.map(contact => contact.id === match.id ? { ...contact, name: cleanName, email: cleanEmail || contact.email, availableRoles: Array.from(new Set([...(contact.availableRoles || []), ...(cleanRole ? [cleanRole] : [])])) } : contact);
            return [...contacts, { id: directoryId, name: cleanName, email: cleanEmail, availableRoles: cleanRole ? [cleanRole] : [] }];
        });
        if (cleanRole && !trackedAreas.some(area => area.toLowerCase() === cleanRole.toLowerCase())) onTrackedAreasChange?.([...trackedAreas, cleanRole]);
    }, [globalContacts, trackedAreas, onGlobalContactsChange, onTrackedAreasChange, opportunity.id]);

    // Patches fields inside the SOW note's serialized JSON (used by the Overview
    // SCOPE quick-view modal). Also refreshes the SowFormEmbed localStorage backup
    // so a stale backup can never resurrect pre-patch values.
    const saveScopeFields = (patch: Record<string, unknown>) => {
        if (isSnapshot) return;
        const current = localOppRef.current;
        // Must resolve the SOW exactly like the `sowNote` memo the modal was rendered from,
        // otherwise Scope edits land on a different note than the one it is showing.
        const latestSowNote = pickPrimarySowNote(current.notes);
        if (!latestSowNote) return;
        let parsed: any = null;
        try { parsed = latestSowNote.content ? JSON.parse(latestSowNote.content) : null; } catch { parsed = null; }
        const base = parsed && typeof parsed === 'object' ? parsed : { version: 3, fields: {}, tables: {} };
        const next = { ...base, fields: { ...(base.fields || {}), ...patch }, savedAt: new Date().toISOString() };
        const serialized = JSON.stringify(next);
        try { localStorage.setItem(sowBackupKey(current.id, latestSowNote.id), serialized); } catch { /* non-critical backup */ }
        // Scope is now the canonical replacement for the old card labels, but keep the legacy
        // field synchronized for older searches/exports and upgraded databases. Commit the SOW
        // and those compatibility labels as ONE opportunity update so navigation cannot persist
        // one half and lose the other.
        const savedSystems = Array.isArray(next.fields.sow_systems) ? next.fields.sow_systems.map(String) : [];
        const savedExtras = Array.isArray(next.fields.scope_extras) ? next.fields.scope_extras.map(String) : [];
        const compatibilityNames = Array.from(new Map([...savedSystems, ...savedExtras].filter(Boolean).map(name => [scopeLabelKey(name), name])).values());
        const oldByKey = new Map((current.labels || []).map(label => [scopeLabelKey(label.text), label]));
        const catalogOptions = [
            ...(scopeCatalog?.systems || []).flatMap(option => [option, ...(option.children || [])]),
            ...(scopeCatalog?.extras || []),
        ];
        const labels = compatibilityNames.map(text => {
            const existing = oldByKey.get(scopeLabelKey(text));
            const option = catalogOptions.find(candidate => scopeLabelKey(candidate.label) === scopeLabelKey(text));
            const role = (scopeCatalog?.extras || []).includes(option as any) ? 'extra' : (scopeCatalog?.systems || []).includes(option as any) ? 'systems' : 'submodule';
            return existing || { id: crypto.randomUUID(), text, color: scopeOptionColor(option, role) };
        });
        const updated: Opportunity = {
            ...current,
            labels,
            notes: current.notes.map(note => note.id === latestSowNote.id ? { ...note, content: serialized } : note),
            lastUpdated: new Date().toISOString(),
        };
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
    };

    const updateHeaderSystems = (systems: string[]) => {
        if (isSnapshot) return;
        const current = localOppRef.current;
        const oldByText = new Map((current.labels || []).map(label => [label.text, label]));
        const labels = systems.map(text => oldByText.get(text) || { id: crypto.randomUUID(), text, color: '#334155' });
        const updated = { ...current, labels, lastUpdated: new Date().toISOString() };
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
        // When an SOW exists this makes the header, Scope quick view and SOW one answer.
        // Without an SOW the legacy labels field safely retains the selection until one is created.
        saveScopeFields({ sow_systems: systems, flow_T001: systems });
    };

    const deleteNote = (noteId: string) => {
        // The SOW is the opportunity's scope record, not just a note: the Scope quick view, the
        // expediente header and the manager report all read from it, and it is the one note whose
        // answers cannot be retyped from memory. Deleting it removes it from the list only —
        // every answer stays in the opportunity and comes back from the "Hidden" strip.
        const note = localOppRef.current.notes.find(candidate => candidate.id === noteId);
        if (note?.format === 'sow') {
            if (!window.confirm('Remove the SOW from the notes list?\n\nEvery answer is kept. You can bring it back from the "Hidden" strip under the list.')) return;
            setNoteHidden(noteId, true);
            return;
        }
        if (!window.confirm("Are you sure you want to delete this note and all its sub-notes?")) return;
        const idsToDelete = new Set<string>([noteId]);
        let changed = true;
        while (changed) {
            changed = false;
            localOpp.notes.forEach(n => { if (n.parentId && idsToDelete.has(n.parentId) && !idsToDelete.has(n.id)) { idsToDelete.add(n.id); changed = true; } });
        }
        const updatedNotes = localOpp.notes.filter(n => !idsToDelete.has(n.id));
        handleFieldChange('notes', updatedNotes, true);
        if (selectedNoteId && idsToDelete.has(selectedNoteId)) setSelectedNoteIdSafe(null);
    };

    /**
     * Hides a note from the Notes list without touching its content. Everything that reads the
     * note keeps working (the Overview Scope button still finds a hidden SOW), and it can be
     * brought back from the "Hidden" strip under the list.
     */
    const setNoteHidden = (noteId: string, hidden: boolean) => {
        const base = localOppRef.current;
        const updatedNotes = base.notes.map(note => note.id === noteId ? { ...note, hidden } : note);
        handleFieldChange('notes', updatedNotes, true);
        if (hidden && selectedNoteId === noteId) setSelectedNoteIdSafe(null);
    };

    const addFolder = (parentFolderId?: string) => {
        const name = prompt(parentFolderId ? 'Subfolder name:' : 'Folder name:');
        if (!name?.trim()) return;
        const folder: NoteFolder = { id: crypto.randomUUID(), name: name.trim(), ...(parentFolderId ? { parentFolderId } : {}) };
        const folders = [...(localOpp.notesFolders || []), folder];
        handleFieldChange('notesFolders', folders, true);
    };

    const deleteFolder = (folderId: string) => {
        if (!window.confirm("Delete this folder and its subfolders? Notes inside will move to the root.")) return;
        // Cascade: gather this folder + all nested descendant folders
        const allFolders = localOpp.notesFolders || [];
        const idsToDelete = new Set<string>([folderId]);
        let changed = true;
        while (changed) {
            changed = false;
            allFolders.forEach(f => { if (f.parentFolderId && idsToDelete.has(f.parentFolderId) && !idsToDelete.has(f.id)) { idsToDelete.add(f.id); changed = true; } });
        }
        const folders = allFolders.filter(f => !idsToDelete.has(f.id));
        const notes = localOpp.notes.map(n => n.folderId && idsToDelete.has(n.folderId) ? { ...n, folderId: undefined } : n);
        handleFieldChange('notesFolders', folders, true);
        handleFieldChange('notes', notes, true);
    };

    const renameFolder = (folderId: string, newName: string) => {
        const folders = (localOpp.notesFolders || []).map(f => f.id === folderId ? { ...f, name: newName } : f);
        handleFieldChange('notesFolders', folders, true);
    };

    // --- Drag & drop: move notes into folders/root and reorder notes & folders ---
    const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [noteDropPlacement, setNoteDropPlacement] = useState<'before' | 'after' | 'inside' | null>(null);
    // Drag events can arrive before React commits state from dragstart.
    const draggedNoteIdRef = useRef<string | null>(null);
    const [teamPanelOpen, setTeamPanelOpen] = useState(false);
    const [headerStakeholderPickerOpen, setHeaderStakeholderPickerOpen] = useState(false);
    const [headerStakeholderSearch, setHeaderStakeholderSearch] = useState('');
    // `onCreated` carries the caller that asked for the contact (a task's responsible/approver/
    // informed picker). Creating a contact opens this modal, so the picker cannot receive the new
    // id synchronously — it is handed back here once the user submits.
    const [newContactModal, setNewContactModal] = useState<{ name: string; email: string; area: string; onCreated?: (personId: string) => void } | null>(null);
    useEffect(() => { if (selectedNoteId) setTeamPanelOpen(false); }, [selectedNoteId]);
    // STALE-EDITOR FIX (team panel): opening Stakeholders unmounts the note editor without
    // changing activeTab or selectedNoteId, so neither the [selectedNoteId] loader nor the
    // [activeTab] resync above ever runs. The typed html was flushed into the note on the way
    // in, but activeNoteHtml still holds what was loaded when the note was first opened, and
    // closing the panel remounts the editor from it — which read as "my notes weren't saved".
    // Re-read the (already flushed) note whenever the panel closes.
    useEffect(() => {
        if (teamPanelOpen || activeTab !== 'notes' || !selectedNoteId) return;
        const note = localOppRef.current.notes.find(candidate => candidate.id === selectedNoteId);
        if (!note) return;
        setActiveNoteHtml(note.content || '');
        activeNoteHtmlRef.current = note.content || '';
    }, [teamPanelOpen]);
    // Switching the SOW off in Settings while its note is open would otherwise leave the form
    // on screen even though the list no longer offers it. The auto-select effect then picks the
    // first note the user can actually browse.
    useEffect(() => {
        if (sowSectionEnabled || !selectedNoteId) return;
        const note = localOppRef.current.notes.find(candidate => candidate.id === selectedNoteId);
        if (note?.format === 'sow') setSelectedNoteIdSafe(null);
    }, [sowSectionEnabled, selectedNoteId]);

    // Friendlier typeahead for adding stakeholders from the global directory (replaces the plain <select>)
    const [directorySearch, setDirectorySearch] = useState('');
    const [directorySearchOpen, setDirectorySearchOpen] = useState(false);
    const directorySearchRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (directorySearchRef.current && !directorySearchRef.current.contains(event.target as Node)) {
                setDirectorySearchOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const directoryMatches = useMemo(() => {
        const term = directorySearch.trim().toLowerCase();
        const already = (localOpp.stakeholders || []);
        const pool = selectableGlobalContacts.filter(c => !already.some(p => p.directoryContactId === c.id || (!!p.email && !!c.email && p.email.toLowerCase() === c.email.toLowerCase())));
        if (!term) return pool.slice(0, 8);
        return pool.filter(c =>
            c.name.toLowerCase().includes(term) ||
            (c.email || '').toLowerCase().includes(term) ||
            (c.availableRoles || []).some(r => r.toLowerCase().includes(term)) ||
            (c.aliases || []).some(a => a.toLowerCase().includes(term))
        ).slice(0, 8);
    }, [globalContacts, localOpp.stakeholders, directorySearch]);
    const renderDirectorySearch = () => (
        <div ref={directorySearchRef} className="relative mb-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-[#3DCD58]/40 focus-within:border-[#3DCD58] transition-all">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                    type="text"
                    value={directorySearch}
                    onChange={(e) => { setDirectorySearch(e.target.value); setDirectorySearchOpen(true); }}
                    onFocus={() => setDirectorySearchOpen(true)}
                    placeholder="Add from directory: name, email or role..."
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs placeholder:text-gray-400 focus:ring-0 p-0"
                />
                {directorySearch && (
                    <button type="button" onClick={() => setDirectorySearch('')} className="text-gray-300 hover:text-gray-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                )}
            </div>
            {directorySearchOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white rounded-lg shadow-xl border border-gray-100 overflow-y-auto max-h-64 animate-in slide-in-from-top-2 duration-150">
                    {directoryMatches.length > 0 ? (
                        <div className="p-1.5 grid gap-1">
                            {directoryMatches.map(c => (
                                <button
                                    type="button"
                                    key={c.id}
                                    onClick={() => { addStakeholderFromDirectory(c.id); setDirectorySearch(''); setDirectorySearchOpen(false); }}
                                    className="flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-[#3DCD58]/10 transition-colors group"
                                >
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#3DCD58]/10 text-[#3DCD58] text-[10px] font-black shrink-0">
                                        {(c.name || '?').trim().charAt(0).toUpperCase()}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-bold text-gray-800 truncate group-hover:text-[#3DCD58]">{c.name}</div>
                                        <div className={`text-[10px] truncate ${c.email ? 'text-gray-400' : 'font-bold text-amber-600'}`}>{c.email || 'email missing'}</div>
                                    </div>
                                    {(c.availableRoles || []).length > 0 && (
                                        <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase truncate max-w-[90px] shrink-0">{c.availableRoles[0]}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : directorySearch.trim() ? (
                        <button
                            type="button"
                            onClick={() => { createContactAndInvolve(directorySearch.trim()); setDirectorySearch(''); setDirectorySearchOpen(false); }}
                            className="w-full flex items-center gap-2 text-left px-3 py-2.5 hover:bg-[#3DCD58]/10 transition-colors group"
                        >
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#3DCD58]/10 text-[#3DCD58] shrink-0"><Plus className="w-3.5 h-3.5" /></span>
                            <span className="text-xs text-gray-600">
                                No matches. <span className="font-bold text-[#3DCD58] group-hover:underline">Create "{directorySearch.trim()}"</span>
                            </span>
                        </button>
                    ) : (
                        <div className="p-3 text-center text-[11px] text-gray-400 italic">No more contacts in the directory</div>
                    )}
                </div>
            )}
        </div>
    );

    const isNoteDescendantOf = (noteId: string, possibleAncestorId: string) => {
        let current = localOpp.notes.find(n => n.id === noteId);
        while (current?.parentId) {
            if (current.parentId === possibleAncestorId) return true;
            current = localOpp.notes.find(n => n.id === current!.parentId);
        }
        return false;
    };

    const getNoteDropPlacement = (event: React.DragEvent<HTMLDivElement>): 'before' | 'after' | 'inside' => {
        const rect = event.currentTarget.getBoundingClientRect();
        // Dropping toward the right side follows the familiar OneNote outline
        // gesture: the dragged note becomes a child of the target note. The
        // top/bottom edges take priority, so users can always place a note above
        // or below another one without having to aim at a narrow left strip.
        const offsetY = event.clientY - rect.top;
        const edge = Math.min(16, rect.height * 0.3);
        if (offsetY < edge) return 'before';
        if (offsetY > rect.height - edge) return 'after';
        // Reserve only the far-right side for nesting. Most of the card remains
        // an ordering surface, so dropping between two visible notes is natural.
        if (event.clientX > rect.left + rect.width * 0.72) return 'inside';
        return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    };

    /**
     * The notes a given note actually competes with for position, in exactly the
     * order the tree paints them: same folder + same parent, hidden notes and the
     * SOW (while its Settings toggle is off) excluded. Deriving the drop index from
     * the raw notes array instead shifted every move by however many hidden notes
     * happened to live in the same folder.
     */
    const getVisibleNoteSiblings = (note: MeetingNote): MeetingNote[] => {
        const siblings = localOpp.notes.filter(n =>
            !n.hidden
            && (sowSectionEnabled || n.format !== 'sow')
            && (n.folderId || undefined) === (note.folderId || undefined)
            && (n.parentId || undefined) === (note.parentId || undefined)
        );
        return sortWithOrderFallback(siblings, (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };

    /**
     * Button-driven reordering, one slot at a time inside the note's own sibling
     * group. HTML5 drag & drop is easy to lose - a drag that starts on one of the
     * row's nested buttons, a drop that lands a pixel outside the row, or the flat
     * search list, which is not draggable at all - so every row also carries plain
     * up/down arrows that always work.
     */
    const moveNoteInSiblings = (note: MeetingNote, direction: -1 | 1) => {
        const siblings = getVisibleNoteSiblings(note);
        const from = siblings.findIndex(n => n.id === note.id);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= siblings.length) return;
        const others = siblings.filter(n => n.id !== note.id);
        const updated = moveAndReorderNote(localOpp.notes, note.id, note.folderId, note.parentId, to, others.map(n => n.id));
        handleFieldChange('notes', updated, true);
    };

    const handleDropNoteOnNote = (targetNote: MeetingNote, placement: 'before' | 'after' | 'inside') => {
        const activeDraggedNoteId = draggedNoteIdRef.current || draggedNoteId;
        if (!activeDraggedNoteId || activeDraggedNoteId === targetNote.id) return;
        // A parent cannot become a child of one of its descendants.
        if (isNoteDescendantOf(targetNote.id, activeDraggedNoteId)) return;

        if (placement === 'inside') {
            // Children of the target = notes sharing its folder with it as parent.
            const children = getVisibleNoteSiblings({ ...targetNote, parentId: targetNote.id })
                .filter(n => n.id !== activeDraggedNoteId);
            const updated = moveAndReorderNote(localOpp.notes, activeDraggedNoteId, targetNote.folderId, targetNote.id, children.length, children.map(n => n.id));
            handleFieldChange('notes', updated, true);
            setCollapsedFolders(prev => { const next = new Set(prev); next.delete(targetNote.id); return next; });
            return;
        }

        const sortedSiblings = getVisibleNoteSiblings(targetNote).filter(n => n.id !== activeDraggedNoteId);
        const targetIndex = sortedSiblings.findIndex(n => n.id === targetNote.id);
        const insertAt = Math.max(0, targetIndex + (placement === 'after' ? 1 : 0));
        const updated = moveAndReorderNote(localOpp.notes, activeDraggedNoteId, targetNote.folderId, targetNote.parentId, insertAt, sortedSiblings.map(n => n.id));
        handleFieldChange('notes', updated, true);
    };

    const handleDropNoteOnFolder = (folderId: string | undefined) => {
        const activeDraggedNoteId = draggedNoteIdRef.current || draggedNoteId;
        if (!activeDraggedNoteId) return;
        const note = localOpp.notes.find(n => n.id === activeDraggedNoteId);
        if (!note) return;
        const destCount = localOpp.notes.filter(n => n.folderId === folderId && !n.parentId).length;
        const updated = moveAndReorderNote(localOpp.notes, activeDraggedNoteId, folderId, undefined, destCount);
        handleFieldChange('notes', updated, true);
    };

    const handleDropFolderOnFolder = (targetFolderId: string | undefined) => {
        if (!draggedFolderId) return;
        if (targetFolderId === draggedFolderId) return;
        // Guard: cannot nest a folder inside itself or one of its own descendants
        if (targetFolderId && isFolderDescendantOf(localOpp.notesFolders || [], targetFolderId, draggedFolderId)) return;
        const destCount = (localOpp.notesFolders || []).filter(f => f.parentFolderId === targetFolderId).length;
        const updated = moveAndReorderFolder(localOpp.notesFolders || [], draggedFolderId, targetFolderId, destCount);
        handleFieldChange('notesFolders', updated, true);
    };
    const updateSelectedNote = (field: keyof MeetingNote, value: string) => {
        if (!selectedNoteId) return;
        if (field === 'content') {
            handleNoteContentChange(value);
        } else {
            // RENAME DATA-LOSS FIX: while the user types, the note's live content
            // exists only in activeNoteHtmlRef (the 1.5s flush hasn't run yet).
            // Building the update from localOpp.notes alone captured STALE content,
            // and handleFieldChange's 300ms debounced save then overwrote the
            // flushed content â€” deleted text reappeared or fresh text vanished
            // when renaming. Always carry the live content along with the rename.
            const updatedNotes = localOpp.notes.map(n => n.id === selectedNoteId
                ? { ...n, [field]: value, content: activeNoteHtmlRef.current ?? n.content }
                : n);
            handleFieldChange('notes', updatedNotes);
        }
    };
    const updateNoteById = (noteId: string, field: keyof MeetingNote, value: string) => {
        const updatedNotes = localOpp.notes.map(n => {
            if (n.id !== noteId) return n;
            // Same stale-content guard as updateSelectedNote for the open note.
            const liveContent = noteId === selectedNoteId && field !== 'content'
                ? (activeNoteHtmlRef.current ?? n.content)
                : n.content;
            return { ...n, content: liveContent, [field]: value };
        });
        handleFieldChange('notes', updatedNotes);
    }
    const getLinkedTasksForNote = (noteId: string) => {
        return localOpp.tasks.filter(t => (t.linkedNoteIds || []).includes(noteId) || t.linkedNoteId === noteId);
    };

    const addHistoryEntry = (date?: string, content?: string) => {
        console.debug("[History] addHistoryEntry start", { date, content });
        const newEntry: HistoryEntry = {
            id: crypto.randomUUID(),
            date: normalizeHistoryDate(date),
            content: content || 'New event...',
            createdAt: new Date().toISOString(),
        };
        const updatedHistory = sortHistoryEntries([...(localOpp.history || []), newEntry]);
        console.debug("[History] state update and calling onUpdate", { entriesCount: updatedHistory.length });
        handleFieldChange('history', updatedHistory);
    };
    const requestExpectedDateChange = (next: string) => {
        const previous = localOppRef.current.dates.expected || '';
        if (next === previous) return;
        if (!confirmExpectedDateChanges) {
            const current = localOppRef.current;
            const updated: Opportunity = {
                ...current,
                dates: { ...current.dates, expected: next },
                lastUpdated: new Date().toISOString(),
            };
            localOppRef.current = updated;
            setLocalOpp(updated);
            syncToParentNow(updated);
            return;
        }
        setExpectedDateChange({ previous, next, kind: null, reason: '' });
    };
    const confirmExpectedDateChange = () => {
        if (!expectedDateChange?.kind) return;
        if (expectedDateChange.kind === 'schedule' && !expectedDateChange.reason.trim()) {
            alert('Enter the reason for the schedule change.');
            return;
        }
        const current = localOppRef.current;
        const history = expectedDateChange.kind === 'schedule'
            ? sortHistoryEntries([
                ...(current.history || []),
                {
                    id: crypto.randomUUID(),
                    date: getTodayStr(),
                    createdAt: new Date().toISOString(),
                    content: `Expected delivery changed from ${expectedDateChange.previous || 'not set'} to ${expectedDateChange.next || 'not set'}. Reason: ${expectedDateChange.reason.trim()}`,
                },
            ])
            : current.history;
        const updated: Opportunity = {
            ...current,
            dates: { ...current.dates, expected: expectedDateChange.next },
            history,
            lastUpdated: new Date().toISOString(),
        };
        localOppRef.current = updated;
        setLocalOpp(updated);
        syncToParentNow(updated);
        setExpectedDateChange(null);
    };
    const updateHistoryEntry = (id: string, field: keyof HistoryEntry, value: string) => {
        const updatedHistory = sortHistoryEntries((localOpp.history || []).map(h => {
            if (h.id !== id) return h;
            const updated = { ...h, [field]: value };
            return field === 'date' ? { ...updated, date: normalizeHistoryDate(value) } : updated;
        }));
        handleFieldChange('history', updatedHistory);
    };
    // Safe access: kpis or timeline may be null in older/partially-migrated data
    const kpisTimeline = localOpp.kpis?.timeline;
    const totalElapsedCalendarDays = (kpisTimeline?.deliveredAt
        ? countCalendarDays(kpisTimeline.receivedAt || getTodayStr(), kpisTimeline.deliveredAt)
        : countCalendarDays(kpisTimeline?.receivedAt || getTodayStr(), getTodayStr())) + 1;

    /**
     * UniqueExecutionDays: Number of unique calendar days that have either a 'Worked' or 'Waiting' status across any area.
     * This follows 'Rule B' which allows overlapping work across areas.
     */
    const executionUniqueDays = React.useMemo(() => {
        const uniqueDates = new Set<string>();
        (localOpp.kpis?.areasInvolved || []).forEach(area => {
            if (area.calendar) {
                Object.entries(area.calendar).forEach(([date, record]) => {
                    const r = record as AreaDayRecord;
                    // Only count Worked and Waiting as execution days
                    if (r.type === 'Worked' || r.type === 'Waiting') {
                        uniqueDates.add(date);
                    }
                });
            }
        });
        return uniqueDates.size;
    }, [localOpp.kpis?.areasInvolved]);

    /**
     * Rule B: Tracks if any activity is recorded outside the official ReceivedAt -> DeliveredAt range.
     * If DeliveredAt doesn't exist, uses today's date as the end of the range.
     */
    const hasDaysOutsideRange = React.useMemo(() => {
        const receivedAt = localOpp.kpis?.timeline.receivedAt;
        const deliveredAt = localOpp.kpis?.timeline.deliveredAt || getTodayStr();

        let outside = false;
        (localOpp.kpis?.areasInvolved || []).forEach(area => {
            if (area.calendar) {
                Object.keys(area.calendar).forEach(date => {
                    // Check if date is strictly before receivedAt OR strictly after deliveredAt
                    if (receivedAt && (date < receivedAt || date > deliveredAt)) {
                        outside = true;
                    }
                });
            }
        });
        return outside;
    }, [localOpp.kpis?.areasInvolved, localOpp.kpis?.timeline.receivedAt, localOpp.kpis?.timeline.deliveredAt]);

    const deleteHistoryEntry = (id: string) => {
        if (!window.confirm("Delete this history entry?")) return;
        console.debug("[History] deleteHistoryEntry start", { id });
        const updatedHistory = (localOpp.history || []).filter(h => h.id !== id);
        handleFieldChange('history', updatedHistory);
        console.debug("[History] deleteHistoryEntry done");
    };
    const copyHistoryToClipboard = () => {
        // Sort descending: Newest (most recent/cercana) to Oldest (mÃ¡s lejana)
        const sortedHistory = sortHistoryEntries(localOpp.history || []);
        const text = sortedHistory.map(h => {
            const normalizedDate = normalizeHistoryDate(h.date);
            const parts = normalizedDate.split('-');
            const dateStr = parts.length === 3 ? `${parts[1]}/${parts[2]}` : h.date;
            const user = (userName || 'User').trim() || 'User';
            return `${dateStr}: [${user}] ${h.content}`;
        }).join('\n');
        navigator.clipboard.writeText(text);
        alert("History copied to clipboard for bFO.");
    };

    const addKpiArea = (area: string) => {
        if (!area) return;
        if ((localOpp.kpis?.areasInvolved || []).some(a => a.area === area)) {
            alert("This area is already being tracked.");
            return;
        }
        const newArea: KPIArea = { id: crypto.randomUUID(), area, daysSpent: 0, waitingDays: 0, calendar: {} };
        const baseKpis = localOpp.kpis || { languageSkill: 0, technicalUnderstanding: 0, dealProbability: 0, effortContribution: 0, sold: null, proposalAmountUSD: 0, timeline: { receivedAt: getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null }, execution: { myWorkDays: 0, waitingOnOthersDays: 0 }, areasInvolved: [] };
        const updated = { ...localOpp, kpis: { ...baseKpis, areasInvolved: [...(baseKpis.areasInvolved || []), newArea] } };
        setLocalOpp(updated); onUpdate(updated);
    };


    const removeKpiArea = (id: string) => {
        const newAreas = (localOpp.kpis?.areasInvolved || []).filter(a => a.id !== id);
        updateKpiField('areasInvolved', newAreas);
    };

    const handleSaveAreaCalendar = (areaId: string, calendar: Record<string, AreaDayRecord>) => {
        const area = localOpp.kpis?.areasInvolved.find(a => a.id === areaId);
        if (!area) return;

        let worked = 0;
        let waiting = 0;
        Object.values(calendar).forEach(r => {
            if (r.type === 'Worked') {
                if (area.area === 'Tendering') {
                    const totalHours = (r.hours || 0) + (r.minutes || 0) / 60;
                    if (totalHours >= 1 || (r.workedTaskIds || []).length > 0) worked++;
                } else {
                    worked++;
                }
            }
            if (r.type === 'Waiting' || (r.waitingTaskIds || []).length > 0) waiting++;
        });

        const newAreas = (localOpp.kpis?.areasInvolved || []).map(a => a.id === areaId ? { ...a, calendar, daysSpent: worked, waitingDays: waiting } : a);
        updateKpiField('areasInvolved', newAreas);
        setEditingAreaCalendar(null);
    };

    const withTenderingWorkedDay = (opp: Opportunity, date: string): Opportunity => {
        const baseKpis = opp.kpis || {
            languageSkill: 0,
            technicalUnderstanding: 0,
            dealProbability: 0,
            effortContribution: 0,
            sold: null,
            proposalAmountUSD: 0,
            timeline: { receivedAt: getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null },
            execution: { myWorkDays: 0, waitingOnOthersDays: 0 },
            areasInvolved: [],
        };
        const areas = baseKpis.areasInvolved || [];
        const tendering = areas.find(a => a.area === 'Tendering') || {
            id: crypto.randomUUID(),
            area: 'Tendering',
            daysSpent: 0,
            waitingDays: 0,
            calendar: {},
        };
        const calendar = {
            ...(tendering.calendar || {}),
            [date]: {
                ...(tendering.calendar?.[date] || {}),
                type: 'Worked' as DayType,
                hours: tendering.calendar?.[date]?.hours || 1,
            },
        };

        let worked = 0;
        let waiting = 0;
        Object.values(calendar).forEach(record => {
            if (record.type === 'Worked') {
                const totalHours = (record.hours || 0) + (record.minutes || 0) / 60;
                if (totalHours >= 1) worked++;
            }
            if (record.type === 'Waiting' || (record.waitingTaskIds || []).length > 0) waiting++;
        });

        const nextTendering = { ...tendering, calendar, daysSpent: worked, waitingDays: waiting };
        const nextAreas = areas.some(a => a.area === 'Tendering')
            ? areas.map(a => a.area === 'Tendering' ? nextTendering : a)
            : [...areas, nextTendering];

        return {
            ...opp,
            kpis: {
                ...baseKpis,
                areasInvolved: nextAreas,
            },
        };
    };

    const totalAreaDays = (localOpp.kpis?.areasInvolved || []).reduce((sum, a) => sum + (a.daysSpent || 0), 0);


    // Validation value for Business Days elapsed (workable time) â€” safe access for null kpis
    const totalElapsedBusinessDays = (kpisTimeline?.deliveredAt
        ? countBusinessDays(kpisTimeline.receivedAt || getTodayStr(), kpisTimeline.deliveredAt, holidays)
        : countBusinessDays(kpisTimeline?.receivedAt || getTodayStr(), getTodayStr(), holidays)) + 1;


    const addTask = () => {
        const baseOpp = localOppRef.current;
        // Insert at the current execution point. For example, if #15 is next,
        // the new task becomes #15 and the old #15 (and everything after it) shifts.
        const currentTask = getNextTask(baseOpp.tasks);
        const existingOrders = baseOpp.tasks.map(t => t.order ?? 0).filter(n => n > 0);
        const insertionOrder = currentTask?.order
            ?? (existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1);
        const shiftedTasks = baseOpp.tasks.map(task => ({
            ...task,
            order: task.order != null && task.order >= insertionOrder ? task.order + 1 : task.order,
        }));
        const newTask: Task = {
            id: crypto.randomUUID(), title: 'New Task', description: '', status: 'Pending', priority: 'Medium', owner: 'Me',
            externalAreas: [], responsible: '', dueDate: '', stageContext: localOpp.stage, subtasks: [], linkedNoteIds: [],
            order: insertionOrder, dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false
        };
        const newOpp = { ...baseOpp, tasks: [...shiftedTasks, newTask], lastUpdated: new Date().toISOString() };
        localOppRef.current = newOpp;
        setLocalOpp(newOpp);
        onUpdate(newOpp);
        setSelectedTaskForEdit({ task: newTask });
    };



    const handleCopyTasks = (taskIds: string[], targetOppId: string, targetStatus: TaskStatus) => {
        const tasksToCopy = localOpp.tasks.filter(t => taskIds.includes(t.id));
        const targetOpp = opportunities?.find(o => o.id === targetOppId);
        if (!targetOpp) return;

        const newConvertedTasks: Task[] = tasksToCopy.map(t => ({
            ...t,
            id: crypto.randomUUID(),
            status: targetStatus,
            linkedNoteIds: [],
            subtasks: t.subtasks?.map(s => ({ ...s, id: crypto.randomUUID(), completed: false })) || []
        }));

        const updatedTargetOpp = {
            ...targetOpp,
            tasks: [...(targetOpp.tasks || []), ...newConvertedTasks],
            lastUpdated: new Date().toISOString()
        };

        onUpdate(updatedTargetOpp, targetOppId);
        alert(`Successfully copied ${newConvertedTasks.length} tasks to ${targetOpp.customer}`);
    };

    const copyTask = (task: Task) => {
        const newTask: Task = {
            ...task,
            id: crypto.randomUUID(),
            title: `${task.title} (Copy)`,
            status: 'Pending',
            subtasks: task.subtasks.map(st => ({ ...st, id: crypto.randomUUID(), completed: false }))
        } as Task;
        handleFieldChange('tasks', [...localOpp.tasks, newTask]);
    };

    const validateTaskCompletion = (taskId: string, newStatus: TaskStatus): boolean => {
        if (newStatus !== 'Done') return true;
        const task = localOpp.tasks.find(t => t.id === taskId);
        if (task?.status === 'Approval') {
            alert('Use the Approve button to complete an approval.');
            return false;
        }
        if (!task || !task.blockDoneUntilDependenciesDone || !task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) return true;

        const pendingDeps = localOpp.tasks.filter(t => task.dependsOnTaskIds!.includes(t.id) && t.status !== 'Done' && t.status !== 'Canceled');
        if (pendingDeps.length > 0) {
            alert("This task is blocked until its dependencies are completed.");
            return false;
        }
        return true;
    };

    function syncAssignmentKpi(opp: Opportunity, task: Task): Opportunity {
        const hasResponsible = (task.responsibleTeamMemberIds || []).length > 0 || !!task.responsible?.trim();
        const hasApprover = (task.approverTeamMemberIds || []).length > 0;
        if (!task.isAssignment && !hasResponsible && !hasApprover) return opp;
        const today = getTodayStr();
        const people = opp.stakeholders || [];
        const areasForPeople = (ids: string[], fallbackAreas: string[] = []) => Array.from(new Set([
            ...fallbackAreas,
            ...people.filter(person => ids.includes(person.id)).flatMap(person => person.roles?.length ? person.roles : (person.role ? [person.role] : [])),
        ].filter(Boolean)));
        const executionAreas = areasForPeople(task.responsibleTeamMemberIds || [], task.externalAreas || []);
        const approvalAreas = areasForPeople(task.approverTeamMemberIds || []);
        const windows = [
            ...(task.assignmentCycles || []).flatMap(cycle => [
                cycle.executionRequested ? {
                    areas: executionAreas,
                    start: cycle.executionRequested,
                    end: cycle.executionDelivered || cycle.executionRequired || cycle.executionRequested,
                } : null,
                cycle.approvalRequested ? {
                    areas: approvalAreas,
                    start: cycle.approvalRequested,
                    end: cycle.approved || cycle.changesRequestedAt || cycle.approvalRequired || cycle.approvalRequested,
                } : null,
            ]),
            task.responsibleRequestedDate ? {
                areas: executionAreas,
                start: task.responsibleRequestedDate,
                end: task.responsibleDeliveredDate || task.responsibleDueDate || task.dueDate || today,
            } : null,
            task.approvalRequestedDate ? {
                areas: approvalAreas,
                start: task.approvalRequestedDate,
                end: task.approvalDeliveredDate || task.approvalDueDate || today,
            } : null,
        ].filter((window): window is { areas: string[]; start: string; end: string } => !!window && !!window.start && !!window.end);
        const baseKpis = opp.kpis || { languageSkill: 0, technicalUnderstanding: 0, dealProbability: 0, effortContribution: 0, sold: null, proposalAmountUSD: 0, timeline: { receivedAt: getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null }, execution: { myWorkDays: 0, waitingOnOthersDays: 0 }, areasInvolved: [] };
        let nextAreas = [...(baseKpis.areasInvolved || [])];
        [...windows.flatMap(window => window.areas), 'Tendering'].forEach(areaName => {
            if (!nextAreas.some(area => area.area === areaName)) nextAreas.push({ id: crypto.randomUUID(), area: areaName, daysSpent: 0, waitingDays: 0, calendar: {}, autoAdded: true });
        });
        if (windows.length) {
            nextAreas = nextAreas.map(area => {
                const calendar = { ...(area.calendar || {}) };
                // Remove the previous automatic contribution from this task before
                // rebuilding its current window. Manual hours and statuses survive.
                Object.entries(calendar).forEach(([ds, record]) => {
                    const hadWorked = (record.workedTaskIds || []).includes(task.id);
                    const hadWaiting = (record.waitingTaskIds || []).includes(task.id);
                    if (!hadWorked && !hadWaiting) return;
                    const workedTaskIds = (record.workedTaskIds || []).filter(id => id !== task.id);
                    const waitingTaskIds = (record.waitingTaskIds || []).filter(id => id !== task.id);
                    const wasOnlyAutomaticWork = hadWorked && !workedTaskIds.length && !waitingTaskIds.length && !(record.hours || record.minutes);
                    const wasOnlyAutomaticWait = hadWaiting && !waitingTaskIds.length && !workedTaskIds.length && record.type === 'Waiting';
                    if (wasOnlyAutomaticWork || wasOnlyAutomaticWait) delete calendar[ds];
                    else calendar[ds] = { ...record, workedTaskIds, waitingTaskIds };
                });
                windows.forEach(window => {
                    for (let date = new Date(`${window.start}T00:00:00`), last = new Date(`${window.end}T00:00:00`); date <= last; date.setDate(date.getDate() + 1)) {
                        const ds = date.toISOString().split('T')[0];
                        if (date.getDay() === 0 || date.getDay() === 6 || holidays.includes(ds)) continue;
                        const current = calendar[ds];
                        if (window.areas.includes(area.area)) {
                            calendar[ds] = {
                                ...(current || {}),
                                type: 'Worked',
                                workedTaskIds: Array.from(new Set([...(current?.workedTaskIds || []), task.id])),
                            };
                        }
                        if (area.area === 'Tendering') {
                            const afterWork = calendar[ds] || current;
                            calendar[ds] = {
                                ...(afterWork || {}),
                                type: afterWork?.type === 'Worked' ? 'Worked' : 'Waiting',
                                waitingTaskIds: Array.from(new Set([...(afterWork?.waitingTaskIds || []), task.id])),
                            };
                        }
                    }
                });
                const daysSpent = Object.values(calendar).filter(record => record.type === 'Worked' && (
                    area.area !== 'Tendering'
                    || (record.workedTaskIds || []).length > 0
                    || ((record.hours || 0) + (record.minutes || 0) / 60 >= 1)
                )).length;
                const waitingDays = Object.values(calendar).filter(record => record.type === 'Waiting' || (record.waitingTaskIds || []).length > 0).length;
                return { ...area, calendar, daysSpent, waitingDays };
            });
        }
        // Auto-added rows only belong in the Implementation Timeline while they still track real work or a
        // currently assigned task; once a task is unassigned/deleted their calendar empties out and they should
        // disappear instead of cluttering the list with areas no longer actually assigned to the proposal.
        const currentlyAssignedAreas = new Set(windows.flatMap(window => window.areas));
        nextAreas = nextAreas.filter(area => (
            area.area === 'Tendering'
            || !area.autoAdded
            || currentlyAssignedAreas.has(area.area)
            || Object.keys(area.calendar || {}).length > 0
        ));
        return { ...opp, kpis: { ...baseKpis, areasInvolved: nextAreas } };
    }

    const requestApprovalChanges = (taskId: string) => {
        const task = localOppRef.current.tasks.find(item => item.id === taskId);
        if (!task || (task.status !== 'Approval' && task.status !== 'Done')) return;
        setChangeRevisionTaskId(taskId);
    };
    const createApprovalChangeRevision = async (form: ChangeRevisionFormValue) => {
        if (!changeRevisionTaskId || creatingChangeRevision) return;
        const baseOpp = localOppRef.current;
        const approvalTask = baseOpp.tasks.find(task => task.id === changeRevisionTaskId);
        if (!approvalTask || (approvalTask.status !== 'Approval' && approvalTask.status !== 'Done')) return;
        setCreatingChangeRevision(true);
        const today = form.requestedDate || getTodayStr();
        const ordered = [...baseOpp.tasks].sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
        const fallbackOrder = Math.max(1, ordered.findIndex(task => task.id === approvalTask.id) + 1);
        const insertionOrder = approvalTask.order ?? fallbackOrder;
        const reworkId = crypto.randomUUID();
        const changeRevisionId = crypto.randomUUID();
        const revisionNoteId = crypto.randomUUID();
        const isExternal = form.assignedTo === 'External Area';
        const responsiblePeople = (baseOpp.stakeholders || []).filter(person => form.responsibleTeamMemberIds.includes(person.id));
        const previousAttachments = (await listLinkedForTask(baseOpp.id, approvalTask.id)).map(item => item.fileKey);

        let createdFiles: Awaited<ReturnType<typeof createChangeRevisionFiles>> = [];
        try {
            createdFiles = await createChangeRevisionFiles({
                opportunityId: baseOpp.id,
                opportunityRevision: baseOpp.revision,
                correctionTaskId: reworkId,
                changeRevisionId,
                changes: form.requiredChanges,
                reason: form.reason,
                files: form.fileRevisions.map(file => ({ ...file, newRevision: normalizeDocumentRevision(file.newRevision) })),
            });
        } catch (err: any) {
            alert(err?.message || 'Could not create the selected file revisions.');
            setCreatingChangeRevision(false);
            return;
        }
        const supersededAttachments = createdFiles.map(file => file.sourceFileKey);
        const nextApprovalAttachments = [...previousAttachments.filter(key => !supersededAttachments.includes(key)), ...createdFiles.map(file => file.newFileKey)];

        const correctionTask: Task = syncAssignmentSubtasks({
            id: reworkId,
            title: form.correctionTaskTitle,
            description: `${form.requiredChanges}\n\nReason: ${form.reason}`,
            processSection: form.processSection,
            changeRequest: form.requiredChanges,
            changeReason: form.reason,
            changeRevisionId,
            changeRequestedByIds: [...form.requestedByIds],
            changeInformedIds: [...form.informedIds],
            changeRevisionFileKeys: createdFiles.map(file => file.newFileKey),
            previousApprovalAttachmentKeys: supersededAttachments,
            reworkForTaskId: approvalTask.id,
            status: isExternal ? 'Missing Info' : 'Pending',
            priority: approvalTask.priority || 'Medium',
            owner: form.assignedTo,
            externalAreas: Array.from(new Set(responsiblePeople.flatMap(person => person.roles?.length ? person.roles : (person.role ? [person.role] : [])))),
            responsible: responsiblePeople.map(person => person.name).join(', '),
            responsibleTeamMemberIds: [...form.responsibleTeamMemberIds],
            informedTeamMemberIds: [...form.informedIds],
            isAssignment: isExternal,
            responsibleRequestedDate: isExternal ? today : '',
            responsibleDueDate: isExternal ? form.committedDate : '',
            dueDate: form.committedDate,
            stageContext: approvalTask.stageContext || baseOpp.stage,
            subtasks: [],
            linkedNoteIds: Array.from(new Set([...(approvalTask.linkedNoteIds || []), revisionNoteId])),
            order: insertionOrder,
            dependsOnTaskIds: [],
            blockDoneUntilDependenciesDone: false,
        });

        const previousCycle = {
            id: crypto.randomUUID(),
            executionRequested: approvalTask.responsibleRequestedDate,
            executionRequired: approvalTask.responsibleDueDate,
            executionDelivered: approvalTask.responsibleDeliveredDate,
            approvalRequested: approvalTask.approvalRequestedDate,
            approvalRequired: approvalTask.approvalDueDate,
            changesRequestedAt: today,
            reviewOutcome: 'changes_requested' as const,
            changeRequest: form.requiredChanges,
            reworkTaskId: reworkId,
        };

        const shiftedTasks = baseOpp.tasks.map(task => {
            const shiftedOrder = task.order != null && task.order >= insertionOrder ? task.order + 1 : task.order;
            if (task.id !== approvalTask.id) return { ...task, order: shiftedOrder };
            return syncAssignmentSubtasks({
                ...task,
                order: shiftedOrder,
                status: 'Changes Requested / Rework',
                assignmentCycles: [...(task.assignmentCycles || []), previousCycle],
                approvalRequestedDate: '',
                approvalDueDate: '',
                approvalDeliveredDate: '',
                linkedNoteIds: Array.from(new Set([...(task.linkedNoteIds || []), revisionNoteId])),
                dependsOnTaskIds: Array.from(new Set([...(task.dependsOnTaskIds || []), reworkId])),
                blockDoneUntilDependenciesDone: true,
            });
        });

        const approvalCycle = approvalEventsForTask(baseOpp.history || [], approvalTask.id).reduce((max, entry) => Math.max(max, entry.cycle), 0) + 1;
        const approvalEvent: ApprovalEvent = {
            taskId: approvalTask.id, correctionTaskId: reworkId, changeRevisionId,
            cycle: approvalCycle, outcome: 'changes_requested', requiredChanges: form.requiredChanges,
            reason: form.reason, requestedByIds: [...form.requestedByIds], informedIds: [...form.informedIds],
            assignedTo: form.assignedTo, responsibleTeamMemberIds: [...form.responsibleTeamMemberIds],
            requestedAt: today, committedAt: form.committedDate || undefined,
            previousAttachmentKeys: previousAttachments, activeAttachmentKeys: nextApprovalAttachments,
        };
        const historyEntry: HistoryEntry = {
            id: crypto.randomUUID(), date: today, createdAt: new Date().toISOString(), approval: approvalEvent,
            content: `Changes requested for "${approvalTask.title}": ${form.requiredChanges}`,
        };
        const revisionNote: MeetingNote = {
            id: revisionNoteId,
            title: `Change Revision — ${approvalTask.title}`,
            date: today,
            type: 'Review',
            attendees: [...form.requestedByIds, ...form.informedIds, ...form.responsibleTeamMemberIds]
                .map(id => (baseOpp.stakeholders || []).find(person => person.id === id)?.name)
                .filter((name): name is string => !!name)
                .filter((name, index, all) => all.indexOf(name) === index)
                .join(', '),
            content: [
                `<p><strong>Original approval task:</strong> ${escapeNoteText(approvalTask.title)}</p>`,
                `<p><strong>Required changes:</strong><br/>${escapeNoteText(form.requiredChanges).replace(/\r?\n/g, '<br/>')}</p>`,
                `<p><strong>Why the changes are required:</strong><br/>${escapeNoteText(form.reason).replace(/\r?\n/g, '<br/>')}</p>`,
                `<p><strong>Assigned to:</strong> ${escapeNoteText(form.assignedTo === 'Me' ? 'Me' : responsiblePeople.map(person => person.name).join(', '))}</p>`,
                form.committedDate ? `<p><strong>Committed date:</strong> ${escapeNoteText(form.committedDate)}</p>` : '',
                createdFiles.length ? `<p><strong>Revision files:</strong></p><ul>${createdFiles.map(file => `<li>${escapeNoteText(file.newFileKey)}</li>`).join('')}</ul>` : '',
            ].filter(Boolean).join(''),
            inlineTasks: [{ id: crypto.randomUUID(), text: correctionTask.title, isDone: false, linkedTaskId: reworkId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
            changeRevisionId,
            linkedTaskIds: [approvalTask.id, reworkId],
        };
        const existingDocs = [...(baseOpp.folderDocs || [])];
        createdFiles.forEach(file => {
            const source = existingDocs.find(doc => doc.fileKey === file.sourceFileKey);
            const now = new Date().toISOString();
            existingDocs.push({
                ...(source || { id: crypto.randomUUID(), linkedNoteIds: [], firstSeenAt: now }),
                id: crypto.randomUUID(), fileKey: file.newFileKey, previousKeys: [], name: file.newFileKey.split('/').pop() || file.newFileKey,
                revisionFamilyId: file.history.familyId, linkedTaskIds: [reworkId], linkedNoteIds: [revisionNoteId], missingSince: null, firstSeenAt: now, lastSeenAt: now, updatedAt: now,
            });
        });
        for (const file of createdFiles) {
            const meta = await getMeta(baseOpp.id, file.newFileKey);
            await saveMeta(baseOpp.id, file.newFileKey, { linkedNoteIds: Array.from(new Set([...(meta?.linkedNoteIds || []), revisionNoteId])) });
        }
        let newOpp = {
            ...baseOpp,
            tasks: [...shiftedTasks, correctionTask],
            notes: [revisionNote, ...(baseOpp.notes || [])],
            history: sortHistoryEntries([historyEntry, ...(baseOpp.history || [])]),
            folderDocs: existingDocs,
            fileRevisionHistory: [...(baseOpp.fileRevisionHistory || []), ...createdFiles.map(file => file.history)],
            lastUpdated: new Date().toISOString(),
        };
        if (isExternal) newOpp = syncAssignmentKpi(newOpp, correctionTask);
        localOppRef.current = newOpp;
        setLocalOpp(newOpp);
        onUpdate(newOpp, baseOpp.id, true);
        setChangeRevisionTaskId(null);
        setCreatingChangeRevision(false);
        setSelectedTaskForEdit({ task: correctionTask });
    };

    const sendCorrectionBackForApproval = async (correctionTaskId: string) => {
        const baseOpp = localOppRef.current;
        const correction = baseOpp.tasks.find(task => task.id === correctionTaskId);
        const original = correction?.reworkForTaskId ? baseOpp.tasks.find(task => task.id === correction.reworkForTaskId) : undefined;
        if (!correction || correction.status !== 'Done' || !original || correction.sentBackForApprovalAt) return;
        const today = getTodayStr();
        const newKeys = correction.changeRevisionFileKeys || [];
        const previousKeys = correction.previousApprovalAttachmentKeys || [];

        for (const key of previousKeys) {
            const meta = await getMeta(baseOpp.id, key);
            if (meta) await saveMeta(baseOpp.id, key, { linkedTaskIds: (meta.linkedTaskIds || []).filter(id => id !== original.id) });
        }
        for (const key of newKeys) {
            const meta = await getMeta(baseOpp.id, key);
            await saveMeta(baseOpp.id, key, { linkedTaskIds: Array.from(new Set([...(meta?.linkedTaskIds || []), correction.id, original.id])) });
        }

        const tasks = baseOpp.tasks.map(task => {
            if (task.id === original.id) return syncAssignmentSubtasks({ ...task, status: 'Approval', approvalRequestedDate: today, approvalDeliveredDate: '' });
            if (task.id === correction.id) return { ...task, sentBackForApprovalAt: today };
            return task;
        });
        const sourceRecord = [...(baseOpp.history || [])].reverse().find(entry => entry.approval?.changeRevisionId === correction.changeRevisionId && entry.approval.outcome === 'changes_requested')?.approval;
        const approvalEvent: ApprovalEvent = {
            taskId: original.id, correctionTaskId: correction.id, changeRevisionId: correction.changeRevisionId,
            cycle: sourceRecord?.cycle || (approvalEventsForTask(baseOpp.history || [], original.id).reduce((max, entry) => Math.max(max, entry.cycle), 0) + 1),
            outcome: 'resubmitted', requiredChanges: correction.changeRequest, reason: correction.changeReason,
            requestedByIds: correction.changeRequestedByIds || [], informedIds: correction.changeInformedIds || [],
            assignedTo: correction.owner, responsibleTeamMemberIds: correction.responsibleTeamMemberIds || [],
            requestedAt: correction.responsibleRequestedDate || sourceRecord?.requestedAt || today,
            committedAt: correction.responsibleDueDate || sourceRecord?.committedAt,
            deliveredAt: correction.responsibleDeliveredDate || correction.completedAt || today,
            sentBackAt: today, previousAttachmentKeys: sourceRecord?.previousAttachmentKeys || previousKeys,
            activeAttachmentKeys: sourceRecord?.activeAttachmentKeys || newKeys,
        };
        const folderDocs = (baseOpp.folderDocs || []).map(doc => previousKeys.includes(doc.fileKey)
            ? { ...doc, linkedTaskIds: doc.linkedTaskIds.filter(id => id !== original.id), updatedAt: new Date().toISOString() }
            : newKeys.includes(doc.fileKey)
                ? { ...doc, linkedTaskIds: Array.from(new Set([...doc.linkedTaskIds, correction.id, original.id])), updatedAt: new Date().toISOString() }
                : doc);
        const newOpp = {
            ...baseOpp, tasks, folderDocs,
            notes: appendChangeRevisionNoteEvent(baseOpp.notes || [], correction.changeRevisionId, 'Sent Back for Approval', `The correction task "${correction.title}" was resubmitted for approval.`, today),
            history: sortHistoryEntries([{ id: crypto.randomUUID(), date: today, createdAt: new Date().toISOString(), approval: approvalEvent, content: `Correction "${correction.title}" sent back for approval.` }, ...(baseOpp.history || [])]),
            lastUpdated: new Date().toISOString(),
        };
        localOppRef.current = newOpp;
        setLocalOpp(newOpp);
        onUpdate(newOpp, baseOpp.id, true);
        // Refresh the open modal, but never pop it open: this also runs automatically when a
        // correction is checked off from the board or from a note.
        setSelectedTaskForEdit(prev => prev?.task.id === correction.id ? { task: tasks.find(task => task.id === correction.id)! } : prev);
    };

    const approveTask = async (taskId: string) => {
        const baseOpp = localOppRef.current;
        const task = baseOpp.tasks.find(item => item.id === taskId);
        if (!task || task.status !== 'Approval') return;
        if (!window.confirm(`Approve "${task.title}"?`)) return;
        const today = getTodayStr();
        const activeAttachments = (await listLinkedForTask(baseOpp.id, task.id)).map(item => item.fileKey);
        const latestResubmission = [...(baseOpp.history || [])].reverse().find(entry => entry.approval?.taskId === task.id && entry.approval.outcome === 'resubmitted')?.approval;
        const cycle = latestResubmission?.cycle || (approvalEventsForTask(baseOpp.history || [], task.id).reduce((max, entry) => Math.max(max, entry.cycle), 0) + 1);
        const approvedTask = syncAssignmentSubtasks({ ...task, status: 'Done', approvalDeliveredDate: today, completedAt: new Date().toISOString(), completionDate: today });
        const approverIds = task.approverTeamMemberIds || [];
        const approverNames = teamMemberNames(approverIds);
        const approvalEvent: ApprovalEvent = {
            taskId: task.id, correctionTaskId: latestResubmission?.correctionTaskId,
            changeRevisionId: latestResubmission?.changeRevisionId, cycle, outcome: 'approved',
            requiredChanges: latestResubmission?.requiredChanges, reason: latestResubmission?.reason,
            requestedByIds: latestResubmission?.requestedByIds || [], informedIds: latestResubmission?.informedIds || [],
            assignedTo: latestResubmission?.assignedTo || task.owner,
            responsibleTeamMemberIds: latestResubmission?.responsibleTeamMemberIds || task.responsibleTeamMemberIds || [],
            approverTeamMemberIds: approverIds,
            requestedAt: task.approvalRequestedDate || today, deliveredAt: latestResubmission?.deliveredAt,
            sentBackAt: latestResubmission?.sentBackAt, approvedAt: today,
            previousAttachmentKeys: latestResubmission?.previousAttachmentKeys || [], activeAttachmentKeys: activeAttachments,
        };
        // History wording: who signed off + what exactly was approved, so the feed is readable
        // without opening the task.
        const approvedBy = approverNames.length ? formatNameList(approverNames) : 'the approver';
        const approvedWhat = [
            `"${task.title}"`,
            task.deliverable?.trim() ? `(deliverable: ${task.deliverable.trim()})` : '',
            cycle > 1 ? `— approval cycle ${cycle}` : '',
        ].filter(Boolean).join(' ');
        const approvalHistoryContent = `Approved by ${approvedBy}: ${approvedWhat}.`;
        let newOpp = {
            ...baseOpp,
            tasks: baseOpp.tasks.map(item => item.id === task.id ? approvedTask : item),
            notes: appendChangeRevisionNoteEvent(baseOpp.notes || [], latestResubmission?.changeRevisionId, 'Approved', `${approvedBy} approved the revised deliverable for "${task.title}".`, today),
            history: sortHistoryEntries([{ id: crypto.randomUUID(), date: today, createdAt: new Date().toISOString(), approval: approvalEvent, content: approvalHistoryContent }, ...(baseOpp.history || [])]),
            lastUpdated: new Date().toISOString(),
        };
        newOpp = withTenderingWorkedDay(newOpp, today);
        localOppRef.current = newOpp;
        setLocalOpp(newOpp);
        onUpdate(newOpp, baseOpp.id, true);
        setSelectedTaskForEdit({ task: approvedTask });
    };

    /**
     * Decides the day a task is recorded as finished. When the task carries a due date that is not
     * today we can't guess, so the confirmation dialog is opened and the caller aborts; the dialog
     * then replays the original action through `retry` with the date the user picked.
     */
    const resolveCompletionDate = ({ task, isStatusChange, nextStatus, provided, retry }: {
        task: Task;
        isStatusChange: boolean;
        nextStatus?: TaskStatus;
        provided?: string;
        retry: (date: string) => void;
    }): string | undefined | typeof PENDING_COMPLETION_DATE => {
        if (provided) return provided;
        if (!isStatusChange || nextStatus !== 'Done') return undefined;
        const today = getTodayStr();
        if (!task.dueDate || task.dueDate === today) return today;
        setCompletionPrompt({ taskTitle: task.title, dueDate: task.dueDate, onPick: retry });
        return PENDING_COMPLETION_DATE;
    };

    /**
     * Board-level task patcher (checkbox toggles, subtask toggles, quick-assign) that works
     * without the task-detail modal being open. Mirrors updateTaskInModal's status side effects
     * (dependency block, timer stop, doneDate/worked-day bookkeeping, inline-task sync) but applies
     * the whole patch atomically so a status change bundled with e.g. a subtasks change can't clobber
     * each other from two separate setState calls reading the same stale `localOpp`.
     */
    const applyTaskFieldsDirect = (taskId: string, patch: Partial<Task>, completionDate?: string) => {
        // Always build from the latest committed/ref value. A prior task edit may still
        // be inside a React transition and therefore not be present in this render's
        // `localOpp` closure yet.
        const baseOpp = localOppRef.current;
        const task = baseOpp.tasks.find(t => t.id === taskId);
        if (!task) return;

        const finalPatch: Partial<Task> = { ...patch };
        // Keep quick status changes consistent with the full task editor. Missing
        // Information is an external assignment and must immediately surface in
        // the proposal card/general waiting indicators.
        if (finalPatch.status === 'Missing Info') {
            // Same rule as updateTaskInModal: the clock starts here, whether the task waits on a
            // named person or on an area that has no responsible registered yet.
            const hasTarget = (task.responsibleTeamMemberIds || []).length > 0 || (task.externalAreas || []).length > 0;
            finalPatch.owner = 'External Area';
            finalPatch.isAssignment = true;
            if (hasTarget && !task.responsibleRequestedDate) finalPatch.responsibleRequestedDate = getTodayStr();
        }
        if (finalPatch.status === 'Done' && task.isAssignment) {
            const today = getTodayStr();
            if (task.status === 'Missing Info' && (task.approverTeamMemberIds || []).length > 0) {
                finalPatch.status = 'Approval';
                finalPatch.responsibleDeliveredDate = task.responsibleDeliveredDate || today;
                finalPatch.approvalRequestedDate = task.approvalRequestedDate || today;
            } else if (task.status === 'Missing Info') {
                finalPatch.responsibleDeliveredDate = task.responsibleDeliveredDate || today;
            } else if (task.status === 'Approval') {
                finalPatch.approvalDeliveredDate = task.approvalDeliveredDate || today;
            }
        }
        const isStatusChange = finalPatch.status !== undefined && finalPatch.status !== task.status;

        if (isStatusChange) {
            const newStatus = finalPatch.status as TaskStatus;
            const currentTimerState = getTimerState();
            if (newStatus === 'Done' && currentTimerState.taskId === taskId && currentTimerState.isRunning) {
                confirmStop('Done');
                if (selectedTaskForEdit?.task.id === taskId) setSelectedTaskForEdit(null);
                return;
            }
            if (!validateTaskCompletion(taskId, newStatus)) return;
            if (newStatus === 'Done' && !task.dueDate && !finalPatch.dueDate) {
                finalPatch.dueDate = getTodayStr();
            }
        }

        // Ask when the work actually finished before committing the Done. The prompt re-enters
        // this same call with the picked date, so every caller (checkbox, subtasks, quick-assign)
        // gets the confirmation for free.
        const resolvedCompletion = resolveCompletionDate({ task, isStatusChange, nextStatus: finalPatch.status, provided: completionDate, retry: date => applyTaskFieldsDirect(taskId, patch, date) });
        if (resolvedCompletion === PENDING_COMPLETION_DATE) return;
        if (resolvedCompletion) finalPatch.completionDate = resolvedCompletion;
        else if (isStatusChange && task.status === 'Done') finalPatch.completionDate = undefined;

        const updatedTaskData: Task = syncAssignmentSubtasks({ ...task, ...finalPatch });
        let updatedTasks = baseOpp.tasks.map(t => t.id === taskId ? updatedTaskData : t);

        let updatedNotes = baseOpp.notes;
        if (finalPatch.status !== undefined || finalPatch.title !== undefined) {
            updatedNotes = baseOpp.notes.map(note => {
                if (!note.inlineTasks) return note;
                const hasUpdates = note.inlineTasks.some(it => it.linkedTaskId === taskId);
                if (!hasUpdates) return note;
                const newInlineTasks = note.inlineTasks.map(it => it.linkedTaskId !== taskId ? it : {
                    ...it,
                    isDone: finalPatch.status !== undefined ? finalPatch.status === 'Done' : it.isDone,
                    text: finalPatch.title !== undefined ? finalPatch.title : it.text
                });
                return { ...note, inlineTasks: newInlineTasks };
            });
        }

        let newOpp = { ...baseOpp, tasks: updatedTasks, notes: updatedNotes, lastUpdated: new Date().toISOString() };
        const autoSendsBack = isStatusChange && shouldAutoSendBackForApproval(updatedTaskData, baseOpp);
        if (isStatusChange && updatedTaskData.status === 'Done' && updatedTaskData.reworkForTaskId && !autoSendsBack) {
            const today = getTodayStr();
            newOpp = {
                ...newOpp,
                notes: appendChangeRevisionNoteEvent(newOpp.notes || [], updatedTaskData.changeRevisionId, 'Correction Completed', `The corrective task "${updatedTaskData.title}" is ready to send back for approval.`, today),
                history: sortHistoryEntries([{ id: crypto.randomUUID(), date: today, content: `Correction "${updatedTaskData.title}" completed; ready to send back for approval.` }, ...(newOpp.history || [])]),
            };
        }
        newOpp = syncAssignmentKpi(newOpp, updatedTaskData);
        if (isStatusChange && finalPatch.status === 'Done' && updatedTaskData.owner === 'Me') {
            newOpp = withTenderingWorkedDay(newOpp, updatedTaskData.completionDate || updatedTaskData.dueDate || getTodayStr());
        }
        localOppRef.current = newOpp;
        setLocalOpp(newOpp);
        onUpdate(newOpp);
        if (selectedTaskForEdit?.task.id === taskId) setSelectedTaskForEdit({ task: updatedTaskData });
        if (autoSendsBack) void sendCorrectionBackForApproval(taskId);
    };

    const toggleTaskDoneDirect = (task: Task) => {
        if (task.status === 'Approval') {
            void approveTask(task.id);
            return;
        }
        applyTaskFieldsDirect(task.id, { status: task.status === 'Done' ? 'Pending' : 'Done' });
    };

    const toggleSubtaskDirect = (task: Task, subtaskId: string) => {
        const updatedSubtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
        // Subtasks whose system left the Scope no longer count, so a leftover cannot keep the task open.
        const countable = countableSubtasks(updatedSubtasks);
        const allDone = countable.length > 0 && countable.every(s => s.completed);
        const patch: Partial<Task> = { subtasks: updatedSubtasks };
        if (allDone && task.status !== 'Done') patch.status = 'Done';
        else if (!allDone && task.status === 'Done') patch.status = 'In Progress';
        applyTaskFieldsDirect(task.id, patch);
    };

    const toggleTaskExpanded = (taskId: string) => {
        setExpandedTaskIds(prev => {
            const next = new Set(prev);
            next.has(taskId) ? next.delete(taskId) : next.add(taskId);
            return next;
        });
    };

    const toggleSubtasksExpanded = (taskId: string) => {
        setExpandedSubtaskIds(prev => {
            const next = new Set(prev);
            next.has(taskId) ? next.delete(taskId) : next.add(taskId);
            return next;
        });
    };

    const updateTaskInModal = (field: keyof Task, value: any, extraPatch?: Partial<Task>, completionDate?: string) => {
        if (!selectedTaskForEdit) return;

        const baseOpp = localOppRef.current;
        const latestTask = baseOpp.tasks.find(t => t.id === selectedTaskForEdit.task.id) || selectedTaskForEdit.task;

        // Missing Information always represents a request to an external area, and it is the moment
        // the assignment clock starts. A task can be waiting on a named person OR on an area with no
        // responsible registered yet — both count, so the request date is initialized for either.
        if (field === 'status' && value === 'Missing Info') {
            const hasTarget = (latestTask.responsibleTeamMemberIds || []).length > 0 || (latestTask.externalAreas || []).length > 0;
            extraPatch = {
                ...extraPatch,
                owner: 'External Area',
                isAssignment: true,
                ...(hasTarget && !latestTask.responsibleRequestedDate ? { responsibleRequestedDate: getTodayStr() } : {}),
            };
        }
        if (field === 'owner' && latestTask.status === 'Missing Info') {
            value = 'External Area';
            extraPatch = { ...extraPatch, isAssignment: true };
        }

        if (field === 'status' && value === 'Done' && selectedTaskForEdit.task.isAssignment) {
            const today = getTodayStr();
            if (selectedTaskForEdit.task.status === 'Missing Info' && (selectedTaskForEdit.task.approverTeamMemberIds || []).length > 0) {
                value = 'Approval';
                extraPatch = { ...extraPatch, responsibleDeliveredDate: selectedTaskForEdit.task.responsibleDeliveredDate || today, approvalRequestedDate: selectedTaskForEdit.task.approvalRequestedDate || today };
            } else if (selectedTaskForEdit.task.status === 'Missing Info') {
                extraPatch = { ...extraPatch, responsibleDeliveredDate: selectedTaskForEdit.task.responsibleDeliveredDate || today };
            } else if (selectedTaskForEdit.task.status === 'Approval') {
                extraPatch = { ...extraPatch, approvalDeliveredDate: selectedTaskForEdit.task.approvalDeliveredDate || today };
            }
        }
        // If marking as Done and there's an active timer for THIS task, we must stop it first to log the time.
        const currentTimerState = getTimerState();
        if (field === 'status' && value === 'Done' && currentTimerState.taskId === selectedTaskForEdit.task.id && currentTimerState.isRunning) {
            confirmStop('Done'); // This will call handleTimerLog which updates DB and status
            setSelectedTaskForEdit(null); // Close modal since task is done
            return;
        }

        if (field === 'status' && !validateTaskCompletion(selectedTaskForEdit.task.id, value)) {
            return;
        }

        const isMarkingDone = field === 'status'
            && value === 'Done'
            && selectedTaskForEdit.task.status !== 'Done';

        // Confirm the real completion day before committing (see resolveCompletionDate).
        const resolvedCompletion = resolveCompletionDate({
            task: selectedTaskForEdit.task,
            isStatusChange: field === 'status' && value !== selectedTaskForEdit.task.status,
            nextStatus: field === 'status' ? value : undefined,
            provided: completionDate,
            retry: date => updateTaskInModal(field, value, extraPatch, date),
        });
        if (resolvedCompletion === PENDING_COMPLETION_DATE) return;
        const clearsCompletion = field === 'status' && value !== 'Done' && selectedTaskForEdit.task.status === 'Done';

        const doneDate = isMarkingDone
            ? (resolvedCompletion || selectedTaskForEdit.task.dueDate || getTodayStr())
            : '';

        // Optimistically update selected task in modal â€” this is the ONLY update that
        // needs to be synchronous (it drives the immediate visual feedback in the modal).
        const updatedTaskData: Task = syncAssignmentSubtasks({
            ...latestTask,
            [field]: value,
            ...extraPatch,
            // Auto-assign today as dueDate when marking Done without a date
            ...(isMarkingDone && !selectedTaskForEdit.task.dueDate
                ? { dueDate: doneDate }
                : {}),
            ...(resolvedCompletion ? { completionDate: resolvedCompletion } : {}),
            ...(clearsCompletion ? { completionDate: undefined } : {}),
        });
        setSelectedTaskForEdit({ task: updatedTaskData });

        let updatedTasks = baseOpp.tasks.map(t => t.id === selectedTaskForEdit.task.id ? updatedTaskData : t);
        let updatedNotes = baseOpp.notes;

        // Sync to inline tasks if status or title changed
        if (field === 'status' || field === 'title') {
            updatedNotes = baseOpp.notes.map(note => {
                if (!note.inlineTasks) return note;
                const hasUpdates = note.inlineTasks.some(it => it.linkedTaskId === updatedTaskData.id);
                if (!hasUpdates) return note;

                const newInlineTasks = note.inlineTasks.map(it => {
                    if (it.linkedTaskId !== updatedTaskData.id) return it;
                    return {
                        ...it,
                        isDone: field === 'status' ? value === 'Done' : it.isDone,
                        text: field === 'title' ? value : it.text
                    };
                });
                return { ...note, inlineTasks: newInlineTasks };
            });
        }

        // PERF: Mark the expediente-wide re-render as a transition so React can interrupt
        // it for subsequent user input. The modal already shows the new value via the
        // setSelectedTaskForEdit above; the task list + other tabs behind the modal can
        // re-render at low priority without freezing the UI on rapid edits.
        let newOpp = { ...baseOpp, tasks: updatedTasks, notes: updatedNotes, lastUpdated: new Date().toISOString() };
        const autoSendsBack = isMarkingDone && shouldAutoSendBackForApproval(updatedTaskData, baseOpp);
        if (isMarkingDone && updatedTaskData.reworkForTaskId && !autoSendsBack) {
            const today = getTodayStr();
            newOpp = {
                ...newOpp,
                notes: appendChangeRevisionNoteEvent(newOpp.notes || [], updatedTaskData.changeRevisionId, 'Correction Completed', `The corrective task "${updatedTaskData.title}" is ready to send back for approval.`, today),
                history: sortHistoryEntries([{ id: crypto.randomUUID(), date: today, content: `Correction "${updatedTaskData.title}" completed; ready to send back for approval.` }, ...(newOpp.history || [])]),
            };
        }
        newOpp = syncAssignmentKpi(newOpp, updatedTaskData);
        if (isMarkingDone && updatedTaskData.owner === 'Me') {
            newOpp = withTenderingWorkedDay(newOpp, doneDate);
        }
        // Publish to the ref before yielding to the transition. Consecutive edits in
        // the same frame must see this result instead of overwriting it with stale data.
        localOppRef.current = newOpp;
        React.startTransition(() => {
            setLocalOpp(newOpp);
            onUpdate(newOpp);
        });
        if (autoSendsBack) void sendCorrectionBackForApproval(updatedTaskData.id);
    };

    const deleteTaskInModal = () => {
        if (!selectedTaskForEdit) return;
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        const updatedTasks = localOpp.tasks.filter(t => t.id !== selectedTaskForEdit.task.id);
        handleFieldChange('tasks', updatedTasks);
        setSelectedTaskForEdit(null);
        if (isSubView) onBack();
    };
    const moveSubtask = (index: number, direction: 'up' | 'down') => {
        if (!selectedTaskForEdit) return;
        const subtasks = [...selectedTaskForEdit.task.subtasks];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < subtasks.length) {
            [subtasks[index], subtasks[newIndex]] = [subtasks[newIndex], subtasks[index]];
            updateTaskInModal('subtasks', subtasks);
        }
    };
    const getStatusSummary = () => {
        const pending = localOpp.tasks.filter(t => t.status !== 'Done');
        const summary = `*STATUS REPORT: ${localOpp.id}*\nRemaining Tasks: ${pending.length}\n\n${pending.map(t => `- [${t.status}] ${t.title}`).join('\n')}`;
        navigator.clipboard.writeText(summary); alert("Status summary copied to clipboard.");
    };

    /**
     * Shared Helper: Normalizes all images in HTML to data URLs for reliable PDF rendering.
     */
    const normalizeImagesForPdf = async (html: string): Promise<string> => {
        if (!html) return "";
        const div = document.createElement('div');
        div.innerHTML = html;
        const imgs = Array.from(div.querySelectorAll('img'));

        await Promise.all(imgs.map(async (img) => {
            const src = img.getAttribute('src');
            if (!src) return;

            if (src.startsWith('data:')) {
                if (!img.complete) {
                    await new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve;
                        setTimeout(resolve, 5000);
                    });
                }
                return;
            }

            try {
                // Handle blob: and remote URLs with CORS consideration
                const response = await fetch(src);
                const blob = await response.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                img.setAttribute('src', dataUrl);
            } catch (e) {
                console.warn("PDF Image Normalization Warning:", src, e);
                // Fallback: leave as is, might fail in addImage but won't crash the loop
            }
        }));
        return div.innerHTML;
    };

    /**
     * Shared Helper: Renders note content (text, tables, images) to a jsPDF document.
     * Accepts autoTable as a parameter so the caller can pass the lazily-loaded library.
     */
    const renderNoteContentToPdf = async (doc: any, autoTable: any, html: string, currentY: number, pageWidth: number): Promise<number> => {
        let y = currentY;
        const normalizedHtml = await normalizeImagesForPdf(html);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = normalizedHtml;

        // 1. Text Content
        const parseText = (h: string): string => {
            let text = h;
            text = text.replace(/<h1>/g, '\n\n# ').replace(/<\/h1>/g, '\n');
            text = text.replace(/<h2>/g, '\n\n## ').replace(/<\/h2>/g, '\n');
            text = text.replace(/<h3>/g, '\n\n### ').replace(/<\/h3>/g, '\n');
            text = text.replace(/<p>/g, '\n').replace(/<\/p>/g, '\n');
            text = text.replace(/<br\s*\/?>/g, '\n');
            text = text.replace(/<li>/g, '\nâ€¢ ').replace(/<\/li>/g, '');
            text = text.replace(/<[^>]*>/g, '');
            const txt = document.createElement('textarea');
            txt.innerHTML = text;
            return txt.value.trim();
        };

        const plainText = parseText(normalizedHtml);
        const splitText = doc.splitTextToSize(plainText, pageWidth - 28);
        splitText.forEach((line: string) => {
            if (y > 275) { doc.addPage(); y = 20; }
            doc.text(line, 14, y);
            y += 5;
        });

        y += 8;

        // 2. Images
        const imgs = Array.from(tempDiv.querySelectorAll('img'));
        for (const img of imgs) {
            const src = img.getAttribute('src');
            if (!src || !src.startsWith('data:')) continue;
            try {
                const imgProps = doc.getImageProperties(src);
                const imgWidth = Math.min(pageWidth - 28, imgProps.width / 5);
                const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

                if (y + imgHeight > 275) { doc.addPage(); y = 20; }
                doc.addImage(src, 'PNG', 14, y, imgWidth, imgHeight);
                y += imgHeight + 10;
            } catch (e) {
                console.warn("Failed to render image to PDF", e);
            }
        }

        // 3. Tables
        const tables = Array.from(tempDiv.querySelectorAll('table'));
        for (const table of tables) {
            if (y > 240) { doc.addPage(); y = 20; }
            autoTable(doc, {
                html: table,
                startY: y + 5,
                theme: 'striped',
                headStyles: { fillColor: [61, 205, 88] },
                styles: { fontSize: 8 }
            });
            y = (doc as any).lastAutoTable.finalY + 12;
        }

        return y;
    };

    const linkNotesToTask = (taskId: string, noteIds: string[]) => {
        const task = localOpp.tasks.find(t => t.id === taskId);
        if (!task) return;
        const currentIds = task.linkedNoteIds || (task.linkedNoteId ? [task.linkedNoteId] : []) || [];
        const newIds = Array.from(new Set([...currentIds, ...noteIds]));
        const updatedTasks = localOpp.tasks.map(t => t.id === taskId ? { ...t, linkedNoteIds: newIds } : t);
        handleFieldChange('tasks', updatedTasks);
        if (selectedTaskForEdit && selectedTaskForEdit.task.id === taskId) {
            setSelectedTaskForEdit({ task: { ...selectedTaskForEdit.task, linkedNoteIds: newIds } });
        }
        setShowNotePickerForTask(null);
        setSelectedNotesToLink([]);
        setNoteSearch('');
    };

    const unlinkNoteFromTask = (taskId: string, noteId: string) => {
        const task = localOpp.tasks.find(t => t.id === taskId);
        if (!task) return;
        const currentIds = task.linkedNoteIds || (task.linkedNoteId ? [task.linkedNoteId] : []) || [];
        const newIds = currentIds.filter(id => id !== noteId);
        const updatedTasks = localOpp.tasks.map(t => t.id === taskId ? { ...t, linkedNoteIds: newIds, linkedNoteId: undefined } : t);
        handleFieldChange('tasks', updatedTasks);
        if (selectedTaskForEdit && selectedTaskForEdit.task.id === taskId) {
            setSelectedTaskForEdit({ task: { ...selectedTaskForEdit.task, linkedNoteIds: newIds } });
        }
    };

    const copyTaskSummary = async () => {
        if (!selectedTaskForEdit) return;
        const t = selectedTaskForEdit.task;
        let docTitles: string[] = [];
        try {
            const docs = await listLinkedForTask(localOpp.id, t.id);
            if (docs && docs.length > 0) {
                docTitles = docs.map(d => d.fileKey.split('/').pop() || d.fileKey);
            }
        } catch (e) { console.error("Failed to load docs for summary", e); }

        const noteTitles = (t.linkedNoteIds || (t.linkedNoteId ? [t.linkedNoteId] : [])).map(nid => {
            return localOpp.notes.find(n => n.id === nid)?.title;
        }).filter(Boolean) as string[];
        const originalApproval = t.reworkForTaskId ? localOpp.tasks.find(task => task.id === t.reworkForTaskId) : undefined;
        const correctionTasks = !t.reworkForTaskId ? localOpp.tasks.filter(task => task.reworkForTaskId === t.id) : [];
        const requestedBy = (t.changeRequestedByIds || []).map(id => localOpp.stakeholders?.find(person => person.id === id)?.name || id);
        const informed = (t.changeInformedIds || []).map(id => localOpp.stakeholders?.find(person => person.id === id)?.name || id);
        const workflowDetails = t.changeRevisionId || correctionTasks.length ? `
                                    Change revision:
                                    ${originalApproval ? `Original approval: ${originalApproval.title}` : ''}
                                    ${correctionTasks.length ? `Corrective tasks: ${correctionTasks.map(task => `${task.title} [${task.status}]`).join(', ')}` : ''}
                                    ${t.changeRequest ? `Required changes: ${t.changeRequest}` : ''}
                                    ${t.changeReason ? `Reason: ${t.changeReason}` : ''}
                                    ${requestedBy.length ? `Requested by: ${requestedBy.join(', ')}` : ''}
                                    ${informed.length ? `Informed: ${informed.join(', ')}` : ''}
                                    ${t.sentBackForApprovalAt ? `Sent back for approval: ${t.sentBackForApprovalAt}` : ''}
                                    ` : '';

        const summary = `
                                    Task: ${t.title}
                                    Due Date: ${t.dueDate}
                                    Status: ${t.status} | Priority: ${t.priority}
                                    Description:
                                    ${t.description}
                                    ${workflowDetails}

                                    Subtasks:
                                    ${(t.subtasks || []).map(s => `- [${s.completed ? 'x' : ' '}] ${s.title}`).join('\n')}

                                    Linked documents:
                                    ${docTitles.join('\n')}

                                    Linked notes:
                                    ${noteTitles.join('\n')}
                                    `.trim();
        navigator.clipboard.writeText(summary);
        alert("Task summary with links copied to clipboard!");
    };

    /**
     * Generates and downloads a comprehensive PDF documentation of the opportunity.
     * Includes overview, commercial summary, tasks, Q&A, history, and meeting notes.
     */
    const handleExportPDF = async () => {
        const { jsPDF, autoTable } = await loadPdfLibs();
        const doc = new jsPDF();
        const s = localOpp;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pdfMargin = { left: 14, right: 14, top: 14, bottom: 18 };
        const contentWidth = pageWidth - pdfMargin.left - pdfMargin.right;
        const ensurePdfSpace = (height: number) => {
            if (yPos + height > pageHeight - pdfMargin.bottom) {
                doc.addPage();
                yPos = pdfMargin.top;
            }
        };

        doc.setFillColor(61, 205, 88);
        doc.rect(0, 0, pageWidth, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text("Tender Documentation", pdfMargin.left, 16);

        let yPos = 40;
        doc.setTextColor(0);
        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        const splitTitle = doc.splitTextToSize(s.title, contentWidth);
        doc.text(splitTitle, pdfMargin.left, yPos);
        yPos += (splitTitle.length * 10) + 10;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        const headerText = `Customer: ${s.customer} | ID: ${s.id} | QLK: ${s.qlk || '-'} | Rev: ${s.revision}`;
        const splitHeader = doc.splitTextToSize(headerText, contentWidth);
        doc.text(splitHeader, pdfMargin.left, yPos);
        yPos += (splitHeader.length * 7) + 3;

        autoTable(doc, {
            startY: yPos,
            head: [['Parameter', 'Value']],
            body: [
                ['Submitted', s.dates.requested || '-'],
                ['Expected', s.dates.expected || '-'],
                ['Assigned', s.dates.assigned || '-'],
                ['Status', s.statusLabel]
            ],
            theme: 'striped',
            headStyles: { fillColor: [61, 205, 88] },
            margin: pdfMargin
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;

        // Quick Links Section in PDF
        // Quick Links Section in PDF (Updated for Array support)
        const rawQLinks = Array.isArray(s.links) ? s.links : (s.links ? Object.entries(s.links).map(([k, v]) => ({ id: k, type: 'link', label: k, url: v } as QuickLinkItem)) : []);
        // Honor the overview's per-opportunity renames and hidden default links.
        const hiddenQLinkIds = new Set(s.hiddenQuickLinks || []);
        const qLinks = rawQLinks
            .filter(link => !hiddenQLinkIds.has(link.id))
            .map(link => ({ ...link, label: s.quickLinkLabels?.[link.id]?.trim() || link.label }));

        if (qLinks.length > 0) {
            ensurePdfSpace(18);
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0);
            doc.text("Quick Links", pdfMargin.left, yPos);
            yPos += 6;

            const quickLinkRows = qLinks.map((link: QuickLinkItem) => {
                if (link.type === 'heading') {
                    return [{ content: link.label.toUpperCase(), colSpan: 2, styles: { fontStyle: 'bold', textColor: [61, 205, 88], fillColor: [248, 250, 252] } }];
                }
                if (link.type === 'separator') {
                    return [{ content: '', colSpan: 2, styles: { minCellHeight: 1, fillColor: [230, 230, 230] } }];
                }
                return [link.label || '-', link.url || ''];
            });

            autoTable(doc, {
                startY: yPos,
                body: quickLinkRows,
                theme: 'grid',
                margin: pdfMargin,
                styles: {
                    fontSize: 8,
                    cellPadding: 2,
                    overflow: 'linebreak',
                    valign: 'top'
                },
                columnStyles: {
                    0: { cellWidth: 42, fontStyle: 'bold', textColor: [61, 205, 88] },
                    1: { cellWidth: contentWidth - 42 }
                },
                didParseCell: (data: any) => {
                    if (data.section === 'body' && data.column.index === 0 && data.cell.raw) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.textColor = [61, 205, 88];
                    }
                },
                didDrawCell: (data: any) => {
                    if (data.section === 'body' && data.column.index === 1 && typeof data.cell.raw === 'string' && data.cell.raw) {
                        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: data.cell.raw });
                    }
                }
            });
            yPos = (doc as any).lastAutoTable.finalY + 12;
        }

        if (s.commercial) {
            ensurePdfSpace(48);
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0);
            doc.text("Commercial Summary", pdfMargin.left, yPos);
            yPos += 8;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0);
            doc.text(`Official reference margin: ${s.commercial.cqaOfficialMargin}%`, pdfMargin.left, yPos);
            yPos += 10;
            doc.setFontSize(16); // Larger size
            doc.setFont(undefined, 'bold');
            doc.setTextColor(61, 205, 88); // Bold green
            doc.text(`CQA TOTAL SELL PRICE: $${s.commercial.cqaOfficialSellPrice.toLocaleString()}`, pdfMargin.left, yPos);
            doc.setTextColor(0);
            yPos += 15;

            if (s.commercial.discountsAndNotes?.trim()) {
                ensurePdfSpace(25);
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text("Commercial Annotations", pdfMargin.left, yPos);
                yPos += 6;
                doc.setFont(undefined, 'normal');
                const notes = doc.splitTextToSize(s.commercial.discountsAndNotes, contentWidth);
                doc.text(notes, pdfMargin.left, yPos);
                yPos += (notes.length * 5) + 8;
            }
        }

        if (s.tasks && s.tasks.length > 0) {
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Tasks & Action Plan", 14, yPos);
            yPos += 8;

            // Sort tasks: Order -> DueDate -> Title
            const sortedTasks = [...s.tasks].sort((a, b) => {
                if (a.order !== null && b.order !== null) return a.order - b.order;
                if (a.order !== null) return -1;
                if (b.order !== null) return 1;
                if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return (a.title || "").localeCompare(b.title || "");
            });

            // Pre-fetch linked documents for all tasks to include in body
            const taskDocMap: Record<string, string[]> = {};
            for (const t of sortedTasks) {
                try {
                    const docs = await listLinkedForTask(s.id, t.id);
                    if (docs && docs.length > 0) {
                        taskDocMap[t.id] = docs.map(d => d.fileKey.split('/').pop() || d.fileKey);
                    }
                } catch (e) { }
            }

            autoTable(doc, {
                startY: yPos,
                head: [['Task Details', 'Status', 'Due Info']],
                body: sortedTasks.map(t => {
                    // Build complex details string
                    let details = `${t.title.toUpperCase()}\n`;
                    if (t.description) details += `Desc: ${t.description}\n`;

                    // Subtasks
                    if (t.subtasks && t.subtasks.length > 0) {
                        details += `Subtasks: ${t.subtasks.map(st => `${st.completed ? '[x]' : '[ ]'} ${st.title}`).join(', ')}\n`;
                    }

                    // Dependencies
                    if (t.dependsOnTaskIds && t.dependsOnTaskIds.length > 0) {
                        const depTitles = t.dependsOnTaskIds.map(id => s.tasks.find(tk => tk.id === id)?.title).filter(Boolean);
                        details += `Blocked by: ${depTitles.join(', ')}\n`;
                    }

                    // Linked Notes
                    const noteTitles = (t.linkedNoteIds || (t.linkedNoteId ? [t.linkedNoteId] : [])).map(nid => s.notes.find(n => n.id === nid)?.title).filter(Boolean);
                    if (noteTitles.length > 0) details += `Notes: ${noteTitles.join(', ')}\n`;

                    // Linked Documents (New)
                    if (taskDocMap[t.id] && taskDocMap[t.id].length > 0) {
                        details += `Docs: ${taskDocMap[t.id].join(', ')}\n`;
                    }

                    return [
                        details.trim(),
                        t.status,
                        `${t.dueDate}\nPriority: ${t.priority}\nArea: ${t.owner === 'External Area' ? (t.externalAreas || []).join(', ') : t.owner}`
                    ];
                }),
                theme: 'grid',
                headStyles: { fillColor: [61, 205, 88] },
                styles: { fontSize: 8, cellPadding: 4 },
                columnStyles: { 0: { cellWidth: 100 } }
            });
            yPos = (doc as any).lastAutoTable.finalY + 15;
        }

        if (s.history && s.history.length > 0) {
            if (yPos > 250) { doc.addPage(); yPos = 20; }
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Opportunity History", 14, yPos);
            yPos += 8;
            s.history.sort((a, b) => b.date.localeCompare(a.date)).forEach(h => {
                if (yPos > 270) { doc.addPage(); yPos = 20; }
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text(h.date, 14, yPos);
                doc.setFont(undefined, 'normal');
                const splitText = doc.splitTextToSize(h.content, pageWidth - 50);
                doc.text(splitText, 40, yPos);
                yPos += (splitText.length * 5) + 5;
            });
            yPos += 10;
        }

        if (s.notes && s.notes.length > 0) {
            doc.addPage();
            yPos = 20;
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            doc.text("Meeting Notes Detail", 14, yPos);
            yPos += 15;
            for (const note of s.notes) {
                if (yPos > 250) { doc.addPage(); yPos = 20; }
                doc.setFontSize(14);
                doc.setTextColor(61, 205, 88);
                doc.setFont(undefined, 'bold');
                doc.text(note.title, 14, yPos);
                yPos += 6;
                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.setFont(undefined, 'normal');
                doc.text(`${note.date} | Type: ${note.type}`, 14, yPos);
                yPos += 8;

                const linkedTasks = getLinkedTasksForNote(note.id);
                let linkedDocsText = "";
                try {
                    const docs = await listLinkedForNote(s.id, note.id);
                    if (docs && docs.length > 0) {
                        linkedDocsText = docs.map(d => d.fileKey.split('/').pop()).join(', ');
                    }
                } catch (e) { }

                if (linkedTasks.length > 0 || linkedDocsText) {
                    doc.setFont(undefined, 'bold');
                    if (linkedTasks.length > 0) {
                        doc.text(`Linked Tasks: ${linkedTasks.map(t => t.title).join(', ')}`, 14, yPos);
                        yPos += 5;
                    }
                    if (linkedDocsText) {
                        doc.text(`Linked Documents: ${linkedDocsText}`, 14, yPos);
                        yPos += 5;
                    }
                    yPos += 4;
                }

                doc.setTextColor(0);
                doc.setFont(undefined, 'normal');

                // Render note content with centralized helper (text, images, tables)
                yPos = await renderNoteContentToPdf(doc, autoTable, note.content, yPos, pageWidth);
                yPos += 10;
            }
        }

        // Generate filename based on opportunity title (sanitized)
        const sanitizedTitle = s.title.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_');
        const fileName = `Documentation_${sanitizedTitle}.pdf`;

        // Use File System Access API if available for "Save As" behavior
        // @ts-ignore
        if (window.showSaveFilePicker) {
            try {
                // @ts-ignore
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'PDF Document',
                        accept: { 'application/pdf': ['.pdf'] },
                    }],
                });
                const blob = doc.output('blob');
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('Save File Picker failed:', err);
                    doc.save(fileName);
                }
            }
        } else {
            doc.save(fileName);
        }
    };

    const generateExecutiveSummary = () => {
        const s = localOpp;
        const quickLinkUrls = normalizeQuickLinks(s.links).defaultUrls;
        const requestedDate = s.dates?.requested || '-';
        const expectedDate = s.dates?.expected || '-';
        const cqaSellPrice = s.commercial?.cqaOfficialSellPrice
            ? `$${s.commercial.cqaOfficialSellPrice.toLocaleString()}`
            : '-';
        const cqaMargin = s.commercial?.cqaOfficialMargin
            ? `${s.commercial.cqaOfficialMargin}%`
            : '-';

        const text = [
            `EXECUTIVE SUMMARY - ${s.title || '-'}`,
            '',
            `Submitted Date: ${requestedDate}`,
            `Expected Completion Date: ${expectedDate}`,
            '',
            'Executive Notes',
            s.presentation?.executiveSummary || '-',
            '',
            'Commercial Information',
            `CQA Sell Price: ${cqaSellPrice}`,
            `GM CCO: ${cqaMargin}`,
            `Notes / Discounts Logic: ${s.commercial?.discountsAndNotes || '-'}`,
            '',
            'Required Links',
            `SR Link: ${quickLinkUrls.srLink || '-'}`,
            `CQA 2.0 Link: ${quickLinkUrls.cqaLink || '-'}`,
        ].join('\n');
        navigator.clipboard.writeText(text);
        alert("Executive summary copied to clipboard!");
    };

    const handleDocSelect = async (keys: string[]) => {
        if (!showDocPicker) return;
        const { type, id } = showDocPicker;
        for (const key of keys) {
            // Preserve every existing connection on the document. Passing [id]
            // directly used to replace links to other tasks/notes.
            const existing = await getMeta(opportunity.id, key);
            await saveMeta(opportunity.id, key, type === 'task'
                ? { linkedTaskIds: Array.from(new Set([...(existing?.linkedTaskIds || []), id])) }
                : { linkedNoteIds: Array.from(new Set([...(existing?.linkedNoteIds || []), id])) });
        }
        if (type === 'task') {
            const docs = await listLinkedForTask(opportunity.id, id);
            setLinkedTaskDocCounts(prev => ({ ...prev, [id]: docs.length }));
            setExpandedTaskIds(prev => new Set(prev).add(id));
        }
        setShowDocPicker(null);
        setRefreshKey(prev => prev + 1);
    };

    const handleLinkedTaskDocCount = useCallback((taskId: string, count: number) => {
        setLinkedTaskDocCounts(prev => prev[taskId] === count ? prev : { ...prev, [taskId]: count });
        if (count === 0) {
            setExpandedTaskIds(prev => {
                if (!prev.has(taskId)) return prev;
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
        }
    }, []);

    const navigateToFile = (fileKey: string) => {
        setFolderNavTarget(fileKey);
        setActiveTabSafe('folder');
    };

    const updateTaskDetails = (taskId: string, updates: Partial<Task>) => {
        const existingTask = localOpp.tasks.find(t => t.id === taskId);
        const isMarkingDone = existingTask
            && updates.status === 'Done'
            && existingTask.status !== 'Done';
        const doneDate = isMarkingDone ? (existingTask.dueDate || getTodayStr()) : '';
        const updatedTasks = localOpp.tasks.map(t => {
            if (t.id !== taskId) return t;
            return {
                ...t,
                ...updates,
                ...(isMarkingDone && !t.dueDate ? { dueDate: doneDate } : {}),
            };
        });
        if (isMarkingDone) {
            const updated = withTenderingWorkedDay({ ...localOpp, tasks: updatedTasks, lastUpdated: new Date().toISOString() }, doneDate);
            setLocalOpp(updated);
            onUpdate(updated);
            return;
        }
        handleFieldChange('tasks', updatedTasks);
    };

    const handleTaskDrop = (id: string, type: string, newDate: string) => {
        if (type === 'task') {
            updateTaskDetails(id, { dueDate: newDate });
        }
    };

    // --- Inline Task Handlers ---

    const handleAddInlineTask = (noteId: string) => {
        // Fix: Ensure noteId exists before proceeding
        if (!noteId) return;

        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        if (noteIndex === -1) return;

        const note = localOpp.notes[noteIndex];
        const newInlineTask: InlineTask = {
            id: crypto.randomUUID(),
            text: '',
            isDone: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString() // Added missing field
        };

        const currentInlineTasks = note.inlineTasks || [];
        const updatedNote = { ...note, inlineTasks: [...currentInlineTasks, newInlineTask] };

        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = updatedNote;

        // Update state and persist
        handleFieldChange('notes', updatedNotes);
    };

    const handleInlineTaskChange = (noteId: string, taskId: string, changes: Partial<InlineTask>, completionDate?: string) => {
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        if (noteIndex === -1) return;
        const note = localOpp.notes[noteIndex];
        const inlineTasks = note.inlineTasks || [];
        const taskIndex = inlineTasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const oldTask = inlineTasks[taskIndex];
        const updatedTask = { ...oldTask, ...changes, updatedAt: new Date().toISOString() };

        if (updatedTask.linkedTaskId && changes.hasOwnProperty('isDone')) {
            const linked = localOpp.tasks.find(task => task.id === updatedTask.linkedTaskId);
            if (linked?.status === 'Approval') {
                alert('Use the Approve button to complete an approval.');
                return;
            }
            if (linked?.status === 'Changes Requested / Rework') {
                alert('Complete the linked corrective task first. The original approval cannot be completed from a note.');
                return;
            }
            const wasExplicitlyApproved = linked?.status === 'Done' && approvalEventsForTask(localOpp.history || [], linked.id).some(entry => entry.outcome === 'approved');
            if (!updatedTask.isDone && wasExplicitlyApproved) {
                alert('An approved task cannot be reopened from a note. Create a Change Revision instead.');
                return;
            }
        }

        // Ticking an inline checkbox completes the linked task too, so it goes through the same
        // "when did you finish this?" confirmation (see resolveCompletionDate).
        const linkedForCompletion = updatedTask.linkedTaskId && changes.hasOwnProperty('isDone') && updatedTask.isDone
            ? localOpp.tasks.find(task => task.id === updatedTask.linkedTaskId)
            : undefined;
        const resolvedCompletion = linkedForCompletion
            ? resolveCompletionDate({
                task: linkedForCompletion,
                isStatusChange: linkedForCompletion.status !== 'Done',
                nextStatus: 'Done',
                provided: completionDate,
                retry: date => handleInlineTaskChange(noteId, taskId, changes, date),
            })
            : undefined;
        if (resolvedCompletion === PENDING_COMPLETION_DATE) return;

        const newInlineTasks = [...inlineTasks];
        newInlineTasks[taskIndex] = updatedTask;

        const updatedNote = { ...note, inlineTasks: newInlineTasks };
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = updatedNote;

        // Sync to linked Task if needed
        let updatedTasks = localOpp.tasks;
        if (updatedTask.linkedTaskId) {
            const linkedTaskIndex = localOpp.tasks.findIndex(t => t.id === updatedTask.linkedTaskId);
            if (linkedTaskIndex !== -1) {
                const linkedTask = localOpp.tasks[linkedTaskIndex];
                let taskUpdates: Partial<Task> = {};

                let doneDate = '';
                if (changes.hasOwnProperty('isDone')) {
                    const newStatus = updatedTask.isDone ? 'Done' : (linkedTask.status === 'Done' ? 'Pending' : linkedTask.status);
                    if (newStatus !== linkedTask.status) {
                        taskUpdates.status = newStatus;
                        if (newStatus === 'Done' && !linkedTask.dueDate) {
                            doneDate = getTodayStr();
                            taskUpdates.dueDate = doneDate;
                        } else if (newStatus === 'Done') {
                            doneDate = linkedTask.dueDate || getTodayStr();
                        }
                        if (newStatus === 'Done') {
                            taskUpdates.completedAt = new Date().toISOString();
                            if (resolvedCompletion) {
                                taskUpdates.completionDate = resolvedCompletion;
                                doneDate = resolvedCompletion;
                            }
                            if (linkedTask.reworkForTaskId && linkedTask.owner === 'External Area') taskUpdates.responsibleDeliveredDate = getTodayStr();
                        } else if (linkedTask.status === 'Done') {
                            taskUpdates.completedAt = undefined;
                            taskUpdates.completionDate = undefined;
                        }
                    }
                }
                if (changes.hasOwnProperty('text')) {
                    if (updatedTask.text !== linkedTask.title) taskUpdates.title = updatedTask.text || 'Note Task';
                }

                if (Object.keys(taskUpdates).length > 0) {
                    updatedTasks = [...localOpp.tasks];
                    updatedTasks[linkedTaskIndex] = syncAssignmentSubtasks({ ...linkedTask, ...taskUpdates });
                }
            }
        }

        // PERF: inline-task edits fire frequently (checkbox toggles, text commits);
        // mark the heavy setLocalOpp as a transition so React can interrupt the
        // expediente-wide re-render when the user interacts with something else.
        let newOpp = { ...localOpp, notes: updatedNotes, tasks: updatedTasks, lastUpdated: new Date().toISOString() };
        let autoSendBackTaskId = '';
        if (updatedTask.linkedTaskId && changes.hasOwnProperty('isDone') && updatedTask.isDone) {
            const linkedTask = localOpp.tasks.find(t => t.id === updatedTask.linkedTaskId);
            newOpp = withTenderingWorkedDay(newOpp, resolvedCompletion || linkedTask?.dueDate || getTodayStr());
            if (linkedTask?.reworkForTaskId) {
                const completedCorrection = newOpp.tasks.find(task => task.id === linkedTask.id);
                const autoSendsBack = !!completedCorrection && shouldAutoSendBackForApproval(completedCorrection, newOpp);
                if (autoSendsBack) autoSendBackTaskId = linkedTask.id;
                else {
                    const today = getTodayStr();
                    newOpp = {
                        ...newOpp,
                        notes: appendChangeRevisionNoteEvent(newOpp.notes || [], linkedTask.changeRevisionId, 'Correction Completed', `The corrective task "${linkedTask.title}" is ready to send back for approval.`, today),
                        history: sortHistoryEntries([{ id: crypto.randomUUID(), date: today, createdAt: new Date().toISOString(), content: `Correction "${linkedTask.title}" completed; ready to send back for approval.` }, ...(newOpp.history || [])]),
                    };
                }
                if (completedCorrection) newOpp = syncAssignmentKpi(newOpp, completedCorrection);
            }
        }
        // sendCorrectionBackForApproval reads localOppRef, so the completed correction has to be
        // visible there before it runs.
        localOppRef.current = newOpp;
        React.startTransition(() => {
            setLocalOpp(newOpp);
            onUpdate(newOpp);
        });
        if (autoSendBackTaskId) void sendCorrectionBackForApproval(autoSendBackTaskId);
    };

    const handleCreateLinkedTask = (noteId: string, inlineTask: InlineTask) => {
        const newTask: Task = {
            id: crypto.randomUUID(),
            title: inlineTask.text || 'Note Task',
            description: '',
            status: inlineTask.isDone ? 'Done' : 'Pending',
            priority: 'Medium',
            owner: 'Me',
            externalAreas: [],
            responsible: '',
            dueDate: getTodayStr(),
            stageContext: localOpp.stage,
            subtasks: [],
            linkedNoteIds: [noteId],
            order: null,
            dependsOnTaskIds: [],
            blockDoneUntilDependenciesDone: false
        };

        const updatedTasks = [...localOpp.tasks, newTask];

        // Update inline task with link
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        const note = localOpp.notes[noteIndex];
        const newInlineTasks = note.inlineTasks!.map(t => t.id === inlineTask.id ? { ...t, linkedTaskId: newTask.id } : t);
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = { ...note, inlineTasks: newInlineTasks };

        const newOpp = { ...localOpp, tasks: updatedTasks, notes: updatedNotes, lastUpdated: new Date().toISOString() };
        setLocalOpp(newOpp);
        onUpdate(newOpp);
    };

    const createLinkedTaskForNote = (noteId: string) => {
        const newTask: Task = {
            id: crypto.randomUUID(), title: 'New note task', description: '', status: 'Pending', priority: 'Medium',
            owner: 'Me', externalAreas: [], responsible: '', dueDate: getTodayStr(), stageContext: localOpp.stage,
            subtasks: [], linkedNoteIds: [noteId], order: null, dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false
        };
        const noteIndex = localOpp.notes.findIndex(note => note.id === noteId);
        if (noteIndex < 0) return;
        const note = localOpp.notes[noteIndex];
        const inlineTask: InlineTask = { id: crypto.randomUUID(), text: newTask.title, isDone: false, linkedTaskId: newTask.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const notes = [...localOpp.notes];
        notes[noteIndex] = { ...note, inlineTasks: [...(note.inlineTasks || []), inlineTask] };
        const updated = { ...localOpp, tasks: [...localOpp.tasks, newTask], notes, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        onUpdate(updated);
    };

    const handleUnlinkInlineTask = (noteId: string, inlineTask: InlineTask) => {
        // Clear linkedTaskId in note only
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        const note = localOpp.notes[noteIndex];
        const newInlineTasks = note.inlineTasks!.map(t => t.id === inlineTask.id ? { ...t, linkedTaskId: undefined } : t);
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = { ...note, inlineTasks: newInlineTasks };

        handleFieldChange('notes', updatedNotes);
    };

    const handleDeleteInlineTask = (noteId: string, taskId: string) => {
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        const note = localOpp.notes[noteIndex];
        const newInlineTasks = note.inlineTasks!.filter(t => t.id !== taskId);
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = { ...note, inlineTasks: newInlineTasks };

        handleFieldChange('notes', updatedNotes);
    };

    /**
     * Exports ALL tasks of the current opportunity to an Excel (.xlsx) file.
     * - Always uses all tasks, ignoring any active visual filter.
     * - Sorted by internal numeric order (order field), not shown in output.
     * - Works in both editable and read-only (snapshot) modes.
     */
    const exportTasksToExcel = async () => {
        const allTasks = [...localOpp.tasks].sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));

        if (allTasks.length === 0) {
            alert('No tasks to export.');
            return;
        }

        const rows = allTasks.map(task => {
            // Status: use friendly display value directly (already human-readable in the type)
            const status = task.status || 'Pending';

            // TaskName: fall back to placeholder so a corrupt/empty task is still visible
            const taskName = (task.title && task.title.trim()) ? task.title.trim() : '[No Title]';

            // Sub-task: all subtasks grouped in one cell, newline-separated
            const subTaskCell = (task.subtasks && task.subtasks.length > 0)
                ? task.subtasks.map((st, i) => `${i + 1}. [${st.completed ? 'x' : ' '}] ${st.title || ''}`.trimEnd()).join('\n')
                : '';

            // DueDate: MM/DD/YYYY, fallback to "Pending"
            let dueDate = 'Pending';
            if (task.dueDate && task.dueDate.trim()) {
                try {
                    const parts = task.dueDate.split('-');
                    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                        dueDate = `${parts[1]}/${parts[2]}/${parts[0]}`;
                    }
                } catch {
                    dueDate = 'Pending';
                }
            }

            return {
                'Status': status,
                'TaskName': taskName,
                'Sub-task': subTaskCell,
                'DueDate': dueDate,
            };
        });

        try {
            // Dynamic import â€” xlsx is already a project dependency (used in tender-flow and previews)
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(rows);

            // Column widths for readability
            ws['!cols'] = [
                { wch: 16 },  // Status
                { wch: 42 },  // TaskName
                { wch: 52 },  // Sub-task
                { wch: 14 },  // DueDate
            ];

            XLSX.utils.book_append_sheet(wb, ws, 'Tasks');

            // Filename: [OP_ID]_Tasks_[OpportunityTitle].xlsx â€” sanitize invalid chars
            const sanitize = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
            const fileName = `${sanitize(localOpp.id)}_Tasks_${sanitize(localOpp.title)}.xlsx`;

            XLSX.writeFile(wb, fileName);
        } catch (err) {
            console.error('[exportTasksToExcel] Failed:', err);
            alert('Failed to export tasks. Please try again.');
        }
    };

    // New: Handle opening Split View from inline task
    const handleOpenSplitView = (task: Task, noteId: string) => {
        setSelectedTaskForEdit({ task });
        setSplitViewNoteId(noteId);
    };

    const currentNote = localOpp.notes.find(n => n.id === selectedNoteId);

    const sowTeamMembers = React.useMemo(() => {
        const fromSow = collectSowTeamMembers(localOpp.notes);
        const fromStakeholders = (localOpp.stakeholders || []).flatMap(person => {
            const roles = person.roles?.length ? person.roles : (person.role ? [person.role] : ['Stakeholder']);
            return roles.map(role => ({ id: person.id, name: person.name, area: person.roleContexts?.[role] ? `${role} · ${person.roleContexts[role]}` : role }));
        }).filter(m => m.name);
        const seen = new Set<string>();
        return [...fromStakeholders, ...fromSow].filter(m => !seen.has(m.id) && !!seen.add(m.id));
    }, [localOpp.notes, localOpp.stakeholders]);

    /** A stakeholder-derived member carries its area as "Role · context"; the plain area is the key. */
    const areaKey = (area: string) => (area || '').split(' · ')[0].trim();
    const sameArea = (a: string, b: string) => !!a && !!b && a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

    /** Areas offered by the External Area picker: the globally tracked areas plus every area the
     *  opportunity team already uses. */
    const areaOptions = React.useMemo(() => {
        const set = new Set<string>();
        (trackedAreas || []).forEach(area => { const key = areaKey(area); if (key) set.add(key); });
        sowTeamMembers.forEach(member => { const key = areaKey(member.area); if (key) set.add(key); });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [trackedAreas, sowTeamMembers]);

    /** People this opportunity already has registered for an area. */
    const peopleForArea = (area: string) => sowTeamMembers.filter(member => sameArea(areaKey(member.area), areaKey(area)));

    /**
     * External Area assignment is area-first: the user picks the area, and when the opportunity has
     * exactly one person registered for it that person is filled in automatically. With several
     * candidates — or none — the task stays on the area alone until someone is picked by hand.
     * The assignment clock is deliberately NOT started here: `responsibleRequestedDate` is only set
     * once the task is moved to Missing Info (see updateTaskInModal / applyTaskFieldsDirect).
     */
    const applyExternalAreas = (nextAreas: string[]) => {
        if (!selectedTaskForEdit) return;
        const task = selectedTaskForEdit.task;
        const prevAreas = task.externalAreas || [];
        const removed = prevAreas.filter(area => !nextAreas.includes(area));
        const added = nextAreas.filter(area => !prevAreas.includes(area));

        let ids = [...(task.responsibleTeamMemberIds || [])];
        // Drop people whose only reason for being on the task was an area just removed.
        if (removed.length) {
            ids = ids.filter(id => {
                const member = sowTeamMembers.find(m => m.id === id);
                if (!member) return true;
                return !removed.some(area => sameArea(areaKey(member.area), area));
            });
        }
        added.forEach(area => {
            const candidates = peopleForArea(area);
            if (candidates.length === 1 && !ids.includes(candidates[0].id)) ids.push(candidates[0].id);
        });

        const hasTarget = nextAreas.length > 0 || ids.length > 0;
        updateTaskInModal('externalAreas', nextAreas, {
            responsibleTeamMemberIds: ids,
            responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
            ...(hasTarget
                ? { isAssignment: true }
                : { responsibleRequestedDate: '', responsibleDueDate: '', responsibleDeliveredDate: '' }),
        });
    };

    /** Areas on the task that still have nobody assigned — surfaced so the user knows the task is
     *  waiting on an area rather than on a person. */
    const areasWithoutResponsible = (task: Task) => {
        const ids = task.responsibleTeamMemberIds || [];
        return (task.externalAreas || []).filter(area => !peopleForArea(area).some(person => ids.includes(person.id)));
    };

    /** Person-first quick assign (board rows, email composer): keep the areas the task already
     *  carries and add the ones the picked people belong to, so an area chosen by hand in the task
     *  editor is never silently overwritten. */
    const mergeAreasForMembers = (task: Task | undefined, ids: string[]) => Array.from(new Set([
        ...(task?.externalAreas || []),
        ...ids.map(id => memberById(id).area).filter(Boolean),
    ]));

    /**
     * Resolves a team-member id to its name and area. `sowTeamMembers` is derived from component
     * state, so a contact created seconds ago is not in it yet; the stakeholder list on the ref
     * is, which is what makes "create and assign" resolve to a real name instead of an empty one.
     */
    const memberById = (id: string): { name: string; area: string } => {
        const member = sowTeamMembers.find(m => m.id === id);
        if (member) return { name: member.name, area: areaKey(member.area) };
        const person = (localOppRef.current.stakeholders || []).find(p => p.id === id);
        if (person) {
            const roles = person.roles?.length ? person.roles : (person.role ? [person.role] : []);
            return { name: person.name, area: areaKey(roles[0] || '') };
        }
        // Legacy SOW ids are "name|area".
        return id.includes('|')
            ? { name: id.split('|')[0].trim(), area: areaKey(id.split('|').slice(1).join('|')) }
            : { name: '', area: '' };
    };

    /** The task currently open in either editor, read fresh from the ref. */
    const editedTask = () => {
        const id = selectedTaskForEdit?.task.id;
        return (id ? localOppRef.current.tasks.find(t => t.id === id) : undefined) || selectedTaskForEdit?.task;
    };

    /**
     * Sets the responsible people of the task open in an editor. Shared by the full modal and the
     * sub-view so the two can never drift, and reused when a contact is created from the picker.
     */
    const setModalResponsibleIds = (ids: string[]) => {
        const task = editedTask();
        if (!task) return;
        // Keep the areas chosen by hand and add the ones the picked people belong to.
        const nextAreas = Array.from(new Set([...(task.externalAreas || []), ...ids.map(id => memberById(id).area).filter(Boolean)]));
        updateTaskInModal('responsibleTeamMemberIds', ids, {
            responsible: ids.map(id => memberById(id).name).filter(Boolean).join(', '),
            externalAreas: nextAreas,
            // The clock is started by the move to Missing Info, not by picking a person.
            ...(ids.length > 0 || nextAreas.length > 0 ? { isAssignment: true } : {}),
            // Clear the (now hidden) requested/due-back/delivered dates when nothing is targeted anymore.
            ...(ids.length === 0 && nextAreas.length === 0 ? { responsibleRequestedDate: '', responsibleDueDate: '', responsibleDeliveredDate: '' } : {})
        });
    };

    /**
     * Adds a contact created from a picker to the field that asked for it. The contact modal
     * resolves after the picker rendered, so the current selection is re-read from the ref.
     */
    const addCreatedMemberToEditedTask = (field: 'responsibleTeamMemberIds' | 'approverTeamMemberIds' | 'informedTeamMemberIds', personId: string) => {
        const task = editedTask();
        if (!task) return;
        const current = (task[field] || []) as string[];
        if (current.includes(personId)) return;
        const next = [...current, personId];
        if (field === 'responsibleTeamMemberIds') setModalResponsibleIds(next);
        else updateTaskInModal(field, next, { isAssignment: true });
    };

    /** Same, for the quick-assign pickers on the board rows, which write without the editor open. */
    const addCreatedMemberToBoardTask = (taskId: string, personId: string) => {
        const task = localOppRef.current.tasks.find(t => t.id === taskId);
        if (!task) return;
        const current = task.responsibleTeamMemberIds || [];
        if (current.includes(personId)) return;
        const ids = [...current, personId];
        applyTaskFieldsDirect(taskId, {
            responsibleTeamMemberIds: ids,
            responsible: ids.map(id => memberById(id).name).filter(Boolean).join(', '),
            owner: 'External Area',
            externalAreas: mergeAreasForMembers(task, ids),
        });
    };

    /**
     * Scope attached to a task.
     *
     * The Scope is single and lives in the SOW note — attaching it to a task does not copy it,
     * it marks which task the Scope is the deliverable of. Any task can carry it, and more than
     * one may. Once the Scope reads as filled the task offers to close itself; answering "not yet"
     * stores the current signature so the offer returns only after the Scope changes again.
     * Rendered once and used by both task editors (full modal and sub-view).
     */
    const renderTaskScopeSection = (task: Task) => {
        const attached = !!task.scopeAttached;
        const closable = attached && isScopeFilled && task.status !== 'Done' && task.status !== 'Canceled'
            && task.scopeCompletionPromptedKey !== scopeSignature;
        return (
            <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Target className="w-3 h-3" /> Scope
                    </label>
                    {!isSnapshot && (
                        <button
                            className="text-[10px] font-black uppercase hover:underline text-[#3DCD58]"
                            onClick={() => updateTaskInModal('scopeAttached', !attached, attached ? { scopeCompletionPromptedKey: '' } : {})}
                        >
                            {attached ? 'Detach' : '+ Attach Scope'}
                        </button>
                    )}
                </div>
                {attached ? (
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                            <span className="font-black uppercase text-gray-400">Type of Proposal</span>
                            <span className="font-semibold text-gray-800">{headerScopeSelections.scope.join(' · ') || 'Not selected'}</span>
                            <span className="font-black uppercase text-gray-400">System</span>
                            <span className="font-semibold text-gray-800">{headerScopeSelections.systems.join(' · ') || 'Not selected'}</span>
                            <span className="font-black uppercase text-gray-400">Sub-system</span>
                            <span className="font-semibold text-gray-800">{headerScopeSelections.subsystems.join(' · ') || 'None'}</span>
                            <span className="font-black uppercase text-gray-400">At a glance</span>
                            <span className="font-semibold text-gray-800">{headerScopeSelections.notes.join(' · ') || 'None'}</span>
                        </div>
                        <button
                            onClick={() => setScopeModalOpen(true)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-black uppercase text-gray-600 hover:border-[#3DCD58] hover:text-[#3DCD58]"
                        >
                            {isScopeFilled ? 'Open Scope' : 'Fill the Scope'}
                        </button>
                        {closable && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                                <p className="text-[11px] font-bold text-emerald-800">
                                    The Scope is filled. Can this task be closed?
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => updateTaskInModal('status', 'Done', { scopeCompletionPromptedKey: scopeSignature })}
                                        className="flex-1 rounded-lg bg-[#3DCD58] px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-[#34b34c]"
                                    >
                                        Mark as done
                                    </button>
                                    <button
                                        onClick={() => updateTaskInModal('scopeCompletionPromptedKey', scopeSignature)}
                                        className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100"
                                    >
                                        Not yet
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-[11px] text-gray-400 italic px-1">
                        Attach the Scope when this is the task that defines it — the task will then offer to close itself once the Scope is filled.
                    </p>
                )}
            </div>
        );
    };

    /**
     * Resolves team-member ids (SOW `name|area` keys or stakeholder ids) to display names.
     * Falls back to the name embedded in a SOW id so history events never end up empty when a
     * member was later removed from the SOW note.
     */
    const teamMemberNames = (ids?: string[]): string[] => Array.from(new Set((ids || [])
        .map(id => sowTeamMembers.find(m => m.id === id)?.name || (id.includes('|') ? id.split('|')[0] : ''))
        .map(name => name.trim())
        .filter(Boolean)));

    useEffect(() => {
        if (!localOpp.kpis) return;
        const normalized = Array.from(new Set(sowTeamMembers.map(m => {
            if (/^TSC\b/i.test(m.area)) return 'TSC';
            if (/^Sales|CSE/i.test(m.area)) return 'Sales CSE';
            if (/Tender/i.test(m.area)) return 'Tendering';
            if (/FoxMass/i.test(m.area)) return 'FoxMass';
            if (/Supply Chain/i.test(m.area)) return 'Supply Chain';
            if (/Delivery/i.test(m.area)) return 'Delivery';
            if (/Field Services/i.test(m.area)) return 'Field Services';
            return m.area.split(' · ')[0];
        }).filter(Boolean)));
        const existing = new Set((localOpp.kpis.areasInvolved || []).map(a => a.area));
        const missing = normalized.filter(area => !existing.has(area));
        if (!missing.length) return;
        const updated = { ...localOpp, kpis: { ...localOpp.kpis, areasInvolved: [...(localOpp.kpis.areasInvolved || []), ...missing.map(area => ({ id: crypto.randomUUID(), area, daysSpent: 0, waitingDays: 0, calendar: {} }))] } };
        setLocalOpp(updated);
        onUpdate(updated);
    }, [sowTeamMembers]);

    const myWorkStats = React.useMemo(() => {
        const tendering = localOpp.kpis?.areasInvolved.find(a => a.area === 'Tendering');
        if (!tendering || !tendering.calendar) return { days: 0, hours: 0 };
        let days = 0;
        let hours = 0;
        Object.values(tendering.calendar).forEach(record => {
            const r = record as AreaDayRecord;
            if (r.type === 'Worked') {
                const h = r.hours || 0;
                if (h >= 1) days++;
                hours += h;
            }
        });
        return { days, hours };
    }, [localOpp.kpis?.areasInvolved]);

    const waitingOnOthersDays = React.useMemo(() => {
        let totalWaiting = 0;
        (localOpp.kpis?.areasInvolved || []).forEach(a => {
            totalWaiting += a.waitingDays || 0;
        });
        return totalWaiting;
    }, [localOpp.kpis?.areasInvolved]);


    const nextTask = useMemo(() => getNextTask(localOpp.tasks || []), [localOpp.tasks]);

    /**
     * WYSIWYG note export: renders the note's actual HTML (same styles as the
     * editor) through jsPDF's doc.html/html2canvas pipeline, so the PDF looks
     * like the note on screen â€” fonts, colors, tables, highlights, checkboxes,
     * embedded images â€” instead of the flattened text-only rendering.
     */
    const handleExportNotePDF = async (note: MeetingNote) => {
        if (!note) return;
        // Capture a just-typed character or form-field change before building
        // the PDF. The editor deliberately buffers edits for responsiveness,
        // so the note received by this click handler can otherwise be older
        // than what is visibly on screen.
        flushActiveNoteNow();
        const noteToExport = localOppRef.current.notes.find(n => n.id === note.id) || note;
        const { jsPDF } = await loadPdfLibs();
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidthPt = doc.internal.pageSize.getWidth();
        const opportunityName = localOpp.title.replace(/[/\\?%*:|"<>]/g, '-');
        const noteTitle = noteToExport.title.replace(/[/\\?%*:|"<>]/g, '-');
        const fileName = `Note_${opportunityName}_${noteTitle}.pdf`;

        // Offscreen container replicating the editor's look (see .editor-content
        // styles in RichTextEditor). Width 760px maps to the printable area.
        const CONTENT_WIDTH_PX = 760;
        const marginPt = 36;
        const container = document.createElement('div');
        container.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT_WIDTH_PX}px;background:#ffffff;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;color:#1f2937;`;
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        container.innerHTML = `
            <style>
                .pdf-note ul { list-style-type: disc; padding-left: 1.5em; margin: 0.5em 0; }
                .pdf-note ol { list-style-type: decimal; padding-left: 1.5em; margin: 0.5em 0; }
                .pdf-note li { padding-left: 0.25em; }
                .pdf-note a { color: #3b82f6; text-decoration: underline; }
                .pdf-note table { border-collapse: collapse; width: 100%; margin: 1em 0; border: 1px solid #ccc; }
                .pdf-note td { border: 1px solid #ccc; padding: 8px; min-width: 50px; }
                .pdf-note th { border: 1px solid #ccc; padding: 8px; min-width: 50px; font-weight: bold; background: #f9fafb; }
                .pdf-note h1 { font-size: 1.5em; font-weight: bold; margin: 0.5em 0 0.25em; }
                .pdf-note h2 { font-size: 1.3em; font-weight: bold; margin: 0.75em 0 0.3em; }
                .pdf-note h3 { font-size: 1.15em; font-weight: bold; margin: 0.7em 0 0.25em; }
                .pdf-note hr { border: none; border-top: 2px solid #e5e7eb; margin: 1.25em 0; }
                .pdf-note img { max-width: 100%; height: auto; }
                .pdf-note blockquote { border-left: 3px solid #d1d5db; color: #4b5563; margin: 0.75em 0; padding-left: 1em; }
                .pdf-note pre { background: #f3f4f6; border-radius: 4px; overflow-wrap: anywhere; padding: 0.75em; white-space: pre-wrap; }
                .pdf-note input[type="checkbox"] { appearance: auto; margin-right: 0.35em; vertical-align: middle; }
                .pdf-note input, .pdf-note textarea, .pdf-note select { font: inherit; max-width: 100%; }
                .pdf-note p { margin: 0.35em 0; }
            </style>
            <div style="background:#3DCD58;color:#ffffff;padding:14px 18px;font-weight:bold;font-size:15px;">Meeting Note Output</div>
            <div style="padding:18px 4px 0;">
                <div style="font-size:22px;font-weight:800;color:#111827;margin-bottom:6px;">${esc(noteToExport.title || 'Untitled Note')}</div>
                <div style="font-size:11px;color:#6b7280;">${esc(localOpp.id)} â€” ${esc(localOpp.title)}</div>
                <div style="font-size:11px;color:#6b7280;margin-bottom:10px;">Date: ${esc(noteToExport.date || 'N/A')}</div>
                <hr style="border:none;border-top:2px solid #e5e7eb;margin:10px 0 16px;" />
                <div class="pdf-note">${sanitizeHtml(noteToExport.content) || '<p>(Empty note)</p>'}</div>
            </div>`;
        document.body.appendChild(container);

        try {
            await doc.html(container, {
                x: marginPt,
                y: marginPt,
                width: pageWidthPt - marginPt * 2,
                windowWidth: CONTENT_WIDTH_PX,
                autoPaging: 'text',
                margin: [marginPt, marginPt, marginPt, marginPt],
                html2canvas: { scale: (pageWidthPt - marginPt * 2) / CONTENT_WIDTH_PX, useCORS: true, logging: false }
            });
        } finally {
            container.remove();
        }

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(doc.output('blob'));
                await writable.close();
            } catch (err) {
                if ((err as Error).name !== 'AbortError') doc.save(fileName);
            }
        } else {
            doc.save(fileName);
        }
    };

    const handleExportKpiPDF = async () => {
        const { jsPDF, autoTable } = await loadPdfLibs();
        const doc = new jsPDF();

        // Header
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('KPI Implementation Report', 14, 20);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Opportunity: ${localOpp.title}`, 14, 28);
        const received = localOpp.kpis?.timeline?.receivedAt || 'N/A';
        const delivered = localOpp.kpis?.timeline?.deliveredAt || 'In Progress';
        doc.text(`Period: ${received} - ${delivered}`, 14, 33);

        // Executive Summary
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text('Executive Summary', 14, 45);

        autoTable(doc, {
            startY: 50,
            head: [['Metric', 'Value']],
            body: [
                ['Elapsed Calendar Days', `${totalElapsedCalendarDays}d`],
                ['Elapsed Business Days', `${totalElapsedBusinessDays}d`],
                ['My Work (Days)', `${myWorkStats.days}d`],
                ['My Work (Total Hours)', `${myWorkStats.hours}h`],
                ['Waiting on Others (Total Days)', `${waitingOnOthersDays}d`],
                ['Unique Execution Days', `${executionUniqueDays}d`]
            ],
            theme: 'striped',
            headStyles: { fillColor: [61, 205, 88] }
        });

        // Areas Table
        doc.text('Areas Involved Breakdown', 14, (doc as any).lastAutoTable.finalY + 15);
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Area', 'Days Worked', 'Days Waiting']],
            body: (localOpp.kpis?.areasInvolved || []).map(a => [a.area, `${a.daysSpent}d`, `${a.waitingDays}d`]),
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] }
        });

        // Multi-Month Gantt Visualization
        let currentY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Implementation Timeline (Gantt)', 14, currentY);
        currentY += 10;

        // Draw Legend
        doc.setFontSize(8);
        doc.setFillColor(59, 130, 246); doc.rect(14, currentY, 5, 5, 'F'); doc.text('Worked', 22, currentY + 4);
        doc.setFillColor(234, 179, 8); doc.rect(40, currentY, 5, 5, 'F'); doc.text('Waiting', 48, currentY + 4);
        doc.setFillColor(239, 68, 68); doc.rect(66, currentY, 5, 5, 'F'); doc.text('Inactive', 74, currentY + 4);
        doc.setDrawColor(147, 51, 234); doc.line(92, currentY, 92, currentY + 5); doc.text('Received', 95, currentY + 4);
        doc.setDrawColor(16, 185, 129); doc.line(115, currentY, 115, currentY + 5); doc.text('Delivered', 118, currentY + 4);
        currentY += 12;

        // Determine months with activity
        const activeMonths = new Set<string>();
        const kpis = localOpp.kpis;
        if (kpis?.timeline.receivedAt) activeMonths.add(kpis.timeline.receivedAt.substring(0, 7));
        if (kpis?.timeline.deliveredAt) activeMonths.add(kpis.timeline.deliveredAt.substring(0, 7));
        (kpis?.areasInvolved || []).forEach(area => {
            Object.keys(area.calendar || {}).forEach(date => activeMonths.add(date.substring(0, 7)));
        });
        (localOpp.history || []).forEach(h => activeMonths.add(h.date.substring(0, 7)));

        const sortedMonths = Array.from(activeMonths).sort();
        const cellWidth = 5.5;
        const rowHeight = 7;

        sortedMonths.forEach((monthStr, mIndex) => {
            const [year, month] = monthStr.split('-').map(Number);
            const date = new Date(Date.UTC(year, month - 1, 1));
            const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

            // Check if we need a new page for this month
            const areasCount = (kpis?.areasInvolved || []).length;
            const requiredHeight = 20 + (areasCount * rowHeight);
            if (currentY + requiredHeight > 270) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(monthName, 14, currentY);
            currentY += 5;

            // Header for days
            const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
            doc.setFontSize(5);
            for (let i = 1; i <= daysInMonth; i++) {
                doc.text(`${i}`, 45 + ((i - 1) * cellWidth), currentY);
            }
            currentY += 2;

            (kpis?.areasInvolved || []).forEach(area => {
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(area.area, 14, currentY + 4);

                for (let i = 1; i <= daysInMonth; i++) {
                    const dStr = `${monthStr}-${i.toString().padStart(2, '0')}`;
                    const record = area.calendar?.[dStr] as AreaDayRecord | undefined;
                    const x = 45 + ((i - 1) * cellWidth);

                    if (record && record.type) {
                        if (record.type === 'Worked') doc.setFillColor(59, 130, 246);
                        else if (record.type === 'Waiting') doc.setFillColor(234, 179, 8);
                        else if (record.type === 'Inactive') doc.setFillColor(239, 68, 68);
                        doc.rect(x, currentY, cellWidth - 0.5, rowHeight - 1, 'F');
                    } else {
                        doc.setDrawColor(240);
                        doc.rect(x, currentY, cellWidth - 0.5, rowHeight - 1, 'S');
                    }

                    // Milestone markers on top of areas for the month
                    if (kpis?.timeline.receivedAt === dStr) {
                        doc.setDrawColor(147, 51, 234); // Purple
                        doc.line(x + (cellWidth / 2), currentY, x + (cellWidth / 2), currentY + rowHeight - 1);
                    }
                    if (kpis?.timeline.deliveredAt === dStr) {
                        doc.setDrawColor(16, 185, 129); // Emerald
                        doc.line(x + (cellWidth / 2), currentY, x + (cellWidth / 2), currentY + rowHeight - 1);
                    }
                }
                currentY += rowHeight;
            });
            currentY += 10;
        });

        // Activity History
        if (localOpp.history && localOpp.history.length > 0) {
            doc.addPage();
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('Activity History', 14, 20);
            autoTable(doc, {
                startY: 25,
                head: [['Date', 'Activity']],
                body: (localOpp.history || []).map(h => [h.date.split('T')[0], h.content]),
                theme: 'striped',
                columnStyles: {
                    0: { cellWidth: 30 },
                    1: { cellWidth: 'auto' }
                },
                headStyles: { fillColor: [61, 205, 88] }
            });
        }

        doc.save(`${localOpp.qlk}_${localOpp.title}_KPI_Report.pdf`);
    };


    const handleNavigateToHistory = (eventId: string) => {
        setActiveTabSafe('history');
        setTimeout(() => {
            const el = document.getElementById(`history-entry-${eventId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    };

    // --- VERSION MANAGER STATE MOVED UP ---

    // Ensure SR ID exists
    useEffect(() => {
        if (!localOpp.srId) handleFieldChange('srId', 'SR-1');
        if (!localOpp.versions) handleFieldChange('versions', []);
    }, []);

    const versionGroups = React.useMemo(() => {
        const groups: Record<string, OpportunityVersion[]> = {};
        let sorted = [...(localOpp.versions || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        if (versionSearchTerm.trim()) {
            const term = versionSearchTerm.toLowerCase();
            sorted = sorted.filter(v => 
                v.commitMessage.toLowerCase().includes(term) ||
                (v.revisionReason || '').toLowerCase().includes(term) ||
                v.srId.toLowerCase().includes(term) ||
                v.tags.some(t => t.toLowerCase().includes(term)) ||
                new Date(v.createdAt).toLocaleDateString().includes(term)
            );
        }

        sorted.forEach(v => {
            const key = v.srId || 'Legacy';
            if (!groups[key]) groups[key] = [];
            groups[key].push(v);
        });
        return groups;
    }, [localOpp.versions, versionSearchTerm]);

    const activeVersion = viewingVersionId ? localOpp.versions?.find(v => v.id === viewingVersionId) : null;

    const handleCreateVersion = async () => {
        if (!newVersionData.commitMessage) return alert("Commit message is required");
        if (!versionToRestore && !newVersionData.revisionReason.trim()) return alert("Explain why the new revision is being created.");
        if (!versionToRestore && selectableStandards.length !== 1 && taskStandards.length > 0 && !revisionTaskStandardId) {
            return alert("Select the task list for the new revision.");
        }

        if ((localOpp.versions?.length || 0) >= 10) {
            return alert("Maximum revision limit (10) reached for this opportunity. Delete an old snapshot to create a new one.");
        }

        const finalSrIdForSnapshot = newVersionData.srId || localOpp.srId || '';
        
        // 1. Capture current snapshot
        const snapshot = JSON.parse(JSON.stringify(localOpp));
        delete snapshot.versions;
        
        const newVerAtThisMoment: OpportunityVersion = {
            id: crypto.randomUUID(),
            opportunityId: localOpp.id,
            srId: finalSrIdForSnapshot,
            commitMessage: newVersionData.commitMessage,
            revisionReason: versionToRestore ? undefined : newVersionData.revisionReason.trim(),
            tags: newVersionData.tags.split(',').map(t => t.trim()).filter(Boolean),
            createdAt: new Date().toISOString(),
            createdBy: 'User',
            source: 'live',
            snapshot: snapshot as any
        };

        const nextRev = incrementRevision(localOpp.revision || 'R1');
        const prevRevision = localOpp.revision || 'R1';

        // 2. Decide if we are RESTORING or creating a CLEAN version
        if (versionToRestore) {
            // FLOW B: RESTORE FROM OLD VERSION (Full Clone)
            const verToRestoreContent = JSON.parse(JSON.stringify(versionToRestore.snapshot));
            
            const restoredOpp: Opportunity = {
                ...verToRestoreContent,
                id: localOpp.id,
                revision: nextRev,
                // Combine existing versions + the one we just snapshotted
                versions: [newVerAtThisMoment, ...(localOpp.versions || [])],
                lastUpdated: new Date().toISOString()
            };

            setLocalOpp(restoredOpp);
            onUpdate(restoredOpp, localOpp.id, true);
            // Carry the restored snapshot's folder onto the new working revision so
            // the editable copy can open the same files.
            if (restoredOpp.folderLinked && versionToRestore.snapshot.revision) {
                copyFolderLinkToRevision(localOpp.id, versionToRestore.snapshot.revision, nextRev).catch(() => {});
            }
            setVersionToRestore(null);
            alert(`Version restored successfully. You are now working on a full editable copy of "${versionToRestore.commitMessage}" as revision ${nextRev}.`);
        } else {
            // FLOW A: NEW CLEAN VERSION
            // Move any legacy opportunity-level folder link onto the current
            // revision so the new revision can start empty.
            await moveLegacyFolderLinkToRevision(localOpp.id, prevRevision).catch(() => {});
            const sourceNotes = JSON.parse(JSON.stringify(localOpp.notes || [])) as MeetingNote[];
            const sourceDefaultLinks = DEFAULT_QUICK_LINKS.map(link => ({
                id: link.id,
                label: link.label,
                url: normalizedQuickLinks.defaultUrls[link.id] || ''
            })).filter(link => !!link.url);
            const sourceCustomLinks = JSON.parse(JSON.stringify(normalizedQuickLinks.customLinks)) as QuickLinkItem[];
            const selectedRevisionStandard = taskStandards.find(standard => standard.id === revisionTaskStandardId)
                || (selectableStandards.length === 1 ? selectableStandards[0] : undefined);
            const resetOpp: Opportunity = {
                ...localOpp,
                revision: nextRev,
                // Business Rule: Clear QuoteLink and SR in clean version
                srId: '', 
                qlk: '',
                description: '',
                statusLabel: 'In Progress',
                detailedStatus: 'Working on it',
                stage: '1. Intake',
                priority: 'Medium',
                // New revision arrives today: stamp Requested date with today's date (R1's requested = day the revision is made).
                dates: { requested: getTodayStr(), expected: '', assigned: '' },
                links: [], 
                presentation: resetPresentationData(),
                history: [], // Clean version resets history
                notes: [],
                emails: localOpp.emails || createEmptyEmailsData(),
                kpis: resetKPIData(localOpp.kpis),
                folderLinked: false,
                commercial: resetCommercialData(),
                tasks: selectedRevisionStandard ? instantiateTaskStandard(selectedRevisionStandard, '1. Intake') : (localOpp.tasks || []).map(t => ({
                    ...t,
                    status: 'Pending',
                    dueDate: '',
                    description: '',
                    timeLogs: [],
                    subtasks: (t.subtasks || []).map(s => ({ ...s, completed: false }))
                })),
                versions: [newVerAtThisMoment, ...(localOpp.versions || [])],
                lastUpdated: new Date().toISOString()
            };

            setLocalOpp(resetOpp);
            onUpdate(resetOpp, localOpp.id, true);
            setRevisionCarryoverSource({
                sourceLabel: `${prevRevision}${localOpp.title ? ` - ${localOpp.title}` : ''}`,
                notes: sourceNotes,
                defaultLinks: sourceDefaultLinks,
                customLinks: sourceCustomLinks
                , baseOpportunity: resetOpp
            });
            setShowRevisionCarryoverModal(true);
            alert(`New clean version ${nextRev} created. Current progress saved.`);
        }

        setShowCreateVersionModal(false);
        setNewVersionData({ commitMessage: '', revisionReason: '', tags: '', srId: '' });
    };

    const handleApplyRevisionCarryover = (selection: { noteIds: string[]; defaultLinkIds: string[]; customLinkIds: string[] }) => {
        if (!revisionCarryoverSource) return;

        const selectedNotes = JSON.parse(JSON.stringify(
            revisionCarryoverSource.notes.filter(note => selection.noteIds.includes(note.id))
        )) as MeetingNote[];
        const selectedDefaultUrls = { ...(revisionCarryoverSource.initialDefaultUrls || normalizedQuickLinks.defaultUrls) };
        revisionCarryoverSource.defaultLinks.forEach(link => {
            if (selection.defaultLinkIds.includes(link.id)) selectedDefaultUrls[link.id as DefaultQuickLinkId] = link.url;
        });
        const selectedCustomLinks = JSON.parse(JSON.stringify(
            revisionCarryoverSource.customLinks.filter(link => selection.customLinkIds.includes(link.id))
        )) as QuickLinkItem[];

        const updates: Partial<Opportunity> = {};
        if (selectedNotes.length > 0) updates.notes = selectedNotes;
        if (selection.defaultLinkIds.length > 0 || selectedCustomLinks.length > 0) {
            updates.links = composeQuickLinks(selectedDefaultUrls, selectedCustomLinks);
        }

        if (Object.keys(updates).length > 0) {
            const baseOpportunity = revisionCarryoverSource.baseOpportunity || (revisionCarryoverSource.targetOppId
                ? (opportunities || []).find(candidate => candidate.id === revisionCarryoverSource.targetOppId)
                : localOpp);
            if (!baseOpportunity) return;
            const updated = {
                ...baseOpportunity,
                ...updates,
                lastUpdated: new Date().toISOString()
            } as Opportunity;
            if (!revisionCarryoverSource.targetOppId) setLocalOpp(updated);
            onUpdate(updated, revisionCarryoverSource.targetOppId || opportunity.id, true);
        }

        const targetOppId = revisionCarryoverSource.targetOppId;
        const shouldDeleteCurrent = revisionCarryoverSource.deleteCurrentOppAfterClose;
        setShowRevisionCarryoverModal(false);
        setRevisionCarryoverSource(null);
        if (shouldDeleteCurrent && targetOppId) {
            onDelete();
            onSelectOpp?.(targetOppId);
        }
    };

    const handleRestoreFromSnapshot = (ver: OpportunityVersion) => {
        setVersionToRestore(ver);
        // Reset modal data to encourage fresh commit message for the current work being saved
        setNewVersionData({ 
            commitMessage: `Backing up ${localOpp.revision} before restoring ${ver.snapshot.revision || 'snapshot'}`, 
            revisionReason: '',
            tags: 'restore-backup', 
            srId: localOpp.srId || '' 
        });
        setShowCreateVersionModal(true);
    };

    const handleDeleteSnapshot = (vId: string) => {
        if (!confirm("Are you sure you want to permanently delete this historical snapshot?")) return;
        const updatedVersions = (localOpp.versions || []).filter(v => v.id !== vId);
        handleFieldChange('versions', updatedVersions, true);
    };



    return (
        <div className="flex flex-col h-full bg-white relative overflow-hidden">
            {!isDeferring ? (
                <>


            {/* Main Content Area */}
            <div className="flex max-h-[33vh] flex-col shrink-0 overflow-hidden bg-white relative z-20">
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white z-20">
                    {isSnapshot && !isSubView && (
                        <div className="bg-amber-100 text-amber-800 px-4 py-1 text-xs font-bold flex justify-between items-center border-b border-amber-200">
                            <span className="flex items-center gap-2"><Lock className="w-3 h-3" /> READ ONLY - Viewing Snapshot: {activeVersion?.commitMessage}</span>
                            <button onClick={() => handleVersionSwitch(null)} className="underline hover:text-amber-900">Exit Snapshot</button>
                        </div>
                    )}

                    <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
                        <div className="relative w-full px-4">
                            <div className="flex items-start mb-0.5 gap-2 md:pr-[52%]">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    {!(isSubView && deepLink?.tab === 'tasks') && (
                                        <button
                                            onClick={(e) => {
                                                // Ignore click if the user just finished a text selection drag
                                                if (window.getSelection()?.toString()) {
                                                    window.getSelection()?.removeAllRanges();
                                                    return;
                                                }
                                                if (isSubView && onCloseTab) onCloseTab();
                                                else onBack();
                                            }}
                                            className="p-1 hover:bg-gray-200 rounded-lg transition-colors mr-1"
                                            title={isSubView ? "Close Tab" : "Back"}
                                        >
                                            {isSubView ? <X className="w-5 h-5 text-gray-500" /> : <ArrowLeft className="w-5 h-5 text-gray-500" />}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            // Always minimize the whole opportunity expediente by default
                                            onMinimize?.({
                                                id: opportunity.id,
                                                type: 'opportunity',
                                                title: `OP: ${opportunity.alias || opportunity.customer.slice(0, 10)}`,
                                                color: '#34d399',
                                                data: { oppId: opportunity.id, deepLink: { tab: activeTab, taskId: deepLink?.taskId, noteId: deepLink?.noteId } }
                                            });
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                                        title={isSubView ? "Close" : "Minimize"}
                                    >
                                        <Minus className="w-5 h-5 text-gray-400" />
                                    </button>
                                    {isSubView ? (
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{deepLink?.tab === 'tasks' ? 'Task Sub View' : 'Note Sub View'}</span>
                                            <span className="text-xs font-bold text-gray-600 truncate max-w-[200px]">{opportunity.id} {opportunity.alias ? `â€” ${opportunity.alias}` : ''}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-sm">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID</span>
                                                <div className="flex -space-x-px">
                                                    <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-36 bg-transparent" value={localOpp.id} onChange={(val: string) => handleFieldChange('id', normalizeOpportunityId(val) || val.trim())} />
                                                </div>
                                                <div className="w-px h-3 bg-gray-200"></div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">QLK:</span>
                                                    <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-40 bg-transparent" value={localOpp.qlk} onChange={(val: string) => handleFieldChange('qlk', val)} placeholder="000000" />
                                                </div>
                                                <div className="w-px h-3 bg-gray-200"></div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">REV:</span>
                                                    <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-8 bg-transparent" value={localOpp.revision} onChange={(val: string) => handleFieldChange('revision', val)} placeholder="R0" />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    {!isSubView && (
                                        <div className="flex items-center gap-2 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-sm">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SR</span>
                                            <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-24 bg-transparent" value={localOpp.srId || ''} onChange={(val: string) => handleFieldChange('srId', val)} placeholder="SR-..." />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 justify-end md:absolute md:right-0 md:top-0">
                                <div className="scale-90 origin-right flex items-center gap-2">
                                    {!isSubView && (
                                        <>
                                            {!hiddenHeaderFields.has('exportImport') && (
                                                <>
                                                    <OpportunityExportImportButtons
                                                        opportunity={localOpp}
                                                        onImport={(importedOpp) => onUpdate(importedOpp)}
                                                    />
                                                    <div className="w-px h-6 bg-gray-200 mx-1"></div>
                                                </>
                                            )}

                                            {/* Version Manager Discrete UI */}
                                            {!hiddenHeaderFields.has('revisions') && (
                                            <div className="relative">
                                                <button
                                                    ref={versionMenuButtonRef}
                                                    onClick={() => setShowVersionMenu(!showVersionMenu)}
                                                    className={`flex items-center gap-2 px-2 py-1 border rounded-lg text-xs font-medium transition-all shadow-sm ${isSnapshot ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-gray-200 text-gray-700 hover:text-blue-600'}`}
                                                >
                                                    <HistoryIcon className="w-3.5 h-3.5" />
                                                    Revisions
                                                    {(localOpp.versions || []).length > 0 && <span className="bg-gray-100 text-gray-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-1">{(localOpp.versions || []).length}</span>}
                                                </button>

                                                {showVersionMenu && versionMenuPosition && createPortal((
                                                    <>
                                                        <div className="fixed inset-0 z-[9998]" onClick={() => setShowVersionMenu(false)} />
                                                        <div className="fixed w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-[9999] flex flex-col max-h-[500px] animate-in fade-in zoom-in-95 duration-200" style={{ top: versionMenuPosition.top, right: versionMenuPosition.right }}>
                                                            <div className="p-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-2">
                                                                <div className="flex justify-between items-center">
                                                                    <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider">Revision History</h4>
                                                                    <button onClick={() => {
                                                                        setRevisionTaskStandardId(selectableStandards.length === 1 ? selectableStandards[0].id : '');
                                                                        setShowHiddenRevisionStandards(selectableStandards.length === 0);
                                                                        setShowCreateVersionModal(true);
                                                                        setShowVersionMenu(false);
                                                                    }} className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-100 font-bold flex items-center gap-1">
                                                                        <Plus className="w-3 h-3" /> New revision
                                                                    </button>
                                                                </div>
                                                                <div className="relative">
                                                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                                                    <input 
                                                                        type="text"
                                                                        className="w-full pl-7 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-[11px] focus:ring-1 focus:ring-blue-500 outline-none"
                                                                        placeholder="Search by SR, tag, message..."
                                                                        value={versionSearchTerm}
                                                                        onChange={(e) => setVersionSearchTerm(e.target.value)}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="overflow-y-auto p-2 space-y-4 flex-1 min-h-[100px]">
                                                                {(localOpp.versions || []).length === 0 && (
                                                                    <div className="text-center py-8 text-gray-400 text-xs italic">No revisions created yet.</div>
                                                                )}
                                                                {Object.keys(versionGroups).length > 0 && Object.entries(versionGroups).map(([sr, versions]: [string, OpportunityVersion[]]) => (
                                                                    <div key={sr}>
                                                                        <div className="flex items-center gap-1 mb-1 px-2">
                                                                            <GitBranch className="w-3 h-3 text-gray-300" />
                                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">{sr}</span>
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            {versions.map(v => (
                                                                                <div
                                                                                    key={v.id}
                                                                                    onClick={() => handleVersionSwitch(v.id)}
                                                                                    className={`group relative p-3 rounded-lg border text-left cursor-pointer transition-all ${viewingVersionId === v.id ? 'bg-amber-50 border-amber-300 shadow-sm' : 'bg-white border-gray-100 hover:border-blue-300 hover:shadow-md'}`}
                                                                                >
                                                                                    <div className="flex justify-between items-start mb-0.5">
                                                                                        <span className="text-xs font-bold text-gray-800 line-clamp-1 leading-tight">{v.snapshot.revision || 'REV'} - {v.commitMessage}</span>
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSnapshot(v.id); }} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 text-[9px] text-gray-400 mb-1.5">
                                                                                        <span className="font-mono text-blue-500 font-bold">{v.srId}</span>
                                                                                        <span>â€¢</span>
                                                                                        <span>{new Date(v.createdAt).toLocaleString()}</span>
                                                                                    </div>
                                                                                    {v.revisionReason && (
                                                                                        <p className="mb-2 text-[10px] leading-relaxed text-gray-600">
                                                                                            <span className="font-bold text-gray-500">Reason for next revision:</span> {v.revisionReason}
                                                                                        </p>
                                                                                    )}
                                                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                                                        {v.tags.map(t => <span key={t} className="text-[8px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{t}</span>)}
                                                                                    </div>

                                                                                    <div className="flex gap-2 pt-2 border-t border-gray-50 mt-1">
                                                                                        <button 
                                                                                            onClick={(e) => { e.stopPropagation(); handleVersionSwitch(v.id); setShowVersionMenu(false); }} 
                                                                                            className="text-[10px] font-bold text-gray-500 hover:text-blue-600 bg-gray-50 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                                                                        >
                                                                                            View
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={(e) => { e.stopPropagation(); handleRestoreFromSnapshot(v); }} 
                                                                                            className="text-[10px] font-bold text-white bg-blue-500 px-2 py-1 rounded hover:bg-blue-600 transition-colors flex items-center gap-1"
                                                                                        >
                                                                                            <RotateCcw className="w-3 h-3" /> Restore
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                ))}
                                                            </div>
                                                        </div>
                                                    </>
                                                ), document.body)}
                                            </div>
                                            )}

                                            {!hiddenHeaderFields.has('exportPdf') && (
                                                <>
                                                    <div className="w-px h-6 bg-gray-200 mx-1"></div>
                                                    <button onClick={handleExportPDF} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:text-[#3DCD58] transition-all shadow-sm"><FileDown className="w-3.5 h-3.5" /> Export PDF</button>
                                                </>
                                            )}
                                            {!hiddenHeaderFields.has('copySummary') && (
                                                <button onClick={generateExecutiveSummary} className="flex items-center gap-2 px-2 py-1 bg-[#3DCD58]/10 text-[#3DCD58] rounded-lg text-xs font-medium hover:bg-[#3DCD58]/20 transition-all shadow-sm"><Copy className="w-3.5 h-3.5" /> Copy Summary</button>
                                            )}
                                            {!isSnapshot && !hiddenHeaderFields.has('autoFillEmail') && (
                                                <button
                                                    data-tutorial="autofill-button"
                                                    onClick={() => setShowSrImport(true)}
                                                    className="flex items-center gap-2 px-2 py-1 bg-[#3DCD58]/10 text-[#3DCD58] border border-[#3DCD58]/20 rounded-lg text-xs font-medium hover:bg-[#3DCD58]/20 transition-all shadow-sm"
                                                    title="Auto-fill this expediente from a bFO Support Request email (.msg / .eml file or pasted text)"
                                                >
                                                    <Mail className="w-3.5 h-3.5" /> Auto-fill from Email
                                                </button>
                                            )}
                                            {!isSnapshot && !hiddenHeaderFields.has('delete') && (
                                                <>
                                                    <div className="w-px h-6 bg-gray-200 mx-1"></div>
                                                    <button onClick={() => { if (window.confirm('Are you sure you want to delete this opportunity?')) onDelete(); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap md:flex-nowrap justify-between items-start gap-4 my-0.5 px-1">
                                <div data-tutorial="opp-title" className="flex-1 w-full md:w-auto min-w-[200px]">
                                    <OptimizedInput disabled={isSnapshot} value={localOpp.title} onChange={(val: string) => handleFieldChange('title', val)} className="text-lg font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full placeholder-gray-300 mb-0 leading-tight" placeholder="Title" />
                                    <div className="mt-0.5 grid w-full grid-cols-[minmax(110px,0.8fr)_minmax(240px,2.2fr)_minmax(110px,0.8fr)] items-end gap-3">
                                        <label className="min-w-0 border-r border-slate-200 pr-3">
                                            <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Customer</span>
                                            <OptimizedInput disabled={isSnapshot} value={localOpp.customer} onChange={(val: string) => handleFieldChange('customer', val)} className="w-full min-w-0 truncate bg-transparent border-none focus:ring-0 p-0 text-xs font-semibold leading-tight text-slate-700 placeholder-gray-400" placeholder="Customer name" />
                                        </label>
                                        {!hiddenHeaderFields.has('address') && (
                                            <label className="min-w-0 border-r border-slate-200 pr-3">
                                                <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Address</span>
                                                <OptimizedInput disabled={isSnapshot} value={localOpp.customerAddress || ''} onChange={(val: string) => handleFieldChange('customerAddress', val)} className="w-full min-w-0 truncate bg-transparent border-none focus:ring-0 p-0 text-xs leading-tight text-slate-700 placeholder-gray-400" placeholder="Customer address" />
                                            </label>
                                        )}
                                        {!hiddenHeaderFields.has('seller') && (
                                            <label className="min-w-0">
                                                <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">CSE</span>
                                                <OptimizedInput disabled={isSnapshot} value={localOpp.seller || ''} onChange={(val: string) => handleFieldChange('seller', val)} className="w-full min-w-0 truncate bg-transparent border-none focus:ring-0 p-0 text-xs font-semibold leading-tight text-slate-700 placeholder-gray-400" placeholder="CSE name" />
                                            </label>
                                        )}
                                    </div>

                                    {nextTask && !hiddenHeaderFields.has('nextStep') ? (
                                            <button
                                                type="button"
                                                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-blue-300 bg-blue-50/80 px-2.5 py-1.5 text-left shadow-sm animate-in fade-in slide-in-from-left-1 group/next cursor-pointer hover:border-blue-500 hover:bg-blue-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                onClick={() => {
                                                    focusTaskInTasksList(nextTask.id);
                                                }}
                                            >
                                                <div className="rounded-md border border-blue-200 bg-white p-1 shadow-sm">
                                                    <Zap className="h-3.5 w-3.5 text-blue-700" />
                                                </div>
                                                <div className="flex min-w-0 flex-1 flex-col">
                                                    <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-blue-700">Status · Click to open</span>
                                                    <span className="truncate text-xs font-bold leading-tight text-blue-950">{nextTask.title}</span>
                                                </div>
                                                <div className="ml-1 rounded-md bg-blue-700 p-1 text-white transition-colors group-hover/next:bg-blue-800">
                                                    <ExternalLink className="h-3 w-3" />
                                                </div>
                                            </button>
                                        ) : null}

                                    <div className="mt-1.5 flex flex-wrap items-stretch gap-1.5">
                                        {!hiddenHeaderFields.has('quoteType') && (
                                            <label className={`flex min-w-28 flex-1 flex-col rounded-lg border px-2.5 py-1 shadow-sm ${localOpp.quoteType === 'Firm' ? 'border-emerald-300 bg-emerald-50/70' : 'border-violet-300 bg-violet-50/70'}`}>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Offer type</span>
                                                <select disabled={isSnapshot} value={localOpp.quoteType || 'Budgetary'} onChange={event => handleFieldChange('quoteType', event.target.value)} className="border-0 bg-transparent p-0 text-xs font-bold text-gray-900 focus:ring-0">
                                                    <option value="Firm">Firm</option><option value="Budgetary">Budgetary</option>
                                                </select>
                                            </label>
                                        )}
                                        <label className="flex min-w-40 flex-1 flex-col rounded-lg border border-emerald-200 bg-emerald-50/40 px-2.5 py-1 shadow-sm focus-within:border-emerald-500">
                                            <span className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Commercial amount<button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setActiveTabSafe('commercial'); }} className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-black text-emerald-800 hover:bg-emerald-100" title="Open Commercial"><span>Open</span><ExternalLink className="h-2.5 w-2.5" /></button></span>
                                            <span className="flex items-center text-xs font-bold text-gray-900"><DollarSign className="h-3 w-3 text-emerald-700" /><input disabled={isSnapshot} type="number" value={localOpp.commercial.cqaOfficialSellPrice || 0} onChange={event => updateOfficialSellPrice(Number(event.target.value) || 0)} className="w-32 border-0 bg-transparent p-0 font-bold focus:ring-0" /></span>
                                        </label>
                                        <div className="flex min-w-36 flex-1 flex-col rounded-lg border border-cyan-200 bg-cyan-50/50 px-2.5 py-1 shadow-sm" title={`${headerTaskProgress.percent}% weighted progress across ${headerTaskProgress.sectionCount} process section${headerTaskProgress.sectionCount === 1 ? '' : 's'}. Done and Canceled count as complete; active non-Pending statuses count at least halfway.`}>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-cyan-800">Task progress</span>
                                            <div className="flex items-center gap-2"><span className="text-xs font-bold text-cyan-950">{headerTaskProgress.percent}%</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cyan-200"><div className="h-full rounded-full bg-cyan-700 transition-all" style={{ width: `${headerTaskProgress.percent}%` }} /></div><span className="text-[9px] font-bold text-cyan-800" title="Done or Canceled tasks">{headerTaskProgress.terminalTasks}/{headerTaskProgress.totalTasks}</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex w-full md:w-auto md:flex-[0_1_48%] md:max-w-[48%] flex-wrap items-start justify-end gap-1.5 shrink-0">
                                    <div className={`order-10 mt-0.5 self-start ${stakeholdersSectionEnabled && !hiddenHeaderFields.has('stakeholdersTable') ? 'w-[calc(50%-0.1875rem)] basis-[calc(50%-0.1875rem)]' : 'w-full basis-full'}`}>
                                        <button type="button" onClick={() => setScopeModalOpen(true)} className="group h-[98px] w-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-white" title="Open Scope: Type of Proposal, System, Sub-system and Notes at a glance">
                                            <span className="flex items-center justify-between border-b border-slate-200 pb-0.5 text-[9px] font-black uppercase tracking-widest text-slate-700"><span className="flex items-center gap-1"><Target className="h-3 w-3 text-emerald-700" /> Scope</span><ExternalLink className="h-2.5 w-2.5 text-slate-400" /></span>
                                            <span className="mt-0.5 grid grid-cols-[96px_minmax(0,1fr)] gap-x-1.5 gap-y-0.5 text-[9px] leading-tight">
                                                <span className="whitespace-nowrap font-black uppercase text-slate-500">Type of Proposal</span><span className="truncate font-semibold text-slate-800">{headerScopeSelections.scope.join(' · ') || 'Not selected'}</span>
                                                <span className="font-black uppercase text-slate-500">System</span><span className="truncate font-semibold text-slate-800">{headerScopeSelections.systems.join(' · ') || 'Not selected'}</span>
                                                <span className="font-black uppercase text-slate-500">Sub-system</span><span className="truncate font-semibold text-slate-800">{headerScopeSelections.subsystems.join(' · ') || 'None'}</span>
                                                <span className="font-black uppercase text-slate-500">At a glance</span><span className="truncate font-semibold text-slate-800">{headerScopeSelections.notes.join(' · ') || 'None'}</span>
                                            </span>
                                        </button>
                                    </div>
                                    {stakeholdersSectionEnabled && !hiddenHeaderFields.has('stakeholdersTable') && (
                                        <div className="relative order-10 mt-0.5 w-[calc(50%-0.1875rem)] basis-[calc(50%-0.1875rem)] shrink-0 self-start rounded-lg border border-slate-200 bg-white shadow-sm">
                                            <div className="flex items-center justify-between gap-3 rounded-t-lg border-b border-slate-100 bg-slate-50 px-2 py-0.5"><span className="text-[8px] font-black uppercase tracking-wider text-slate-600">Stakeholders · Area / Name</span>{!isSnapshot && <button onClick={() => { setHeaderStakeholderPickerOpen(value => !value); setHeaderStakeholderSearch(''); }} className="flex items-center gap-0.5 text-[8px] font-black uppercase text-blue-700"><Plus className="h-2.5 w-2.5" /> Add</button>}</div>
                                            {headerStakeholderPickerOpen && createPortal((
                                                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={() => setHeaderStakeholderPickerOpen(false)}>
                                                    <div role="dialog" aria-modal="true" aria-labelledby="header-stakeholder-picker-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
                                                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                                                            <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-700">Opportunity team</p><h3 id="header-stakeholder-picker-title" className="text-sm font-black text-slate-900">Add stakeholder</h3></div>
                                                            <button type="button" onClick={() => setHeaderStakeholderPickerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="Close"><X className="h-4 w-4" /></button>
                                                        </div>
                                                        <div className="p-4">
                                                        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={headerStakeholderSearch} onChange={event => setHeaderStakeholderSearch(event.target.value)} placeholder="Search by name, email, area or alias…" className="w-full rounded-xl border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-blue-400 focus:ring-blue-400" /></div>
                                                        <p className="mt-2 text-[10px] text-slate-400">Select an existing contact or create a new one if it is not in the directory.</p>
                                                        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
                                                            {selectableGlobalContacts.filter(contact => {
                                                                const query = headerStakeholderSearch.trim().toLowerCase();
                                                                const alreadyAdded = (localOpp.stakeholders || []).some(person => person.directoryContactId === contact.id || (!!person.email && person.email.toLowerCase() === contact.email.toLowerCase()));
                                                                return !alreadyAdded && (!query || contact.name.toLowerCase().includes(query) || contact.email.toLowerCase().includes(query) || (contact.availableRoles || []).some(role => role.toLowerCase().includes(query)) || (contact.aliases || []).some(alias => alias.toLowerCase().includes(query)));
                                                            }).slice(0, 12).map(contact => <button key={contact.id} type="button" onClick={() => { addStakeholderFromDirectory(contact.id); setHeaderStakeholderPickerOpen(false); setHeaderStakeholderSearch(''); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2 text-left hover:border-blue-100 hover:bg-blue-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-700">{contact.name.trim().charAt(0).toUpperCase() || '?'}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{contact.name}</span><span className="block truncate text-[10px] text-slate-400">{contact.email || 'No email'} · {(contact.availableRoles || []).join(', ') || 'No area'}</span></span><Plus className="h-4 w-4 shrink-0 text-blue-600" /></button>)}
                                                        </div>
                                                        <button type="button" onClick={() => { setHeaderStakeholderPickerOpen(false); setNewContactModal({ name: headerStakeholderSearch.trim(), email: '', area: '' }); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-300 px-3 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Plus className="h-4 w-4" /> Create new {headerStakeholderSearch.trim() ? `“${headerStakeholderSearch.trim()}”` : 'contact'}</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ), document.body)}
                                            <div className={`grid ${(localOpp.stakeholders || []).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                {(localOpp.stakeholders || []).slice(0, 5).map(person => <div key={person.id} className="grid grid-cols-[42%_58%] border-b border-slate-50 px-1 py-0 last:border-0"><input disabled={isSnapshot} value={(person.roles || [person.role || ''])[0] || ''} onChange={event => updateStakeholder(person.id, 'roles', event.target.value ? [event.target.value] : [])} placeholder="Area" className="min-w-0 border-0 bg-transparent px-1 py-0.5 text-[9px] font-semibold text-slate-500 focus:ring-1 focus:ring-blue-400" /><input disabled={isSnapshot} value={person.name} onChange={event => updateStakeholder(person.id, 'name', event.target.value)} placeholder="Name" className="min-w-0 border-0 bg-transparent px-1 py-0.5 text-[9px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-400" /></div>)}
                                                {(localOpp.stakeholders || []).length === 0 && !isSnapshot && <button onClick={() => { setHeaderStakeholderPickerOpen(true); setHeaderStakeholderSearch(''); }} className="px-2 py-1.5 text-left text-[9px] font-bold text-blue-700 hover:bg-blue-50"><Plus className="mr-1 inline h-3 w-3" />Add first stakeholder</button>}
                                            </div>
                                            <button onClick={() => { flushActiveNoteNow(); setActiveTabSafe('notes'); setTeamPanelOpen(true); }} className="flex w-full items-center justify-between border-t border-slate-100 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-slate-500 hover:bg-slate-50 hover:text-blue-700"><span>View all</span><span>{(localOpp.stakeholders || []).length > 5 ? `+${(localOpp.stakeholders || []).length - 5}` : (localOpp.stakeholders || []).length}</span></button>
                                        </div>
                                    )}
                                    {deliveryAlarm && !hiddenHeaderFields.has('deliveryAlarm') && (
                                        <div className="flex flex-col gap-1" title={`Expected delivery: ${localOpp.dates.expected}${deliveryAlarm.deliveredAt ? ` · Delivered: ${deliveryAlarm.deliveredAt}` : ''} · ${deliveryAlarm.label}`}>
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Expected delivery</span>
                                            <div className={`flex items-center gap-2 rounded-lg border px-2 py-1 shadow-sm ${deliveryAlarm.daysLeft < 0 ? 'border-rose-300 bg-rose-50 text-rose-950' : deliveryAlarm.deliveredAt || deliveryAlarm.daysLeft > 5 ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
                                                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full border px-1 text-[10px] font-black shadow-sm ${deliveryAlarm.daysLeft < 0 ? 'border-rose-300 bg-rose-100 text-rose-800' : deliveryAlarm.deliveredAt || deliveryAlarm.daysLeft > 5 ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-amber-300 bg-amber-100 text-amber-900'}`}>
                                                    {deliveryAlarm.daysLeft > 0 ? `+${deliveryAlarm.daysLeft}` : deliveryAlarm.daysLeft}
                                                </span>
                                                <span className="flex max-w-28 flex-col leading-tight">
                                                    <span className="text-[10px] font-black uppercase">{deliveryAlarm.label}</span>
                                                    <span className="mt-0.5 text-[9px] font-semibold tabular-nums opacity-70">{deliveryAlarm.deliveredAt ? `${localOpp.dates.expected} → ${deliveryAlarm.deliveredAt}` : localOpp.dates.expected}</span>
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    {!isSnapshot && !hiddenHeaderFields.has('emailButton') && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Emails</span>
                                            <button
                                                onClick={() => openEmailCompose()}
                                                title="Generate an email draft in Outlook (Status Report, approvals, reminders...)"
                                                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded border border-[#3DCD58]/40 bg-[#3DCD58]/10 text-[#2db64a] hover:bg-[#3DCD58]/20 shadow-sm uppercase tracking-wider"
                                            >
                                                <Mail className="w-3.5 h-3.5" /> Email
                                            </button>
                                        </div>
                                    )}
                                    {!hiddenHeaderFields.has('processStatus') && (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Process Status</span>
                                        <select data-tutorial="process-status" disabled={isSnapshot} value={localOpp.detailedStatus || 'Working on it'} onChange={(e) => handleFieldChange('detailedStatus', e.target.value)} className={`text-[10px] font-bold px-2 py-1 rounded border outline-none w-32 uppercase tracking-wider shadow-sm disabled:cursor-not-allowed ${DETAILED_STATUS_COLORS[localOpp.detailedStatus || 'Working on it']}`}>{DETAILED_STATUS_ORDER.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}</select>
                                    </div>
                                    )}
                                    {!hiddenHeaderFields.has('priority') && (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Priority</span>
                                        <select disabled={isSnapshot} value={localOpp.priority || 'Medium'} onChange={(e) => handleFieldChange('priority', e.target.value)} className={`text-[10px] font-bold px-2 py-1 rounded-full border outline-none w-24 text-center shadow-sm disabled:cursor-not-allowed ${PRIORITY_COLORS[localOpp.priority as TaskPriority]}`}>{Object.keys(PRIORITY_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                    </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {!isSubView && (
                    <div className="relative z-30 flex min-h-8 border-b border-slate-600 px-3 py-1 overflow-x-auto overflow-y-hidden shrink-0 bg-slate-700 shadow-sm" aria-label="Opportunity navigation">
                        <div className="w-full px-2 flex items-center gap-0.5">
                            <button onClick={() => setActiveTabSafe('overview')} className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-100 hover:bg-slate-600 hover:text-white'}`}>Overview</button>
                            {orderedDetailTabs.map(tab => {
                                const section = OPPORTUNITY_DETAIL_SECTIONS.find(item => item.key === tab);
                                return (
                                    <button key={tab} data-tutorial={`detail-tab-${tab}`} onClick={() => setActiveTabSafe(tab)} aria-current={activeTab === tab ? 'page' : undefined} className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-100 hover:bg-slate-600 hover:text-white'}`}>
                                        {renderOpportunityDetailTabIcon(tab)}
                                        {section?.label || tab}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div ref={scrollContainerRef} className={`flex-1 min-h-0 ${isSubView && deepLink && (deepLink.taskId || (deepLink.tab === 'notes' && deepLink.noteId)) || activeTab === 'notes' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'} p-0 md:p-4 bg-gray-50/30`}>
                {(isSubView && deepLink && (deepLink.taskId || (deepLink.tab === 'notes' && deepLink.noteId))) ? (
                    <div className="h-full w-full">
                        {/* Only render Task/Note content in isolated mode */}
                        {deepLink.tab === 'notes' && deepLink.noteId && (
                            <div className="h-full bg-white rounded-xl shadow-lg overflow-hidden flex flex-col border border-gray-100">
                                {activeTab === 'notes' && (
                                    <div className="flex-1 flex flex-col min-h-0">
                                        {currentNote ? (
                                            <>
                                                {currentNote.format !== 'sow' && <div className="p-4 border-b border-gray-100 flex flex-col gap-2 bg-gray-50 shrink-0">
                                                    <div className="flex justify-between items-center">
                                                        <NoteTitleInput disabled={isSnapshot} value={currentNote.title} onCommit={(val) => updateSelectedNote('title', val)} className="font-black text-lg bg-transparent border-none focus:ring-0 text-gray-800 flex-1 px-0 disabled:opacity-70" placeholder="Note Title" />
                                                    </div>
                                                </div>}
                                                <div className="flex-1 flex flex-col min-h-0">
                                                    {currentNote.format === 'sow' ? (
                                                        <SowFormEmbed
                                                            key={currentNote.id}
                                                            content={currentNote.content}
                                                            people={localOpp.stakeholders || []}
                                                            directoryPeople={selectableGlobalContacts.map(contact => ({ id: contact.id, name: contact.name, email: contact.email, roles: contact.availableRoles, aliases: contact.aliases }))}
                                                            areas={trackedAreas}
                                                    prefill={sowPrefill}
                                                            globalForm={globalSowForm}
                                                            scopeCatalog={scopeCatalog}
                                                            onGlobalFormChange={onGlobalSowFormChange}
                                                            onOpportunitySync={syncSowOpportunityFields}
                                                            onGeneratedNote={addGeneratedSowNote}
                                                            onQuickLinkRequest={addSowLinkToOverview}
                                                            tasks={localOpp.tasks}
                                                            onTaskOpen={openSowTask}
                                                            onTaskConvert={convertSowTaskToAssignment}
                                                            onTaskRaciUpdate={updateSowTaskRaci}
                                                            onTaskCreate={createSowTask}
                                                            onStakeholderCreate={createSowStakeholder}
                                                            backupKey={sowBackupKey(localOpp.id, currentNote.id)}
                                                            legacyBackupKey={sowNote?.id === currentNote.id ? legacySowBackupKey(localOpp.id) : undefined}
                                                            disabled={isSnapshot}
                                                            onChange={(json: string) => saveSowContent(currentNote.id, json)}
                                                        />
                                                    ) : (
                                                        <RichTextEditor
                                                            key={currentNote.id}
                                                            ref={noteEditorRef}
                                                            content={currentNote.content}
                                                            disabled={isSnapshot}
                                                            onChange={(val) => updateSelectedNote('content', val)}
                                                            onAttach={() => setShowDocPicker({ type: 'note', id: currentNote.id })}
                                                            mentionOptions={localOpp.stakeholders || []}
                                                        />
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-gray-400">Loading Note...</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Task Detail in Sub-View */}
                        {deepLink.tab === 'tasks' && deepLink.taskId && selectedTaskForEdit && (
                            <div className="h-full bg-white rounded-xl shadow-lg overflow-hidden flex flex-col border border-gray-100">
                                <div className="flex-1 overflow-y-auto p-8">
                                    <div className="flex justify-between items-start mb-8 shrink-0">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl shadow-sm ${TASK_STATUS_COLORS[selectedTaskForEdit.task.status]}`}><ListChecks className="w-6 h-6" /></div>
                                            <div>
                                                <h2 className="text-2xl font-black text-gray-900">Task Detail</h2>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {opportunity.alias && <span className="text-[10px] bg-[#3DCD58]/10 text-[#3DCD58] px-2 py-0.5 rounded font-black uppercase tracking-tight">{opportunity.alias}</span>}
                                                    {isSubView && (
                                                        <button
                                                            onClick={() => {
                                                                onSelectOpp(opportunity.id, { tab: 'tasks', taskId: selectedTaskForEdit.task.id, fullView: true });
                                                            }}
                                                            className="text-[10px] font-black text-[#3DCD58] hover:underline uppercase ml-2 flex items-center gap-1"
                                                        >
                                                            <Layout className="w-3 h-3" /> Open Task in Expediente
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onCloseTab ? onCloseTab() : onBack()}
                                                className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-colors shrink-0"
                                                title="Close task sub view"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                            {timerEnabled && <TaskTimerButtonModal task={selectedTaskForEdit.task} oppId={opportunity.id} />}
                                            <button
                                                onClick={() => openEmailCompose(emailKindForTask(selectedTaskForEdit.task), [selectedTaskForEdit.task.id])}
                                                title="Generate the email that matches this task's current workflow state"
                                                className="flex items-center gap-1 text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                                            >
                                                <Mail className="w-3 h-3" /> {emailLabelForTask(selectedTaskForEdit.task)}
                                            </button>
                                            {(selectedTaskForEdit.task.isAssignment || (selectedTaskForEdit.task.approverTeamMemberIds?.length ?? 0) > 0) && (
                                                <button
                                                    onClick={() => openEmailCompose('reminder', [selectedTaskForEdit.task.id])}
                                                    title="Send a friendly reminder about this assignment/approval"
                                                    className="flex items-center gap-1 text-xs font-bold bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                                                >
                                                    <Mail className="w-3 h-3" /> Remind
                                                </button>
                                            )}
                                            {informedTaskIds.has(selectedTaskForEdit.task.id) && (
                                                <span title="An assignment email was already generated for this task" className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-2 py-1 rounded uppercase">✓ Informed</span>
                                            )}
                                            <button onClick={copyTaskSummary} className="flex items-center gap-1 text-xs font-bold bg-[#3DCD58]/10 text-[#3DCD58] px-3 py-1.5 rounded-lg hover:bg-[#3DCD58]/20 transition-colors">
                                                <Copy className="w-3 h-3" /> Summary
                                            </button>
                                            {remindersEnabled && (
                                                <RemindMeButton
                                                    defaultTitle={selectedTaskForEdit.task.title}
                                                    opportunityId={opportunity.id}
                                                    taskId={selectedTaskForEdit.task.id}
                                                    onAdd={(r) => onAddReminder?.(r)}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-8 flex-1">
                                        <div className="flex items-start gap-4">
                                            <div className="flex-1 space-y-2">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Task Title</label>
                                                    <OptimizedInput className="w-full text-xl font-bold border-none p-0 focus:ring-0 bg-transparent text-gray-900" value={selectedTaskForEdit.task.title} onChange={(val: string) => updateTaskInModal('title', val)} />
                                                </div>
                                            </div>
                                            <div className="w-24 space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Order</label>
                                                <input type="number" className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0 text-center" value={selectedTaskForEdit.task.order || ''} onChange={(e) => updateTaskInModal('order', e.target.value ? parseInt(e.target.value) : null)} placeholder="#" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Current Status</label>
                                                <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.status} onChange={(e) => updateTaskInModal('status', e.target.value as any)}>{(selectedTaskForEdit.task.owner === 'External Area' && ((selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 || (selectedTaskForEdit.task.externalAreas || []).length > 0) ? ASSIGNED_TASK_STATUSES : TASK_STATUS_ORDER).map(s => <option key={s} value={s}>{taskStatusLabel(s)}</option>)}</select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Process Section</label>
                                                <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.processSection || ''} onChange={(e) => updateTaskInModal('processSection', e.target.value || undefined)}><option value="">Not classified</option>{PROCESS_SECTIONS.map(section => <option key={section} value={section}>{section}</option>)}</select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Priority</label>
                                                <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.priority || 'Medium'} onChange={(e) => updateTaskInModal('priority', e.target.value as any)}>{Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}</select>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Due Date</label>
                                                    <div className="flex items-center gap-1">
                                                        <input type="checkbox" checked={selectedTaskForEdit.task.calendarized || false} onChange={(e) => updateTaskInModal('calendarized', e.target.checked)} className="rounded text-[#3DCD58] focus:ring-[#3DCD58] w-3 h-3" />
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Calendarized</label>
                                                    </div>
                                                </div>
                                                <input type="date" className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 focus:bg-white transition-all" value={selectedTaskForEdit.task.dueDate} onChange={(e) => updateTaskInModal('dueDate', e.target.value)} />
                                                {selectedTaskForEdit.task.status === 'Done' && selectedTaskForEdit.task.completionDate && (
                                                    <p className={`text-[10px] font-black uppercase tracking-widest px-1 ${selectedTaskForEdit.task.completionDate > (selectedTaskForEdit.task.dueDate || '') ? 'text-orange-500' : 'text-emerald-600'}`}>
                                                        Finished {selectedTaskForEdit.task.completionDate}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">{selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Changes Requested / Rework' ? 'Approval' : 'Assignment'}</label>
                                            {selectedTaskForEdit.task.status !== 'Approval' && selectedTaskForEdit.task.status !== 'Changes Requested / Rework' && <>
                                            <label className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-600"><input type="checkbox" checked={selectedTaskForEdit.task.isAssignment || false} onChange={e => updateTaskInModal('isAssignment', e.target.checked, e.target.checked ? { owner: 'External Area' } : {})} className="rounded text-[#3DCD58]" /> Track as assignment</label>
                                            <div className="flex gap-4 items-center">
                                                <select className="border-gray-200 rounded-lg text-sm bg-white font-bold p-2" value={selectedTaskForEdit.task.owner} onChange={(e) => updateTaskInModal('owner', e.target.value)} >
                                                    <option value="Me">Me</option>
                                                    <option value="External Area">External Area</option>
                                                </select>
                                                {selectedTaskForEdit.task.owner === 'External Area' && (
                                                    <div className="flex gap-2 flex-1 flex-col">
                                                        <div>
                                                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Area</div>
                                                            <SimpleMultiSelect
                                                                placeholder="Select area..."
                                                                options={areaOptions.map(area => ({ id: area, label: area }))}
                                                                selected={selectedTaskForEdit.task.externalAreas || []}
                                                                onChange={applyExternalAreas}
                                                            />
                                                            {areasWithoutResponsible(selectedTaskForEdit.task).length > 0 && (
                                                                <div className="mt-1 text-[9px] text-amber-700">
                                                                    No responsible registered for {areasWithoutResponsible(selectedTaskForEdit.task).join(', ')} — the request stays on the area until you pick someone.
                                                                </div>
                                                            )}
                                                        </div>
                                                        <ResponsibleTeamPicker
                                                            options={sowTeamMembers}
                                                            onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToEditedTask('responsibleTeamMemberIds', personId)); return undefined; }}
                                                            selected={selectedTaskForEdit.task.responsibleTeamMemberIds || []}
                                                            onChange={setModalResponsibleIds}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            {selectedTaskForEdit.task.owner === 'External Area' && ((selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 || (selectedTaskForEdit.task.externalAreas || []).length > 0) && (
                                                <div className="grid grid-cols-2 gap-3 mt-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Requested on</label>
                                                        <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleRequestedDate || ''} onChange={(e) => updateTaskInModal('responsibleRequestedDate', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">{selectedTaskForEdit.task.status === 'Missing Info' ? 'Expected information' : 'Committed date'}</label>
                                                        <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleDueDate || ''} onChange={(e) => updateTaskInModal('responsibleDueDate', e.target.value)} />
                                                    </div>
                                                </div>
                                            )}
                                            </>}
                                            {(selectedTaskForEdit.task.isAssignment || selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Changes Requested / Rework') && <div className={`${selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Changes Requested / Rework' ? '' : 'mt-3 border-t border-gray-200 pt-3'} grid grid-cols-1 md:grid-cols-2 gap-3`}>
                                                <div><label className="text-[9px] font-bold text-gray-500 uppercase">Approvers</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToEditedTask('approverTeamMemberIds', personId)); return undefined; }} selected={selectedTaskForEdit.task.approverTeamMemberIds || []} onChange={ids => updateTaskInModal('approverTeamMemberIds', ids, ids.length > 0 ? { isAssignment: true } : {})} /></div>
                                                {selectedTaskForEdit.task.status !== 'Approval' && selectedTaskForEdit.task.status !== 'Changes Requested / Rework' && <>
                                                <div><label className="text-[9px] font-bold text-gray-500 uppercase">Informed (CC)</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToEditedTask('informedTeamMemberIds', personId)); return undefined; }} selected={selectedTaskForEdit.task.informedTeamMemberIds || []} onChange={ids => updateTaskInModal('informedTeamMemberIds', ids)} /></div>
                                                <details className="md:col-span-2 rounded-lg border border-gray-200 bg-white p-2">
                                                    <summary className="cursor-pointer text-[9px] font-black uppercase text-gray-500">Advanced automatic date correction</summary>
                                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                        <div><label className="text-[9px] font-bold text-gray-500 uppercase">Actual delivery</label><input type="date" value={selectedTaskForEdit.task.responsibleDeliveredDate || ''} onChange={e => updateTaskInModal('responsibleDeliveredDate', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                                        {(selectedTaskForEdit.task.approverTeamMemberIds?.length ?? 0) > 0 && <>
                                                        <div><label className="text-[9px] font-bold text-gray-500 uppercase">Approval started</label><input type="date" value={selectedTaskForEdit.task.approvalRequestedDate || ''} onChange={e => updateTaskInModal('approvalRequestedDate', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                                        <div><label className="text-[9px] font-bold text-gray-500 uppercase">Actual approval</label><input type="date" value={selectedTaskForEdit.task.approvalDeliveredDate || ''} onChange={e => updateTaskInModal('approvalDeliveredDate', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                                        </>}
                                                    </div>
                                                </details>
                                                </>}
                                                {(selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Done') && !selectedTaskForEdit.task.reworkForTaskId && <button type="button" onClick={() => requestApprovalChanges(selectedTaskForEdit.task.id)} className="md:col-span-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-100"><GitPullRequest className="mr-1.5 inline h-4 w-4" /> Create Change Revision</button>}
                                                {selectedTaskForEdit.task.status !== 'Approval' && selectedTaskForEdit.task.status !== 'Changes Requested / Rework' &&
                                                <div className="md:col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Deliverable</label><input value={selectedTaskForEdit.task.deliverable || ''} onChange={e => updateTaskInModal('deliverable', e.target.value)} placeholder="Expected deliverable (used in assignment emails)" className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                                }
                                            </div>}
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Scheduling & Dependencies</label>
                                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                                <div className="flex-1">
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Depends on</label>
                                                    <SimpleMultiSelect placeholder="Select dependencies..." options={localOpp.tasks.filter(t => t.id !== selectedTaskForEdit.task.id).map(t => ({ id: t.id, label: `${t.order ? `[${t.order}] ` : ''}${t.title}` }))} selected={selectedTaskForEdit.task.dependsOnTaskIds || []} onChange={(val) => updateTaskInModal('dependsOnTaskIds', val)} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input type="checkbox" id="blockDoneToggleIso" checked={selectedTaskForEdit.task.blockDoneUntilDependenciesDone || false} onChange={e => updateTaskInModal('blockDoneUntilDependenciesDone', e.target.checked)} className="rounded text-[#3DCD58] focus:ring-[#3DCD58]" />
                                                    <label htmlFor="blockDoneToggleIso" className="text-[10px] font-bold text-gray-600 uppercase select-none cursor-pointer flex items-center gap-1">
                                                        <Lock className="w-3 h-3" /> Block Done until dependencies are done
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="space-y-1 pt-4 border-t">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</label>
                                                <OptimizedTextArea className="w-full text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-4 rounded-xl border-none focus:ring-2 focus:ring-[#3DCD58] resize-none" rows={5} value={selectedTaskForEdit.task.description} onChange={(val: string) => updateTaskInModal('description', val)} />
                                            </div>
                                        </div>

                                        {/* SUBTASKS */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">Sub-Tasks Checklist<span className="flex items-center gap-1 normal-case tracking-normal text-[10px] font-bold text-gray-500" title="Keep one subtask per system selected in the Scope. Deselected systems are marked, never deleted."><input type="checkbox" checked={!!selectedTaskForEdit.task.subtasksPerSystem} onChange={(e) => updateTaskInModal('subtasksPerSystem', e.target.checked)} className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58] w-3 h-3" />one per Scope system</span></label>
                                                <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => updateTaskInModal('subtasks', [...selectedTaskForEdit.task.subtasks, { id: crypto.randomUUID(), title: 'New Sub-task', completed: false }])}>+ Add Entry</button>
                                            </div>
                                            <div className="space-y-2 bg-gray-50 p-4 rounded-2xl">
                                                {selectedTaskForEdit.task.subtasks.map((sub, idx) => (
                                                    <div key={sub.id} className={`flex items-center gap-3 p-3 rounded-xl shadow-sm group ${sub.outOfScope ? 'bg-amber-50 border border-amber-200' : 'bg-white'}`}>
                                                        <input type="checkbox" className="w-5 h-5 rounded border-gray-200 text-[#3DCD58] focus:ring-[#3DCD58]" checked={sub.completed} onChange={() => toggleSubtaskDirect(selectedTaskForEdit.task, sub.id)} />
                                                        <OptimizedInput className={`flex-1 text-sm bg-transparent border-none focus:ring-0 p-0 ${sub.completed ? 'text-gray-400 line-through' : 'text-gray-700 font-bold'}`} value={sub.title} onChange={(val: string) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, title: val } : s))} />
                                                        {sub.outOfScope && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700" title="This system is no longer selected in the Scope. It no longer counts towards finishing the task — delete it if it is not coming back.">Not in scope</span>}
                                                        <button onClick={() => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.filter(s => s.id !== sub.id))} className={`${sub.outOfScope ? '' : 'opacity-0 group-hover:opacity-100'} p-1 text-gray-300 hover:text-red-500 transition-all`}><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {renderTaskScopeSection(selectedTaskForEdit.task)}

                                        <ExecutionScheduleSection
                                            task={selectedTaskForEdit.task}
                                            onChange={(updated) => updateTaskInModal('executionBlocks', updated.executionBlocks || [])}
                                        />

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Documents</label>
                                                <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => setShowDocPicker({ type: 'task', id: selectedTaskForEdit.task.id })}>+ Link Doc</button>
                                            </div>
                                            <div className="p-4 bg-gray-50 rounded-2xl">
                                                <LinkedDocsList key={refreshKey} opportunityId={opportunity.id} revision={localOpp.revision} taskId={selectedTaskForEdit.task.id} onNavigateToFile={navigateToFile} />
                                                {renderLinkedEmailsForTarget({ type: 'task', id: selectedTaskForEdit.task.id })}
                                            </div>
                                        </div>

                                        {/* TIME TRACKING HISTORY */}
                                        {timerEnabled && <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Time Tracking History</label>
                                            <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                                                <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-100/50">
                                                    <span className="text-xs font-bold text-gray-500">Total Time</span>
                                                    <span className="text-sm font-mono font-black text-gray-700">
                                                        {(() => {
                                                            const total = (selectedTaskForEdit.task.timeLogs || []).reduce((acc: any, log: any) => acc + (log.durationSeconds || 0), 0);
                                                            const h = Math.floor(total / 3600);
                                                            const m = Math.floor((total % 3600) / 60);
                                                            return `${h}h ${m}m`;
                                                        })()}
                                                    </span>
                                                </div>
                                                {(selectedTaskForEdit.task.timeLogs || []).length > 0 ? (
                                                    <div className="max-h-40 overflow-y-auto">
                                                        <table className="w-full text-[10px] text-left">
                                                            <thead className="bg-gray-100 text-gray-500 font-bold sticky top-0">
                                                                <tr>
                                                                    <th className="p-2">Date</th>
                                                                    <th className="p-2">Time</th>
                                                                    <th className="p-2 text-right">Duration</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {[...selectedTaskForEdit.task.timeLogs].reverse().map((log: any) => (
                                                                    <tr key={log.id} className="hover:bg-white transition-colors">
                                                                        <td className="p-2 text-gray-500">{new Date(log.startTime).toLocaleDateString()}</td>
                                                                        <td className="p-2 text-gray-400 font-mono">{new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                                        <td className="p-2 text-right font-bold text-gray-700">
                                                                            {Math.floor(log.durationSeconds / 3600)}h {Math.floor((log.durationSeconds % 3600) / 60)}m
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div className="p-4 text-center text-xs text-gray-400 italic">No time recorded yet.</div>
                                                )}
                                            </div>
                                        </div>}

                                        {/* NOTE LINKS */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Notes</label>
                                                <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => setShowNotePickerForTask(selectedTaskForEdit.task.id)}>+ Link Note</button>
                                            </div>

                                            {showNotePickerForTask === selectedTaskForEdit.task.id && (
                                                <div className="relative z-10 p-4 bg-white border border-gray-100 shadow-xl rounded-2xl mb-4 animate-fade-in">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h5 className="font-black text-[10px] text-gray-400 uppercase tracking-widest">Select Notes</h5>
                                                        <button onClick={() => setShowNotePickerForTask(null)}><X className="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors" /></button>
                                                    </div>
                                                    <input
                                                        className="w-full text-xs border-gray-100 rounded-lg mb-2 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                                        placeholder="Search notes..."
                                                        value={noteSearch}
                                                        onChange={(e) => setNoteSearch(e.target.value)}
                                                    />
                                                    <div className="max-h-40 overflow-y-auto space-y-1 mb-3 custom-scrollbar">
                                                        {localOpp.notes.filter(n => n.title.toLowerCase().includes(noteSearch.toLowerCase())).map(n => (
                                                            <label key={n.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-xl cursor-pointer group transition-colors">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedNotesToLink.includes(n.id)}
                                                                    onChange={() => {
                                                                        if (selectedNotesToLink.includes(n.id)) setSelectedNotesToLink(prev => prev.filter(id => id !== n.id));
                                                                        else setSelectedNotesToLink(prev => [...prev, n.id]);
                                                                    }}
                                                                    className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-200"
                                                                />
                                                                <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 truncate">{n.title}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            linkNotesToTask(selectedTaskForEdit.task.id, selectedNotesToLink);
                                                            setShowNotePickerForTask(null);
                                                            setSelectedNotesToLink([]);
                                                        }}
                                                        className="w-full bg-[#3DCD58] text-white text-[10px] font-black uppercase py-2.5 rounded-xl shadow-lg shadow-[#3DCD58]/20 hover:scale-[1.02] active:scale-95 transition-all"
                                                    >
                                                        Link Selected
                                                    </button>
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                                {(selectedTaskForEdit.task.linkedNoteIds || [selectedTaskForEdit.task.linkedNoteId]).filter(Boolean).map((nid) => {
                                                    const note = localOpp.notes.find(n => n.id === nid);
                                                    if (!note) return null;
                                                    return (
                                                        <div key={nid} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-[#3DCD58] transition-all bg-white group">
                                                            <div className="flex items-center gap-2">
                                                                <FileText className="w-4 h-4 text-gray-400 group-hover:text-[#3DCD58]" />
                                                                <span className="text-sm font-medium">{note.title}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={() => isSubView ? onSelectOpp(opportunity.id, { tab: 'notes', noteId: note.id }) : setSplitViewNoteId(note.id)} className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded flex items-center gap-1">
                                                                    {isSubView ? <ExternalLink className="w-3 h-3" /> : <Columns className="w-3 h-3" />} {isSubView ? 'Open' : 'Split'}
                                                                </button>
                                                                <button onClick={() => unlinkNoteFromTask(selectedTaskForEdit.task.id, note.id)} className="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase px-2 py-1 bg-gray-50 rounded">
                                                                    <Unlink className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t flex justify-between gap-4">
                                            <button onClick={deleteTaskInModal} className="px-6 py-3 rounded-2xl text-sm font-black uppercase text-red-500 hover:bg-red-50 transition-all border border-red-100">Delete Task</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={activeTab === 'notes' ? 'w-full h-full min-h-0 flex flex-col' : 'w-full px-2 md:px-6'}>
                        {activeTab === 'overview' && (
                            <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:h-[480px]">
                                <div className="h-full min-h-0 overflow-hidden bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Description of the Request</label>
                                    <OptimizedTextArea
                                        disabled={isSnapshot}
                                        value={localOpp.description}
                                        onChange={(val: string) => handleFieldChange('description', val)}
                                        className="w-full text-sm border-gray-200 rounded-lg min-h-[150px]"
                                        placeholder="Detailed description..."
                                    />
                                    <div className="grid grid-cols-2 gap-4 items-end">
                                        <div className="space-y-1">
                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Submitted Date</label>
                                            <input
                                                disabled={isSnapshot}
                                                type="date"
                                                value={localOpp.dates.requested}
                                                onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, requested: e.target.value })}
                                                className="w-full text-sm border-gray-200 rounded-xl bg-gray-50/30 focus:ring-[#3DCD58] focus:border-[#3DCD58] transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1 relative">
                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Expected Date</label>
                                            <input
                                                disabled={isSnapshot}
                                                type="date"
                                                value={localOpp.dates.expected}
                                                onChange={(e) => requestExpectedDateChange(e.target.value)}
                                                className={`w-full text-sm rounded-xl focus:ring-[#3DCD58] focus:border-[#3DCD58] transition-all ${
                                                    localOpp.dates.expected < new Date().toISOString().split('T')[0] && localOpp.statusLabel === 'In Progress'
                                                    ? 'bg-red-50 border-red-200 text-red-900 font-bold'
                                                    : 'bg-gray-50/30 border-gray-200 text-gray-900'
                                                }`}
                                            />
                                            {(() => {
                                                const hasDates = !!(localOpp.dates.requested && localOpp.dates.expected);
                                                const businessDays = hasDates ? countBusinessDays(localOpp.dates.requested, localOpp.dates.expected, holidays) : 0;
                                                const calendarDays = hasDates ? countCalendarDays(localOpp.dates.requested, localOpp.dates.expected) : 0;
                                                const isOver = businessDays < 0 || calendarDays < 0;
                                                return (
                                                    <div className="absolute -top-8 right-0 flex gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setScopeModalOpen(true)}
                                                            title="SCOPE - quick view of Type of Proposal, systems and notes"
                                                            className="text-[9px] font-black px-2 py-0.5 rounded-lg border shadow-sm uppercase tracking-wider bg-emerald-50 text-[#2db64a] border-emerald-100 hover:bg-emerald-100 transition-colors"
                                                        >
                                                            Scope
                                                        </button>
                                                        {hasDates && <>
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border shadow-sm ${
                                                            isOver ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                                                        }`}>
                                                            {Math.abs(businessDays)} Business Days
                                                        </span>
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border shadow-sm ${
                                                            isOver ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-600 border-slate-200'
                                                        }`}>
                                                            {Math.abs(calendarDays)} Calendar Days
                                                        </span>
                                                        </>}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-[#3DCD58] uppercase tracking-wider mb-1">Priority Rank (1-N)</label>
                                            <input
                                                disabled={isSnapshot}
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={localOpp.priorityOrder || ''}
                                                onChange={(e) => handleFieldChange('priorityOrder', e.target.value ? parseInt(e.target.value) : null)}
                                                onKeyDown={(e) => {
                                                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                                                    e.preventDefault();
                                                    const current = Math.max(1, Number(localOpp.priorityOrder) || 1);
                                                    // Rank #1 is the highest position: ArrowUp moves toward 1.
                                                    const next = e.key === 'ArrowUp' ? Math.max(1, current - 1) : current + 1;
                                                    handleFieldChange('priorityOrder', next);
                                                }}
                                                className="w-full text-sm border-gray-200 rounded-lg font-bold disabled:bg-gray-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                placeholder="e.g. 1"
                                            />
                                            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                                <button type="button" disabled={isSnapshot || (Number(localOpp.priorityOrder) || 1) <= 1} onClick={() => handleFieldChange('priorityOrder', Math.max(1, (Number(localOpp.priorityOrder) || 1) - 1))} className="flex items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40" title="Move toward rank 1">
                                                    <ChevronUp className="h-3 w-3" /> Higher
                                                </button>
                                                <button type="button" disabled={isSnapshot} onClick={() => handleFieldChange('priorityOrder', (Number(localOpp.priorityOrder) || 0) + 1)} className="flex items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40" title="Move toward a larger rank number">
                                                    <ChevronDown className="h-3 w-3" /> Lower
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Short Alias (1-2 words)</label>
                                            <OptimizedInput
                                                disabled={isSnapshot}
                                                type="text"
                                                value={localOpp.alias || ''}
                                                onChange={(val: string) => handleFieldChange('alias', val)}
                                                className="w-full text-sm border-gray-200 rounded-lg"
                                                placeholder="e.g. Project X"
                                                maxLength={20}
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-gray-100">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 mb-2">Proposal Nature: Budgetary / Firm</label>
                                        <div className="flex gap-2 p-1.5 bg-gray-50 rounded-2xl border border-gray-100 shadow-inner">
                                            <button
                                                type="button"
                                                disabled={isSnapshot}
                                                onClick={() => handleFieldChange('quoteType', 'Budgetary')}
                                                className={`flex-1 py-3 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${
                                                    localOpp.quoteType === 'Budgetary' 
                                                    ? 'bg-white text-gray-900 shadow-xl shadow-black/5 border border-gray-100 scale-[1.02]' 
                                                    : 'text-gray-400 hover:bg-gray-200/50 hover:text-gray-600'
                                                }`}
                                            >
                                                Budgetary
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isSnapshot}
                                                onClick={() => handleFieldChange('quoteType', 'Firm')}
                                                className={`flex-1 py-3 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${
                                                    localOpp.quoteType === 'Firm' 
                                                    ? 'bg-[#3DCD58] text-white shadow-xl shadow-[#3DCD58]/30 scale-[1.02]' 
                                                    : 'text-gray-400 hover:bg-gray-200/50 hover:text-gray-600'
                                                }`}
                                            >
                                                Firm
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="h-full min-h-0 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3 overflow-hidden">
                                    {/* Title + action buttons always at top */}
                                    <div className="flex justify-between items-center shrink-0">
                                        <h3 className="text-sm font-semibold">Quick Links</h3>
                                        {!isSnapshot && (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => {
                                                    const label = prompt("Heading Text:");
                                                    if (label) {
                                                        addQuickLinkItem({ id: crypto.randomUUID(), type: 'heading', label });
                                                    }
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Heading"
                                            >
                                                <Heading1 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    addQuickLinkItem({ id: crypto.randomUUID(), type: 'separator', label: '---' });
                                                }}
                                                className="px-1.5 py-1 text-[10px] font-bold leading-none hover:bg-gray-100 rounded text-gray-500" title="Add Line"
                                            >
                                                Line
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const label = prompt("Link Label:");
                                                    if (label) {
                                                        const url = prompt("URL:", "https://");
                                                        upsertQuickLinkFromPrompt(label, url || '');
                                                    }
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Link"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1">
                                        {visibleDefaultLinks.map((link) => {
                                            const url = normalizedQuickLinks.defaultUrls[link.id] || '';
                                            const Icon = getQuickLinkIcon(link);
                                            const visIdx = visibleQuickLinkIds.indexOf(link.id);
                                            return (
                                                <div key={link.id} style={{ order: quickLinkOrderIndex.get(link.id) }} className="relative flex items-center gap-2 bg-gray-50 p-1.5 rounded border border-gray-100 min-w-0 group">
                                                    {!isSnapshot && (
                                                        <div className="flex flex-col shrink-0">
                                                            <button onClick={() => moveQuickLink(link.id, -1)} disabled={visIdx === 0} className="hover:text-blue-500 disabled:opacity-30" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                                                            <button onClick={() => moveQuickLink(link.id, 1)} disabled={visIdx === visibleQuickLinkIds.length - 1} className="hover:text-blue-500 disabled:opacity-30" title="Move down"><ChevronDown className="w-3 h-3" /></button>
                                                        </div>
                                                    )}
                                                    {link.locked ? (
                                                        <Icon className="w-3.5 h-3.5 shrink-0 text-gray-300" title="Locked quick link" />
                                                    ) : (
                                                        <button
                                                            disabled={isSnapshot}
                                                            onClick={() => setIconPickerFor(iconPickerFor === link.id ? null : link.id)}
                                                            className="shrink-0 p-0.5 -m-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 disabled:hover:bg-transparent"
                                                            title="Change icon"
                                                        >
                                                            <Icon className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {iconPickerFor === link.id && !isSnapshot && !link.locked && (
                                                        <>
                                                            <div className="fixed inset-0 z-20" onClick={() => setIconPickerFor(null)} />
                                                            <div className="absolute z-30 top-9 left-6 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-52 animate-in fade-in zoom-in-95 duration-150">
                                                                <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-gray-100">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Icon</span>
                                                                    <button onClick={() => setDefaultQuickLinkIcon(link.id, '')} className="flex items-center gap-0.5 text-[9px] font-bold text-gray-400 hover:text-gray-600"><RotateCcw className="w-2.5 h-2.5" /> Default</button>
                                                                </div>
                                                                <div className="grid grid-cols-6 gap-1">
                                                                    {QUICK_LINK_ICON_OPTIONS.map(({ name, Icon: Opt }) => (
                                                                        <button
                                                                            key={name}
                                                                            onClick={() => setDefaultQuickLinkIcon(link.id, name)}
                                                                            className={`p-1.5 rounded-lg flex items-center justify-center transition-colors ${localOpp.quickLinkIcons?.[link.id] === name ? 'bg-[#3DCD58]/10 text-[#3DCD58]' : 'text-gray-500 hover:bg-gray-100'}`}
                                                                            title={name}
                                                                        >
                                                                            <Opt className="w-4 h-4" />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                    {link.locked ? (
                                                        <span className="text-[10px] font-black text-gray-500 w-16 shrink-0 uppercase">{link.label}</span>
                                                    ) : (
                                                        <OptimizedInput
                                                            disabled={isSnapshot}
                                                            value={getQuickLinkLabel(link)}
                                                            onChange={(val: string) => setDefaultQuickLinkLabel(link.id, val)}
                                                            className="text-[10px] font-black text-gray-500 w-16 shrink-0 uppercase bg-transparent border-none focus:ring-0 p-0 truncate disabled:text-gray-400"
                                                            placeholder={link.label}
                                                        />
                                                    )}
                                                    <input
                                                        disabled={isSnapshot}
                                                        type="url"
                                                        value={url}
                                                        className="min-w-0 flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58] disabled:bg-gray-50 disabled:text-gray-400"
                                                        placeholder={link.placeholder}
                                                        onChange={(e) => setDefaultQuickLinkUrl(link.id, e.target.value)}
                                                    />
                                                    {url && (
                                                        <a href={url} target="_blank" rel="noreferrer" className="text-[#3DCD58] hover:text-green-700 shrink-0 p-1 bg-white rounded border border-gray-200 shadow-sm">
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                    {!isSnapshot && (
                                                        <button
                                                            onClick={() => toggleQuickLinkHidden(link.id)}
                                                            className="shrink-0 p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Hide this link (you can restore it below)"
                                                        >
                                                            <EyeOff className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Custom links list */}
                                        {normalizedQuickLinks.customLinks.filter(item => !hiddenQuickLinkIds.has(item.id)).map((item) => {
                                            const visIdx = visibleQuickLinkIds.indexOf(item.id);
                                            const customIdx = normalizedQuickLinks.customLinks.findIndex(link => link.id === item.id);
                                            return <div key={item.id} style={{ order: quickLinkOrderIndex.get(item.id) }} className="flex gap-2 items-center group bg-gray-50 p-1.5 rounded hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all min-w-0">
                                                <div className="flex flex-col shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => {
                                                        moveQuickLink(item.id, -1);
                                                    }} disabled={visIdx === 0} className="hover:text-blue-500 disabled:opacity-30" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                                                    <button onClick={() => {
                                                        moveQuickLink(item.id, 1);
                                                    }} disabled={visIdx === visibleQuickLinkIds.length - 1} className="hover:text-blue-500 disabled:opacity-30" title="Move down"><ChevronDown className="w-3 h-3" /></button>
                                                </div>

                                                {item.type === 'heading' && (
                                                    <input
                                                        value={item.label}
                                                        onChange={(e) => {
                                                            const newLinks = [...normalizedQuickLinks.customLinks];
                                                            newLinks[customIdx] = { ...item, label: e.target.value };
                                                            updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                        }}
                                                        className="flex-1 text-xs font-bold uppercase text-gray-500 bg-transparent border-none focus:ring-0 p-0"
                                                        placeholder="HEADING"
                                                    />
                                                )}

                                                {item.type === 'separator' && (
                                                    <div className="flex-1 h-px bg-gray-300 mx-2"></div>
                                                )}

                                                {item.type === 'link' && (
                                                    <>
                                                        <OptimizedInput
                                                            value={item.label}
                                                            onChange={(val: string) => {
                                                                const defaultLink = findDefaultQuickLink(val);
                                                                if (defaultLink) {
                                                                    const newDefaultUrls = { ...normalizedQuickLinks.defaultUrls, [defaultLink.id]: item.url || '' };
                                                                    const newLinks = normalizedQuickLinks.customLinks.filter(i => i.id !== item.id);
                                                                    updateQuickLinks(newDefaultUrls, newLinks);
                                                                    return;
                                                                }
                                                                const newLinks = [...normalizedQuickLinks.customLinks];
                                                                newLinks[customIdx] = { ...item, label: val };
                                                                updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                            }}
                                                            className="w-24 shrink-0 text-[10px] text-gray-400 font-bold uppercase truncate bg-transparent border-none focus:ring-0 p-0"
                                                        />
                                                        <OptimizedInput
                                                            value={item.url}
                                                            onChange={(val: string) => {
                                                                const newLinks = [...normalizedQuickLinks.customLinks];
                                                                newLinks[customIdx] = { ...item, url: val };
                                                                updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                            }}
                                                            className="min-w-0 flex-1 text-sm border-gray-200 rounded p-1 h-7"
                                                            placeholder="https://..."
                                                        />
                                                        {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="p-1 bg-white rounded shadow-sm hover:text-blue-500 border border-gray-200 shrink-0"><ExternalLink className="w-3 h-3" /></a>}
                                                    </>
                                                )}

                                                {item.type === 'view' && (
                                                    <>
                                                        <div className="flex-1 flex items-center gap-2">
                                                            <div className="w-20 text-[10px] text-blue-500 font-bold uppercase truncate">{item.label}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">({item.url})</div>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                if (item.url) {
                                                                    // Open as a new floating tab for simultaneous viewing
                                                                    onMinimize?.({
                                                                        id: `${opportunity.id}-${item.url}`,
                                                                        type: 'opportunity',
                                                                        title: `${item.url.toUpperCase().slice(0, 4)}: ${opportunity.customer.slice(0, 10)}`,
                                                                        color: '#34d399',
                                                                        data: { oppId: opportunity.id, deepLink: { tab: item.url } }
                                                                    });
                                                                }
                                                            }}
                                                            className="p-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 border border-blue-100 shadow-sm"
                                                            title="Pin View to Dock"
                                                        >
                                                            <Pin className="w-3 h-3" />
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    onClick={() => {
                                                        if (confirm("Delete item?")) {
                                                            const newLinks = normalizedQuickLinks.customLinks.filter(i => i.id !== item.id);
                                                            updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                        }
                                                    }}
                                                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                                {!isSnapshot && (
                                                    <button
                                                        onClick={() => toggleQuickLinkHidden(item.id)}
                                                        className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Hide this link (you can restore it below)"
                                                    >
                                                        <EyeOff className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        })}

                                        {/* Hidden links â€” always LAST, below defaults and custom links */}
                                        {!isSnapshot && (hiddenDefaultLinks.length > 0 || hiddenCustomLinks.length > 0) && (
                                            <div style={{ order: orderedQuickLinkIds.length }} className="flex flex-wrap items-center gap-1.5 pt-2 mt-1 border-t border-gray-100">
                                                <span className="text-[9px] font-black uppercase tracking-wider text-gray-300">Hidden</span>
                                                {hiddenDefaultLinks.map(link => (
                                                    <button
                                                        key={link.id}
                                                        onClick={() => toggleQuickLinkHidden(link.id)}
                                                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-500 uppercase transition-colors"
                                                        title="Show this link again"
                                                    >
                                                        <Eye className="w-3 h-3" /> {getQuickLinkLabel(link)}
                                                    </button>
                                                ))}
                                                {hiddenCustomLinks.map(item => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => toggleQuickLinkHidden(item.id)}
                                                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-500 uppercase transition-colors"
                                                        title="Show this link again"
                                                    >
                                                        <Eye className="w-3 h-3" /> {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="hidden bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-center mb-1">
                                    <h3 className="text-sm font-semibold flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> Stakeholders</h3>
                                    {!isSnapshot && <button onClick={addStakeholder} className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Stakeholder"><Plus className="w-4 h-4" /></button>}
                                </div>
                                <p className="text-xs text-gray-400 mb-3">Who's involved in this specific opportunity â€” suggested when picking who a task is waiting on.</p>
                                {!isSnapshot && <select defaultValue="" onChange={e => { addStakeholderFromDirectory(e.target.value); e.currentTarget.value = ''; }} className="w-full mb-3 border-gray-200 rounded-lg text-xs bg-white">
                                    <option value="">Add from global directory...</option>
                                    {selectableGlobalContacts.filter(c => !(localOpp.stakeholders || []).some(p => p.directoryContactId === c.id || (!!p.email && p.email.toLowerCase() === c.email.toLowerCase()))).map(c => <option key={c.id} value={c.id}>{c.name} Â· {c.email || 'email missing'} Â· {(c.availableRoles || []).join(', ')}</option>)}
                                </select>}
                                <div className="space-y-2">
                                    {(localOpp.stakeholders || []).map(person => (
                                        <div key={person.id} className="bg-gray-50 rounded-lg p-2 border border-gray-100 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <input disabled={isSnapshot} value={person.name} onChange={(e) => updateStakeholder(person.id, 'name', e.target.value)} placeholder="Name" className="flex-1 min-w-0 text-sm border-none bg-transparent focus:ring-0 font-medium p-0" />
                                                <input disabled={isSnapshot} type="email" value={person.email} onChange={(e) => updateStakeholder(person.id, 'email', e.target.value)} placeholder="Email" className="flex-1 min-w-0 text-sm border-none bg-transparent focus:ring-0 text-gray-500 p-0" />
                                                {!isSnapshot && <button onClick={() => saveStakeholderToDirectory(person)} className="text-[9px] font-bold text-blue-600">DIRECTORY</button>}
                                                {!isSnapshot && <button onClick={() => removeStakeholder(person.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <DelimitedListInput disabled={isSnapshot} value={(person.roles || (person.role ? [person.role] : [])).join(', ')} onCommit={raw => updateStakeholder(person.id, 'roles', raw.split(',').map(v => v.trim()).filter(Boolean))} placeholder="Roles: TSC, Delivery..." className="text-xs border-gray-200 rounded bg-white" />
                                                <DelimitedListInput disabled={isSnapshot} value={Object.entries(person.roleContexts || {}).map(([r,c]) => `${r}: ${c}`).join('; ')} onCommit={raw => updateStakeholder(person.id, 'roleContexts', Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => { const [role, ...rest] = v.split(':'); return [role.trim(), rest.join(':').trim()]; })))} placeholder="Context: TSC: Foxboro" className="text-xs border-gray-200 rounded bg-white" />
                                            </div>
                                        </div>
                                    ))}
                                    {(localOpp.stakeholders || []).length === 0 && <div className="text-center text-gray-300 text-xs italic py-3">No stakeholders yet.</div>}
                                </div>
                            </div>
                            </>
                        )}

                        {activeTab === 'kpi' && localOpp.kpis && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Opportunity Metrics */}
                                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                            <div className="flex items-center gap-2">
                                                <Target className="w-5 h-5 text-[#3DCD58]" />
                                                <h3 className="font-bold text-gray-800">Opportunity Metrics</h3>
                                            </div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 italic">Today: <span className="text-[#3DCD58]">{new Date().toLocaleDateString()}</span></span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Submitted Date</label>
                                                <input
                                                    disabled={isSnapshot}
                                                    type="date"
                                                    value={localOpp.dates.requested}
                                                    onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, requested: e.target.value })}
                                                    className="w-full text-sm border-gray-200 rounded-lg disabled:bg-gray-50 bg-gray-50/10 font-bold"
                                                />
                                            </div>
                                            <div className="relative">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expected Date</label>
                                                <input
                                                    disabled={isSnapshot}
                                                    type="date"
                                                    value={localOpp.dates.expected}
                                                    onChange={(e) => requestExpectedDateChange(e.target.value)}
                                                    className="w-full text-sm border-gray-200 rounded-lg disabled:bg-gray-50 bg-gray-50/10 font-bold"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sold?</label>
                                                <div className="flex gap-2">
                                                    <button disabled={isSnapshot} onClick={() => updateKpiField('sold', true)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors disabled:opacity-50 ${localOpp.kpis.sold === true ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500'}`}>Yes</button>
                                                    <button disabled={isSnapshot} onClick={() => updateKpiField('sold', false)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors disabled:opacity-50 ${localOpp.kpis.sold === false ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-500'}`}>No</button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proposal Amount (USD)</label>
                                                <input disabled={isSnapshot} type="number" value={localOpp.kpis.proposalAmountUSD || ''} onChange={(e) => updateKpiField('proposalAmountUSD', parseFloat(e.target.value))} className="w-full border-gray-200 rounded-lg text-sm disabled:bg-gray-50 font-black text-gray-700" placeholder="0.00" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Timeline & Execution */}
                                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                            <div className="flex items-center gap-2">
                                                <CalendarDays className="w-5 h-5 text-blue-500" />
                                                <h3 className="font-bold text-gray-800">Timeline & Execution</h3>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleExportKpiPDF}
                                                    className="text-xs font-black bg-white text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                                                >
                                                    <FileDown className="w-4 h-4 text-gray-400" /> Export KPI PDF
                                                </button>
                                                <button
                                                    onClick={() => setShowFullCalendar(true)}
                                                    className="text-xs font-black bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                                                >
                                                    <Table className="w-4 h-4" /> View Full Calendar
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Requested / Received At</label>
                                                <input disabled={isSnapshot} type="date" value={localOpp.kpis.timeline?.receivedAt || ''} onChange={(e) => updateKpiField('timeline.receivedAt', e.target.value)} className="w-full border-gray-200 rounded text-sm mt-1 disabled:bg-gray-50" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Delivered / Tendered At</label>
                                                <input disabled={isSnapshot} type="date" value={localOpp.kpis.timeline?.deliveredAt || ''} onChange={(e) => updateKpiField('timeline.deliveredAt', e.target.value)} className="w-full border-gray-200 rounded text-sm mt-1 disabled:bg-gray-50" />
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-sm text-center">
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Elapsed Calendar Days</label>
                                                    <div className="text-xl font-black text-gray-800">{totalElapsedCalendarDays}</div>
                                                    <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Total Time</div>
                                                </div>
                                                <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-sm text-center">
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Elapsed Business Days</label>
                                                    <div className="text-xl font-black text-blue-600">{totalElapsedBusinessDays}</div>
                                                    <div className="text-[10px] text-blue-400/60 font-bold uppercase mt-1">Workable</div>
                                                </div>
                                            </div>

                                            <div className="h-px bg-gray-200 w-full" />

                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="text-center">
                                                    <label className="block text-[9px] font-bold text-gray-400 uppercase">My Work (Days)</label>
                                                    <div className="text-lg font-black text-[#3DCD58]">{myWorkStats.days}</div>
                                                </div>
                                                <div className="text-center">
                                                    <label className="block text-[9px] font-bold text-gray-400 uppercase">My Work (Hours)</label>
                                                    <div className="text-lg font-black text-[#3DCD58]">{myWorkStats.hours}h</div>
                                                </div>
                                                <div className="text-center">
                                                    <label className="block text-[9px] font-bold text-gray-400 uppercase">Waiting (Sum)</label>
                                                    <div className="text-lg font-black text-yellow-600">{waitingOnOthersDays}d</div>
                                                </div>
                                            </div>

                                            {(executionUniqueDays > totalElapsedBusinessDays || hasDaysOutsideRange) && (
                                                <div className="flex flex-col gap-1 p-3 bg-red-50 rounded-xl border-2 border-red-100 shadow-sm animate-pulse">
                                                    <div className="flex items-center gap-2">
                                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                                        <p className="text-[11px] text-red-700 font-black uppercase">KPI Consistency Alert</p>
                                                    </div>
                                                    {executionUniqueDays > totalElapsedBusinessDays && totalElapsedBusinessDays > 0 && (
                                                        <p className="text-[10px] text-red-600 font-bold ml-6 line-clamp-2 italic">
                                                            Inconsistency detected: Unique execution days ({executionUniqueDays}) exceed Business Days ({totalElapsedBusinessDays}).
                                                        </p>
                                                    )}
                                                    {hasDaysOutsideRange && (
                                                        <p className="text-[10px] text-red-600 font-bold ml-6 line-clamp-2 italic">
                                                            Inconsistency detected: Some tracked days are outside the Received/Delivered range.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div className="flex gap-2 mb-1">
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Cancelled At</label>
                                                <input disabled={isSnapshot} type="date" value={localOpp.kpis.timeline.cancelledAt || ''} onChange={(e) => updateKpiField('timeline.cancelledAt', e.target.value)} className="border-gray-200 rounded text-xs p-1 h-6 shrink-0 disabled:bg-gray-50" />
                                            </div>
                                            <textarea disabled={isSnapshot} value={localOpp.kpis.timeline.cancelledReason || ''} onChange={(e) => updateKpiField('timeline.cancelledReason', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm h-16 resize-none disabled:bg-gray-50" placeholder="Reason for cancellation..." />
                                        </div>
                                    </div>
                                </div>

                                {/* Areas Involved Table */}
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                        <div className="flex items-center gap-2">
                                            <User className="w-5 h-5 text-purple-500" />
                                            <h3 className="font-bold text-gray-800">Areas Involved</h3>
                                        </div>
                                        <button onClick={() => setShowAddAreaModal(true)} className="text-xs bg-purple-50 text-purple-600 font-bold px-3 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100">+ Add Area</button>
                                    </div>

                                    <table className="w-full text-sm text-left">
                                        <thead className="text-[10px] text-gray-400 font-bold uppercase bg-gray-50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-4 py-2">Area / Team</th>
                                                <th className="px-4 py-2 w-32 text-center">Worked Days</th>
                                                <th className="px-4 py-2 w-32 text-center">Waiting Days</th>
                                                <th className="px-4 py-2 w-24"></th>
                                                <th className="px-4 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {(localOpp.kpis?.areasInvolved || []).map(area => (
                                                <tr key={area.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2 text-gray-800 font-medium">
                                                        {area.area || 'Unnamed Area'}
                                                    </td>
                                                    <td className="px-4 py-2 text-center font-bold text-blue-600">
                                                        {area.daysSpent || 0}
                                                    </td>
                                                    <td className="px-4 py-2 text-center font-bold text-yellow-600">
                                                        {area.waitingDays || 0}
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <button
                                                            onClick={() => setEditingAreaCalendar(area.id)}
                                                            className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 hover:bg-white transition-colors"
                                                        >
                                                            Edit Cal
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <button onClick={() => removeKpiArea(area.id)} className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!localOpp.kpis?.areasInvolved || localOpp.kpis.areasInvolved.length === 0) && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-8 text-gray-400 italic text-xs">No specific areas tracked yet.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                        <div className="p-3 bg-blue-50 rounded-lg shadow-inner">
                                            <label className="text-[9px] font-black text-blue-500 uppercase block mb-1">Execution Unique Days</label>
                                            <div className="text-xl font-black text-blue-700">{executionUniqueDays}</div>
                                        </div>
                                        <div className="p-3 bg-purple-50 rounded-lg shadow-inner text-right">
                                            <label className="text-[9px] font-black text-purple-500 uppercase block mb-1">Total Record Duration</label>
                                            <div className="text-xl font-black text-purple-700">{totalAreaDays}d</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showFullCalendar && (
                            <FullCalendarModal
                                areas={localOpp.kpis?.areasInvolved || []}
                                tasks={localOpp.tasks || []}
                                stakeholders={localOpp.stakeholders || []}
                                userName={userName}
                                holidays={holidays}
                                history={localOpp.history}
                                onSaveAreaCalendar={handleSaveAreaCalendar}
                                onAddArea={addKpiArea}
                                onRemoveArea={removeKpiArea}
                                onAddHistory={addHistoryEntry}
                                onEditHistory={(id, content) => updateHistoryEntry(id, 'content', content)}
                                onDeleteHistory={deleteHistoryEntry}
                                onClose={() => setShowFullCalendar(false)}
                                onRebuildAssignmentKpis={() => {
                                    const base = localOppRef.current;
                                    const rebuilt = base.tasks.reduce((current, task) => syncAssignmentKpi(current, task), base);
                                    localOppRef.current = rebuilt;
                                    setLocalOpp(rebuilt);
                                    onUpdate(rebuilt);
                                }}
                                onOpenTask={(taskId) => {
                                    const task = localOpp.tasks.find(item => item.id === taskId);
                                    if (!task) return;
                                    setShowFullCalendar(false);
                                    setActiveTabSafe('tasks');
                                    setSelectedTaskForEdit({ task });
                                }}
                                trackedAreas={trackedAreas || []}
                                timeline={localOpp.kpis?.timeline || { receivedAt: getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null }}
                                onUpdateTimeline={(field, val) => updateKpiField('timeline', { ...localOpp.kpis?.timeline, [field]: val })}
                            />
                        )}



                        {activeTab === 'commercial' && (
                            <div className="flex flex-col gap-6">
                                {/* Historical Snapshots Summary */}
                                {(commercialRevisionHistory.length > 0 || commercialInternalRevisions.length > 0) && (
                                     <div className="order-2 bg-blue-50 border border-blue-100 p-4 rounded-xl shadow-sm">
                                         <div className="flex items-center gap-3 mb-4">
                                             <div className="bg-blue-100 p-2 rounded-lg"><HistoryIcon className="w-5 h-5 text-blue-600" /></div>
                                             <div>
                                                 <h4 className="text-sm font-bold text-blue-900">Previous Revision Commercial Summary</h4>
                                                 <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wider">CQA Sell and margin saved in prior revisions</p>
                                             </div>
                                         </div>
                                         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                             {commercialRevisionHistory.map(revision => (
                                                 <div key={revision.id} className="bg-white border border-blue-100 rounded-xl p-3 shadow-sm">
                                                     <div className="flex justify-between gap-3 mb-3">
                                                         <div>
                                                             <div className="text-[10px] font-bold text-gray-400 uppercase">Revision</div>
                                                             <div className="text-sm font-black text-blue-900">{revision.revision}</div>
                                                         </div>
                                                         <div className="text-right text-[10px] text-blue-400 font-bold">
                                                             {new Date(revision.createdAt).toLocaleDateString()}
                                                         </div>
                                                     </div>
                                                     <div className="grid grid-cols-2 gap-3">
                                                         <div>
                                                             <div className="text-[10px] font-bold text-gray-400 uppercase">CQA Sell</div>
                                                             <div className="text-sm font-black text-gray-700">${revision.sellPrice.toLocaleString()}</div>
                                                         </div>
                                                         <div className="text-right">
                                                             <div className="text-[10px] font-bold text-gray-400 uppercase">CQA Margin</div>
                                                             <div className="text-sm font-black text-blue-700">{revision.margin}%</div>
                                                         </div>
                                                     </div>
                                                     {revision.notes?.trim() && (
                                                         <div className="mt-3 pt-3 border-t border-blue-50">
                                                             <button
                                                                 type="button"
                                                                 onClick={() => {
                                                                     setExpandedCommercialRevisionNotes(prev => {
                                                                         const next = new Set(prev);
                                                                         next.has(revision.id) ? next.delete(revision.id) : next.add(revision.id);
                                                                         return next;
                                                                     });
                                                                 }}
                                                                 className="flex items-center gap-1.5 text-[10px] font-black uppercase text-blue-600 hover:text-blue-800"
                                                             >
                                                                 {expandedCommercialRevisionNotes.has(revision.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                                 {expandedCommercialRevisionNotes.has(revision.id) ? 'Hide notes' : 'Show notes'}
                                                             </button>
                                                             {expandedCommercialRevisionNotes.has(revision.id) && (
                                                                 <div className="mt-2 rounded-lg bg-blue-50/70 border border-blue-100 px-3 py-2 text-xs text-blue-900 whitespace-pre-wrap">
                                                                     {revision.notes}
                                                                 </div>
                                                             )}
                                                         </div>
                                                     )}
                                                 </div>
                                             ))}
                                             {commercialInternalRevisions.map(revision => (
                                                 <div key={revision.id} className="bg-white border border-emerald-100 rounded-xl p-3 shadow-sm">
                                                     <div className="flex justify-between gap-3 mb-3">
                                                         <div>
                                                             <div className="text-[10px] font-bold text-gray-400 uppercase">Internal Rev</div>
                                                             <div className="text-sm font-black text-emerald-700">{revision.revision}</div>
                                                         </div>
                                                         <div className="text-right text-[10px] text-emerald-500 font-bold">
                                                             {new Date(revision.createdAt).toLocaleDateString()}
                                                         </div>
                                                     </div>
                                                     <div className="grid grid-cols-2 gap-3">
                                                         <div>
                                                             <div className="text-[10px] font-bold text-gray-400 uppercase">CQA Sell</div>
                                                             <div className="text-sm font-black text-gray-700">${(revision.cqaOfficialSellPrice || 0).toLocaleString()}</div>
                                                         </div>
                                                         <div className="text-right">
                                                             <div className="text-[10px] font-bold text-gray-400 uppercase">CQA GM</div>
                                                             <div className="text-sm font-black text-emerald-700">{revision.cqaOfficialMargin || 0}%</div>
                                                         </div>
                                                     </div>
                                                     {(revision.note || revision.discountsAndNotes)?.trim() && (
                                                         <div className="mt-3 pt-3 border-t border-emerald-50">
                                                             <button
                                                                 type="button"
                                                                 onClick={() => {
                                                                     setExpandedCommercialRevisionNotes(prev => {
                                                                         const next = new Set(prev);
                                                                         next.has(revision.id) ? next.delete(revision.id) : next.add(revision.id);
                                                                         return next;
                                                                     });
                                                                 }}
                                                                 className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-800"
                                                             >
                                                                 {expandedCommercialRevisionNotes.has(revision.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                                 {expandedCommercialRevisionNotes.has(revision.id) ? 'Hide notes' : 'Show notes'}
                                                             </button>
                                                             {expandedCommercialRevisionNotes.has(revision.id) && (
                                                                 <div className="mt-2 rounded-lg bg-emerald-50/70 border border-emerald-100 px-3 py-2 text-xs text-emerald-900 whitespace-pre-wrap space-y-2">
                                                                     {revision.note?.trim() && <p><b>Change:</b> {revision.note}</p>}
                                                                     {revision.discountsAndNotes?.trim() && <p><b>Commercial notes:</b> {revision.discountsAndNotes}</p>}
                                                                 </div>
                                                             )}
                                                         </div>
                                                     )}
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                )}

                                {/* Quick References â€” files & links for fast access */}
                                <div className="order-5 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <LinkIcon className="w-4 h-4 text-emerald-500" /> Quick References
                                        </h3>
                                        {!isSnapshot && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setShowQuickRefFilePicker(true)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-gray-800 transition-all shadow-sm"
                                                    title="Pick a file from the opportunity folder"
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5" /> Add File
                                                </button>
                                                <button
                                                    onClick={() => setAddLinkRefForm({ name: '', url: '' })}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3DCD58] text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-[#2db64a] transition-all shadow-sm"
                                                    title="Add a URL link"
                                                >
                                                    <LinkIcon className="w-3.5 h-3.5" /> Add Link
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {quickRefs.length === 0 ? (
                                        <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-xl text-gray-400">
                                            <LinkIcon className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                            <p className="text-[11px] font-bold uppercase tracking-widest">No quick references yet</p>
                                            <p className="text-[10px] mt-1">Add files or links for fast access</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {quickRefs.map(ref => {
                                                const isEditing = editingQuickRefId === ref.id;
                                                const Icon = ref.type === 'link' ? LinkIcon : FileText;
                                                const accent = ref.type === 'link' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600';
                                                return (
                                                    <div key={ref.id} className="group flex items-center gap-3 p-3 bg-gray-50 hover:bg-white border border-gray-100 hover:border-[#3DCD58] rounded-xl transition-all">
                                                        <button
                                                            onClick={() => handleOpenQuickRef(ref)}
                                                            className={`shrink-0 p-2 rounded-lg ${accent} hover:scale-105 transition-transform`}
                                                            title={ref.type === 'link' ? 'Open link in new tab' : 'Open file'}
                                                        >
                                                            <Icon className="w-4 h-4" />
                                                        </button>
                                                        <div className="flex-1 min-w-0">
                                                            {isEditing ? (
                                                                <input
                                                                    autoFocus
                                                                    defaultValue={ref.name}
                                                                    onBlur={(e) => { handleRenameQuickRef(ref.id, e.target.value.trim() || ref.name); setEditingQuickRefId(null); }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') { handleRenameQuickRef(ref.id, (e.target as HTMLInputElement).value.trim() || ref.name); setEditingQuickRefId(null); }
                                                                        if (e.key === 'Escape') setEditingQuickRefId(null);
                                                                    }}
                                                                    className="w-full text-sm font-bold bg-white border border-[#3DCD58] rounded px-2 py-1 focus:ring-1 focus:ring-[#3DCD58]"
                                                                />
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleOpenQuickRef(ref)}
                                                                    className="block w-full text-left text-sm font-bold text-gray-800 truncate hover:text-[#3DCD58] transition-colors"
                                                                    title={ref.type === 'link' ? ref.url : ref.fileKey}
                                                                >
                                                                    {ref.name}
                                                                </button>
                                                            )}
                                                            <p className="text-[10px] text-gray-400 truncate font-mono">
                                                                {ref.type === 'link' ? ref.url : ref.fileKey}
                                                            </p>
                                                        </div>
                                                        {!isSnapshot && (
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                                <button onClick={() => setEditingQuickRefId(ref.id)} className="p-1.5 hover:bg-gray-200 rounded text-gray-500" title="Rename"><Edit3 className="w-3 h-3" /></button>
                                                                {ref.type === 'link' && ref.url && (
                                                                    <button onClick={() => window.open(ref.url!, '_blank', 'noopener,noreferrer')} className="p-1.5 hover:bg-gray-200 rounded text-gray-500" title="Open in new tab"><ExternalLink className="w-3 h-3" /></button>
                                                                )}
                                                                <button onClick={() => handleRemoveQuickRef(ref.id)} className="p-1.5 hover:bg-red-50 rounded text-red-400" title="Remove"><Trash2 className="w-3 h-3" /></button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {(localOpp.commercial.customSections || []).length > 0 && (
                                <>
                                <div className="order-3 flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-emerald-500" /> Commercial Breakdown
                                    </h3>
                                    {!isSnapshot && (
                                        <button 
                                            onClick={() => setShowAddSectionModal(true)}
                                            className="px-6 py-2.5 bg-[#3DCD58] text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-[#3DCD58]/20 hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" /> Add Section
                                        </button>
                                    )}
                                </div>

                                <div className="order-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {(localOpp.commercial.customSections || []).map((sec) => (
                                        <div key={sec.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm relative group hover:border-[#3DCD58] transition-all">
                                            {!isSnapshot && (
                                                <button 
                                                    onClick={() => {
                                                        if (window.confirm("Delete this section?")) {
                                                            const newSections = (localOpp.commercial.customSections || []).filter(s => s.id !== sec.id);
                                                            handleFieldChange('commercial', { ...localOpp.commercial, customSections: newSections });
                                                        }
                                                    }}
                                                    className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <div className="flex items-center gap-3 mb-6 pr-8">
                                                <div className="bg-emerald-50 p-2 rounded-xl text-emerald-500"><Database className="w-5 h-5" /></div>
                                                <input 
                                                    disabled={isSnapshot}
                                                    className="font-black text-gray-800 text-sm bg-transparent border-none p-0 focus:ring-0 w-full" 
                                                    value={sec.name} 
                                                    onChange={(e) => {
                                                        const newSections = (localOpp.commercial.customSections || []).map(s => s.id === sec.id ? { ...s, name: e.target.value } : s);
                                                        handleFieldChange('commercial', { ...localOpp.commercial, customSections: newSections });
                                                    }}
                                                    placeholder="Section Name"
                                                />
                                            </div>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block pl-1">Sell Price (Monto)</label>
                                                    <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 focus-within:bg-white focus-within:border-[#3DCD58] transition-all">
                                                        <DollarSign className="w-4 h-4 text-gray-300" />
                                                        <input
                                                            disabled={isSnapshot}
                                                            type="number"
                                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-black text-gray-700"
                                                            value={sec.sellPrice || 0}
                                                            onChange={(e) => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                const newSections = (localOpp.commercial.customSections || []).map(s => s.id === sec.id ? { ...s, sellPrice: val } : s);
                                                                handleFieldChange('commercial', { ...localOpp.commercial, customSections: newSections });
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block pl-1">Margin (%)</label>
                                                        <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 focus-within:bg-white focus-within:border-blue-500 transition-all">
                                                            <Percent className="w-3.5 h-3.5 text-gray-300" />
                                                            <input
                                                                disabled={isSnapshot}
                                                                type="number"
                                                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-black text-blue-600"
                                                                value={sec.margin || 0}
                                                                onChange={(e) => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    const newSections = (localOpp.commercial.customSections || []).map(s => s.id === sec.id ? { ...s, margin: val } : s);
                                                                    handleFieldChange('commercial', { ...localOpp.commercial, customSections: newSections });
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block pl-1">Discount (%)</label>
                                                        <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 focus-within:bg-white focus-within:border-amber-500 transition-all">
                                                            <Tag className="w-3.5 h-3.5 text-gray-300" />
                                                            <input
                                                                disabled={isSnapshot}
                                                                type="number"
                                                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-black text-amber-600"
                                                                value={sec.discount || 0}
                                                                onChange={(e) => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    const newSections = (localOpp.commercial.customSections || []).map(s => s.id === sec.id ? { ...s, discount: val } : s);
                                                                    handleFieldChange('commercial', { ...localOpp.commercial, customSections: newSections });
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="pt-2 border-t border-gray-50">
                                                    <div className="flex justify-between items-center bg-emerald-50/50 p-3 rounded-xl">
                                                        <span className="text-[10px] font-black text-emerald-900 uppercase tracking-tight">Net Section Total</span>
                                                        <span className="text-sm font-black text-emerald-700">${((sec.sellPrice || 0) * (1 - (sec.discount || 0)/100)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </>
                                )}

                                <div className="order-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-emerald-500" /> Commercial Annotations
                                        </h4>
                                        <OptimizedTextArea
                                            disabled={isSnapshot}
                                            value={localOpp.commercial.discountsAndNotes}
                                            onChange={(val: string) => handleFieldChange('commercial', { ...localOpp.commercial, discountsAndNotes: val })}
                                            className="w-full border-gray-200 rounded-xl text-sm mt-1 h-40 focus:ring-emerald-500 focus:border-emerald-500 placeholder:italic p-4"
                                            placeholder="Document logic, discount justifications, or special project terms here..."
                                        />
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                                        <div className="flex justify-between items-center mb-6">
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-emerald-500" /> Project Financial View
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                {(localOpp.commercial.customSections || []).length > 0 && (
                                                    <div className="flex items-center gap-2 bg-[#3DCD58]/10 px-4 py-1.5 rounded-full">
                                                        <span className="text-[10px] text-[#3DCD58] font-black uppercase tracking-widest">Global GM:</span>
                                                        <span className="text-xs text-[#3DCD58] font-black">{totalMargin}%</span>
                                                    </div>
                                                )}
                                                {!isSnapshot && (
                                                    <>
                                                        <button
                                                            onClick={createCommercialInternalRevision}
                                                            className="px-2.5 py-1.5 bg-white border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase rounded-lg shadow-sm hover:bg-emerald-50 transition-all flex items-center gap-1.5"
                                                            title={`Save internal commercial revision ${getNextCommercialInternalRevision()}`}
                                                        >
                                                            <GitBranch className="w-3.5 h-3.5" /> {getNextCommercialInternalRevision()}
                                                        </button>
                                                        <button
                                                            onClick={() => setShowAddSectionModal(true)}
                                                            className="px-3 py-1.5 bg-[#3DCD58] text-white text-[10px] font-black uppercase rounded-lg shadow-sm hover:bg-[#2db64a] transition-all flex items-center gap-1.5"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" /> Add Line
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {commercialCqaLinkVisible && commercialCqaUrl && (
                                            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#3DCD58]/30 bg-[#3DCD58]/5 px-4 py-2.5 mb-4">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <LinkIcon className="w-4 h-4 text-[#3DCD58] shrink-0" />
                                                    <span className="text-xs font-bold text-gray-700 shrink-0">CQA:</span>
                                                    <span className="text-xs text-gray-500 truncate">{commercialCqaUrl}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button onClick={() => window.open(commercialCqaUrl, '_blank', 'noopener,noreferrer')} className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors">Open CQA</button>
                                                    {onHideCommercialCqaLink && (
                                                        <button onClick={onHideCommercialCqaLink} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-white rounded-lg transition-colors" title="Hide this link (re-enable in Settings > Expediente > Commercial Tab)">
                                                            <EyeOff className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {!commercialCqaUrl && !hiddenQuickLinkIds.has('cqaLink') && (
                                            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#3DCD58]/30 bg-[#3DCD58]/5 px-4 py-2.5 mb-4">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <LinkIcon className="w-4 h-4 text-[#3DCD58] shrink-0" />
                                                    <span className="text-xs font-bold text-gray-700">No CQA link has been added yet.</span>
                                                </div>
                                                <button
                                                    onClick={() => window.open('https://cqaweb.se.com/', '_blank', 'noopener,noreferrer')}
                                                    className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors shrink-0"
                                                >
                                                    Create CQA
                                                </button>
                                            </div>
                                        )}
                                        {!commercialCqaLinkVisible && commercialCqaUrl && onShowCommercialCqaLink && (
                                            <button
                                                onClick={onShowCommercialCqaLink}
                                                className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-[#3DCD58] uppercase mb-4 px-1"
                                                title="Show the CQA quick-open link again"
                                            >
                                                <Eye className="w-3 h-3" /> Show CQA link
                                            </button>
                                        )}
                                        {/* BFO Opportunity Lines. Lives here rather than in the quick
                                            links because it is commercial data, and it sits next to CQA
                                            so both pricing sources are in one place. Typed by hand, or
                                            filled by the bFO autofill. Hideable like the CQA link. */}
                                        {commercialOppLinesLinkVisible && (
                                            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#3DCD58]/30 bg-[#3DCD58]/5 px-4 py-2.5 mb-4">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    <LinkIcon className="w-4 h-4 text-[#3DCD58] shrink-0" />
                                                    <span className="text-xs font-bold text-gray-700 shrink-0">Opp Lines:</span>
                                                    <input
                                                        type="text"
                                                        value={localOpp.commercial?.oppLinesLink || ''}
                                                        onChange={(e) => updateOppLinesLink(e.target.value)}
                                                        placeholder="BFO Opportunity Lines URL"
                                                        className="flex-1 min-w-0 bg-transparent text-xs text-gray-500 placeholder-gray-400 outline-none focus:text-gray-700"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {(localOpp.commercial?.oppLinesLink || '').trim() && (
                                                        <button
                                                            onClick={() => window.open((localOpp.commercial?.oppLinesLink || '').trim(), '_blank', 'noopener,noreferrer')}
                                                            className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors"
                                                        >
                                                            Open Lines
                                                        </button>
                                                    )}
                                                    {onHideCommercialOppLinesLink && (
                                                        <button onClick={onHideCommercialOppLinesLink} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-white rounded-lg transition-colors" title="Hide this link (re-enable in Settings > Expediente > Commercial Tab)">
                                                            <EyeOff className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {!commercialOppLinesLinkVisible && onShowCommercialOppLinesLink && (
                                            <button
                                                onClick={onShowCommercialOppLinesLink}
                                                className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-[#3DCD58] uppercase mb-4 px-1"
                                                title="Show the Opportunity Lines link again"
                                            >
                                                <Eye className="w-3 h-3" /> Show Opp Lines link
                                            </button>
                                        )}
                                        <div className="flex-1 p-6 border-2 border-emerald-50 rounded-[28px] bg-gradient-to-br from-white to-emerald-50/30 flex flex-col justify-center space-y-8">
                                            <div className="grid grid-cols-2 gap-10">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">CQA Target Sell</label>
                                                    <div className="flex items-center gap-2 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm focus-within:border-[#3DCD58] transition-all">
                                                        <DollarSign className="w-5 h-5 text-emerald-500" />
                                                        <input
                                                            disabled={isSnapshot}
                                                            type="number"
                                                            value={localOpp.commercial.cqaOfficialSellPrice}
                                                            onChange={(e) => updateOfficialSellPrice(parseFloat(e.target.value) || 0)}
                                                            className="w-full bg-transparent border-none p-0 text-xl font-black text-gray-800 focus:ring-0"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">CCO Margin %</label>
                                                    <div className="flex items-center gap-2 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm focus-within:border-blue-500 transition-all">
                                                        <Percent className="w-5 h-5 text-blue-500" />
                                                        <input
                                                            disabled={isSnapshot}
                                                            type="number"
                                                            value={localOpp.commercial.cqaOfficialMargin}
                                                            onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, cqaOfficialMargin: parseFloat(e.target.value) || 0 })}
                                                            className="w-full bg-transparent border-none p-0 text-xl font-black text-blue-700 focus:ring-0"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            {(localOpp.commercial.customSections || []).length > 0 && (
                                            <div className="pt-6 border-t border-gray-200/60">
                                                <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-[#3DCD58]/20 shadow-lg shadow-[#3DCD58]/5">
                                                    <div>
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5 pl-0.5">Calculated Net Total</span>
                                                        <span className="text-3xl font-black text-gray-900 tracking-tighter">${(commercialTotals.finalPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="p-3 bg-emerald-50 rounded-2xl">
                                                        <Target className="w-6 h-6 text-[#3DCD58]" />
                                                    </div>
                                                </div>
                                            </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                {(normalizedQuickLinks.defaultUrls.srLink || normalizedQuickLinks.defaultUrls.bfo) && (
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#3DCD58]/30 bg-[#3DCD58]/5 px-4 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <LinkIcon className="w-4 h-4 text-[#3DCD58] shrink-0" />
                                            <span className="text-xs font-bold text-gray-700 shrink-0">bFO SR:</span>
                                            <span className="text-xs text-gray-500 truncate">{normalizedQuickLinks.defaultUrls.srLink || normalizedQuickLinks.defaultUrls.bfo}</span>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button onClick={() => window.open(normalizedQuickLinks.defaultUrls.srLink || normalizedQuickLinks.defaultUrls.bfo, '_blank', 'noopener,noreferrer')} className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors">Open SR</button>
                                            <button onClick={copyHistoryToClipboard} className="text-xs font-bold px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg transition-colors">Copy History</button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800">Change Log / Events</h3>
                                    <div className="flex gap-2">
                                        <button onClick={copyHistoryToClipboard} className="text-xs font-bold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Copy for bFO</button>
                                        {!isSnapshot && (
                                            <button data-tutorial="add-history" onClick={() => addHistoryEntry()} className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors">+ Add Entry</button>
                                        )}
                                    </div>
                                </div>
                                <div className="relative border-l-2 border-[#3DCD58]/20 ml-3 space-y-8 pl-6 py-2">
                                    {sortHistoryEntries(localOpp.history || []).map(entry => (
                                        <div key={entry.id} id={`history-entry-${entry.id}`} className="relative">
                                            <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-[#3DCD58] border-4 border-white shadow-sm"></div>
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                                <div className="flex justify-between items-center mb-2">
                                                    <OptimizedInput disabled={isSnapshot} type="date" value={normalizeHistoryDate(entry.date)} onChange={(val: string) => updateHistoryEntry(entry.id, 'date', val)} className="text-xs font-bold text-[#3DCD58] border-none p-0 focus:ring-0 cursor-pointer disabled:opacity-70" />
                                                    {!isSnapshot && (
                                                        <button onClick={() => deleteHistoryEntry(entry.id)} className="text-gray-300 hover:text-red-500 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    )}
                                                </div>
                                                <OptimizedTextArea disabled={isSnapshot} value={entry.content} onChange={(val: string) => updateHistoryEntry(entry.id, 'content', val)} className="w-full text-sm text-gray-600 border-none p-0 focus:ring-0 resize-none bg-transparent" placeholder="Event description..." />
                                            </div>
                                        </div>
                                    ))}
                                    {localOpp.history.length === 0 && <p className="text-center text-gray-400 italic py-8">No history recorded yet.</p>}
                                </div>
                            </div>
                        )}

                        {activeTab === 'emails' && (
                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#3DCD58]" /> Generated Emails</h4>
                                        {!isSnapshot && <button onClick={() => openEmailCompose()} className="text-[10px] font-bold text-[#3DCD58] hover:underline uppercase">+ New Email</button>}
                                    </div>
                                    <div className="space-y-1.5">
                                        {(emailsData.generatedEmails || []).length === 0 && (
                                            <p className="text-xs italic text-gray-400 py-2">No emails generated yet for this opportunity.</p>
                                        )}
                                        {[...(emailsData.generatedEmails || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(rec => (
                                            <div key={rec.id} className="flex items-center gap-2 bg-gray-50/60 border border-gray-100 rounded-lg px-3 py-2 text-xs">
                                                <span className="flex-1 truncate text-gray-700" title={rec.subject}>
                                                    I sent an email <b>({emailTopicFromSubject(rec.subject)})</b> to {rec.to.join(', ')}
                                                </span>
                                                {rec.attachments.length > 0 && <span className="flex items-center gap-0.5 text-gray-400 shrink-0"><Paperclip className="w-3 h-3" />{rec.attachments.length}</span>}
                                                <span className="text-gray-300 shrink-0">{(rec.createdAt || '').slice(0, 10)}</span>
                                                {!isSnapshot && (
                                                    <button
                                                        title="Re-open this email in Outlook"
                                                        onClick={async () => {
                                                            const { composeOutlookDraft } = await import('../services/emailDraftService');
                                                            const result = await composeOutlookDraft({
                                                                to: rec.to, cc: rec.cc, bcc: rec.bcc, subject: rec.subject,
                                                                htmlBody: rec.bodyHtml,
                                                                attachments: rec.attachments.map(a => a.absolutePath),
                                                                mode: mergedEmailComposeSettings.outlookMode,
                                                            });
                                                            if (!result.ok) alert(result.error || 'Could not open the email in Outlook.');
                                                        }}
                                                        className="p-1 hover:bg-emerald-50 rounded text-gray-400 hover:text-[#3DCD58] shrink-0"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {emailIntegrationEnabled && (() => {
                            const visibleConversations = emailConversations.filter(conv => {
                                if (selectedEmailFolderId === 'all') return true;
                                if (selectedEmailFolderId === 'unfiled') return !conv.folderId;
                                return conv.folderId === selectedEmailFolderId;
                            });
                            const activeConversation = selectedEmailConversation && visibleConversations.some(c => c.id === selectedEmailConversation.id)
                                ? selectedEmailConversation
                                : visibleConversations[0] || null;

                            return (
                                <div className="h-[calc(100vh-230px)] min-h-[620px] bg-white border border-gray-200 rounded-xl overflow-hidden flex">
                                    <div className="w-64 border-r border-gray-100 bg-gray-50/70 flex flex-col">
                                        <div className="p-4 border-b border-gray-100">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><Inbox className="w-4 h-4" /> Emails</h3>
                                                <button onClick={addEmailGhostFolder} disabled={isSnapshot} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40" title="New folder"><FolderPlus className="w-3.5 h-3.5" /></button>
                                            </div>
                                            <div className="space-y-1">
                                                <button onClick={() => setSelectedEmailFolderId('all')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold ${selectedEmailFolderId === 'all' ? 'bg-white text-[#3DCD58] shadow-sm border border-emerald-100' : 'text-gray-500 hover:bg-white'}`}>All Conversations</button>
                                                <button onClick={() => setSelectedEmailFolderId('unfiled')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold ${selectedEmailFolderId === 'unfiled' ? 'bg-white text-[#3DCD58] shadow-sm border border-emerald-100' : 'text-gray-500 hover:bg-white'}`}>Unfiled</button>
                                                {[...emailsData.folders].sort((a, b) => (a.order || 0) - (b.order || 0)).map(folder => (
                                                    <button key={folder.id} onClick={() => setSelectedEmailFolderId(folder.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${selectedEmailFolderId === folder.id ? 'bg-white text-[#3DCD58] shadow-sm border border-emerald-100' : 'text-gray-500 hover:bg-white'}`}>
                                                        <Folder className="w-3.5 h-3.5" /> <span className="truncate">{folder.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="p-4 border-b border-gray-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Labels</h4>
                                                <button onClick={addEmailLabel} disabled={isSnapshot} className="text-[10px] font-black text-[#3DCD58] hover:underline disabled:opacity-40">+ Add</button>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {emailsData.labels.map(label => (
                                                    <span key={label.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: label.color }}>{label.text}</span>
                                                ))}
                                                {emailsData.labels.length === 0 && <span className="text-[10px] text-gray-300 italic">No labels</span>}
                                            </div>
                                        </div>
                                        <div className="mt-auto p-4 border-t border-gray-100 space-y-2">
                                            <button onClick={() => setShowOutlookSelector(true)} disabled={isSnapshot} className="w-full flex items-center justify-center gap-2 bg-[#3DCD58] text-white text-xs font-black rounded-lg py-2 hover:bg-[#2db64a] disabled:opacity-40">
                                                <Mail className="w-3.5 h-3.5" /> Select Email
                                            </button>
                                            <button onClick={addLocalEmailConversation} disabled={isSnapshot} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-lg py-2 hover:bg-gray-50 disabled:opacity-40">
                                                <Plus className="w-3.5 h-3.5" /> Add Conversation
                                            </button>
                                        </div>
                                    </div>

                                    <div className="w-80 border-r border-gray-100 flex flex-col">
                                        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{visibleConversations.length} Conversations</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {visibleConversations.length === 0 && (
                                                <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2 p-8 text-center">
                                                    <Mail className="w-10 h-10 opacity-30" />
                                                    <p className="text-xs font-bold">No conversations</p>
                                                </div>
                                            )}
                                            {visibleConversations.map((conv, idx) => (
                                                <div
                                                    key={conv.id}
                                                    onClick={() => setSelectedEmailConversationId(conv.id)}
                                                    className={`group p-4 border-b border-gray-50 cursor-pointer transition-colors ${activeConversation?.id === conv.id ? 'bg-emerald-50/60 border-l-4 border-l-[#3DCD58]' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={(e) => { e.stopPropagation(); moveEmailConversation(conv.id, -1); }} disabled={idx === 0 || isSnapshot} className="text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp className="w-3 h-3" /></button>
                                                            <button onClick={(e) => { e.stopPropagation(); moveEmailConversation(conv.id, 1); }} disabled={idx === visibleConversations.length - 1 || isSnapshot} className="text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronDown className="w-3 h-3" /></button>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="text-sm font-black text-gray-800 truncate">{conv.subject}</h4>
                                                            <p className="text-[10px] text-gray-400 font-bold mt-0.5">{conv.lastReceivedAt ? new Date(conv.lastReceivedAt).toLocaleDateString() : '-'}</p>
                                                            <p className="text-xs text-gray-500 line-clamp-2 mt-2">{conv.summary || conv.messages[0]?.bodyPreview || ''}</p>
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {(conv.labelIds || []).map(labelId => {
                                                                    const label = emailsData.labels.find(l => l.id === labelId);
                                                                    return label ? <span key={label.id} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ backgroundColor: label.color }}>{label.text}</span> : null;
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0 flex flex-col">
                                        {activeConversation ? (
                                            <>
                                                <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <h2 className="text-xl font-black text-gray-900 truncate">{activeConversation.subject}</h2>
                                                        <p className="text-xs text-gray-400 font-bold mt-1">{activeConversation.messages.length} messages</p>
                                                    </div>
                                                    <div className="flex gap-2 shrink-0">
                                                        <button onClick={() => openEmailConversation(activeConversation)} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50">
                                                            <ExternalLink className="w-3.5 h-3.5" /> Open
                                                        </button>
                                                        <button onClick={() => setShowEmailLinkPicker({ mode: 'conversation', targetType: 'task', conversationId: activeConversation.id })} className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100">
                                                            <CheckSquare className="w-3.5 h-3.5" /> Link Task
                                                        </button>
                                                        <button onClick={() => setShowEmailLinkPicker({ mode: 'conversation', targetType: 'note', conversationId: activeConversation.id })} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                                                            <FileText className="w-3.5 h-3.5" /> Link Note
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="p-5 grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5 overflow-y-auto">
                                                    <div className="space-y-5">
                                                        <div>
                                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Summary</label>
                                                            <OptimizedTextArea disabled={isSnapshot} rows={5} value={activeConversation.summary || ''} onChange={(val: string) => updateEmailConversation(activeConversation.id, { summary: val })} className="mt-2 w-full border-gray-100 bg-gray-50 rounded-xl text-sm p-4 focus:bg-white focus:ring-[#3DCD58] resize-none" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Conversation Messages</h3>
                                                            <div className="space-y-3">
                                                                {activeConversation.messages.map(message => (
                                                                    <div key={message.id} className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm">
                                                                        <div className="flex justify-between gap-3 mb-2">
                                                                            <div className="min-w-0">
                                                                                <p className="text-xs font-black text-gray-800 truncate">{message.subject}</p>
                                                                                <p className="text-[10px] text-gray-400 font-bold">{message.from || 'Unknown sender'}</p>
                                                                            </div>
                                                                            <span className="text-[10px] text-gray-400 font-bold shrink-0">{message.receivedAt ? new Date(message.receivedAt).toLocaleString() : '-'}</span>
                                                                        </div>
                                                                        <p className="text-xs text-gray-600 whitespace-pre-wrap">{message.bodyPreview || 'No preview available.'}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Folder</label>
                                                            <select disabled={isSnapshot} value={activeConversation.folderId || ''} onChange={(e) => updateEmailConversation(activeConversation.id, { folderId: e.target.value || undefined })} className="mt-2 w-full text-xs border-gray-200 rounded-lg">
                                                                <option value="">Unfiled</option>
                                                                {emailsData.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Labels</label>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {emailsData.labels.map(label => {
                                                                    const active = (activeConversation.labelIds || []).includes(label.id);
                                                                    return (
                                                                        <button key={label.id} disabled={isSnapshot} onClick={() => toggleEmailLabel(activeConversation.id, label.id)} className={`px-2 py-1 rounded-full text-[10px] font-black border ${active ? 'text-white' : 'text-gray-500 bg-white border-gray-200'}`} style={active ? { backgroundColor: label.color, borderColor: label.color } : undefined}>
                                                                            {label.text}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Linked Tasks</h4>
                                                            <div className="space-y-1">
                                                                {(activeConversation.linkedTaskIds || []).map(taskId => {
                                                                    const task = localOpp.tasks.find(t => t.id === taskId);
                                                                    return task ? <button key={task.id} onClick={() => setSelectedTaskForEdit({ task })} className="w-full text-left px-2 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold truncate">{task.title}</button> : null;
                                                                })}
                                                                {!(activeConversation.linkedTaskIds || []).length && <p className="text-[10px] text-gray-300 italic">None</p>}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Linked Notes</h4>
                                                            <div className="space-y-1">
                                                                {(activeConversation.linkedNoteIds || []).map(noteId => {
                                                                    const note = localOpp.notes.find(n => n.id === noteId);
                                                                    return note ? <button key={note.id} onClick={() => { setActiveTabSafe('notes'); setSelectedNoteIdSafe(note.id); }} className="w-full text-left px-2 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold truncate">{note.title}</button> : null;
                                                                })}
                                                                {!(activeConversation.linkedNoteIds || []).length && <p className="text-[10px] text-gray-300 italic">None</p>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-2">
                                                <Mail className="w-14 h-14 opacity-30" />
                                                <p className="text-sm font-bold">No conversation selected</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                            </div>
                        )}

                        {editingAreaCalendar && (() => {
                            const area = localOpp.kpis?.areasInvolved.find(a => a.id === editingAreaCalendar);
                            if (!area) return null;
                            return (
                                <KpiCalendarModal
                                    area={area}
                                    holidays={holidays}
                                    suggestedWaitingDates={[]}
                                    onClose={() => setEditingAreaCalendar(null)}
                                    onSave={(cal) => {
                                        handleSaveAreaCalendar(editingAreaCalendar!, cal);
                                        setEditingAreaCalendar(null);
                                    }}
                                    history={localOpp.history}
                                    onNavigateToHistory={handleNavigateToHistory}
                                    onAddHistory={addHistoryEntry}
                                    onEditHistory={(id, content) => updateHistoryEntry(id, 'content', content)}
                                    onDeleteHistory={deleteHistoryEntry}
                                />
                            );
                        })()}

                        {activeTab === 'folder' && (
                            <OpportunityFolderTab opportunityId={opportunity.id} opportunity={localOpp} onUpdate={onUpdate} initialFileKey={folderNavTarget || undefined} isSnapshot={isSnapshot} onPathChange={setCurrentFolderPath} onSelectionChange={setSelectedFolderEntryPath} />
                        )}

                        {activeTab === 'notes' && (
                            <div className={`${!isNoteFullScreen && !sowNavigationOpen ? 'grid grid-cols-[280px_minmax(0,1fr)]' : 'flex'} flex-1 min-h-0 gap-6 overflow-hidden ${isNoteFullScreen ? 'fixed inset-0 z-50 bg-white p-6' : ''}`}>
                                {!isNoteFullScreen && !sowNavigationOpen && (
                                    /* SCROLL PERF: overscroll-contain stops the wheel from chaining into the
                                       expediente's own scroll container once this list hits its end - that
                                       chaining is what made scrolling here feel sticky/laggy. */
                                    <div className="min-h-0 flex flex-col gap-3 overflow-hidden border-r border-gray-100 pr-4">
                                        {/* Search Bar for Notes */}
                                        <div className="relative mb-1">
                                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                placeholder="Search notes..."
                                                className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                            />
                                        </div>

                                        {/* Everything except search belongs to the scrollable navigation area. */}
                                        <div className="h-0 min-h-0 flex-1 overflow-y-scroll overflow-x-hidden overscroll-contain pr-1" style={{ scrollbarGutter: 'stable' }}>

                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                            {noteTemplates.map(tmpl => (
                                                <button
                                                    key={tmpl.id}
                                                    onClick={() => addNote(tmpl.title, tmpl.content)}
                                                    className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold capitalize flex items-center justify-center gap-2 shadow-sm transition-all"
                                                >
                                                    <Plus className="w-3 h-3" /> {tmpl.title}
                                                </button>
                                            ))}
                                            <button data-tutorial="add-note" onClick={() => addNote()} className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"><Zap className="w-3 h-3" /> Blank</button>
                                            {sowSectionEnabled && <button onClick={addSowNote} className="p-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all text-blue-600" title="Add the Scope of Work guided form to this opportunity"><ListChecks className="w-3 h-3" /> SOW</button>}
                                            <button onClick={() => addFolder()} className="p-3 bg-gray-50 hover:bg-amber-50 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all text-amber-600"><FolderPlus className="w-3 h-3" /> Folder</button>
                                        </div>
                                        {stakeholdersSectionEnabled && renderTeamPanelButton()}
                                        {false && isNoteTasksExpanded && currentNote && (
                                            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/50 p-2 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-700"><CheckSquare className="w-3.5 h-3.5" /> Linked tasks</span>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => createLinkedTaskForNote(currentNote.id)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="Create linked task"><Plus className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => setIsNoteTasksExpanded(false)} className="p-1 text-gray-400 hover:bg-white rounded" title="Close"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>
                                                {getLinkedTasksForNote(currentNote.id).length ? getLinkedTasksForNote(currentNote.id).map(task => (
                                                    <div key={task.id} className="rounded bg-white border border-blue-100 px-2 py-1.5">
                                                        <p className="text-xs font-bold text-gray-700 truncate" title={task.title}>{task.title}</p>
                                                        <div className="mt-1 flex gap-2">
                                                            <button onClick={() => { setActiveTabSafe('tasks'); setSelectedTaskForEdit({ task }); }} className="text-[10px] font-bold text-blue-600 hover:underline">Open</button>
                                                            <button onClick={() => handleOpenSplitView(task, currentNote.id)} className="text-[10px] font-bold text-blue-600 hover:underline">Split</button>
                                                        </div>
                                                    </div>
                                                )) : <p className="text-[11px] text-gray-400">No linked tasks yet.</p>}
                                            </div>
                                        )}
                                        {filteredNotes.length === 0 && searchTerm && (
                                            <div className="text-center text-gray-400 text-xs py-4">No notes found matching "{searchTerm}"</div>
                                        )}
                                        {/* Notes tree: search = flat list, no search = folder/sub-note tree.
                                            Drag & drop: notes/folders are draggable; dropping a note onto another
                                            note/folder moves+reorders it (moveAndReorderNote), dropping a folder
                                            onto another folder nests it (moveAndReorderFolder, guarded against
                                            nesting into its own descendant). Dropping on the empty area below
                                            everything sends the dragged item back to the root. */}
                                        {(() => {
                                            const isSearching = !!searchTerm.trim();
                                            const allFolders = localOpp.notesFolders || [];
                                            const dateDesc = (a: MeetingNote, b: MeetingNote) => new Date(b.date).getTime() - new Date(a.date).getTime();
                                            const folderNameAsc = (a: NoteFolder, b: NoteFolder) => a.name.localeCompare(b.name);

                                            // SCROLL/RENDER PERF: group the notes and folders ONCE per render.
                                            // renderNote/renderFolder used to re-scan the whole notes array for
                                            // every row they drew, so painting the tree was O(notes^2) - and this
                                            // tree is re-rendered by any unrelated expediente state change, which
                                            // is what made the panel feel heavy while moving through it.
                                            const childNotesByParent = new Map<string, MeetingNote[]>();
                                            const rootNotesByFolder = new Map<string, MeetingNote[]>();
                                            const rootNotesNoFolder: MeetingNote[] = [];
                                            const pushInto = <T,>(map: Map<string, T[]>, key: string, item: T) => {
                                                const list = map.get(key);
                                                if (list) list.push(item); else map.set(key, [item]);
                                            };
                                            localOpp.notes.forEach(n => {
                                                // Same browsable set as filteredNotes (used by the search view):
                                                // hidden notes, and the SOW when its Settings toggle is off.
                                                if (n.hidden || (!sowSectionEnabled && n.format === 'sow')) return;
                                                if (n.parentId) pushInto(childNotesByParent, n.parentId, n);
                                                else if (n.folderId) pushInto(rootNotesByFolder, n.folderId, n);
                                                else rootNotesNoFolder.push(n);
                                            });
                                            const childFoldersByParent = new Map<string, NoteFolder[]>();
                                            const topLevelFolders: NoteFolder[] = [];
                                            allFolders.forEach(f => {
                                                if (f.parentFolderId) pushInto(childFoldersByParent, f.parentFolderId, f);
                                                else topLevelFolders.push(f);
                                            });

                                            // Called as a plain function to avoid JSX key-prop TypeScript issues
                                            const renderNote = (note: MeetingNote, indent: number): React.ReactNode => {
                                                const children = isSearching ? [] : sortWithOrderFallback(childNotesByParent.get(note.id) || [], dateDesc);
                                                const hasChildren = children.length > 0;
                                                const isCollapsed = collapsedFolders.has(note.id);
                                                // The Stakeholders panel replaces the note editor on the right, so
                                                // while it is open no note is actually being edited - keeping the
                                                // row highlighted made it look like the note was still open.
                                                const isSelected = selectedNoteId === note.id && !teamPanelOpen;
                                                const isDropTarget = !isSearching && dropTargetId === note.id;
                                                return (
                                                    <React.Fragment key={note.id}>
                                                        <div
                                                            id={`note-item-${note.id}`}
                                                            draggable={!isSearching}
                                                            onDragStart={(e) => {
                                                                e.stopPropagation();
                                                                // setData is required by some browser engines to start a
                                                                // real HTML5 drag; the ref also supports a fast drop.
                                                                e.dataTransfer.effectAllowed = 'move';
                                                                e.dataTransfer.setData('text/plain', note.id);
                                                                draggedNoteIdRef.current = note.id;
                                                                setDraggedNoteId(note.id); setDraggedFolderId(null);
                                                            }}
                                                            onDragEnd={() => { draggedNoteIdRef.current = null; setDraggedNoteId(null); setDropTargetId(null); setNoteDropPlacement(null); }}
                                                            onDragOver={(e) => {
                                                                const activeDraggedNoteId = draggedNoteIdRef.current || draggedNoteId;
                                                                // A drop that this row cannot accept (itself, its own descendant,
                                                                // or a folder being dragged) still has to be swallowed here.
                                                                // Bubbling handed it to the root container underneath, which
                                                                // moved the note to the root instead of doing nothing - which is
                                                                // what made reordering feel like it randomly stopped working.
                                                                if (!activeDraggedNoteId || activeDraggedNoteId === note.id || isNoteDescendantOf(note.id, activeDraggedNoteId)) {
                                                                    if (activeDraggedNoteId || draggedFolderId) {
                                                                        e.preventDefault(); e.stopPropagation();
                                                                        e.dataTransfer.dropEffect = 'none';
                                                                    }
                                                                    setDropTargetId(null); setNoteDropPlacement(null);
                                                                    return;
                                                                }
                                                                e.preventDefault(); e.stopPropagation();
                                                                e.dataTransfer.dropEffect = 'move';
                                                                setDropTargetId(note.id);
                                                                setNoteDropPlacement(getNoteDropPlacement(e));
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault(); e.stopPropagation();
                                                                const placement = getNoteDropPlacement(e);
                                                                handleDropNoteOnNote(note, placement);
                                                                draggedNoteIdRef.current = null; setDraggedNoteId(null); setDropTargetId(null); setNoteDropPlacement(null);
                                                            }}
                                                            style={{ marginLeft: indent * 14 }}
                                                            className={`p-2.5 rounded-lg border relative group transition-colors ${isSearching ? 'cursor-pointer' : 'cursor-grab'} ${isSelected ? 'bg-[#3DCD58]/10 border-[#3DCD58]/30 ring-1 ring-[#3DCD58]/20 shadow-md' : isDropTarget && noteDropPlacement === 'inside' ? 'bg-[#3DCD58]/10 border-[#3DCD58] ring-1 ring-[#3DCD58]/30' : isDropTarget && noteDropPlacement === 'before' ? 'bg-blue-50 border-blue-300 border-t-4' : isDropTarget && noteDropPlacement === 'after' ? 'bg-blue-50 border-blue-300 border-b-4' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                                            onClick={() => { setTeamPanelOpen(false); setSelectedNoteIdSafe(note.id); }}
                                                        >
                                                            <div className={`flex items-center gap-1 ${isSearching ? 'pr-14' : 'pr-24'}`}>
                                                                {hasChildren ? (
                                                                    <button onClick={(e) => { e.stopPropagation(); setCollapsedFolders(prev => { const s = new Set(prev); s.has(note.id) ? s.delete(note.id) : s.add(note.id); return s; }); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                                                                        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                    </button>
                                                                ) : indent > 0 ? (
                                                                    <span className="w-3 shrink-0 text-gray-300 text-[8px] leading-none mt-0.5">â””</span>
                                                                ) : null}
                                                                <span className="font-bold text-xs text-gray-900 truncate">{note.title}</span>
                                                            </div>
                                                            <div className="text-[10px] font-mono text-gray-400 mt-0.5 pl-4 uppercase">{note.date}</div>
                                                            {isDropTarget && noteDropPlacement === 'inside' && (
                                                                <div className="mt-1 pl-4 text-[9px] font-bold uppercase tracking-wide text-[#2da848]">Drop as sub-note</div>
                                                            )}
                                                            <div className="absolute top-1.5 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {!isSearching && (
                                                                    <>
                                                                        <button onClick={(e) => { e.stopPropagation(); moveNoteInSiblings(note, -1); }} className="p-1 text-gray-300 hover:text-gray-700" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                                                                        <button onClick={(e) => { e.stopPropagation(); moveNoteInSiblings(note, 1); }} className="p-1 text-gray-300 hover:text-gray-700" title="Move down"><ChevronDown className="w-3 h-3" /></button>
                                                                    </>
                                                                )}
                                                                <button onClick={(e) => { e.stopPropagation(); addNote(undefined, undefined, note.id, note.folderId); }} className="p-1 text-gray-300 hover:text-[#3DCD58]" title="Add sub-note"><Plus className="w-3 h-3" /></button>
                                                                <button onClick={(e) => { e.stopPropagation(); setNoteHidden(note.id, true); }} className="p-1 text-gray-300 hover:text-blue-500" title="Hide from this list (keeps all its content)"><EyeOff className="w-3 h-3" /></button>
                                                                <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className="p-1 text-gray-300 hover:text-red-500" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                                            </div>
                                                        </div>
                                                        {!isCollapsed && children.map(child => renderNote(child, indent + 1))}
                                                    </React.Fragment>
                                                );
                                            };

                                            if (isSearching) {
                                                return filteredNotes.map(note => renderNote(note, 0));
                                            }

                                            const renderFolder = (folder: NoteFolder, indent: number): React.ReactNode => {
                                                const folderNotes = sortWithOrderFallback(rootNotesByFolder.get(folder.id) || [], dateDesc);
                                                const childFolders = sortWithOrderFallback(childFoldersByParent.get(folder.id) || [], folderNameAsc);
                                                const isFolderCollapsed = collapsedFolders.has(folder.id);
                                                const isDropTarget = dropTargetId === folder.id;
                                                return (
                                                    <React.Fragment key={folder.id}>
                                                        <div
                                                            draggable
                                                            onDragStart={(e) => { e.stopPropagation(); draggedNoteIdRef.current = null; setDraggedFolderId(folder.id); setDraggedNoteId(null); }}
                                                            onDragEnd={() => { setDraggedFolderId(null); setDropTargetId(null); }}
                                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTargetId(folder.id); }}
                                                            onDrop={(e) => {
                                                                e.preventDefault(); e.stopPropagation();
                                                                if (draggedNoteIdRef.current || draggedNoteId) handleDropNoteOnFolder(folder.id);
                                                                else if (draggedFolderId) handleDropFolderOnFolder(folder.id);
                                                                draggedNoteIdRef.current = null; setDraggedNoteId(null); setDraggedFolderId(null); setDropTargetId(null);
                                                            }}
                                                            style={{ marginLeft: indent * 14 }}
                                                            className={`flex items-center gap-1.5 group/folder px-1 py-1.5 rounded-lg transition-colors cursor-grab ${isDropTarget ? 'bg-amber-100 ring-1 ring-amber-300' : 'hover:bg-amber-50/60'}`}
                                                        >
                                                            <button onClick={() => setCollapsedFolders(prev => { const s = new Set(prev); s.has(folder.id) ? s.delete(folder.id) : s.add(folder.id); return s; })} className="text-gray-400 hover:text-gray-600 shrink-0">
                                                                {isFolderCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                            </button>
                                                            {isFolderCollapsed
                                                                ? <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                                : <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                                            {renamingFolderId === folder.id ? (
                                                                <input
                                                                    autoFocus
                                                                    defaultValue={folder.name}
                                                                    className="flex-1 text-xs font-bold text-gray-700 bg-transparent border-b border-[#3DCD58] focus:outline-none min-w-0"
                                                                    onBlur={(e) => { renameFolder(folder.id, e.target.value || folder.name); setRenamingFolderId(null); }}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingFolderId(null); }}
                                                                />
                                                            ) : (
                                                                <span onDoubleClick={() => setRenamingFolderId(folder.id)} className="flex-1 text-xs font-bold text-gray-700 truncate cursor-default select-none min-w-0" title="Double-click to rename">{folder.name}</span>
                                                            )}
                                                            <span className="text-[10px] text-gray-400 shrink-0">{folderNotes.length}</span>
                                                            <div className="flex gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity shrink-0">
                                                                <button onClick={() => addFolder(folder.id)} className="p-0.5 text-gray-400 hover:text-amber-500" title="New subfolder"><FolderPlus className="w-3 h-3" /></button>
                                                                <button onClick={() => addNote(undefined, undefined, undefined, folder.id)} className="p-0.5 text-gray-400 hover:text-[#3DCD58]" title="New note in folder"><Plus className="w-3 h-3" /></button>
                                                                <button onClick={() => deleteFolder(folder.id)} className="p-0.5 text-gray-400 hover:text-red-500" title="Delete folder"><Trash2 className="w-3 h-3" /></button>
                                                            </div>
                                                        </div>
                                                        {!isFolderCollapsed && childFolders.map(cf => renderFolder(cf, indent + 1))}
                                                        {!isFolderCollapsed && folderNotes.map(note => renderNote(note, indent + 1))}
                                                    </React.Fragment>
                                                );
                                            };

                                            const rootFolders = sortWithOrderFallback(topLevelFolders, folderNameAsc);
                                            const rootNotes = sortWithOrderFallback(rootNotesNoFolder, dateDesc);

                                            return (
                                                <div
                                                    className="flex flex-col gap-1.5 min-h-[40px]"
                                                    onDragOver={(e) => { if (draggedNoteId || draggedFolderId) { e.preventDefault(); setDropTargetId('__root__'); } }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        if (draggedNoteIdRef.current || draggedNoteId) handleDropNoteOnFolder(undefined);
                                                        else if (draggedFolderId) handleDropFolderOnFolder(undefined);
                                                        draggedNoteIdRef.current = null; setDraggedNoteId(null); setDraggedFolderId(null); setDropTargetId(null);
                                                    }}
                                                >
                                                    {rootFolders.map(folder => renderFolder(folder, 0))}
                                                    {rootNotes.map(note => renderNote(note, 0))}
                                                    {localOpp.notes.length === 0 && (
                                                        <div className="text-center text-gray-300 text-xs py-6 italic">No notes yet. Create one above.</div>
                                                    )}
                                                    {(draggedNoteId || draggedFolderId) && (
                                                        <div className={`text-center text-[10px] py-2 rounded-lg border border-dashed transition-colors ${dropTargetId === '__root__' ? 'border-[#3DCD58] text-[#3DCD58] bg-[#3DCD58]/5' : 'border-gray-200 text-gray-300'}`}>
                                                            Drop here to move to root
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {hiddenNotes.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                                                <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                                                    <EyeOff className="w-3 h-3" /> Hidden ({hiddenNotes.length})
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    {hiddenNotes.map(note => (
                                                        <div key={note.id} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                                                            <span className="flex-1 text-[11px] font-bold text-gray-400 truncate" title={note.title}>{note.title}</span>
                                                            <button onClick={() => setNoteHidden(note.id, false)} className="p-1 text-gray-400 hover:text-[#3DCD58]" title="Show again in the list"><Eye className="w-3 h-3" /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-[10px] text-gray-300 mt-1.5 italic leading-snug">Hidden notes keep every answer &mdash; a hidden SOW still feeds the Overview Scope button.</p>
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                )}
                                {/* min-w-0: without it this flex child can grow past the panel when a
                                    note holds a wide table/image, which pushed the whole expediente into
                                    a horizontal scroll instead of scrolling inside the editor. */}
                                <div className={`flex-1 min-h-0 min-w-0 flex flex-col gap-0 bg-white overflow-hidden ${currentNote?.format === 'sow' ? '' : 'rounded-xl border border-gray-200 shadow-sm'}`}>
                                    {teamPanelOpen ? (
                                        renderOpportunityTeamPanel()
                                    ) : currentNote ? (
                                        <>
                                            {/* SOW notes render the guided form full-bleed, so instead of floating a button
                                                over the iframe they get this slim bar: it sits above the content and never
                                                covers a question. */}
                                            {currentNote.format === 'sow' && (
                                                <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2 shrink-0">
                                                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest truncate">{currentNote.title}</span>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => setNoteHidden(currentNote.id, true)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="Hide the SOW from the notes list (keeps every answer)"><EyeOff className="w-4 h-4 text-gray-500" /></button>
                                                        <button onClick={() => setIsNoteFullScreen(!isNoteFullScreen)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title={isNoteFullScreen ? 'Exit full screen' : 'Full screen'}>{isNoteFullScreen ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}</button>
                                                    </div>
                                                </div>
                                            )}
                                            {currentNote.format !== 'sow' && <div className="p-2 border-b border-gray-100 flex items-center gap-2 bg-gray-50 shrink-0">
                                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                                    <NoteTitleInput value={currentNote.title} onCommit={(val) => updateSelectedNote('title', val)} className="font-black text-base bg-transparent border-none focus:ring-0 text-gray-800 flex-1 min-w-0 px-0 truncate" placeholder="Note Title" />
                                                    <div className="flex shrink-0 items-center gap-1 px-2 py-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                                                            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                                                            <input
                                                                type="date"
                                                                value={currentNote.date || getTodayStr()}
                                                                onChange={(e) => updateSelectedNote('date', e.target.value)}
                                                                className="text-xs font-bold text-gray-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <button
                                                        onClick={() => {
                                                            onMinimize?.({
                                                                id: currentNote.id,
                                                                type: 'note',
                                                                title: `NOT: ${currentNote.title.slice(0, 10)}`,
                                                                color: '#F59E0B',
                                                                data: { oppId: opportunity.id, deepLink: { tab: 'notes', noteId: currentNote.id } }
                                                            });
                                                            setSelectedNoteIdSafe(null);
                                                        }}
                                                        className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                                                        title="Minimize note"
                                                    >
                                                        <Minus className="w-4 h-4 text-gray-400" />
                                                    </button>
                                                    {remindersEnabled && (
                                                        <RemindMeButton
                                                            defaultTitle={currentNote.title}
                                                            opportunityId={opportunity.id}
                                                            noteId={currentNote.id}
                                                            taskOptions={localOpp.tasks.map(t => ({ id: t.id, label: t.title }))}
                                                            popoverAlign="left"
                                                            onAdd={(r) => onAddReminder?.(r)}
                                                        />
                                                    )}
                                                    {currentNote.format !== 'sow' && <button onClick={() => handleExportNotePDF(currentNote)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="Download Note PDF"><FileDown className="w-4 h-4 text-gray-500" /></button>}
                                                    <button onClick={() => setIsNoteFullScreen(!isNoteFullScreen)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">{isNoteFullScreen ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}</button>
                                                </div>
                                            </div>}
                                            {/* Editor Container with Vertical Flex */}
                                            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden">
                                                {isNoteTasksExpanded && currentNote && (
                                                    <div className="absolute inset-0 z-20">
                                                        <button type="button" onClick={() => setIsNoteTasksExpanded(false)} className="absolute inset-y-0 left-0 right-[min(26rem,92%)] cursor-text bg-transparent" aria-label="Return to note" title="Return to note" />
                                                    <aside className="absolute inset-y-0 right-0 flex w-[min(26rem,92%)] flex-col border-l border-gray-200 bg-white shadow-[-12px_0_28px_rgba(15,23,42,0.12)]">
                                                        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-blue-50 px-4 py-3 shrink-0">
                                                            <div className="min-w-0">
                                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Note module</p>
                                                                <h3 className="truncate text-sm font-black text-gray-800">Linked tasks</h3>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button onClick={() => createLinkedTaskForNote(currentNote.id)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Create</button>
                                                                <button onClick={() => setIsNoteTasksExpanded(false)} className="p-1.5 text-gray-400 hover:bg-white hover:text-gray-700 rounded" title="Close tasks"><X className="w-5 h-5" /></button>
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
                                                            {getLinkedTasksForNote(currentNote.id).length ? getLinkedTasksForNote(currentNote.id).map(task => (
                                                                <div key={task.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-sm font-bold text-gray-800">{task.title}</p>
                                                                            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${TASK_STATUS_COLORS[task.status as TaskStatus]}`}>{taskStatusLabel(task.status)}</span>
                                                                        </div>
                                                                        <div className="flex shrink-0 gap-1">
                                                                            <button onClick={() => { setActiveTabSafe('tasks'); setSelectedTaskForEdit({ task }); }} className="rounded px-2 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50">Open</button>
                                                                            <button onClick={() => handleOpenSplitView(task, currentNote.id)} className="rounded px-2 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50">Split</button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )) : <div className="py-12 text-center text-sm text-gray-400">There are no tasks linked to this note yet.</div>}
                                                        </div>
                                                    </aside>
                                                    </div>
                                                )}
                                                {currentNote.format === 'sow' ? (
                                                    <SowFormEmbed
                                                        key={currentNote.id}
                                                        content={currentNote.content}
                                                        people={localOpp.stakeholders || []}
                                                        directoryPeople={selectableGlobalContacts.map(contact => ({ id: contact.id, name: contact.name, email: contact.email, roles: contact.availableRoles, aliases: contact.aliases }))}
                                                        areas={trackedAreas}
                                                        prefill={sowPrefill}
                                                        globalForm={globalSowForm}
                                                        scopeCatalog={scopeCatalog}
                                                        onGlobalFormChange={onGlobalSowFormChange}
                                                        onSellerMissing={(name) => {
                                                            if (window.confirm(`"${name}" is not in the contact directory. Do you want to create or link a contact now? You can skip this and resolve it later in Stakeholders.`)) createContactAndInvolve(name);
                                                        }}
                                                        onNavigationOpenChange={setSowNavigationOpen}
                                                        backupKey={sowBackupKey(localOpp.id, currentNote.id)}
                                                        legacyBackupKey={sowNote?.id === currentNote.id ? legacySowBackupKey(localOpp.id) : undefined}
                                                        onOpportunitySync={syncSowOpportunityFields}
                                                        onGeneratedNote={addGeneratedSowNote}
                                                        onQuickLinkRequest={addSowLinkToOverview}
                                                        tasks={localOpp.tasks}
                                                        onTaskOpen={openSowTask}
                                                        onTaskConvert={convertSowTaskToAssignment}
                                                        onTaskRaciUpdate={updateSowTaskRaci}
                                                        onTaskCreate={createSowTask}
                                                        onStakeholderCreate={createSowStakeholder}
                                                        onChange={(json: string) => saveSowContent(currentNote.id, json)}
                                                    />
                                                ) : (
                                                    <NoteEditorWrapper
                                                        key={currentNote.id}
                                                        ref={noteEditorRef}
                                                        initialContent={activeNoteHtml}
                                                        onChange={(val: string) => updateSelectedNote('content', val)}
                                                        onAttach={() => setShowDocPicker({ type: 'note', id: currentNote.id })}
                                                        onToggleLinkedTasks={() => setIsNoteTasksExpanded(value => !value)}
                                                        mentionOptions={localOpp.stakeholders || []}
                                                    />
                                                )}

                                                {/* Tasks in this note section â€” not applicable to the embedded SOW form */}
                                                {false && currentNote.format !== 'sow' && <div className="border-t border-gray-100 bg-gray-50 flex-shrink-0">
                                                    <div className="px-4 py-2 flex justify-between items-center bg-white">
                                                        <button type="button" onClick={() => setIsNoteTasksExpanded(value => !value)} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-gray-800">
                                                            {isNoteTasksExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Tasks in this note ({(currentNote.inlineTasks || []).length})
                                                        </button>
                                                        {isNoteTasksExpanded && <button
                                                            onClick={() => handleAddInlineTask(currentNote.id)}
                                                            disabled={!currentNote}
                                                            className="text-xs flex items-center gap-1 font-bold text-[#3DCD58] hover:bg-[#3DCD58]/10 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <Plus className="w-3 h-3" /> Add task
                                                        </button>}
                                                    </div>
                                                    {isNoteTasksExpanded && <div className="max-h-[260px] overflow-y-auto overscroll-contain p-4 space-y-2 border-t border-gray-200">
                                                        {(currentNote.inlineTasks || []).length === 0 && (
                                                            <div className="text-center text-gray-400 text-xs italic py-2">No tasks in this note. Add one to track actions.</div>
                                                        )}
                                                        {(currentNote.inlineTasks || []).map((inlineTask) => {
                                                            const isLinked = !!inlineTask.linkedTaskId;
                                                            return (
                                                                <div key={inlineTask.id} className="flex items-center gap-3 group">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={inlineTask.isDone}
                                                                        onChange={(e) => handleInlineTaskChange(currentNote.id, inlineTask.id, { isDone: e.target.checked })}
                                                                        className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                                                    />
                                                                    <InlineTaskTextInput
                                                                        value={inlineTask.text || ''}
                                                                        onCommit={(val) => handleInlineTaskChange(currentNote.id, inlineTask.id, { text: val })}
                                                                        className={`flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 ${inlineTask.isDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                                                                        placeholder="Task description..."
                                                                    />
                                                                    {isLinked ? (
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                                                                                <Link className="w-3 h-3" /> Linked
                                                                            </span>
                                                                            <button
                                                                                onClick={() => {
                                                                                    const task = localOpp.tasks.find(t => t.id === inlineTask.linkedTaskId);
                                                                                    if (task) handleOpenSplitView(task, currentNote.id);
                                                                                }}
                                                                                className="text-[10px] text-gray-400 hover:text-blue-500 underline flex items-center gap-1"
                                                                                title="Open Split View"
                                                                            >
                                                                                <Columns className="w-3 h-3" /> Split
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleUnlinkInlineTask(currentNote.id, inlineTask)}
                                                                                className="p-1 text-gray-300 hover:text-red-500 rounded"
                                                                                title="Unlink"
                                                                            >
                                                                                <Unlink className="w-3 h-3" />
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleCreateLinkedTask(currentNote.id, inlineTask)}
                                                                            className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-blue-500 hover:bg-blue-50 px-2 py-1 rounded transition-all"
                                                                        >
                                                                            Create linked task
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => handleDeleteInlineTask(currentNote.id, inlineTask.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>}
                                                </div>}
                                            </div>

                                            {/* Linked Items (collapsible). Kept MOUNTED while collapsed - only
                                                hidden - so the counts on the bar stay live and expanding does
                                                not re-hit the document store. */}
                                            <div className="bg-white border-t border-gray-100">
                                                <button
                                                    type="button"
                                                    onClick={toggleNoteLinkedPanel}
                                                    className="w-full flex items-center justify-between gap-2 px-6 py-2 hover:bg-gray-50 transition-colors"
                                                    title={noteLinkedPanelOpen ? 'Collapse linked items' : 'Expand linked items'}
                                                >
                                                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                        {noteLinkedPanelOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                        Linked items
                                                    </span>
                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-300">
                                                        {noteLinkedDocCount} docs / {getLinkedTasksForNote(currentNote.id).length} tasks
                                                        {emailIntegrationEnabled ? ` / ${getLinkedEmailConversations({ type: 'note', id: currentNote.id }).length} emails` : ''}
                                                    </span>
                                                </button>
                                                <div className={noteLinkedPanelOpen ? 'px-6 pb-4 max-h-48 overflow-y-auto overscroll-contain' : 'hidden'}>
                                                <LinkedDocsList
                                                    key={refreshKey}
                                                    opportunityId={opportunity.id}
                                                    revision={localOpp.revision}
                                                    noteId={currentNote.id}
                                                    onNavigateToFile={navigateToFile}
                                                    onCountChange={handleNoteLinkedDocCount}
                                                />
                                                {renderLinkedEmailsForTarget({ type: 'note', id: currentNote.id })}

                                                {/* Linked Tasks Section */}
                                                {getLinkedTasksForNote(currentNote.id).length > 0 && (
                                                    <div className="mt-4 pt-4 border-t border-gray-100">
                                                        <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Linked Tasks (Legacy & Manual Links)</h5>
                                                        <div className="flex flex-wrap gap-2">
                                                            {getLinkedTasksForNote(currentNote.id).map(t => (
                                                                <div key={t.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                                                    <CheckSquare className="w-3.5 h-3.5 text-gray-400" />
                                                                    <span className="text-xs font-medium text-gray-700">{t.title}</span>
                                                                    <button
                                                                        onClick={() => { setActiveTabSafe('tasks'); setSelectedTaskForEdit({ task: t }); }}
                                                                        className="ml-2 text-[10px] font-bold text-[#3DCD58] hover:underline uppercase"
                                                                    >
                                                                        Open
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                </div>
                                            </div>
                                        </>
                                    ) : <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2"><FileText className="w-12 h-12 opacity-10" /><p className="font-bold opacity-30">Select a note to start editing</p></div>}
                                </div>
                            </div>
                        )}

                        {/* ... Tasks and other tabs unchanged in structure ... */}
                        {activeTab === 'tasks' && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-[700px]">
                                {/* Task View Content */}
                                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                                    <div className="flex items-center gap-4">
                                        <h3 className="font-black text-gray-800 uppercase tracking-wider">Action Plan</h3>
                                        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                            <button onClick={() => setTaskViewMode('list')} className={`p-1.5 rounded ${taskViewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="List View"><ListIcon className="w-4 h-4" /></button>
                                            <button onClick={() => setTaskViewMode('calendar')} className={`p-1.5 rounded ${taskViewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Calendar View"><CalendarIcon className="w-4 h-4" /></button>
                                            <button onClick={() => setTaskViewMode('kanban')} className={`p-1.5 rounded ${taskViewMode === 'kanban' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Kanban View"><LayoutGrid className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                            <input className="pl-8 pr-4 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58] w-40" placeholder="Filter tasks..." value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} />
                                        </div>
                                        {/* CHANGED: Replaced select with MultiSelect for Status Filtering */}
                                        <MultiSelect
                                            options={TASK_STATUS_ORDER}
                                            selected={taskStatusFilters}
                                            onChange={setTaskStatusFilters}
                                            placeholder="All Status"
                                        />
                                        <button onClick={getStatusSummary} className="text-xs font-bold bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Get Status</button>
                                        <button onClick={exportTasksToExcel} className="text-xs font-bold bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2 text-green-700 border-green-200 hover:border-green-400" title="Export all tasks to Excel (.xlsx)"><FileSpreadsheet className="w-4 h-4" /> Export to Excel</button>
                                        {!isSnapshot && (
                                            <>
                                                <button onClick={() => setShowCopyTasksModal(true)} className="text-xs font-bold bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2"><Copy className="w-4 h-4" /> Copy Tasks</button>
                                                <button data-tutorial="add-task" onClick={addTask} className="text-xs font-bold bg-[#3DCD58] text-white px-4 py-2 rounded-lg hover:bg-[#2db64a] shadow-lg shadow-[#3DCD58]/20 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Task</button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {taskViewMode === 'list' && (
                                    <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-b border-gray-100">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setTaskSort(taskSort === 'dueDate' ? 'none' : 'dueDate')}
                                                className={`flex items-center gap-1 bg-white border px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors ${taskSort === 'dueDate' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                            >
                                                <CalendarIcon className="w-3 h-3" /> Sort by due date
                                            </button>
                                            <button
                                                onClick={() => setTaskSort(taskSort === 'order' ? 'none' : 'order')}
                                                className={`flex items-center gap-1 bg-white border px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors ${taskSort === 'order' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                            >
                                                <ArrowUpDown className="w-3 h-3" /> Sort by order
                                            </button>
                                        </div>
                                        {filteredTasks.length > 0 && (() => {
                                            const doneCount = filteredTasks.filter(t => t.status === 'Done').length;
                                            const pct = Math.round(doneCount / filteredTasks.length * 100);
                                            return (
                                                <div className="flex items-center gap-2 min-w-[160px]">
                                                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                        <div className="h-full bg-[#3DCD58] transition-all" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-500 shrink-0">{doneCount}/{filteredTasks.length} done</span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                                    {taskViewMode === 'list' ? (
                                        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 custom-scrollbar">
                                            {filteredTasks.length === 0 ? (
                                                <div className="py-20 text-center text-gray-400 opacity-20"><ListChecks className="w-20 h-20 mx-auto mb-2" /><p className="font-bold">No tasks found with these filters</p></div>
                                            ) : (() => {
                                                const renderTaskCard = (task: Task) => {
                                                    const isDone = task.status === 'Done';
                                                    const isMissingInfo = task.status === 'Missing Info';
                                                    const doneSubtasks = task.subtasks.filter(s => s.completed && !s.outOfScope).length;
                                                    const totalSubtasks = task.subtasks.filter(s => !s.outOfScope).length;
                                                    const isExpanded = expandedTaskIds.has(task.id);
                                                    const subtasksExpanded = expandedSubtaskIds.has(task.id);

                                                    return (
                                                        <div
                                                            key={task.id}
                                                            id={`task-${task.id}`}
                                                            draggable={!isSnapshot}
                                                            onDragStart={(e) => { e.stopPropagation(); setDraggedTaskId(task.id); e.dataTransfer.effectAllowed = 'move'; }}
                                                            onDragOver={(e) => { if (draggedTaskId && draggedTaskId !== task.id) e.preventDefault(); }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (draggedTaskId && draggedTaskId !== task.id) {
                                                                    handleFieldChange('tasks', reorderTaskStrict(localOpp.tasks, draggedTaskId, task.order || 0));
                                                                }
                                                                setDraggedTaskId(null);
                                                            }}
                                                            onDragEnd={() => setDraggedTaskId(null)}
                                                            className={`group border rounded-xl transition-all cursor-pointer [content-visibility:auto] [contain-intrinsic-size:120px] ${draggedTaskId === task.id ? 'opacity-40' : ''} ${highlightTaskId === task.id ? 'bg-yellow-100 border-yellow-400 border-2' : isMissingInfo ? 'bg-red-50 border-red-300 hover:border-red-500 hover:shadow-md' : `bg-white hover:shadow-md ${isDone ? 'border-gray-100' : 'border-gray-100 hover:border-[#3DCD58]/30'}`}`}
                                                            onClick={() => setSelectedTaskForEdit({ task })}
                                                        >
                                                            <div className="p-3 flex gap-3">
                                                                <div
                                                                    className={`text-[10px] font-bold text-gray-300 w-6 flex flex-col items-center gap-0.5 shrink-0 ${isSnapshot ? 'opacity-50 pointer-events-none' : ''}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="Execution Order"
                                                                >
                                                                    {!isSnapshot && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleFieldChange('tasks', reorderTaskStrict(localOpp.tasks, task.id, (task.order || 0) - 1)); }}
                                                                            className="text-gray-300 hover:text-gray-500 rounded p-0.5 cursor-pointer leading-none transition-colors"
                                                                        >
                                                                            <ChevronUp className="w-3 h-3" />
                                                                        </button>
                                                                    )}
                                                                    <input
                                                                        disabled={isSnapshot}
                                                                        type="number"
                                                                        className="w-full bg-transparent border-none text-center focus:ring-0 p-0 text-gray-400 font-bold h-4 disabled:opacity-50"
                                                                        placeholder="#"
                                                                        key={`order-${task.order}`}
                                                                        defaultValue={task.order || ''}
                                                                        onBlur={(e) => {
                                                                            if (isSnapshot) return;
                                                                            if (e.target.value) {
                                                                                const newOrder = parseInt(e.target.value);
                                                                                if (newOrder !== task.order) {
                                                                                    handleFieldChange('tasks', reorderTaskStrict(localOpp.tasks, task.id, newOrder));
                                                                                }
                                                                            }
                                                                        }}
                                                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                                                    />
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleFieldChange('tasks', reorderTaskStrict(localOpp.tasks, task.id, (task.order || 0) + 1)); }}
                                                                        className="text-gray-300 hover:text-gray-500 rounded p-0.5 cursor-pointer leading-none transition-colors"
                                                                    >
                                                                        <ChevronDown className="w-3 h-3" />
                                                                    </button>
                                                                </div>

                                                                {/* Planner-style completion checkbox */}
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); toggleTaskDoneDirect(task); }}
                                                                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isDone ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300 hover:border-[#3DCD58]'}`}
                                                                    title={isDone ? 'Mark as not done' : 'Mark as done'}
                                                                >
                                                                    {isDone && <Check className="w-3 h-3 text-white" />}
                                                                </button>

                                                                <div className="flex-1 min-w-0">
                                                                    <div className={`text-sm font-semibold transition-colors truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900 group-hover:text-[#3DCD58]'}`}>{task.title}</div>
                                                                    {task.description && (
                                                                        <p className={`text-xs mt-1 whitespace-pre-wrap ${isDone ? 'text-gray-300' : 'text-gray-500'}`}>{task.description}</p>
                                                                    )}

                                                                    {totalSubtasks > 0 && (
                                                                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                                                            <button
                                                                                onClick={() => toggleSubtasksExpanded(task.id)}
                                                                                className="flex items-center gap-2 w-full"
                                                                                title={subtasksExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                                                            >
                                                                                {subtasksExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                                                                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                                    <div className="h-full bg-[#3DCD58] transition-all" style={{ width: `${Math.round(doneSubtasks / totalSubtasks * 100)}%` }} />
                                                                                </div>
                                                                                <span className="text-[10px] font-bold text-gray-400 shrink-0">{doneSubtasks}/{totalSubtasks} subtareas</span>
                                                                            </button>
                                                                            {/* Collapsed by default: nothing else renders here until expanded. */}
                                                                            {subtasksExpanded && (
                                                                                <div className="mt-1.5 pl-5 space-y-1">
                                                                                    {task.subtasks.map(sub => (
                                                                                        <label key={sub.id} className="flex items-center gap-2 cursor-pointer">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={sub.completed}
                                                                                                onChange={() => toggleSubtaskDirect(task, sub.id)}
                                                                                                className="w-3.5 h-3.5 rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58] shrink-0"
                                                                                            />
                                                                                            <span className={`text-xs ${sub.completed ? 'line-through text-gray-300' : 'text-gray-600'}`}>{sub.title}</span>
                                                                                        </label>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50 flex-wrap gap-y-1.5 gap-x-2">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            {task.dueDate && (
                                                                                <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400"><Clock className="w-3 h-3" />{task.dueDate}</span>
                                                                            )}
                                                                            {Array.from(new Set((task.responsibleTeamMemberIds || []).map(id => sowTeamMembers.find(m => m.id === id)?.area).filter((a): a is string => !!a))).map(a => <span key={a} className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold">{a}</span>)}
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); setAssignPopoverTaskId(assignPopoverTaskId === task.id ? null : task.id); }}
                                                                                className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                                                                            >
                                                                                <User className="w-3 h-3" /> {task.responsible || 'Assign'}
                                                                            </button>
                                                                            {(task.responsibleRequestedDate || task.responsibleDueDate) && (
                                                                                <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold" title="Requested on / committed date">
                                                                                    {task.responsibleRequestedDate || '?'} → {task.responsibleDueDate || '?'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                                            {(linkedTaskDocCounts[task.id] || 0) > 0 && (
                                                                                <button onClick={() => toggleTaskExpanded(task.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 shrink-0" title={isExpanded ? 'Hide attachments' : 'Show attachments'}>
                                                                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                                                </button>
                                                                            )}
                                                                            <button onClick={() => setShowDocPicker({ type: 'task', id: task.id })} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 shrink-0" title="Attach file from folder">
                                                                                <Paperclip className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            {(task.isAssignment || (task.approverTeamMemberIds?.length ?? 0) > 0) && informedTaskIds.has(task.id) && (
                                                                                <span title="An assignment email was already generated for this task" className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded uppercase shrink-0">✓ Informed</span>
                                                                            )}
                                                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                                                {timerEnabled && <TaskTimerButtonList task={task} oppId={localOpp.id} />}
                                                                                <button onClick={() => copyTask(task)} className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-500" title="Duplicate Task">
                                                                                    <Copy className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                            {task.calendarized && <div title="Calendarized" className="text-purple-500"><CalendarDays className="w-4 h-4" /></div>}
                                                                            {task.blockDoneUntilDependenciesDone && <Lock className="w-3 h-3 text-gray-400" />}
                                                                            <div className={`text-[9px] px-2 py-0.5 rounded border uppercase font-bold ${PRIORITY_COLORS[task.priority || 'Medium']}`}>{task.priority || 'Medium'}</div>
                                                                            <select
                                                                                value={task.status}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onChange={(e) => applyTaskFieldsDirect(task.id, { status: e.target.value as TaskStatus })}
                                                                                className={`text-[10px] font-black uppercase pl-2 pr-1 py-1 rounded-full shadow-sm border-none cursor-pointer ${TASK_STATUS_COLORS[task.status]}`}
                                                                            >
                                                                                {(task.owner === 'External Area' && ((task.responsibleTeamMemberIds || []).length > 0 || (task.externalAreas || []).length > 0) ? ASSIGNED_TASK_STATUSES : TASK_STATUS_ORDER).map(s => <option key={s} value={s}>{taskStatusLabel(s)}</option>)}
                                                                            </select>
                                                                        </div>
                                                                    </div>

                                                                    {assignPopoverTaskId === task.id && (
                                                                        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                                                                            <ResponsibleTeamPicker
                                                                                options={sowTeamMembers}
                                                                                onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToBoardTask(task.id, personId)); return undefined; }}
                                                                                selected={task.responsibleTeamMemberIds || []}
                                                                                onChange={(ids) => applyTaskFieldsDirect(task.id, {
                                                                                    responsibleTeamMemberIds: ids,
                                                                                    responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                                                                                    owner: ids.length > 0 ? 'External Area' : task.owner,
                                                                                    externalAreas: mergeAreasForMembers(task, ids),
                                                                                })}
                                                                            />
                                                                            {((task.responsibleTeamMemberIds || []).length > 0 || (task.externalAreas || []).length > 0) && (
                                                                                <div className="grid grid-cols-2 gap-2">
                                                                                    <div>
                                                                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Requested on</label>
                                                                                        <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-xs p-1.5" value={task.responsibleRequestedDate || ''} onChange={(e) => applyTaskFieldsDirect(task.id, { responsibleRequestedDate: e.target.value })} />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Committed date</label>
                                                                                        <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-xs p-1.5" value={task.responsibleDueDate || ''} onChange={(e) => applyTaskFieldsDirect(task.id, { responsibleDueDate: e.target.value })} />
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {isExpanded && (
                                                                        <div onClick={(e) => e.stopPropagation()}>
                                                                            <LinkedDocsList key={refreshKey} opportunityId={opportunity.id} revision={localOpp.revision} taskId={task.id} onNavigateToFile={navigateToFile} onCountChange={handleLinkedTaskDocCount} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                };

                                                const activeTasks = filteredTasks.filter(t => t.status !== 'Done' && t.status !== 'Canceled');
                                                const canceledTasks = filteredTasks.filter(t => t.status === 'Canceled');
                                                const doneTasks = filteredTasks.filter(t => t.status === 'Done');

                                                return (
                                                    <>
                                                        <div className="space-y-2.5">
                                                            {activeTasks.map(renderTaskCard)}
                                                        </div>
                                                        {/* Canceled/Done always render (never hidden behind a toggle) but sink to the bottom, dimmed, so they don't compete visually with active work. */}
                                                        {canceledTasks.length > 0 && (
                                                            <div className="pt-3">
                                                                <div className="text-[11px] font-black uppercase tracking-widest text-gray-300 mb-2">No aplica ({canceledTasks.length})</div>
                                                                <div className="space-y-2.5 opacity-60">
                                                                    {canceledTasks.map(renderTaskCard)}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {doneTasks.length > 0 && (
                                                            <div className="pt-3">
                                                                <div className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2">Completed ({doneTasks.length})</div>
                                                                <div className="space-y-2.5 opacity-80">
                                                                    {doneTasks.map(renderTaskCard)}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ) : taskViewMode === 'kanban' ? (
                                        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 custom-scrollbar">
                                            <div className="flex gap-4 h-full">
                                                {TASK_STATUS_ORDER.map(status => {
                                                    const columnTasks = filteredTasks.filter(t => t.status === status);
                                                    return (
                                                        <div
                                                            key={status}
                                                            className="w-64 shrink-0 flex flex-col bg-gray-50 rounded-xl border border-gray-100"
                                                            onDragOver={(e) => e.preventDefault()}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                const taskId = e.dataTransfer.getData('id');
                                                                if (taskId) applyTaskFieldsDirect(taskId, { status });
                                                            }}
                                                        >
                                                            <div className="p-3 border-b border-gray-200 flex items-center justify-between shrink-0">
                                                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${TASK_STATUS_COLORS[status]}`}>{taskStatusLabel(status)}</span>
                                                                <span className="text-[10px] font-bold text-gray-400">{columnTasks.length}</span>
                                                            </div>
                                                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                                                {columnTasks.map(task => {
                                                                    const doneSubtasks = task.subtasks.filter(s => s.completed && !s.outOfScope).length;
                                                                    const totalSubtasks = task.subtasks.filter(s => !s.outOfScope).length;
                                                                    const isDone = task.status === 'Done';
                                                                    return (
                                                                        <div
                                                                            key={task.id}
                                                                            draggable={!isSnapshot}
                                                                            onDragStart={(e) => e.dataTransfer.setData('id', task.id)}
                                                                            onClick={() => setSelectedTaskForEdit({ task })}
                                                                            className="group bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm hover:shadow-md hover:border-[#3DCD58]/30 cursor-grab active:cursor-grabbing transition-all [content-visibility:auto] [contain-intrinsic-size:100px]"
                                                                        >
                                                                            <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                                                                                {task.order && <span className="bg-gray-100 px-1.5 py-0.5 rounded font-black text-gray-500 text-[9px] border border-gray-200" title="Execution Order">#{task.order}</span>}
                                                                                {task.calendarized && <div title="Calendarized" className="text-purple-500"><CalendarDays className="w-3 h-3" /></div>}
                                                                                {(task.isAssignment || (task.approverTeamMemberIds?.length ?? 0) > 0) && informedTaskIds.has(task.id) && (
                                                                                    <span title="An assignment email was already generated for this task" className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded uppercase shrink-0">✓ Informed</span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-start gap-2">
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); toggleTaskDoneDirect(task); }}
                                                                                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isDone ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300 hover:border-[#3DCD58]'}`}
                                                                                >
                                                                                    {isDone && <Check className="w-2.5 h-2.5 text-white" />}
                                                                                </button>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className={`text-xs font-semibold truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`} title={task.title}>{task.title}</div>
                                                                                    {task.description && (
                                                                                        <p className={`text-[10px] mt-0.5 line-clamp-2 ${isDone ? 'text-gray-300' : 'text-gray-500'}`}>{task.description}</p>
                                                                                    )}
                                                                                </div>
                                                                                {task.blockDoneUntilDependenciesDone && <Lock className="w-2.5 h-2.5 text-gray-400 mt-1 shrink-0" />}
                                                                            </div>

                                                                            {totalSubtasks > 0 && (
                                                                                <div className="mt-2 pl-6 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                                        <div className="h-full bg-[#3DCD58] transition-all" style={{ width: `${Math.round(doneSubtasks / totalSubtasks * 100)}%` }} />
                                                                                    </div>
                                                                                    <span className="text-[9px] font-bold text-gray-400 shrink-0">{doneSubtasks}/{totalSubtasks}</span>
                                                                                </div>
                                                                            )}

                                                                            <div className="flex items-center gap-1.5 flex-wrap mt-2 pl-6">
                                                                                {task.dueDate && <span className="text-[9px] font-bold text-gray-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{task.dueDate}</span>}
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setAssignPopoverTaskId(assignPopoverTaskId === task.id ? null : task.id); }}
                                                                                    className="flex items-center gap-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                                                                                >
                                                                                    <User className="w-2.5 h-2.5" /> {task.responsible || 'Assign'}
                                                                                </button>
                                                                                <span className={`text-[8px] px-1 py-0.5 rounded border uppercase font-bold ${PRIORITY_COLORS[task.priority || 'Medium']}`}>{task.priority || 'Medium'}</span>
                                                                            </div>
                                                                            {(task.responsibleRequestedDate || task.responsibleDueDate) && (
                                                                                <div className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold mt-1.5 ml-6 inline-block" title="Requested on / committed date">
                                                                                    {task.responsibleRequestedDate || '?'} → {task.responsibleDueDate || '?'}
                                                                                </div>
                                                                            )}

                                                                            {assignPopoverTaskId === task.id && (
                                                                                <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                                                                                    <ResponsibleTeamPicker
                                                                                        options={sowTeamMembers}
                                                                                        onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToBoardTask(task.id, personId)); return undefined; }}
                                                                                        selected={task.responsibleTeamMemberIds || []}
                                                                                        onChange={(ids) => applyTaskFieldsDirect(task.id, {
                                                                                            responsibleTeamMemberIds: ids,
                                                                                            responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                                                                                            owner: ids.length > 0 ? 'External Area' : task.owner,
                                                                                            externalAreas: mergeAreasForMembers(task, ids),
                                                                                        })}
                                                                                    />
                                                                                    {((task.responsibleTeamMemberIds || []).length > 0 || (task.externalAreas || []).length > 0) && (
                                                                                        <div className="grid grid-cols-2 gap-2">
                                                                                            <div>
                                                                                                <label className="text-[9px] font-bold text-gray-500 uppercase">Requested on</label>
                                                                                                <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-xs p-1.5" value={task.responsibleRequestedDate || ''} onChange={(e) => applyTaskFieldsDirect(task.id, { responsibleRequestedDate: e.target.value })} />
                                                                                            </div>
                                                                                            <div>
                                                                                                <label className="text-[9px] font-bold text-gray-500 uppercase">Committed date</label>
                                                                                                <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-xs p-1.5" value={task.responsibleDueDate || ''} onChange={(e) => applyTaskFieldsDirect(task.id, { responsibleDueDate: e.target.value })} />
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}

                                                                            <div className="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                                                {timerEnabled && <TaskTimerButtonList task={task} oppId={localOpp.id} />}
                                                                                <button onClick={() => setShowDocPicker({ type: 'task', id: task.id })} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 shrink-0" title="Attach file from folder">
                                                                                    <Paperclip className="w-3 h-3" />
                                                                                </button>
                                                                                <button onClick={() => copyTask(task)} className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-500" title="Duplicate Task">
                                                                                    <Copy className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                                {columnTasks.length === 0 && (
                                                                    <div className="text-center py-8 text-gray-300 text-[10px] font-bold">No tasks</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-1 min-h-0 h-full overflow-hidden">
                                            <div className="flex-1 p-6 min-w-0 border-r border-gray-100 overflow-hidden flex flex-col">
                                                <CalendarView<Task>
                                                    items={filteredTasks}
                                                    getDate={(t) => t.dueDate}
                                                    onDateDrop={handleTaskDrop}
                                                    renderItem={(t) => (
                                                        <div
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('id', t.id);
                                                                e.dataTransfer.setData('type', 'task');
                                                            }}
                                                            onClick={() => setSelectedTaskForEdit({ task: t })}
                                                            className="text-[10px] p-1 rounded border border-gray-100 truncate cursor-pointer shadow-sm active:scale-95 transition-transform bg-blue-50 text-blue-700 font-medium"
                                                            title={t.title}
                                                        >
                                                            {t.title}
                                                        </div>
                                                    )}
                                                />
                                            </div>
                                            <div className="w-72 bg-gray-50 flex flex-col overflow-y-auto custom-scrollbar">
                                                <div className="p-4 border-b border-gray-200">
                                                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                                                        Unscheduled Tasks
                                                        <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">
                                                            {filteredTasks.filter(t => !t.dueDate && !['Done', 'Canceled'].includes(t.status)).length}
                                                        </span>
                                                    </h4>
                                                </div>
                                                <div className="p-4 space-y-3">
                                                    {filteredTasks
                                                        .filter(t => !t.dueDate && !['Done', 'Canceled'].includes(t.status))
                                                        .map(t => (
                                                            <div
                                                                key={t.id}
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    e.dataTransfer.setData('id', t.id);
                                                                    e.dataTransfer.setData('type', 'task');
                                                                    e.currentTarget.classList.add('opacity-50');
                                                                }}
                                                                onDragEnd={(e) => {
                                                                    e.currentTarget.classList.remove('opacity-50');
                                                                }}
                                                                onClick={() => setSelectedTaskForEdit({ task: t })}
                                                                className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-[#3DCD58] hover:shadow-md transition-all group"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight group-hover:text-[#3DCD58] transition-colors" title={t.title}>{t.title}</div>
                                                                </div>
                                                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                                                                    <span className="text-[10px] text-gray-400 font-bold tracking-wider">#{t.order || '?'}</span>
                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-black tracking-tight ${PRIORITY_COLORS[t.priority] || 'bg-gray-100 text-gray-600'}`}>{t.priority}</span>
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                    {filteredTasks.filter(t => !t.dueDate && !['Done', 'Canceled'].includes(t.status)).length === 0 && (
                                                        <div className="text-center py-10 opacity-40">
                                                            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                                                            <p className="text-xs font-bold text-gray-500">All tasks scheduled</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Task Edit Modal */}
            {
                selectedTaskForEdit && !isSubView && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !splitViewNoteId && setSelectedTaskForEdit(null)}>
                        <div
                            className={`bg-white shadow-2xl rounded-3xl p-8 animate-slide-in-right relative transition-all duration-300 ${splitViewNoteId ? 'w-[95vw] h-[90vh] grid grid-cols-2 gap-8 overflow-hidden' : 'w-full max-w-2xl max-h-[90vh] overflow-y-auto'}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Left Column (Task Editor) */}
                            <div className="flex flex-col h-full overflow-y-auto pr-2">
                                <div className="flex justify-between items-start mb-6 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-2xl shadow-sm ${TASK_STATUS_COLORS[selectedTaskForEdit.task.status]}`}><ListChecks className="w-6 h-6" /></div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-2xl font-black text-gray-900">Task Detail</h2>
                                            {opportunity.alias && <span className="text-[10px] bg-[#3DCD58]/10 text-[#3DCD58] px-2 py-0.5 rounded font-black uppercase tracking-tight">{opportunity.alias}</span>}
                                        </div>
                                    </div>
                                    <div className="flex max-w-full flex-wrap items-center justify-end gap-3">
                                        {selectedTaskForEdit.task.status === 'Approval' && <button onClick={() => approveTask(selectedTaskForEdit.task.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" /> Approve</button>}
                                        {selectedTaskForEdit.task.status === 'Done' && selectedTaskForEdit.task.reworkForTaskId && !selectedTaskForEdit.task.sentBackForApprovalAt && <button onClick={() => sendCorrectionBackForApproval(selectedTaskForEdit.task.id)} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-black text-white hover:bg-purple-700"><GitPullRequest className="mr-1 inline h-3.5 w-3.5" /> Send Back for Approval</button>}
                                        <button
                                            onClick={() => openEmailCompose(emailKindForTask(selectedTaskForEdit.task), [selectedTaskForEdit.task.id])}
                                            title="Generate the email that matches this task's current workflow state"
                                            className="flex items-center gap-1 text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                                        >
                                            <Mail className="w-3 h-3" /> {emailLabelForTask(selectedTaskForEdit.task)}
                                        </button>
                                        <button onClick={copyTaskSummary} className="flex items-center gap-1 text-xs font-bold bg-[#3DCD58]/10 text-[#3DCD58] px-3 py-1.5 rounded-lg hover:bg-[#3DCD58]/20 transition-colors">
                                            <Copy className="w-3 h-3" /> Summary
                                        </button>
                                        {remindersEnabled && (
                                            <RemindMeButton
                                                defaultTitle={selectedTaskForEdit.task.title}
                                                opportunityId={opportunity.id}
                                                taskId={selectedTaskForEdit.task.id}
                                                onAdd={(r) => onAddReminder?.(r)}
                                            />
                                        )}
                                        {timerEnabled && <TaskTimerButtonModal task={selectedTaskForEdit.task} oppId={opportunity.id} />}
                                        <button
                                            onClick={() => {
                                                onMinimize?.({
                                                    id: selectedTaskForEdit.task.id,
                                                    type: 'task',
                                                    title: `TSK: ${selectedTaskForEdit.task.title.slice(0, 10)}`,
                                                    color: '#3B82F6',
                                                    data: { oppId: opportunity.id, deepLink: { tab: 'tasks', taskId: selectedTaskForEdit.task.id } }
                                                });
                                                setSelectedTaskForEdit(null);
                                            }}
                                            className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                                            title="Minimize task"
                                        >
                                            <Minus className="w-5 h-5 text-gray-400" />
                                        </button>
                                        {!splitViewNoteId && <button onClick={() => setSelectedTaskForEdit(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-all"><X className="w-6 h-6 text-gray-400" /></button>}
                                    </div>
                                </div>

                                <div className="space-y-8 flex-1">
                                    <div className="flex items-start gap-4">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Task Title</label>
                                            <OptimizedInput className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0" value={selectedTaskForEdit.task.title} onChange={(val: string) => updateTaskInModal('title', val)} />
                                        </div>
                                        <div className="w-24 space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Order</label>
                                            <input type="number" className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0 text-center" value={selectedTaskForEdit.task.order || ''} onChange={(e) => updateTaskInModal('order', e.target.value ? parseInt(e.target.value) : null)} placeholder="#" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Current Status</label>
                                            <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.status} onChange={(e) => updateTaskInModal('status', e.target.value as any)}>{(selectedTaskForEdit.task.owner === 'External Area' && ((selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 || (selectedTaskForEdit.task.externalAreas || []).length > 0) ? ASSIGNED_TASK_STATUSES : TASK_STATUS_ORDER).map(s => <option key={s} value={s}>{taskStatusLabel(s)}</option>)}</select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Process Section</label>
                                            <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.processSection || ''} onChange={(e) => updateTaskInModal('processSection', e.target.value || undefined)}><option value="">Not classified</option>{PROCESS_SECTIONS.map(section => <option key={section} value={section}>{section}</option>)}</select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Priority</label>
                                            <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.priority || 'Medium'} onChange={(e) => updateTaskInModal('priority', e.target.value as any)}>{Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}</select>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Due Date</label>
                                                <div className="flex items-center gap-1">
                                                    <input type="checkbox" checked={selectedTaskForEdit.task.calendarized || false} onChange={(e) => updateTaskInModal('calendarized', e.target.checked)} className="rounded text-[#3DCD58] focus:ring-[#3DCD58] w-3 h-3" />
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Calendarized</label>
                                                </div>
                                            </div>
                                            <input type="date" className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 focus:bg-white transition-all" value={selectedTaskForEdit.task.dueDate} onChange={(e) => updateTaskInModal('dueDate', e.target.value)} />
                                            {selectedTaskForEdit.task.status === 'Done' && selectedTaskForEdit.task.completionDate && (
                                                <p className={`text-[10px] font-black uppercase tracking-widest px-1 ${selectedTaskForEdit.task.completionDate > (selectedTaskForEdit.task.dueDate || '') ? 'text-orange-500' : 'text-emerald-600'}`}>
                                                    Finished {selectedTaskForEdit.task.completionDate}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">{selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Changes Requested / Rework' ? 'Approval' : 'Assignment'}</label>
                                        {selectedTaskForEdit.task.status !== 'Approval' && selectedTaskForEdit.task.status !== 'Changes Requested / Rework' && <>
                                        <label className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-600"><input type="checkbox" checked={selectedTaskForEdit.task.isAssignment || false} onChange={e => updateTaskInModal('isAssignment', e.target.checked, e.target.checked ? { owner: 'External Area' } : {})} className="rounded text-[#3DCD58]" /> Track as assignment</label>
                                        <div className="flex gap-4 items-center">
                                            <select
                                                className="border-gray-200 rounded-lg text-sm bg-white font-bold p-2"
                                                value={selectedTaskForEdit.task.owner}
                                                onChange={(e) => updateTaskInModal('owner', e.target.value)}
                                            >
                                                <option value="Me">Me</option>
                                                <option value="External Area">External Area</option>
                                            </select>
                                            {selectedTaskForEdit.task.owner === 'External Area' && (
                                                <div className="flex gap-2 flex-1 flex-col">
                                                    <div>
                                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Area</div>
                                                        <SimpleMultiSelect
                                                            placeholder="Select area..."
                                                            options={areaOptions.map(area => ({ id: area, label: area }))}
                                                            selected={selectedTaskForEdit.task.externalAreas || []}
                                                            onChange={applyExternalAreas}
                                                        />
                                                        {areasWithoutResponsible(selectedTaskForEdit.task).length > 0 && (
                                                            <div className="mt-1 text-[9px] text-amber-700">
                                                                No responsible registered for {areasWithoutResponsible(selectedTaskForEdit.task).join(', ')} — the request stays on the area until you pick someone.
                                                            </div>
                                                        )}
                                                    </div>
                                                    <ResponsibleTeamPicker
                                                        options={sowTeamMembers}
                                                        onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToEditedTask('responsibleTeamMemberIds', personId)); return undefined; }}
                                                        selected={selectedTaskForEdit.task.responsibleTeamMemberIds || []}
                                                        onChange={setModalResponsibleIds}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        {selectedTaskForEdit.task.owner === 'External Area' && ((selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 || (selectedTaskForEdit.task.externalAreas || []).length > 0) && (
                                            <div className="grid grid-cols-2 gap-3 mt-3">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Requested on</label>
                                                    <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleRequestedDate || ''} onChange={(e) => updateTaskInModal('responsibleRequestedDate', e.target.value)} />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">{selectedTaskForEdit.task.status === 'Missing Info' ? 'Expected information' : 'Committed date'}</label>
                                                    <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleDueDate || ''} onChange={(e) => updateTaskInModal('responsibleDueDate', e.target.value)} />
                                                </div>
                                            </div>
                                        )}
                                        </>}
                                        {(selectedTaskForEdit.task.isAssignment || selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Changes Requested / Rework') && <div className={`${selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Changes Requested / Rework' ? '' : 'mt-3 border-t border-gray-200 pt-3'} grid grid-cols-1 md:grid-cols-2 gap-3`}>
                                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Approvers</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToEditedTask('approverTeamMemberIds', personId)); return undefined; }} selected={selectedTaskForEdit.task.approverTeamMemberIds || []} onChange={ids => updateTaskInModal('approverTeamMemberIds', ids, ids.length > 0 ? { isAssignment: true } : {})} /></div>
                                            {selectedTaskForEdit.task.status !== 'Approval' && selectedTaskForEdit.task.status !== 'Changes Requested / Rework' && <>
                                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Informed (CC)</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name, (personId) => addCreatedMemberToEditedTask('informedTeamMemberIds', personId)); return undefined; }} selected={selectedTaskForEdit.task.informedTeamMemberIds || []} onChange={ids => updateTaskInModal('informedTeamMemberIds', ids)} /></div>
                                            <details className="md:col-span-2 rounded-lg border border-gray-200 bg-white p-2">
                                                <summary className="cursor-pointer text-[9px] font-black uppercase text-gray-500">Advanced automatic date correction</summary>
                                                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    <div><label className="text-[9px] font-bold text-gray-500 uppercase">Actual delivery</label><input type="date" value={selectedTaskForEdit.task.responsibleDeliveredDate || ''} onChange={e => updateTaskInModal('responsibleDeliveredDate', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                                    {(selectedTaskForEdit.task.approverTeamMemberIds?.length ?? 0) > 0 && <>
                                                    <div><label className="text-[9px] font-bold text-gray-500 uppercase">Approval started</label><input type="date" value={selectedTaskForEdit.task.approvalRequestedDate || ''} onChange={e => updateTaskInModal('approvalRequestedDate', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                                    <div><label className="text-[9px] font-bold text-gray-500 uppercase">Actual approval</label><input type="date" value={selectedTaskForEdit.task.approvalDeliveredDate || ''} onChange={e => updateTaskInModal('approvalDeliveredDate', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                                    </>}
                                                </div>
                                            </details>
                                            </>}
                                            {(selectedTaskForEdit.task.status === 'Approval' || selectedTaskForEdit.task.status === 'Done') && !selectedTaskForEdit.task.reworkForTaskId && <button type="button" onClick={() => requestApprovalChanges(selectedTaskForEdit.task.id)} className="md:col-span-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-100"><GitPullRequest className="mr-1.5 inline h-4 w-4" /> Create Change Revision</button>}
                                            {selectedTaskForEdit.task.status !== 'Approval' && selectedTaskForEdit.task.status !== 'Changes Requested / Rework' &&
                                                <div className="md:col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Deliverable</label><input value={selectedTaskForEdit.task.deliverable || ''} onChange={e => updateTaskInModal('deliverable', e.target.value)} placeholder="Expected deliverable (used in assignment emails)" className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
                                            }
                                        </div>}
                                    </div>

                                    {/* Dependency Section */}
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Scheduling & Dependencies</label>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                            <div className="flex-1">
                                                <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Depends on</label>
                                                <SimpleMultiSelect
                                                    placeholder="Select dependencies..."
                                                    options={localOpp.tasks.filter(t => t.id !== selectedTaskForEdit.task.id).map(t => ({ id: t.id, label: `${t.order ? `[${t.order}] ` : ''}${t.title}` }))}
                                                    selected={selectedTaskForEdit.task.dependsOnTaskIds || []}
                                                    onChange={(val) => updateTaskInModal('dependsOnTaskIds', val)}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id="blockDoneToggle"
                                                    checked={selectedTaskForEdit.task.blockDoneUntilDependenciesDone || false}
                                                    onChange={e => updateTaskInModal('blockDoneUntilDependenciesDone', e.target.checked)}
                                                    className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                                                />
                                                <label htmlFor="blockDoneToggle" className="text-[10px] font-bold text-gray-600 uppercase select-none cursor-pointer flex items-center gap-1">
                                                    <Lock className="w-3 h-3 text-gray-400" />
                                                    Block Done until dependencies are done
                                                </label>
                                            </div>

                                            {/* Dependency Status Preview */}
                                            {selectedTaskForEdit.task.dependsOnTaskIds && selectedTaskForEdit.task.dependsOnTaskIds.length > 0 && (() => {
                                                const depIds = selectedTaskForEdit.task.dependsOnTaskIds || [];
                                                // Dependencies pointing at tasks that no longer exist (deleted task, or a
                                                // legacy id carried over from a template). They used to render as nothing,
                                                // so the task showed "2 selected" with no way to see or clear them.
                                                const missingIds = depIds.filter(depId => !localOpp.tasks.some(t => t.id === depId));
                                                return (
                                                    <div className="mt-2 pt-2 border-t border-gray-200/50">
                                                        {depIds.map(depId => {
                                                            const depTask = localOpp.tasks.find(t => t.id === depId);
                                                            if (!depTask) {
                                                                return (
                                                                    <div key={depId} className="flex items-center gap-2 text-xs py-0.5" title={depId}>
                                                                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                                                                        <span className="text-amber-700 italic">Missing task ({depId.slice(0, 8)}…)</span>
                                                                    </div>
                                                                );
                                                            }
                                                            return (
                                                                <div key={depId} className="flex items-center gap-2 text-xs py-0.5">
                                                                    <div className={`w-2 h-2 rounded-full ${depTask.status === 'Done' ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                                    <span className={`${depTask.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>{depTask.title}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {missingIds.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => updateTaskInModal('dependsOnTaskIds', depIds.filter(depId => !missingIds.includes(depId)))}
                                                                className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-black uppercase text-amber-700 hover:bg-amber-100"
                                                            >
                                                                Remove {missingIds.length} missing dependenc{missingIds.length > 1 ? 'ies' : 'y'}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Detailed Description</label>
                                        <OptimizedTextArea className="w-full border-gray-100 bg-gray-50 rounded-2xl text-sm min-h-[120px] p-4 shadow-inner focus:bg-white transition-all focus:ring-0" value={selectedTaskForEdit.task.description} onChange={(val: string) => updateTaskInModal('description', val)} />
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">Sub-Tasks Checklist<span className="flex items-center gap-1 normal-case tracking-normal text-[10px] font-bold text-gray-500" title="Keep one subtask per system selected in the Scope. Deselected systems are marked, never deleted."><input type="checkbox" checked={!!selectedTaskForEdit.task.subtasksPerSystem} onChange={(e) => updateTaskInModal('subtasksPerSystem', e.target.checked)} className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58] w-3 h-3" />one per Scope system</span></label>
                                            <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => updateTaskInModal('subtasks', [...selectedTaskForEdit.task.subtasks, { id: crypto.randomUUID(), title: 'New Sub-task', completed: false }])}>+ Add Entry</button>
                                        </div>
                                        <div className="space-y-2 bg-gray-50 p-4 rounded-2xl">
                                            {selectedTaskForEdit.task.subtasks.map((sub, idx) => (
                                                <div key={sub.id} className={`flex items-center gap-3 p-3 rounded-xl shadow-sm group ${sub.outOfScope ? 'bg-amber-50 border border-amber-200' : 'bg-white'}`}>
                                                    <div className="flex flex-col -space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => moveSubtask(idx, 'up')} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-0"><ChevronUp className="w-4 h-4" /></button>
                                                        <button onClick={() => moveSubtask(idx, 'down')} disabled={idx === selectedTaskForEdit.task.subtasks.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-0"><ChevronDown className="w-4 h-4" /></button>
                                                    </div>
                                                    <input type="checkbox" className="w-5 h-5 rounded border-gray-200 text-[#3DCD58] focus:ring-[#3DCD58]" checked={sub.completed} onChange={() => toggleSubtaskDirect(selectedTaskForEdit.task, sub.id)} />
                                                    <OptimizedInput className={`flex-1 border-none focus:ring-0 p-0 text-sm font-medium ${sub.completed ? 'line-through text-gray-300' : 'text-gray-700'}`} value={sub.title} onChange={(val: string) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, title: val } : s))} />
                                                    {sub.outOfScope && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700" title="This system is no longer selected in the Scope. It no longer counts towards finishing the task — delete it if it is not coming back.">Not in scope</span>}
                                                    <button onClick={() => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.filter(s => s.id !== sub.id))} className="text-gray-200 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {renderTaskScopeSection(selectedTaskForEdit.task)}

                                    {/* TIME TRACKING HISTORY */}
                                    {timerEnabled && <div className="space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Time Tracking History</label>
                                        <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                                            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-100/50">
                                                <span className="text-xs font-bold text-gray-500">Total Time</span>
                                                <span className="text-sm font-mono font-black text-gray-700">
                                                    {(() => {
                                                        const total = (selectedTaskForEdit.task.timeLogs || []).reduce((acc: any, log: any) => acc + (log.durationSeconds || 0), 0);
                                                        const h = Math.floor(total / 3600);
                                                        const m = Math.floor((total % 3600) / 60);
                                                        return `${h}h ${m}m`;
                                                    })()}
                                                </span>
                                            </div>
                                            {(selectedTaskForEdit.task.timeLogs || []).length > 0 ? (
                                                <div className="max-h-40 overflow-y-auto">
                                                    <table className="w-full text-[10px] text-left">
                                                        <thead className="bg-gray-100 text-gray-500 font-bold sticky top-0">
                                                            <tr>
                                                                <th className="p-2">Date</th>
                                                                <th className="p-2">Time</th>
                                                                <th className="p-2 text-right">Duration</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {[...selectedTaskForEdit.task.timeLogs].reverse().map((log: any) => (
                                                                <tr key={log.id} className="hover:bg-white transition-colors">
                                                                    <td className="p-2 text-gray-500">{new Date(log.startTime).toLocaleDateString()}</td>
                                                                    <td className="p-2 text-gray-400 font-mono">{new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                                    <td className="p-2 text-right font-bold text-gray-700">
                                                                        {Math.floor(log.durationSeconds / 3600)}h {Math.floor((log.durationSeconds % 3600) / 60)}m
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="p-4 text-center text-xs text-gray-400 italic">No time recorded yet.</div>
                                            )}
                                        </div>
                                    </div>}

                                    {/* DOCUMENT LINKS */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Documents</label>
                                            <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => setShowDocPicker({ type: 'task', id: selectedTaskForEdit.task.id })}>+ Link Doc</button>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <LinkedDocsList key={refreshKey} opportunityId={opportunity.id} revision={localOpp.revision} taskId={selectedTaskForEdit.task.id} onNavigateToFile={navigateToFile} />
                                            {renderLinkedEmailsForTarget({ type: 'task', id: selectedTaskForEdit.task.id })}
                                        </div>
                                    </div>

                                    {/* NOTE LINKS */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Notes</label>
                                            <button
                                                className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline"
                                                onClick={() => setShowNotePickerForTask(selectedTaskForEdit.task.id)}
                                            >
                                                + Link Note
                                            </button>
                                        </div>

                                        {showNotePickerForTask === selectedTaskForEdit.task.id && (
                                            <div className="relative z-10 p-4 bg-white border border-gray-200 shadow-lg rounded-xl mb-4 animate-fade-in">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h5 className="font-bold text-sm">Select Notes</h5>
                                                    <button onClick={() => setShowNotePickerForTask(null)}><X className="w-4 h-4 text-gray-400" /></button>
                                                </div>
                                                <input
                                                    className="w-full text-xs border-gray-200 rounded-lg mb-2"
                                                    placeholder="Search notes..."
                                                    value={noteSearch}
                                                    onChange={(e) => setNoteSearch(e.target.value)}
                                                />
                                                <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
                                                    {localOpp.notes.filter(n => n.title.toLowerCase().includes(noteSearch.toLowerCase())).map(n => (
                                                        <label key={n.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedNotesToLink.includes(n.id)}
                                                                onChange={() => {
                                                                    if (selectedNotesToLink.includes(n.id)) setSelectedNotesToLink(prev => prev.filter(id => id !== n.id));
                                                                    else setSelectedNotesToLink(prev => [...prev, n.id]);
                                                                }}
                                                                className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300"
                                                            />
                                                            <span className="text-xs truncate">{n.title}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={() => linkNotesToTask(selectedTaskForEdit.task.id, selectedNotesToLink)}
                                                    className="w-full bg-[#3DCD58] text-white text-xs font-bold py-2 rounded-lg"
                                                >
                                                    Link Selected
                                                </button>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {(selectedTaskForEdit.task.linkedNoteIds || [selectedTaskForEdit.task.linkedNoteId]).filter(Boolean).map((nid) => {
                                                const note = localOpp.notes.find(n => n.id === nid);
                                                if (!note) return null;
                                                return (
                                                    <div key={nid} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-[#3DCD58] transition-all bg-white group">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="w-4 h-4 text-gray-400 group-hover:text-[#3DCD58]" />
                                                            <span className="text-sm font-medium">{note.title}</span>
                                                        </div>
                                    <div className="flex max-w-full flex-wrap items-center justify-end gap-3">
                                        {selectedTaskForEdit.task.status === 'Approval' && <button onClick={() => approveTask(selectedTaskForEdit.task.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" /> Approve</button>}
                                        {selectedTaskForEdit.task.status === 'Done' && selectedTaskForEdit.task.reworkForTaskId && !selectedTaskForEdit.task.sentBackForApprovalAt && <button onClick={() => sendCorrectionBackForApproval(selectedTaskForEdit.task.id)} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-black text-white hover:bg-purple-700"><GitPullRequest className="mr-1 inline h-3.5 w-3.5" /> Send Back for Approval</button>}
                                        <button
                                                                onClick={() => { setSelectedTaskForEdit(null); setActiveTabSafe('notes'); setSelectedNoteIdSafe(note.id); }}
                                                                className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded"
                                                            >
                                                                Open Note
                                                            </button>
                                                            <button
                                                                onClick={() => setSplitViewNoteId(note.id)}
                                                                className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded flex items-center gap-1"
                                                            >
                                                                <Columns className="w-3 h-3" /> Split View
                                                            </button>
                                                            <button
                                                                onClick={() => unlinkNoteFromTask(selectedTaskForEdit.task.id, note.id)}
                                                                className="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase px-2 py-1 bg-gray-50 rounded"
                                                                title="Unlink"
                                                            >
                                                                <Unlink className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {!selectedTaskForEdit.task.linkedNoteIds?.length && !selectedTaskForEdit.task.linkedNoteId && (
                                                <div className="text-center py-4 text-gray-300 text-xs italic">No notes linked</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t flex justify-between gap-4">
                                        <button onClick={deleteTaskInModal} className="px-6 py-3 rounded-2xl text-sm font-black uppercase text-red-500 hover:bg-red-50 transition-all border border-red-100">Delete Task</button>
                                        {!splitViewNoteId && <button onClick={() => setSelectedTaskForEdit(null)} className="flex-1 bg-gray-900 text-white px-6 py-3 rounded-2xl text-sm font-black uppercase shadow-xl hover:shadow-gray-900/20 active:scale-95 transition-all">Close & Save</button>}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column (Split View Note Editor) */}
                            {splitViewNoteId && (
                                <div className="flex flex-col h-full border-l border-gray-100 pl-8 overflow-hidden">
                                    <div className="flex justify-between items-center mb-4 shrink-0">
                                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-[#3DCD58]" />
                                            {localOpp.notes.find(n => n.id === splitViewNoteId)?.title}
                                        </h3>
                                        <button
                                            onClick={() => setSplitViewNoteId(null)}
                                            className="text-xs font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            Close Split View
                                        </button>
                                    </div>
                                    <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
                                        {localOpp.notes.find(n => n.id === splitViewNoteId)?.format === 'sow' ? (
                                            <SowFormEmbed
                                                key={splitViewNoteId}
                                                content={localOpp.notes.find(n => n.id === splitViewNoteId)?.content || ''}
                                                people={localOpp.stakeholders || []}
                                                directoryPeople={selectableGlobalContacts.map(contact => ({ id: contact.id, name: contact.name, email: contact.email, roles: contact.availableRoles, aliases: contact.aliases }))}
                                                areas={trackedAreas}
                                                prefill={sowPrefill}
                                                globalForm={globalSowForm}
                                                scopeCatalog={scopeCatalog}
                                                onGlobalFormChange={onGlobalSowFormChange}
                                                onOpportunitySync={syncSowOpportunityFields}
                                                onGeneratedNote={addGeneratedSowNote}
                                                onQuickLinkRequest={addSowLinkToOverview}
                                                tasks={localOpp.tasks}
                                                onTaskOpen={openSowTask}
                                                onTaskConvert={convertSowTaskToAssignment}
                                                onTaskRaciUpdate={updateSowTaskRaci}
                                                onTaskCreate={createSowTask}
                                                onStakeholderCreate={createSowStakeholder}
                                                backupKey={sowBackupKey(localOpp.id, splitViewNoteId)}
                                                legacyBackupKey={sowNote?.id === splitViewNoteId ? legacySowBackupKey(localOpp.id) : undefined}
                                                disabled={isSnapshot}
                                                onChange={(json: string) => saveSowContent(splitViewNoteId, json)}
                                            />
                                        ) : (
                                            <RichTextEditor
                                                key={splitViewNoteId}
                                                content={localOpp.notes.find(n => n.id === splitViewNoteId)?.content || ''}
                                                onChange={(val) => updateNoteById(splitViewNoteId, 'content', val)}
                                                onAttach={() => setShowDocPicker({ type: 'note', id: splitViewNoteId })}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {
                newContactModal && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setNewContactModal(null)}>
                        <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black text-gray-900">New Contact</h3>
                                    <button onClick={() => setNewContactModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Name</label>
                                        <input
                                            autoFocus
                                            value={newContactModal.name}
                                            onChange={(e) => setNewContactModal({ ...newContactModal, name: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === 'Enter') submitNewContactModal(); }}
                                            placeholder="Contact name"
                                            className="w-full text-sm border-gray-200 rounded-xl focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email <span className="normal-case font-medium text-gray-300">(optional)</span></label>
                                        <input
                                            type="email"
                                            value={newContactModal.email}
                                            onChange={(e) => setNewContactModal({ ...newContactModal, email: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === 'Enter') submitNewContactModal(); }}
                                            placeholder="name@company.com"
                                            className="w-full text-sm border-gray-200 rounded-xl focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Role / Area <span className="normal-case font-medium text-gray-300">(optional)</span></label>
                                        <input
                                            list="new-contact-area-suggestions"
                                            value={newContactModal.area}
                                            onChange={(e) => setNewContactModal({ ...newContactModal, area: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === 'Enter') submitNewContactModal(); }}
                                            placeholder="Start typing to see existing areas..."
                                            className="w-full text-sm border-gray-200 rounded-xl focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                        />
                                        <datalist id="new-contact-area-suggestions">
                                            {trackedAreas.map(a => <option key={a} value={a} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-1">
                                    <button
                                        onClick={() => setNewContactModal(null)}
                                        className="flex-1 py-2.5 px-4 rounded-2xl border border-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitNewContactModal}
                                        disabled={!newContactModal.name.trim()}
                                        className="flex-[1.5] py-2.5 px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-lg bg-[#3DCD58] hover:bg-[#34b34c] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    >
                                        Create & Involve
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                completionPrompt && (
                    <CompletionDateModal
                        taskTitle={completionPrompt.taskTitle}
                        dueDate={completionPrompt.dueDate}
                        onCancel={() => setCompletionPrompt(null)}
                        onConfirm={(date) => {
                            const { onPick } = completionPrompt;
                            setCompletionPrompt(null);
                            onPick(date);
                        }}
                    />
                )
            }

            {
                changeRevisionTaskId && (
                    <ChangeRevisionModal
                        opportunityId={opportunity.id}
                        opportunityRevision={localOpp.revision}
                        sourceTaskTitle={localOpp.tasks.find(task => task.id === changeRevisionTaskId)?.title || 'Approval task'}
                        stakeholders={localOpp.stakeholders || []}
                        initialPath={currentFolderPath}
                        busy={creatingChangeRevision}
                        onClose={() => !creatingChangeRevision && setChangeRevisionTaskId(null)}
                        onSubmit={createApprovalChangeRevision}
                    />
                )
            }

            {
                showDocPicker && (
                    <DocumentPickerModal
                        opportunityId={opportunity.id}
                        revision={localOpp.revision}
                        multi={true}
                        onSelect={handleDocSelect}
                        onClose={() => setShowDocPicker(null)}
                        title={`Link documents to ${showDocPicker.type}`}
                        initialPath={currentFolderPath}
                    />
                )
            }

            {
                showQuickRefFilePicker && (
                    <DocumentPickerModal
                        opportunityId={opportunity.id}
                        revision={localOpp.revision}
                        multi={true}
                        onSelect={handleAddFileQuickRef}
                        onClose={() => setShowQuickRefFilePicker(false)}
                        title="Pick file(s) for Quick References"
                    />
                )
            }

            {
                scopeModalOpen && (
                    <ScopeQuickViewModal
                        sowNote={sowNote}
                        catalog={scopeCatalog}
                        legacyLabels={localOpp.labels || []}
                        disabled={isSnapshot}
                        onSaveFields={saveScopeFields}
                        onCreateSowNote={addSowNote}
                        onClose={() => setScopeModalOpen(false)}
                    />
                )
            }

            {emailIntegrationEnabled && showEmailLinkPicker && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[75vh] flex flex-col overflow-hidden animate-slide-in-right">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <Mail className="w-5 h-5 text-[#3DCD58]" /> Link Email
                            </h3>
                            <button onClick={() => setShowEmailLinkPicker(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {showEmailLinkPicker.mode === 'target' && emailConversations.map(conv => (
                                <button
                                    key={conv.id}
                                    onClick={() => linkEmailConversationToTarget(conv.id, { type: showEmailLinkPicker.targetType, id: showEmailLinkPicker.targetId })}
                                    className="w-full text-left p-3 border border-gray-100 rounded-xl hover:border-[#3DCD58] hover:bg-emerald-50/40 transition-colors"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-black text-gray-800 truncate">{conv.subject}</span>
                                        <span className="text-[10px] text-gray-400 font-bold shrink-0">{conv.messages.length} messages</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{conv.summary || conv.messages[0]?.bodyPreview || ''}</p>
                                </button>
                            ))}
                            {showEmailLinkPicker.mode === 'conversation' && showEmailLinkPicker.targetType === 'task' && localOpp.tasks.map(task => (
                                <button
                                    key={task.id}
                                    onClick={() => linkEmailConversationToTarget(showEmailLinkPicker.conversationId, { type: 'task', id: task.id })}
                                    className="w-full text-left p-3 border border-gray-100 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <CheckSquare className="w-4 h-4 text-blue-500" />
                                        <span className="text-sm font-black text-gray-800 truncate">{task.title}</span>
                                    </div>
                                </button>
                            ))}
                            {showEmailLinkPicker.mode === 'conversation' && showEmailLinkPicker.targetType === 'note' && localOpp.notes.map(note => (
                                <button
                                    key={note.id}
                                    onClick={() => linkEmailConversationToTarget(showEmailLinkPicker.conversationId, { type: 'note', id: note.id })}
                                    className="w-full text-left p-3 border border-gray-100 rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-emerald-500" />
                                        <span className="text-sm font-black text-gray-800 truncate">{note.title}</span>
                                    </div>
                                </button>
                            ))}
                            {showEmailLinkPicker.mode === 'target' && emailConversations.length === 0 && (
                                <div className="py-12 text-center text-gray-400">
                                    <Mail className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    <p className="text-xs font-bold">No email conversations available.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {emailIntegrationEnabled && showOutlookSelector && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-slide-in-right">
                        <div className="flex items-start justify-between gap-4 mb-5">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                    <Mail className="w-5 h-5 text-[#3DCD58]" /> Outlook Selector
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">Connector UI is ready. Microsoft 365 permissions are required to read mailbox folders.</p>
                            </div>
                            <button onClick={() => setShowOutlookSelector(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-5">
                            <p className="text-xs text-gray-600 font-medium">
                                When Graph access is available, this selector will list Outlook conversations by folder and add the selected thread here.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowOutlookSelector(false)} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Close</button>
                            <button onClick={() => { setShowOutlookSelector(false); addLocalEmailConversation(); }} className="px-4 py-2 text-xs font-black text-white bg-[#3DCD58] hover:bg-[#2db64a] rounded-lg">Add Conversation</button>
                        </div>
                    </div>
                </div>
            )}

            {
                addLinkRefForm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-in-right">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <LinkIcon className="w-5 h-5 text-[#3DCD58]" /> Add Quick Link
                            </h3>
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Name</label>
                                    <input
                                        autoFocus
                                        value={addLinkRefForm.name}
                                        onChange={(e) => setAddLinkRefForm({ ...addLinkRefForm, name: e.target.value })}
                                        placeholder="e.g. Cliente BFO"
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">URL</label>
                                    <input
                                        value={addLinkRefForm.url}
                                        onChange={(e) => setAddLinkRefForm({ ...addLinkRefForm, url: e.target.value })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLinkQuickRef(); }}
                                        placeholder="https://..."
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58] font-mono"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => setAddLinkRefForm(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium text-sm">Cancel</button>
                                <button
                                    onClick={handleSaveLinkQuickRef}
                                    className="px-4 py-2 bg-[#3DCD58] text-white rounded-lg font-bold text-sm shadow-lg hover:bg-[#2db64a]"
                                >
                                    Save Link
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                expectedDateChange && (
                    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                            <h3 className="text-lg font-black text-gray-900">Change expected date</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                From <span className="font-bold text-gray-700">{expectedDateChange.previous || 'Not set'}</span> to <span className="font-bold text-gray-700">{expectedDateChange.next || 'Not set'}</span>
                            </p>
                            <p className="mt-5 text-xs font-black uppercase tracking-widest text-gray-400">Why is the date being changed?</p>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setExpectedDateChange(current => current ? { ...current, kind: 'correction', reason: '' } : current)}
                                    className={`rounded-xl border p-3 text-left transition-colors ${expectedDateChange.kind === 'correction' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                                >
                                    <span className="block text-sm font-black">Data correction</span>
                                    <span className="mt-1 block text-[11px]">The previous date was entered by mistake. No History event will be created.</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setExpectedDateChange(current => current ? { ...current, kind: 'schedule' } : current)}
                                    className={`rounded-xl border p-3 text-left transition-colors ${expectedDateChange.kind === 'schedule' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                                >
                                    <span className="block text-sm font-black">Schedule change</span>
                                    <span className="mt-1 block text-[11px]">The delivery changed for a business or project reason. A History event will be created.</span>
                                </button>
                            </div>
                            {expectedDateChange.kind === 'schedule' && (
                                <div className="mt-4">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Reason *</label>
                                    <textarea
                                        autoFocus
                                        value={expectedDateChange.reason}
                                        onChange={event => setExpectedDateChange(current => current ? { ...current, reason: event.target.value } : current)}
                                        placeholder="Explain why the expected delivery date changed..."
                                        className="mt-1 min-h-24 w-full resize-y rounded-xl border-gray-200 text-sm focus:border-[#3DCD58] focus:ring-[#3DCD58]"
                                    />
                                </div>
                            )}
                            <div className="mt-5 flex justify-end gap-2">
                                <button type="button" onClick={() => setExpectedDateChange(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100">Cancel</button>
                                <button
                                    type="button"
                                    onClick={confirmExpectedDateChange}
                                    disabled={!expectedDateChange.kind || (expectedDateChange.kind === 'schedule' && !expectedDateChange.reason.trim())}
                                    className="rounded-lg bg-[#3DCD58] px-4 py-2 text-sm font-bold text-white hover:bg-[#2db64a] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Save date
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showAddAreaModal && (
                    <AddAreaModal
                        availableAreas={(trackedAreas || []).filter(ta => !((localOpp.kpis?.areasInvolved || []).some(a => a.area === ta)))}
                        onAdd={(areaName) => {
                            addKpiArea(areaName);
                            setShowAddAreaModal(false);
                        }}
                        onClose={() => setShowAddAreaModal(false)}
                    />
                )
            }

            {
                showCreateVersionModal && (
                    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                            <h3 className="text-lg font-bold mb-4">
                                {versionToRestore ? `Save work & Restore Snapshot` : `Create New Revision Snapshot`}
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                                        {versionToRestore ? 'Commit message for current work *' : `What did ${localOpp.revision || 'the current revision'} represent? *`}
                                    </label>
                                    <input className="w-full border-gray-200 rounded-lg text-sm" autoFocus placeholder={versionToRestore ? "e.g. Work before restoring V2" : "e.g. Initial Estimation"} value={newVersionData.commitMessage} onChange={e => setNewVersionData({ ...newVersionData, commitMessage: e.target.value })} />
                                </div>
                                {!versionToRestore && (
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                                            Why is the new revision being created? *
                                        </label>
                                        <textarea
                                            className="w-full border-gray-200 rounded-lg text-sm min-h-[72px] resize-y"
                                            placeholder="e.g. The customer requested scope changes"
                                            value={newVersionData.revisionReason}
                                            onChange={e => setNewVersionData({ ...newVersionData, revisionReason: e.target.value })}
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">SR / Branch (Optional)</label>
                                    <input className="w-full border-gray-200 rounded-lg text-sm font-mono" placeholder={localOpp.srId || "SR-1"} value={newVersionData.srId} onChange={e => setNewVersionData({ ...newVersionData, srId: e.target.value })} />
                                    <p className="text-[10px] text-gray-400 mt-1">Leave empty to use current SR: {localOpp.srId}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Tags (comma separated)</label>
                                    <input className="w-full border-gray-200 rounded-lg text-sm" placeholder="e.g. Draft, Client Review" value={newVersionData.tags} onChange={e => setNewVersionData({ ...newVersionData, tags: e.target.value })} />
                                </div>
                                {!versionToRestore && taskStandards.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Task list *</label>
                                        {selectableStandards.length === 1 ? (
                                            <div className="w-full border border-gray-200 bg-gray-50 rounded-lg text-sm px-3 py-2">
                                                {selectableStandards[0].name} ({selectableStandards[0].tasks.length} tasks)
                                            </div>
                                        ) : (
                                            <select
                                                value={revisionTaskStandardId}
                                                onChange={e => setRevisionTaskStandardId(e.target.value)}
                                                className="w-full border-gray-200 rounded-lg text-sm"
                                            >
                                                <option value="">Select…</option>
                                                {(showHiddenRevisionStandards ? taskStandards : selectableStandards).map(standard => (
                                                    <option key={standard.id} value={standard.id}>{standard.name} ({standard.tasks.length} tasks){standard.hidden ? ' — hidden' : ''}</option>
                                                ))}
                                            </select>
                                        )}
                                        {hasHiddenStandards && selectableStandards.length !== 1 && (
                                            <label className="flex items-center gap-2 mt-2 text-[11px] text-gray-500 cursor-pointer select-none w-fit">
                                                <input
                                                    type="checkbox"
                                                    checked={showHiddenRevisionStandards}
                                                    onChange={e => {
                                                        setShowHiddenRevisionStandards(e.target.checked);
                                                        if (!e.target.checked && !selectableStandards.some(standard => standard.id === revisionTaskStandardId)) {
                                                            setRevisionTaskStandardId('');
                                                        }
                                                    }}
                                                    className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                                />
                                                Show hidden lists
                                            </label>
                                        )}
                                    </div>
                                )}
                                <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700">
                                    <strong>Normalization:</strong> Status will be reset to In Progress. Tasks will be pending. History is preserved.
                                </div>
                                <div className="flex gap-2 justify-end mt-2">
                                    <button onClick={() => { setShowCreateVersionModal(false); setVersionToRestore(null); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600">Cancel</button>
                                    <button onClick={handleCreateVersion} disabled={!newVersionData.commitMessage.trim() || (!versionToRestore && !newVersionData.revisionReason.trim()) || (!versionToRestore && taskStandards.length > 0 && selectableStandards.length !== 1 && !revisionTaskStandardId)} className="px-4 py-2 bg-[#3DCD58] hover:bg-green-600 rounded-lg text-sm font-bold text-white disabled:opacity-50">
                                        {versionToRestore ? `Confirm Restore` : `Create Revision`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showCopyTasksModal && (
                    <CopyTasksModal
                        isOpen={showCopyTasksModal}
                        onClose={() => setShowCopyTasksModal(false)}
                        sourceOpp={localOpp}
                        opportunities={opportunities || []}
                        onCopy={handleCopyTasks}
                    />
                )
            }
            {
                emailComposeState.open && (
                    <EmailComposeModal
                        isOpen={emailComposeState.open}
                        onClose={() => setEmailComposeState({ open: false })}
                        opportunity={localOpp}
                        emailSettings={mergedEmailComposeSettings}
                        userName={userName}
                        globalContacts={globalContacts}
                        initialTemplateId={emailComposeState.templateId}
                        initialTaskIds={emailComposeState.taskIds}
                        onGenerated={handleEmailGenerated}
                        onRequestAssignTask={(taskId) => {
                            const task = localOpp.tasks.find(t => t.id === taskId);
                            if (task) { setEmailComposeState({ open: false }); setSelectedTaskForEdit({ task }); }
                        }}
                        sowTeamMembers={sowTeamMembers}
                        onAssignTask={(taskId, ids) => applyTaskFieldsDirect(taskId, {
                            isAssignment: true,
                            responsibleTeamMemberIds: ids,
                            responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                            owner: ids.length > 0 ? 'External Area' : 'Me',
                            externalAreas: mergeAreasForMembers(localOpp.tasks.find(t => t.id === taskId), ids),
                            status: 'Missing Info',
                        })}
                        onCreateMeetingTask={({ title, description, teamMemberIds }) => {
                            const id = crypto.randomUUID();
                            const members = teamMemberIds.map(memberId => sowTeamMembers.find(member => member.id === memberId)).filter((member): member is SowTeamMember => !!member);
                            const nextOrder = Math.max(0, ...(localOpp.tasks || []).map(task => task.order || 0)) + 1;
                            const task: Task = {
                                id, title, description, status: 'Pending', priority: 'Medium',
                                owner: members.length ? 'External Area' : 'Me',
                                responsible: members.map(member => member.name).join(', '),
                                responsibleTeamMemberIds: teamMemberIds,
                                externalAreas: Array.from(new Set(members.map(member => member.area).filter(Boolean))),
                                dueDate: '', stageContext: localOpp.stage, subtasks: [], linkedNoteIds: [],
                                order: nextOrder, dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false,
                            };
                            const updated = { ...localOpp, tasks: [...(localOpp.tasks || []), task], lastUpdated: new Date().toISOString() };
                            setLocalOpp(updated); syncToParentNow(updated);
                            return id;
                        }}
                    />
                )
            }
            {
                showSrImport && (
                    <ImportSrEmailModal
                        isOpen={showSrImport}
                        onClose={() => setShowSrImport(false)}
                        currentOppId={localOpp.id}
                        existingOpps={(opportunities || []).map(o => ({ id: o.id, title: o.title, srId: o.srId }))}
                        currentRequestedDate={localOpp.dates.requested || getTodayStr()}
                        taskStandards={taskStandards.map(standard => ({ id: standard.id, name: standard.name, taskCount: standard.tasks.length }))}
                        onApply={applySrPrefill}
                    />
                )
            }
            {
                showRevisionCarryoverModal && revisionCarryoverSource && (
                    <RevisionCarryoverModal
                        isOpen={showRevisionCarryoverModal}
                        onClose={() => {
                            const targetOppId = revisionCarryoverSource.targetOppId;
                            const shouldDeleteCurrent = revisionCarryoverSource.deleteCurrentOppAfterClose;
                            setShowRevisionCarryoverModal(false);
                            setRevisionCarryoverSource(null);
                            if (shouldDeleteCurrent && targetOppId) {
                                onDelete();
                                onSelectOpp?.(targetOppId);
                            }
                        }}
                        sourceLabel={revisionCarryoverSource.sourceLabel}
                        notes={revisionCarryoverSource.notes}
                        defaultLinks={revisionCarryoverSource.defaultLinks}
                        customLinks={revisionCarryoverSource.customLinks}
                        onApply={handleApplyRevisionCarryover}
                    />
                )
            }
            {
                showDiffModal && (
                    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                            <div className="p-4 border-b flex justify-between items-center">
                                <h3 className="font-bold">Revision Comparison</h3>
                                <button onClick={() => setShowDiffModal(false)}><X className="w-5 h-5" /></button>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1">
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="p-2 bg-red-50 rounded border border-red-100">
                                        <h4 className="font-bold text-red-800 text-xs uppercase mb-1">Base (Live)</h4>
                                        <p className="text-xs">Current State</p>
                                    </div>
                                    <div className="p-2 bg-green-50 rounded border border-green-100">
                                        <h4 className="font-bold text-green-800 text-xs uppercase mb-1">Compare (Revision)</h4>
                                        <p className="text-xs">
                                            {(localOpp.versions || []).find(v => v.id === diffCompareId)?.commitMessage || diffCompareId}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="font-bold text-sm border-b pb-1">Changes Summary</h4>
                                    <div className="text-sm space-y-2">
                                        {/* Inline Logic for Diff */}
                                        {(() => {
                                            const v = (localOpp.versions || []).find(v => v.id === diffCompareId);
                                            if (!v) return <p>Version not found.</p>;

                                            const tasksDiff = Math.abs(localOpp.tasks.length - v.snapshot.tasks.length);
                                            const notesDiff = Math.abs(localOpp.notes.length - v.snapshot.notes.length);
                                            const kpiChanged = JSON.stringify(localOpp.kpis) !== JSON.stringify(v.snapshot.kpis);

                                            return (
                                                <div>
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span>Tasks Count Difference</span>
                                                        <span className="font-mono font-bold">{tasksDiff}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span>Notes Count Difference</span>
                                                        <span className="font-mono font-bold">{notesDiff}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span>KPIs Changed?</span>
                                                        <span className={`font-bold ${kpiChanged ? 'text-orange-500' : 'text-gray-400'}`}>{kpiChanged ? 'YES' : 'NO'}</span>
                                                    </div>
                                                    <div className="p-2 bg-yellow-50 text-xs text-yellow-700 mt-2">
                                                        * Detailed field-by-field diff is limited in this surgical view.
                                                        <br />Restore specific sections using the sidebar actions.
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
                                <button onClick={() => setShowDiffModal(false)} className="w-full bg-gray-200 text-gray-700 font-bold py-2 rounded-lg">Close</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {showAddSectionModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in shadow-2xl">
                    <div className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 animate-slide-up">
                        <div className="p-8 pb-6">
                            <div className="flex justify-between items-center mb-6">
                                <div className="p-3 bg-emerald-50 rounded-2xl">
                                    <Plus className="w-6 h-6 text-[#3DCD58]" />
                                </div>
                                <button onClick={() => { setShowAddSectionModal(false); setNewSectionName(''); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-2">New Commercial Section</h3>
                            <p className="text-sm text-gray-500 font-medium">Define a custom category for the project breakdown.</p>
                            
                            <div className="mt-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Section Name</label>
                                    <input 
                                        autoFocus
                                        className="w-full text-lg font-bold border-2 border-gray-100 focus:border-[#3DCD58] rounded-2xl p-4 transition-all focus:ring-0 outline-none"
                                        placeholder="e.g., Software Licenses, HW Implementation..."
                                        value={newSectionName}
                                        onChange={(e) => setNewSectionName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newSectionName.trim()) {
                                                const current = localOpp.commercial.customSections || [];
                                                handleFieldChange('commercial', { 
                                                    ...localOpp.commercial, 
                                                    customSections: [...current, { id: crypto.randomUUID(), name: newSectionName, sellPrice: 0, margin: 0, discount: 0, cost: 0 }] 
                                                });
                                                setShowAddSectionModal(false);
                                                setNewSectionName('');
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50/50 flex gap-3 border-t border-gray-100">
                            <button 
                                onClick={() => { setShowAddSectionModal(false); setNewSectionName(''); }}
                                className="flex-1 py-4 text-xs font-black uppercase text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                disabled={!newSectionName.trim()}
                                onClick={() => {
                                    const current = localOpp.commercial.customSections || [];
                                    handleFieldChange('commercial', { 
                                        ...localOpp.commercial, 
                                        customSections: [...current, { id: crypto.randomUUID(), name: newSectionName, sellPrice: 0, margin: 0, discount: 0, cost: 0 }] 
                                    });
                                    setShowAddSectionModal(false);
                                    setNewSectionName('');
                                }}
                                className="flex-1 py-4 bg-[#3DCD58] text-white text-xs font-black uppercase rounded-2xl shadow-lg shadow-[#3DCD58]/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                            >
                                Create Section
                            </button>
                        </div>
                    </div>
                </div>
            )}
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center p-20">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3DCD58]"></div>
                        <span className="text-sm font-bold text-gray-400 animate-pulse uppercase tracking-widest">Loading project...</span>
                    </div>
                </div>
            )}
        </div>
    );
};

// Memoize carefully: we only want to SKIP if NOTHING changed. 
// Default shallow compare is better than the previous broken custom logic.
export default React.memo(OpportunityDetail);
