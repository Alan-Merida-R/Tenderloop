
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
    if (!query.trim()) return null;

    const tokens: string[] = [];
    const regex = /"([^"]+)"|(\S+)/g;
    let match;

    while ((match = regex.exec(query)) !== null) {
        if (match[1]) {
            tokens.push(`"${match[1].toLowerCase()}"`);
        } else {
            tokens.push(match[2]);
        }
    }

    return (text: string) => {
        const lowerText = text.toLowerCase();

        // Evaluate OR groups first (simplistic parser for "A OR B")
        // If the token stream has "OR", we split by it.
        // For now, implementing the specified rules:
        // - AND implícito por espacios
        // - OR usando "OR" (o "|")
        // - exclusión con "-"
        // - comillas para frases exactas

        // We will process logical groups.
        // A OR B AND C -> (A) OR (B AND C) is standard precedence? Or (A OR B) AND C?
        // Google style: OR has lower precedence than AND. A OR B C -> A OR (B AND C).

        // Let's split by OR first
        const orGroups = query.split(/\s+OR\s+|\s+\|\s+/);

        return orGroups.some(group => {
            // Inside an OR group, all terms must match (AND)
            const terms = group.match(/"([^"]+)"|(\S+)/g) || [];

            return terms.every(term => {
                let cleanTerm = term;
                let isNegation = false;
                let isExact = false;

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

                // Explicitly handle "OR" token if it slipped in (shouldn't due to split)
                if (cleanTerm === 'or' || cleanTerm === '|') return true;

                const includes = isExact
                    ? lowerText.includes(cleanTerm) // Exact phrase match (still substring?) Phrase usually means substring match of that sequence
                    : (() => {
                        // Wildcard *
                        if (cleanTerm.includes('*')) {
                            const regexStr = cleanTerm.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
                            return new RegExp(regexStr).test(lowerText);
                        }
                        return lowerText.includes(cleanTerm);
                    })();

                return isNegation ? !includes : includes;
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

    // Typeahead suggestions
    const suggestions = useMemo(() => {
        // Always return suggestions, filtered by text if present
        const lower = value.toLowerCase().trim();

        return opportunities
            .filter(o => {
                if (selectedIds.includes(o.id)) return false;
                if (!lower) return true; // Show all if no search text

                return (
                    o.title.toLowerCase().includes(lower) ||
                    o.id.toLowerCase().includes(lower) ||
                    o.customer.toLowerCase().includes(lower) ||
                    (o.alias || '').toLowerCase().includes(lower) ||
                    (o.labels || []).some(l => l.text.toLowerCase().includes(lower))
                );
            })
            .slice(0, 50); // Increased limit
    }, [opportunities, value, selectedIds]);

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
                    value={value}
                    onFocus={() => {
                        if (suggestions.length > 0) {
                            if (onToggle) onToggle(true);
                            else setInternalIsOpen(true);
                        }
                    }}
                    onChange={(e) => {
                        onChange(e.target.value);
                        // Always open on user typing
                        if (onToggle) onToggle(true);
                        else setInternalIsOpen(true);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Backspace' && value === '' && selectedIds.length > 0) {
                            onRemove(selectedIds[selectedIds.length - 1]);
                        }
                        if (e.key === 'Enter' && suggestions.length > 0 && isDropdownOpen) {
                            onSelect(suggestions[0].id);
                            onChange('');
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
