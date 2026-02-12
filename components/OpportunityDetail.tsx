
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
/* Added Subtask to imports */
import { Opportunity, ProcessStage, STAGE_COLORS, Task, Subtask, CommercialRow, TaskStatus, TASK_STATUS_COLORS, TaskOwner, ExternalArea, TaskPriority, PRIORITY_COLORS, HistoryEntry, PrdPresentation, STATUS_COLORS, OpportunityStatus, Question, MeetingNote, Commercial, QuickLinks, KPIs, KPIArea, InlineTask, DayType, AreaDayRecord, KPITimeline, DeepLink, OpportunityLabel, OpportunityVersion, QuickLinkItem, TimeLog, FloatingTab } from '../types';
import { ArrowLeft, ExternalLink, Save, Plus, Trash2, Copy, FileText, CheckSquare, DollarSign, ListChecks, Bold, Heading1, List as ListIcon, ListOrdered, User, Search, AlignLeft, AlignCenter, AlignRight, CheckCircle, Table, Type, Italic, Calendar as CalendarIcon, X, Clock, History as HistoryIcon, Presentation, FileDown, Briefcase, Zap, HelpCircle, GripVertical, Maximize2, Minimize2, MessageCircle, SplitSquareHorizontal, ChevronUp, ChevronDown, Highlighter, Link, Unlink, Eraser, FolderOpen, AlertCircle, Link as LinkIcon, Columns, LayoutGrid, Filter, RotateCcw, Lock, ArrowUpDown, BarChart3, Target, CalendarDays, Timer, ChevronLeft, ChevronRight, Edit3, Tag, GitBranch, GitCommit, GitPullRequest, Database, MoreHorizontal, Minus, Layout, Pin } from 'lucide-react';
import { OpportunityFolderTab } from '../features/opportunity-folder/OpportunityFolderTab';
import { LinkedDocsList } from '../features/doc-links/LinkedDocsList';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { saveMeta, listLinkedForNote, listLinkedForTask } from '../services/opportunityDocMetaStore';
import { CalendarView } from './CalendarView';
import { OpportunityExportImportButtons } from '../features/opportunity-export/OpportunityExportImportButtons';
import { NoteTemplate, SimpleMultiSelect } from './SettingsModal';
import { countBusinessDays, countCalendarDays } from '../services/dateUtils';
import { useTimer } from '../contexts/TimerContext';
import { Play, Pause } from 'lucide-react';
import { CopyTasksModal } from './CopyTasksModal';

const getTodayStr = () => new Date().toLocaleDateString('en-CA');

// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

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
    deepLink?: DeepLink;
    globalLabels?: OpportunityLabel[];
    onMinimize?: (tab: FloatingTab) => void;
    isSubView?: boolean;
}

export interface RichTextEditorHandle {
    highlightSelection: (id: string, text: string) => void;
    removeMark: (id: string) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, { content: string, onChange: (val: string) => void, onSelection?: () => void, onLinkClick?: (id: string) => void, onAttach?: () => void }>(
    ({ content, onChange, onSelection, onLinkClick, onAttach }, ref) => {
        const editorRef = useRef<HTMLDivElement>(null);
        const isInternalUpdate = useRef(false);

        useImperativeHandle(ref, () => ({
            highlightSelection: (id: string, text: string) => {
                // Bug fix: Partial selection question linking
                // insertHTML should correctly wrap whatever is in the current selection range with the span.
                // If text is provided but doesn't match selection, we prioritize valid selection wrapping.
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    const span = document.createElement('span');
                    span.className = 'question-highlight';
                    span.setAttribute('data-question-id', id);
                    span.textContent = range.toString() || text; // Use actual selection text if available to preserve partial match

                    range.deleteContents();
                    range.insertNode(span);

                    // Cleanup
                    sel.removeAllRanges();
                } else {
                    // Fallback if no selection (unlikely if triggered from context)
                    const html = `<span class="question-highlight" data-question-id="${id}">${text}</span>`;
                    document.execCommand('insertHTML', false, html);
                }

                if (editorRef.current) {
                    onChange(editorRef.current.innerHTML);
                }
            },
            removeMark: (id: string) => {
                if (editorRef.current) {
                    const span = editorRef.current.querySelector(`span[data-question-id="${id}"]`);
                    if (span) {
                        const parent = span.parentNode;
                        while (span.firstChild) {
                            parent?.insertBefore(span.firstChild, span);
                        }
                        parent?.removeChild(span);
                        onChange(editorRef.current.innerHTML);
                    }
                }
            }
        }));

        useEffect(() => {
            if (editorRef.current) {
                const currentHTML = editorRef.current.innerHTML;
                if (content !== currentHTML && !isInternalUpdate.current) {
                    editorRef.current.innerHTML = content || '';
                }
                isInternalUpdate.current = false;
            }
        }, [content]);

        const exec = (command: string, value: string | undefined = undefined) => {
            if (editorRef.current) editorRef.current.focus();
            document.execCommand(command, false, value);
            if (editorRef.current) {
                isInternalUpdate.current = true;
                onChange(editorRef.current.innerHTML);
            }
        };

        const insertHtml = (html: string) => {
            exec('insertHTML', html);
        };

        const highlightColor = (color: string) => {
            exec('hiliteColor', color);
        };

        const addLink = () => {
            const url = window.prompt('Enter URL:');
            if (url) {
                if (editorRef.current) editorRef.current.focus();
                exec('createLink', url);
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
            }
        };

        const handleClick = (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.dataset.questionId && onLinkClick) {
                onLinkClick(target.dataset.questionId);
            }
            if (target.tagName === 'A') {
                const href = (target as HTMLAnchorElement).getAttribute('href');
                if (href) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                }
            }
        };

        const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
            isInternalUpdate.current = true;
            onChange(e.currentTarget.innerHTML);
        };

        return (
            <div className="flex flex-col h-full relative">
                <div className="flex items-center gap-1 border-b border-gray-200 p-2 bg-gray-50 overflow-x-auto shrink-0 select-none">
                    <select
                        onChange={(e) => exec('fontName', e.target.value)}
                        className="p-1 px-2 pr-6 text-[10px] bg-white border border-gray-200 rounded text-gray-700 h-7 focus:ring-0 focus:outline-none cursor-pointer appearance-none bg-no-repeat bg-[right_0.25rem_center] bg-[length:1em_1em]"
                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0/0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")' }}
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
                            // exec('fontSize') uses 1-7, so we'll uses styles for precise sizes
                            const selection = window.getSelection()?.toString();
                            if (selection) {
                                insertHtml(`<span style="font-size: ${e.target.value}px">${selection}</span>`);
                            }
                        }}
                        className="p-1 px-2 pr-6 text-[10px] bg-white border border-gray-200 rounded text-gray-700 h-7 focus:ring-0 focus:outline-none cursor-pointer appearance-none bg-no-repeat bg-[right_0.25rem_center] bg-[length:1em_1em]"
                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0/0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")' }}
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
                    <button onClick={() => exec('removeFormat')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Clear Formatting (Plain Text)"><Eraser className="w-4 h-4" /></button>
                    <button onClick={() => {
                        exec('removeFormat'); // Native cleanup
                        exec('formatBlock', 'DIV'); // Reset headings to normal div/p
                        exec('bold'); exec('italic'); exec('underline'); // Toggle off if on (or harmless redundant)

                        // Custom cleanup for question spans in selection
                        const sel = window.getSelection();
                        if (sel && sel.rangeCount > 0) {
                            const range = sel.getRangeAt(0);
                            const fragment = range.cloneContents();
                            const spans = fragment.querySelectorAll('span.question-highlight');
                            // If selection contains our custom marks, we need to loop and unwrap them in the live DOM
                            // This is complex with Ranges, but exec Command 'removeFormat' often misses custom spans with classes.
                            // Simple approach: exec 'removeFormat' usually strips attributes, but let's be sure.

                            // Iterate over all spans with our class in the editor and if they intersect selection, unwrap them.
                            if (editorRef.current) {
                                const allMarks = editorRef.current.querySelectorAll('span.question-highlight');
                                allMarks.forEach(span => {
                                    if (sel.containsNode(span, true)) {
                                        const parent = span.parentNode;
                                        while (span.firstChild) parent?.insertBefore(span.firstChild, span);
                                        parent?.removeChild(span);
                                    }
                                });
                                onChange(editorRef.current.innerHTML);
                            }
                        }
                    }} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Clear Formatting (Styles & Marks)"><Eraser className="w-4 h-4" /></button>

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onClick={() => exec('justifyLeft')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Align Left"><AlignLeft className="w-4 h-4" /></button>
                    <button onClick={() => exec('justifyCenter')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Align Center"><AlignCenter className="w-4 h-4" /></button>
                    <button onClick={() => exec('justifyRight')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Align Right"><AlignRight className="w-4 h-4" /></button>

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onClick={addLink} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Insert Link"><Link className="w-4 h-4" /></button>
                    <button onClick={() => exec('unlink')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Remove Link"><Unlink className="w-4 h-4" /></button>

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <div className="flex items-center gap-0.5">
                        <button onClick={() => {
                            const tableHtml = `<table style="width:100%; border-collapse: collapse; border: 1px solid #ccc;" border="1"><tbody><tr><td style="border: 1px solid #ccc; padding: 8px;"></td><td style="border: 1px solid #ccc; padding: 8px;"></td></tr><tr><td style="border: 1px solid #ccc; padding: 8px;"></td><td style="border: 1px solid #ccc; padding: 8px;"></td></tr></tbody></table><p><br></p>`;
                            insertHtml(tableHtml);
                        }} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Insert Table"><Table className="w-4 h-4" /></button>
                        <button onClick={() => {
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                let node = selection.anchorNode;
                                while (node && node !== editorRef.current) {
                                    if (node instanceof HTMLElement && (node.tagName === 'TABLE' || (node as any).closest?.('table'))) {
                                        const table = node.tagName === 'TABLE' ? (node as HTMLTableElement) : (node as any).closest('table');
                                        const newRow = table.insertRow();
                                        const colCount = table.rows[0].cells.length;
                                        for (let i = 0; i < colCount; i++) {
                                            const cell = newRow.insertCell();
                                            cell.style.border = '1px solid #ccc';
                                            cell.style.padding = '8px';
                                        }
                                        if (editorRef.current) onChange(editorRef.current.innerHTML);
                                        return;
                                    }
                                    node = node.parentNode;
                                }
                            }
                        }} className="px-1 hover:bg-gray-200 rounded text-[9px] font-bold text-gray-500 h-7" title="Add Row">+Row</button>
                        <button onClick={() => {
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                let node = selection.anchorNode;
                                while (node && node !== editorRef.current) {
                                    if (node instanceof HTMLElement && (node.tagName === 'TABLE' || (node as any).closest?.('table'))) {
                                        const table = node.tagName === 'TABLE' ? (node as HTMLTableElement) : (node as any).closest('table');
                                        for (let i = 0; i < table.rows.length; i++) {
                                            const cell = table.rows[i].insertCell();
                                            cell.style.border = '1px solid #ccc';
                                            cell.style.padding = '8px';
                                        }
                                        if (editorRef.current) onChange(editorRef.current.innerHTML);
                                        return;
                                    }
                                    node = node.parentNode;
                                }
                            }
                        }} className="px-1 hover:bg-gray-200 rounded text-[9px] font-bold text-gray-500 h-7" title="Add Column">+Col</button>

                        <div className="w-px h-4 bg-gray-300 mx-1"></div>

                        <button onClick={() => {
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                let node = selection.anchorNode;
                                while (node && node !== editorRef.current) {
                                    if (node instanceof HTMLElement && ((node as any).tagName === 'TR' || (node as any).closest?.('tr'))) {
                                        const row = (node as any).tagName === 'TR' ? (node as HTMLTableRowElement) : (node as any).closest('tr');
                                        if (row && row.parentNode) {
                                            row.parentNode.removeChild(row);
                                            if (editorRef.current) onChange(editorRef.current.innerHTML);
                                        }
                                        return;
                                    }
                                    node = node.parentNode;
                                }
                            }
                        }} className="px-1 hover:bg-gray-200 rounded text-[9px] font-bold text-red-500 h-7" title="Delete Row">-Row</button>

                        <button onClick={() => {
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                let node = selection.anchorNode;
                                while (node && node !== editorRef.current) {
                                    // Find cell td/th
                                    if (node instanceof HTMLElement && ((node as any).tagName === 'TD' || (node as any).tagName === 'TH' || (node as any).closest?.('td') || (node as any).closest?.('th'))) {
                                        const cell = (node as any).tagName === 'TD' || (node as any).tagName === 'TH' ? (node as HTMLTableCellElement) : ((node as any).closest('td') || (node as any).closest('th'));
                                        const row = cell.parentNode as HTMLTableRowElement;
                                        const table = row.parentNode?.parentNode as HTMLTableElement || row.parentNode as HTMLTableElement; // tbody or table

                                        if (cell && row && table) {
                                            const cellIndex = cell.cellIndex;
                                            // Handle case where table might have a tbody
                                            const finalTable = table.tagName === 'TABLE' ? table : (table as any).closest('table');

                                            if (finalTable) {
                                                for (let i = 0; i < finalTable.rows.length; i++) {
                                                    if (finalTable.rows[i].cells.length > cellIndex) {
                                                        finalTable.rows[i].deleteCell(cellIndex);
                                                    }
                                                }
                                                if (editorRef.current) onChange(editorRef.current.innerHTML);
                                            }
                                        }
                                        return;
                                    }
                                    node = node.parentNode;
                                }
                            }
                        }} className="px-1 hover:bg-gray-200 rounded text-[9px] font-bold text-red-500 h-7" title="Delete Column">-Col</button>
                    </div>

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onClick={onAttach} className="p-1.5 hover:bg-gray-200 rounded text-[#3DCD58] flex items-center gap-1" title="Attach Doc"><LinkIcon className="w-4 h-4" /> <span className="text-[10px] font-bold uppercase">Attach</span></button>
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
                    <button onClick={() => exec('indent')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Indent"><ChevronRight className="w-4 h-4" /></button>
                    <button onClick={() => exec('outdent')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Outdent"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => insertHtml('<input type="checkbox"> ')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Checkbox"><CheckCircle className="w-4 h-4" /></button>
                    <button onClick={() => insertHtml('<hr>')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Divider">_</button>
                </div>
                <div
                    ref={editorRef}
                    className="flex-1 p-6 overflow-y-auto focus:outline-none text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none min-h-0 editor-content bg-white"
                    contentEditable
                    onInput={handleInput}
                    onMouseUp={() => {
                        if (onSelection) onSelection();
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            let node = selection.anchorNode;
                            while (node && node !== editorRef.current) {
                                if (node instanceof HTMLElement && node.dataset.questionId) {
                                    onLinkClick?.(node.dataset.questionId);
                                    break;
                                }
                                node = node.parentNode;
                            }
                        }
                    }}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    suppressContentEditableWarning={true}
                    style={{ listStylePosition: 'inside' }}
                />
                <style>{`
                .editor-content ul { list-style-type: disc; margin-left: 1.5em; }
                .editor-content ol { list-style-type: decimal; margin-left: 1.5em; }
                .editor-content a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
                .question-highlight { border-bottom: 2px solid #3DCD58; background-color: rgba(61, 205, 88, 0.1); cursor: pointer; font-weight: 500; transition: background-color 0.2s; }
                .question-highlight { border-bottom: 2px solid #3DCD58; background-color: rgba(61, 205, 88, 0.1); cursor: pointer; font-weight: 500; transition: background-color 0.2s; }
                .question-highlight:hover { background-color: rgba(61, 205, 88, 0.4); }
                .editor-content table { border-collapse: collapse; width: 100%; margin: 1em 0; border: 1px solid #ccc; }
                .editor-content td { border: 1px solid #ccc; padding: 8px; min-width: 50px; }
                .editor-content h1 { font-size: 1.5em; font-weight: bold; margin-top: 0.5em; margin-bottom: 0.25em; }
            `}</style>
            </div >
        );
    });

