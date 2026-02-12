import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar as CalendarIcon } from 'lucide-react';

export type CalendarViewMode = 'month' | 'week';

interface Props<T> {
  items: T[];
  getDate: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onDateDrop: (id: string, type: string, newDate: string, extra?: string) => void;
  className?: string;
}

export function CalendarView<T extends { id: string }>({ items, getDate, renderItem, onDateDrop, className = "" }: Props<T>) {
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
    } else {
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
    }
  };

  const days = getDays();
  const monthName = currentDate.toLocaleString('en-US', { month: 'long' });

  const navigate = (amount: number, unit: 'month' | 'week' | 'year') => {
    const next = new Date(currentDate);
    if (unit === 'month') next.setMonth(next.getMonth() + amount);
    else if (unit === 'year') next.setFullYear(next.getFullYear() + amount);
    else if (unit === 'week') next.setDate(next.getDate() + (amount * 7));
    setCurrentDate(next);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('id');
    const type = e.dataTransfer.getData('type');
    const extra = e.dataTransfer.getData('extra');
    onDateDrop(id, type, dateStr, extra);
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-gray-800 min-w-[160px]">
            {monthName} {year}
          </h2>
          <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm text-xs font-medium">
            <button
              onClick={() => navigate(-1, 'year')}
              className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Prev Year"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(-1, viewMode === 'month' ? 'month' : 'week')}
              className="p-1 hover:bg-gray-100 rounded text-gray-500 border-r border-gray-100 mr-1" title="Prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2 py-1 hover:bg-gray-100 rounded text-gray-700"
            >
              Hoy
            </button>
            <button
              onClick={() => navigate(1, viewMode === 'month' ? 'month' : 'week')}
              className="p-1 hover:bg-gray-100 rounded text-gray-500 border-l border-gray-100 ml-1" title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(1, 'year')}
              className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Next Year"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${viewMode === 'month' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${viewMode === 'week' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Work Week
          </button>
        </div>
      </div>

      {/* Grid wrapper with scroll if needed */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : 'grid-cols-5'} gap-px bg-gray-200 rounded-b-xl border-t border-gray-200 shadow-inner`}>
          {(viewMode === 'month' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).map(d => (
            <div key={d} className="bg-gray-50 p-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 sticky top-0 z-20">
              {d}
            </div>
          ))}
          {days.map((d, i) => {
            const dateStr = d.toISOString().split('T')[0];
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const isCurrentMonth = d.getMonth() === month;
            const dayItems = items.filter(item => getDate(item) === dateStr);

            return (
              <div
                key={i}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, dateStr)}
                className={`bg-white p-2 min-h-[140px] flex flex-col gap-1 transition-colors hover:bg-gray-50/50 ${!isCurrentMonth && viewMode === 'month' ? 'bg-gray-50/30' : ''}`}
              >
                <div className="flex justify-between items-start mb-1 shrink-0">
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[#3DCD58] text-white shadow-sm' : 'text-gray-500'}`}>
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-hide max-h-[180px]">
                  {dayItems.map(item => (
                    <div key={item.id}>
                      {renderItem(item)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {/* Padding at the bottom to ensure the last day is fully visible */}
        <div className="h-20 bg-transparent pointer-events-none"></div>
      </div>
    </div>
  );
}
