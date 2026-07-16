
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
/* Added Subtask to imports */
import { Opportunity, Task, Subtask, CommercialRow, TaskStatus, TASK_STATUS_COLORS, TASK_STATUS_ORDER, TaskOwner, ExternalArea, TaskPriority, PRIORITY_COLORS, HistoryEntry, PrdPresentation, STATUS_COLORS, OpportunityStatus, MeetingNote, NoteFolder, Commercial, CommercialQuickRef, QuickLinks, KPIs, KPIArea, InlineTask, DayType, AreaDayRecord, KPITimeline, DeepLink, OpportunityLabel, OpportunityVersion, QuickLinkItem, TimeLog, FloatingTab, DetailedStatus, DETAILED_STATUS_COLORS, EmailConversation, EmailGhostFolder, EmailLabel, OpportunityEmailsData, Person, GlobalContact, Reminder } from '../types';
import { ArrowLeft, ExternalLink, Save, Plus, Trash2, Copy, FileText, CheckSquare, DollarSign, ListChecks, Bold, Heading1, List as ListIcon, ListOrdered, User, Search, AlignLeft, AlignCenter, AlignRight, CheckCircle, Table, Type, Italic, Calendar as CalendarIcon, X, Clock, History as HistoryIcon, Presentation, FileDown, Briefcase, Zap, GripVertical, Maximize2, Minimize2, MessageCircle, ChevronUp, ChevronDown, Highlighter, Link, Unlink, Eraser, FolderOpen, Folder, FolderPlus, AlertCircle, Link as LinkIcon, Columns, LayoutGrid, Filter, RotateCcw, Lock, ArrowUpDown, BarChart3, Target, CalendarDays, Timer, ChevronLeft, ChevronRight, Edit3, Tag, GitBranch, GitCommit, GitPullRequest, Database, MoreHorizontal, Minus, Layout, Pin, Percent, FileSpreadsheet, Mail, Inbox, EyeOff, Eye, Check, Paperclip, Bell } from 'lucide-react';
import { SearchableSelect, DateTimePicker, SearchableOption } from './RemindersBell';
import { OpportunityFolderTab } from '../features/opportunity-folder/OpportunityFolderTab';
import { LinkedDocsList } from '../features/doc-links/LinkedDocsList';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { openInNativeApp } from '../features/opportunity-folder/fileOps';
import { SowFormEmbed } from './SowFormEmbed';
import ScopeQuickViewModal from './ScopeQuickViewModal';
import { collectSowTeamMembers, SowTeamMember } from '../services/sowTeamMembers';
import { getRootPathDisplay, copyFolderLinkToRevision, moveLegacyFolderLinkToRevision } from '../services/opportunityFolderLink';
import { saveMeta, listLinkedForNote, listLinkedForTask } from '../services/opportunityDocMetaStore';
import { CalendarView } from './CalendarView';
import { ImportSrEmailModal } from './ImportSrEmailModal';
import { RevisionCarryoverModal } from './RevisionCarryoverModal';
import { SrPrefill } from '../services/srEmailParser';
import { OpportunityExportImportButtons } from '../features/opportunity-export/OpportunityExportImportButtons';
import { NoteTemplate, SimpleMultiSelect, OPPORTUNITY_DETAIL_SECTIONS, normalizeOpportunityDetailSectionOrder, type OpportunityDetailSectionKey } from './SettingsModal';
import { countBusinessDays, countCalendarDays } from '../services/dateUtils';
import { moveAndReorderNote, moveAndReorderFolder, isFolderDescendantOf, sortWithOrderFallback } from '../services/noteUtils';
import { useTimer, useTimerActions } from '../contexts/TimerContext';
import { Play, Pause } from 'lucide-react';
import { CopyTasksModal } from './CopyTasksModal';
import { getNextTask, compareTasksGlobal, reorderTaskStrict, syncAssignmentSubtasks } from '../services/taskUtils';
import { OptimizedInput, OptimizedTextArea, DebouncedInput } from './OptimizedInput';
import { ExecutionScheduleSection } from '../features/schedule/ExecutionScheduleSection';
import { EmailComposeModal } from './EmailComposeModal';
import { mergeEmailComposeSettings, type EmailComposeSettings } from '../services/emailTemplates';
import { sanitizeHtml } from '../services/sanitizeHtml';
import type { GeneratedEmailRecord } from '../types';

const getTodayStr = () => new Date().toLocaleDateString('en-CA');

// Once a task is assigned to someone, it can only move through this lifecycle —
// 'Pending'/'In Progress' don't apply once responsibility has been handed off.
const ASSIGNED_TASK_STATUSES: TaskStatus[] = ['Missing Info', 'On Hold', 'Approval', 'Done', 'Canceled'];

const normalizeHistoryDate = (value?: string | null) => {
    if (!value) return getTodayStr();
    const raw = value.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? getTodayStr() : parsed.toLocaleDateString('en-CA');
};

const sortHistoryEntries = (history: HistoryEntry[]) =>
    [...history].sort((a, b) => normalizeHistoryDate(b.date).localeCompare(normalizeHistoryDate(a.date)));

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
    onUpdate: (updated: Opportunity, id?: string) => void;
    onDelete: () => void;
    onSelectOpp?: (id: string, deepLink?: DeepLink) => void;
    noteTemplates?: NoteTemplate[];
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
    /** Whether the "Remind me" button shows up in the task edit panel. Off by default. */
    remindersEnabled?: boolean;
    onAddReminder?: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => void;
    /** Header fields hidden from the top of the opportunity overview. */
    hiddenOpportunityHeaderFields?: import('./SettingsModal').OpportunityHeaderFieldKey[];
    hiddenOpportunityDetailSections?: OpportunityDetailSectionKey[];
    opportunityDetailSectionOrder?: OpportunityDetailSectionKey[];
    /** Global user name inserted in bracketed form when copying History for bFO. */
    userName?: string;
    /** Email composer settings from AppSettings.emailCompose (merged with defaults internally). */
    emailComposeSettings?: Partial<EmailComposeSettings> | null;
    globalSowForm?: { sections: any[]; questions: any[] };
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