const MultiSelect = ({ options, selected, onChange, placeholder }: { options: string[], selected: string[], onChange: (val: string[]) => void, placeholder: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 flex justify-between items-center text-gray-600 shadow-sm hover:bg-gray-50 min-w-[140px]">
                <span className="truncate">{selected.length ? `${selected.length} selected` : placeholder}</span>
                <ChevronDown className="w-3 h-3" />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full right-0 w-48 mt-1 bg-white border border-gray-200 shadow-xl z-[200] max-h-64 overflow-y-auto rounded-xl p-1 animate-in fade-in slide-in-from-top-2 duration-200">
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

    const dayEntries = history.filter(h => h.date.split('T')[0] === date);

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
                        History Events — {date}
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
                            const dayHistory = history.filter(h => h.date.split('T')[0] === date);

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
                                    const dayHistory = history.filter(h => h.date.split('T')[0] === d);
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
                                                                    <input
                                                                        type="number"
                                                                        className="w-7 text-[10px] text-center border-none bg-transparent focus:ring-0 font-black p-0 h-4 text-blue-700"
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

const OpportunityDetail: React.FC<Props> = ({ opportunity, opportunities, onBack, onUpdate, onDelete, onSelectOpp, noteTemplates = [], holidays = [], trackedAreas = [], deepLink = undefined, globalLabels = [], onMinimize, isSubView }) => {
    const { timerState, startTimer, pauseTimer } = useTimer();
    const [activeTab, setActiveTab] = useState<'overview' | 'commercial' | 'notes' | 'tasks' | 'questions' | 'history' | 'presentation' | 'folder' | 'kpi'>(deepLink?.tab as any || 'overview');
    const [editingAreaCalendar, setEditingAreaCalendar] = useState<string | null>(null); // Area ID
    const [showFullCalendar, setShowFullCalendar] = useState(false);
    const [showAddAreaModal, setShowAddAreaModal] = useState(false);
    const [localOpp, setLocalOpp] = useState<Opportunity>(opportunity);

    const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
    const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);

    useEffect(() => {
        if (deepLink?.tab) {
            setActiveTab(deepLink.tab as any);
        }
    }, [deepLink?.tab]);

    useEffect(() => {
        if (deepLink?.taskId) {
            setHighlightTaskId(deepLink.taskId);
            // Scroll to task if in list or board view
            setTimeout(() => {
                const el = document.getElementById(`task-${deepLink.taskId}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);

            // Clear highlight after 3 seconds
            setTimeout(() => setHighlightTaskId(null), 3000);
        }
    }, [deepLink?.taskId, activeTab]);
    const [showVersionMenu, setShowVersionMenu] = useState(false);
    const [showMoreActionsMenu, setShowMoreActionsMenu] = useState(false);
    const [showCreateVersionModal, setShowCreateVersionModal] = useState(false);
    const [newVersionData, setNewVersionData] = useState({ commitMessage: '', tags: '', srId: '' });
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [diffBaseId, setDiffBaseId] = useState<string | null>(null);
    const [diffCompareId, setDiffCompareId] = useState<string | null>(null);
    const [showCopyTasksModal, setShowCopyTasksModal] = useState(false);

    const handleVersionSwitch = (vId: string | null) => {
        if (vId === viewingVersionId && vId !== null) {
            handleVersionSwitch(null); // Toggle off
            return;
        }

        if (vId) {
            // Load Snapshot
            const ver = localOpp.versions?.find(v => v.id === vId);
            if (ver) {
                // Merge snapshot with current containers (versions/history) to keep UI functional
                const snapshotWithContainers = {
                    ...ver.snapshot,
                    versions: localOpp.versions,
                    history: localOpp.history,
                    srId: ver.srId
                } as Opportunity;
                setLocalOpp(snapshotWithContainers);
                setViewingVersionId(vId);
            }
        } else {
            // Restore Live
            // We revert to props.opportunity to discard working copy changes
            // But we must ensure versions are up to date if we just created one.
            // onUpdate called by createVersion should have updated props.
            setLocalOpp(opportunity);
            setViewingVersionId(null);
        }
    };
    const [searchTerm, setSearchTerm] = useState('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const noteEditorRef = useRef<RichTextEditorHandle>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [isNoteFullScreen, setIsNoteFullScreen] = useState(false);
    const [textSelection, setTextSelection] = useState<string | null>(null);
    const [showQuestionsSplit, setShowQuestionsSplit] = useState(false);
    const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<{ task: Task } | null>(null);
    const [taskViewMode, setTaskViewMode] = useState<'list' | 'calendar'>('list');
    const [taskFilter, setTaskFilter] = useState('');
    const filterKey = `opportunityTasksFilters:${opportunity.id}`;
    const [taskStatusFilters, setTaskStatusFilters] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(filterKey);
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [highlightedQuestionId, setHighlightedQuestionId] = useState<string | null>(null);
    const [showDocPicker, setShowDocPicker] = useState<{ type: 'task' | 'note'; id: string } | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const [showNotePickerForTask, setShowNotePickerForTask] = useState<string | null>(null);
    const [noteSearch, setNoteSearch] = useState('');
    const [selectedNotesToLink, setSelectedNotesToLink] = useState<string[]>([]);

    const [splitViewNoteId, setSplitViewNoteId] = useState<string | null>(null);
    const [taskSort, setTaskSort] = useState<'none' | 'dueDate' | 'order'>('order');
    const [folderNavTarget, setFolderNavTarget] = useState<string | null>(null);
    const [showLabelMenu, setShowLabelMenu] = useState(false);

    useEffect(() => {
        // Only sync from props if ID changed (navigation) or versions changed (external update/restore)
        // This prevents overwriting local state while typing Title/ID due to parent re-renders.
        if (opportunity.id !== localOpp.id || (opportunity.versions?.length !== localOpp.versions?.length)) {
            setLocalOpp(opportunity);
        }

        if (scrollContainerRef.current) scrollContainerRef.current.scrollTo(0, 0);

        // Lazy KPI Migration / Initialization
        // We run this against the *latest* opportunity data available (localOpp if we didn't sync, or opportunity if we did)
        // Actually, better to run this only if needed.
        // If we didn't sync, we assume localOpp is fine.
        // But if activeTab changed to KPI, we might need to initialize KPIs on the current localOpp.

        if (activeTab === 'kpi') {
            const currentOpp = (opportunity.id !== localOpp.id) ? opportunity : localOpp; // Use latest source
            const baseTimeline = currentOpp.kpis?.timeline || { receivedAt: currentOpp.dates.requested || getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null };
            const baseKpis: KPIs = {
                languageSkill: currentOpp.kpis?.languageSkill ?? 0,
                technicalUnderstanding: currentOpp.kpis?.technicalUnderstanding ?? 0,
                dealProbability: currentOpp.kpis?.dealProbability ?? 0,
                effortContribution: currentOpp.kpis?.effortContribution ?? 0,
                sold: currentOpp.kpis?.sold ?? null,
                proposalAmountUSD: currentOpp.kpis?.proposalAmountUSD ?? currentOpp.commercial.cqaOfficialSellPrice ?? 0,
                timeline: baseTimeline,
                execution: currentOpp.kpis?.execution || { myWorkDays: 0, waitingOnOthersDays: 0 },
                areasInvolved: currentOpp.kpis?.areasInvolved || []
            };

            // Ensure Tendering area exists
            if (!baseKpis.areasInvolved.some(a => a.area === 'Tendering')) {
                baseKpis.areasInvolved.push({ id: crypto.randomUUID(), area: 'Tendering', daysSpent: 0, waitingDays: 0, calendar: {} });
            }

            // We must update via onUpdate to persist migration
            const updated = { ...currentOpp, kpis: baseKpis };
            setLocalOpp(updated);
            onUpdate(updated, currentOpp.id);
        }
    }, [opportunity.id, opportunity.versions?.length, activeTab]);

    useEffect(() => {
        if (deepLink) {
            if (deepLink.tab) setActiveTab(deepLink.tab as any);

            if (deepLink.tab === 'notes' && deepLink.noteId) {
                setSelectedNoteId(deepLink.noteId);
            }

            if (deepLink.tab === 'tasks' && deepLink.taskId) {
                // Task highlighting and scrolling is handled by the other useEffect
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
    }, [deepLink]);

    const handleFieldChange = (field: keyof Opportunity, value: any) => {
        const updated = { ...localOpp, [field]: value, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        // Guard: Only persist to DB if NOT viewing a version (Working Copy mode)
        if (!viewingVersionId) {
            onUpdate(updated, opportunity.id);
        }
    };

    const updateOfficialSellPrice = (value: number) => {
        const newCommercial = { ...localOpp.commercial, cqaOfficialSellPrice: value };
        const newKpis = { ...localOpp.kpis, proposalAmountUSD: value };
        const updated = { ...localOpp, commercial: newCommercial, kpis: newKpis, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        onUpdate(updated, opportunity.id);
    };

    const updateKpiField = (path: string, value: any) => {
        const newKpis = JSON.parse(JSON.stringify(localOpp.kpis));

        if (path.includes('.')) {
            const parts = path.split('.');
            // @ts-ignore
            newKpis[parts[0]][parts[1]] = value;
        } else {
            // @ts-ignore
            newKpis[path] = value;
        }

        let updatedOpp = { ...localOpp, kpis: newKpis, lastUpdated: new Date().toISOString() };

        // Sync Logic for Proposal Amount -> CQA Official Sell
        if (path === 'proposalAmountUSD') {
            updatedOpp.commercial = {
                ...updatedOpp.commercial,
                cqaOfficialSellPrice: Number(value)
            };
        }

        setLocalOpp(updatedOpp);
        onUpdate(updatedOpp, opportunity.id);
    };

    const filteredNotes = localOpp.notes.filter(n => {
        const term = searchTerm.toLowerCase();
        const plainContent = n.content.replace(/<[^>]*>/g, '').toLowerCase();
        return n.title.toLowerCase().includes(term) || plainContent.includes(term);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const filteredTasks = localOpp.tasks.filter(t => {
        const matchesText = t.title.toLowerCase().includes(taskFilter.toLowerCase()) ||
            t.description.toLowerCase().includes(taskFilter.toLowerCase()) ||
            (t.externalAreas && t.externalAreas.some(area => area.toLowerCase().includes(taskFilter.toLowerCase())));
        const matchesStatus = taskStatusFilters.length === 0 || taskStatusFilters.includes(t.status);
        return matchesText && matchesStatus;
    }).sort((a, b) => {
        if (taskSort === 'dueDate') {
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        // Always sort by order by default (smallest to largest)
        // If order is null/undefined, push to the end (999999)
        return (a.order || 999999) - (b.order || 999999);
    });

    const displayValue = (val: number) => val === 0 ? '' : val;
    const updateCommercialRow = (rowKey: 'swHw' | 'services' | 'resale', field: keyof CommercialRow, value: number) => {
        const currentRow = localOpp.commercial[rowKey];
        let newRow = { ...currentRow, [field]: value };
        if (field === 'cost' || field === 'margin') {
            if (newRow.margin < 100) newRow.sellPrice = Number((newRow.cost / (1 - (newRow.margin / 100))).toFixed(2));
        }
        if (field === 'sellPrice') {
            if (newRow.sellPrice !== 0) newRow.margin = Number(((1 - (newRow.cost / newRow.sellPrice)) * 100).toFixed(2));
            else newRow.margin = 0;
        }
        newRow.finalPrice = Number((newRow.sellPrice * (1 - (newRow.discount / 100))).toFixed(2));
        const updated = { ...localOpp, commercial: { ...localOpp.commercial, [rowKey]: newRow } };
        setLocalOpp(updated);
        onUpdate(updated);
    };
    const totals = ['swHw', 'services', 'resale'].reduce((acc, key) => {
        const row = localOpp.commercial[key as 'swHw'];
        acc.cost += row.cost; acc.sellPrice += row.sellPrice; acc.finalPrice += row.finalPrice;
        return acc;
    }, { cost: 0, sellPrice: 0, finalPrice: 0 });
    const totalMargin = totals.sellPrice ? ((1 - (totals.cost / totals.sellPrice)) * 100).toFixed(1) : '0';

    const addNote = (templateTitle?: string, content?: string) => {
        const newNote: MeetingNote = {
            id: crypto.randomUUID(),
            title: templateTitle ? `New ${templateTitle}` : 'New Note',
            date: getTodayStr(),
            type: 'General',
            attendees: '',
            content: content || '',
            inlineTasks: []
        };
        const updated = { ...localOpp, notes: [newNote, ...localOpp.notes] };
        setLocalOpp(updated); onUpdate(updated); setSelectedNoteId(newNote.id);
    };

    const deleteNote = (noteId: string) => {
        if (!window.confirm("Are you sure you want to delete this note?")) return;
        const updatedNotes = localOpp.notes.filter(n => n.id !== noteId);
        const updated = { ...localOpp, notes: updatedNotes };
        setLocalOpp(updated); onUpdate(updated);
        if (selectedNoteId === noteId) setSelectedNoteId(null);
    };
    const updateSelectedNote = (field: keyof MeetingNote, value: string) => {
        if (!selectedNoteId) return;
        const updatedNotes = localOpp.notes.map(n => n.id === selectedNoteId ? { ...n, [field]: value } : n);
        handleFieldChange('notes', updatedNotes);
    };
    const updateNoteById = (noteId: string, field: keyof MeetingNote, value: string) => {
        const updatedNotes = localOpp.notes.map(n => n.id === noteId ? { ...n, [field]: value } : n);
        handleFieldChange('notes', updatedNotes);
    }
    const handleSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) setTextSelection(selection.toString());
        else setTextSelection(null);
    };
    const handleLinkClick = (questionId: string) => {
        setShowQuestionsSplit(true); setHighlightedQuestionId(questionId);
    };
    const getLinkedTasksForNote = (noteId: string) => {
        return localOpp.tasks.filter(t => (t.linkedNoteIds || []).includes(noteId) || t.linkedNoteId === noteId);
    };

    const addQuestion = (sourceId: string, quote: string) => {
        const normalizedQuote = (quote || '').trim().replace(/\s+/g, ' ');
        const newId = crypto.randomUUID();
        if (noteEditorRef.current) noteEditorRef.current.highlightSelection(newId, normalizedQuote);
        const newQ: Question = {
            id: newId, sourceId, sourceType: 'note', quote: normalizedQuote, question: 'New Question...', answer: '', isResolved: false, createdAt: new Date().toISOString()
        };
        const updated = { ...localOpp, questions: [...(localOpp.questions || []), newQ] };
        setLocalOpp(updated); onUpdate(updated);
        setShowQuestionsSplit(true); setHighlightedQuestionId(newId); setTextSelection(null);
    };
    const updateQuestion = (qId: string, field: keyof Question, value: any) => {
        const updatedQs = localOpp.questions.map(q => q.id === qId ? { ...q, [field]: value } : q);
        handleFieldChange('questions', updatedQs);
    };

    const deleteQuestion = (qId: string) => {
        if (!window.confirm("Are you sure you want to delete this question?")) return;

        // Remove from data
        const updatedQs = localOpp.questions.filter(q => q.id !== qId);

        // Remove visual mark in editor if active note matches
        const question = localOpp.questions.find(q => q.id === qId);
        if (question && question.sourceId === selectedNoteId && noteEditorRef.current) {
            noteEditorRef.current.removeMark(qId);
        }

        handleFieldChange('questions', updatedQs);
        if (highlightedQuestionId === qId) setHighlightedQuestionId(null);
    };

    const addHistoryEntry = (date?: string, content?: string) => {
        console.debug("[History] addHistoryEntry start", { date, content });
        const newEntry: HistoryEntry = {
            id: crypto.randomUUID(),
            date: date || getTodayStr(),
            content: content || 'New event...'
        };
        const updatedHistory = [...(localOpp.history || []), newEntry].sort((a, b) => b.date.localeCompare(a.date));
        console.debug("[History] state update and calling onUpdate", { entriesCount: updatedHistory.length });
        handleFieldChange('history', updatedHistory);
    };
    const updateHistoryEntry = (id: string, field: keyof HistoryEntry, value: string) => {
        const updatedHistory = (localOpp.history || []).map(h => h.id === id ? { ...h, [field]: value } : h);
        if (field === 'date') updatedHistory.sort((a, b) => b.date.localeCompare(a.date));
        handleFieldChange('history', updatedHistory);
    };
    const totalElapsedCalendarDays = (localOpp.kpis?.timeline.deliveredAt
        ? countCalendarDays(localOpp.kpis.timeline.receivedAt, localOpp.kpis.timeline.deliveredAt)
        : countCalendarDays(localOpp.kpis.timeline.receivedAt, getTodayStr())) + 1;

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
        // Sort descending: Newest (most recent/cercana) to Oldest (más lejana)
        const sortedHistory = [...(localOpp.history || [])].sort((a, b) => b.date.localeCompare(a.date));
        const text = sortedHistory.map(h => {
            const parts = h.date.split('-');
            const dateStr = parts.length === 3 ? `${parts[1]}/${parts[2]}` : h.date;
            return `${dateStr}: ${h.content}`;
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
                    if ((r.hours || 0) >= 1) worked++;
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

    // Validation value for Business Days elapsed (workable time)
    const totalElapsedBusinessDays = (localOpp.kpis?.timeline.deliveredAt
        ? countBusinessDays(localOpp.kpis.timeline.receivedAt, localOpp.kpis.timeline.deliveredAt, holidays)
        : countBusinessDays(localOpp.kpis.timeline.receivedAt, getTodayStr(), holidays)) + 1;

    const totalTrackedDays = (localOpp.kpis?.execution.myWorkDays || 0) +
        (localOpp.kpis?.execution.waitingOnOthersDays || 0) +
        (localOpp.kpis?.areasInvolved || []).reduce((sum, a) => sum + (a.daysSpent || 0), 0);

    const addTask = () => {
        const newTask: Task = {
            id: crypto.randomUUID(), title: 'New Task', description: '', status: 'Pending', priority: 'Medium', owner: 'Me',
            externalAreas: [], responsible: '', dueDate: getTodayStr(), stageContext: localOpp.stage, subtasks: [], linkedNoteIds: [],
            order: null, dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false
        };
        handleFieldChange('tasks', [...localOpp.tasks, newTask]);
        setSelectedTaskForEdit({ task: newTask });
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

    const updateTaskInModal = (field: keyof Task, value: any) => {
        if (!selectedTaskForEdit) return;
        if (field === 'status' && !validateTaskCompletion(selectedTaskForEdit.task.id, value)) {
            return;
        }

        // Optimistically update selected task in modal
        const updatedTaskData = { ...selectedTaskForEdit.task, [field]: value };
        setSelectedTaskForEdit({ task: updatedTaskData });

        let updatedTasks = localOpp.tasks.map(t => t.id === selectedTaskForEdit.task.id ? updatedTaskData : t);
        let updatedNotes = localOpp.notes;

        // Sync to inline tasks if status or title changed
        if (field === 'status' || field === 'title') {
            updatedNotes = localOpp.notes.map(note => {
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

        // Batch update
        const newOpp = { ...localOpp, tasks: updatedTasks, notes: updatedNotes, lastUpdated: new Date().toISOString() };
        setLocalOpp(newOpp);
        onUpdate(newOpp);
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
     */
    const renderNoteContentToPdf = async (doc: any, html: string, currentY: number, pageWidth: number): Promise<number> => {
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
            text = text.replace(/<li>/g, '\n• ').replace(/<\/li>/g, '');
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

    const handleExportPDF = async () => {
        const doc = new jsPDF();
        const s = localOpp;
        const pageWidth = doc.internal.pageSize.getWidth();

        doc.setFillColor(61, 205, 88);
        doc.rect(0, 0, pageWidth, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text("Tender Documentation", 14, 16);

        let yPos = 40;
        doc.setTextColor(0);
        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        const splitTitle = doc.splitTextToSize(s.title, pageWidth - 28);
        doc.text(splitTitle, 14, yPos);
        yPos += (splitTitle.length * 10) + 10;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        const headerText = `Customer: ${s.customer} | ID: ${s.id} | QLK: ${s.qlk || '-'} | Rev: ${s.revision}`;
        const splitHeader = doc.splitTextToSize(headerText, pageWidth - 28);
        doc.text(splitHeader, 14, yPos);
        yPos += (splitHeader.length * 7) + 3;

        autoTable(doc, {
            startY: yPos,
            head: [['Parameter', 'Value']],
            body: [
                ['Requested', s.dates.requested || '-'],
                ['Expected', s.dates.expected || '-'],
                ['Assigned', s.dates.assigned || '-'],
                ['Stage', s.stage],
                ['Status', s.statusLabel]
            ],
            theme: 'striped',
            headStyles: { fillColor: [61, 205, 88] }
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;

        // Quick Links Section in PDF
        // Quick Links Section in PDF (Updated for Array support)
        const qLinks = Array.isArray(s.links) ? s.links : (s.links ? Object.entries(s.links).map(([k, v]) => ({ id: k, type: 'link', label: k, url: v } as QuickLinkItem)) : []);

        if (qLinks.length > 0) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text("Quick Links", 14, yPos);
            yPos += 6;
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');

            qLinks.forEach((link: QuickLinkItem) => {
                if (link.type === 'heading') {
                    yPos += 2;
                    doc.setFont(undefined, 'bold');
                    doc.text(link.label.toUpperCase(), 14, yPos);
                    doc.setFont(undefined, 'normal');
                    yPos += 5;
                } else if (link.type === 'separator') {
                    yPos += 2;
                    doc.setDrawColor(200, 200, 200);
                    doc.line(14, yPos, pageWidth - 14, yPos);
                    yPos += 5;
                } else {
                    const linkText = `${link.label}: ${link.url || ''}`;
                    const splitLink = doc.splitTextToSize(linkText, pageWidth - 28);
                    doc.text(splitLink, 14, yPos);
                    if (link.url) {
                        doc.link(14, yPos - 3, pageWidth - 28, splitLink.length * 4, { url: link.url });
                    }
                    yPos += (splitLink.length * 5) + 2;
                }
            });
            yPos += 10;
        }

        if (s.commercial) {
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Commercial Summary", 14, yPos);
            yPos += 8;
            autoTable(doc, {
                startY: yPos,
                head: [['Item', 'Cost', 'Margin %', 'Sell Price', 'Discount %', 'Final Price']],
                body: [
                    ['Hardware/Software', s.commercial.swHw.cost, s.commercial.swHw.margin, s.commercial.swHw.sellPrice, s.commercial.swHw.discount, s.commercial.swHw.finalPrice],
                    ['Services', s.commercial.services.cost, s.commercial.services.margin, s.commercial.services.sellPrice, s.commercial.services.discount, s.commercial.services.finalPrice],
                    ['Resale', s.commercial.resale.cost, s.commercial.resale.margin, s.commercial.resale.sellPrice, s.commercial.resale.discount, s.commercial.resale.finalPrice]
                ],
                theme: 'grid',
                headStyles: { fillColor: [61, 205, 88] }
            });
            yPos = (doc as any).lastAutoTable.finalY + 12;

            // Enhanced Sell Price - Highlighted and Larger
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Official reference margin: ${s.commercial.cqaOfficialMargin}%`, 14, yPos);
            yPos += 10;
            doc.setFontSize(16); // Larger size
            doc.setFont(undefined, 'bold');
            doc.setTextColor(61, 205, 88); // Bold green
            doc.text(`CQA TOTAL SELL PRICE: $${s.commercial.cqaOfficialSellPrice.toLocaleString()}`, 14, yPos);
            doc.setTextColor(0);
            yPos += 15;
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

        if (s.questions && s.questions.length > 0) {
            if (yPos > 250) { doc.addPage(); yPos = 20; }
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Questions & Answers", 14, yPos);
            yPos += 8;
            autoTable(doc, {
                startY: yPos,
                head: [['Question', 'Answer', 'Resolved']],
                body: s.questions.map(q => [q.question, q.answer, q.isResolved ? 'Yes' : 'No']),
                theme: 'striped',
                headStyles: { fillColor: [61, 205, 88] },
                columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 } }
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
                yPos = await renderNoteContentToPdf(doc, note.content, yPos, pageWidth);
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
        const text = `
                                                                                        ${s.revision} report for the ${s.id}
                                                                                        SR Link: ${s.links.srLink || ''}
                                                                                        Description of the request: ${s.description || ''}
                                                                                        Executive summary: ${s.presentation.executiveSummary || ''}

                                                                                        Information
                                                                                        CQA Sell price: ${s.commercial.cqaOfficialSellPrice ? `$${s.commercial.cqaOfficialSellPrice.toLocaleString()}` : ''}
                                                                                        GM CCO: ${s.commercial.cqaOfficialMargin ? `${s.commercial.cqaOfficialMargin}%` : ''}
                                                                                        Notes / Discounts Logic: ${s.commercial.discountsAndNotes || ''}
                                                                                        CQA 2.0 Link: ${s.links.cqaLink || ''}
                                                                                        `.trim();
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
        setActiveTab('folder');
    };

    const updateTaskDetails = (taskId: string, updates: Partial<Task>) => {
        const updatedTasks = localOpp.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t);
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

                if (changes.hasOwnProperty('isDone')) {
                    const newStatus = updatedTask.isDone ? 'Done' : (linkedTask.status === 'Done' ? 'Pending' : linkedTask.status);
                    if (newStatus !== linkedTask.status) taskUpdates.status = newStatus;
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

        // Batch Update
        const newOpp = { ...localOpp, notes: updatedNotes, tasks: updatedTasks, lastUpdated: new Date().toISOString() };
        setLocalOpp(newOpp);
        onUpdate(newOpp);
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

    // New: Handle opening Split View from inline task
    const handleOpenSplitView = (task: Task, noteId: string) => {
        setSelectedTaskForEdit({ task });
        setSplitViewNoteId(noteId);
    };

    const currentNote = localOpp.notes.find(n => n.id === selectedNoteId);

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

    const handleExportNotePDF = async (note: MeetingNote) => {
        if (!note) return;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const opportunityName = localOpp.title.replace(/[/\\?%*:|"<>]/g, '-');
        const noteTitle = note.title.replace(/[/\\?%*:|"<>]/g, '-');
        const fileName = `Note_${opportunityName}_${noteTitle}.pdf`;

        doc.setFillColor(61, 205, 88);
        doc.rect(0, 0, pageWidth, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text("Meeting Note Output", 14, 16);

        let yPos = 40;
        doc.setTextColor(0);
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        const titleLines = doc.splitTextToSize(note.title, pageWidth - 28);
        doc.text(titleLines, 14, yPos);
        yPos += titleLines.length * 8 + 5;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100);
        doc.text(`${localOpp.id} - ${localOpp.title}`, 14, yPos);
        yPos += 5;
        doc.text(`Date: ${note.date || 'N/A'}`, 14, yPos);
        yPos += 15;

        doc.setTextColor(0);

        // Render note content with centralized helper (text, images, tables)
        yPos = await renderNoteContentToPdf(doc, note.content, yPos, pageWidth);

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
        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;
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
        setActiveTab('history');
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
        const sorted = [...(localOpp.versions || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        sorted.forEach(v => {
            const key = v.srId || localOpp.srId || 'SR-1';
            if (!groups[key]) groups[key] = [];
            groups[key].push(v);
        });
        return groups;
    }, [localOpp.versions, localOpp.srId]);

    const activeVersion = viewingVersionId ? localOpp.versions?.find(v => v.id === viewingVersionId) : null;
    const isWorkingCopy = !!activeVersion;

    const handleCreateVersion = () => {
        if (!newVersionData.commitMessage) return alert("Commit message required");

        // Clone and Normalize
        const snapshot = JSON.parse(JSON.stringify(localOpp));
        snapshot.statusLabel = 'In Progress';
        snapshot.dates = { requested: '', expected: '', assigned: '' };
        snapshot.tasks = snapshot.tasks.map((t: Task) => ({ ...t, status: 'Pending', completedAt: undefined }));
        delete snapshot.history;
        delete snapshot.versions; // No recursion

        const newVer: OpportunityVersion = {
            id: crypto.randomUUID(),
            opportunityId: localOpp.id,
            srId: newVersionData.srId || localOpp.srId || 'SR-1',
            commitMessage: newVersionData.commitMessage,
            tags: newVersionData.tags.split(',').map(t => t.trim()).filter(Boolean),
            createdAt: new Date().toISOString(),
            createdBy: 'Engineer',
            source: 'live',
            snapshot: snapshot as any
        };

        handleFieldChange('versions', [newVer, ...(localOpp.versions || [])]);
        setShowCreateVersionModal(false);
        setNewVersionData({ commitMessage: '', tags: '', srId: '' });
    };

    const handleRestorePartial = (ver: OpportunityVersion, type: 'tasks' | 'notes' | 'kpis') => {
        if (!confirm(`Overwrite current ${type} with version ${ver.commitMessage}?`)) return;

        // Auto-backup
        const backupVer: OpportunityVersion = {
            id: crypto.randomUUID(),
            opportunityId: localOpp.id,
            srId: localOpp.srId || 'SR-1',
            commitMessage: `Auto-backup before restore ${type}`,
            tags: ['auto-backup'],
            createdAt: new Date().toISOString(),
            createdBy: 'System',
            source: 'live',
            snapshot: JSON.parse(JSON.stringify(localOpp))
        };
        // Clean backup snapshot to avoid deep recursion if we were less careful, but here it's fine.
        delete (backupVer.snapshot as any).history;
        delete (backupVer.snapshot as any).versions;

        let content = ver.snapshot[type as keyof Opportunity];
        if (type === 'tasks') {
            // Reset status when restoring tasks
            // @ts-ignore
            content = (content as Task[]).map(t => ({ ...t, status: 'Pending' }));
        }

        const newVersions = [backupVer, ...(localOpp.versions || [])];
        // We do this in one go? handleFieldChange might be async or batch. 
        // We need to update versions AND the field.
        // Assuming handleFieldChange handles shallow merge or we do it manually.
        // handleFieldChange usually updates one field.
        // We'll update state manually for multiple fields if needed, or call twice.
        // But updating 'versions' prop is safer to do first? Or last?

        // We'll assume onUpdate merges.
        const updated = { ...localOpp, versions: newVersions, [type]: content };
        onUpdate(updated);
        alert(`Restored ${type} and created backup.`);
    };

    return (
        <div className="flex flex-col h-full bg-white relative overflow-hidden">

            {/* Main Content Area */}
            <div className="flex flex-col shrink-0 bg-white relative z-20">
                <div className="flex-none flex flex-col bg-white z-20 shrink-0">
                    {isWorkingCopy && !isSubView && (
                        <div className="bg-amber-100 text-amber-800 px-4 py-1 text-xs font-bold flex justify-between items-center border-b border-amber-200">
                            <span className="flex items-center gap-2"><Lock className="w-3 h-3" /> READ ONLY - Viewing Version: {activeVersion?.commitMessage}</span>
                            <button onClick={() => handleVersionSwitch(null)} className="underline hover:text-amber-900">Exit Version</button>
                        </div>
                    )}

                    <div className="p-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
                        <div className="w-full px-4">
                            <div className="flex flex-col md:flex-row justify-between items-start mb-1 gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button onClick={onBack} className="p-1 hover:bg-gray-200 rounded-lg transition-colors mr-1" title={isSubView ? "Cerrar" : "Regresar"}>
                                        {isSubView ? <X className="w-5 h-5 text-gray-500" /> : <ArrowLeft className="w-5 h-5 text-gray-500" />}
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (isSubView && deepLink?.taskId) {
                                                const task = localOpp.tasks.find(t => t.id === deepLink.taskId);
                                                if (task) {
                                                    onMinimize?.({
                                                        id: task.id,
                                                        type: 'task',
                                                        title: `TSK: ${task.title.slice(0, 10)}`,
                                                        color: '#3B82F6',
                                                        data: { oppId: opportunity.id, deepLink: { tab: 'tasks', taskId: task.id } }
                                                    });
                                                    return;
                                                }
                                            }
                                            if (isSubView && deepLink?.noteId) {
                                                const note = localOpp.notes.find(n => n.id === deepLink.noteId);
                                                if (note) {
                                                    onMinimize?.({
                                                        id: note.id,
                                                        type: 'note',
                                                        title: `NOT: ${note.title.slice(0, 10)}`,
                                                        color: '#F59E0B',
                                                        data: { oppId: opportunity.id, deepLink: { tab: 'notes', noteId: note.id } }
                                                    });
                                                    return;
                                                }
                                            }
                                            onMinimize?.({
                                                id: `${opportunity.id}-${activeTab}`,
                                                type: 'opportunity',
                                                title: `${activeTab.toUpperCase().slice(0, 4)}: ${opportunity.customer.slice(0, 10)}`,
                                                color: '#34d399',
                                                data: { oppId: opportunity.id, deepLink: { tab: activeTab } }
                                            });
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                                        title="Minimizar"
                                    >
                                        <Minus className="w-5 h-5 text-gray-400" />
                                    </button>
                                    {isSubView ? (
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{deepLink?.tab === 'tasks' ? 'Sub Vista de Tarea' : 'Sub Vista de Nota'}</span>
                                            <span className="text-xs font-bold text-gray-600 truncate max-w-[200px]">{opportunity.customer} - {opportunity.title}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-sm">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">OP</span>
                                                <input className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-16 bg-transparent" value={localOpp.id.replace(/^OP-/, '')} onChange={(e) => handleFieldChange('id', `OP-${e.target.value}`)} />
                                            </div>
                                            <div className="flex items-center gap-2 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-sm">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">QLK</span>
                                                <input className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-24 bg-transparent" value={localOpp.qlk} onChange={(e) => handleFieldChange('qlk', e.target.value)} placeholder="000000" />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">REV</span>
                                            <input className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-8 bg-transparent" value={localOpp.revision} onChange={(e) => handleFieldChange('revision', e.target.value)} placeholder="R0" />
                                        </>
                                    )}
                                </div>
                                {!isSubView && (
                                    <div className="flex items-center gap-2 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-sm">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SR</span>
                                        <input className="text-xs font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-24 bg-transparent" value={localOpp.srId || ''} onChange={(e) => handleFieldChange('srId', e.target.value)} placeholder="SR-..." />
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                                <div className="scale-90 origin-right flex items-center gap-2">
                                    {!isSubView && (
                                        <>
                                            <OpportunityExportImportButtons
                                                opportunity={localOpp}
                                                onImport={(importedOpp) => onUpdate(importedOpp)}
                                            />
                                            <div className="w-px h-6 bg-gray-200 mx-1"></div>

                                            {/* Version Manager Discrete UI */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowVersionMenu(!showVersionMenu)}
                                                    className={`flex items-center gap-2 px-2 py-1 border rounded-lg text-xs font-medium transition-all shadow-sm ${viewingVersionId ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-gray-200 text-gray-700 hover:text-blue-600'}`}
                                                >
                                                    <HistoryIcon className="w-3.5 h-3.5" />
                                                    Versions
                                                    {(localOpp.versions || []).length > 0 && <span className="bg-gray-100 text-gray-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-1">{(localOpp.versions || []).length}</span>}
                                                </button>

                                                {showVersionMenu && (
                                                    <>
                                                        <div className="fixed inset-0 z-30" onClick={() => setShowVersionMenu(false)} />
                                                        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-40 flex flex-col max-h-[500px] animate-in fade-in zoom-in-95 duration-200">
                                                            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                                                                <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider">Version History</h4>
                                                                <button onClick={() => { setShowCreateVersionModal(true); setShowVersionMenu(false); }} className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-100 font-bold flex items-center gap-1">
                                                                    <Plus className="w-3 h-3" /> New
                                                                </button>
                                                            </div>
                                                            <div className="overflow-y-auto p-2 space-y-4 flex-1">
                                                                {(localOpp.versions || []).length === 0 && (
                                                                    <div className="text-center py-8 text-gray-400 text-xs italic">No versions created yet.</div>
                                                                )}
                                                                {/* Fail-safe rendering of groups */}
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
                                                                                    onClick={() => { handleVersionSwitch(v.id); setShowVersionMenu(false); }}
                                                                                    className={`group relative p-3 rounded-lg border text-left cursor-pointer transition-all ${viewingVersionId === v.id ? 'bg-amber-50 border-amber-300 shadow-sm' : 'bg-white border-gray-100 hover:border-blue-300 hover:shadow-md'}`}
                                                                                >
                                                                                    <div className="flex justify-between items-start mb-1">
                                                                                        <span className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight">{v.commitMessage}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-2">
                                                                                        <span className="font-mono bg-gray-100 px-1 rounded">{v.id.slice(0, 6)}</span>
                                                                                        <span>•</span>
                                                                                        <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                                                                                    </div>
                                                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                                                        {v.tags.map(t => <span key={t} className="text-[8px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-bold">{t}</span>)}
                                                                                    </div>

                                                                                    {/* Discrete Actions */}
                                                                                    <div className="flex gap-2 pt-2 border-t border-gray-50 mt-1">
                                                                                        <button onClick={(e) => { e.stopPropagation(); setShowVersionMenu(false); handleRestorePartial(v, 'tasks'); }} className="text-[10px] font-bold text-gray-500 hover:text-blue-600 bg-gray-50 px-2 py-1 rounded hover:bg-blue-50 transition-colors">Tasks</button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setShowVersionMenu(false); handleRestorePartial(v, 'notes'); }} className="text-[10px] font-bold text-gray-500 hover:text-blue-600 bg-gray-50 px-2 py-1 rounded hover:bg-blue-50 transition-colors">Notes</button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setShowVersionMenu(false); setDiffBaseId('live'); setDiffCompareId(v.id); setShowDiffModal(true); }} className="text-[10px] font-bold text-gray-500 hover:text-blue-600 bg-gray-50 px-2 py-1 rounded hover:bg-blue-50 transition-colors ml-auto flex items-center gap-1">
                                                                                            <GitPullRequest className="w-3 h-3" /> Diff
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

                                            <div className="w-px h-6 bg-gray-200 mx-1"></div>
                                            <button onClick={handleExportPDF} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:text-[#3DCD58] transition-all shadow-sm"><FileDown className="w-3.5 h-3.5" /> Export PDF</button>
                                            <button onClick={generateExecutiveSummary} className="flex items-center gap-2 px-2 py-1 bg-[#3DCD58]/10 text-[#3DCD58] rounded-lg text-xs font-medium hover:bg-[#3DCD58]/20 transition-all shadow-sm"><Copy className="w-3.5 h-3.5" /> Copy Summary</button>
                                            <div className="w-px h-6 bg-gray-200 mx-1"></div>
                                            <button onClick={() => { if (window.confirm('Are you sure you want to delete this opportunity?')) onDelete(); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap md:flex-nowrap justify-between items-center gap-4 my-1 px-1">
                                <div className="flex-1 w-full md:w-auto min-w-[200px]">
                                    <input value={localOpp.title} onChange={(e) => handleFieldChange('title', e.target.value)} className="text-xl font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full placeholder-gray-300 mb-0 leading-tight" placeholder="Title" />
                                    <input value={localOpp.customer} onChange={(e) => handleFieldChange('customer', e.target.value)} className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 w-full mt-0 leading-tight placeholder-gray-400" placeholder="Customer" />

                                    <div className="flex flex-wrap items-center gap-2 mt-1">
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
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <select value={localOpp.statusLabel} onChange={(e) => handleFieldChange('statusLabel', e.target.value)} className={`text-[10px] font-bold px-2 py-1 rounded border outline-none w-28 uppercase tracking-wider cursor-pointer ${STATUS_COLORS[localOpp.statusLabel]}`}>{Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                    <select value={localOpp.stage} onChange={(e) => handleFieldChange('stage', e.target.value)} className={`text-[10px] font-semibold px-2 py-1 rounded-full border-none outline-none w-32 text-center cursor-pointer ${STAGE_COLORS[localOpp.stage]}`}>{Object.keys(STAGE_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                    <select value={localOpp.priority || 'Medium'} onChange={(e) => handleFieldChange('priority', e.target.value)} className={`text-[10px] font-bold px-2 py-1 rounded-full border outline-none w-24 text-center cursor-pointer ${PRIORITY_COLORS[localOpp.priority as TaskPriority]}`}>{Object.keys(PRIORITY_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {!isSubView && (
                    <div className="flex border-b border-gray-200 px-3 overflow-x-auto shrink-0 bg-white sticky top-0 z-10">
                        <div className="w-full px-4 flex">
                            <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}>Overview</button>
                            <button onClick={() => setActiveTab('kpi')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'kpi' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><BarChart3 className="w-4 h-4" /> KPI</button>
                            <button onClick={() => setActiveTab('presentation')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'presentation' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><Presentation className="w-4 h-4" /> Presentation</button>
                            <button onClick={() => setActiveTab('history')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'history' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><HistoryIcon className="w-4 h-4" /> History</button>
                            <button onClick={() => setActiveTab('tasks')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'tasks' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><ListChecks className="w-4 h-4" /> Tasks</button>
                            <button onClick={() => setActiveTab('commercial')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'commercial' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><DollarSign className="w-4 h-4" /> Commercial</button>
                            <button onClick={() => setActiveTab('notes')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'notes' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><FileText className="w-4 h-4" /> Notes</button>
                            <button onClick={() => setActiveTab('folder')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'folder' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><FolderOpen className="w-4 h-4" /> Opportunity Folder</button>
                            <button onClick={() => setActiveTab('questions')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'questions' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><HelpCircle className="w-4 h-4" /> Questions</button>
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
                                                <div className="p-4 border-b border-gray-100 flex flex-col gap-2 bg-gray-50 shrink-0">
                                                    <div className="flex justify-between items-center">
                                                        <input value={currentNote.title} onChange={(e) => updateSelectedNote('title', e.target.value)} className="font-black text-lg bg-transparent border-none focus:ring-0 text-gray-800 flex-1 px-0" placeholder="Note Title" />
                                                        {textSelection && (
                                                            <button
                                                                className="text-xs bg-[#3DCD58] text-white px-3 py-1.5 rounded-lg font-bold shadow-md shadow-[#3DCD58]/20 animate-bounce flex items-center gap-1"
                                                                onClick={() => addQuestion(currentNote.id, textSelection)}
                                                            >
                                                                <HelpCircle className="w-3 h-3" /> Ask Question
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <RichTextEditor
                                                        key={currentNote.id}
                                                        ref={noteEditorRef}
                                                        content={currentNote.content}
                                                        onChange={(val) => updateSelectedNote('content', val)}
                                                        onSelection={handleSelection}
                                                        onLinkClick={handleLinkClick}
                                                        onAttach={() => setShowDocPicker({ type: 'note', id: currentNote.id })}
                                                    />
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
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selectedTaskForEdit.task.id}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={copyTaskSummary} className="flex items-center gap-1 text-xs font-bold bg-[#3DCD58]/10 text-[#3DCD58] px-3 py-1.5 rounded-lg hover:bg-[#3DCD58]/20 transition-colors">
                                                <Copy className="w-3 h-3" /> Summary
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-8 flex-1">
                                        <div className="flex items-start gap-4">
                                            <div className="flex-1 space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Task Title</label>
                                                <input className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0" value={selectedTaskForEdit.task.title} onChange={(e) => updateTaskInModal('title', e.target.value)} />
                                            </div>
                                            <div className="w-24 space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Order</label>
                                                <input type="number" className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0 text-center" value={selectedTaskForEdit.task.order || ''} onChange={(e) => updateTaskInModal('order', e.target.value ? parseInt(e.target.value) : null)} placeholder="#" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Current Status</label>
                                                <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.status} onChange={(e) => updateTaskInModal('status', e.target.value as any)}>{Object.keys(TASK_STATUS_COLORS).map(s => <option key={s}>{s}</option>)}</select>
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
                                            <div className="flex gap-4 items-center">
                                                <select className="border-gray-200 rounded-lg text-sm bg-white font-bold p-2" value={selectedTaskForEdit.task.owner} onChange={(e) => updateTaskInModal('owner', e.target.value)} >
                                                    <option value="Me">Me</option>
                                                    <option value="External Area">External Area</option>
                                                </select>
                                                {selectedTaskForEdit.task.owner === 'External Area' && (
                                                    <div className="flex gap-2 flex-1 flex-col">
                                                        <MultiSelect placeholder="Select Areas" options={['Delivery', 'SCM', 'Sales', 'Legal', 'Finance', 'TSC', 'Other']} selected={selectedTaskForEdit.task.externalAreas || []} onChange={(vals) => updateTaskInModal('externalAreas', vals)} />
                                                        <input placeholder="Person Name" className="border-gray-200 rounded-lg text-sm flex-1 bg-white p-2" value={selectedTaskForEdit.task.responsible || ''} onChange={(e) => updateTaskInModal('responsible', e.target.value)} />
                                                    </div>
                                                )}
                                            </div>
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
                                                        <Lock className="w-3 h-3 text-gray-400" /> Block Done until dependencies are done
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Detailed Description</label>
                                            <textarea className="w-full border-gray-100 bg-gray-50 rounded-2xl text-sm min-h-[120px] p-4 shadow-inner focus:bg-white transition-all focus:ring-0" value={selectedTaskForEdit.task.description} onChange={(e) => updateTaskInModal('description', e.target.value)} />
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Documents</label>
                                                <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => setShowDocPicker({ type: 'task', id: selectedTaskForEdit.task.id })}>+ Link Doc</button>
                                            </div>
                                            <div className="p-4 bg-gray-50 rounded-2xl">
                                                <LinkedDocsList key={refreshKey} opportunityId={opportunity.id} taskId={selectedTaskForEdit.task.id} onNavigateToFile={navigateToFile} />
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
                                                                <button onClick={() => setSplitViewNoteId(note.id)} className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded flex items-center gap-1">
                                                                    <Columns className="w-3 h-3" /> Split
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
                                                        <input className={`flex-1 text-sm bg-transparent border-none focus:ring-0 p-0 ${sub.completed ? 'text-gray-400 line-through' : 'text-gray-700 font-bold'}`} value={sub.title} onChange={(e) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, title: e.target.value } : s))} />
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Description of the Request</label>
                                    <textarea value={localOpp.description} onChange={(e) => handleFieldChange('description', e.target.value)} className="w-full text-sm border-gray-200 rounded-lg min-h-[150px]" placeholder="Detailed description..." />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-bold text-gray-500 uppercase">Requested</label><input type="date" value={localOpp.dates.requested} onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, requested: e.target.value })} className="w-full text-sm border-gray-200 rounded-lg" /></div>
                                        <div><label className="block text-xs font-bold text-gray-500 uppercase">Expected</label><input type="date" value={localOpp.dates.expected} onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, expected: e.target.value })} className="w-full text-sm border-gray-200 rounded-lg" /></div>
                                    </div>
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-sm font-semibold">Quick Links</h3>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => {
                                                    const label = prompt("Heading Text:");
                                                    if (label) {
                                                        const current = Array.isArray(localOpp.links) ? localOpp.links : Object.entries(localOpp.links || {}).map(([k, v]) => ({
                                                            id: k,
                                                            type: 'link',
                                                            label: typeof v === 'object' && v !== null ? (v as any).label || (v as any).title || String(k) : String(k),
                                                            url: typeof v === 'object' && v !== null ? (v as any).url || '' : (typeof v === 'string' ? v : '')
                                                        } as QuickLinkItem));
                                                        handleFieldChange('links', [...current, { id: crypto.randomUUID(), type: 'heading', label }]);
                                                    }
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Heading"
                                            >
                                                <Heading1 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const current = Array.isArray(localOpp.links) ? localOpp.links : Object.entries(localOpp.links || {}).map(([k, v]) => ({
                                                        id: k,
                                                        type: 'link',
                                                        label: typeof v === 'object' && v !== null ? (v as any).label || (v as any).title || String(k) : String(k),
                                                        url: typeof v === 'object' && v !== null ? (v as any).url || '' : (typeof v === 'string' ? v : '')
                                                    } as QuickLinkItem));
                                                    handleFieldChange('links', [...current, { id: crypto.randomUUID(), type: 'separator', label: '---' }]);
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Separator"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const views = ['overview', 'kpi', 'presentation', 'history', 'tasks', 'commercial', 'notes', 'folder', 'questions'];
                                                    const view = prompt(`Enter view name (${views.join(', ')}):`);
                                                    if (view && views.includes(view.toLowerCase())) {
                                                        const current = Array.isArray(localOpp.links) ? localOpp.links : Object.entries(localOpp.links || {}).map(([k, v]) => ({
                                                            id: k,
                                                            type: 'link',
                                                            label: typeof v === 'object' && v !== null ? (v as any).label || (v as any).title || String(k) : String(k),
                                                            url: typeof v === 'object' && v !== null ? (v as any).url || '' : (typeof v === 'string' ? v : '')
                                                        } as QuickLinkItem));
                                                        handleFieldChange('links', [...current, { id: crypto.randomUUID(), type: 'view', label: `View: ${view.toUpperCase()}`, url: view.toLowerCase() }]);
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
                                                        const current = Array.isArray(localOpp.links) ? localOpp.links : Object.entries(localOpp.links || {}).map(([k, v]) => ({
                                                            id: k,
                                                            type: 'link',
                                                            label: typeof v === 'object' && v !== null ? (v as any).label || (v as any).title || String(k) : String(k),
                                                            url: typeof v === 'object' && v !== null ? (v as any).url || '' : (typeof v === 'string' ? v : '')
                                                        } as QuickLinkItem));
                                                        handleFieldChange('links', [...current, { id: crypto.randomUUID(), type: 'link', label, url: url || '' }]);
                                                    }
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Link"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                        {(Array.isArray(localOpp.links) ? localOpp.links : Object.entries(localOpp.links || {}).map(([k, v]) => ({
                                            id: k,
                                            type: 'link',
                                            // Robust label/url extraction to avoid [object Object]
                                            label: typeof v === 'object' && v !== null ? (v as any).label || (v as any).title || String(k) : String(k),
                                            url: typeof v === 'object' && v !== null ? (v as any).url || '' : (typeof v === 'string' ? v : '')
                                        } as QuickLinkItem))).map((item, idx, arr) => (
                                            <div key={item.id} className="flex gap-2 items-center group bg-gray-50 p-1.5 rounded hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all">
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => {
                                                        if (idx === 0) return;
                                                        const newLinks = [...arr];
                                                        [newLinks[idx], newLinks[idx - 1]] = [newLinks[idx - 1], newLinks[idx]];
                                                        handleFieldChange('links', newLinks);
                                                    }} disabled={idx === 0} className="hover:text-blue-500 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                                                    <button onClick={() => {
                                                        if (idx === arr.length - 1) return;
                                                        const newLinks = [...arr];
                                                        [newLinks[idx], newLinks[idx + 1]] = [newLinks[idx + 1], newLinks[idx]];
                                                        handleFieldChange('links', newLinks);
                                                    }} disabled={idx === arr.length - 1} className="hover:text-blue-500 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                                                </div>

                                                {item.type === 'heading' && (
                                                    <input
                                                        value={item.label}
                                                        onChange={(e) => {
                                                            const newLinks = [...arr];
                                                            newLinks[idx] = { ...item, label: e.target.value };
                                                            handleFieldChange('links', newLinks);
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
                                                        <input
                                                            value={item.label}
                                                            onChange={(e) => {
                                                                const newLinks = [...arr];
                                                                newLinks[idx] = { ...item, label: e.target.value };
                                                                handleFieldChange('links', newLinks);
                                                            }}
                                                            className="w-24 text-[10px] text-gray-400 font-bold uppercase truncate bg-transparent border-none focus:ring-0 p-0"
                                                        />
                                                        <input
                                                            value={item.url}
                                                            onChange={(e) => {
                                                                const newLinks = [...arr];
                                                                newLinks[idx] = { ...item, url: e.target.value };
                                                                handleFieldChange('links', newLinks);
                                                            }}
                                                            className="flex-1 text-sm border-gray-200 rounded p-1 h-7"
                                                            placeholder="https://..."
                                                        />
                                                        {item.url && <a href={item.url} target="_blank" className="p-1 bg-white rounded shadow-sm hover:text-blue-500 border border-gray-200"><ExternalLink className="w-3 h-3" /></a>}
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
                                                            handleFieldChange('links', newLinks);
                                                        }
                                                    }}
                                                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        {(Array.isArray(localOpp.links) ? localOpp.links : Object.keys(localOpp.links)).length === 0 && (
                                            <div className="text-center py-4 text-gray-300 text-xs italic">No quick links yet.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'kpi' && localOpp.kpis && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Performance Ratings */}
                                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                        <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                            <Target className="w-5 h-5 text-[#3DCD58]" />
                                            <h3 className="font-bold text-gray-800">Performance Ratings</h3>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase mb-1">
                                                    <span>Language Skill</span>
                                                    <span>{localOpp.kpis.languageSkill || 0}%</span>
                                                </div>
                                                <input type="range" min="0" max="100" value={localOpp.kpis.languageSkill || 0} onChange={(e) => updateKpiField('languageSkill', parseInt(e.target.value))} className="w-full accent-[#3DCD58]" />
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase mb-1">
                                                    <span>Technical Understanding</span>
                                                    <span>{localOpp.kpis.technicalUnderstanding || 0}%</span>
                                                </div>
                                                <input type="range" min="0" max="100" value={localOpp.kpis.technicalUnderstanding || 0} onChange={(e) => updateKpiField('technicalUnderstanding', parseInt(e.target.value))} className="w-full accent-[#3DCD58]" />
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase mb-1">
                                                    <span>Deal Probability</span>
                                                    <span>{localOpp.kpis.dealProbability || 0}%</span>
                                                </div>
                                                <input type="range" min="0" max="100" value={localOpp.kpis.dealProbability || 0} onChange={(e) => updateKpiField('dealProbability', parseInt(e.target.value))} className="w-full accent-[#3DCD58]" />
                                            </div>
                                            <div className="pt-2 border-t border-gray-50">
                                                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase mb-1 items-center">
                                                    <div className="flex items-center gap-1.5" title="Represents the combined effort invested by me and all involved areas to make the proposal successful.">
                                                        <span>Effort Contribution</span>
                                                        <div className="w-3.5 h-3.5 rounded-full bg-gray-100 flex items-center justify-center text-[8px] cursor-help border border-gray-200">?</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {localOpp.kpis.effortContribution === null || localOpp.kpis.effortContribution === 0 ? (
                                                            <button
                                                                onClick={() => updateKpiField('effortContribution', suggestedEffortScore)}
                                                                className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                                                            >
                                                                Suggest: {suggestedEffortScore}%
                                                            </button>
                                                        ) : null}
                                                        <span className="text-blue-600 font-black">{localOpp.kpis.effortContribution || 0}%</span>
                                                    </div>
                                                </div>
                                                <input type="range" min="0" max="100" value={localOpp.kpis.effortContribution || 0} onChange={(e) => updateKpiField('effortContribution', parseInt(e.target.value))} className="w-full accent-blue-500" />
                                                <p className="text-[9px] text-gray-400 italic mt-1 leading-tight">Combined scoring based on My Work ({myWorkStats.days}d) and Team Work ({totalAreaDays}d).</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sold?</label>
                                                <div className="flex gap-2">
                                                    <button onClick={() => updateKpiField('sold', true)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${localOpp.kpis.sold === true ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500'}`}>Yes</button>
                                                    <button onClick={() => updateKpiField('sold', false)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${localOpp.kpis.sold === false ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-500'}`}>No</button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proposal Amount (USD)</label>
                                                <input type="number" value={localOpp.kpis.proposalAmountUSD || ''} onChange={(e) => updateKpiField('proposalAmountUSD', parseFloat(e.target.value))} className="w-full border-gray-200 rounded-lg text-sm" placeholder="0.00" />
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
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Received At</label>
                                                <input type="date" value={localOpp.kpis.timeline?.receivedAt || ''} onChange={(e) => updateKpiField('timeline.receivedAt', e.target.value)} className="w-full border-gray-200 rounded text-sm mt-1" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Delivered / Tendered At</label>
                                                <input type="date" value={localOpp.kpis.timeline?.deliveredAt || ''} onChange={(e) => updateKpiField('timeline.deliveredAt', e.target.value)} className="w-full border-gray-200 rounded text-sm mt-1" />
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
                                                <input type="date" value={localOpp.kpis.timeline.cancelledAt || ''} onChange={(e) => updateKpiField('timeline.cancelledAt', e.target.value)} className="border-gray-200 rounded text-xs p-1 h-6 shrink-0" />
                                            </div>
                                            <textarea value={localOpp.kpis.timeline.cancelledReason || ''} onChange={(e) => updateKpiField('timeline.cancelledReason', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm h-16 resize-none" placeholder="Reason for cancellation..." />
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

                        {activeTab === 'presentation' && (
                            <div className="space-y-8 h-full flex flex-col">
                                {/* Section 1: Core Presentation Fields */}
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Executive Summary</label>
                                        <textarea value={localOpp.presentation.executiveSummary} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, executiveSummary: e.target.value })} className="w-full border-gray-200 rounded-lg h-32 text-sm" placeholder="Summarize for leadership..." />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase">Issues / Blockers</label>
                                            <textarea value={localOpp.presentation.issues} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, issues: e.target.value })} className="w-full border-gray-200 rounded-lg h-32 text-sm" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase">Key Requirements</label>
                                            <textarea value={localOpp.presentation.requirements} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, requirements: e.target.value })} className="w-full border-gray-200 rounded-lg h-32 text-sm" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">KPIs / Success Criteria</label>
                                        <textarea value={localOpp.presentation.kpis} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, kpis: e.target.value })} className="w-full border-gray-200 rounded-lg h-20 text-sm" />
                                    </div>
                                </div>

                                {/* Section 2: Proposal Analysis Wizard (Separate Card) */}
                                <div className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-5">
                                        <Zap className="w-24 h-24 text-gray-900" />
                                    </div>
                                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide flex items-center gap-2 relative z-10">
                                        <Zap className="w-4 h-4 text-amber-500" /> Proposal Analysis Hub
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                                        {/* Column 1: Context */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-[#3DCD58] font-bold text-xs uppercase tracking-wider border-b border-gray-200 pb-1">
                                                <span className="bg-[#3DCD58] text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px]">1</span> Context
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Trigger Event & Client Motivation</label>
                                                <textarea
                                                    className="w-full border-gray-200 rounded-lg text-xs p-2 h-20 focus:border-[#3DCD58] focus:ring-0"
                                                    placeholder="Why are they buying now?"
                                                    value={localOpp.presentation.proposalAnalysis?.trigger || ''}
                                                    onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, proposalAnalysis: { ...(localOpp.presentation.proposalAnalysis || { trigger: '', missingInfo: '', risks: '', competition: '', strategy: '', checklist: {} }), trigger: e.target.value } })}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Missing Info / Questions</label>
                                                <textarea
                                                    className="w-full border-gray-200 rounded-lg text-xs p-2 h-20 focus:border-[#3DCD58] focus:ring-0 bg-red-50/50"
                                                    placeholder="What don't we know yet?"
                                                    value={localOpp.presentation.proposalAnalysis?.missingInfo || ''}
                                                    onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, proposalAnalysis: { ...(localOpp.presentation.proposalAnalysis || { trigger: '', missingInfo: '', risks: '', competition: '', strategy: '', checklist: {} }), missingInfo: e.target.value } })}
                                                />
                                            </div>
                                        </div>

                                        {/* Column 2: Strategy */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-blue-500 font-bold text-xs uppercase tracking-wider border-b border-gray-200 pb-1">
                                                <span className="bg-blue-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px]">2</span> Strategy
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Key Risks</label>
                                                <textarea
                                                    className="w-full border-gray-200 rounded-lg text-xs p-2 h-20 focus:border-blue-500 focus:ring-0"
                                                    value={localOpp.presentation.proposalAnalysis?.risks || ''}
                                                    onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, proposalAnalysis: { ...(localOpp.presentation.proposalAnalysis || { trigger: '', missingInfo: '', risks: '', competition: '', strategy: '', checklist: {} }), risks: e.target.value } })}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Competition Analysis</label>
                                                <textarea
                                                    className="w-full border-gray-200 rounded-lg text-xs p-2 h-20 focus:border-blue-500 focus:ring-0"
                                                    placeholder="Who are we up against?"
                                                    value={localOpp.presentation.proposalAnalysis?.competition || ''}
                                                    onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, proposalAnalysis: { ...(localOpp.presentation.proposalAnalysis || { trigger: '', missingInfo: '', risks: '', competition: '', strategy: '', checklist: {} }), competition: e.target.value } })}
                                                />
                                            </div>
                                        </div>

                                        {/* Column 3: Action */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-purple-500 font-bold text-xs uppercase tracking-wider border-b border-gray-200 pb-1">
                                                <span className="bg-purple-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px]">3</span> Execution
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Our Strategy / Next Steps</label>
                                                <textarea
                                                    className="w-full border-gray-200 rounded-lg text-xs p-2 h-20 focus:border-purple-500 focus:ring-0"
                                                    placeholder="How do we win?"
                                                    value={localOpp.presentation.proposalAnalysis?.strategy || ''}
                                                    onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, proposalAnalysis: { ...(localOpp.presentation.proposalAnalysis || { trigger: '', missingInfo: '', risks: '', competition: '', strategy: '', checklist: {} }), strategy: e.target.value } })}
                                                />
                                            </div>
                                            <div className="bg-white rounded-lg border border-gray-100 p-3 shadow-inner">
                                                <label className="text-[9px] font-bold text-gray-400 uppercase mb-2 block">Readiness Checklist</label>
                                                <div className="space-y-2">
                                                    {['Client Needs Understood', 'Scope Defined', 'Commercials Approved', 'Risks Mitigated'].map(item => (
                                                        <label key={item} className="flex items-center gap-2 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded text-purple-500 focus:ring-purple-500 w-3 h-3"
                                                                checked={localOpp.presentation.proposalAnalysis?.checklist?.[item] || false}
                                                                onChange={(e) => {
                                                                    const current = localOpp.presentation.proposalAnalysis || { trigger: '', missingInfo: '', risks: '', competition: '', strategy: '', checklist: {} };
                                                                    const newChecklist = { ...current.checklist, [item]: e.target.checked };
                                                                    handleFieldChange('presentation', { ...localOpp.presentation, proposalAnalysis: { ...current, checklist: newChecklist } });
                                                                }}
                                                            />
                                                            <span className={`text-[10px] font-medium transition-colors ${localOpp.presentation.proposalAnalysis?.checklist?.[item] ? 'text-purple-700 line-through decoration-purple-300' : 'text-gray-600 group-hover:text-purple-600'}`}>{item}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'commercial' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {['swHw', 'services', 'resale'].map((key) => {
                                        const row = localOpp.commercial[key as 'swHw'];
                                        return (
                                            <div key={key} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-4">
                                                <h4 className="text-sm font-black text-gray-800 uppercase tracking-wide border-b border-gray-100 pb-2">{key === 'swHw' ? 'Hardware / Software' : key}</h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase">Cost</label><input type="number" value={displayValue(row.cost)} onChange={(e) => updateCommercialRow(key as any, 'cost', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono" /></div>
                                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase">Margin %</label><input type="number" value={displayValue(row.margin)} onChange={(e) => updateCommercialRow(key as any, 'margin', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono text-blue-600 font-bold" /></div>
                                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase">Sell Price</label><input type="number" value={displayValue(row.sellPrice)} onChange={(e) => updateCommercialRow(key as any, 'sellPrice', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono font-bold" /></div>
                                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase">Discount %</label><input type="number" value={displayValue(row.discount)} onChange={(e) => updateCommercialRow(key as any, 'discount', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono text-orange-600" /></div>
                                                </div>
                                                <div className="pt-2 border-t border-gray-100 mt-auto">
                                                    <div className="flex justify-between items-end">
                                                        <span className="text-xs font-medium text-gray-500">Final Price</span>
                                                        <span className="text-lg font-bold text-[#3DCD58]">${row.finalPrice.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Global Adjustments</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Risk</label><input type="number" value={displayValue(localOpp.commercial.risk)} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, risk: parseFloat(e.target.value) || 0 })} className="w-full border-gray-200 rounded text-sm mt-1" /></div>
                                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Contingency</label><input type="number" value={displayValue(localOpp.commercial.contingency)} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, contingency: parseFloat(e.target.value) || 0 })} className="w-full border-gray-200 rounded text-sm mt-1" /></div>
                                        </div>
                                        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Notes / Discounts Logic</label><textarea value={localOpp.commercial.discountsAndNotes} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, discountsAndNotes: e.target.value })} className="w-full border-gray-200 rounded text-sm mt-1 h-20" /></div>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Project Totals</h4>
                                            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">GM: {totalMargin}%</span>
                                        </div>
                                        {/* REMOVED TOTAL SELL PRICE DISPLAY HERE */}
                                        <div className="p-4 border border-gray-100 rounded-lg">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div><label className="text-[10px] font-bold text-gray-400 uppercase">CQA Official Sell</label><input type="number" value={displayValue(localOpp.commercial.cqaOfficialSellPrice)} onChange={(e) => updateOfficialSellPrice(parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm mt-1 font-bold" /></div>
                                                <div><label className="text-[10px] font-bold text-gray-400 uppercase">CQA Margin %</label><input type="number" value={displayValue(localOpp.commercial.cqaOfficialMargin)} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, cqaOfficialMargin: parseFloat(e.target.value) || 0 })} className="w-full border-gray-200 rounded text-sm mt-1" /></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800">Change Log / Events</h3>
                                    <div className="flex gap-2">
                                        <button onClick={copyHistoryToClipboard} className="text-xs font-bold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Copy for bFO</button>
                                        <button onClick={() => addHistoryEntry()} className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors">+ Add Entry</button>
                                    </div>
                                </div>
                                <div className="relative border-l-2 border-[#3DCD58]/20 ml-3 space-y-8 pl-6 py-2">
                                    {localOpp.history.map(entry => (
                                        <div key={entry.id} id={`history-entry-${entry.id}`} className="relative">
                                            <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-[#3DCD58] border-4 border-white shadow-sm"></div>
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                                <div className="flex justify-between items-center mb-2">
                                                    <input type="date" value={entry.date} onChange={(e) => updateHistoryEntry(entry.id, 'date', e.target.value)} className="text-xs font-bold text-[#3DCD58] border-none p-0 focus:ring-0" />
                                                    <button onClick={() => deleteHistoryEntry(entry.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                                <textarea value={entry.content} onChange={(e) => updateHistoryEntry(entry.id, 'content', e.target.value)} className="w-full text-sm text-gray-600 border-none p-0 focus:ring-0 resize-none bg-transparent" placeholder="Event description..." />
                                            </div>
                                        </div>
                                    ))}
                                    {localOpp.history.length === 0 && <p className="text-center text-gray-400 italic py-8">No history recorded yet.</p>}
                                </div>
                            </div>
                        )}

                        {activeTab === 'questions' && (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800">Q&A Tracker</h3>
                                </div>
                                <div className="space-y-4">
                                    {localOpp.questions.map(q => (
                                        <div key={q.id} className="p-4 border border-gray-200 rounded-xl hover:shadow-sm transition-shadow">
                                            <div className="flex justify-between mb-2">
                                                <span className="text-[10px] font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-500 uppercase">Source: {q.sourceType}</span>
                                                <button onClick={() => { if (window.confirm('Delete?')) handleFieldChange('questions', localOpp.questions.filter(qi => qi.id !== q.id)) }} className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                                            </div>
                                            {q.quote && <div className="text-xs text-gray-400 italic mb-2 border-l-2 border-gray-200 pl-2">"{q.quote}"</div>}
                                            <input className="w-full font-bold text-gray-800 border-none p-0 focus:ring-0 mb-2" value={q.question} onChange={(e) => updateQuestion(q.id, 'question', e.target.value)} />
                                            <textarea className="w-full text-sm text-gray-600 border-gray-100 bg-gray-50 rounded p-2" placeholder="Answer..." value={q.answer} onChange={(e) => updateQuestion(q.id, 'answer', e.target.value)} rows={2} />
                                        </div>
                                    ))}
                                    {localOpp.questions.length === 0 && <p className="text-center text-gray-400 italic py-8">No questions logged from notes or tasks.</p>}
                                </div>
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
                            <OpportunityFolderTab opportunityId={opportunity.id} opportunity={localOpp} onUpdate={onUpdate} initialFileKey={folderNavTarget || undefined} />
                        )}

                        {activeTab === 'notes' && (
                            <div className={`flex h-full gap-6 ${isNoteFullScreen ? 'fixed inset-0 z-50 bg-white p-6' : ''}`}>
                                {!isNoteFullScreen && (
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
                                            {/* Dynamic Note Template Buttons */}
                                            {noteTemplates.length > 0 ? (
                                                noteTemplates.map(tmpl => (
                                                    <button
                                                        key={tmpl.id}
                                                        onClick={() => addNote(tmpl.title, tmpl.content)}
                                                        className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold capitalize flex items-center justify-center gap-2 shadow-sm transition-all"
                                                    >
                                                        <Plus className="w-3 h-3" /> {tmpl.title}
                                                    </button>
                                                ))
                                            ) : (
                                                // Fallback if settings fail or empty
                                                ['Kick-off', 'Scope', 'General'].map(t => (
                                                    <button key={t} onClick={() => addNote(t)} className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold capitalize flex items-center justify-center gap-2 shadow-sm transition-all">
                                                        <Plus className="w-3 h-3" /> {t}
                                                    </button>
                                                ))
                                            )}
                                            <button onClick={() => addNote()} className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"><Zap className="w-3 h-3" /> Blank</button>
                                        </div>
                                        {filteredNotes.length === 0 && searchTerm && (
                                            <div className="text-center text-gray-400 text-xs py-4">No notes found matching "{searchTerm}"</div>
                                        )}
                                        {filteredNotes.map(note => (
                                            <div key={note.id} id={`note-item-${note.id}`} className={`p-3 rounded-lg border cursor-pointer relative group transition-all ${selectedNoteId === note.id ? 'bg-[#3DCD58]/10 border-[#3DCD58]/30 ring-1 ring-[#3DCD58]/20 shadow-md' : 'bg-white border-gray-200 hover:border-gray-300'}`} onClick={() => setSelectedNoteId(note.id)}>
                                                <div className="font-bold text-sm text-gray-900 truncate pr-6">{note.title}</div>
                                                <div className="text-[10px] font-mono text-gray-400 mt-1 uppercase">{note.date}</div>
                                                <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex-1 flex gap-4 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col shadow-sm">
                                    {currentNote ? (
                                        <>
                                            <div className="p-4 border-b border-gray-100 flex flex-col gap-2 bg-gray-50 shrink-0">
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
                                                    {textSelection && <button className="text-xs bg-[#3DCD58] text-white px-3 py-1.5 rounded-lg font-bold shadow-md shadow-[#3DCD58]/20 animate-bounce flex items-center gap-1" onClick={() => addQuestion(currentNote.id, textSelection)}><HelpCircle className="w-3 h-3" /> Ask Question</button>}
                                                    <button
                                                        onClick={() => setShowQuestionsSplit(!showQuestionsSplit)}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showQuestionsSplit ? 'bg-[#3DCD58]/10 border-[#3DCD58]/20 text-[#3DCD58]' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                                        title="Open Questions"
                                                    >
                                                        <SplitSquareHorizontal className="w-3 h-3" />
                                                        Open Questions
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            onMinimize?.({
                                                                id: currentNote.id,
                                                                type: 'note',
                                                                title: `NOT: ${currentNote.title.slice(0, 10)}`,
                                                                color: '#F59E0B',
                                                                data: { oppId: opportunity.id, deepLink: { tab: 'notes', noteId: currentNote.id } }
                                                            });
                                                            setSelectedNoteId(null);
                                                        }}
                                                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors mr-1"
                                                        title="Minimizar Nota"
                                                    >
                                                        <Minus className="w-4 h-4 text-gray-400" />
                                                    </button>
                                                    <button onClick={() => handleExportNotePDF(currentNote)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Download Note PDF"><FileDown className="w-4 h-4 text-gray-500" /></button>
                                                    <button onClick={() => setIsNoteFullScreen(!isNoteFullScreen)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">{isNoteFullScreen ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}</button>
                                                </div>
                                            </div>
                                            {/* Editor Container with Vertical Flex */}
                                            <div className="flex-1 flex flex-col min-h-0">
                                                <RichTextEditor
                                                    key={currentNote.id}
                                                    ref={noteEditorRef}
                                                    content={currentNote.content}
                                                    onChange={(val) => updateSelectedNote('content', val)}
                                                    onSelection={handleSelection}
                                                    onLinkClick={handleLinkClick}
                                                    onAttach={() => setShowDocPicker({ type: 'note', id: currentNote.id })}
                                                />

                                                {/* Tasks in this note section */}
                                                <div className="border-t border-gray-100 bg-gray-50 flex-shrink-0 flex flex-col max-h-[300px]">
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
                                                                    <input
                                                                        value={inlineTask.text}
                                                                        onChange={(e) => handleInlineTaskChange(currentNote.id, inlineTask.id, { text: e.target.value })}
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
                                                </div>
                                            </div>

                                            {/* Linked Items Container (Scrollable) */}
                                            <div className="px-6 pb-4 bg-white border-t border-gray-100 max-h-48 overflow-y-auto">
                                                <LinkedDocsList
                                                    key={refreshKey}
                                                    opportunityId={opportunity.id}
                                                    noteId={currentNote.id}
                                                    onNavigateToFile={navigateToFile}
                                                    onPreview={() => { }}
                                                />

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
                                                                        onClick={() => { setActiveTab('tasks'); setSelectedTaskForEdit({ task: t }); }}
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
                                {showQuestionsSplit && (
                                    <div className="w-1/3 bg-gray-50 border-l border-gray-200 p-4 overflow-y-auto animate-slide-in-right">
                                        <div className="flex justify-between items-center mb-6">
                                            <h4 className="font-black text-gray-700 uppercase tracking-widest text-xs">Linked Questions</h4>
                                            <button onClick={() => setShowQuestionsSplit(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
                                        </div>
                                        <div className="space-y-4">
                                            {localOpp.questions.filter(q => q.sourceId === selectedNoteId).map(q => (
                                                <div key={q.id} className={`p-4 rounded-xl border bg-white shadow-sm transition-all relative group ${highlightedQuestionId === q.id ? 'border-[#3DCD58] ring-1 ring-[#3DCD58]/20' : 'border-gray-200'}`}>
                                                    <button
                                                        onClick={() => { if (window.confirm('Delete question?')) handleFieldChange('questions', localOpp.questions.filter(qi => qi.id !== q.id)); }}
                                                        className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                    <div className="text-[10px] text-gray-400 font-bold uppercase mb-2 border-l-2 border-[#3DCD58] pl-2 italic truncate pr-6">"{q.quote}"</div>
                                                    <input className="w-full text-sm font-bold text-gray-900 bg-transparent border-none p-0 focus:ring-0" value={q.question} onChange={(e) => updateQuestion(q.id, 'question', e.target.value)} />
                                                    <textarea className="w-full text-xs text-gray-500 mt-2 bg-gray-50 border-none p-2 rounded focus:bg-gray-100 transition-colors" value={q.answer} placeholder="Type answer..." onChange={(e) => updateQuestion(q.id, 'answer', e.target.value)} rows={2} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ... Tasks and other tabs unchanged in structure ... */}
                        {activeTab === 'tasks' && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
                                {/* Task View Content */}
                                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                                    <div className="flex items-center gap-4">
                                        <h3 className="font-black text-gray-800 uppercase tracking-wider">Action Plan</h3>
                                        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                            <button onClick={() => setTaskViewMode('list')} className={`p-1.5 rounded ${taskViewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="List View"><ListIcon className="w-4 h-4" /></button>
                                            <button onClick={() => setTaskViewMode('calendar')} className={`p-1.5 rounded ${taskViewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Calendar View"><CalendarIcon className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                            <input className="pl-8 pr-4 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58] w-40" placeholder="Filter tasks..." value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} />
                                        </div>
                                        {/* CHANGED: Replaced select with MultiSelect for Status Filtering */}
                                        <MultiSelect
                                            options={Object.keys(TASK_STATUS_COLORS)}
                                            selected={taskStatusFilters}
                                            onChange={setTaskStatusFilters}
                                            placeholder="All Status"
                                        />
                                        <button onClick={getStatusSummary} className="text-xs font-bold bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Get Status</button>
                                        <button onClick={() => setShowCopyTasksModal(true)} className="text-xs font-bold bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2"><Copy className="w-4 h-4" /> Copy Tasks</button>
                                        <button onClick={addTask} className="text-xs font-bold bg-[#3DCD58] text-white px-4 py-2 rounded-lg hover:bg-[#2db64a] shadow-lg shadow-[#3DCD58]/20 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Task</button>
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
                                    </div>
                                )}

                                <div className="flex-1 min-h-0">
                                    {taskViewMode === 'list' ? (
                                        <div className="p-6 space-y-3">
                                            {filteredTasks.length === 0 ? (
                                                <div className="py-20 text-center text-gray-400 opacity-20"><ListChecks className="w-20 h-20 mx-auto mb-2" /><p className="font-bold">No tasks found with these filters</p></div>
                                            ) : filteredTasks.map(task => (
                                                <div key={task.id} id={`task-${task.id}`} className={`group border p-4 rounded-xl flex items-center justify-between cursor-pointer transition-all ${highlightTaskId === task.id ? 'bg-yellow-100 border-yellow-400 border-2' : 'border-gray-100 hover:bg-gray-50 hover:border-[#3DCD58]/30 hover:shadow-md'}`} onClick={() => setSelectedTaskForEdit({ task })}>
                                                    <div className="flex items-center gap-4">
                                                        <div
                                                            className="text-xs font-bold text-gray-300 w-6 text-center"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title="Execution Order"
                                                        >
                                                            <input
                                                                type="number"
                                                                className="w-full bg-transparent border-none text-center focus:ring-0 p-0 text-gray-400 font-bold"
                                                                placeholder="#"
                                                                value={task.order || ''}
                                                                onChange={(e) => {
                                                                    const newOrder = e.target.value ? parseInt(e.target.value) : null;
                                                                    const updatedTasks = localOpp.tasks.map(t => t.id === task.id ? { ...t, order: newOrder } : t);
                                                                    handleFieldChange('tasks', updatedTasks);
                                                                }}
                                                            />
                                                        </div>
                                                        <div className={`w-2 h-2 rounded-full ${task.status === 'Done' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                                        <div className="flex-1">
                                                            <div className="font-bold text-gray-900 group-hover:text-[#3DCD58] transition-colors">{task.title}</div>
                                                            <div className="text-[10px] font-black uppercase mt-1 flex items-center gap-2">
                                                                <User className="w-3 h-3" /> {task.owner}
                                                                <span className="text-gray-300">|</span>
                                                                <Clock className="w-3 h-3" /> {task.dueDate}
                                                                {(task.externalAreas || []).map(a => <span key={a} className="bg-emerald-50 text-emerald-600 px-1.5 rounded">{a}</span>)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {/* Action Buttons (visible on hover) */}
                                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity mr-2 flex items-center gap-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (timerState.taskId === task.id && timerState.isRunning) pauseTimer();
                                                                    else if (task && localOpp) startTimer(task.id, localOpp.id, task.title || 'Untitled Task');
                                                                }}
                                                                className={`p-1 rounded transition-colors ${timerState.taskId === task.id && timerState.isRunning ? 'bg-red-50 text-red-500 animate-pulse' : 'hover:bg-gray-200 text-gray-400 hover:text-green-600'}`}
                                                                title={timerState.taskId === task.id && timerState.isRunning ? 'Pause Timer' : 'Start Timer'}
                                                            >
                                                                {timerState.taskId === task.id && timerState.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); copyTask(task); }}
                                                                className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-blue-500"
                                                                title="Duplicate Task"
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>

                                                        {task.calendarized && <div title="Calendarized" className="text-purple-500"><CalendarDays className="w-4 h-4" /></div>}
                                                        {task.blockDoneUntilDependenciesDone && <Lock className="w-3 h-3 text-gray-400" />}

                                                        <div className={`text-[9px] px-2 py-0.5 rounded border uppercase font-bold ${PRIORITY_COLORS[task.priority || 'Medium']}`}>{task.priority || 'Medium'}</div>
                                                        <div className={`text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-sm ${TASK_STATUS_COLORS[task.status]}`}>{task.status}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-6 h-full">
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
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Task Edit Modal */}
            {selectedTaskForEdit && !isSubView && (
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
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selectedTaskForEdit.task.id}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={copyTaskSummary} className="flex items-center gap-1 text-xs font-bold bg-[#3DCD58]/10 text-[#3DCD58] px-3 py-1.5 rounded-lg hover:bg-[#3DCD58]/20 transition-colors">
                                        <Copy className="w-3 h-3" /> Summary
                                    </button>
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
                                        <input className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0" value={selectedTaskForEdit.task.title} onChange={(e) => updateTaskInModal('title', e.target.value)} />
                                    </div>
                                    <div className="w-24 space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Order</label>
                                        <input type="number" className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0 text-center" value={selectedTaskForEdit.task.order || ''} onChange={(e) => updateTaskInModal('order', e.target.value ? parseInt(e.target.value) : null)} placeholder="#" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Current Status</label>
                                        <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.status} onChange={(e) => updateTaskInModal('status', e.target.value as any)}>{Object.keys(TASK_STATUS_COLORS).map(s => <option key={s}>{s}</option>)}</select>
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
                                                <MultiSelect
                                                    placeholder="Select Areas"
                                                    options={['Delivery', 'SCM', 'Sales', 'Legal', 'Finance', 'TSC', 'Other']}
                                                    selected={selectedTaskForEdit.task.externalAreas || []}
                                                    onChange={(vals) => updateTaskInModal('externalAreas', vals)}
                                                />
                                                <input placeholder="Person Name" className="border-gray-200 rounded-lg text-sm flex-1 bg-white p-2" value={selectedTaskForEdit.task.responsible || ''} onChange={(e) => updateTaskInModal('responsible', e.target.value)} />
                                            </div>
                                        )}
                                    </div>
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
                                    <textarea className="w-full border-gray-100 bg-gray-50 rounded-2xl text-sm min-h-[120px] p-4 shadow-inner focus:bg-white transition-all focus:ring-0" value={selectedTaskForEdit.task.description} onChange={(e) => updateTaskInModal('description', e.target.value)} />
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
                                        <LinkedDocsList key={refreshKey} opportunityId={opportunity.id} taskId={selectedTaskForEdit.task.id} onNavigateToFile={navigateToFile} />
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
                                                            onClick={() => { setSelectedTaskForEdit(null); setActiveTab('notes'); setSelectedNoteId(note.id); }}
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
                                                <input className={`flex-1 border-none focus:ring-0 p-0 text-sm font-medium ${sub.completed ? 'line-through text-gray-300' : 'text-gray-700'}`} value={sub.title} onChange={(e) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, title: e.target.value } : s))} />
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
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showDocPicker && (
                <DocumentPickerModal
                    opportunityId={opportunity.id}
                    multi={true}
                    onSelect={handleDocSelect}
                    onClose={() => setShowDocPicker(null)}
                    title={`Link documents to ${showDocPicker.type}`}
                />
            )}

            {showAddAreaModal && (
                <AddAreaModal
                    availableAreas={(trackedAreas || []).filter(ta => !((localOpp.kpis?.areasInvolved || []).some(a => a.area === ta)))}
                    onAdd={(areaName) => {
                        addKpiArea(areaName);
                        setShowAddAreaModal(false);
                    }}
                    onClose={() => setShowAddAreaModal(false)}
                />
            )}

            {showCreateVersionModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold mb-4">Create Version Snapshot</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Commit Message *</label>
                                <input className="w-full border-gray-200 rounded-lg text-sm" autoFocus placeholder="e.g. Initial Estimation" value={newVersionData.commitMessage} onChange={e => setNewVersionData({ ...newVersionData, commitMessage: e.target.value })} />
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
                                <button onClick={() => setShowCreateVersionModal(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600">Cancel</button>
                                <button onClick={handleCreateVersion} disabled={!newVersionData.commitMessage} className="px-4 py-2 bg-[#3DCD58] hover:bg-green-600 rounded-lg text-sm font-bold text-white disabled:opacity-50">Create Version</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDiffModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold">Version Comparison</h3>
                            <button onClick={() => setShowDiffModal(false)}><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="p-2 bg-red-50 rounded border border-red-100">
                                    <h4 className="font-bold text-red-800 text-xs uppercase mb-1">Base (Live)</h4>
                                    <p className="text-xs">Current State</p>
                                </div>
                                <div className="p-2 bg-green-50 rounded border border-green-100">
                                    <h4 className="font-bold text-green-800 text-xs uppercase mb-1">Compare (Version)</h4>
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
            )}
        </div>
    );
};

export default OpportunityDetail;
