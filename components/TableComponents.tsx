
import React, { useState, useEffect, useRef } from 'react';
import { Columns, Check, X } from 'lucide-react';

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
