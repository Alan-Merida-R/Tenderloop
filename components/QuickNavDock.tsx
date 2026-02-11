import React, { useState } from 'react';
import { X, Palette, Briefcase, CheckSquare, FileText, Activity, FileEdit } from 'lucide-react';
import { FloatingTab } from '../types';

interface QuickNavDockProps {
    tabs: FloatingTab[];
    onRestore: (id: string, split?: boolean) => void;
    onRemove: (id: string) => void;
    onUpdateColor: (id: string, color: string) => void;
    onUpdateTitle: (id: string, title: string) => void;
    onReorder?: (tabs: FloatingTab[]) => void;
    activeTabId?: string | null;
}

const PRESET_COLORS = [
    '#3DCD58', // Schneider Green
    '#3B82F6', // Blue
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#10B981', // Emerald
    '#6366F1', // Indigo
    '#64748B', // Slate
    '#06B6D4', // Cyan
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#F43F5E', // Rose
    '#84CC16', // Lime
    '#0EA5E9', // Sky
    '#A855F7', // Purple
];

export const QuickNavDock: React.FC<QuickNavDockProps> = ({ tabs, onRestore, onRemove, onUpdateColor, onUpdateTitle, onReorder, activeTabId }) => {
    const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number } | null>(null);
    const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
    const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        setContextMenu({ id, x: e.clientX, y: e.clientY });
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'opportunity': return <Briefcase className="w-5 h-5" />;
            case 'task': return <CheckSquare className="w-5 h-5" />;
            case 'note': return <FileText className="w-5 h-5" />;
            case 'tracking': return <Activity className="w-5 h-5" />;
            default: return <Activity className="w-5 h-5" />;
        }
    };

    const handleDragStart = (id: string) => {
        setDraggedId(id);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;
        const draggedIndex = tabs.findIndex(t => t.id === draggedId);
        const targetIndex = tabs.findIndex(t => t.id === targetId);
        const newTabs = [...tabs];
        const [movedTab] = newTabs.splice(draggedIndex, 1);
        newTabs.splice(targetIndex, 0, movedTab);
        onReorder?.(newTabs);
    };

    if (tabs.length === 0) return null;

    return (
        <>
            <div className="fixed right-2 top-1/2 -translate-y-1/2 z-[200] flex flex-col gap-1 p-1.5 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 rounded-3xl animate-in slide-in-from-right duration-500 h-auto max-h-[90vh] items-center justify-start overflow-hidden w-[72px]">
                <div className="flex flex-col gap-0.5 overflow-hidden items-center py-1 w-full h-full flex-grow">
                    {tabs.map(tab => (
                        <div
                            key={tab.id}
                            className={`relative group flex flex-col items-center justify-center cursor-grab active:cursor-grabbing transition-all shrink flex-1 min-h-[24px] w-full`}
                            draggable
                            onDragStart={() => handleDragStart(tab.id)}
                            onDragOver={(e) => handleDragOver(e, tab.id)}
                            onDragEnd={() => setDraggedId(null)}
                            onContextMenu={(e) => handleContextMenu(e, tab.id)}
                        >
                            {/* Direct Close Button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove(tab.id); }}
                                className="absolute top-0 right-1 z-10 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600 active:scale-90"
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>

                            <button
                                onClick={() => onRestore(tab.id)}
                                onContextMenu={(e) => handleContextMenu(e, tab.id)}
                                className={`w-12 h-12 flex-shrink rounded-xl flex items-center justify-center text-white transition-all transform hover:scale-105 active:scale-95 shadow-sm relative overflow-hidden ${activeTabId === tab.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                                style={{ backgroundColor: tab.color, maxHeight: 'calc(100% - 8px)' }}
                            >
                                {getIcon(tab.type)}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </button>

                            <span className="text-[6px] font-bold text-gray-400 uppercase tracking-tighter truncate w-full text-center px-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none h-3 shrink-0">
                                {tab.title}
                            </span>

                            {/* Tooltip */}
                            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl">
                                {tab.title}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Context Menu Backdrop */}
            {contextMenu && (
                <div className="fixed inset-0 z-[205]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-[210] bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-gray-100 p-1.5 min-w-[180px] animate-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x - 190 }}
                >
                    <button
                        onClick={() => { setEditingTitleId(contextMenu.id); setContextMenu(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                        <FileEdit className="w-4 h-4 text-gray-400" /> Edit Title
                    </button>
                    <button
                        onClick={() => setShowColorPicker(contextMenu.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                        <Palette className="w-4 h-4 text-orange-500" /> Change Color
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    <button
                        onClick={() => { onRemove(contextMenu.id); setContextMenu(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" /> Remove Tab
                    </button>
                </div>
            )}

            {/* Color Picker Overlay */}
            {showColorPicker && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setShowColorPicker(null)}>
                    <div className="bg-white p-4 rounded-3xl shadow-2xl border border-gray-100 w-full max-w-[240px] animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 text-center">Select Color</div>
                        <div className="grid grid-cols-4 gap-2">
                            {PRESET_COLORS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => { onUpdateColor(showColorPicker, color); setShowColorPicker(null); setContextMenu(null); }}
                                    className="w-10 h-10 rounded-xl hover:scale-110 active:scale-95 transition-all shadow-sm flex items-center justify-center group"
                                    style={{ backgroundColor: color }}
                                >
                                    <div className="w-2 h-2 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {editingTitleId && (() => {
                const tab = tabs.find(t => t.id === editingTitleId);
                if (!tab) return null;
                return (
                    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setEditingTitleId(null)}>
                        <div className="bg-white p-6 rounded-3xl shadow-2xl border border-gray-100 w-full max-w-[320px] animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1">Edit Title</div>
                            <input
                                autoFocus
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                defaultValue={tab.title}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        onUpdateTitle(editingTitleId, e.currentTarget.value);
                                        setEditingTitleId(null);
                                    } else if (e.key === 'Escape') {
                                        setEditingTitleId(null);
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setEditingTitleId(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50 rounded-lg">Cancel</button>
                                <button
                                    onClick={() => {
                                        const input = document.querySelector('.zoom-in input') as HTMLInputElement;
                                        onUpdateTitle(editingTitleId, input.value || tab.title);
                                        setEditingTitleId(null);
                                    }}
                                    className="px-4 py-2 text-xs font-bold bg-blue-500 text-white rounded-lg shadow-lg hover:bg-blue-600"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
};
