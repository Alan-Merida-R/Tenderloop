
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ListChecks } from 'lucide-react';
import { Task } from '../types';
import { parseBooleanQuery } from './OpportunitySearchInput';

interface Props {
    tasks: any[]; // These are the tasks with .opp context
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
}

export const TaskSearchInput: React.FC<Props> = ({
    tasks,
    value,
    onChange,
    placeholder = "Search tasks...",
    className
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [localValue, setLocalValue] = useState(value);

    // Sync external value changes
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (localValue !== value) {
                onChange(localValue);
            }
        }, 300);
        return () => clearTimeout(handler);
    }, [localValue, value, onChange]);

    const deferredValue = React.useDeferredValue(localValue);

    // Typeahead suggestions for tasks
    const suggestions = useMemo(() => {
        if (!deferredValue.trim()) return [];

        const lower = deferredValue.toLowerCase();
        return tasks
            .filter(t =>
                t.title.toLowerCase().includes(lower) ||
                t.id.toLowerCase().includes(lower) ||
                (t.description || '').toLowerCase().includes(lower)
            )
            .slice(0, 15); // Limit 15
    }, [tasks, deferredValue]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (localValue.trim() && suggestions.length > 0) {
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    }, [localValue, suggestions.length]);

    return (
        <div ref={containerRef} className={`relative flex items-center min-w-[250px] max-w-[500px] ${className}`}>
            <div className="flex flex-wrap items-center flex-1 gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-transparent transition-all">
                <ListChecks className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                    type="text"
                    value={localValue}
                    onChange={(e) => {
                        setLocalValue(e.target.value);
                        setIsOpen(true);
                    }}
                    placeholder={placeholder}
                    className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm placeholder:text-gray-400 focus:ring-0 p-0"
                />
                {value && (
                    <button onClick={() => onChange('')} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown — fixed so it escapes overflow:hidden parents */}
            {isOpen && suggestions.length > 0 && (() => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return null;
                return (
                    <div
                        className="fixed bg-white rounded-xl shadow-xl border border-gray-100 overflow-y-auto z-[999] animate-in slide-in-from-top-2 duration-200"
                        style={{ top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: 320 }}
                    >
                        <div className="p-2 grid gap-1">
                            {suggestions.map(task => (
                                <button
                                    key={`${task.opp.id}-${task.id}`}
                                    onClick={() => { onChange(task.title); setIsOpen(false); }}
                                    className="flex flex-col text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-[10px] text-orange-500 font-mono group-hover:underline">{task.opp.id} / {task.id}</span>
                                        <span className={`text-[9px] font-bold px-1.5 rounded uppercase ${task.status === 'Done' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{task.status}</span>
                                    </div>
                                    <span className="text-sm text-gray-700 font-medium truncate w-full">{task.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
