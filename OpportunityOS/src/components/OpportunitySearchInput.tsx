
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Check } from 'lucide-react';
import { Opportunity } from '../types';

interface Props {
    opportunities: Opportunity[];
    value: string;
    onChange: (val: string) => void;
    selectedIds: string[];
    onSelect: (id: string) => void;
    onRemove: (id: string) => void;
    placeholder?: string;
    className?: string;
    isOpen?: boolean;
    onToggle?: (isOpen: boolean) => void;
}

export const parseBooleanQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return null;

    // Pre-calculate groups to avoid regex overhead inside the matcher loop
    const orGroupsRaw = trimmed.split(/\s+OR\s+|\s+\|\s+/);
    
    // Pre-process each group into pre-compiled tokens/terms
    const preCompiledGroups = orGroupsRaw.map(group => {
        const terms = group.match(/"([^"]+)"|(\S+)/g) || [];
        return terms.map(term => {
            let isNegation = false;
            let isExact = false;
            let cleanTerm = term;

            if (term.startsWith('-')) {
                isNegation = true;
                cleanTerm = term.substring(1);
            }

            if (cleanTerm.startsWith('"') && cleanTerm.endsWith('"')) {
                isExact = true;
                cleanTerm = cleanTerm.slice(1, -1).toLowerCase();
            } else {
                cleanTerm = cleanTerm.toLowerCase();
            }

            // Prepare wildcard if needed
            let wildcardRegex: RegExp | null = null;
            if (!isExact && cleanTerm.includes('*')) {
                const regexStr = cleanTerm.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
                wildcardRegex = new RegExp(regexStr);
            }

            return { isNegation, isExact, cleanTerm, wildcardRegex, isOrToken: cleanTerm === 'or' || cleanTerm === '|' };
        }).filter(t => !t.isOrToken);
    });

    return (text: string) => {
        const lowerText = text.toLowerCase();

        return preCompiledGroups.some(group => {
            return group.every(t => {
                const includes = t.isExact
                    ? lowerText.includes(t.cleanTerm)
                    : (t.wildcardRegex ? t.wildcardRegex.test(lowerText) : lowerText.includes(t.cleanTerm));

                return t.isNegation ? !includes : includes;
            });
        });
    };
};

export const OpportunitySearchInput: React.FC<Props> = ({
    opportunities,
    value,
    onChange,
    selectedIds,
    onSelect,
    onRemove,
    placeholder = "Search opportunities...",
    className,
    isOpen: controlledIsOpen,
    onToggle
}) => {
    // Internal state fallback if not controlled
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isDropdownOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
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

    // Typeahead suggestions
    const suggestions = useMemo(() => {
        // Always return suggestions, filtered by text if present
        const lower = deferredValue.toLowerCase().trim();

        return opportunities
            .filter(o => {
                if (selectedIds.includes(o.id)) return false;
                if (!lower) return true; // Show all if no search text

                // Dashboard receives a pre-built index from App. This keeps
                // suggestions consistent with the main search, including
                // notes, seller, location and every other stored field.
                // Other dialogs can pass full records without this cache, so
                // retain a small compatibility fallback for their typeahead.
                const searchable = o._searchIndex || [
                    o.title, o.id, o.customer, o.customerAddress, o.seller,
                    o.srId, o.alias, o.description, o.kanbanNote,
                    ...(o.labels || []).map(label => label.text),
                    ...(o.versions || []).map(version => version.srId),
                ].filter(Boolean).join(' ').toLowerCase();
                return searchable.includes(lower);
            })
            .slice(0, 50); // Increased limit
    }, [opportunities, deferredValue, selectedIds]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Only close if CURRENTLY open. 
            // If we don't check isDropdownOpen, a click on another dropdown (valid click) 
            // is seen as "outside" this component, causing this component to call onToggle(false),
            // which in the parent resets ALL dropdowns to null.
            if (isDropdownOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                if (onToggle) onToggle(false);
                else setInternalIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onToggle, isDropdownOpen]);

    // Removed useEffect that auto-toggles state based on value/suggestions. 
    // This was likely causing the "open/close fast" flickering by fighting with other events or renders.
    // We will rely on explicit user interaction (focus, change) to open.

    return (
        <div ref={containerRef} className={`relative flex items-center w-full ${className}`}>
            <div className="flex flex-wrap items-center flex-1 gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-[#3DCD58] focus-within:border-transparent transition-all">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />

                {/* Chips */}
                {selectedIds.map(id => {
                    const opp = opportunities.find(o => o.id === id);
                    if (!opp) return null;
                    return (
                        <span key={id} className="flex items-center gap-1 bg-[#3DCD58]/10 text-[#2b9342] px-2 py-0.5 rounded-full text-xs font-bold animate-in fade-in zoom-in duration-200">
                            <span className="truncate max-w-[100px]">{opp.id}</span>
                            <button onClick={(e) => { e.preventDefault(); onRemove(id); }} className="hover:text-red-500">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    );
                })}

                <input
                    type="text"
                    value={localValue}
                    onFocus={() => {
                        if (suggestions.length > 0) {
                            if (onToggle) onToggle(true);
                            else setInternalIsOpen(true);
                        }
                    }}
                    onChange={(e) => {
                        setLocalValue(e.target.value);
                        // Always open on user typing
                        if (onToggle) onToggle(true);
                        else setInternalIsOpen(true);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Backspace' && localValue === '' && selectedIds.length > 0) {
                            onRemove(selectedIds[selectedIds.length - 1]);
                        }
                        if (e.key === 'Enter' && suggestions.length > 0 && isDropdownOpen) {
                            onSelect(suggestions[0].id);
                            onChange('');
                            setLocalValue('');
                            if (onToggle) onToggle(false);
                            else setInternalIsOpen(false);
                        }
                        // Close on Escape
                        if (e.key === 'Escape') {
                            if (onToggle) onToggle(false);
                            else setInternalIsOpen(false);
                            e.currentTarget.blur();
                        }
                    }}
                    placeholder={selectedIds.length > 0 ? "" : placeholder}
                    className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm placeholder:text-gray-400 focus:ring-0 p-0"
                />

                {(value || selectedIds.length > 0) && (
                    <button onClick={() => { onChange(''); selectedIds.forEach(id => onRemove(id)); }} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown — fixed so it escapes overflow:hidden parents */}
            {isDropdownOpen && suggestions.length > 0 && (() => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return null;
                return (
                    <div
                        className="fixed bg-white rounded-xl shadow-xl border border-gray-100 overflow-y-auto z-[999] animate-in slide-in-from-top-2 duration-200"
                        style={{ top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: 320 }}
                    >
                        <div className="p-2 grid gap-1">
                            {suggestions.map(opp => (
                                <button
                                    key={opp.id}
                                    onClick={() => {
                                        onSelect(opp.id);
                                        onChange('');
                                    }}
                                    className="flex flex-col text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-[#3DCD58] font-mono group-hover:underline">{opp.id}</span>
                                        <span className="text-[10px] text-gray-400">{opp.customer}</span>
                                    </div>
                                    <span className="text-sm text-gray-700 font-medium truncate w-full">{opp.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
