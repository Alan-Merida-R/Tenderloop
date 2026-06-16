
import React, { useState, useEffect, useRef } from 'react';
import { Columns, Check, X, Filter } from 'lucide-react';

interface EditableCellProps {
    value: string | number;
    onChange: (val: any) => void;
    type?: 'text' | 'date' | 'select' | 'number';
    options?: string[];
    className?: string;
    displayValue?: React.ReactNode;
}

export const EditableCell: React.FC<EditableCellProps> = ({ value, onChange, type = 'text', options, className, displayValue }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

    useEffect(() => {
        setTempValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

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

    if (isEditing) {
        if (type === 'select' && options) {
            return (
                <select
                    ref={inputRef as any}
                    value={tempValue}
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
            onClick={() => setIsEditing(true)}
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
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({ columns, visibleColumns, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

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

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
                <Columns className="w-3.5 h-3.5" /> Columns
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-[500] p-2 animate-in fade-in zoom-in duration-200">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-2 px-2">Visible Columns</div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                        {columns.map(col => (
                            <button
                                key={col.key}
                                onClick={() => toggleColumn(col.key)}
                                className="flex items-center w-full px-2 py-1.5 text-xs text-left rounded hover:bg-gray-50 transition-colors gap-2"
                            >
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${visibleColumns.includes(col.key) ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : 'border-gray-300'}`}>
                                    {visibleColumns.includes(col.key) && <Check className="w-2.5 h-2.5" />}
                                </div>
                                <span className={visibleColumns.includes(col.key) ? 'text-gray-900 font-medium' : 'text-gray-500'}>{col.label}</span>
                            </button>
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
}

export const ColumnFilter: React.FC<ColumnFilterProps> = ({ options, selected, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const visibleOptions = options.filter(opt => (opt || '').toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);

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
                    <input
                        autoFocus
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full text-xs p-1 mb-2 border border-gray-200 rounded outline-none focus:border-[#3DCD58]"
                        onClick={e => e.stopPropagation()}
                    />
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
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
                                <span className="truncate" title={opt}>{opt || '(Empty)'}</span>
                            </label>
                        ))}
                    </div>
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