export const RichTextEditor = forwardRef<RichTextEditorHandle, { content: string, onChange: (val: string) => void, onAttach?: () => void, disabled?: boolean, mentionOptions?: Person[] }>(
    ({ content, onChange, onAttach, disabled, mentionOptions = [] }, ref) => {
        const editorRef = useRef<HTMLDivElement>(null);
        const isInternalUpdate = useRef(false);
        const plainTextPasteRef = useRef(false);

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
                    if (textBefore === '*' || textBefore === '-') {
                        e.preventDefault();
                        const del = range.cloneRange();
                        del.setStart(range.startContainer, 0);
                        del.deleteContents();
                        document.execCommand('insertUnorderedList');
                        return;
                    }
                    if (/^\d+\.$/.test(textBefore)) {
                        e.preventDefault();
                        const del = range.cloneRange();
                        del.setStart(range.startContainer, 0);
                        del.deleteContents();
                        document.execCommand('insertOrderedList');
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

        const MAX_IMAGE_BYTES = 150 * 1024;
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
            <div className={`flex flex-1 flex-col h-full min-h-0 relative border rounded-lg ${disabled ? 'bg-gray-50 border-gray-100' : 'border-gray-200 shadow-sm'}`}>
                {!disabled && (
                    <div className="flex items-center gap-1 border-b border-gray-200 p-2 bg-gray-50 overflow-x-auto shrink-0 select-none sticky top-0 z-10">
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
                    className={`flex-1 p-6 overflow-y-auto focus:outline-none text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none min-h-0 editor-content ${disabled ? 'cursor-default' : 'bg-white cursor-text'}`}
                    contentEditable={!disabled}
                    onInput={handleInput}
                    onPaste={handlePaste}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    onMouseUp={handleMouseUp}
                    suppressContentEditableWarning={true}
                />
                <style>{`
                    .editor-content ul { list-style-type: disc; padding-left: 1.5em; }
                    .editor-content ol { list-style-type: decimal; padding-left: 1.5em; }
                    .editor-content li { padding-left: 0.25em; }
                    .editor-content a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
                    .editor-content table { border-collapse: collapse; width: 100%; margin: 1em 0; border: 1px solid #ccc; }
                    .editor-content td { border: 1px solid #ccc; padding: 8px; min-width: 50px; }
                    .editor-content h1 { font-size: 1.5em; font-weight: bold; margin-top: 0.5em; margin-bottom: 0.25em; }
                    .editor-content hr { border: none; border-top: 2px solid #e5e7eb; margin: 1.25em 0; }
                    .editor-content img { resize: both; overflow: hidden; display: inline-block; max-width: 100%; cursor: nwse-resize; }
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
            <button onClick={() => setIsOpen(!isOpen)} className={compact ? "inline-flex items-center gap-1 rounded border border-dashed border-[#3DCD58]/50 bg-[#3DCD58]/5 px-1.5 py-1 text-[10px] font-bold text-[#278a3b] hover:bg-[#3DCD58]/10" : "w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 flex justify-between items-center text-gray-600 shadow-sm hover:bg-gray-50 min-w-[140px]"}>
                <span className="truncate">{compact ? '+ Role' : (selected.length ? `${selected.length} selected` : placeholder)}</span>
                {!compact && <ChevronDown className="w-3 h-3" />}
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full right-0 w-56 mt-1 bg-white border border-gray-200 shadow-xl z-[500] max-h-64 overflow-y-auto rounded-xl p-1 animate-in fade-in slide-in-from-top-2 duration-200">
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
                </>
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
    onClose,
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
    onClose: () => void,
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
    const [isInternalAddAreaOpen, setIsInternalAddAreaOpen] = useState(false);
    const [visibleAreaIds, setVisibleAreaIds] = useState<string[]>(areas.map(a => a.id));
    const [selectionStart, setSelectionStart] = useState<{ areaId: string, date: string } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ areaId: string, date: string } | null>(null);

    const [selectedCells, setSelectedCells] = useState<string[]>([]);

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

    type AssignmentTimelineRow = {
        id: string;
        taskTitle: string;
        phase: 'Execution' | 'Approval';
        cycle: number;
        start?: string;
        committed?: string;
        end?: string;
        active: boolean;
        result: 'On time' | 'Late' | 'Overdue' | 'Open' | 'Completed';
    };

    const assignmentRows = React.useMemo<AssignmentTimelineRow[]>(() => {
        const today = getTodayStr();
        const rows: AssignmentTimelineRow[] = [];
        tasks.filter(task => task.isAssignment).forEach(task => {
            (task.assignmentCycles || []).forEach((cycle, index) => {
                if (cycle.executionRequested || cycle.executionDelivered || cycle.executionRequired) {
                    const late = !!cycle.executionDelivered && !!cycle.executionRequired && cycle.executionDelivered > cycle.executionRequired;
                    rows.push({ id: `${task.id}-cycle-${index}-execution`, taskTitle: task.title, phase: 'Execution', cycle: index + 1, start: cycle.executionRequested, committed: cycle.executionRequired, end: cycle.executionDelivered, active: false, result: late ? 'Late' : 'On time' });
                }
                if (cycle.approvalRequested || cycle.approved || cycle.approvalRequired) {
                    rows.push({ id: `${task.id}-cycle-${index}-approval`, taskTitle: task.title, phase: 'Approval', cycle: index + 1, start: cycle.approvalRequested, committed: cycle.approvalRequired, end: cycle.approved, active: false, result: 'Completed' });
                }
            });

            const cycle = (task.assignmentCycles?.length || 0) + 1;
            const executionActive = task.status === 'Missing Info' || task.status === 'On Hold';
            if (task.responsibleRequestedDate || task.responsibleDeliveredDate || task.responsibleDueDate) {
                const delivered = task.responsibleDeliveredDate;
                const committed = task.responsibleDueDate;
                const result = delivered
                    ? (committed && delivered > committed ? 'Late' : 'On time')
                    : (committed && today > committed ? 'Overdue' : 'Open');
                rows.push({ id: `${task.id}-current-execution`, taskTitle: task.title, phase: 'Execution', cycle, start: task.responsibleRequestedDate, committed, end: delivered, active: executionActive && !delivered, result });
            }
            const approvalActive = task.status === 'Approval';
            if (task.approvalRequestedDate || task.approvalDeliveredDate || task.approvalDueDate || ((task.approverTeamMemberIds?.length || 0) > 0 && approvalActive)) {
                rows.push({ id: `${task.id}-current-approval`, taskTitle: task.title, phase: 'Approval', cycle, start: task.approvalRequestedDate, committed: task.approvalDueDate, end: task.approvalDeliveredDate, active: approvalActive && !task.approvalDeliveredDate, result: task.approvalDeliveredDate ? 'Completed' : 'Open' });
            }
        });
        return rows;
    }, [tasks]);

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
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Full Calendar / Project Management View</p>
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm">
                            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors"><ChevronLeft className="w-6 h-6 text-gray-600" /></button>
                            <button
                                onClick={() => setViewDate(new Date())}
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
                    <div className="flex-1 overflow-auto">
                        <div className="min-w-max">
                            <div
                                className="grid gap-px bg-gray-200 border-b border-gray-200 shadow-xl"
                                style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(60px, 1fr))` }}
                            >
                                {/* Top-Left Corner Header */}
                                <div className="bg-gray-100 p-4 text-[11px] font-black text-gray-500 uppercase tracking-widest border-r border-b-2 border-gray-200 flex items-center justify-between sticky top-0 left-0 z-[50]">
                                    Area Name
                                    <Filter className="w-3 h-3" />
                                </div>
                                {days.map(d => {
                                    const isHoliday = holidays.includes(d);
                                    const [y, m, day] = d.split('-').map(Number);
                                    const date = new Date(y, m - 1, day);
                                    const dayOfWeek = date.getDay();
                                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                    return (
                                        <div key={d} className={`p-2 text-center border-l border-b-2 border-gray-200 transition-colors sticky top-0 z-[30] shadow-sm ${isWeekend || isHoliday ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                                            <div className="text-[10px] font-black uppercase">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                                            <div className="text-sm font-black">{day}</div>
                                        </div>
                                    );
                                })}

                                {/* History Indicators Row Label */}
                                <div className="p-4 text-[10px] font-black text-[#3DCD58] uppercase flex items-center gap-2 border-r border-t bg-white sticky left-0 z-[30]">
                                    <HistoryIcon className="w-4 h-4" /> Events & Milestones
                                </div>
                                {days.map(d => {
                                    const dayHistory = history.filter(h => normalizeHistoryDate(h.date) === normalizeHistoryDate(d));
                                    const isReceived = timeline.receivedAt === d;
                                    const isDelivered = timeline.deliveredAt === d;

                                    return (
                                        <div
                                            key={d}
                                            onClick={() => setViewingHistoryDate(d)}
                                            className="bg-white border-l border-t flex flex-col items-center justify-center min-h-[56px] cursor-pointer hover:bg-[#3DCD58]/5 group transition-all p-1"
                                            title={isReceived ? `Received: ${new Date(d).toLocaleDateString()}` : isDelivered ? `Delivered: ${new Date(d).toLocaleDateString()}` : "Click to manage history events"}
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

                                                {/* History Dots */}
                                                {dayHistory.length > 0 ? (
                                                    <div className="flex gap-1">
                                                        {dayHistory.map((h, i) => (
                                                            <div key={i} title={h.content} className="w-2.5 h-2.5 rounded-full bg-[#3DCD58] shadow-sm transform group-hover:scale-125 transition-transform" />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    (!isReceived && !isDelivered) && <Plus className="w-3 h-3 text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Assignment cycles: dates are generated from task state changes. */}
                                {assignmentRows.map(row => (
                                    <React.Fragment key={row.id}>
                                        <div className="bg-slate-50 p-3 border-r border-t sticky left-0 z-[30] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-xs font-black text-gray-800" title={row.taskTitle}>{row.taskTitle}</span>
                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${row.result === 'Late' || row.result === 'Overdue' ? 'bg-red-100 text-red-700' : row.result === 'On time' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{row.result}</span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-gray-400">
                                                <span className={row.phase === 'Execution' ? 'text-blue-600' : 'text-purple-600'}>{row.phase}</span>
                                                <span>Cycle {row.cycle}</span>
                                                {row.active && <span className="text-orange-600">Active</span>}
                                            </div>
                                        </div>
                                        {days.map(d => {
                                            const effectiveEnd = row.end || (row.active ? getTodayStr() : row.start);
                                            const inRange = !!row.start && !!effectiveEnd && d >= row.start && d <= effectiveEnd;
                                            const isStart = row.start === d;
                                            const isCommitted = row.committed === d;
                                            const isEnd = row.end === d;
                                            return (
                                                <div key={d} className={`relative min-h-[64px] border-l border-t flex items-center justify-center ${inRange ? (row.phase === 'Execution' ? 'bg-blue-100/70' : 'bg-purple-100/70') : 'bg-white'}`} title={`${row.taskTitle} · ${row.phase}${isCommitted ? ` · Committed ${d}` : ''}`}>
                                                    {inRange && <div className={`absolute left-0 right-0 h-2 ${row.phase === 'Execution' ? 'bg-blue-400' : 'bg-purple-400'}`} />}
                                                    <div className="relative z-10 flex flex-col items-center gap-1">
                                                        {isStart && <span className="rounded bg-gray-800 px-1 py-0.5 text-[7px] font-black text-white">START</span>}
                                                        {isCommitted && <span className={`rounded px-1 py-0.5 text-[7px] font-black text-white ${row.result === 'Late' || row.result === 'Overdue' ? 'bg-red-500' : 'bg-orange-500'}`}>CMT</span>}
                                                        {isEnd && <span className="rounded bg-emerald-600 px-1 py-0.5 text-[7px] font-black text-white">{row.phase === 'Approval' ? 'APR' : 'DEL'}</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}

                                {/* Area Rows */}
                                {areas.filter(a => visibleAreaIds.includes(a.id)).map(area => (
                                    <React.Fragment key={area.id}>
                                        <div className="bg-white p-4 text-sm font-black text-gray-700 border-r border-t flex flex-col justify-center sticky left-0 z-[30] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center justify-between group">
                                                <span className="truncate pr-2">{area.area}</span>
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
                                        </div>
                                        {days.map(d => {
                                            const record = (area.calendar?.[d]) as AreaDayRecord | undefined;
                                            const cellId = `${area.id}|${d}`;
                                            const isSelected = selectedCells.includes(cellId);

                                            return (
                                                <div
                                                    key={d}
                                                    className={`border-l border-t h-20 flex flex-col items-center justify-center transition-all cursor-pointer hover:scale-[1.02] hover:z-10 hover:shadow-inner ${isSelected ? 'ring-4 ring-[#3DCD58] ring-inset z-20' : ''} ${record?.type === 'Worked' ? 'bg-blue-50/40' :
                                                        record?.type === 'Waiting' ? 'bg-yellow-50/40' :
                                                            record?.type === 'Inactive' ? 'bg-red-50/30' :
                                                                'bg-white'
                                                        }`}
                                                    onClick={(e) => handleCellClick(area.id, d, e)}
                                                >
                                                    {record?.type === 'Worked' && (
                                                        <div className="flex flex-col items-center gap-1 animate-in fade-in zoom-in duration-300">
                                                            <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md">
                                                                <Zap className="w-4 h-4" />
                                                            </div>
                                                            {area.area === 'Tendering' && (
                                                                <div className="flex items-center gap-1 mt-1 px-1 bg-blue-50/50 rounded-lg border border-blue-100/50" onClick={(e) => e.stopPropagation()}>
                                                                    <div className="flex items-center gap-0.5">
                                                                        <input
                                                                            type="number"
                                                                            className="w-6 text-[10px] text-center border-none bg-transparent focus:ring-0 font-black p-0 h-4 text-blue-700"
                                                                            placeholder="0"
                                                                            value={(record as AreaDayRecord).hours || ''}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value) || 0;
                                                                                const newCal = { ...(area.calendar || {}) };
                                                                                newCal[d] = { ...newCal[d], hours: val, type: 'Worked' };
                                                                                onSaveAreaCalendar(area.id, newCal);
                                                                            }}
                                                                        />
                                                                        <span className="text-[8px] font-black text-blue-400 uppercase">h</span>
                                                                    </div>
                                                                    <div className="w-[1px] h-3 bg-blue-200/50 mx-0.5" />
                                                                    <div className="flex items-center gap-0.5">
                                                                        <input
                                                                            type="number"
                                                                            className="w-6 text-[10px] text-center border-none bg-transparent focus:ring-0 font-black p-0 h-4 text-blue-700"
                                                                            placeholder="0"
                                                                            value={(record as AreaDayRecord).minutes || ''}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value) || 0;
                                                                                const newCal = { ...(area.calendar || {}) };
                                                                                newCal[d] = { ...newCal[d], minutes: val, type: 'Worked' };
                                                                                onSaveAreaCalendar(area.id, newCal);
                                                                            }}
                                                                        />
                                                                        <span className="text-[8px] font-black text-blue-400 uppercase">m</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {record?.type === 'Waiting' && (
                                                        <div className="w-7 h-7 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-md animate-in fade-in zoom-in duration-300">
                                                            <Clock className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                    {record?.type === 'Inactive' && (
                                                        <div className="w-7 h-7 rounded-full bg-red-100 text-red-500 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                                            <X className="w-4 h-4" />
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
                            <p className="text-[10px] font-black text-gray-400 bg-white px-4 py-2 rounded-xl border border-gray-200 italic shadow-sm">
                                Tip: Continuous work blocks create the project execution flow.
                            </p>
                            <button onClick={onClose} className="bg-gray-900 text-white px-10 py-3.5 rounded-2xl font-black shadow-2xl hover:bg-black transition-all active:scale-95 text-lg">Close Dashboard</button>
                        </div>
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
        'No Status': 'No Status',
        'Waiting': 'Waiting',
        'Info Needed': 'Info Needed',
        'Paused': 'Paused',
        'Approval': 'In Approval',
        'Meeting': 'Meeting',
        'Completed': 'Completed',
        'Canceled': 'Canceled'
    };
    return mapping[status] || status;
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
    { id: 'folder', label: 'Folder', locked: false, placeholder: 'Folder URL', aliases: ['folder', 'internalfolder', 'internal folder', 'officialfolder', 'official folder'] },
    { id: 'ba', label: 'BA', locked: false, placeholder: 'Basket / BA URL', aliases: ['ba', 'ba link', 'basket', 'basket link'] },
    { id: 'geet', label: 'GEET', locked: false, placeholder: 'GEET URL', aliases: ['geet', 'geet link'] },
] as const;

// Icon palette offered for the unlocked default quick links (Folder, BA, GEET).
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

const isOpportunityDetailTabVisible = (tab: OpportunityDetailTab, hiddenSections: OpportunityDetailSectionKey[] = []) => {
    if (tab === 'overview') return true;
    // 'emails' used to be gated behind the paused Outlook/Graph conversation connector
    // (emailIntegrationEnabled). It's always visible now — it hosts the Outlook draft
    // composer's Generated Emails list, which doesn't depend on that connector.
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

const OpportunityDetail: React.FC<Props> = ({ opportunity, opportunities, onBack, onUpdate: parentOnUpdate, onDelete, onSelectOpp, noteTemplates = [], holidays = [], trackedAreas = [], globalContacts = [], onGlobalContactsChange, onTrackedAreasChange, deepLink = undefined, globalLabels = [], onMinimize, onCloseTab, isSubView, emailIntegrationEnabled = false, sowSectionEnabled = false, stakeholdersSectionEnabled = false, remindersEnabled = false, onAddReminder, hiddenOpportunityHeaderFields = [], hiddenOpportunityDetailSections = [], opportunityDetailSectionOrder = [], userName = 'User', emailComposeSettings = null, globalSowForm = { sections: [], questions: [] }, onGlobalSowFormChange }) => {
    const { getTimerState, confirmStop } = useTimerActions();
    const requestedTab = (deepLink?.tab || 'overview') as OpportunityDetailTab;
    const initialTab = isOpportunityDetailTabVisible(requestedTab, hiddenOpportunityDetailSections) ? requestedTab : 'overview';
    const [activeTab, setActiveTab] = useState<OpportunityDetailTab>(initialTab);
    const [isDeferring, setIsDeferring] = useState(false);
    const isTabVisible = useCallback((tab: OpportunityDetailTab) => isOpportunityDetailTabVisible(tab, hiddenOpportunityDetailSections), [hiddenOpportunityDetailSections]);
    const orderedDetailTabs = useMemo(() => normalizeOpportunityDetailSectionOrder(opportunityDetailSectionOrder).filter((tab) => isOpportunityDetailTabVisible(tab as OpportunityDetailTab, hiddenOpportunityDetailSections)) as OpportunityDetailTab[], [opportunityDetailSectionOrder, hiddenOpportunityDetailSections]);

    useEffect(() => {
        if (!isTabVisible(activeTab)) {
            setActiveTabSafe('overview');
        }
    }, [activeTab, isTabVisible]);

    const [editingAreaCalendar, setEditingAreaCalendar] = useState<string | null>(null); // Area ID
    const [showFullCalendar, setShowFullCalendar] = useState(false);
    const [showAddAreaModal, setShowAddAreaModal] = useState(false);
    const [localOpp, setLocalOpp] = useState<Opportunity>(opportunity);
    const hiddenHeaderFields = useMemo(() => new Set(hiddenOpportunityHeaderFields), [hiddenOpportunityHeaderFields]);

    const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
    const isSnapshot = !!viewingVersionId;
    const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
    const [showAddSectionModal, setShowAddSectionModal] = useState(false);
    const [scopeModalOpen, setScopeModalOpen] = useState(false);
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
                parentOnUpdate(pendingUpdateRef.current.opp, pendingUpdateRef.current.id);
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
            setActiveTabSafe(isOpportunityDetailTabVisible(nextTab, hiddenOpportunityDetailSections) ? nextTab : 'overview');
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
    const [newVersionData, setNewVersionData] = useState({ commitMessage: '', tags: '', srId: '' });
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [diffBaseId, setDiffBaseId] = useState<string | null>(null);
    const [diffCompareId, setDiffCompareId] = useState<string | null>(null);
    const [showCopyTasksModal, setShowCopyTasksModal] = useState(false);
    const [showRevisionCarryoverModal, setShowRevisionCarryoverModal] = useState(false);
    const [revisionCarryoverSource, setRevisionCarryoverSource] = useState<{
        sourceLabel: string;
        notes: MeetingNote[];
        defaultLinks: { id: string; label: string; url: string }[];
        customLinks: QuickLinkItem[];
    } | null>(null);
    const [showSrImport, setShowSrImport] = useState(false);
    const [versionSearchTerm, setVersionSearchTerm] = useState('');

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
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const noteEditorRef = useRef<RichTextEditorHandle>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
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
            const content = activeNoteHtmlRef.current;

            // Sync ONLY if content actually changed
            if (currentNote && currentNote.content !== content) {
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
        // This fixes the "empty editor" issue on old opportunities.
        if (!selectedNoteId && localOpp.notes.length > 0) {
            setSelectedNoteIdSafe(localOpp.notes[0].id);
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
    }, [selectedNoteId]); // Note: We removed localOpp.notes from dependency to prevent typing wipe-out

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
    const [taskViewMode, setTaskViewMode] = useState<'list' | 'calendar' | 'kanban'>('list');
    const [taskFilter, setTaskFilter] = useState('');
    const filterKey = `opportunityTasksFilters:${opportunity.id}`;
    const [taskStatusFilters, setTaskStatusFilters] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(filterKey);
            return saved ? JSON.parse(saved) : TASK_STATUS_ORDER;
        } catch (e) { return TASK_STATUS_ORDER; }
    });
    const [showDocPicker, setShowDocPicker] = useState<{ type: 'task' | 'note'; id: string } | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedEmailFolderId, setSelectedEmailFolderId] = useState<string>('all');
    const [selectedEmailConversationId, setSelectedEmailConversationId] = useState<string | null>(null);
    const [showEmailLinkPicker, setShowEmailLinkPicker] = useState<
        | { mode: 'target'; targetType: 'task' | 'note'; targetId: string }
        | { mode: 'conversation'; targetType: 'task' | 'note'; conversationId: string }
        | null
    >(null);
    const [showOutlookSelector, setShowOutlookSelector] = useState(false);

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
    const [showLabelMenu, setShowLabelMenu] = useState(false);
    const [versionToRestore, setVersionToRestore] = useState<OpportunityVersion | null>(null);

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

    // Move a default link up/down. Adjacency is computed over the VISIBLE list (so a hidden
    // neighbor is skipped), then the two are swapped inside the full stored order.
    const moveDefaultQuickLink = (id: string, direction: -1 | 1) => {
        if (viewingVersionId) return;
        const visibleIds = visibleDefaultLinks.map(l => l.id);
        const vIdx = visibleIds.indexOf(id);
        const neighbor = visibleIds[vIdx + direction];
        if (vIdx === -1 || neighbor === undefined) return;
        const fullOrder = orderedDefaultLinks.map(l => l.id);
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

    const toggleQuickLinkHidden = (id: DefaultQuickLinkId) => {
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
    const applySrPrefill = (prefill: SrPrefill) => {
        if (viewingVersionId) return;
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
            content: `Auto-filled from SR email${prefill.srId ? ` (${prefill.srId})` : ''}`
        };
        const requestedDate = prefill.requestedDate || localOpp.dates.requested;
        const updated: Opportunity = {
            ...localOpp,
            id: prefill.opId?.trim() || localOpp.id,
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
    };

    /** Saves the record in emails.generatedEmails AND logs a History event, in one combined update. */
    const handleEmailGenerated = (record: GeneratedEmailRecord) => {
        const names = record.toNames?.length ? record.toNames : record.to.map(e => e.split('@')[0]);
        const who = names.length >= 3 ? 'to the team'
            : names.length === 2 ? `to ${names[0]} and ${names[1]}`
            : `to ${names[0] || '—'}`;
        const assignedTaskNames = record.kind === 'task_assignment'
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
        };
        // A task is only actually "requested" from its responsible/approver once the
        // assignment email is truly sent — not the moment someone ticks "Track as
        // assignment" in the editor. So responsibleRequestedDate is stamped here, with
        // this email's send date, instead of at checkbox-toggle time.
        const relatedTaskIds = new Set(record.kind === 'task_assignment' ? (record.relatedTaskIds || []) : []);
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
        // Skip the expensive HTML strip + content scan when there's no search term.
        // On opportunities with 50+ heavy notes this was the dominant cost of the
        // Notes tab render and made tab navigation feel sticky.
        const filtered = term
            ? deferredNotes.filter(n => {
                if (n.title.toLowerCase().includes(term)) return true;
                const plainContent = n.content.replace(/<[^>]*>/g, '').toLowerCase();
                return plainContent.includes(term);
            })
            : deferredNotes;
        return [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [deferredNotes, searchTerm]);

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

    const displayValue = (val: number) => val === 0 ? '' : val;
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

    const totals = { cost: commercialTotals.cost, sellPrice: commercialTotals.sellPrice, finalPrice: commercialTotals.finalPrice };
    const totalMargin = commercialTotals.margin;

    useEffect(() => {
        let cancelled = false;
        getRootPathDisplay(localOpp.id).then(p => { if (!cancelled) setCommercialRootPath(p || ''); }).catch(() => {});
        return () => { cancelled = true; };
    }, [localOpp.id]);

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
    const addStakeholderFromDirectory = (directoryId: string) => {
        const contact = globalContacts.find(c => c.id === directoryId);
        if (!contact || (localOpp.stakeholders || []).some(p => p.directoryContactId === directoryId || (!!p.email && p.email.toLowerCase() === contact.email.toLowerCase()))) return;
        const person: Person = { id: crypto.randomUUID(), directoryContactId: contact.id, name: contact.name, email: contact.email, roles: [], roleContexts: {}, aliases: contact.aliases || [] };
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
    // Opens the native New Contact modal instead of chained window.prompt() dialogs.
    // Callers historically expected a synchronous id back, but since contact creation
    // is now async (waits for the modal), they all already discard the return value.
    const createContactAndInvolve = (suggestedName = ''): undefined => {
        setNewContactModal({ name: suggestedName, email: '', area: '' });
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
            } else {
                const person: Person = { id: crypto.randomUUID(), directoryContactId: existing.id, name: existing.name, email: existing.email, roles: role ? [role] : [], roleContexts: {}, aliases: existing.aliases || [] };
                handleFieldChange('stakeholders', [...(localOpp.stakeholders || []), person], true);
            }
            if (role && !(existing.availableRoles || []).some(r => r.toLowerCase() === role!.toLowerCase())) {
                onGlobalContactsChange?.(prev => prev.map(c => c.id === existing.id ? { ...c, availableRoles: [...(c.availableRoles || []), role!] } : c));
            }
        } else {
            const contact: GlobalContact = { id: crypto.randomUUID(), name, email, availableRoles: role ? [role] : [] };
            onGlobalContactsChange?.(prev => [...prev, contact]);
            const person: Person = { id: crypto.randomUUID(), directoryContactId: contact.id, name, email, roles: role ? [role] : [], roleContexts: {} };
            handleFieldChange('stakeholders', [...(localOpp.stakeholders || []), person], true);
        }
        setNewContactModal(null);
    };
    const createTrackedArea = () => {
        const area = (window.prompt('New tracked area / role:') || '').trim();
        if (!area) return;
        if (!trackedAreas.some(a => a.toLowerCase() === area.toLowerCase())) onTrackedAreasChange?.([...trackedAreas, area]);
    };
    const renderTeamPanelButton = () => (
        <button
            type="button"
            onClick={() => setTeamPanelOpen(true)}
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
                    <table className="w-full min-w-[920px] text-left text-xs">
                        <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-wider text-gray-400">
                            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Areas / roles</th><th className="px-3 py-2">Context</th><th className="px-3 py-2">Aliases</th><th className="w-10 px-2 py-2"></th></tr>
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
                        return (
                            <tr key={person.id} className="align-top hover:bg-gray-50/70">
                                <td className="p-2"><input value={person.name} onChange={e => updateStakeholder(person.id, 'name', e.target.value)} placeholder="Name" className="w-full rounded border-gray-200 text-xs font-bold" /></td>
                                <td className="p-2"><input value={person.email} onChange={e => updateStakeholder(person.id, 'email', e.target.value)} placeholder="Email" type="email" className="w-full rounded border-gray-200 text-xs" /></td>
                                <td className="p-2 min-w-[180px]"><div className="flex flex-wrap items-center gap-1.5">{personRoles.map(role => <span key={role} className="rounded-full bg-[#3DCD58]/10 px-2 py-1 text-[10px] font-bold text-[#278a3b]">{role}</span>)}<MultiSelect options={trackedAreas} selected={personRoles} onChange={roles => updateStakeholder(person.id, 'roles', roles)} onCreate={addNewAreaForPerson} placeholder="Select areas..." compact /></div></td>
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
    const addSowNote = () => {
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

    const sowNote = useMemo(() => (localOpp.notes || []).find(n => n.format === 'sow') ?? null, [localOpp.notes]);

    // Patches fields inside the SOW note's serialized JSON (used by the Overview
    // SCOPE quick-view modal). Also refreshes the SowFormEmbed localStorage backup
    // so a stale backup can never resurrect pre-patch values.
    const saveScopeFields = (patch: Record<string, unknown>) => {
        if (!sowNote || isSnapshot) return;
        let parsed: any = null;
        try { parsed = sowNote.content ? JSON.parse(sowNote.content) : null; } catch { parsed = null; }
        const base = parsed && typeof parsed === 'object' ? parsed : { version: 3, fields: {}, tables: {} };
        const next = { ...base, fields: { ...(base.fields || {}), ...patch }, savedAt: new Date().toISOString() };
        const serialized = JSON.stringify(next);
        try { localStorage.setItem(`tenderloop-sow-backup-${localOpp.id}`, serialized); } catch { /* non-critical backup */ }
        handleFieldChange('notes', localOpp.notes.map(n => n.id === sowNote.id ? { ...n, content: serialized } : n), true);
    };

    const deleteNote = (noteId: string) => {
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
    const [newContactModal, setNewContactModal] = useState<{ name: string; email: string; area: string } | null>(null);
    useEffect(() => { if (selectedNoteId) setTeamPanelOpen(false); }, [selectedNoteId]);

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
        const pool = globalContacts.filter(c => !already.some(p => p.directoryContactId === c.id || (!!p.email && !!c.email && p.email.toLowerCase() === c.email.toLowerCase())));
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

    const handleDropNoteOnNote = (targetNote: MeetingNote, placement: 'before' | 'after' | 'inside') => {
        const activeDraggedNoteId = draggedNoteIdRef.current || draggedNoteId;
        if (!activeDraggedNoteId || activeDraggedNoteId === targetNote.id) return;
        // A parent cannot become a child of one of its descendants.
        if (isNoteDescendantOf(targetNote.id, activeDraggedNoteId)) return;

        if (placement === 'inside') {
            const children = sortWithOrderFallback(
                localOpp.notes.filter(n => n.parentId === targetNote.id && n.id !== activeDraggedNoteId),
                (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const updated = moveAndReorderNote(localOpp.notes, activeDraggedNoteId, targetNote.folderId, targetNote.id, children.length, children.map(n => n.id));
            handleFieldChange('notes', updated, true);
            setCollapsedFolders(prev => { const next = new Set(prev); next.delete(targetNote.id); return next; });
            return;
        }

        const siblings = localOpp.notes.filter(n => n.folderId === targetNote.folderId && n.parentId === targetNote.parentId && n.id !== activeDraggedNoteId);
        const sortedSiblings = sortWithOrderFallback(siblings, (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
            content: content || 'New event...'
        };
        const updatedHistory = sortHistoryEntries([...(localOpp.history || []), newEntry]);
        console.debug("[History] state update and calling onUpdate", { entriesCount: updatedHistory.length });
        handleFieldChange('history', updatedHistory);
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

    const updateKpiArea = (id: string, field: keyof KPIArea, value: any) => {
        const newAreas = (localOpp.kpis?.areasInvolved || []).map(a => a.id === id ? { ...a, [field]: value } : a);
        updateKpiField('areasInvolved', newAreas);
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
                    if (totalHours >= 1) worked++;
                } else {
                    worked++;
                }
            } else if (r.type === 'Waiting') {
                waiting++;
            }
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
            } else if (record.type === 'Waiting') {
                waiting++;
            }
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

    const suggestWaitingDaysFromHistory = () => {
        const waitingKeywords = ['on hold', 'waiting for', 'missing information', 'pending response'];
        const suggestedDates = new Set<string>();
        (localOpp.history || []).forEach(h => {
            const content = h.content.toLowerCase();
            if (waitingKeywords.some(key => content.includes(key))) {
                suggestedDates.add(h.date.split('T')[0]);
            }
        });
        return Array.from(suggestedDates);
    };

    // Validation value for Business Days elapsed (workable time) â€” safe access for null kpis
    const totalElapsedBusinessDays = (kpisTimeline?.deliveredAt
        ? countBusinessDays(kpisTimeline.receivedAt || getTodayStr(), kpisTimeline.deliveredAt, holidays)
        : countBusinessDays(kpisTimeline?.receivedAt || getTodayStr(), getTodayStr(), holidays)) + 1;

    const totalTrackedDays = (localOpp.kpis?.execution.myWorkDays || 0) +
        (localOpp.kpis?.execution.waitingOnOthersDays || 0) +
        (localOpp.kpis?.areasInvolved || []).reduce((sum, a) => sum + (a.daysSpent || 0), 0);

    const addTask = () => {
        // Compute next order: max existing order + 1, deduplicate if needed
        const existingOrders = localOpp.tasks.map(t => t.order ?? 0).filter(n => n > 0);
        const nextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : localOpp.tasks.length + 1;
        const newTask: Task = {
            id: crypto.randomUUID(), title: 'New Task', description: '', status: 'Pending', priority: 'Medium', owner: 'Me',
            externalAreas: [], responsible: '', dueDate: '', stageContext: localOpp.stage, subtasks: [], linkedNoteIds: [],
            order: nextOrder, dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false
        };
        handleFieldChange('tasks', [...localOpp.tasks, newTask]);
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
        if (!task || !task.blockDoneUntilDependenciesDone || !task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) return true;

        const pendingDeps = localOpp.tasks.filter(t => task.dependsOnTaskIds!.includes(t.id) && t.status !== 'Done' && t.status !== 'Canceled');
        if (pendingDeps.length > 0) {
            alert("This task is blocked until its dependencies are completed.");
            return false;
        }
        return true;
    };

    const syncAssignmentKpi = (opp: Opportunity, task: Task): Opportunity => {
        const hasResponsible = (task.responsibleTeamMemberIds || []).length > 0 || !!task.responsible?.trim();
        const hasApprover = (task.approverTeamMemberIds || []).length > 0;
        if (!task.isAssignment && !hasResponsible && !hasApprover) return opp;
        const today = getTodayStr();
        const people = opp.stakeholders || [];
        const idsForPhase = task.status === 'Approval' ? (task.approverTeamMemberIds || []) : (task.responsibleTeamMemberIds || []);
        const selectedPeople = people.filter(p => idsForPhase.includes(p.id));
        const areas = Array.from(new Set([
            ...(task.externalAreas || []),
            ...selectedPeople.flatMap(p => p.roles?.length ? p.roles : (p.role ? [p.role] : []))
        ])).filter(Boolean);
        const baseKpis = opp.kpis || { languageSkill: 0, technicalUnderstanding: 0, dealProbability: 0, effortContribution: 0, sold: null, proposalAmountUSD: 0, timeline: { receivedAt: getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null }, execution: { myWorkDays: 0, waitingOnOthersDays: 0 }, areasInvolved: [] };
        let nextAreas = [...(baseKpis.areasInvolved || [])];
        areas.forEach(areaName => {
            if (!nextAreas.some(a => a.area === areaName)) nextAreas.push({ id: crypto.randomUUID(), area: areaName, daysSpent: 0, waitingDays: 0, calendar: {} });
        });
        // For an active assignment, reserve the exact time window configured on the
        // task (Requested on → committed date). Once it is delivered, actual delivery wins.
        const start = task.status === 'Approval' ? task.approvalRequestedDate : task.responsibleRequestedDate;
        const end = task.status === 'Approval'
            ? (task.approvalDeliveredDate || task.approvalDueDate || today)
            : (task.responsibleDeliveredDate || task.responsibleDueDate || task.dueDate || today);
        if (start && end) {
            const dates: string[] = [];
            for (let d = new Date(`${start}T00:00:00`), last = new Date(`${end}T00:00:00`); d <= last; d.setDate(d.getDate() + 1)) {
                const ds = d.toISOString().split('T')[0];
                if (d.getDay() !== 0 && d.getDay() !== 6 && !holidays.includes(ds)) dates.push(ds);
            }
            nextAreas = nextAreas.map(area => {
                const shouldWork = areas.includes(area.area);
                const shouldWait = area.area === 'Tendering' && !shouldWork;
                if (!shouldWork && !shouldWait) return area;
                const calendar = { ...(area.calendar || {}) };
                dates.forEach(ds => { if (!calendar[ds]) calendar[ds] = { type: shouldWork ? 'Worked' : 'Waiting' }; });
                const daysSpent = Object.values(calendar).filter(r => r.type === 'Worked' && (area.area !== 'Tendering' || ((r.hours || 1) + (r.minutes || 0) / 60 >= 1))).length;
                const waitingDays = Object.values(calendar).filter(r => r.type === 'Waiting').length;
                return { ...area, calendar, daysSpent, waitingDays };
            });
        }
        return { ...opp, kpis: { ...baseKpis, areasInvolved: nextAreas } };
    };

    /**
     * Board-level task patcher (checkbox toggles, subtask toggles, quick-assign) that works
     * without the task-detail modal being open. Mirrors updateTaskInModal's status side effects
     * (dependency block, timer stop, doneDate/worked-day bookkeeping, inline-task sync) but applies
     * the whole patch atomically so a status change bundled with e.g. a subtasks change can't clobber
     * each other from two separate setState calls reading the same stale `localOpp`.
     */
    const applyTaskFieldsDirect = (taskId: string, patch: Partial<Task>) => {
        // Always build from the latest committed/ref value. A prior task edit may still
        // be inside a React transition and therefore not be present in this render's
        // `localOpp` closure yet.
        const baseOpp = localOppRef.current;
        const task = baseOpp.tasks.find(t => t.id === taskId);
        if (!task) return;

        const finalPatch: Partial<Task> = { ...patch };
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
        if (finalPatch.status === 'Missing Info' && task.isAssignment && task.status === 'Approval') {
            const today = getTodayStr();
            finalPatch.assignmentCycles = [...(task.assignmentCycles || []), { id: crypto.randomUUID(), executionRequested: task.responsibleRequestedDate, executionRequired: task.responsibleDueDate, executionDelivered: task.responsibleDeliveredDate, approvalRequested: task.approvalRequestedDate, approvalRequired: task.approvalDueDate, changesRequestedAt: today }];
            finalPatch.responsibleRequestedDate = today;
            finalPatch.responsibleDeliveredDate = '';
            finalPatch.approvalRequestedDate = '';
            finalPatch.approvalDeliveredDate = '';
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

        const updatedTaskData: Task = syncAssignmentSubtasks({ ...task, ...finalPatch });
        const updatedTasks = baseOpp.tasks.map(t => t.id === taskId ? updatedTaskData : t);

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
        if (finalPatch.status === 'Missing Info' && task.isAssignment && task.status === 'Approval') {
            newOpp = { ...newOpp, history: sortHistoryEntries([{ id: crypto.randomUUID(), date: getTodayStr(), content: `Changes requested during approval for "${task.title}".` }, ...(newOpp.history || [])]) };
        }
        newOpp = syncAssignmentKpi(newOpp, updatedTaskData);
        if (isStatusChange && finalPatch.status === 'Done') {
            newOpp = withTenderingWorkedDay(newOpp, updatedTaskData.dueDate || getTodayStr());
        }
        localOppRef.current = newOpp;
        setLocalOpp(newOpp);
        onUpdate(newOpp);
        if (selectedTaskForEdit?.task.id === taskId) setSelectedTaskForEdit({ task: updatedTaskData });
    };

    const toggleTaskDoneDirect = (task: Task) => {
        applyTaskFieldsDirect(task.id, { status: task.status === 'Done' ? 'Pending' : 'Done' });
    };

    const toggleSubtaskDirect = (task: Task, subtaskId: string) => {
        const updatedSubtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
        const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed);
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

    const updateTaskInModal = (field: keyof Task, value: any, extraPatch?: Partial<Task>) => {
        if (!selectedTaskForEdit) return;

        const baseOpp = localOppRef.current;
        const latestTask = baseOpp.tasks.find(t => t.id === selectedTaskForEdit.task.id) || selectedTaskForEdit.task;

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
        if (field === 'status' && value === 'Missing Info' && selectedTaskForEdit.task.isAssignment && selectedTaskForEdit.task.status === 'Approval') {
            const today = getTodayStr();
            extraPatch = { ...extraPatch, assignmentCycles: [...(selectedTaskForEdit.task.assignmentCycles || []), { id: crypto.randomUUID(), executionRequested: selectedTaskForEdit.task.responsibleRequestedDate, executionRequired: selectedTaskForEdit.task.responsibleDueDate, executionDelivered: selectedTaskForEdit.task.responsibleDeliveredDate, approvalRequested: selectedTaskForEdit.task.approvalRequestedDate, approvalRequired: selectedTaskForEdit.task.approvalDueDate, changesRequestedAt: today }], responsibleRequestedDate: today, responsibleDeliveredDate: '', approvalRequestedDate: '', approvalDeliveredDate: '' };
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
        const doneDate = isMarkingDone
            ? (selectedTaskForEdit.task.dueDate || getTodayStr())
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
        if (field === 'status' && value === 'Missing Info' && selectedTaskForEdit.task.isAssignment && selectedTaskForEdit.task.status === 'Approval') {
            newOpp = { ...newOpp, history: sortHistoryEntries([{ id: crypto.randomUUID(), date: getTodayStr(), content: `Changes requested during approval for "${selectedTaskForEdit.task.title}".` }, ...(newOpp.history || [])]) };
        }
        newOpp = syncAssignmentKpi(newOpp, updatedTaskData);
        if (isMarkingDone) {
            newOpp = withTenderingWorkedDay(newOpp, doneDate);
        }
        // Publish to the ref before yielding to the transition. Consecutive edits in
        // the same frame must see this result instead of overwriting it with stale data.
        localOppRef.current = newOpp;
        React.startTransition(() => {
            setLocalOpp(newOpp);
            onUpdate(newOpp);
        });
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

        const summary = `
                                    Task: ${t.title}
                                    Due Date: ${t.dueDate}
                                    Status: ${t.status} | Priority: ${t.priority}
                                    Description:
                                    ${t.description}

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
                ['Requested', s.dates.requested || '-'],
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
            `Requested Date: ${requestedDate}`,
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
            await saveMeta(opportunity.id, key, type === 'task' ? { linkedTaskIds: [id] } : { linkedNoteIds: [id] });
        }
        setShowDocPicker(null);
        setRefreshKey(prev => prev + 1);
    };

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

    const handleInlineTaskChange = (noteId: string, taskId: string, changes: Partial<InlineTask>) => {
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        if (noteIndex === -1) return;
        const note = localOpp.notes[noteIndex];
        const inlineTasks = note.inlineTasks || [];
        const taskIndex = inlineTasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const oldTask = inlineTasks[taskIndex];
        const updatedTask = { ...oldTask, ...changes, updatedAt: new Date().toISOString() };

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
                    }
                }
                if (changes.hasOwnProperty('text')) {
                    if (updatedTask.text !== linkedTask.title) taskUpdates.title = updatedTask.text || 'Note Task';
                }

                if (Object.keys(taskUpdates).length > 0) {
                    updatedTasks = [...localOpp.tasks];
                    updatedTasks[linkedTaskIndex] = { ...linkedTask, ...taskUpdates };
                }
            }
        }

        // PERF: inline-task edits fire frequently (checkbox toggles, text commits);
        // mark the heavy setLocalOpp as a transition so React can interrupt the
        // expediente-wide re-render when the user interacts with something else.
        let newOpp = { ...localOpp, notes: updatedNotes, tasks: updatedTasks, lastUpdated: new Date().toISOString() };
        if (updatedTask.linkedTaskId && changes.hasOwnProperty('isDone') && updatedTask.isDone) {
            const linkedTask = localOpp.tasks.find(t => t.id === updatedTask.linkedTaskId);
            newOpp = withTenderingWorkedDay(newOpp, linkedTask?.dueDate || getTodayStr());
        }
        React.startTransition(() => {
            setLocalOpp(newOpp);
            onUpdate(newOpp);
        });
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

    const suggestedEffortScore = React.useMemo(() => {
        if (!localOpp.kpis) return 0;
        const myDays = myWorkStats.days;
        const totalWorked = totalAreaDays;
        const otherTeamsDays = Math.max(0, totalWorked - myDays);
        const waiting = waitingOnOthersDays;
        // Formula: My Effort (10pts/day) + Team (5pts/day) - Waiting Penalty (2pts/day)
        const score = (myDays * 10) + (otherTeamsDays * 5) - (waiting * 2);
        return Math.min(100, Math.max(0, score));
    }, [myWorkStats.days, totalAreaDays, waitingOnOthersDays, localOpp.kpis]);

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
                tasks: (localOpp.tasks || []).map(t => ({
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
            });
            setShowRevisionCarryoverModal(true);
            alert(`New clean version ${nextRev} created. Current progress saved.`);
        }

        setShowCreateVersionModal(false);
        setNewVersionData({ commitMessage: '', tags: '', srId: '' });
    };

    const handleApplyRevisionCarryover = (selection: { noteIds: string[]; defaultLinkIds: string[]; customLinkIds: string[] }) => {
        if (!revisionCarryoverSource) return;

        const selectedNotes = JSON.parse(JSON.stringify(
            revisionCarryoverSource.notes.filter(note => selection.noteIds.includes(note.id))
        )) as MeetingNote[];
        const selectedDefaultUrls = { ...normalizedQuickLinks.defaultUrls };
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
            const updated = {
                ...localOpp,
                ...updates,
                lastUpdated: new Date().toISOString()
            } as Opportunity;
            setLocalOpp(updated);
            onUpdate(updated, opportunity.id, true);
        }

        setShowRevisionCarryoverModal(false);
        setRevisionCarryoverSource(null);
    };

    const handleRestoreFromSnapshot = (ver: OpportunityVersion) => {
        setVersionToRestore(ver);
        // Reset modal data to encourage fresh commit message for the current work being saved
        setNewVersionData({ 
            commitMessage: `Backing up ${localOpp.revision} before restoring ${ver.snapshot.revision || 'snapshot'}`, 
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

    const handleUpdateSnapshotMeta = (vId: string, updates: Partial<OpportunityVersion>) => {
        // Exclude snapshot from meta updates â€” snapshots are immutable once created
        const { snapshot: _ignored, ...safeMeta } = updates as any;
        const updatedVersions = (localOpp.versions || []).map(v => v.id === vId ? { ...v, ...safeMeta } : v);
        handleFieldChange('versions', updatedVersions, true);
    };


    return (
        <div className="flex flex-col h-full bg-white relative overflow-hidden">
            {!isDeferring ? (
                <>


            {/* Main Content Area */}
            <div className="flex flex-col shrink-0 bg-white relative z-20">
                <div className="flex-none flex flex-col bg-white z-20 shrink-0">
                    {isSnapshot && !isSubView && (
                        <div className="bg-amber-100 text-amber-800 px-4 py-1 text-xs font-bold flex justify-between items-center border-b border-amber-200">
                            <span className="flex items-center gap-2"><Lock className="w-3 h-3" /> READ ONLY - Viewing Snapshot: {activeVersion?.commitMessage}</span>
                            <button onClick={() => handleVersionSwitch(null)} className="underline hover:text-amber-900">Exit Snapshot</button>
                        </div>
                    )}

                    <div className="p-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
                        <div className="w-full px-4">
                            <div className="flex flex-col md:flex-row justify-between items-start mb-1 gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
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
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">OP</span>
                                                <div className="flex -space-x-px">
                                                    <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-16 bg-transparent" value={localOpp.id.replace(/^OP-/, '')} onChange={(val: string) => handleFieldChange('id', `OP-${val}`)} />
                                                </div>
                                                <div className="w-px h-3 bg-gray-200"></div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">QLK:</span>
                                                    <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-24 bg-transparent" value={localOpp.qlk} onChange={(val: string) => handleFieldChange('qlk', val)} placeholder="000000" />
                                                </div>
                                                <div className="w-px h-3 bg-gray-200"></div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">REV:</span>
                                                    <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-8 bg-transparent" value={localOpp.revision} onChange={(val: string) => handleFieldChange('revision', val)} placeholder="R0" />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {!isSubView && (
                                    <div className="flex items-center gap-2 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-sm">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SR</span>
                                        <OptimizedInput disabled={isSnapshot} className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-24 bg-transparent" value={localOpp.srId || ''} onChange={(val: string) => handleFieldChange('srId', val)} placeholder="SR-..." />
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 justify-end">
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
                                                    onClick={() => setShowVersionMenu(!showVersionMenu)}
                                                    className={`flex items-center gap-2 px-2 py-1 border rounded-lg text-xs font-medium transition-all shadow-sm ${isSnapshot ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-gray-200 text-gray-700 hover:text-blue-600'}`}
                                                >
                                                    <HistoryIcon className="w-3.5 h-3.5" />
                                                    Revisions
                                                    {(localOpp.versions || []).length > 0 && <span className="bg-gray-100 text-gray-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-1">{(localOpp.versions || []).length}</span>}
                                                </button>

                                                {showVersionMenu && (
                                                    <>
                                                        <div className="fixed inset-0 z-30" onClick={() => setShowVersionMenu(false)} />
                                                        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-40 flex flex-col max-h-[500px] animate-in fade-in zoom-in-95 duration-200">
                                                            <div className="p-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-2">
                                                                <div className="flex justify-between items-center">
                                                                    <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider">Revision History</h4>
                                                                    <button onClick={() => { setShowCreateVersionModal(true); setShowVersionMenu(false); }} className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-100 font-bold flex items-center gap-1">
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
                                                )}
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

                            <div className="flex flex-wrap md:flex-nowrap justify-between items-center gap-4 my-1 px-1">
                                <div className="flex-1 w-full md:w-auto min-w-[200px]">
                                    <OptimizedInput disabled={isSnapshot} value={localOpp.title} onChange={(val: string) => handleFieldChange('title', val)} className="text-xl font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full placeholder-gray-300 mb-0 leading-tight" placeholder="Title" />
                                    <div className="flex items-center gap-2 w-full mt-1">
                                        <OptimizedInput disabled={isSnapshot} value={localOpp.customer} onChange={(val: string) => handleFieldChange('customer', val)} className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 leading-tight placeholder-gray-400 flex-1 min-w-0" placeholder="Customer" />
                                        {!hiddenHeaderFields.has('address') && (
                                            <>
                                                <span className="text-gray-300 text-sm">·</span>
                                                <OptimizedInput disabled={isSnapshot} value={localOpp.customerAddress || ''} onChange={(val: string) => handleFieldChange('customerAddress', val)} className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 leading-tight placeholder-gray-400 flex-1 min-w-0" placeholder="Address" />
                                            </>
                                        )}
                                    </div>
                                    {!hiddenHeaderFields.has('seller') && (
                                        <div className="flex items-center gap-2 w-full mt-1">
                                            <OptimizedInput disabled={isSnapshot} value={localOpp.seller || ''} onChange={(val: string) => handleFieldChange('seller', val)} className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 leading-tight placeholder-gray-400 flex-1 min-w-0" placeholder="Seller" />
                                        </div>
                                    )}

                                    {nextTask && !hiddenHeaderFields.has('nextStep') ? (
                                            <div
                                                className="mt-2 inline-flex items-center gap-3 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-xl border border-blue-100 shadow-sm animate-in fade-in slide-in-from-left-1 group/next cursor-pointer hover:shadow-md transition-shadow"
                                                onClick={() => {
                                                    focusTaskInTasksList(nextTask.id);
                                                }}
                                            >
                                                <div className="bg-white p-1 rounded-lg shadow-sm border border-blue-100 animate-pulse-subtle">
                                                    <Zap className="w-3.5 h-3.5 text-blue-600 fill-blue-500" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black uppercase text-blue-500 tracking-wider">Next Step</span>
                                                    <span className="text-xs font-bold leading-tight group-hover/next:text-indigo-800 transition-colors uppercase">{nextTask.title}</span>
                                                </div>
                                                <div className="ml-1 p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all duration-200">
                                                    <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover/next:text-blue-600" />
                                                </div>
                                            </div>
                                        ) : null}

                                    {(!hiddenHeaderFields.has('quoteType') || !hiddenHeaderFields.has('alias')) && (
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        {localOpp.quoteType && !hiddenHeaderFields.has('quoteType') && (
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shadow-sm ${
                                                localOpp.quoteType === 'Firm'
                                                ? 'bg-[#3DCD58] text-white'
                                                : 'bg-white text-gray-700 border border-gray-200'
                                            }`}>
                                                {localOpp.quoteType} Proposal
                                            </span>
                                        )}
                                        {opportunity.alias && !hiddenHeaderFields.has('alias') && <span className="text-[10px] bg-[#3DCD58]/10 text-[#3DCD58] px-2 py-0.5 rounded font-black uppercase tracking-tight">{opportunity.alias}</span>}
                                    </div>
                                    )}

                                    {!hiddenHeaderFields.has('labels') && (
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        {(localOpp.labels || []).map(l => (
                                            <span key={l.id} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm hover:opacity-90 transition-opacity cursor-default" style={{ backgroundColor: l.color }}>
                                                {l.text}
                                                <button onClick={() => {
                                                    const newLabels = (localOpp.labels || []).filter(item => item.id !== l.id);
                                                    handleFieldChange('labels', newLabels);
                                                }} className="hover:bg-black/20 rounded-full p-0.5 transition-colors"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowLabelMenu(!showLabelMenu)}
                                                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors border border-dashed ${showLabelMenu ? 'bg-gray-200 text-gray-700 border-gray-300' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
                                            >
                                                <Plus className="w-3 h-3" /> Label
                                            </button>

                                            {showLabelMenu && (
                                                <>
                                                    <div className="fixed inset-0 z-[55] cursor-default" onClick={() => setShowLabelMenu(false)} />
                                                    <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-2 z-[60] animate-in fade-in zoom-in-95 duration-100">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-2 px-2 flex items-center gap-2"><Tag className="w-3 h-3" /> Assign Label</p>
                                                        <div className="space-y-1 max-h-48 overflow-y-auto">
                                                            {(globalLabels || []).map(gl => {
                                                                const isSelected = (localOpp.labels || []).some(l => l.id === gl.id);
                                                                return (
                                                                    <button
                                                                        key={gl.id}
                                                                        className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 text-left transition-colors ${isSelected ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
                                                                        onClick={() => {
                                                                            if (!isSelected) {
                                                                                handleFieldChange('labels', [...(localOpp.labels || []), gl]);
                                                                                setShowLabelMenu(false);
                                                                            }
                                                                        }}
                                                                        disabled={isSelected}
                                                                    >
                                                                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: gl.color }}></div>
                                                                        <span className="text-xs font-bold text-gray-700">{gl.text}</span>
                                                                        {isSelected && <CheckCircle className="w-3 h-3 ml-auto text-green-500" />}
                                                                    </button>
                                                                );
                                                            })}
                                                            {(globalLabels || []).length === 0 && <div className="text-[10px] text-gray-400 px-2 py-4 text-center italic">No global labels configured.<br />Go to Settings to add labels.</div>}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
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
                                    {!hiddenHeaderFields.has('principalStatus') && (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Principal Status</span>
                                        <select disabled={isSnapshot} value={localOpp.statusLabel} onChange={(e) => handleFieldChange('statusLabel', e.target.value)} className={`text-[10px] font-bold px-2 py-1 rounded border outline-none w-32 uppercase tracking-wider shadow-sm disabled:cursor-not-allowed ${STATUS_COLORS[localOpp.statusLabel]}`}>{Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                    </div>
                                    )}
                                    {!hiddenHeaderFields.has('processStatus') && (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Process Status</span>
                                        <select disabled={isSnapshot} value={localOpp.detailedStatus || 'No Status'} onChange={(e) => handleFieldChange('detailedStatus', e.target.value)} className={`text-[10px] font-bold px-2 py-1 rounded border outline-none w-32 uppercase tracking-wider shadow-sm disabled:cursor-not-allowed ${DETAILED_STATUS_COLORS[localOpp.detailedStatus || 'No Status']}`}>{Object.keys(DETAILED_STATUS_COLORS).map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}</select>
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
                    <div className="flex border-b border-gray-200 px-3 overflow-x-auto shrink-0 bg-white sticky top-0 z-10">
                        <div className="w-full px-4 flex">
                            <button onClick={() => setActiveTabSafe('overview')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}>Overview</button>
                            {orderedDetailTabs.map(tab => {
                                const section = OPPORTUNITY_DETAIL_SECTIONS.find(item => item.key === tab);
                                return (
                                    <button key={tab} onClick={() => setActiveTabSafe(tab)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === tab ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}>
                                        {renderOpportunityDetailTabIcon(tab)}
                                        {section?.label || tab}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div ref={scrollContainerRef} className={`flex-1 ${isSubView && deepLink && (deepLink.taskId || (deepLink.tab === 'notes' && deepLink.noteId)) ? 'overflow-hidden' : 'overflow-y-auto'} p-0 md:p-4 bg-gray-50/30 min-h-0`}>
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
                                                        <input disabled={isSnapshot} value={currentNote.title} onChange={(e) => updateSelectedNote('title', e.target.value)} className="font-black text-lg bg-transparent border-none focus:ring-0 text-gray-800 flex-1 px-0 disabled:opacity-70" placeholder="Note Title" />
                                                    </div>
                                                </div>}
                                                <div className="flex-1 flex flex-col min-h-0">
                                                    {currentNote.format === 'sow' ? (
                                                        <SowFormEmbed
                                                            key={currentNote.id}
                                                            content={currentNote.content}
                                                            people={localOpp.stakeholders || []}
                                                            areas={trackedAreas}
                                                            prefill={{ op_id: localOpp.id, op_name: localOpp.title, alias: localOpp.alias || '', sr_qlk: localOpp.srId || localOpp.qlk || '', customer: localOpp.customer, team_cse: localOpp.seller || '', site: localOpp.customerAddress || '', objective: localOpp.description || '', proposal_type: localOpp.quoteType === 'Firm' ? 'Firm' : localOpp.quoteType || '', flow_B001: localOpp.id, flow_B002: localOpp.alias || '', flow_B003: localOpp.customer, flow_B004: localOpp.dates?.expected || '', flow_B006: localOpp.seller || '', flow_B007: localOpp.customerAddress || '', flow_C012: String(localOpp.commercial?.cqaOfficialSellPrice ?? ''), flow_C013: String(localOpp.commercial?.cqaOfficialMargin ?? ''), flow_C014: localOpp.commercial?.discountsAndNotes || '' }}
                                                            globalForm={globalSowForm}
                                                            onGlobalFormChange={onGlobalSowFormChange}
                                                            onOpportunitySync={(fields) => {
                                                                const proposalType = String(fields.proposal_type ?? '');
                                                                // Keep every SOW proposal type. Previously values such as
                                                                // "Bid to bid" were mapped to undefined and got erased when
                                                                // the parent sent the next prefill update back to the iframe.
                                                                const quoteType = proposalType ? (proposalType.includes('Budgetary') ? 'Budgetary' : proposalType.includes('Firm') ? 'Firm' : proposalType) : localOpp.quoteType;
                                                                const updated = { ...localOpp, title: String(fields.op_name ?? localOpp.title), alias: String(fields.alias ?? localOpp.alias ?? ''), qlk: String(fields.sr_qlk ?? localOpp.qlk ?? ''), customer: String(fields.customer ?? localOpp.customer), seller: String(fields.team_cse ?? localOpp.seller ?? ''), customerAddress: String(fields.site ?? localOpp.customerAddress ?? ''), description: String(fields.objective ?? localOpp.description ?? ''), quoteType, dates: { ...localOpp.dates, expected: String(fields.proposal_delivery ?? localOpp.dates?.expected ?? '') }, commercial: { ...localOpp.commercial, cqaOfficialSellPrice: Number(fields.commercialSell ?? localOpp.commercial?.cqaOfficialSellPrice ?? 0), cqaOfficialMargin: Number(fields.commercialMargin ?? localOpp.commercial?.cqaOfficialMargin ?? 0), discountsAndNotes: String(fields.commercialNotes ?? localOpp.commercial?.discountsAndNotes ?? '') }, lastUpdated: new Date().toISOString() };
                                                                setLocalOpp(updated); syncToParentNow(updated);
                                                            }}
                                                            onGeneratedNote={addGeneratedSowNote}
                                                            disabled={isSnapshot}
                                                            onChange={(json: string) => {
                                                                const updatedNotes = localOpp.notes.map(n => n.id === currentNote.id ? { ...n, content: json } : n);
                                                                handleFieldChange('notes', updatedNotes, true);
                                                            }}
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
                                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selectedTaskForEdit.task.id}</p>
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
                                            <TaskTimerButtonModal task={selectedTaskForEdit.task} oppId={opportunity.id} />
                                            <button
                                                onClick={() => openEmailCompose('task_assignment', [selectedTaskForEdit.task.id])}
                                                title="Generate an email for this task (assignment, reminder or info request)"
                                                className="flex items-center gap-1 text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                                            >
                                                <Mail className="w-3 h-3" /> Email
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

                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Current Status</label>
                                                <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.status} onChange={(e) => updateTaskInModal('status', e.target.value as any)}>{(selectedTaskForEdit.task.owner === 'External Area' && (selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 ? ASSIGNED_TASK_STATUSES : TASK_STATUS_ORDER).map(s => <option key={s}>{s}</option>)}</select>
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
                                            </div>
                                        </div>

                                        <div className="p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Assignment</label>
                                            <label className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-600"><input type="checkbox" checked={selectedTaskForEdit.task.isAssignment || false} onChange={e => updateTaskInModal('isAssignment', e.target.checked, e.target.checked ? { owner: 'External Area', status: 'Missing Info', responsibleRequestedDate: selectedTaskForEdit.task.responsibleRequestedDate || getTodayStr() } : {})} className="rounded text-[#3DCD58]" /> Track as assignment</label>
                                            <div className="flex gap-4 items-center">
                                                <select className="border-gray-200 rounded-lg text-sm bg-white font-bold p-2" value={selectedTaskForEdit.task.owner} onChange={(e) => updateTaskInModal('owner', e.target.value)} >
                                                    <option value="Me">Me</option>
                                                    <option value="External Area">External Area</option>
                                                </select>
                                                {selectedTaskForEdit.task.owner === 'External Area' && (
                                                    <div className="flex gap-2 flex-1 flex-col">
                                                        <ResponsibleTeamPicker
                                                            options={sowTeamMembers}
                                                            onCreate={(name) => { createContactAndInvolve(name); return undefined; }}
                                                            selected={selectedTaskForEdit.task.responsibleTeamMemberIds || []}
                                                            onChange={(ids) => updateTaskInModal('responsibleTeamMemberIds', ids, {
                                                                responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                                                                externalAreas: Array.from(new Set(ids.map(id => sowTeamMembers.find(m => m.id === id)?.area).filter((a): a is string => !!a))),
                                                                ...(ids.length > 0 ? { isAssignment: true, responsibleRequestedDate: selectedTaskForEdit.task.responsibleRequestedDate || getTodayStr() } : {}),
                                                                ...(ids.length > 0 && !ASSIGNED_TASK_STATUSES.includes(selectedTaskForEdit.task.status) ? { status: 'Missing Info' as TaskStatus } : {}),
                                                                // Clear the (now hidden) requested/due-back/delivered dates when there's no one assigned anymore.
                                                                ...(ids.length === 0 ? { responsibleRequestedDate: '', responsibleDueDate: '', responsibleDeliveredDate: '' } : {})
                                                            })}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            {selectedTaskForEdit.task.owner === 'External Area' && (selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 && (
                                                <div className="grid grid-cols-2 gap-3 mt-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Requested on</label>
                                                        <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleRequestedDate || ''} onChange={(e) => updateTaskInModal('responsibleRequestedDate', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Committed date</label>
                                                        <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleDueDate || ''} onChange={(e) => updateTaskInModal('responsibleDueDate', e.target.value)} />
                                                    </div>
                                                </div>
                                            )}
                                            {selectedTaskForEdit.task.isAssignment && <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-gray-200 pt-3">
                                                <div><label className="text-[9px] font-bold text-gray-500 uppercase">Approvers</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name); return undefined; }} selected={selectedTaskForEdit.task.approverTeamMemberIds || []} onChange={ids => updateTaskInModal('approverTeamMemberIds', ids, ids.length > 0 && (selectedTaskForEdit.task.responsibleTeamMemberIds || []).length === 0 ? { isAssignment: true, status: 'Approval', responsibleRequestedDate: '', approvalRequestedDate: selectedTaskForEdit.task.approvalRequestedDate || getTodayStr() } : {})} /></div>
                                                <div><label className="text-[9px] font-bold text-gray-500 uppercase">Informed (CC)</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name); return undefined; }} selected={selectedTaskForEdit.task.informedTeamMemberIds || []} onChange={ids => updateTaskInModal('informedTeamMemberIds', ids)} /></div>
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
                                                <div className="md:col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Deliverable</label><input value={selectedTaskForEdit.task.deliverable || ''} onChange={e => updateTaskInModal('deliverable', e.target.value)} placeholder="Expected deliverable (used in assignment emails)" className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
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
                                        <div className="space-y-4">
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
                                        </div>

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

                                        {/* SUBTASKS */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sub-Tasks Checklist</label>
                                                <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => updateTaskInModal('subtasks', [...selectedTaskForEdit.task.subtasks, { id: crypto.randomUUID(), title: 'New Sub-task', completed: false }])}>+ Add Entry</button>
                                            </div>
                                            <div className="space-y-2 bg-gray-50 p-4 rounded-2xl">
                                                {selectedTaskForEdit.task.subtasks.map((sub, idx) => (
                                                    <div key={sub.id} className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm group">
                                                        <input type="checkbox" className="w-5 h-5 rounded border-gray-200 text-[#3DCD58] focus:ring-[#3DCD58]" checked={sub.completed} onChange={(e) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, completed: e.target.checked } : s))} />
                                                        <OptimizedInput className={`flex-1 text-sm bg-transparent border-none focus:ring-0 p-0 ${sub.completed ? 'text-gray-400 line-through' : 'text-gray-700 font-bold'}`} value={sub.title} onChange={(val: string) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, title: val } : s))} />
                                                        <button onClick={() => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.filter(s => s.id !== sub.id))} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))}
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
                    <div className="w-full px-2 md:px-6">
                        {activeTab === 'overview' && (
                            <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
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
                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Requested Date</label>
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
                                                onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, expected: e.target.value })}
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
                                                            title="SCOPE - quick view of the SOW scope"
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
                                                value={localOpp.priorityOrder || ''}
                                                onChange={(e) => handleFieldChange('priorityOrder', e.target.value ? parseInt(e.target.value) : null)}
                                                className="w-full text-sm border-gray-200 rounded-lg font-bold disabled:bg-gray-50"
                                                placeholder="e.g. 1"
                                            />
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
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3 h-[420px] overflow-hidden">
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
                                                className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Separator"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const views = ['overview', 'kpi', 'presentation', 'history', 'tasks', 'commercial', 'notes', 'folder'];
                                                    const view = prompt(`Enter view name (${views.join(', ')}):`);
                                                    if (view && views.includes(view.toLowerCase())) {
                                                        addQuickLinkItem({ id: crypto.randomUUID(), type: 'view', label: `View: ${view.toUpperCase()}`, url: view.toLowerCase() });
                                                    }
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add View Link"
                                            >
                                                <Layout className="w-4 h-4" />
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

                                    <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                                        {visibleDefaultLinks.map((link, visIdx) => {
                                            const url = normalizedQuickLinks.defaultUrls[link.id] || '';
                                            const Icon = getQuickLinkIcon(link);
                                            return (
                                                <div key={link.id} className="relative flex items-center gap-2 bg-gray-50 p-1.5 rounded border border-gray-100 min-w-0 group">
                                                    {!isSnapshot && (
                                                        <div className="flex flex-col shrink-0">
                                                            <button onClick={() => moveDefaultQuickLink(link.id, -1)} disabled={visIdx === 0} className="hover:text-blue-500 disabled:opacity-30" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                                                            <button onClick={() => moveDefaultQuickLink(link.id, 1)} disabled={visIdx === visibleDefaultLinks.length - 1} className="hover:text-blue-500 disabled:opacity-30" title="Move down"><ChevronDown className="w-3 h-3" /></button>
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

                                        {normalizedQuickLinks.customLinks.length > 0 && (
                                            <div className="h-px bg-gray-100 my-1" />
                                        )}
                                        {/* Custom links list */}
                                        {normalizedQuickLinks.customLinks.map((item, idx, arr) => (
                                            <div key={item.id} className="flex gap-2 items-center group bg-gray-50 p-1.5 rounded hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all min-w-0">
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => {
                                                        if (idx === 0) return;
                                                        const newLinks = [...arr];
                                                        [newLinks[idx], newLinks[idx - 1]] = [newLinks[idx - 1], newLinks[idx]];
                                                        updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                    }} disabled={idx === 0} className="hover:text-blue-500 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                                                    <button onClick={() => {
                                                        if (idx === arr.length - 1) return;
                                                        const newLinks = [...arr];
                                                        [newLinks[idx], newLinks[idx + 1]] = [newLinks[idx + 1], newLinks[idx]];
                                                        updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                    }} disabled={idx === arr.length - 1} className="hover:text-blue-500 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                                                </div>

                                                {item.type === 'heading' && (
                                                    <input
                                                        value={item.label}
                                                        onChange={(e) => {
                                                            const newLinks = [...arr];
                                                            newLinks[idx] = { ...item, label: e.target.value };
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
                                                                    const newLinks = arr.filter(i => i.id !== item.id);
                                                                    updateQuickLinks(newDefaultUrls, newLinks);
                                                                    return;
                                                                }
                                                                const newLinks = [...arr];
                                                                newLinks[idx] = { ...item, label: val };
                                                                updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                            }}
                                                            className="w-24 shrink-0 text-[10px] text-gray-400 font-bold uppercase truncate bg-transparent border-none focus:ring-0 p-0"
                                                        />
                                                        <OptimizedInput
                                                            value={item.url}
                                                            onChange={(val: string) => {
                                                                const newLinks = [...arr];
                                                                newLinks[idx] = { ...item, url: val };
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
                                                            const newLinks = arr.filter(i => i.id !== item.id);
                                                            updateQuickLinks(normalizedQuickLinks.defaultUrls, newLinks);
                                                        }
                                                    }}
                                                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Hidden links â€” always LAST, below defaults and custom links */}
                                        {!isSnapshot && hiddenDefaultLinks.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-1 border-t border-gray-100">
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
                                    {globalContacts.filter(c => !(localOpp.stakeholders || []).some(p => p.directoryContactId === c.id || (!!p.email && p.email.toLowerCase() === c.email.toLowerCase()))).map(c => <option key={c.id} value={c.id}>{c.name} Â· {c.email || 'email missing'} Â· {(c.availableRoles || []).join(', ')}</option>)}
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
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Requested Date</label>
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
                                                    onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, expected: e.target.value })}
                                                    className="w-full text-sm border-gray-200 rounded-lg disabled:bg-gray-50 bg-gray-50/10 font-bold"
                                                />
                                                {localOpp.dates.requested && localOpp.dates.expected && (() => {
                                                    const diff = countBusinessDays(localOpp.dates.requested, localOpp.dates.expected);
                                                    if (diff === 0) return null;
                                                    return (
                                                        <div className="absolute -top-7 right-0">
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border shadow-sm ${
                                                                diff < 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-[#3DCD58]/10 text-[#3DCD58] border-[#3DCD58]/20'
                                                            }`}>
                                                                {Math.abs(diff)} Work Days {diff < 0 ? 'Over' : 'Duration'}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
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
                                holidays={holidays}
                                history={localOpp.history}
                                onSaveAreaCalendar={handleSaveAreaCalendar}
                                onAddArea={addKpiArea}
                                onRemoveArea={removeKpiArea}
                                onAddHistory={addHistoryEntry}
                                onEditHistory={(id, content) => updateHistoryEntry(id, 'content', content)}
                                onDeleteHistory={deleteHistoryEntry}
                                onClose={() => setShowFullCalendar(false)}
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
                                            <button onClick={() => addHistoryEntry()} className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors">+ Add Entry</button>
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
                                                    Mandé un correo <b>({emailTopicFromSubject(rec.subject)})</b> para {rec.to.join(', ')}
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
                            <OpportunityFolderTab opportunityId={opportunity.id} opportunity={localOpp} onUpdate={onUpdate} initialFileKey={folderNavTarget || undefined} isSnapshot={isSnapshot} onPathChange={setCurrentFolderPath} />
                        )}

                        {activeTab === 'notes' && (
                            <div className={`flex min-h-0 gap-6 ${isNoteFullScreen ? 'fixed inset-0 z-50 bg-white p-6' : 'h-[calc(100vh-190px)]'}`}>
                                {!isNoteFullScreen && !sowNavigationOpen && (
                                    <div className="w-[280px] shrink-0 flex flex-col gap-3 overflow-y-auto border-r border-gray-100 pr-4">
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
                                            <button onClick={() => addNote()} className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"><Zap className="w-3 h-3" /> Blank</button>
                                            {sowSectionEnabled && <button onClick={addSowNote} className="p-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all text-blue-600" title="Add the Scope of Work guided form to this opportunity"><ListChecks className="w-3 h-3" /> SOW</button>}
                                            <button onClick={() => addFolder()} className="p-3 bg-gray-50 hover:bg-amber-50 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all text-amber-600"><FolderPlus className="w-3 h-3" /> Folder</button>
                                        </div>
                                        {stakeholdersSectionEnabled && renderTeamPanelButton()}
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

                                            // Called as a plain function to avoid JSX key-prop TypeScript issues
                                            const renderNote = (note: MeetingNote, indent: number): React.ReactNode => {
                                                const children = isSearching ? [] : sortWithOrderFallback(localOpp.notes.filter(n => n.parentId === note.id), dateDesc);
                                                const hasChildren = children.length > 0;
                                                const isCollapsed = collapsedFolders.has(note.id);
                                                const isSelected = selectedNoteId === note.id;
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
                                                                if (!activeDraggedNoteId || activeDraggedNoteId === note.id || isNoteDescendantOf(note.id, activeDraggedNoteId)) return;
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
                                                            className={`p-2.5 rounded-lg border relative group transition-all ${isSearching ? 'cursor-pointer' : 'cursor-grab'} ${isSelected ? 'bg-[#3DCD58]/10 border-[#3DCD58]/30 ring-1 ring-[#3DCD58]/20 shadow-md' : isDropTarget && noteDropPlacement === 'inside' ? 'bg-[#3DCD58]/10 border-[#3DCD58] ring-1 ring-[#3DCD58]/30' : isDropTarget && noteDropPlacement === 'before' ? 'bg-blue-50 border-blue-300 border-t-4' : isDropTarget && noteDropPlacement === 'after' ? 'bg-blue-50 border-blue-300 border-b-4' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                                            onClick={() => setSelectedNoteIdSafe(note.id)}
                                                        >
                                                            <div className="flex items-center gap-1 pr-14">
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
                                                                <div className="mt-1 pl-4 text-[9px] font-bold uppercase tracking-wide text-[#2da848]">Soltar como subnota</div>
                                                            )}
                                                            <div className="absolute top-1.5 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                                                <button onClick={(e) => { e.stopPropagation(); addNote(undefined, undefined, note.id, note.folderId); }} className="p-1 text-gray-300 hover:text-[#3DCD58]" title="Add sub-note"><Plus className="w-3 h-3" /></button>
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
                                                const folderNotes = sortWithOrderFallback(localOpp.notes.filter(n => n.folderId === folder.id && !n.parentId), dateDesc);
                                                const childFolders = sortWithOrderFallback(allFolders.filter(f => f.parentFolderId === folder.id), folderNameAsc);
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

                                            const rootFolders = sortWithOrderFallback(allFolders.filter(f => !f.parentFolderId), folderNameAsc);
                                            const rootNotes = sortWithOrderFallback(localOpp.notes.filter(n => !n.folderId && !n.parentId), dateDesc);

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
                                    </div>
                                )}
                                <div className={`flex-1 flex gap-4 min-h-0 bg-white overflow-hidden flex flex-col ${currentNote?.format === 'sow' ? '' : 'rounded-xl border border-gray-200 shadow-sm'}`}>
                                    {teamPanelOpen ? (
                                        renderOpportunityTeamPanel()
                                    ) : currentNote ? (
                                        <>
                                            {currentNote.format !== 'sow' && <div className="p-4 border-b border-gray-100 flex flex-col gap-2 bg-gray-50 shrink-0">
                                                <div className="flex justify-between items-center">
                                                    <input value={currentNote.title} onChange={(e) => updateSelectedNote('title', e.target.value)} className="font-black text-lg bg-transparent border-none focus:ring-0 text-gray-800 flex-1 px-0" placeholder="Note Title" />
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                                                            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                                                            <input
                                                                type="date"
                                                                value={currentNote.date || getTodayStr()}
                                                                onChange={(e) => updateSelectedNote('date', e.target.value)}
                                                                className="text-xs font-bold text-gray-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
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
                                                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors mr-1"
                                                        title="Minimizar Nota"
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
                                                    {currentNote.format !== 'sow' && <button onClick={() => handleExportNotePDF(currentNote)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Download Note PDF"><FileDown className="w-4 h-4 text-gray-500" /></button>}
                                                    <button onClick={() => setIsNoteFullScreen(!isNoteFullScreen)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">{isNoteFullScreen ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}</button>
                                                </div>
                                            </div>}
                                            {/* Editor Container with Vertical Flex */}
                                            <div className="flex-1 flex flex-col min-h-0 relative">
                                                {currentNote.format === 'sow' ? (
                                                    <><button onClick={() => setIsNoteFullScreen(!isNoteFullScreen)} className="absolute left-3 bottom-3 z-10 p-2 bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50" title={isNoteFullScreen ? 'Exit full screen' : 'Full screen'}>{isNoteFullScreen ? <Minimize2 className="w-4 h-4 text-gray-600" /> : <Maximize2 className="w-4 h-4 text-gray-600" />}</button><SowFormEmbed
                                                        key={currentNote.id}
                                                        content={currentNote.content}
                                                        people={localOpp.stakeholders || []}
                                                        directoryPeople={globalContacts.map(contact => ({ id: contact.id, name: contact.name, email: contact.email, roles: contact.availableRoles, aliases: contact.aliases }))}
                                                        areas={trackedAreas}
                                                        prefill={{ op_id: localOpp.id, op_name: localOpp.title, alias: localOpp.alias || '', sr_qlk: localOpp.srId || localOpp.qlk || '', customer: localOpp.customer, team_cse: localOpp.seller || '', site: localOpp.customerAddress || '', objective: localOpp.description || '', proposal_type: localOpp.quoteType === 'Firm' ? 'Firm' : localOpp.quoteType || '', flow_B001: localOpp.id, flow_B002: localOpp.alias || '', flow_B003: localOpp.customer, flow_B004: localOpp.dates?.expected || '', flow_B006: localOpp.seller || '', flow_B007: localOpp.customerAddress || '', flow_C012: String(localOpp.commercial?.cqaOfficialSellPrice ?? ''), flow_C013: String(localOpp.commercial?.cqaOfficialMargin ?? ''), flow_C014: localOpp.commercial?.discountsAndNotes || '' }}
                                                        globalForm={globalSowForm}
                                                        onGlobalFormChange={onGlobalSowFormChange}
                                                        onSellerMissing={(name) => {
                                                            if (window.confirm(`"${name}" is not in the contact directory. Do you want to create or link a contact now? You can skip this and resolve it later in Stakeholders.`)) createContactAndInvolve(name);
                                                        }}
                                                        onNavigationOpenChange={setSowNavigationOpen}
                                                        onOpportunitySync={(fields) => {
                                                            const proposalType = String(fields.proposal_type ?? '');
                                                            // Keep every SOW proposal type. Previously values such as
                                                            // "Bid to bid" were mapped to undefined and got erased when
                                                            // the parent sent the next prefill update back to the iframe.
                                                            const quoteType = proposalType ? (proposalType.includes('Budgetary') ? 'Budgetary' : proposalType.includes('Firm') ? 'Firm' : proposalType) : localOpp.quoteType;
                                                            const updated = { ...localOpp, title: String(fields.op_name ?? localOpp.title), alias: String(fields.alias ?? localOpp.alias ?? ''), qlk: String(fields.sr_qlk ?? localOpp.qlk ?? ''), customer: String(fields.customer ?? localOpp.customer), seller: String(fields.team_cse ?? localOpp.seller ?? ''), customerAddress: String(fields.site ?? localOpp.customerAddress ?? ''), description: String(fields.objective ?? localOpp.description ?? ''), quoteType, dates: { ...localOpp.dates, expected: String(fields.proposal_delivery ?? localOpp.dates?.expected ?? '') }, commercial: { ...localOpp.commercial, cqaOfficialSellPrice: Number(fields.commercialSell ?? localOpp.commercial?.cqaOfficialSellPrice ?? 0), cqaOfficialMargin: Number(fields.commercialMargin ?? localOpp.commercial?.cqaOfficialMargin ?? 0), discountsAndNotes: String(fields.commercialNotes ?? localOpp.commercial?.discountsAndNotes ?? '') }, lastUpdated: new Date().toISOString() };
                                                            setLocalOpp(updated); syncToParentNow(updated);
                                                        }}
                                                        onGeneratedNote={addGeneratedSowNote}
                                                        onChange={(json: string) => {
                                                            const updatedNotes = localOpp.notes.map(n => n.id === currentNote.id ? { ...n, content: json } : n);
                                                            handleFieldChange('notes', updatedNotes, true);
                                                        }}
                                                    /></>
                                                ) : (
                                                    <NoteEditorWrapper
                                                        key={currentNote.id}
                                                        ref={noteEditorRef}
                                                        initialContent={activeNoteHtml}
                                                        onChange={(val: string) => updateSelectedNote('content', val)}
                                                        onAttach={() => setShowDocPicker({ type: 'note', id: currentNote.id })}
                                                        mentionOptions={localOpp.stakeholders || []}
                                                    />
                                                )}

                                                {/* Tasks in this note section â€” not applicable to the embedded SOW form */}
                                                {currentNote.format !== 'sow' && <div className="border-t border-gray-100 bg-gray-50 flex-shrink-0 flex flex-col max-h-[300px]">
                                                    <div className="px-6 py-2 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0">
                                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tasks in this note</h3>
                                                        <button
                                                            onClick={() => handleAddInlineTask(currentNote.id)}
                                                            disabled={!currentNote}
                                                            className="text-xs flex items-center gap-1 font-bold text-[#3DCD58] hover:bg-[#3DCD58]/10 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <Plus className="w-3 h-3" /> Add task
                                                        </button>
                                                    </div>
                                                    <div className="overflow-y-auto p-4 space-y-2">
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
                                                    </div>
                                                </div>}
                                            </div>

                                            {/* Linked Items Container (Scrollable) */}
                                            <div className="px-6 pb-4 bg-white border-t border-gray-100 max-h-48 overflow-y-auto">
                                                <LinkedDocsList
                                                    key={refreshKey}
                                                    opportunityId={opportunity.id}
                                                    revision={localOpp.revision}
                                                    noteId={currentNote.id}
                                                    onNavigateToFile={navigateToFile}
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
                                                <button onClick={addTask} className="text-xs font-bold bg-[#3DCD58] text-white px-4 py-2 rounded-lg hover:bg-[#2db64a] shadow-lg shadow-[#3DCD58]/20 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Task</button>
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
                                                    const doneSubtasks = task.subtasks.filter(s => s.completed).length;
                                                    const totalSubtasks = task.subtasks.length;
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
                                                            className={`group border rounded-xl transition-all cursor-pointer ${draggedTaskId === task.id ? 'opacity-40' : ''} ${highlightTaskId === task.id ? 'bg-yellow-100 border-yellow-400 border-2' : `bg-white hover:shadow-md ${isDone ? 'border-gray-100' : 'border-gray-100 hover:border-[#3DCD58]/30'}`}`}
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
                                                                            <button onClick={() => toggleTaskExpanded(task.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 shrink-0" title={isExpanded ? 'Hide attachments' : 'Show attachments'}>
                                                                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                                            </button>
                                                                            <button onClick={() => setShowDocPicker({ type: 'task', id: task.id })} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 shrink-0" title="Attach file from folder">
                                                                                <Paperclip className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            {(task.isAssignment || (task.approverTeamMemberIds?.length ?? 0) > 0) && informedTaskIds.has(task.id) && (
                                                                                <span title="An assignment email was already generated for this task" className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded uppercase shrink-0">✓ Informed</span>
                                                                            )}
                                                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                                                <TaskTimerButtonList task={task} oppId={localOpp.id} />
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
                                                                                {(task.owner === 'External Area' && (task.responsibleTeamMemberIds || []).length > 0 ? ASSIGNED_TASK_STATUSES : TASK_STATUS_ORDER).map(s => <option key={s} value={s}>{s}</option>)}
                                                                            </select>
                                                                        </div>
                                                                    </div>

                                                                    {assignPopoverTaskId === task.id && (
                                                                        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                                                                            <ResponsibleTeamPicker
                                                                                options={sowTeamMembers}
                                                                                onCreate={(name) => { createContactAndInvolve(name); return undefined; }}
                                                                                selected={task.responsibleTeamMemberIds || []}
                                                                                onChange={(ids) => applyTaskFieldsDirect(task.id, {
                                                                                    responsibleTeamMemberIds: ids,
                                                                                    responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                                                                                    owner: ids.length > 0 ? 'External Area' : task.owner,
                                                                                    externalAreas: Array.from(new Set(ids.map(id => sowTeamMembers.find(m => m.id === id)?.area).filter((a): a is string => !!a))),
                                                                                    ...(ids.length > 0 && !ASSIGNED_TASK_STATUSES.includes(task.status) ? { status: 'Missing Info' as TaskStatus } : {})
                                                                                })}
                                                                            />
                                                                            {(task.responsibleTeamMemberIds || []).length > 0 && (
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
                                                                            <LinkedDocsList key={refreshKey} opportunityId={opportunity.id} revision={localOpp.revision} taskId={task.id} onNavigateToFile={navigateToFile} />
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
                                                                <div className="text-[11px] font-black uppercase tracking-widest text-gray-300 mb-2">Canceled ({canceledTasks.length})</div>
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
                                                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${TASK_STATUS_COLORS[status]}`}>{status}</span>
                                                                <span className="text-[10px] font-bold text-gray-400">{columnTasks.length}</span>
                                                            </div>
                                                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                                                {columnTasks.map(task => {
                                                                    const doneSubtasks = task.subtasks.filter(s => s.completed).length;
                                                                    const totalSubtasks = task.subtasks.length;
                                                                    const isDone = task.status === 'Done';
                                                                    return (
                                                                        <div
                                                                            key={task.id}
                                                                            draggable={!isSnapshot}
                                                                            onDragStart={(e) => e.dataTransfer.setData('id', task.id)}
                                                                            onClick={() => setSelectedTaskForEdit({ task })}
                                                                            className="group bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm hover:shadow-md hover:border-[#3DCD58]/30 cursor-grab active:cursor-grabbing transition-all"
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
                                                                                        onCreate={(name) => { createContactAndInvolve(name); return undefined; }}
                                                                                        selected={task.responsibleTeamMemberIds || []}
                                                                                        onChange={(ids) => applyTaskFieldsDirect(task.id, {
                                                                                            responsibleTeamMemberIds: ids,
                                                                                            responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                                                                                            owner: ids.length > 0 ? 'External Area' : task.owner,
                                                                                            externalAreas: Array.from(new Set(ids.map(id => sowTeamMembers.find(m => m.id === id)?.area).filter((a): a is string => !!a))),
                                                                                            ...(ids.length > 0 && !ASSIGNED_TASK_STATUSES.includes(task.status) ? { status: 'Missing Info' as TaskStatus } : {})
                                                                                        })}
                                                                                    />
                                                                                    {(task.responsibleTeamMemberIds || []).length > 0 && (
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
                                                                                <TaskTimerButtonList task={task} oppId={localOpp.id} />
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
                                <div className="flex justify-between items-start mb-8 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-2xl shadow-sm ${TASK_STATUS_COLORS[selectedTaskForEdit.task.status]}`}><ListChecks className="w-6 h-6" /></div>
                                        <div>
                                            <h2 className="text-2xl font-black text-gray-900">Task Detail</h2>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selectedTaskForEdit.task.id}</p>
                                                {opportunity.alias && <span className="text-[10px] bg-[#3DCD58]/10 text-[#3DCD58] px-2 py-0.5 rounded font-black uppercase tracking-tight">{opportunity.alias}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => openEmailCompose('task_assignment', [selectedTaskForEdit.task.id])}
                                            title="Generate an email for this task (assignment, reminder or info request)"
                                            className="flex items-center gap-1 text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                                        >
                                            <Mail className="w-3 h-3" /> Email
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
                                        <TaskTimerButtonModal task={selectedTaskForEdit.task} oppId={opportunity.id} />
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
                                            title="Minimizar Tarea"
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

                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Current Status</label>
                                            <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.status} onChange={(e) => updateTaskInModal('status', e.target.value as any)}>{(selectedTaskForEdit.task.owner === 'External Area' && (selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 ? ASSIGNED_TASK_STATUSES : TASK_STATUS_ORDER).map(s => <option key={s}>{s}</option>)}</select>
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
                                        </div>
                                    </div>

                                    <div className="p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Assignment</label>
                                        <label className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-600"><input type="checkbox" checked={selectedTaskForEdit.task.isAssignment || false} onChange={e => updateTaskInModal('isAssignment', e.target.checked, e.target.checked ? { owner: 'External Area', status: 'Missing Info', responsibleRequestedDate: selectedTaskForEdit.task.responsibleRequestedDate || getTodayStr() } : {})} className="rounded text-[#3DCD58]" /> Track as assignment</label>
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
                                                    <ResponsibleTeamPicker
                                                        options={sowTeamMembers}
                                                        onCreate={(name) => { createContactAndInvolve(name); return undefined; }}
                                                        selected={selectedTaskForEdit.task.responsibleTeamMemberIds || []}
                                                        onChange={(ids) => updateTaskInModal('responsibleTeamMemberIds', ids, {
                                                            responsible: ids.map(id => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                                                            externalAreas: Array.from(new Set(ids.map(id => sowTeamMembers.find(m => m.id === id)?.area).filter((a): a is string => !!a))),
                                                            ...(ids.length > 0 ? { isAssignment: true, responsibleRequestedDate: selectedTaskForEdit.task.responsibleRequestedDate || getTodayStr() } : {}),
                                                            ...(ids.length > 0 && !ASSIGNED_TASK_STATUSES.includes(selectedTaskForEdit.task.status) ? { status: 'Missing Info' as TaskStatus } : {}),
                                                            ...(ids.length === 0 ? { responsibleRequestedDate: '', responsibleDueDate: '', responsibleDeliveredDate: '' } : {})
                                                        })}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        {selectedTaskForEdit.task.owner === 'External Area' && (selectedTaskForEdit.task.responsibleTeamMemberIds || []).length > 0 && (
                                            <div className="grid grid-cols-2 gap-3 mt-3">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Requested on</label>
                                                    <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleRequestedDate || ''} onChange={(e) => updateTaskInModal('responsibleRequestedDate', e.target.value)} />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Committed date</label>
                                                    <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-sm p-2" value={selectedTaskForEdit.task.responsibleDueDate || ''} onChange={(e) => updateTaskInModal('responsibleDueDate', e.target.value)} />
                                                </div>
                                            </div>
                                        )}
                                        {selectedTaskForEdit.task.isAssignment && <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-gray-200 pt-3">
                                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Approvers</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name); return undefined; }} selected={selectedTaskForEdit.task.approverTeamMemberIds || []} onChange={ids => updateTaskInModal('approverTeamMemberIds', ids, ids.length > 0 && (selectedTaskForEdit.task.responsibleTeamMemberIds || []).length === 0 ? { isAssignment: true, status: 'Approval', responsibleRequestedDate: '', approvalRequestedDate: selectedTaskForEdit.task.approvalRequestedDate || getTodayStr() } : {})} /></div>
                                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Informed (CC)</label><ResponsibleTeamPicker options={sowTeamMembers} onCreate={(name) => { createContactAndInvolve(name); return undefined; }} selected={selectedTaskForEdit.task.informedTeamMemberIds || []} onChange={ids => updateTaskInModal('informedTeamMemberIds', ids)} /></div>
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
                                                <div className="md:col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Deliverable</label><input value={selectedTaskForEdit.task.deliverable || ''} onChange={e => updateTaskInModal('deliverable', e.target.value)} placeholder="Expected deliverable (used in assignment emails)" className="w-full border-gray-200 rounded-lg text-sm p-2" /></div>
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
                                            {selectedTaskForEdit.task.dependsOnTaskIds && selectedTaskForEdit.task.dependsOnTaskIds.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-gray-200/50">
                                                    {selectedTaskForEdit.task.dependsOnTaskIds.map(depId => {
                                                        const depTask = localOpp.tasks.find(t => t.id === depId);
                                                        if (!depTask) return null;
                                                        return (
                                                            <div key={depId} className="flex items-center gap-2 text-xs py-0.5">
                                                                <div className={`w-2 h-2 rounded-full ${depTask.status === 'Done' ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                                <span className={`${depTask.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>{depTask.title}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Detailed Description</label>
                                        <OptimizedTextArea className="w-full border-gray-100 bg-gray-50 rounded-2xl text-sm min-h-[120px] p-4 shadow-inner focus:bg-white transition-all focus:ring-0" value={selectedTaskForEdit.task.description} onChange={(val: string) => updateTaskInModal('description', val)} />
                                    </div>

                                    {/* TIME TRACKING HISTORY */}
                                    <div className="space-y-4">
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
                                    </div>

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
                                                        <div className="flex items-center gap-2">
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

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sub-Tasks Checklist</label>
                                            <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => updateTaskInModal('subtasks', [...selectedTaskForEdit.task.subtasks, { id: crypto.randomUUID(), title: 'New Sub-task', completed: false }])}>+ Add Entry</button>
                                        </div>
                                        <div className="space-y-2 bg-gray-50 p-4 rounded-2xl">
                                            {selectedTaskForEdit.task.subtasks.map((sub, idx) => (
                                                <div key={sub.id} className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm group">
                                                    <div className="flex flex-col -space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => moveSubtask(idx, 'up')} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-0"><ChevronUp className="w-4 h-4" /></button>
                                                        <button onClick={() => moveSubtask(idx, 'down')} disabled={idx === selectedTaskForEdit.task.subtasks.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-0"><ChevronDown className="w-4 h-4" /></button>
                                                    </div>
                                                    <input type="checkbox" className="w-5 h-5 rounded border-gray-200 text-[#3DCD58] focus:ring-[#3DCD58]" checked={sub.completed} onChange={(e) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, completed: e.target.checked } : s))} />
                                                    <OptimizedInput className={`flex-1 border-none focus:ring-0 p-0 text-sm font-medium ${sub.completed ? 'line-through text-gray-300' : 'text-gray-700'}`} value={sub.title} onChange={(val: string) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, title: val } : s))} />
                                                    <button onClick={() => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.filter(s => s.id !== sub.id))} className="text-gray-200 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                                                </div>
                                            ))}
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
                                    <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                                        <RichTextEditor
                                            key={splitViewNoteId}
                                            content={localOpp.notes.find(n => n.id === splitViewNoteId)?.content || ''}
                                            onChange={(val) => updateNoteById(splitViewNoteId, 'content', val)}
                                            onAttach={() => setShowDocPicker({ type: 'note', id: splitViewNoteId })}
                                        />
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
                                        Commit Message for CURRENT work *
                                    </label>
                                    <input className="w-full border-gray-200 rounded-lg text-sm" autoFocus placeholder={versionToRestore ? "e.g. Work before restoring V2" : "e.g. Initial Estimation"} value={newVersionData.commitMessage} onChange={e => setNewVersionData({ ...newVersionData, commitMessage: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">SR / Branch (Optional)</label>
                                    <input className="w-full border-gray-200 rounded-lg text-sm font-mono" placeholder={localOpp.srId || "SR-1"} value={newVersionData.srId} onChange={e => setNewVersionData({ ...newVersionData, srId: e.target.value })} />
                                    <p className="text-[10px] text-gray-400 mt-1">Leave empty to use current SR: {localOpp.srId}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Tags (comma separated)</label>
                                    <input className="w-full border-gray-200 rounded-lg text-sm" placeholder="e.g. Draft, Client Review" value={newVersionData.tags} onChange={e => setNewVersionData({ ...newVersionData, tags: e.target.value })} />
                                </div>
                                <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700">
                                    <strong>Normalization:</strong> Status will be reset to In Progress. Tasks will be pending. History is preserved.
                                </div>
                                <div className="flex gap-2 justify-end mt-2">
                                    <button onClick={() => { setShowCreateVersionModal(false); setVersionToRestore(null); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600">Cancel</button>
                                    <button onClick={handleCreateVersion} disabled={!newVersionData.commitMessage} className="px-4 py-2 bg-[#3DCD58] hover:bg-green-600 rounded-lg text-sm font-bold text-white disabled:opacity-50">
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
                            externalAreas: Array.from(new Set(ids.map(id => sowTeamMembers.find(m => m.id === id)?.area).filter((a): a is string => !!a))),
                            status: 'Missing Info',
                        })}
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
                        onApply={applySrPrefill}
                    />
                )
            }
            {
                showRevisionCarryoverModal && revisionCarryoverSource && (
                    <RevisionCarryoverModal
                        isOpen={showRevisionCarryoverModal}
                        onClose={() => { setShowRevisionCarryoverModal(false); setRevisionCarryoverSource(null); }}
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
