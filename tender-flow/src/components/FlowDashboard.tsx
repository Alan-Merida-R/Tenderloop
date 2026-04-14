import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { StandardItem, ExecutiveFlowCase, Priority, ResponseStatus, ItemResponse, ItemType } from '../types';
import { getVisibleItems, getAreaStatus, getStageStatus, isStageLocked, isItemLocked, evaluateStatus } from '../engine/evaluator';
import { MOCK_STANDARD, getSystemItems, SYSTEM_QUESTIONS_AREA } from '../engine/mockStandard';
import { parseExcelSheet, generateTemplateExcel, parseProjectExcel, parseLoopDatabase, parseLoopJsonDatabase } from '../services/excelParser';
import { workspaceManager } from '../services/storage';
import { exportToWord, exportToExcel } from '../services/exporter';
import { ChecklistWizard } from './ChecklistWizard';
import { QuestionDetailPanel } from './QuestionDetailPanel';
// PERF FIX: 'xlsx' (700KB) was imported statically but never used directly in this file.
// All Excel operations go through excelParser.ts and exporter.ts which import xlsx themselves.
// Removing this dead import cuts ~700KB from the FlowDashboard bundle parse cost.
import { DecisionMap } from './DecisionMap';
import { StructureEditor } from './StructureEditor';
import { ExecutiveDecisionMap } from './ExecutiveDecisionMap';
import { EnginePanel, ZeroStateOverlay } from './WorkspaceEngines';
import { WorkspaceStatus, TenderFlowWorkspace, RecentDB } from '../types';
import { 
  ChevronRight, Search, Filter, Map as MapIcon, Users, ClipboardCheck, 
  AlertCircle, ExternalLink, MessageSquare, Flag, MoreHorizontal, CheckCircle2, 
  Clock, ShieldAlert, FileUp, FileDown, LayoutList, GitBranch, Save, Plus, 
  FolderOpen, ArrowUpRight, Download, X, Briefcase, RefreshCw, Edit2, Lock, 
  Link as LinkIcon, Database, Eye, EyeOff, ChevronDown, AlertTriangle, Trash2, Zap,
  FileText, FileSpreadsheet, Sun, Moon, PieChart, Activity, Unlock, Terminal, Check
} from 'lucide-react';

/**
 * Tender Executive Flow - Dashboard Core
 * ---------------------------------------
 * Este componente es el núcleo de la matriz estratégica de Tender Flow.
 * Implementa una arquitectura de alto rendimiento diseñada para una experiencia corporativa fluida.
 * 
 * Optimizaciones de Fluidez:
 * 1. Memoización de Componentes: Uso de React.memo para evitar re-renders de la lista completa.
 * 2. GPU Acceleration: Estilos CSS optimizados con will-change para animaciones sedosas.
 * 3. Debounce de Búsqueda: Filtrado asíncrono para mantener la responsividad del UI.
 */

