import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Maximize2 } from 'lucide-react';

export type CalendarViewMode = 'month' | 'week' | 'day';

interface Props<T> {
  items: T[];
  getDate: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onDateDrop: (id: string, type: string, newDate: string, extra?: string) => void;
  onDateClick?: (date: string) => void;
  selectedDate?: string | null;
  isMaximized?: boolean;
  onMaximize?: () => void;
  className?: string;
}

export function CalendarView<T extends { id: string }>({
  items,
  getDate,
  renderItem,
  onDateDrop,
  onDateClick,
  selectedDate,
  isMaximized = false,
  onMaximize,
  className = ""
}: Props<T>) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDays = () => {
    if (viewMode === 'month') {
      const startOfMonth = new Date(year, month, 1);
      const startDay = startOfMonth.getDay(); // 0 is Sun
      const days: Date[] = [];
      const startDate = new Date(startOfMonth);
      startDate.setDate(startDate.getDate() - startDay);

      for (let i = 0; i < 42; i++) {
        days.push(new Date(startDate));
        startDate.setDate(startDate.getDate() + 1);
      }
      return days;
    } else if (viewMode === 'week') {
      // Work week (Mon-Fri)
      const d = new Date(currentDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
      const monday = new Date(d.setDate(diff));
      const days: Date[] = [];
      for (let i = 0; i < 5; i++) {
        days.push(new Date(monday));
        monday.setDate(monday.getDate() + 1);
      }
      return days;
    } else {
      // Day view
      return [new Date(currentDate)];
    }
  };

  const days = getDays();
  const monthName = currentDate.toLocaleString('en-US', { month: 'long' });

  const navigate = (amount: number, unit: 'month' | 'week' | 'year' | 'day') => {
    const next = new Date(currentDate);
    if (unit === 'month') next.setMonth(next.getMonth() + amount);
    else if (unit === 'year') next.setFullYear(next.getFullYear() + amount);
    else if (unit === 'week') next.setDate(next.getDate() + (amount * 7));
    else if (unit === 'day') next.setDate(next.getDate() + amount);
    setCurrentDate(next);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    try {
      const id = e.dataTransfer.getData('id');
      const type = e.dataTransfer.getData('type');
      const extra = e.dataTransfer.getData('extra');

      // Also check for modern JSON data (like Tracker uses)
      let finalId = id;
      let finalType = type;
      let finalExtra = extra;

      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        finalId = parsed.id;
        finalType = parsed.type;
        finalExtra = parsed.opportunityId;
      }

      if (finalId) {
        onDateDrop(finalId, finalType, dateStr, finalExtra);
      }
    } catch (err) { }
  };

  const getDayNames = () => {
    if (viewMode === 'month') return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (viewMode === 'week') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    return [currentDate.toLocaleString('en-US', { weekday: 'long' })];
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full bg-gray-50/20 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white shadow-sm shrink-0 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-black text-gray-800 min-w-[180px]">
            {viewMode === 'day' ? currentDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : `${monthName} ${year}`}
          </h2>
          <div className="flex bg-gray-100 rounded-xl p-1 border border-gray-200/50 shadow-inner">
            <button
              onClick={() => navigate(-1, 'year')}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-400 hover:text-gray-900 transition-all" title="Prev Year"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(-1, viewMode === 'month' ? 'month' : viewMode === 'week' ? 'week' : 'day')}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-400 hover:text-gray-900 transition-all mr-1" title="Prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCurrentDate(now);
                if (onDateClick) onDateClick(now.toISOString().split('T')[0]);
              }}
              className="px-4 py-1 text-[10px] font-black uppercase text-gray-500 hover:text-[#3DCD58] transition-all"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1, viewMode === 'month' ? 'month' : viewMode === 'week' ? 'week' : 'day')}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-400 hover:text-gray-900 transition-all ml-1" title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(1, 'year')}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-400 hover:text-gray-900 transition-all" title="Next Year"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onMaximize && (
            <button
              onClick={onMaximize}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-[10px] font-black text-gray-500 hover:bg-white hover:text-[#3DCD58] hover:border-[#3DCD58] transition-all shadow-inner mr-2"
            >
              <Maximize2 className={`w-3.5 h-3.5 ${isMaximized ? 'rotate-180' : ''}`} /> {isMaximized ? 'Minimize' : 'Full View'}
            </button>
          )}
          <div className="flex bg-gray-100 rounded-xl p-1 border border-gray-200/50">
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'month' ? 'bg-white text-[#3DCD58] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'week' ? 'bg-white text-[#3DCD58] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Work Week
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'day' ? 'bg-white text-[#3DCD58] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Day
            </button>
          </div>
        </div>
      </div>

      {/* Grid wrapper */}
      <div className="flex-1 overflow-y-auto min-h-0 relative bg-white">
        <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : viewMode === 'week' ? 'grid-cols-5' : 'grid-cols-1'} gap-px bg-gray-200 h-full`}>
          {getDayNames().map(d => (
            <div key={d} className="bg-gray-50/80 backdrop-blur-sm p-4 text-center text-[11px] font-black uppercase tracking-widest text-gray-500 border-b border-gray-100 sticky top-0 z-[30] min-h-[50px] flex items-center justify-center">
              {d}
            </div>
          ))}
          {(() => {
            // O(N) pre-mapping instead of O(42 * N) filters
            const itemsByDate = items.reduce((acc, item) => {
              const d = getDate(item);
              if (d) {
                if (!acc[d]) acc[d] = [];
                acc[d].push(item);
              }
              return acc;
            }, {} as Record<string, T[]>);

            return days.map((d, i) => {
              const dateStr = d.toISOString().split('T')[0];
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              const isSelected = selectedDate === dateStr;
              const isCurrentMonth = d.getMonth() === month;
              const dayItems = itemsByDate[dateStr] || [];

            return (
              <div
                key={i}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, dateStr)}
                onClick={() => onDateClick?.(dateStr)}
                className={`bg-white p-3 min-h-[140px] flex flex-col gap-1.5 transition-all relative group cursor-pointer ${!isCurrentMonth && viewMode === 'month' ? 'opacity-40' : ''} ${isSelected ? 'ring-2 ring-inset ring-[#3DCD58] bg-[#3DCD58]/5 z-10' : 'hover:bg-gray-50/80'} ${viewMode === 'day' ? 'min-h-[600px]' : ''}`}
              >
                <div className="flex justify-between items-center mb-1 shrink-0">
                  <span className={`text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-lg shadow-sm transition-all ${isToday ? 'bg-[#3DCD58] text-white' : isSelected ? 'bg-[#3DCD58]/20 text-[#3DCD58]' : 'text-gray-400 group-hover:text-gray-600'}`}>
                    {d.getDate()}
                  </span>
                  {dayItems.length > 0 && (
                    <span className="text-[9px] font-black text-[#3DCD58] bg-[#3DCD58]/10 px-1.5 py-0.5 rounded-full border border-[#3DCD58]/20">
                      {dayItems.length}
                    </span>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto scrollbar-hide">
                  {dayItems.map(item => (
                    <div key={item.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                      {renderItem(item)}
                    </div>
                  ))}
                </div>
              </div>
            );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
