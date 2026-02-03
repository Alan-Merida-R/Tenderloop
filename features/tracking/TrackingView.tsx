import React, { useState, useMemo, useEffect } from 'react';
import { Opportunity, Task, HistoryEntry, MeetingNote, KPIArea, AreaDayRecord, TaskStatus, TaskPriority, DeepLink } from '../../types';
import { TrackingFilters, TrackingWorkItem, TrackingViewMode, TrackingItemType } from './trackingTypes';
import { Calendar, ChevronLeft, ChevronRight, Filter, Plus, Clock, History, FileText, CheckCircle, Search, X, LayoutGrid, CalendarDays, Timer, Briefcase, User, Info, ArrowRight, Save, Trash2, Edit2, FolderOpen, ExternalLink } from 'lucide-react';

interface TrackingViewProps {
    opportunities: Opportunity[];
    onClose: () => void;
    onUpdateOpportunity?: (updated: Opportunity) => void;
    onSelectOpp?: (id: string, deeplink?: DeepLink) => void;
}

export const TrackingView: React.FC<TrackingViewProps> = ({ opportunities, onClose, onUpdateOpportunity, onSelectOpp }) => {
    const [viewMode, setViewMode] = useState<TrackingViewMode>('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [filters, setFilters] = useState<TrackingFilters>(() => {
        const saved = localStorage.getItem('tracking.filters.v1');
        return saved ? JSON.parse(saved) : {
            opportunityIds: [],
            taskStatuses: [],
            taskPriorities: [],
            searchQuery: '',
            areas: [],
            activeOnly: true,
            itemTypes: ['task', 'history', 'note', 'hours']
        };
    });

    const [selectedDay, setSelectedDay] = useState<string | null>(new Date().toISOString().split('T')[0]);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedItem, setSelectedItem] = useState<TrackingWorkItem | null>(null);

    // Creation Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newItemType, setNewItemType] = useState<TrackingItemType>('task');
    const [targetOppId, setTargetOppId] = useState<string>('');
    const [oppSearch, setOppSearch] = useState('');
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
        hours: 0,
        areaId: '',
        priority: 'Medium' as any,
        status: 'Pending' as any
    });

    const LABELS = {
        title: "Activity Tracking",
        today: "Today",
        month: "Month",
        week: "Week",
        day: "Day",
        filters: "Filters",
        opportunities: "Opportunities",
        itemTypes: "Item Types",
        status: "Status",
        activeOnly: "Active Opportunities Only",
        clearFilters: "Clear Filters",
        tasks: "Tasks",
        history: "History",
        notes: "Notes",
        hours: "Hours",
        agenda: "Agenda",
        selectDay: "Select a day",
        newItem: "New Item",
        noActivities: "No items for this day",
        task: "Task",
        note: "Note",
        view: "View",
        createItem: "Create New Item",
        opportunity: "Opportunity",
        searchOpp: "Search opportunity by ID or name...",
        date: "Date",
        priority: "Priority",
        content: "Content",
        titleField: "Title",
        description: "Description / Content",
        cancel: "Cancel",
        create: "Create Item",
        area: "Area",
        selectArea: "Select area...",
        save: "Save",
        edit: "Edit",
        details: "Details",
        openOpp: "Open Opportunity Folder",
        updated: "Updated successfully",
        error: "Failed to save changes"
    };

    const filteredOppsForSearch = useMemo(() => {
        if (!oppSearch) return [];
        return opportunities.filter(o =>
            o.title.toLowerCase().includes(oppSearch.toLowerCase()) ||
            o.id.toLowerCase().includes(oppSearch.toLowerCase())
        ).slice(0, 5);
    }, [opportunities, oppSearch]);

    // Save filters
    useEffect(() => {
        localStorage.setItem('tracking.filters.v1', JSON.stringify(filters));
    }, [filters]);

    // Data Aggregation
    const workItems = useMemo(() => {
        const items: TrackingWorkItem[] = [];
        const searchLower = filters.searchQuery.toLowerCase();

        opportunities.forEach(opp => {
            if (filters.activeOnly && (opp.statusLabel === 'Won' || opp.statusLabel === 'Lost' || opp.statusLabel === 'Canceled')) {
                return;
            }
            if (filters.opportunityIds.length > 0 && !filters.opportunityIds.includes(opp.id)) {
                return;
            }

            // 1. Tasks
            if (filters.itemTypes.includes('task')) {
                opp.tasks.forEach(task => {
                    if (filters.taskStatuses.length > 0 && !filters.taskStatuses.includes(task.status)) return;
                    if (filters.taskPriorities.length > 0 && !filters.taskPriorities.includes(task.priority)) return;
                    if (searchLower && !task.title.toLowerCase().includes(searchLower) && !task.description?.toLowerCase().includes(searchLower)) return;

                    if (task.dueDate) {
                        items.push({
                            id: task.id,
                            type: 'task',
                            date: task.dueDate.split('T')[0],
                            opportunityId: opp.id,
                            opportunityTitle: opp.title,
                            title: task.title,
                            status: task.status,
                            data: task
                        });
                    }
                });
            }

            // 2. History
            if (filters.itemTypes.includes('history')) {
                opp.history.forEach(h => {
                    if (searchLower && !h.content.toLowerCase().includes(searchLower)) return;
                    items.push({
                        id: h.id,
                        type: 'history',
                        date: h.date.split('T')[0],
                        opportunityId: opp.id,
                        opportunityTitle: opp.title,
                        title: h.content,
                        data: h
                    });
                });
            }

            // 3. Notes
            if (filters.itemTypes.includes('note')) {
                opp.notes.forEach(n => {
                    if (searchLower && !n.title.toLowerCase().includes(searchLower) && !n.content.toLowerCase().includes(searchLower)) return;
                    items.push({
                        id: n.id,
                        type: 'note',
                        date: n.date.split('T')[0],
                        opportunityId: opp.id,
                        opportunityTitle: opp.title,
                        title: n.title,
                        data: n
                    });
                });
            }

            // 4. Hours
            if (filters.itemTypes.includes('hours')) {
                opp.kpis?.areasInvolved.forEach(area => {
                    if (area.calendar) {
                        Object.entries(area.calendar).forEach(([date, record]) => {
                            const r = record as AreaDayRecord;
                            if (r.type === 'Worked' && r.hours) {
                                if (searchLower && !area.area.toLowerCase().includes(searchLower)) return;
                                items.push({
                                    id: `hours-${opp.id}-${area.id}-${date}`,
                                    type: 'hours',
                                    date: date,
                                    opportunityId: opp.id,
                                    opportunityTitle: opp.title,
                                    title: `${area.area}: ${r.hours}h`,
                                    data: { area: area.area, hours: r.hours }
                                });
                            }
                        });
                    }
                });
            }
        });

        return items;
    }, [opportunities, filters]);

    // Calendar Generation
    const days = useMemo(() => {
        const result: Date[] = [];
        const base = new Date(currentDate);

        if (viewMode === 'month') {
            const start = new Date(base.getFullYear(), base.getMonth(), 1);
            const startDay = start.getDay();
            const startDate = new Date(start);
            startDate.setDate(startDate.getDate() - startDay);
            for (let i = 0; i < 42; i++) {
                result.push(new Date(startDate));
                startDate.setDate(startDate.getDate() + 1);
            }
        } else if (viewMode === 'week') {
            const startDay = base.getDay();
            const startDate = new Date(base);
            startDate.setDate(startDate.getDate() - startDay);
            for (let i = 0; i < 7; i++) {
                result.push(new Date(startDate));
                startDate.setDate(startDate.getDate() + 1);
            }
        } else if (viewMode === 'day') {
            result.push(new Date(base));
        }
        return result;
    }, [currentDate, viewMode]);

    const navigate = (amount: number) => {
        const next = new Date(currentDate);
        if (viewMode === 'month') next.setMonth(next.getMonth() + amount);
        else if (viewMode === 'week') next.setDate(next.getDate() + (amount * 7));
        else if (viewMode === 'day') next.setDate(next.getDate() + amount);
        setCurrentDate(next);
        if (viewMode === 'day') {
            setSelectedDay(next.toISOString().split('T')[0]);
        }
    };

    const selectedDayItems = useMemo(() => {
        if (!selectedDay) return [];
        return workItems.filter(item => item.date === selectedDay);
    }, [workItems, selectedDay]);

    const updateItem = (item: TrackingWorkItem, updates: any) => {
        const opp = opportunities.find(o => o.id === item.opportunityId);
        if (!opp) return;
        const updatedOpp = { ...opp };

        try {
            if (item.type === 'task') {
                updatedOpp.tasks = updatedOpp.tasks.map(t => t.id === item.data.id ? { ...t, ...updates } : t);
            } else if (item.type === 'note') {
                updatedOpp.notes = updatedOpp.notes.map(n => n.id === item.data.id ? { ...n, ...updates } : n);
            } else if (item.type === 'history') {
                updatedOpp.history = updatedOpp.history.map(h => h.id === item.data.id ? { ...h, ...updates } : h);
            } else if (item.type === 'hours') {
                if (!updatedOpp.kpis) return;
                const areaIdx = updatedOpp.kpis.areasInvolved.findIndex(a => a.area === item.data.area);
                if (areaIdx !== -1) {
                    updatedOpp.kpis.areasInvolved[areaIdx] = {
                        ...updatedOpp.kpis.areasInvolved[areaIdx],
                        calendar: {
                            ...updatedOpp.kpis.areasInvolved[areaIdx].calendar,
                            [item.date]: { type: 'Worked', hours: updates.hours }
                        }
                    };
                }
            }
            onUpdateOpportunity?.(updatedOpp);
            // Also update selectedItem if it's the one we are editing
            if (selectedItem && selectedItem.id === item.id) {
                setSelectedItem({ ...selectedItem, ...updates, data: { ...selectedItem.data, ...updates } });
            }
        } catch (e) {
            alert(LABELS.error);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 overflow-hidden rounded-2xl border border-gray-200">
            {/* Header / Controls */}
            <div className="p-4 bg-white border-b flex items-center justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-6">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-[#3DCD58]" />
                        {LABELS.title}
                    </h2>

                    <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
                        <button
                            onClick={() => {
                                const now = new Date();
                                setCurrentDate(now);
                                setSelectedDay(now.toISOString().split('T')[0]);
                            }}
                            className="px-3 py-1 text-xs font-bold text-gray-600 hover:text-[#3DCD58] uppercase"
                        >
                            {LABELS.today}
                        </button>
                        <span className="text-sm font-black w-48 text-center text-gray-700 capitalize">
                            {viewMode === 'month'
                                ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                                : viewMode === 'week'
                                    ? `Week of ${days[0]?.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                                    : currentDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                            }
                        </span>
                        <button onClick={() => navigate(1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
                    </div>

                    <div className="flex bg-gray-100 rounded-xl p-1">
                        {(['month', 'week', 'day'] as TrackingViewMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all uppercase ${viewMode === m ? 'bg-white text-[#3DCD58] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {LABELS[m]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${showFilters ? 'bg-[#3DCD58] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Filter className="w-4 h-4" />
                        {LABELS.filters}
                        {Object.values(filters).some(v => Array.isArray(v) && v.length > 0) && (
                            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                        )}
                    </button>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Calendar Area */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {/* Filters Panel */}
                    {showFilters && (
                        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xl animate-in slide-in-from-top duration-300">
                            <div className="grid grid-cols-2 gap-8">
                                {/* Section 1: Opportunity Filters */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Opportunity Filters</label>
                                        {filters.opportunityIds.length > 0 && (
                                            <button
                                                onClick={() => setFilters({ ...filters, opportunityIds: [] })}
                                                className="text-[10px] font-bold text-red-500 hover:underline"
                                            >
                                                Clear Selected
                                            </button>
                                        )}
                                    </div>

                                    <div className="relative group">
                                        <div className="absolute left-3 top-3"><Search className="w-4 h-4 text-gray-400" /></div>
                                        <input
                                            type="text"
                                            placeholder="Search opportunities by name or ID..."
                                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#3DCD58] focus:bg-white transition-all outline-none"
                                            value={oppSearch}
                                            onChange={(e) => setOppSearch(e.target.value)}
                                        />
                                        {oppSearch && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] max-h-60 overflow-y-auto">
                                                {opportunities
                                                    .filter(o => !filters.opportunityIds.includes(o.id))
                                                    .filter(o => o.title.toLowerCase().includes(oppSearch.toLowerCase()) || o.id.toLowerCase().includes(oppSearch.toLowerCase()) || o.customer.toLowerCase().includes(oppSearch.toLowerCase()))
                                                    .slice(0, 50)
                                                    .map(opp => (
                                                        <button
                                                            key={opp.id}
                                                            onClick={() => {
                                                                setFilters({ ...filters, opportunityIds: [...filters.opportunityIds, opp.id] });
                                                                setOppSearch('');
                                                            }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between border-b last:border-0 group/item"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-bold text-gray-800 truncate">{opp.title}</div>
                                                                <div className="text-[10px] text-gray-400 font-mono">{opp.id} • {opp.customer}</div>
                                                            </div>
                                                            <Plus className="w-4 h-4 text-gray-300 group-hover/item:text-[#3DCD58]" />
                                                        </button>
                                                    ))}
                                                {opportunities.filter(o => !filters.opportunityIds.includes(o.id)).length === 0 && (
                                                    <div className="p-4 text-center text-xs text-gray-400 font-bold">No results found</div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Selected Chips */}
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pb-1">
                                        {filters.opportunityIds.map(id => {
                                            const opp = opportunities.find(o => o.id === id);
                                            return (
                                                <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-[#3DCD58]/10 text-[#3DCD58] rounded-lg border border-[#3DCD58]/20 animate-in zoom-in-95">
                                                    <span className="text-[10px] font-black max-w-[150px] truncate">{opp?.title || id}</span>
                                                    <button
                                                        onClick={() => setFilters({ ...filters, opportunityIds: filters.opportunityIds.filter(i => i !== id) })}
                                                        className="hover:bg-[#3DCD58]/20 rounded-full p-0.5"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {filters.opportunityIds.length === 0 && !oppSearch && (
                                            <div className="text-xs text-gray-400 italic">No specific opportunities selected (showing all)</div>
                                        )}
                                    </div>

                                    <div className="pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer group w-fit">
                                            <input
                                                type="checkbox"
                                                checked={filters.activeOnly}
                                                onChange={e => setFilters({ ...filters, activeOnly: e.target.checked })}
                                                className="hidden"
                                            />
                                            <div className={`w-8 h-4 rounded-full transition-all relative ${filters.activeOnly ? 'bg-[#3DCD58]' : 'bg-gray-300'}`}>
                                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${filters.activeOnly ? 'left-4.5' : 'left-0.5'}`}></div>
                                            </div>
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700">{LABELS.activeOnly}</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Section 2: Item & Task Filters */}
                                <div className="space-y-4 border-l border-gray-100 pl-8">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Item & Task Filters</label>

                                    <div className="flex flex-wrap gap-2">
                                        {(['task', 'history', 'note', 'hours'] as TrackingItemType[]).map(type => (
                                            <button
                                                key={type}
                                                onClick={() => {
                                                    const types = filters.itemTypes.includes(type)
                                                        ? filters.itemTypes.filter(t => t !== type)
                                                        : [...filters.itemTypes, type];
                                                    setFilters({ ...filters, itemTypes: types });
                                                }}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 border shadow-sm ${filters.itemTypes.includes(type) ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'}`}
                                            >
                                                {type === 'task' ? <CheckCircle className="w-3 h-3" /> : type === 'history' ? <History className="w-3 h-3" /> : type === 'note' ? <FileText className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
                                                {LABELS[type as keyof typeof LABELS]}
                                            </button>
                                        ))}
                                    </div>

                                    {filters.itemTypes.includes('task') && (
                                        <div className="space-y-3 pt-3 border-t border-gray-50">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Task Status</label>
                                                    <div className="flex flex-wrap gap-1">
                                                        {['Pending', 'In Progress', 'Done', 'On Hold'].map(status => (
                                                            <button
                                                                key={status}
                                                                onClick={() => {
                                                                    const s = filters.taskStatuses.includes(status) ? filters.taskStatuses.filter(x => x !== status) : [...filters.taskStatuses, status];
                                                                    setFilters({ ...filters, taskStatuses: s });
                                                                }}
                                                                className={`px-2 py-0.5 rounded text-[8px] font-black uppercase transition-all ${filters.taskStatuses.includes(status) ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-400 hover:bg-blue-100'}`}
                                                            >
                                                                {status}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Task Priority</label>
                                                    <div className="flex flex-wrap gap-1">
                                                        {['High', 'Medium', 'Low'].map(p => (
                                                            <button
                                                                key={p}
                                                                onClick={() => {
                                                                    const pr = filters.taskPriorities.includes(p) ? filters.taskPriorities.filter(x => x !== p) : [...filters.taskPriorities, p];
                                                                    setFilters({ ...filters, taskPriorities: pr });
                                                                }}
                                                                className={`px-2 py-0.5 rounded text-[8px] font-black uppercase transition-all ${filters.taskPriorities.includes(p) ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-400 hover:bg-orange-100'}`}
                                                            >
                                                                {p}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Search in titles/content..."
                                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border-gray-100 rounded-lg text-xs outline-none focus:ring-1 focus:ring-gray-300"
                                                    value={filters.searchQuery}
                                                    onChange={e => setFilters({ ...filters, searchQuery: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-center pt-4 mt-auto">
                                        <button
                                            onClick={() => setFilters({
                                                opportunityIds: [],
                                                taskStatuses: [],
                                                taskPriorities: [],
                                                searchQuery: '',
                                                areas: [],
                                                activeOnly: true,
                                                itemTypes: ['task', 'history', 'note', 'hours']
                                            })}
                                            className="text-[10px] text-red-500 font-bold hover:underline"
                                        >
                                            Reset All Filters
                                        </button>
                                        <button
                                            onClick={() => setShowFilters(false)}
                                            className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-gray-200 transition-all"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Calendar Grid */}
                    <div className="bg-white rounded-2xl flex-1 border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px] shrink-0">
                        <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-1'} bg-gray-50 border-b`}>
                            {viewMode === 'day' ? (
                                <div className="py-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-tighter">{days[0]?.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                            ) : (
                                ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="py-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-tighter">{d}</div>
                                ))
                            )}
                        </div>
                        <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-1'} flex-1 overflow-y-auto content-start`}>
                            {days.map((d, i) => {
                                const dateStr = d.toISOString().split('T')[0];
                                const isSelected = selectedDay === dateStr;
                                const isToday = dateStr === new Date().toISOString().split('T')[0];
                                const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                                const dayItems = workItems.filter(item => item.date === dateStr);

                                return (
                                    <div
                                        key={i}
                                        onClick={() => setSelectedDay(dateStr)}
                                        className={`border-r border-b p-2 flex flex-col gap-1 cursor-pointer transition-all ${viewMode === 'day' ? 'min-h-full' : 'min-h-[120px] max-h-[120px] overflow-hidden'} ${isSelected ? 'bg-[#3DCD58]/5 ring-2 ring-[#3DCD58] ring-inset z-10' : 'hover:bg-gray-50'} ${!isCurrentMonth && viewMode === 'month' ? 'opacity-30' : ''}`}
                                    >
                                        <div className="flex justify-between items-center mb-1 shrink-0">
                                            <span className={`text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-[#3DCD58] text-white shadow-sm' : 'text-gray-500'}`}>
                                                {d.getDate()}
                                            </span>
                                            {dayItems.length > 0 && <span className="text-[8px] font-black text-[#3DCD58] bg-[#3DCD58]/10 px-1 py-0.5 rounded-full">{dayItems.length}</span>}
                                        </div>
                                        <div className="flex flex-col gap-0.5 overflow-hidden">
                                            {(viewMode === 'day' ? dayItems : dayItems.slice(0, 3)).map(item => (
                                                <div
                                                    key={item.id}
                                                    className={`w-full max-w-full truncate px-1 py-0.5 rounded shadow-sm border ${viewMode === 'day' ? 'text-xs p-2 mb-1' : 'text-[8px]'} ${item.type === 'task' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                        item.type === 'history' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                            item.type === 'note' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                                'bg-orange-50 text-orange-600 border-orange-100'
                                                        }`}
                                                >
                                                    <span className="font-bold">{item.type.toUpperCase()}:</span> {item.title}
                                                </div>
                                            ))}
                                            {dayItems.length > 3 && viewMode !== 'day' && <div className="text-[7px] font-bold text-gray-400 pl-0.5 italic">+ {dayItems.length - 3} more</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Agenda Sidebar */}
                <div className="w-[450px] bg-white border-l flex flex-col shadow-2xl z-20 shrink-0">
                    <div className="p-6 border-b bg-gray-50/50 shrink-0">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-black text-gray-800">{LABELS.agenda}</h3>
                            <span className="text-sm font-bold text-gray-500">
                                {selectedDay ? new Date(selectedDay).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }) : LABELS.selectDay}
                            </span>
                        </div>
                        <button
                            onClick={() => { setFormData({ ...formData, date: selectedDay || new Date().toISOString().split('T')[0] }); setShowCreateModal(true); }}
                            className="w-full flex items-center justify-center gap-2 bg-[#3DCD58] text-white py-2 rounded-xl text-xs font-black hover:bg-[#2db64a] transition-all shadow-md active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> {LABELS.newItem}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30 overflow-x-hidden">
                        {selectedDayItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 opacity-60">
                                <Info className="w-12 h-12" />
                                <p className="text-center font-bold">{LABELS.noActivities}</p>
                            </div>
                        ) : (
                            selectedDayItems.map(item => (
                                <div key={item.id} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group flex flex-col gap-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className={`p-2 rounded-xl shrink-0 ${item.type === 'task' ? 'bg-blue-100 text-blue-600' : item.type === 'history' ? 'bg-emerald-100 text-emerald-600' : item.type === 'note' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'}`}>
                                                {item.type === 'task' ? <CheckCircle className="w-5 h-5" /> : item.type === 'history' ? <History className="w-5 h-5" /> : item.type === 'note' ? <FileText className="w-5 h-5" /> : <Timer className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS[item.type as keyof typeof LABELS]}</div>
                                                <input
                                                    className="text-sm font-black text-gray-800 bg-transparent border-none p-0 w-full focus:ring-0 focus:bg-gray-50 rounded truncate transition-colors"
                                                    value={item.title}
                                                    onChange={(e) => updateItem(item, item.type === 'history' ? { content: e.target.value } : { title: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedItem(item)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100 text-[#3DCD58] flex items-center gap-1 text-[10px] font-bold uppercase shrink-0">
                                            {LABELS.details} <ArrowRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                                        <div className="flex items-center gap-2 truncate pr-2">
                                            <div className="p-1 bg-gray-100 rounded text-gray-500 shrink-0"><Briefcase className="w-3 h-3" /></div>
                                            <span className="text-[10px] font-bold text-gray-500 truncate">{item.opportunityTitle}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {item.type === 'task' && (
                                                <select
                                                    className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase border-none focus:ring-0 cursor-pointer ${item.status === 'Done' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                                                    value={item.status}
                                                    onChange={(e) => updateItem(item, { status: e.target.value })}
                                                >
                                                    <option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Done">Done</option><option value="On Hold">On Hold</option><option value="Canceled">Canceled</option>
                                                </select>
                                            )}
                                            {item.type === 'hours' && (
                                                <input type="number" step="0.5" className="w-12 text-[9px] font-black bg-orange-50 text-orange-700 border-none p-1 rounded focus:ring-0" value={item.data.hours} onChange={(e) => updateItem(item, { hours: parseFloat(e.target.value) })} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in duration-200">
                        <div className="p-6 border-b bg-gray-50/50 flex justify-between items-center">
                            <h3 className="text-xl font-black text-gray-800">{LABELS.createItem}</h3>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                        </div>
                        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.opportunity} <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" placeholder={LABELS.searchOpp} value={targetOppId ? opportunities.find(o => o.id === targetOppId)?.title || targetOppId : oppSearch} onChange={(e) => { setOppSearch(e.target.value); if (targetOppId) setTargetOppId(''); }} className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#3DCD58] outline-none text-sm transition-all" />
                                    {!targetOppId && filteredOppsForSearch.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                            {filteredOppsForSearch.map(opp => (
                                                <button key={opp.id} onClick={() => { setTargetOppId(opp.id); setOppSearch(''); }} className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-0">
                                                    <div className="text-sm font-bold text-gray-800">{opp.title}</div>
                                                    <div className="text-[10px] text-gray-400 font-mono">{opp.id}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {(['task', 'history', 'note', 'hours'] as TrackingItemType[]).map(type => (
                                    <button key={type} onClick={() => setNewItemType(type)} className={`py-2 rounded-xl text-[10px] font-black uppercase border ${newItemType === type ? 'bg-[#3DCD58] text-white border-[#3DCD58]' : 'bg-white text-gray-500 border-gray-200'}`}>{LABELS[type as keyof typeof LABELS]}</button>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.date}</label>
                                    <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-gray-200 outline-none text-sm" />
                                </div>
                                {newItemType === 'task' && (
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.priority}</label>
                                        <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })} className="w-full px-4 py-2 rounded-xl border border-gray-200 outline-none text-sm">
                                            <option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">{newItemType === 'history' ? LABELS.content : LABELS.titleField}</label>
                                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder={newItemType === 'history' ? 'Ex: Sent follow-up email' : 'Ex: Review documentation...'} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none text-sm" />
                            </div>
                            {(newItemType === 'note' || newItemType === 'task') && (
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.description}</label>
                                    <textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={3} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none text-sm resize-none" />
                                </div>
                            )}
                            {newItemType === 'hours' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.hours}</label>
                                        <input type="number" step="0.5" value={formData.hours} onChange={(e) => setFormData({ ...formData, hours: parseFloat(e.target.value) })} className="w-full px-4 py-2 rounded-xl border border-gray-200 outline-none text-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.area}</label>
                                        <select value={formData.areaId} onChange={(e) => setFormData({ ...formData, areaId: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-gray-200 outline-none text-sm">
                                            <option value="">{LABELS.selectArea}</option>
                                            {targetOppId && opportunities.find(o => o.id === targetOppId)?.kpis?.areasInvolved.map(area => (<option key={area.id} value={area.id}>{area.area}</option>))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-gray-50 border-t flex gap-3">
                            <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-200 transition-all">{LABELS.cancel}</button>
                            <button onClick={() => {
                                if (!targetOppId) return alert('Select an opportunity');
                                const opp = opportunities.find(o => o.id === targetOppId);
                                if (!opp) return;
                                const updatedOpp = { ...opp };
                                if (newItemType === 'task') {
                                    const newTask: Task = { id: Math.random().toString(36).substr(2, 9), title: formData.title, description: formData.content, status: 'Pending', priority: formData.priority, owner: 'Me', responsible: '', externalAreas: [], dueDate: formData.date, subtasks: [], order: (opp.tasks.length || 0) + 1, stageContext: opp.stage, dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false };
                                    updatedOpp.tasks = [...opp.tasks, newTask];
                                } else if (newItemType === 'history') {
                                    const newHistory: HistoryEntry = { id: Math.random().toString(36).substr(2, 9), date: formData.date, content: formData.title };
                                    updatedOpp.history = [...opp.history, newHistory];
                                } else if (newItemType === 'note') {
                                    const newNote: MeetingNote = { id: Math.random().toString(36).substr(2, 9), date: formData.date, type: 'General', title: formData.title, content: formData.content, attendees: '' };
                                    updatedOpp.notes = [...opp.notes, newNote];
                                } else if (newItemType === 'hours') {
                                    if (!formData.areaId) return alert('Select an area');
                                    const areaIdx = updatedOpp.kpis?.areasInvolved.findIndex(a => a.id === formData.areaId);
                                    if (areaIdx === -1 || areaIdx === undefined) return;
                                    const calendar = { ...(updatedOpp.kpis!.areasInvolved[areaIdx].calendar || {}) };
                                    calendar[formData.date] = { type: 'Worked', hours: formData.hours };
                                    updatedOpp.kpis!.areasInvolved[areaIdx] = { ...updatedOpp.kpis!.areasInvolved[areaIdx], calendar };
                                }
                                onUpdateOpportunity?.(updatedOpp); setShowCreateModal(false); setFormData({ ...formData, title: '', content: '', hours: 0 });
                            }} className="flex-[2] px-4 py-3 bg-[#3DCD58] text-white rounded-xl text-sm font-black shadow-lg hover:bg-[#2db64a] transition-all">{LABELS.create}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Focused Subview Modal */}
            {selectedItem && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-6 border-b bg-gray-50/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${selectedItem.type === 'task' ? 'bg-blue-100 text-blue-600' : selectedItem.type === 'history' ? 'bg-emerald-100 text-emerald-600' : selectedItem.type === 'note' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {selectedItem.type === 'task' ? <CheckCircle className="w-5 h-5" /> : selectedItem.type === 'history' ? <History className="w-5 h-5" /> : selectedItem.type === 'note' ? <FileText className="w-5 h-5" /> : <Timer className="w-5 h-5" />}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xl font-black text-gray-800">{LABELS[selectedItem.type as keyof typeof LABELS]} {LABELS.details}</h3>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">{selectedItem.opportunityTitle}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                        </div>
                        <div className="p-8 space-y-6 overflow-y-auto">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.titleField}</label>
                                    <input className="w-full text-xl font-bold text-gray-900 border-none p-2 bg-gray-50 rounded-xl focus:ring-2 focus:ring-[#3DCD58]" value={selectedItem.title} onChange={(e) => updateItem(selectedItem, selectedItem.type === 'history' ? { content: e.target.value } : { title: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.date}</label>
                                        <input type="date" className="w-full text-sm text-gray-700 bg-gray-50 p-2 rounded-xl border-none focus:ring-2 focus:ring-[#3DCD58]" value={selectedItem.date} onChange={(e) => updateItem(selectedItem, selectedItem.type === 'task' ? { dueDate: e.target.value } : { date: e.target.value })} />
                                    </div>
                                    {selectedItem.type === 'task' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.status}</label>
                                            <select className="w-full text-sm font-bold bg-gray-50 p-2 rounded-xl border-none focus:ring-2 focus:ring-[#3DCD58] uppercase" value={selectedItem.status} onChange={(e) => updateItem(selectedItem, { status: e.target.value as any })}>
                                                <option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Done">Done</option><option value="On Hold">On Hold</option><option value="Canceled">Canceled</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                                {(selectedItem.type === 'task' || selectedItem.type === 'note') && (
                                    <div className="space-y-1 pt-4 border-t">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.description}</label>
                                        <textarea className="w-full text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-4 rounded-xl border-none focus:ring-2 focus:ring-[#3DCD58] resize-none" rows={5} value={selectedItem.type === 'task' ? selectedItem.data.description : selectedItem.data.content} onChange={(e) => updateItem(selectedItem, selectedItem.type === 'task' ? { description: e.target.value } : { content: e.target.value })} />
                                    </div>
                                )}
                                {selectedItem.type === 'hours' && (
                                    <div className="space-y-4 pt-4 border-t">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.area}</label><p className="p-2 text-sm font-bold text-gray-800">{selectedItem.data.area}</p></div>
                                            <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{LABELS.hours}</label><input type="number" step="0.5" className="w-full text-sm font-bold bg-gray-50 p-2 rounded-xl border-none focus:ring-2 focus:ring-[#3DCD58]" value={selectedItem.data.hours} onChange={(e) => updateItem(selectedItem, { hours: parseFloat(e.target.value) })} /></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 border-t flex gap-3">
                            <button onClick={() => setSelectedItem(null)} className="px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-200 transition-all border">{LABELS.cancel}</button>

                            <button onClick={() => {
                                onSelectOpp?.(selectedItem.opportunityId, { tab: 'folder' });
                                setSelectedItem(null);
                            }} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-white transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                <FolderOpen className="w-3.5 h-3.5 text-gray-400" /> {LABELS.openOpp}
                            </button>

                            <button onClick={() => {
                                let deeplink: DeepLink | undefined;
                                if (selectedItem.type === 'task') deeplink = { tab: 'tasks', taskId: selectedItem.id };
                                else if (selectedItem.type === 'note') deeplink = { tab: 'notes', noteId: selectedItem.id };
                                else if (selectedItem.type === 'history') deeplink = { tab: 'history', eventId: selectedItem.id };
                                else if (selectedItem.type === 'hours') deeplink = { tab: 'kpi', focusDate: selectedItem.date };

                                onSelectOpp?.(selectedItem.opportunityId, deeplink);
                                setSelectedItem(null);
                            }} className="flex-[1.5] px-4 py-3 bg-[#3DCD58] text-white rounded-xl text-sm font-black shadow-lg hover:bg-[#2db64a] transition-all flex items-center justify-center gap-2">
                                <ExternalLink className="w-4 h-4" /> {LABELS.view} {LABELS[selectedItem.type as keyof typeof LABELS]}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