// Optimized Memoized Item Component for High-Fluidity Dashboard
// Este sub-componente maneja el renderizado individual de cada punto de decisión.
// Al usar React.memo, solo se re-renderiza cuando su respuesta específica o estado cambia.
const MemoizedBackboneItem = React.memo(({
  item,
  resp,
  locked,
  selectedItemId,
  setSelectedItemId,
  isMeetingMode,
  handleDetailUpdate,
  activeBackboneAreas
}: any) => {
  const currentStatus = evaluateStatus(resp);
  const isDone = currentStatus === 'answered' || currentStatus === 'confirmed';
  const areaDef = activeBackboneAreas.find((a: any) => a.name === item.area);
  const areaColor = areaDef?.color || 'var(--te-accent-500)';

  // LOCAL STATE for text inputs — UI updates instantly, parent notified after 250ms pause.
  // This prevents the heavy FlowDashboard re-render pipeline from running on every keystroke.
  const [localValue, setLocalValue] = useState(resp?.value || '');
  const [localNote, setLocalNote] = useState(resp?.note || '');
  const [localLabel, setLocalLabel] = useState(resp?.linkInfo?.label || '');
  const valueDebounceRef = useRef<any>(null);
  const noteDebounceRef = useRef<any>(null);
  const labelDebounceRef = useRef<any>(null);

  // Sync local state when the response changes from outside (e.g. mirror sync, reset)
  useEffect(() => { setLocalValue(resp?.value || ''); }, [resp?.value]);
  useEffect(() => { setLocalNote(resp?.note || ''); }, [resp?.note]);
  useEffect(() => { setLocalLabel(resp?.linkInfo?.label || ''); }, [resp?.linkInfo?.label]);

  // Cleanup pending debounces on unmount
  useEffect(() => () => {
    if (valueDebounceRef.current) clearTimeout(valueDebounceRef.current);
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    if (labelDebounceRef.current) clearTimeout(labelDebounceRef.current);
  }, []);

  const handleValueChange = (val: string) => {
    setLocalValue(val);
    if (valueDebounceRef.current) clearTimeout(valueDebounceRef.current);
    valueDebounceRef.current = setTimeout(() => {
      handleDetailUpdate(item.id, { value: val, status: val.trim() ? 'answered' : 'not_started' });
    }, 250);
  };

  const handleNoteChange = (val: string) => {
    setLocalNote(val);
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    noteDebounceRef.current = setTimeout(() => {
      handleDetailUpdate(item.id, { note: val });
    }, 250);
  };

  const handleLabelChange = (val: string) => {
    setLocalLabel(val);
    if (labelDebounceRef.current) clearTimeout(labelDebounceRef.current);
    labelDebounceRef.current = setTimeout(() => {
      handleDetailUpdate(item.id, { linkInfo: { ...resp?.linkInfo, label: val } });
    }, 250);
  };

  return (
    <div style={{ opacity: locked ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
      <div
        onClick={isMeetingMode ? undefined : () => setSelectedItemId(item.id)}
        style={{
          borderRadius: '12px',
          background: 'var(--te-bg-card)',
          border: `1px solid ${selectedItemId === item.id ? areaColor : 'var(--te-border)'}`,
          borderLeft: `4px solid ${locked ? 'var(--te-text-muted)' : areaColor}`,
          cursor: isMeetingMode ? 'default' : 'pointer',
          overflow: 'hidden',
          filter: locked && isMeetingMode ? 'grayscale(0.8)' : 'none',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform, opacity',
          pointerEvents: isMeetingMode && locked ? 'none' : 'auto',
        }}
      >
        {/* Question header row */}
        <div style={{
          padding: isMeetingMode ? '0.55rem 1rem' : '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          opacity: locked && !isMeetingMode ? 0.5 : 1,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isDone ? areaColor : 'transparent', border: `2px solid ${areaColor}`, opacity: locked ? 0.4 : 1, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
             <div style={{ fontSize: '0.55rem', color: locked ? 'var(--te-text-muted)' : areaColor, fontWeight: 900, opacity: 0.8 }}>{item.area} / {item.stage}</div>
             <h4 style={{ fontSize: isMeetingMode ? '0.88rem' : '1rem', fontWeight: 800, margin: 0, color: locked ? 'var(--te-text-muted)' : 'var(--te-text-main)' }}>{item.content}</h4>
          </div>
          {item.syncId && <div style={{ fontSize: '0.45rem', color: 'var(--te-emerald-500)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 5px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px', opacity: locked ? 0.3 : 1, flexShrink: 0 }}><LinkIcon size={7} /> MIRROR</div>}
          {locked && isMeetingMode && <Lock size={12} color="var(--te-text-muted)" style={{ opacity: 0.5, flexShrink: 0 }} />}
        </div>

        {/* Inline response area — integrated within the card, no separate floating panel */}
        {isMeetingMode && (
          <div style={{
            borderTop: '1px solid var(--te-border)',
            padding: '0.55rem 1rem 0.65rem',
            background: 'rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}>
            {/* Type label + reset button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.5rem', fontWeight: 950, color: 'var(--te-text-muted)', opacity: 0.55, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {
                  (item.allowedValues && item.allowedValues.length > 0) ? 'SELECTION' :
                  item.responseType === 'boolean' ? 'DECISION' :
                  (item.responseType === 'text' || item.responseType === 'string' || item.responseType === 'any') ? 'OPEN QUESTION' :
                  item.responseType === 'date' ? 'TARGET DATE' :
                  item.itemType === 'link' ? 'RESOURCE / LINK' :
                  item.responseType.toUpperCase()
                }
              </div>
              {!locked && resp?.value && (
                <button
                  onClick={(e: any) => { e.stopPropagation(); handleDetailUpdate(item.id, { value: '', status: 'not_started' }); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--te-text-muted)', opacity: 0.5, transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
                  title="Reset Response"
                >
                  <X size={10} />
                </button>
              )}
            </div>

            {/* MAIN INPUT AREA — open text (excludes link items which need Label+URL fields) */}
            {((item.responseType === 'text' || item.responseType === 'string' || item.responseType === 'any') && item.itemType !== 'link' && (!item.allowedValues || item.allowedValues.length === 0)) ? (
              <textarea
                value={localValue}
                onChange={(e) => handleValueChange(e.target.value)}
                placeholder={locked ? "Prerequisites pending..." : "Execution notes or outcomes..."}
                disabled={locked}
                style={{
                  width: '100%',
                  minHeight: '60px',
                  maxHeight: '130px',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  padding: '0.5rem 0.6rem',
                  color: locked ? 'var(--te-text-muted)' : 'white',
                  resize: 'vertical',
                  fontSize: '0.8rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {/* SPECIALIZED VALUE FIELDS */}
                {item.itemType === 'link' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div>
                      <label style={{ fontSize: '0.5rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'block' }}>Label</label>
                      <input
                        type="text"
                        value={localLabel}
                        onChange={(e) => handleLabelChange(e.target.value)}
                        placeholder="e.g. Documentation Portal"
                        style={{ width: '100%', padding: '0.45rem 0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '7px', color: 'white', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.5rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'block' }}>Hyperlink</label>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <LinkIcon size={11} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                          <input
                            type="text"
                            value={resp?.value || ''}
                            onChange={(e) => handleDetailUpdate(item.id, { value: e.target.value, status: e.target.value ? 'answered' : 'not_started' })}
                            placeholder="https://..."
                            style={{ width: '100%', padding: '0.45rem 0.5rem 0.45rem 1.8rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', color: 'white', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                        {resp?.value && (
                          <button onClick={() => window.open(resp.value.startsWith('http') ? resp.value : `https://${resp.value}`, '_blank')} style={{ padding: '0.45rem 0.5rem', borderRadius: '7px', background: 'var(--te-accent-600)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ExternalLink size={11} /></button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {item.responseType === 'date' && (
                  <div style={{ position: 'relative' }}>
                    <Clock size={11} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                    <input
                      type="date"
                      value={resp?.value || ''}
                      onChange={(e) => handleDetailUpdate(item.id, { value: e.target.value, status: e.target.value ? 'answered' : 'not_started' })}
                      style={{ width: '100%', padding: '0.45rem 0.5rem 0.45rem 1.8rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', color: 'white', fontSize: '0.75rem', outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {item.responseType === 'number' && (
                  <input
                    type="number"
                    value={resp?.value || ''}
                    onChange={(e) => handleDetailUpdate(item.id, { value: e.target.value, status: e.target.value ? 'answered' : 'not_started' })}
                    placeholder="Enter numeric value..."
                    style={{ width: '100%', padding: '0.45rem 0.5rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', color: 'white', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                )}

                {/* SHARED NOTES FIELD (Hide for selections/decisions/links) */}
                {!(item.responseType === 'boolean' || item.itemType === 'link' || (item.allowedValues && item.allowedValues.length > 0)) && (
                  <textarea
                    value={localNote}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    placeholder="Execution notes or outcomes..."
                    style={{
                      width: '100%',
                      minHeight: '30px',
                      maxHeight: '80px',
                      background: 'rgba(0,0,0,0.15)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '7px',
                      padding: '0.35rem 0.5rem',
                      color: 'var(--te-text-muted)',
                      resize: 'vertical',
                      fontSize: '0.72rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
            )}

            {/* DYNAMIC ACTION BUTTONS (selections / boolean) */}
            {((item.allowedValues && item.allowedValues.length > 0) || item.responseType === 'boolean') && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {(item.allowedValues && item.allowedValues.length > 0) ? (
                  item.allowedValues.map((val: any) => (
                    <button
                      key={val}
                      onClick={() => handleDetailUpdate(item.id, { value: val, status: 'answered' })}
                      disabled={locked}
                      style={{
                        padding: '0.35rem 0.7rem',
                        borderRadius: '7px',
                        background: resp?.value === val ? 'var(--te-accent-600)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${resp?.value === val ? 'var(--te-accent-400)' : 'rgba(255,255,255,0.12)'}`,
                        color: locked ? 'var(--te-text-muted)' : 'white',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        cursor: locked ? 'not-allowed' : 'pointer',
                        opacity: locked ? 0.5 : 1,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      {val.toUpperCase()}
                    </button>
                  ))
                ) : item.responseType === 'boolean' && (
                  <>
                    <button
                      onClick={() => handleDetailUpdate(item.id, { value: 'YES', status: 'answered' })}
                      disabled={locked}
                      style={{ flex: 1, padding: '0.4rem', borderRadius: '7px', background: resp?.value === 'YES' ? 'var(--te-emerald-600)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: locked ? 'var(--te-text-muted)' : 'white', fontSize: '0.65rem', fontWeight: 900, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1 }}>YES</button>
                    <button
                      onClick={() => handleDetailUpdate(item.id, { value: 'NO', status: 'answered' })}
                      disabled={locked}
                      style={{ flex: 1, padding: '0.4rem', borderRadius: '7px', background: resp?.value === 'NO' ? 'var(--te-rose-600)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: locked ? 'var(--te-text-muted)' : 'white', fontSize: '0.65rem', fontWeight: 900, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1 }}>NO</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export const FlowDashboard: React.FC = () => {
  // --- CORE WORKSPACE STATE ---
  const [workspace, setWorkspace] = useState<TenderFlowWorkspace | null>(workspaceManager.getWorkspace());
  const [wsStatus, setWsStatus] = useState<WorkspaceStatus>(workspaceManager.getStatus());
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  // --- UI STATE ---
  const [isDarkMode, setIsDarkMode] = useState(workspace?.settings?.theme !== 'light');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search to prevent heavy filter recalculation on every key stroke
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'checklist' | 'map' | 'executive_map'>('checklist');
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedTextId, setExpandedTextId] = useState<string | null>(null);
  const [hideCommon, setHideCommon] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isMeetingMode, setIsMeetingMode] = useState(false);
  const [hideAnswered, setHideAnswered] = useState(() => localStorage.getItem('te_hide_answered') === 'true');
  const [hideLocked, setHideLocked] = useState(false);
  const [expandedInlineId, setExpandedInlineId] = useState<string | null>(null);
  const [isDelivDropdownOpen, setIsDelivDropdownOpen] = useState(false);

  // Persist hideAnswered filter to localStorage
  useEffect(() => {
    localStorage.setItem('te_hide_answered', String(hideAnswered));
  }, [hideAnswered]);

  // --- SYNC STATE (TenderLoop) ---
  const [loopDb, setLoopDb] = useState<any[]>(() => {
    const cached = localStorage.getItem('te_loop_db_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [loopDbName, setLoopDbName] = useState<string | null>(localStorage.getItem('te_loop_db_name'));

  // --- COMPUTED SYNC ---
  const currentCase = useMemo(() => {
    if (!workspace) return null;
    if (activeCaseId) return workspace.cases.find(c => c.id === activeCaseId) || workspace.cases[0] || null;
    return workspace.cases.find(c => c.metadata.status === 'active') || workspace.cases[0] || null;
  }, [workspace, activeCaseId]);

  const standardItems = useMemo(() => workspace?.standard.questions || [], [workspace]);
  const stagesData = useMemo(() => workspace?.standard.stages || [], [workspace]);
  const areasData = useMemo(() => workspace?.standard.areas || [], [workspace]);
  const deliverablesData = useMemo(() => workspace?.standard.deliverables || [], [workspace]);

  const activeBackboneItems = useMemo(() => currentCase?.snapshot?.questions || standardItems, [currentCase, standardItems]);
  const activeBackboneStages = useMemo(() => currentCase?.snapshot?.stages || stagesData, [currentCase, stagesData]);
  const activeBackboneAreas = useMemo(() => currentCase?.snapshot?.areas || areasData, [currentCase, areasData]);
  const activeBackboneDeliverables = useMemo(() => currentCase?.snapshot?.deliverables || deliverablesData, [currentCase, deliverablesData]);

  // Compute logic-visible items once and share between visibleItems and hasPendingActions.
  // Previously getVisibleItems was called twice per render (once here, once in hasPendingActions),
  // doubling the full dependency-evaluation cost on every response change.
  const logicVisibleItems = useMemo(() => {
    if (!currentCase) return [] as typeof activeBackboneItems;
    return getVisibleItems(activeBackboneItems, currentCase.responses);
  }, [activeBackboneItems, currentCase]);

  const visibleItems = useMemo(() => {
    if (!currentCase) return [];
    const baseItems = isEditMode ? activeBackboneItems : logicVisibleItems;
    
    // Performance: Consolidated single-pass filtering
    const q = debouncedSearch.toLowerCase();
    const hasAreas = selectedAreas.length > 0;
    const hasStages = selectedStages.length > 0;
    const hasDelivs = selectedDeliverables.length > 0;
    const seenSyncIds = new Set<string>();
    const isRoadmap = viewMode === 'checklist';
    const isStrategist = viewMode === 'executive_map';

    return baseItems.filter(i => {
      // 0. Hide Actions in Roadmap/Strategist
      if ((isRoadmap || isStrategist) && (i.itemType === 'action' || i.itemType === 'task')) return false;

      // 1. Search filter
      if (q) {
        const match = i.content.toLowerCase().includes(q) || 
                      i.area.toLowerCase().includes(q) || 
                      i.stage.toLowerCase().includes(q) ||
                      (i.tags && i.tags.some(t => t.toLowerCase().includes(q)));
        if (!match) return false;
      }

      // 2. Metadata filters
      if (hasAreas && !selectedAreas.includes(i.area)) return false;
      if (hasStages && !selectedStages.includes(i.stage)) return false;
      if (hasDelivs && (!i.deliverableTarget || !i.deliverableTarget.some(d => selectedDeliverables.includes(d)))) return false;
      
      if (hideCommon && (i.stage.toLowerCase() === 'intake' || i.stage.toLowerCase() === 'common')) return false;

      // 3. Status filters (Answered / Locked)
      const resp = currentCase.responses[i.id];
      const isAns = resp?.status === 'answered' || resp?.status === 'confirmed';
      if (hideAnswered && isAns) return false;
      if (hideLocked && isItemLocked(i, currentCase.responses).locked) return false;

      // 4. Roadmap Deduplication
      if (isRoadmap && i.syncId) {
        if (seenSyncIds.has(i.syncId)) return false;
        seenSyncIds.add(i.syncId);
      }

      return true;
    });
  }, [logicVisibleItems, activeBackboneItems, currentCase, debouncedSearch, selectedAreas, selectedStages, hideCommon, isEditMode, viewMode, hideAnswered, hideLocked, selectedDeliverables]);

  const areaStatuses = useMemo(() => getAreaStatus(activeBackboneItems, currentCase?.responses || {}), [activeBackboneItems, currentCase]);
  const stagesList = useMemo(() => activeBackboneStages.filter(s => s.active !== false).sort((a,b) => a.order - b.order).map(s => s.name), [activeBackboneStages]);

  const answeredResponses = useMemo(() => {
    if (!currentCase) return [];
    const visibleIds = new Set(visibleItems.map(i => i.id));
    const resps = Object.values(currentCase.responses) as ItemResponse[];
    
    const seenSyncIds = new Set<string>();
    const uniqueResps: ItemResponse[] = [];

    resps
      .filter(r => (r.status === 'answered' || r.status === 'confirmed') && visibleIds.has(r.itemId))
      .sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .forEach(r => {
        const item = activeBackboneItems.find(i => i.id === r.itemId);
        const sId = item?.syncId;
        if (sId) {
          if (!seenSyncIds.has(sId)) {
            seenSyncIds.add(sId);
            uniqueResps.push(r);
          }
        } else {
          uniqueResps.push(r);
        }
      });

    return uniqueResps;
  }, [currentCase, visibleItems, activeBackboneItems]);

  // PERF: Pre-build a flat Map<id|name → task/op> from loopDb so syncWithLoop is O(N)
  // instead of O(N×M). With 100 linked items and 1000 DB rows, this reduces ~100K iterations to ~100.
  const loopTaskMap = useMemo(() => {
    const map = new Map<string, any>();
    if (!loopDb || loopDb.length === 0) return map;
    loopDb.forEach((op: any) => {
      const opId = String(op.id || op.Task_ID || op.TaskID || op.taskId || op._id || op.ID || op['#'] || '').trim().toUpperCase();
      const opName = String(op.name || op.content || op.Task || op.keyName || '').trim().toUpperCase();
      if (opId) map.set(opId, op);
      if (opName && opName !== opId) map.set(opName, op);
      if (op.tasks && Array.isArray(op.tasks)) {
        op.tasks.forEach((t: any) => {
          const tId = String(t.id || t.Task_ID || t.TaskID || t.taskId || t._id || t.Index || t.order || '').trim().toUpperCase();
          const tName = String(t.name || t.content || t.Task || t.Name || '').trim().toUpperCase();
          if (tId) map.set(tId, t);
          if (tName && tName !== tId) map.set(tName, t);
        });
      }
    });
    return map;
  }, [loopDb]);

  const hasPendingActions = useMemo(() => {
    if (!currentCase) return false;
    // Reuse logicVisibleItems (already computed above) instead of calling getVisibleItems again.
    return logicVisibleItems.some(i =>
      i.itemType === 'action' &&
      (!currentCase.responses[i.id] ||
       currentCase.responses[i.id].status === 'not_started' ||
       currentCase.responses[i.id].status === 'pending')
    );
  }, [logicVisibleItems, currentCase]);

  const handleDeleteCase = useCallback((caseId: string) => {
    if (!workspace) return;
    if (workspace.cases.length <= 1) {
       alert("Cannot delete the last remaining project.");
       return;
    }
    if (!window.confirm("ARE YOU SURE YOU WANT TO DELETE THIS PROJECT? This action cannot be undone.")) return;
    
    const updated = { ...workspace, cases: workspace.cases.filter(c => c.id !== caseId) };
    setWorkspace(updated);
    if (activeCaseId === caseId) setActiveCaseId(updated.cases[0].id);
    workspaceManager.markDirty(updated);
  }, [workspace, activeCaseId]);

  // --- STARTUP ---
  useEffect(() => {
    workspaceManager.setCallbacks(
      (s) => setWsStatus(s),
      (ws) => setWorkspace(ws)
    );
    const initialWS = workspaceManager.getWorkspace();
    if (initialWS) setWorkspace(initialWS);
    else workspaceManager.tryAutoReopen();
    handleAutoLoadLoopDb();
  }, []);

  const handleAutoLoadLoopDb = async () => {
    const handle = await workspaceManager.getLoopDbHandle();
    if (handle) {
      try {
        const file = await handle.getFile();
        let data: any[] = [];
        if (file.name.endsWith('.json')) {
          const text = await file.text();
          data = parseLoopJsonDatabase(text);
        } else {
          const buffer = await file.arrayBuffer();
          data = parseLoopDatabase(buffer);
        }
        setLoopDb(data);
        setLoopDbName(handle.name);
        // Guard: only cache to localStorage if the payload is small enough (~2MB).
        // Large databases would exceed the 5-10MB quota and throw synchronously,
        // freezing the main thread on low-RAM machines.
        try {
          const cacheStr = JSON.stringify(data);
          if (cacheStr.length < 2_000_000) {
            localStorage.setItem('te_loop_db_cache', cacheStr);
            localStorage.setItem('te_loop_db_name', handle.name);
          } else {
            // DB is too large for localStorage; keep it in memory only.
            localStorage.removeItem('te_loop_db_cache');
            localStorage.setItem('te_loop_db_name', handle.name);
          }
        } catch (e) {
          // Quota exceeded — keep in memory only, don't crash.
          console.warn('Loop DB too large for localStorage cache, keeping in memory only.');
        }
      } catch (e) {
        console.warn('Loop DB handle expired or inaccessible');
      }
    }
  };

  // NEW: Auto-refresh data when user refocuses the tab
  useEffect(() => {
    const handleFocus = () => {
      console.log("[SYNC] Tab focused, checking for Loop DB updates...");
      handleAutoLoadLoopDb();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // SYNC CORE — PERF: O(N) via loopTaskMap instead of the previous O(N×M) nested loop
  const syncWithLoop = useCallback(() => {
    if (!currentCase || !loopDb || loopDb.length === 0) return;
    let hasChanges = false;
    const nextResponses = { ...currentCase.responses };
    const isDoneVariations = new Set(['DONE', 'TERMINADO', 'COMPLETADO', 'COMPLETED', 'FINALIZADO', 'LISTO', 'TRUE', '1', 'FINISHED', 'CONCLUDED', 'OK', 'READY', 'YES']);

    activeBackboneItems.forEach(item => {
      if (!item.linkedTaskId) return;
      const rawId = String(item.linkedTaskId).trim().toUpperCase();
      const loopTask = loopTaskMap.get(rawId);
      if (!loopTask) return;

      const rawStatus = (loopTask.status || loopTask.Status || loopTask.taskStatus || loopTask.state || loopTask.isDone || loopTask.completed || loopTask.done || '').toString();
      const loopStatus = rawStatus.trim().toUpperCase();
      const currentResp = nextResponses[item.id];
      const isDoneInLoop = isDoneVariations.has(loopStatus) || loopTask.completed === true || loopTask.isDone === true || loopTask.done === true;
      const targetStatus = isDoneInLoop ? 'answered' : 'not_started';
      const targetValue = isDoneInLoop ? 'COMPLETED (LOOP)' : 'PENDING (LOOP)';
      if (!currentResp || currentResp.status !== targetStatus || currentResp.value !== targetValue || !currentResp.isSynced) {
        nextResponses[item.id] = {
          ...(currentResp || { itemId: item.id, isFlagged: false, isLocked: false, note: '' }),
          status: targetStatus, value: targetValue, isSynced: true, updatedAt: new Date().toISOString()
        };
        hasChanges = true;
      }
    });

    if (hasChanges && workspace) {
      const nextCase = { ...currentCase, responses: nextResponses };
      const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
      setWorkspace(updatedWs);
      workspaceManager.markDirty(updatedWs);
    }
  }, [currentCase, loopDb, loopTaskMap, activeBackboneItems, workspace]);

  useEffect(() => {
    if (loopDb.length > 0) syncWithLoop();
  }, [loopDb, activeCaseId, activeBackboneItems]); // Added items for instant reaction when linking

  const handleSaveStandard = useCallback((data: any) => {
    if (!workspace) return;
    if (currentCase && currentCase.snapshot) {
       const updatedCase = { ...currentCase, snapshot: { ...currentCase.snapshot, ...data } };
       const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? updatedCase : c) };
       setWorkspace(updatedWs);
       workspaceManager.markDirty(updatedWs);
    } else {
       const updated = { ...workspace, standard: data };
       setWorkspace(updated);
       workspaceManager.markDirty(updated);
    }
    setIsEditorOpen(false);
  }, [workspace, currentCase]);

  const handleUpdateStandardItem = useCallback((itemId: string, updates: Partial<StandardItem>) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    
    const targetItem = currentCase.snapshot.questions.find(q => q.id === itemId);
    const syncableFields: (keyof StandardItem)[] = ['content', 'itemType', 'responseType', 'allowedValues', 'priority', 'mandatory', 'tags', 'deliverableTarget'];
    const hasSyncableChanges = Object.keys(updates).some(k => syncableFields.includes(k as any));

    const updatedSnapshot = { 
      ...currentCase.snapshot, 
      questions: currentCase.snapshot.questions.map(q => {
        const isTarget = q.id === itemId;
        const isMirror = targetItem?.syncId && q.syncId === targetItem.syncId;
        
        if (isTarget) return { ...q, ...updates };
        if (isMirror && hasSyncableChanges) {
          const syncUpdates: any = {};
          Object.keys(updates).forEach(k => {
            if (syncableFields.includes(k as any)) syncUpdates[k] = (updates as any)[k];
          });
          return { ...q, ...syncUpdates };
        }
        return q;
      }) 
    };
    handleSaveStandard(updatedSnapshot);
  }, [currentCase, handleSaveStandard, workspace]);

  const handleToggleTheme = useCallback(() => {
    if (!workspace) return;
    const nextTheme = isDarkMode ? 'light' : 'dark';
    const updated = { ...workspace, settings: { ...workspace.settings, theme: nextTheme as any } };
    setIsDarkMode(!isDarkMode);
    setWorkspace(updated);
    workspaceManager.markDirty(updated);
  }, [workspace, isDarkMode]);

  const handleDeleteStandardItem = useCallback((itemId: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    if (!window.confirm("Are you sure?")) return;
    const updatedSnapshot = { ...currentCase.snapshot, questions: currentCase.snapshot.questions.filter(q => q.id !== itemId) };
    handleSaveStandard(updatedSnapshot);
    if (selectedItemId === itemId) setSelectedItemId(null);
  }, [currentCase, handleSaveStandard, selectedItemId]);

  const handleDuplicateTask = useCallback((taskId: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    const target = currentCase.snapshot.questions.find(q => q.id === taskId);
    if (!target) return;
    
    // Ensure both items share a syncId to keep responses in sync
    const syncId = target.syncId || target.id;
    let baseQuestions = currentCase.snapshot.questions;

    if (!target.syncId) {
       // Update original to have the syncId too in the same snapshot update
       baseQuestions = baseQuestions.map(q => q.id === taskId ? { ...q, syncId } : q);
    }

    const clone = { 
      ...target, 
      id: `Q_CLONE_${Date.now()}`, 
      syncId,
      content: `${target.content} (Copy)`, 
      visualPosition: { x: (target.visualPosition?.x || 0) + 100, y: (target.visualPosition?.y || 0) + 100 } 
    };
    handleSaveStandard({ ...currentCase.snapshot, questions: [...baseQuestions, clone] });
  }, [currentCase, handleSaveStandard, workspace]);

  const handleCloneTask = useCallback((taskId: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    const target = currentCase.snapshot.questions.find(q => q.id === taskId);
    if (!target) return;

    const clone = { 
      ...target, 
      id: `Q_CLONE_${Date.now()}`, 
      syncId: undefined, // CLONE is independent
      content: `${target.content} (Copy)`, 
      visualPosition: { x: (target.visualPosition?.x || 0) + 100, y: (target.visualPosition?.y || 0) + 100 } 
    };
    handleSaveStandard({ ...currentCase.snapshot, questions: [...currentCase.snapshot.questions, clone] });
  }, [currentCase, handleSaveStandard, workspace]);

  const handleAddGlobalDeliverable = useCallback((name: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    const exists = (currentCase.snapshot.deliverables || []).some(d => d.name.toLowerCase() === name.toLowerCase());
    if (exists) return;

    const newDeliv = { id: `D_${Date.now()}`, name, order: (currentCase.snapshot.deliverables || []).length + 1, active: true };
    const updated = { ...currentCase.snapshot, deliverables: [...(currentCase.snapshot.deliverables || []), newDeliv] };
    handleSaveStandard(updated);
  }, [currentCase, handleSaveStandard, workspace]);

  const handleResetChecklist = useCallback(() => {
    if (!workspace || !currentCase) return;
    if (!window.confirm("ARE YOU SURE?")) return;
    const nextCase = { ...currentCase, responses: {} };
    const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
    setWorkspace(updatedWs);
    workspaceManager.markDirty(updatedWs);
  }, [workspace, currentCase]);

  const handleAddDependency = useCallback((sourceId: string, targetId: string) => {
    if (!currentCase?.snapshot) return;
    const updatedItems = currentCase.snapshot.questions.map(item => {
      if (item.id === targetId) {
        const rules = item.dependencyRules || [];
        if (!rules.some(r => r.targetId === sourceId)) return { ...item, dependencyRules: [...rules, { targetId: sourceId, operator: 'any_value' }] };
      }
      return item;
    });
    handleSaveStandard({ ...currentCase.snapshot, questions: updatedItems });
  }, [currentCase, handleSaveStandard]);

  const handleUpdateDependency = useCallback((targetItemId: string, sourceItemId: string, newValue: string) => {
    if (!currentCase?.snapshot) return;
    const updatedItems = currentCase.snapshot.questions.map(item => {
      if (item.id === targetItemId) {
        const rules = (item.dependencyRules || []).map(rule => rule.targetId === sourceItemId ? { ...rule, operator: 'equals', value: newValue } : rule);
        return { ...item, dependencyRules: rules };
      }
      return item;
    });
    handleSaveStandard({ ...currentCase.snapshot, questions: updatedItems });
  }, [currentCase, handleSaveStandard]);

  // Stable callback for DecisionMap mirror-filter so it doesn't force Effect A
  // (structural rebuild) to re-run on every FlowDashboard render.
  const handleMirrorFilter = useCallback((text: string) => {
    setSearchQuery(prev => (prev === text ? '' : text));
  }, []); // setSearchQuery is stable (setState), no deps needed

  // PERF FIX: Render-body refs so handleDetailUpdate/handleUpdateLoopTask can have
  // empty deps [] and never get a new reference, making React.memo fully effective.
  // The "always-latest ref" pattern: assign during render (not in useEffect) so the
  // ref is always current before any event fires.
  const currentCaseRef = useRef(currentCase);
  currentCaseRef.current = currentCase;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const activeBackboneItemsRef = useRef(activeBackboneItems);
  activeBackboneItemsRef.current = activeBackboneItems;
  const loopDbRef = useRef(loopDb);
  loopDbRef.current = loopDb;

  // Stable — never recreated. Reads latest values from refs at call time.
  const handleUpdateLoopTask = useCallback(async (taskId: string, newStatus: string) => {
    const loopDb = loopDbRef.current;
    let hasChanges = false;
    const nextLoopDb = (loopDb as any[]).map(op => {
        let opTasks = op.tasks || [];
        let tasksChanged = false;
        const nextTasks = opTasks.map((t: any) => {
            const tId = String(t.id || t.Task_ID || t.TaskID || t.taskId || t._id || t.Index || t.order || '').trim().toUpperCase();
            if (tId === taskId.trim().toUpperCase()) {
                tasksChanged = true;
                return { ...t, status: newStatus, completed: newStatus.toUpperCase() === 'DONE' };
            }
            return t;
        });
        const opId = String(op.id || op.Task_ID || op.TaskID || op.taskId || op._id || op.ID || op['#'] || '').trim().toUpperCase();
        if (opId === taskId.trim().toUpperCase()) {
            hasChanges = true;
            return { ...op, status: newStatus, completed: newStatus.toUpperCase() === 'DONE' };
        }
        if (tasksChanged) { hasChanges = true; return { ...op, tasks: nextTasks }; }
        return op;
    });
    if (hasChanges) {
        setLoopDb(nextLoopDb);
        const handle = await workspaceManager.getLoopDbHandle();
        if (handle && handle.name.endsWith('.json')) {
            try {
               const writable = await handle.createWritable();
               await writable.write(JSON.stringify({ ...JSON.parse(await (await handle.getFile()).text()), opportunities: nextLoopDb }, null, 2));
               await writable.close();
            } catch (e) { console.warn("Could not write back to Loop JSON file.", e); }
        }
    }
  }, []); // stable — reads loopDbRef.current at call time

  // PERF FIX: useCallback with empty deps [] so this function NEVER gets a new reference.
  // With the previous [currentCase, workspace, activeBackboneItems, loopDb] deps, every
  // response change (every keystroke) recreated the function → React.memo on every
  // MemoizedBackboneItem was bypassed → all N cards re-rendered per keystroke.
  // Now the callback reads currentCaseRef/workspaceRef at call time instead of closing
  // over the state values, achieving correctness without dependency churn.
  const handleDetailUpdate = useCallback((itemId: string, updates: Partial<ItemResponse> | null) => {
    const currentCase = currentCaseRef.current;
    const workspace = workspaceRef.current;
    const activeBackboneItems = activeBackboneItemsRef.current;
    if (!currentCase || !workspace) return;
    let nextResponses = { ...currentCase.responses };
    if (updates === null) { delete nextResponses[itemId]; }
    else {
      const trimmed = String(updates.value || '').trim();
      if (updates.value !== undefined) updates.status = trimmed === '' ? 'not_started' : 'answered';

      const newResponse = {
        ...(nextResponses[itemId] || { itemId, value: '', status: 'not_started', isFlagged: false, isLocked: false, updatedAt: new Date().toISOString() }),
        ...updates, updatedAt: new Date().toISOString()
      };
      nextResponses[itemId] = newResponse;

      // MIRROR SYNC: Update all other items with the same syncId
      const item = activeBackboneItems.find(i => i.id === itemId);
      if (item?.syncId) {
        activeBackboneItems.forEach(other => {
          if (other.syncId === item.syncId && other.id !== itemId) {
            if (updates === null) {
              delete nextResponses[other.id];
            } else {
              nextResponses[other.id] = {
                ...(nextResponses[other.id] || { itemId: other.id, value: '', status: 'not_started', isFlagged: false, isLocked: false, updatedAt: new Date().toISOString() }),
                ...updates,
                itemId: other.id,
                updatedAt: new Date().toISOString()
              };
            }
          }
        });
      }
    }
    const nextCase = { ...currentCase, responses: nextResponses };
    const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
    setWorkspace(updatedWs);
    workspaceManager.markDirty(updatedWs);

    // TWO-WAY SYNC: If this is an action and has a linkedTaskId, update Loop DB too
    const item = activeBackboneItems.find(i => i.id === itemId);
    if (item?.linkedTaskId && loopDbRef.current.length > 0 && updates?.value !== undefined) {
       handleUpdateLoopTask(item.linkedTaskId, String(updates.value));
    }
  }, []); // stable — reads all values from refs at call time

  const handleExportWordAction = () => exportToWord(currentCase!, activeBackboneItems);
  const handleExportExcelAction = () => exportToExcel(currentCase!, activeBackboneItems, activeBackboneStages, activeBackboneAreas, activeBackboneDeliverables);

  const handleCreateNew = (newCase: ExecutiveFlowCase, sourceId?: string, excelBackbone?: any) => {
    if (!workspace) return;
    let sourceSnapshot = workspace.standard;
    if (excelBackbone) sourceSnapshot = excelBackbone;
    else if (sourceId) {
      const source = workspace.cases.find(c => c.id === sourceId);
      if (source?.snapshot) sourceSnapshot = source.snapshot;
    }
    const createRes = (id: string, val: any) => ({ 
      itemId: id, 
      value: val, 
      status: (String(val||'').trim()===''?'not_started':'answered') as ResponseStatus, 
      updatedAt: new Date().toISOString(), 
      isFlagged: false, 
      isLocked: false 
    });
    const initialResponses: Record<string, ItemResponse> = {
      'SYS_ALIAS': createRes('SYS_ALIAS', newCase.metadata.name), 'SYS_OPID': createRes('SYS_OPID', newCase.loopId),
      'SYS_COMPANY': createRes('SYS_COMPANY', newCase.metadata.customer), 'SYS_AMOUNT': createRes('SYS_AMOUNT', newCase.initialWizData.estimatedAmount),
      'SYS_ADDRESS': createRes('SYS_ADDRESS', newCase.initialWizData.customerAddress), 'SYS_DUEDATE': createRes('SYS_DUEDATE', newCase.initialWizData.dueDate),
      'SYS_SELLER': createRes('SYS_SELLER', newCase.initialWizData.sellerName)
    };
    const combinedQuestions = [...getSystemItems()];
    sourceSnapshot.questions.forEach(q => {
      if (!combinedQuestions.some(cq => cq.id === q.id)) {
        combinedQuestions.push(q);
      }
    });

    const withSnapshot = { 
      ...newCase, responses: initialResponses,
      snapshot: { 
        questions: combinedQuestions.map(q => ({...q, active: true})), 
        stages: [{ id: 'STG_INTAKE', name: 'Intake', order: 0, active: true }, ...sourceSnapshot.stages.filter(s => s.name !== 'Intake')], 
        areas: [{ id: 'AREA_GENERAL', name: 'General', order: 0, active: true, color: '#3b82f6' }, ...sourceSnapshot.areas.filter(a => a.name !== 'General')],
        deliverables: (sourceSnapshot as any).deliverables || []
      } 
    };
    const updated = { ...workspace, cases: [...workspace.cases, withSnapshot] };
    setWorkspace(updated); setActiveCaseId(withSnapshot.id); workspaceManager.markDirty(updated); setIsWizardOpen(false);
  };

  const handleImportExcelAction = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspace) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const { questions, stages, areas, responses, metadata } = parseProjectExcel(buffer);
        const nc: ExecutiveFlowCase = { id: `CASE_${Date.now()}`, keyName: metadata.name||'', loopId: metadata.loopId||'TF-IMP', metadata: { name: metadata.name||'', customer: metadata.customer||'Imported', status: 'active', createdAt: new Date().toISOString(), lastModified: new Date().toISOString(), standardVersion: '3.1', isArchived: false }, responses: responses||{}, snapshot: { questions, stages, areas }, initialWizData: { proposalType: 'Standard', scopeTags: [], estimatedAmount: 0, dueDate: '', state: '', city: '', customerAddress: '', salesOwner: '', sellerName: '' }, activeFilters: { areas: [], stages: [], priorities: [], deliverables: [] } };
        const updated = { ...workspace, cases: [...workspace.cases, nc] };
        setWorkspace(updated); setActiveCaseId(nc.id); workspaceManager.markDirty(updated);
      } catch (err) { alert("Excel Import failed."); }
      finally { setIsImporting(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  /**
   * IMPORT RESPONSES FROM EXCEL (Round-trip)
   * Reads a previously-exported Excel file and merges the Answer/Status columns
   * back into the CURRENT case's responses without touching the question structure.
   * This enables the workflow: Export → edit responses in Excel → re-import.
   *
   * Rules:
   * - Only existing question IDs are updated (new IDs in Excel are ignored).
   * - Existing responses that are NOT present in the Excel are left untouched.
   * - An empty Answer cell clears the response for that item (status → not_started).
   * - Notes, Is Flagged columns are also merged when present.
   */
  const handleImportResponsesFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspace || !currentCase) return;

    // Reset the input so the same file can be re-selected after changes
    e.target.value = '';

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const { responses: importedResponses } = parseProjectExcel(buffer);

        // Build the set of valid question IDs in the current case
        const validIds = new Set(activeBackboneItems.map(i => i.id));

        const nextResponses = { ...currentCase.responses };
        let mergedCount = 0;
        let clearedCount = 0;

        Object.entries(importedResponses).forEach(([id, resp]) => {
          if (!validIds.has(id)) return; // Skip unknown IDs

          const trimmedValue = String(resp.value || '').trim();
          if (trimmedValue === '') {
            // Empty answer → clear the response (preserve flags/notes if present)
            if (nextResponses[id]) {
              nextResponses[id] = {
                ...nextResponses[id],
                value: '',
                status: 'not_started',
                updatedAt: new Date().toISOString()
              };
              clearedCount++;
            }
          } else {
            // Merge: existing response fields are preserved; imported fields win
            const existing = nextResponses[id] || { itemId: id, value: '', status: 'not_started' as const, isFlagged: false, isLocked: false, note: '' };
            nextResponses[id] = {
              ...existing,
              value: trimmedValue,
              status: (resp.status === 'answered' || resp.status === 'confirmed') ? resp.status : 'answered',
              isFlagged: resp.isFlagged ?? existing.isFlagged ?? false,
              note: resp.note || existing.note || '',
              updatedAt: new Date().toISOString()
            };
            mergedCount++;
          }
        });

        const nextCase = { ...currentCase, responses: nextResponses };
        const updatedWs = {
          ...workspace,
          cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c)
        };
        setWorkspace(updatedWs);
        workspaceManager.markDirty(updatedWs);

        alert(`Responses imported: ${mergedCount} updated, ${clearedCount} cleared.`);
      } catch (err) {
        console.error('Import Responses failed:', err);
        alert('Failed to import responses from Excel. Check the file format.');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className={`te-app-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`} style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--te-bg-app)', color: 'var(--te-text-main)', overflow: 'hidden' }}>
      {!workspace && <ZeroStateOverlay onOpenDB={() => workspaceManager.openWorkspace()} onNewDB={() => workspaceManager.newWorkspace()} />}
      
      <aside className="te-sidebar" style={{ width: '260px', background: 'var(--te-primary-900)', color: 'white', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--te-border)', zIndex: 100 }}>
        <div style={{ padding: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 950, display: 'flex', alignItems: 'center', gap: '0.3rem' }}><div style={{ width: 14, height: 14, background: 'var(--te-accent-500)', borderRadius: '3px', rotate: '45deg' }} />Tender Flow</h1>
          <p style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Strategic Matrix v3.1</p>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
          <button onClick={() => setIsWizardOpen(true)} className="te-btn te-btn-primary" style={{ width: '100%', marginBottom: '1.5rem', background: 'var(--te-emerald-500)' }}><Plus size={16} /> NEW CHECKLIST</button>
          <div onClick={() => setIsProjectsCollapsed(!isProjectsCollapsed)} style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>PROJECTS <ChevronDown size={12} style={{ transform: isProjectsCollapsed ? 'rotate(-90deg)' : '' }} /></div>
          {!isProjectsCollapsed && workspace?.cases.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.1rem 1rem 0.1rem 0.5rem', marginBottom: '4px' }}>
                <div onClick={() => setActiveCaseId(c.id)} style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: currentCase?.id === c.id ? 'rgba(59,130,246,0.15)' : 'transparent', color: currentCase?.id === c.id ? 'var(--te-accent-500)' : 'rgba(255,255,255,0.6)', fontWeight: currentCase?.id === c.id ? 900 : 500, overflow: 'hidden', flex: 1, border: currentCase?.id === c.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent' }}><Database size={14} style={{ flexShrink: 0 }} /> <span>{c.metadata.name}</span></div>
                {workspace.cases.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteCase(c.id); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.15)', cursor: 'pointer', padding: '6px', borderRadius: '6px' }} title="Delete Project"><Trash2 size={12} /></button>
                )}
            </div>
          ))}
          <div style={{ padding: '1.5rem 1rem 0.5rem 1rem', fontSize: '0.65rem', fontWeight: 900, opacity: 0.4 }}>STATEMENTS</div>
          {stagesList.map(stg => {
            const isSelected = selectedStages.includes(stg);
            return (
              <div key={stg} onClick={() => setSelectedStages(isSelected ? selectedStages.filter(s => s !== stg) : [...selectedStages, stg])} style={{ padding: '0.6rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: isSelected ? 'var(--te-emerald-400)' : 'rgba(255,255,255,0.4)', background: isSelected ? 'rgba(16,185,129,0.1)' : 'transparent', fontWeight: isSelected ? 900 : 500, opacity: selectedStages.length > 0 && !isSelected ? 0.3 : 1 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid currentColor', background: isSelected ? 'currentColor' : 'transparent' }} /><span>{stg.toUpperCase()}</span>
              </div>
            );
          })}
          <div onClick={() => setIsEditorOpen(true)} style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'rgba(255,255,255,0.7)' }}><LayoutList size={14} /> STRUCTURE EDITOR</div>
        </nav>
        <div style={{ padding: '1.5rem' }}>
           <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                   <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>WORKSPACE_DB.sys</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--te-accent-500)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspace?.metadata.name || 'Disconnected'}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                   <button title="Refresh Data" onClick={() => handleAutoLoadLoopDb()} style={{ background: 'var(--te-primary-700)', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><RefreshCw size={14} className={wsStatus === 'Saving' ? 'spin-slow' : ''} /></button>
                   <button title="Open DB" onClick={() => workspaceManager.openWorkspace()} style={{ background: 'var(--te-primary-700)', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><FolderOpen size={14} /></button>
                </div>
              </div>
              
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <div className={wsStatus === 'Synced' ? '' : 'spin-slow'} style={{ width: 8, height: 8, borderRadius: '50%', background: wsStatus === 'Synced' ? 'var(--te-emerald-500)' : (wsStatus === 'Save pending' || wsStatus === 'Saving' ? 'var(--te-amber-500)' : 'var(--te-rose-500)') }} />
                     <span style={{ fontSize: '0.55rem', fontWeight: 950, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{wsStatus}</span>
                  </div>
                  {wsStatus === 'Save pending' && (
                    <button 
                      onClick={() => workspaceManager.forceSave()}
                      style={{ background: 'var(--te-accent-500)', border: 'none', padding: '2px 8px', borderRadius: '4px', color: 'white', fontSize: '0.5rem', fontWeight: 950, cursor: 'pointer' }}
                    >
                      SAVE NOW
                    </button>
                  )}
              </div>
           </div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {!currentCase ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><button onClick={() => setIsWizardOpen(true)} className="te-btn te-btn-primary" style={{ padding: '1.2rem 3rem' }}><Plus size={24} /> START NEW CHECKLIST</button></div> : (
          <>
            <header style={{ padding: '1rem 2.5rem', borderBottom: '1px solid var(--te-border)', background: 'var(--te-bg-app)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '2rem' }}>
                  <div style={{ flexShrink: 0 }}><div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--te-accent-500)', marginBottom: '0.1rem' }}>Strategic Project</div><h2 style={{ fontSize: '1.4rem', fontWeight: 950, margin: 0 }}>{currentCase.metadata.name}</h2></div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <button onClick={handleExportExcelAction} className="te-btn te-btn-outline" title="Export current project to Excel"><FileSpreadsheet size={13} /> EXCEL</button>
                    {/* Hidden input for importing responses from a previously-exported Excel */}
                    <input
                      type="file" accept=".xlsx,.xls"
                      id="import-responses-input"
                      style={{ display: 'none' }}
                      onChange={handleImportResponsesFromExcel}
                    />
                    <button
                      onClick={() => document.getElementById('import-responses-input')?.click()}
                      className="te-btn te-btn-outline"
                      title="Import responses from a previously exported Excel file (merges into current project)"
                      disabled={isImporting}
                    >
                      <FileUp size={13} /> {isImporting ? '...' : 'IMPORT RESP.'}
                    </button>
                    <button onClick={handleExportWordAction} className="te-btn te-btn-outline"><FileText size={13} /> WORD</button>
                    <div style={{ width: '1px', height: '20px', background: 'var(--te-border)', margin: '0 0.5rem' }} />
                    <button onClick={() => setHideCommon(!hideCommon)} className={`te-btn te-btn-outline ${hideCommon ? 'active' : ''}`}><EyeOff size={13} /> COMMON</button>
                    <button 
                       onClick={() => setShowActions(!showActions)} 
                       className={`te-btn te-btn-outline ${showActions ? 'active' : ''}`}
                       style={{
                          boxShadow: (!showActions && hasPendingActions) ? '0 0 15px var(--te-amber-500)' : 'none',
                          borderColor: (!showActions && hasPendingActions) ? 'var(--te-amber-500)' : 'var(--te-border)',
                          animation: (!showActions && hasPendingActions) ? 'pulse-amber 2s infinite' : 'none'
                       }}
                    >
                       <Zap size={13} color={(!showActions && hasPendingActions) ? 'var(--te-amber-500)' : 'currentColor'} /> ACTIONS
                    </button>
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`te-btn te-btn-outline ${isEditMode ? 'active' : ''}`}>{isEditMode ? <Lock size={13} /> : <Unlock size={13} />} {isEditMode ? 'SAVE' : 'ENGINE'}</button>
                    <button onClick={handleToggleTheme} className="te-btn te-btn-outline" style={{ padding: '6px' }}>{isDarkMode ? <Sun size={14} /> : <Moon size={14} />}</button>
                  </div>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.8rem', width: '100%', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', background: 'var(--te-bg-card-alt)', padding: '3px', borderRadius: '12px', border: '1px solid var(--te-border)' }}>
                        <button onClick={() => setViewMode('checklist')} className={`te-btn ${viewMode === 'checklist' ? 'te-btn-primary' : ''}`}>ROADMAP</button>
                        <button onClick={() => setViewMode('map')} className={`te-btn ${viewMode === 'map' ? 'te-btn-primary' : ''}`}>FLOW</button>
                        <button onClick={() => setViewMode('executive_map')} className={`te-btn ${viewMode === 'executive_map' ? 'te-btn-primary' : ''}`}>STRATEGIST</button>
                    </div>
                    <div className="te-search-bar" style={{ position: 'relative', flex: '1', maxWidth: '450px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                        <input style={{ width: '100%', background: 'var(--te-bg-card-alt)', border: '1px solid var(--te-border)', borderRadius: '50px', padding: '0.5rem 2.4rem 0.5rem 2.4rem', outline: 'none', fontSize: '0.8rem', color: 'white' }} placeholder="Search questions or tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery('')}
                            style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                          >
                            <X size={14} />
                          </button>
                        )}
                    </div>
                  </div>
                   <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {viewMode === 'checklist' && (
                        <>
                          <button
                            onClick={() => setIsMeetingMode(!isMeetingMode)}
                            className={`te-btn ${isMeetingMode ? 'te-btn-primary' : 'te-btn-outline'}`}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1rem', borderRadius: '12px', background: isMeetingMode ? 'var(--te-emerald-500)' : 'transparent', color: isMeetingMode ? 'white' : 'var(--te-text-muted)', border: isMeetingMode ? 'none' : '1px solid var(--te-border)' }}
                          >
                            <MessageSquare size={14} /> RESPONSE
                          </button>
                          <button
                            onClick={() => setHideAnswered(!hideAnswered)}
                            className={`te-btn ${hideAnswered ? 'te-btn-primary' : 'te-btn-outline'}`}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1rem', borderRadius: '12px', background: hideAnswered ? 'var(--te-accent-600)' : 'transparent', color: hideAnswered ? 'white' : 'var(--te-text-muted)', border: hideAnswered ? 'none' : '1px solid var(--te-border)' }}
                            title="Hide completed questions"
                          >
                            {hideAnswered ? <EyeOff size={14} /> : <Eye size={14} />} HIDE DONE
                          </button>
                          {(searchQuery || selectedAreas.length > 0 || selectedStages.length > 0 || selectedDeliverables.length > 0 || hideAnswered || hideCommon || hideLocked) && (
                            <button
                              onClick={() => { setSearchQuery(''); setSelectedAreas([]); setSelectedStages([]); setSelectedDeliverables([]); setHideAnswered(false); setHideCommon(false); setHideLocked(false); }}
                              className="te-btn te-btn-outline"
                              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1rem', borderRadius: '12px', background: 'transparent', color: 'var(--te-rose-400)', border: '1px solid var(--te-rose-400)', opacity: 0.8 }}
                              title="Clear all filters"
                            >
                              <X size={13} /> CLEAR
                            </button>
                          )}
                        </>
                      )}
                      <button 
                        onClick={() => setHideLocked(!hideLocked)} 
                        className={`te-btn ${hideLocked ? 'active' : 'te-btn-outline'}`} 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1rem', borderRadius: '12px', background: hideLocked ? 'var(--te-rose-600)' : 'transparent', color: hideLocked ? 'white' : 'var(--te-text-muted)', border: hideLocked ? 'none' : '1px solid var(--te-border)' }}
                      >
                        <ShieldAlert size={14} /> MEETING
                      </button>
                      <button onClick={() => setIsAuditLogOpen(!isAuditLogOpen)} className={`te-btn ${isAuditLogOpen ? 'te-btn-primary' : 'te-btn-outline'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1.25rem', borderRadius: '12px' }}><Terminal size={14} /> OVERVIEW</button>
                   </div>
               </div>
               <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.6rem 0', borderTop: '1px solid rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={() => setIsDelivDropdownOpen(!isDelivDropdownOpen)} 
                      className="te-btn te-btn-outline" 
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', fontWeight: 950, background: selectedDeliverables.length > 0 ? 'rgba(16, 185, 129, 0.1)' : 'var(--te-bg-card)', padding: '0.4rem 0.8rem', borderRadius: '10px', border: `1px solid ${selectedDeliverables.length > 0 ? 'var(--te-emerald-500)' : 'var(--te-border)'}`, color: selectedDeliverables.length > 0 ? 'var(--te-emerald-500)' : 'var(--te-text-main)' }}
                    >
                      <Filter size={12} color={selectedDeliverables.length > 0 ? 'var(--te-emerald-500)' : 'var(--te-text-muted)'} />
                      {selectedDeliverables.length > 0 ? `${selectedDeliverables.length} SELECTED` : 'ALL DELIVERABLES'}
                      <ChevronDown size={12} style={{ transform: isDelivDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>
                    {isDelivDropdownOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setIsDelivDropdownOpen(false)} />
                        <div className="te-glass" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem', minWidth: '280px', zIndex: 120, padding: '0.8rem', borderRadius: '16px', background: 'var(--te-bg-card)', border: '1px solid var(--te-border)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', animation: 'slideInDown 0.2s ease-out' }}>
                           <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--te-border)', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--te-text-muted)', letterSpacing: '0.1em' }}>STRATEGIC_DELIVERABLES</span>
                              {selectedDeliverables.length > 0 && <button onClick={() => setSelectedDeliverables([])} style={{ background: 'transparent', border: 'none', color: 'var(--te-rose-500)', fontSize: '0.65rem', fontWeight: 950, cursor: 'pointer' }}>RESET</button>}
                           </div>
                           <div style={{ maxHeight: '350px', overflowY: 'auto' }} className="hide-scrollbar">
                              {activeBackboneDeliverables.filter(d => d.active).map(deliv => {
                                const isSelected = selectedDeliverables.includes(deliv.name);
                                return (
                                  <div key={deliv.id} onClick={() => setSelectedDeliverables(isSelected ? selectedDeliverables.filter(d => d !== deliv.name) : [...selectedDeliverables, deliv.name])} style={{ padding: '0.7rem 0.9rem', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'transparent', transition: 'all 0.2s', margin: '2px 0' }}>
                                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1px solid ${isSelected ? 'var(--te-emerald-500)' : 'var(--te-border)'}`, background: isSelected ? 'var(--te-emerald-500)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                       {isSelected && <Check size={10} color="white" strokeWidth={4} />}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 900, color: isSelected ? 'var(--te-emerald-500)' : 'var(--te-text-main)' }}>{deliv.name.toUpperCase()}</span>
                                  </div>
                                );
                              })}
                           </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ width: '1px', height: '16px', background: 'var(--te-border)' }} />
                  <div style={{ display: 'flex', gap: '0.3rem', overflowX: 'auto', flex: 1, paddingBottom: '0.2rem' }} className="hide-scrollbar">
                    {areaStatuses.map(status => {
                      const areaDef = activeBackboneAreas.find(a => a.name === status.area); const areaColor = areaDef?.color || 'var(--te-accent-500)'; const isFullyAnswered = status.percentage === 100; const isSelected = selectedAreas.includes(status.area);
                      return (
                        <div key={status.area} onClick={() => setSelectedAreas(isSelected ? selectedAreas.filter(a => a !== status.area) : [...selectedAreas, status.area])} style={{ minWidth: '150px', padding: '0.6rem 0.8rem', borderRadius: '12px', background: 'var(--te-bg-card)', border: `1px solid ${isSelected ? areaColor : 'var(--te-border)'}`, borderLeft: `3px solid ${areaColor}`, cursor: 'pointer', transition: 'all 0.2s', opacity: selectedAreas.length > 0 && !isSelected ? 0.4 : 1 }}>
                          <div style={{ fontSize: '0.55rem', fontWeight: 900, color: 'var(--te-text-muted)', marginBottom: '0.1rem', display: 'flex', justifyContent: 'space-between' }}>DEPARTMENT <div style={{ width: 5, height: 5, borderRadius: '50%', background: isFullyAnswered ? areaColor : 'transparent', border: `1px solid ${areaColor}` }} /></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', fontWeight: 900 }}>{status.area}</span><span style={{ fontSize: '0.75rem', fontWeight: 900, color: areaColor }}>{status.percentage}%</span></div>
                        </div>
                      );
                    })}
                  </div>
               </div>
            </header>


            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
               {viewMode === 'checklist' && (
                 <div style={{ height: '100%', overflowY: 'auto', padding: '2rem' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                       {(() => {
                         const checklistItems = visibleItems.filter(it => showActions || (String(it.itemType || '').toLowerCase() !== 'action'));
                         if (checklistItems.length === 0) {
                           return (
                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', gap: '0.75rem', opacity: 0.55 }}>
                               <CheckCircle2 size={32} color="var(--te-emerald-500)" />
                               <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--te-text-main)' }}>
                                 {hideAnswered ? 'No unanswered questions' : 'No questions match the current filters'}
                               </div>
                               <div style={{ fontSize: '0.75rem', color: 'var(--te-text-muted)' }}>
                                 {hideAnswered ? 'All visible questions have been answered.' : 'Try adjusting or clearing your filters.'}
                               </div>
                             </div>
                           );
                         }
                         return checklistItems.map(item => {
                           const resp = currentCase.responses[item.id];
                           const { locked } = isItemLocked(item, currentCase.responses);
                           return (
                              <MemoizedBackboneItem
                                key={item.id}
                                item={item}
                                resp={resp}
                                locked={locked}
                                selectedItemId={selectedItemId}
                                setSelectedItemId={setSelectedItemId}
                                isMeetingMode={isMeetingMode}
                                handleDetailUpdate={handleDetailUpdate}
                                activeBackboneAreas={activeBackboneAreas}
                              />
                           );
                         });
                       })()}
                    </div>
                 </div>
               )}
               {viewMode === 'map' && (
                 // Absolute-fill wrapper guarantees ReactFlow gets explicit pixel dimensions.
                 // Without this, height:100% on DecisionMap's root can resolve to 0 in some
                 // flex+overflow layouts, producing a black/empty canvas.
                 <div style={{ position: 'absolute', inset: 0 }}>
                   <DecisionMap
                     items={visibleItems.filter(it => showActions || (String(it.itemType || '').toLowerCase() !== 'action'))}
                     allItems={activeBackboneItems}
                     responses={currentCase.responses}
                     stagesList={stagesList}
                     onNodeClick={setSelectedItemId}
                     isEditMode={isEditMode}
                     onSaveStandard={handleSaveStandard}
                     stagesData={activeBackboneStages}
                     areas={activeBackboneAreas}
                     onAddDependency={handleAddDependency}
                     onUpdateDependency={handleUpdateDependency}
                     onDeleteNode={handleDeleteStandardItem}
                     onMirrorFilter={handleMirrorFilter}
                   />
                 </div>
               )}
               {viewMode === 'executive_map' && (
                 <div style={{ position: 'absolute', inset: 0 }}>
                   <ExecutiveDecisionMap items={visibleItems} responses={currentCase.responses} stages={stagesList} areas={activeBackboneAreas} onNodeClick={setSelectedItemId} />
                 </div>
               )}

               {isAuditLogOpen && (
                  <div className="te-glass" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '450px', background: 'var(--te-bg-card)', borderLeft: '1px solid var(--te-border)', zIndex: 110, display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)' }}>
                     <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--te-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--te-text-main)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic Overview</h3>
                        <button onClick={() => setIsAuditLogOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer' }}>
                           <X size={20} />
                        </button>
                     </div>
                     <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#090a10', color: '#00ff41', fontFamily: 'monospace' }}>
                        {answeredResponses.map((r, idx) => {
                          const item = activeBackboneItems.find(i => i.id === r.itemId); if (!item) return null;
                          return (
                            <div key={r.itemId} style={{ marginBottom: '1.5rem', paddingLeft: '0.75rem', borderLeft: '1px solid #00ff4133' }}>
                               {item.syncId && <div style={{ fontSize: '0.55rem', opacity: 0.5, marginBottom: '0.3rem', letterSpacing: '0.1em', fontWeight: 900 }}>MIRRORED_POINT::SYNCHRONIZED</div>}
                               <div style={{ fontSize: '0.75rem', color: '#00ff41', fontWeight: 950, letterSpacing: '0.02em', marginBottom: '0.3rem' }}>{item.content.toUpperCase()}</div>
                               <div style={{ fontSize: '0.8rem', color: 'white', marginTop: '0.25rem', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(r.value)}</div>
                            </div>
                          );
                        })}
                     </div>
                  </div>
               )}
            </div>
          </>
        )}
      </main>

      {selectedItemId && (
        <>
          <div onClick={() => setSelectedItemId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 200 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '500px', zIndex: 210, background: 'var(--te-bg-card)', borderLeft: '1px solid var(--te-border)' }}>
            <QuestionDetailPanel item={activeBackboneItems.find(i => i.id === selectedItemId) || null} response={currentCase?.responses[selectedItemId!] || null} onClose={() => setSelectedItemId(null)} onResponseChange={handleDetailUpdate} allResponses={currentCase?.responses || {}} allItems={activeBackboneItems} isEditMode={isEditMode} onEditModeToggle={() => setIsEditMode(!isEditMode)} onItemUpdate={handleUpdateStandardItem} onItemDelete={handleDeleteStandardItem} onItemDuplicate={handleDuplicateTask} onItemClone={handleCloneTask} onAddDeliverable={handleAddGlobalDeliverable} availableAreas={activeBackboneAreas} availableStages={activeBackboneStages} availableDeliverables={activeBackboneDeliverables} loopDb={loopDb} dbName={loopDbName} onLoopDbChange={(db, name) => { setLoopDb(db); setLoopDbName(name); }} />
          </div>
        </>
      )}

      {isWizardOpen && <ChecklistWizard existingCases={workspace?.cases || []} onCancel={() => setIsWizardOpen(false)} onComplete={(newCase, sourceId, excelBackbone) => handleCreateNew(newCase, sourceId, excelBackbone)} />}
      {isEditorOpen && <StructureEditor questions={activeBackboneItems} stages={activeBackboneStages} areas={activeBackboneAreas} deliverables={activeBackboneDeliverables} onSave={handleSaveStandard} onClose={() => setIsEditorOpen(false)} responses={currentCase?.responses} onResponseUpdate={handleDetailUpdate} />}
    </div>
  );
};
