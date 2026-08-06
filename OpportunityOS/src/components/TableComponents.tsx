
import React, { useState, useEffect, useRef } from 'react';
import { Columns, Check, Filter, ChevronUp, ChevronDown, CalendarDays } from 'lucide-react';

interface EditableCellProps {
    value: string | number;
    onChange: (val: any) => void;
    type?: 'text' | 'date' | 'select' | 'number';
    options?: string[];
    className?: string;
    displayValue?: React.ReactNode;
    /** Optional colored menu for status-like selects. */
    optionClassName?: (option: string) => string;
    /** Optional UI label while retaining the original value for storage. */
    optionLabel?: (option: string) => React.ReactNode;
    /** Keep a date field open in a table: native calendar + keyboard entry. */
    direct?: boolean;
}

export const EditableCell: React.FC<EditableCellProps> = ({ value, onChange, type = 'text', options, className, displayValue, direct = false, optionClassName, optionLabel }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
    const calendarRef = useRef<HTMLInputElement>(null);
    const selectMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setTempValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing || type !== 'select' || !optionClassName) return;
        const closeMenu = (event: MouseEvent) => {
            if (!selectMenuRef.current?.contains(event.target as Node)) {
                setTempValue(value);
                setIsEditing(false);
            }
        };
        document.addEventListener('mousedown', closeMenu);
        return () => document.removeEventListener('mousedown', closeMenu);
    }, [isEditing, optionClassName, type, value]);

    const handleCommit = () => {
        onChange(tempValue);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setTempValue(value);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCommit();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    const normalizeTypedDate = (raw: string): string | null => {
        const value = raw.trim();
        if (!value) return '';
        const isoMatch = value.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
        if (isoMatch) {
            const [, year, month, day] = isoMatch;
            const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const parsed = new Date(`${normalized}T00:00:00`);
            return !Number.isNaN(parsed.getTime()) && parsed.getDate() === Number(day) && parsed.getMonth() + 1 === Number(month) ? normalized : null;
        }
        // Day-first entry: DD/MM/YYYY or DD-MM-YYYY (dots are accepted too).
        const match = value.match(/^(\d{1,2})[/\.\-](\d{1,2})[/\.\-](\d{4})$/);
        if (!match) return null;
        const [, day, month, year] = match;
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const parsed = new Date(`${normalized}T00:00:00`);
        return !Number.isNaN(parsed.getTime()) && parsed.getDate() === Number(day) && parsed.getMonth() + 1 === Number(month) ? normalized : null;
    };

    // Dates in the General table are regular text fields. The native calendar
    // is intentionally exposed only through its dedicated icon button.
    if (direct && type === 'date') {
        const commitTypedDate = () => {
            const normalized = normalizeTypedDate(String(tempValue));
            if (normalized === null) { setTempValue(value); return; }
            setTempValue(normalized);
            if (normalized !== value) onChange(normalized);
        };
        return (
            <div className="flex min-w-[92px] items-center rounded border border-transparent bg-transparent pr-0 transition-colors hover:bg-gray-100/50 focus-within:border-gray-200 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#3DCD58]">
                <input
                    type="text"
                    value={String(tempValue || '')}
                    placeholder="DD/MM/YYYY"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={commitTypedDate}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') { setTempValue(value); (e.currentTarget as HTMLInputElement).blur(); } }}
                    aria-label="Date"
                    className={`min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-xs font-mono text-gray-700 outline-none focus:ring-0 ${className || ''}`}
                />
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); const picker = calendarRef.current as (HTMLInputElement & { showPicker?: () => void }) | null; picker?.showPicker ? picker.showPicker() : picker?.click(); }} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-[#278a3b]" title="Choose from calendar"><CalendarDays className="h-3 w-3" /></button>
                <input ref={calendarRef} type="date" value={String(value || '')} onChange={(e) => { setTempValue(e.target.value); onChange(e.target.value); }} tabIndex={-1} aria-hidden="true" className="absolute h-px w-px opacity-0 pointer-events-none" />
            </div>
        );
    }

    if (isEditing) {
        if (type === 'select' && options) {
            if (optionClassName) {
                return (
                    <div ref={selectMenuRef} className="relative" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                        <div className="absolute left-0 top-0 z-50 min-w-[170px] overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
                            {options.map(option => (
                                <button key={option} type="button" onClick={() => { onChange(option); setIsEditing(false); }} className={`mb-1 flex w-full items-center rounded px-2 py-1.5 text-left text-[10px] font-bold uppercase last:mb-0 ${optionClassName(option)}`}>
                                    {optionLabel?.(option) ?? option}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            }
            return (
                <select
                    ref={inputRef as any}
                    value={tempValue}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={handleCommit}
                    onKeyDown={handleKeyDown}
                    className={`w-full p-1 text-xs border border-blue-400 rounded focus:ring-2 focus:ring-blue-200 outline-none ${className}`}
                    autoFocus
                >
                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            );
        }
        return (
            <input
                ref={inputRef as any}
                type={type}
                value={tempValue}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={handleKeyDown}
                className={`w-full p-1 text-xs border border-blue-400 rounded focus:ring-2 focus:ring-blue-200 outline-none ${className}`}
                autoFocus
            />
        );
    }

    return (
        <div
            onClick={(e) => {
                // The table row opens the expediente; entering inline edit must remain local.
                e.stopPropagation();
                setIsEditing(true);
            }}
            className={`cursor-pointer hover:bg-gray-100/50 p-1 rounded border border-transparent hover:border-gray-200 min-h-[20px] flex items-center ${className}`}
            title="Click to edit"
        >
            {displayValue || (value ? String(value) : <span className="text-gray-300 italic">Empty</span>)}
        </div>
    );
};

interface ColumnSelectorProps {
    columns: { key: string; label: string }[];
    visibleColumns: string[];
    onChange: (cols: string[]) => void;
    columnOrder?: string[];
    onOrderChange?: (cols: string[]) => void;
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({ columns, visibleColumns, onChange, columnOrder, onOrderChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const orderedColumns = React.useMemo(() => {
        if (!columnOrder || columnOrder.length === 0) return columns;
        const byKey = new Map(columns.map(col => [col.key, col]));
        const ordered = columnOrder.map(key => byKey.get(key)).filter(Boolean) as { key: string; label: string }[];
        const missing = columns.filter(col => !columnOrder.includes(col.key));
        return [...ordered, ...missing];
    }, [columns, columnOrder]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleColumn = (key: string) => {
        if (visibleColumns.includes(key)) {
            onChange(visibleColumns.filter(c => c !== key));
        } else {
            onChange([...visibleColumns, key]);
        }
    };

    const moveColumn = (key: string, direction: 'up' | 'down') => {
        if (!onOrderChange) return;
        const keys = orderedColumns.map(col => col.key);
        const index = keys.indexOf(key);
        const nextIndex = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || nextIndex < 0 || nextIndex >= keys.length) return;
        const next = [...keys];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        onOrderChange(next);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
                <Columns className="w-3.5 h-3.5" /> Columns
            </button>

            {isOpen && (
                <div className="fixed inset-x-3 top-16 bottom-3 z-[1000] flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-xl animate-in fade-in zoom-in duration-200 md:absolute md:inset-x-auto md:right-0 md:top-full md:bottom-auto md:mt-2 md:w-64 md:p-2">
                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-gray-400 uppercase mb-2 px-2 shrink-0">
                        <span>Visible Columns</span>
                        <button type="button" onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-900 normal-case md:hidden">Close</button>
                    </div>
                    <div className="space-y-1 min-h-0 flex-1 overflow-y-auto md:max-h-60 md:flex-none">
                        {orderedColumns.map((col, index) => (
                            <div
                                key={col.key}
                                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${visibleColumns.includes(col.key) ? 'bg-emerald-50/70 hover:bg-emerald-100/70' : 'hover:bg-gray-50'}`}
                            >
                                {onOrderChange && (
                                    <div className="flex flex-col">
                                        <button type="button" onClick={() => moveColumn(col.key, 'up')} disabled={index === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:hover:text-gray-300" title="Move up">
                                            <ChevronUp className="w-3 h-3" />
                                        </button>
                                        <button type="button" onClick={() => moveColumn(col.key, 'down')} disabled={index === orderedColumns.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:hover:text-gray-300" title="Move down">
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                <button type="button" onClick={() => toggleColumn(col.key)} aria-pressed={visibleColumns.includes(col.key)} className="flex items-center flex-1 min-w-0 gap-2 text-left">
                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${visibleColumns.includes(col.key) ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : 'border-gray-300'}`}>
                                        {visibleColumns.includes(col.key) && <Check className="w-2.5 h-2.5" />}
                                    </div>
                                    <span className={`truncate ${visibleColumns.includes(col.key) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>{col.label}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export interface ColumnFilterProps {
    options: string[];
    selected: string[];
    onChange: (val: string[]) => void;
    numeric?: boolean;
    getOptionLabel?: (option: string) => string;
}

const AMOUNT_OPERATORS = [
    { value: 'lt', label: '< Less than' },
    { value: 'lte', label: '≤ Less or equal' },
    { value: 'gt', label: '> Greater than' },
    { value: 'gte', label: '≥ Greater or equal' },
    { value: 'eq', label: '= Equal to' },
    { value: 'neq', label: '≠ Different from' },
];

export const ColumnFilter: React.FC<ColumnFilterProps> = ({ options, selected, onChange, numeric = false, getOptionLabel = option => option }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const numericFilter = selected[0]?.match(/^(lt|lte|gt|gte|eq|neq):(-?\d+(?:\.\d+)?)$/);
    const [numericOperator, setNumericOperator] = useState(numericFilter?.[1] || 'gte');
    const [numericValue, setNumericValue] = useState(numericFilter?.[2] || '');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const visibleOptions = options.filter(opt => getOptionLabel(opt || '').toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);
    const allVisibleSelected = visibleOptions.length > 0 && visibleOptions.every(opt => selected.includes(opt));
    const toggleAllVisible = () => {
        if (allVisibleSelected) {
            onChange(selected.filter(opt => !visibleOptions.includes(opt)));
            return;
        }
        onChange(Array.from(new Set([...selected, ...visibleOptions])));
    };

    const applyNumericFilter = () => {
        const value = Number(numericValue);
        if (!Number.isFinite(value)) return;
        onChange([`${numericOperator}:${value}`]);
    };

    return (
        <div className="relative inline-block ml-1" ref={ref}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`p-0.5 rounded hover:bg-gray-200 ${selected.length > 0 ? 'text-[#3DCD58]' : 'text-gray-400'}`}
                title="Filter column"
            >
                <Filter className="w-3 h-3" />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-xl z-50 p-2 font-normal text-gray-700 cursor-default">
                    {numeric ? (
                        <div className="flex flex-col gap-2">
                            <select value={numericOperator} onChange={e => setNumericOperator(e.target.value)} className="w-full text-xs p-1 border border-gray-200 rounded outline-none focus:border-[#3DCD58]">
                                {AMOUNT_OPERATORS.map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                            </select>
                            <input
                                autoFocus
                                type="number"
                                step="any"
                                placeholder="Amount"
                                value={numericValue}
                                onChange={e => setNumericValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') applyNumericFilter(); }}
                                className="w-full text-xs p-1 border border-gray-200 rounded outline-none focus:border-[#3DCD58]"
                            />
                            <button type="button" onClick={applyNumericFilter} disabled={!numericValue.trim()} className="w-full rounded bg-[#3DCD58] px-2 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
                                Apply
                            </button>
                        </div>
                    ) : <>
                    <input
                        autoFocus
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full text-xs p-1 mb-2 border border-gray-200 rounded outline-none focus:border-[#3DCD58]"
                        onClick={e => e.stopPropagation()}
                    />
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                        {visibleOptions.length > 0 && (
                            <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded font-semibold text-gray-800 border-b border-gray-100 mb-1 pb-2">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        toggleAllVisible();
                                    }}
                                    className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                />
                                <span>Select all</span>
                            </label>
                        )}
                        {visibleOptions.map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(opt)}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
                                        else onChange([...selected, opt]);
                                    }}
                                    className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                />
                                <span className="truncate" title={getOptionLabel(opt)}>{getOptionLabel(opt) || '(Empty)'}</span>
                            </label>
                        ))}
                    </div>
                    </>}
                    {selected.length > 0 && (
                        <button
                            onClick={() => { onChange([]); setIsOpen(false); }}
                            className="w-full text-center text-xs text-red-500 hover:text-red-700 mt-2 pt-1 border-t border-gray-100"
                        >
                            Clear Filter
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
