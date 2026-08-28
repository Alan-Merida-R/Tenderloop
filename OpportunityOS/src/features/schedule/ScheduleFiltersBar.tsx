import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { Opportunity, TASK_STATUS_COLORS, PRIORITY_COLORS } from '../../types';
import { ScheduleFilters, EMPTY_FILTERS, isOpportunitySchedulable } from './scheduleHelpers';

interface Props {
    opportunities: Opportunity[];
    filters: ScheduleFilters;
    onChange: (f: ScheduleFilters) => void;
}

const OWNERS = ['Me', 'External Area'];

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; className?: string }>
    = ({ active, onClick, children, className }) => (
        <button
            onClick={onClick}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-full border transition-all ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'} ${className || ''}`}
        >
            {children}
        </button>
    );

/**
 * Filter bar for the Schedule view. Matches semantics of the existing
 * calendar filters: opportunity, status, priority, owner.
 */
export const ScheduleFiltersBar: React.FC<Props> = ({ opportunities, filters, onChange }) => {
    const toggle = <K extends keyof ScheduleFilters>(key: K, value: string) => {
        const arr = filters[key] as string[];
        const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
        onChange({ ...filters, [key]: next });
    };

    const activeCount =
        filters.oppIds.length + filters.statuses.length + filters.priorities.length + filters.owners.length;

    const oppOptions = useMemo(
        () => opportunities.filter(isOpportunitySchedulable).sort((a, b) => (a.alias || a.title).localeCompare(b.alias || b.title)),
        [opportunities]
    );

    return (
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex flex-col gap-2 shrink-0">
            <div className="flex items-center gap-6 flex-wrap">
                <FilterGroup label="Opportunity">
                    {oppOptions.map(o => (
                        <Chip key={o.id} active={filters.oppIds.includes(o.id)} onClick={() => toggle('oppIds', o.id)}>
                            {o.alias || o.title.slice(0, 14)}
                        </Chip>
                    ))}
                    {oppOptions.length === 0 && <span className="text-[10px] text-gray-400">No opportunities</span>}
                </FilterGroup>
                <FilterGroup label="Status">
                    {Object.keys(TASK_STATUS_COLORS).map(s => (
                        <Chip key={s} active={filters.statuses.includes(s)} onClick={() => toggle('statuses', s)}>{s}</Chip>
                    ))}
                </FilterGroup>
                <FilterGroup label="Priority">
                    {Object.keys(PRIORITY_COLORS).map(p => (
                        <Chip key={p} active={filters.priorities.includes(p)} onClick={() => toggle('priorities', p)}>{p}</Chip>
                    ))}
                </FilterGroup>
                <FilterGroup label="Owner">
                    {OWNERS.map(o => (
                        <Chip key={o} active={filters.owners.includes(o)} onClick={() => toggle('owners', o)}>{o}</Chip>
                    ))}
                </FilterGroup>
                {activeCount > 0 && (
                    <button
                        onClick={() => onChange(EMPTY_FILTERS)}
                        className="ml-auto flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-red-500 uppercase"
                    >
                        <X className="w-3 h-3" /> Clear all
                    </button>
                )}
            </div>
        </div>
    );
};

const FilterGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}:</span>
        <div className="flex gap-1 flex-wrap">{children}</div>
    </div>
);
