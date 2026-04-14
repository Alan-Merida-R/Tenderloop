import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Lock, 
  Unlock, 
  Flag, 
  AlertCircle, 
  Link as LinkIcon, 
  FileText,
  Clock,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
  MessageSquare,
  Edit2,
  Trash2,
  GitBranch,
  CheckCircle2,
  Plus,
  Search,
  RefreshCw
} from 'lucide-react';
import { StandardItem, ItemResponse, ResponseStatus, ItemType } from '../types';
import { isItemLocked } from '../engine/evaluator';
import { TaskMappingModal } from './TaskMappingModal';
import { workspaceManager } from '../services/storage';
import { parseLoopDatabase, parseLoopJsonDatabase } from '../services/excelParser';

interface Props {
  item: StandardItem | null;
  response: ItemResponse | undefined;
  onClose: () => void;
  onResponseChange: (itemId: string, updates: Partial<ItemResponse> | null) => void;
  allResponses: Record<string, ItemResponse>;
  allItems: StandardItem[];
  isEditMode: boolean;
  onEditModeToggle: () => void;
  onItemUpdate: (itemId: string, updates: Partial<StandardItem>) => void;
  onItemDelete: (itemId: string) => void;
  onItemDuplicate?: (itemId: string) => void;
  onItemClone?: (itemId: string) => void;
  onAddDeliverable?: (name: string) => void;
  availableAreas?: { id: string; name: string }[];
  availableStages?: { id: string; name: string }[];
  availableDeliverables?: { id: string; name: string; order: number; active: boolean }[];
  loopDb?: any[];
  dbName?: string | null;
  onLoopDbChange?: (db: any[], name: string | null) => void;
}

/**
 * Panel Lateral Derecho - Detalle de Pregunta
 */
const QuestionDetailPanel_: React.FC<Props> = ({
  item, 
  response, 
  onClose, 
  onResponseChange, 
  allResponses, 
  allItems,
  isEditMode,
  onEditModeToggle,
  onItemUpdate,
  onItemDelete,
  onItemDuplicate,
  onItemClone,
  onAddDeliverable,
  availableAreas = [],
  availableStages = [],
  availableDeliverables = [],
  loopDb: propsLoopDb,
  dbName: propsDbName,
  onLoopDbChange
}) => {
  if (!item) return null;

  const isManualLocked = response?.isLocked ?? false;
  const { locked: isLogicLocked, reasons } = isItemLocked(item, allResponses);
  const isLocked = isManualLocked || isLogicLocked;

  const [showTaskMapper, setShowTaskMapper] = useState(false);
  const [delivSearch, setDelivSearch] = useState('');
  const [internalLoopDbName, setInternalLoopDbName] = useState<string | null>(localStorage.getItem('te_loop_db_name'));
  const [internalLoopDb, setInternalLoopDb] = useState<any[]>(() => {
    const cached = localStorage.getItem('te_loop_db_cache');
    return cached ? JSON.parse(cached) : [];
  });

  // PERF: Local state for text inputs — UI updates instantly, parent notified after 250ms.
  // Prevents every keystroke from triggering handleDetailUpdate → setWorkspace → full re-render.
  const [localTextValue, setLocalTextValue] = useState(response?.value != null ? String(response.value) : '');
  const [localNoteValue, setLocalNoteValue] = useState(response?.note || '');
  const [localLinkLabel, setLocalLinkLabel] = useState(response?.linkInfo?.name || '');
  const [localLinkUrl, setLocalLinkUrl] = useState(response?.linkInfo?.url || '');
  const textDebounceRef = useRef<any>(null);
  const noteDebounceRef = useRef<any>(null);
  const linkLabelDebounceRef = useRef<any>(null);
  const linkUrlDebounceRef = useRef<any>(null);

  // Always-latest refs so debounced callbacks use the freshest value of both link fields
  const localLinkLabelRef = useRef(localLinkLabel);
  localLinkLabelRef.current = localLinkLabel;
  const localLinkUrlRef = useRef(localLinkUrl);
  localLinkUrlRef.current = localLinkUrl;

  // Sync local state when the response is reset/updated from outside (e.g. mirror sync, import)
  useEffect(() => { setLocalTextValue(response?.value != null ? String(response.value) : ''); }, [response?.value]);
  useEffect(() => { setLocalNoteValue(response?.note || ''); }, [response?.note]);
  useEffect(() => {
    setLocalLinkLabel(response?.linkInfo?.name || '');
  }, [response?.linkInfo?.name]);
  useEffect(() => { setLocalLinkUrl(response?.linkInfo?.url || ''); }, [response?.linkInfo?.url]);

  // Cleanup pending debounce timers on unmount
  useEffect(() => () => {
    if (textDebounceRef.current) clearTimeout(textDebounceRef.current);
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    if (linkLabelDebounceRef.current) clearTimeout(linkLabelDebounceRef.current);
    if (linkUrlDebounceRef.current) clearTimeout(linkUrlDebounceRef.current);
  }, []);

  // PERF: Pre-build Map for O(1) lookups instead of O(N) find() per dependency rule per render
  const allItemsMap = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems]);

  const loopDb = propsLoopDb || internalLoopDb;
  const loopDbName = propsDbName || internalLoopDbName;

  const handleLoadLoopDb = async () => {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          { description: 'Loop Database (JSON/Excel)', accept: { 'application/json': ['.json'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }
        ]
      });
      const file = await handle.getFile();
      let data: any[] = [];
      
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        data = parseLoopJsonDatabase(text);
      } else {
        const buffer = await file.arrayBuffer();
        data = parseLoopDatabase(buffer);
      }
      
      if (onLoopDbChange) {
         onLoopDbChange(data, handle.name);
      } else {
        setInternalLoopDb(data);
        setInternalLoopDbName(handle.name);
      }
      
      localStorage.setItem('te_loop_db_cache', JSON.stringify(data));
      localStorage.setItem('te_loop_db_name', handle.name);
      
      await workspaceManager.setLoopDbHandle(handle);
    } catch (e) {
      console.error('Failed to load Loop DB', e);
    }
  };

  React.useEffect(() => {
    // Only used if not provided via props (standalone mode)
    if (!propsLoopDb && internalLoopDb.length === 0) {
       // Optional: could trigger a local auto-load here if needed
    }
  }, [propsLoopDb, internalLoopDb.length]);

  const handleUpdate = (updates: Partial<ItemResponse>) => {
    if (isLocked && !('isLocked' in updates)) return;
    onResponseChange(item.id, updates);
  };

  const renderInput = () => {
    if (item.itemType === 'boolean') {
      return (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          {['Yes', 'No', 'N/A'].map(opt => (
            <button
              key={opt}
              disabled={isLocked}
              onClick={() => handleUpdate({ value: opt, status: 'answered' })}
              className={`te-btn ${response?.value === opt ? 'te-btn-primary' : 'te-btn-outline'}`}
              style={{ flex: 1, opacity: isLocked ? 0.6 : 1 }}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }

    if (item.itemType === 'decision' || item.itemType === 'select') {
      const options = item.allowedValues || (item.itemType === 'decision' ? ['Yes', 'No', 'TBD'] : []);
      const currentValue = response?.value; 
      
      if (item.isMultipleSelection) {
        const values = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
        const toggleValue = (val: string) => {
          const newValues = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
          handleUpdate({ value: newValues, status: 'answered' });
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            {options.map(opt => (
              <div 
                key={opt} 
                onClick={() => !isLocked && toggleValue(opt)}
                style={{ 
                  padding: '0.75rem 1rem', 
                  background: values.includes(opt) ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)', 
                  border: `1px solid ${values.includes(opt) ? 'var(--te-accent-500)' : 'var(--te-border)'}`,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.6 : 1
                }}
              >
                <div style={{ width: '16px', height: '16px', border: '2px solid var(--te-accent-500)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: values.includes(opt) ? 'var(--te-accent-500)' : 'transparent' }}>
                   {values.includes(opt) && <X size={12} color="var(--te-bg-app)" />}
                </div>
                <span style={{ fontSize: '0.9rem', color: values.includes(opt) ? 'var(--te-accent-500)' : 'var(--te-text-main)', fontWeight: 600 }}>{opt}</span>
              </div>
            ))}
          </div>
        );
      }

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          {options.map(opt => (
            <button
              key={opt}
              disabled={isLocked}
              onClick={() => handleUpdate({ value: opt, status: 'answered' })}
              className={`te-btn ${currentValue === opt ? 'te-btn-primary' : 'te-btn-outline'}`}
              style={{ width: '100%', padding: '0.8rem', textAlign: 'left', fontWeight: 700, fontSize: '0.85rem' }}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }

    if (item.itemType === 'action') {
      const statuses = ['Pending', 'In Progress', 'Done', 'On Hold', 'Missing Info', 'Canceled'];
      const currentValue = response?.value || 'Pending';
      const isSynced = !!response?.isSynced;

      return (
        <div style={{ marginTop: '1rem' }}>
          {isSynced && (
            <div style={{ padding: '0.6rem 1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--te-emerald-500)', borderRadius: '10px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
               <RefreshCw size={14} color="var(--te-emerald-500)" className="spin-slow" />
               <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 950, color: 'var(--te-emerald-500)', textTransform: 'uppercase' }}>SYNCED WITH LOOP</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'white' }}>{currentValue.replace(' (LOOP)', '')}</div>
               </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', opacity: isSynced ? 0.6 : 1 }}>
            {statuses.map(status => (
              <button
                key={status}
                disabled={isLocked || isSynced}
                onClick={() => handleUpdate({ value: status, status: status === 'Done' ? 'answered' : 'pending', isSynced: false })}
                className={`te-btn ${currentValue.includes(status) ? 'te-btn-primary' : 'te-btn-outline'}`}
                style={{ padding: '0.6rem 0.4rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}
              >
                {status}
              </button>
            ))}
          </div>
          {isSynced && (
             <button 
               onClick={() => handleUpdate({ isSynced: false })}
               style={{ width: '100%', marginTop: '1rem', background: 'none', border: 'none', color: 'var(--te-text-muted)', fontSize: '0.65rem', textDecoration: 'underline', cursor: 'pointer', fontWeight: 900 }}
             >
                BREAK SYNC & MODIFY MANUALLY
             </button>
          )}

          <div style={{ marginTop: '1.5rem' }}>
             <label style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Task Notes / Comments</label>
             <textarea
               placeholder="Write additional details about this action..."
               value={localNoteValue}
               onChange={(e) => {
                 const val = e.target.value;
                 setLocalNoteValue(val);
                 if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
                 noteDebounceRef.current = setTimeout(() => handleUpdate({ note: val }), 250);
               }}
               style={{ width: '100%', height: '80px', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8rem', outline: 'none', resize: 'none' }}
             />
          </div>
        </div>
      );
    }

    if (item.itemType === 'link') {
       const inputStyle = { width: '100%', padding: '0.8rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' };
       return (
         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
           <div>
             <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Etiqueta</label>
             <input
               disabled={isLocked}
               placeholder="Ej: Portal de Documentación"
               value={localLinkLabel}
               onChange={(e) => {
                 const val = e.target.value;
                 setLocalLinkLabel(val);
                 if (linkLabelDebounceRef.current) clearTimeout(linkLabelDebounceRef.current);
                 linkLabelDebounceRef.current = setTimeout(() => {
                   handleUpdate({ linkInfo: { name: localLinkLabelRef.current, url: localLinkUrlRef.current }, status: 'answered', value: localLinkLabelRef.current });
                 }, 250);
               }}
               style={inputStyle}
             />
           </div>
           <div>
             <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Hipervínculo</label>
             <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  disabled={isLocked}
                  placeholder="https://..."
                  value={localLinkUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalLinkUrl(val);
                    if (linkUrlDebounceRef.current) clearTimeout(linkUrlDebounceRef.current);
                    linkUrlDebounceRef.current = setTimeout(() => {
                      handleUpdate({ linkInfo: { name: localLinkLabelRef.current, url: localLinkUrlRef.current }, status: 'answered' });
                    }, 250);
                  }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                {localLinkUrl && (
                  <a href={localLinkUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', background: 'var(--te-primary-700)', borderRadius: '8px', color: 'var(--te-accent-500)', border: '1px solid var(--te-border)' }}>
                    <ExternalLink size={16} />
                  </a>
                )}
             </div>
           </div>
         </div>
       );
    }

    return (
      <textarea
        disabled={isLocked}
        placeholder="Enter response or notes..."
        value={localTextValue}
        onChange={(e) => {
          const val = e.target.value;
          setLocalTextValue(val);
          if (textDebounceRef.current) clearTimeout(textDebounceRef.current);
          textDebounceRef.current = setTimeout(() => {
            handleUpdate({ value: val, status: val.trim() ? 'answered' : 'not_started' });
          }, 250);
        }}
        style={{ width: '100%', height: '120px', padding: '0.75rem', background: 'var(--te-bg-card-alt)', color: 'var(--te-text-main)', border: '1px solid var(--te-border)', borderRadius: '4px', marginTop: '1rem', resize: 'none' }}
      />
    );
  };

  return (
    <div className="te-glass fade-in" style={{
      width: '400px',
      height: '100%',
      borderLeft: '1px solid var(--te-border)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--te-bg-card)',
      overflowY: 'auto',
      zIndex: 10
    }}>
      {/* Header Panel */}
      <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--te-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isEditMode ? 'var(--te-primary-700)' : 'transparent', transition: 'background 0.3s' }}>
        <h3 style={{ fontSize: '0.9rem', color: isEditMode ? 'var(--te-accent-500)' : 'var(--te-text-main)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {isEditMode ? 'ENGINEER MODE' : 'DECISION DETAIL'}
        </h3>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button 
            onClick={() => {
               if (window.confirm("RESET QUESTION? This will clear the current answer and re-evaluate the flow.")) {
                 onResponseChange(item.id, null);
               }
            }}
            className="te-btn te-btn-outline" 
             style={{ 
               padding: '4px 10px', 
               fontSize: '0.65rem', 
               fontWeight: 950, 
               color: 'var(--te-rose-500)', 
               borderColor: 'var(--te-rose-500)', 
               background: 'rgba(244, 63, 94, 0.05)',
               borderRadius: '6px'
             }}
          >
            RESTART
          </button>
          <button 
            onClick={onEditModeToggle}
            title={isEditMode ? 'Exit Detail Mapping' : 'Enter Detail Mapping'}
            className={`te-btn te-btn-outline ${isEditMode ? 'active' : ''}`}
            style={{ 
              background: isEditMode ? 'var(--te-accent-500)' : 'transparent', 
              border: isEditMode ? 'none' : '1px solid var(--te-border)', 
              color: isEditMode ? 'white' : 'var(--te-text-muted)', 
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              zIndex: 100
            }}
          >
            <Edit2 size={16} />
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {isEditMode && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1.5rem' }}>
            <button 
              onClick={() => onItemDuplicate?.(item.id)}
              style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--te-primary-900)', color: 'white', border: '1px solid var(--te-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontWeight: 900, fontSize: '0.75rem' }}
              title="Synchronized Duplicate (Shares Answer)"
            >
              <GitBranch size={16} color="var(--te-amber-500)" /> DUPLICATE
            </button>
            <button 
              onClick={() => onItemClone?.(item.id)}
              style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--te-primary-900)', color: 'white', border: '1px solid var(--te-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontWeight: 900, fontSize: '0.75rem' }}
              title="Independent Copy (Separate Answer)"
            >
              <Plus size={16} color="var(--te-emerald-500)" /> CLONE
            </button>
          </div>
        )}
        {isEditMode ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
             <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Stage</label>
                <select 
                  value={item.stage}
                  onChange={(e) => onItemUpdate(item.id, { stage: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '6px', fontSize: '0.8rem' }}
                >
                  {availableStages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
             </div>
             <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Department</label>
                <select 
                  value={item.area}
                  onChange={(e) => onItemUpdate(item.id, { area: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '6px', fontSize: '0.8rem' }}
                >
                  {availableAreas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
             </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ fontSize: '10px', background: 'var(--te-accent-500)', color: 'white', padding: '2px 8px', borderRadius: '4px' }}>{item.stage}</span>
            <span style={{ fontSize: '10px', background: 'var(--te-bg-card-alt)', color: 'var(--te-text-muted)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--te-border)' }}>{item.area}</span>
          </div>
        )}

        {isEditMode ? (
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-amber-500)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Requirement Type</label>
              <select 
                value={item.itemType}
                onChange={(e) => onItemUpdate(item.id, { itemType: e.target.value as ItemType })}
                style={{ width: '100%', padding: '0.8rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.86rem', fontWeight: 700 }}
              >
                <option value="decision">Decision (Logic Branch)</option>
                <option value="action">Action (Loop Task)</option>
                <option value="boolean">Yes/No/NA</option>
                <option value="link">Hyperlink Collection</option>
                <option value="question">Open Response (Text)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-accent-500)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Requirement Content</label>
              <textarea
                value={item.content}
                onChange={(e) => onItemUpdate(item.id, { content: e.target.value })}
                style={{ width: '100%', height: '60px', padding: '0.8rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 700, resize: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Guidance / Description</label>
              <textarea
                value={item.description || ''}
                onChange={(e) => onItemUpdate(item.id, { description: e.target.value })}
                placeholder="Explain the strategist what to look for..."
                style={{ width: '100%', height: '100px', padding: '0.8rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.8rem', resize: 'none' }}
              />
            </div>
            <div>
               <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-emerald-500)', textTransform: 'uppercase', display: 'block', marginBottom: '0.8rem' }}>Deliverable Target Selection</label>
               
               <div style={{ position: 'relative', marginBottom: '1rem' }}>
                 <Search style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} size={14} />
                 <input 
                   style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.75rem', outline: 'none' }}
                   placeholder="Search or add new deliverable..."
                   value={delivSearch}
                   onChange={e => setDelivSearch(e.target.value)}
                 />
                 {delivSearch && !availableDeliverables.some(d => d.name.toLowerCase() === delivSearch.toLowerCase()) && (
                   <button 
                     onClick={() => { onAddDeliverable?.(delivSearch); setDelivSearch(''); }}
                     style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'var(--te-emerald-500)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.6rem', padding: '4px 8px', fontWeight: 950, cursor: 'pointer' }}
                   >
                     ADD NEW
                   </button>
                 )}
               </div>

               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--te-bg-card-alt)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--te-border)', maxHeight: '200px', overflowY: 'auto' }}>
                 {(availableDeliverables || [])
                   .filter(d => !delivSearch || d.name.toLowerCase().includes(delivSearch.toLowerCase()))
                   .map(deliv => {
                     const isSelected = (item.deliverableTarget || []).includes(deliv.name);
                     return (
                       <div 
                         key={deliv.id}
                         onClick={() => {
                           const current = item.deliverableTarget || [];
                           const next = isSelected ? current.filter(d => d !== deliv.name) : [...current, deliv.name];
                           onItemUpdate(item.id, { deliverableTarget: next });
                         }}
                         style={{ 
                           padding: '0.45rem 1rem', 
                           borderRadius: '8px', 
                           fontSize: '0.75rem', 
                           fontWeight: 950, 
                           cursor: 'pointer',
                           background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--te-primary-900)',
                           color: isSelected ? 'var(--te-emerald-500)' : 'var(--te-text-muted)',
                           border: `1px solid ${isSelected ? 'var(--te-emerald-500)' : 'var(--te-border)'}`,
                           transition: 'all 0.2s',
                           display: 'flex',
                           alignItems: 'center',
                           gap: '0.5rem'
                         }}
                       >
                         <FileText size={12} /> {deliv.name.toUpperCase()}
                       </div>
                     );
                   })
                 }
                 {availableDeliverables.length === 0 && !delivSearch && (
                   <div style={{ fontSize: '0.75rem', color: 'var(--te-text-muted)', fontStyle: 'italic' }}>No deliverables defined. Type above to add one.</div>
                 )}
               </div>
            </div>

            {item.itemType === 'decision' && (
              <div style={{ marginTop: '0.5rem', padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-accent-500)', textTransform: 'uppercase', display: 'block', marginBottom: '0.8rem' }}>Decision Matrix Options</label>
                <textarea
                  value={item.allowedValues?.join(', ') || ''}
                  onChange={(e) => onItemUpdate(item.id, { allowedValues: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="e.g. Firm, Budgetary, TBD"
                  style={{ width: '100%', height: '60px', padding: '0.8rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.85rem', resize: 'none', marginBottom: '1.25rem', outline: 'none' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <div style={{ position: 'relative', width: '20px', height: '20px' }}>
                    <input 
                      type="checkbox" 
                      checked={!!item.isMultipleSelection} 
                      onChange={(e) => onItemUpdate(item.id, { isMultipleSelection: e.target.checked })}
                      style={{ position: 'absolute', opacity: 0, cursor: 'pointer', height: '100%', width: '100%', zIndex: 2 }}
                    />
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '20px', width: '20px', background: item.isMultipleSelection ? 'var(--te-accent-500)' : 'var(--te-bg-card-alt)', border: '2px solid var(--te-accent-500)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.isMultipleSelection && <CheckCircle2 size={12} color="white" />}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'white' }}>Allow multi-choice selection</span>
                </label>
              </div>
            )}

            {item.itemType === 'action' && (
              <div style={{ marginTop: '0.5rem', padding: '1.25rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-emerald-500)', textTransform: 'uppercase', display: 'block', marginBottom: '0.8rem' }}>Loop Synchronization</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--te-text-main)', opacity: 0.8 }}>
                    {item.linkedTaskId ? `Successfully linked to Task: ${item.linkedTaskId}` : 'Not currently linked to a Loop Task.'}
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowTaskMapper(true)}
                    className="te-btn te-btn-outline" 
                    style={{ fontSize: '0.65rem', padding: '10px', width: '100%', border: '1.5px solid var(--te-emerald-500)', background: 'rgba(16, 185, 129, 0.05)', color: 'var(--te-emerald-500)' }}
                  >
                    <Search size={14} style={{ marginRight: '6px' }} />
                    {item.linkedTaskId ? 'CHANGE OR UNLINK TASK' : 'LINK LOOP TASK'}
                  </button>
                </div>
              </div>
            )}
            
            {/* ADD NEW ACTION BUTTON */}
            <div style={{ marginTop: '2rem', borderTop: '1px solid var(--te-border)', paddingTop: '1.5rem' }}>
               <button 
                 onClick={() => {
                   const newId = `ACT-${Date.now()}`;
                   onItemUpdate(newId, { 
                     id: newId, 
                     content: 'New Strategic Action', 
                     itemType: 'action', 
                     area: item.area, 
                     stage: item.stage, 
                     active: true,
                     priority: 'medium',
                     order: item.order + 1
                   });
                   // Optionally trigger select of this new item if available in props
                 }}
                 style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: 'var(--te-emerald-500)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontWeight: 950, fontSize: '0.75rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
               >
                 <Plus size={16} /> ADD NEW ACTION NODE
               </button>
            </div>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--te-text-main)', marginBottom: '0.5rem', lineHeight: '1.4', fontWeight: 800 }}>{item.content}</h2>
            {item.description && <p style={{ fontSize: '0.85rem', color: 'var(--te-text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>{item.description}</p>}
            
            {isLogicLocked && !isEditMode && (
              <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--te-amber-500)', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                 <Lock size={18} color="var(--te-amber-500)" style={{ flexShrink: 0 }} />
                 <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--te-amber-500)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>LOCKED BY DEPENDENCY</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--te-text-main)', opacity: 0.8 }}>
                       Waiting for: {reasons?.map(r => {
                          const target = allItems.find(it => it.id === r.targetId);
                          return `${target?.content || r.targetId} to be "${r.expectedValue || 'answered'}"`;
                       }).join(', ')}
                    </div>
                 </div>
              </div>
            )}

            {/* Deliverables */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                 <FileText size={14} /> Entregable
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                {item.deliverableTarget?.map(d => (
                  <span key={d} style={{ fontSize: '11px', color: 'var(--te-emerald-500)', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid var(--te-emerald-500)', padding: '2px 10px', borderRadius: '99px', fontWeight: 700 }}>{d.toUpperCase()}</span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Response */}
        <div style={{ marginBottom: '2rem' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--te-text-muted)', textTransform: 'uppercase' }}>Response</label>
            {!isEditMode && response?.isFlagged && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--te-amber-500)', fontSize: '0.7rem', fontWeight: 800 }}><Flag size={12} fill="currentColor" /> IMPORTANT</div>}
           </div>
           {renderInput()}
        </div>

        {/* Flag Toggle (Checklist view) */}
        {!isEditMode && (
          <button 
            onClick={() => handleUpdate({ isFlagged: !response?.isFlagged })}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', marginBottom: '2rem', background: response?.isFlagged ? 'rgba(245, 158, 11, 0.1)' : 'var(--te-bg-card-alt)', color: response?.isFlagged ? 'var(--te-amber-500)' : 'var(--te-text-muted)', border: `1px solid ${response?.isFlagged ? 'var(--te-amber-500)' : 'var(--te-border)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 800 }}
          >
            <Flag size={16} fill={response?.isFlagged ? 'currentColor' : 'none'} />
            {response?.isFlagged ? 'REMOVE FLAG' : 'FLAG AS IMPORTANT'}
          </button>
        )}

        {/* Logic Dependencies (Engine view) */}
        {isEditMode && (
          <div style={{ marginTop: '2rem', borderTop: '1px solid var(--te-border)', paddingTop: '2rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
              <GitBranch size={14} /> Logic Dependencies
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(item.dependencyRules || []).map((rule, idx) => {
                const targetItem = allItemsMap.get(rule.targetId);
                return (
                  <div key={idx} style={{ padding: '1rem', background: 'var(--te-bg-card-alt)', borderRadius: '12px', border: '1px solid var(--te-border)', position: 'relative', marginTop: '10px' }}>
                    <div style={{ position: 'absolute', top: '-10px', left: '10px', background: 'var(--te-accent-500)', color: 'white', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, boxShadow: '0 2px 5px rgba(0,0,0,0.4)', zIndex: 5 }}>{idx + 1}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--te-accent-500)', fontWeight: 950, marginBottom: '0.6rem', paddingLeft: '1.2rem' }}>Depends on: {targetItem?.content || rule.targetId}</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select 
                        value={rule.operator}
                        onChange={(e) => {
                          const newRules = [...(item.dependencyRules || [])];
                          newRules[idx] = { ...rule, operator: e.target.value as any };
                          onItemUpdate(item.id, { dependencyRules: newRules });
                        }}
                        style={{ background: 'transparent', color: 'white', border: '1px solid var(--te-border)', borderRadius: '4px', fontSize: '0.75rem', flex: 1, padding: '4px' }}
                      >
                        <option value="any_value">Any Response</option>
                        <option value="equals">Equals</option>
                      </select>
                      {rule.operator === 'equals' && (
                        (() => {
                           const target = allItemsMap.get(rule.targetId);
                           const hasOptions = (target?.allowedValues && target.allowedValues.length > 0) || target?.itemType === 'decision' || target?.responseType === 'boolean' || target?.itemType === 'action';
                           
                            if (hasOptions) {
                             const opts = (target?.allowedValues && target.allowedValues.length > 0) 
                               ? target.allowedValues 
                               : (target?.itemType === 'action' ? ['Pending', 'In Progress', 'Done', 'On Hold', 'Missing Info', 'Canceled'] : ['Yes', 'No', 'N/A']);
                             
                             const currentValArray = Array.isArray(rule.value) ? rule.value : (rule.value ? [rule.value] : []);

                             return (
                               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, background: 'var(--te-bg-card-alt)', padding: '4px', borderRadius: '4px', border: '1px solid var(--te-border)' }}>
                                 {opts.map(v => (
                                   <button 
                                     key={v}
                                     onClick={() => {
                                       const newRules = [...(item.dependencyRules || [])];
                                       const exists = currentValArray.includes(v);
                                       const newVal = exists ? currentValArray.filter(i => i !== v) : [...currentValArray, v];
                                       newRules[idx] = { ...rule, value: newVal.length === 1 ? newVal[0] : newVal };
                                       onItemUpdate(item.id, { dependencyRules: newRules });
                                     }}
                                     style={{ 
                                       fontSize: '9px', 
                                       padding: '2px 6px', 
                                       borderRadius: '3px', 
                                       border: 'none',
                                       background: currentValArray.includes(v) ? 'var(--te-accent-500)' : 'rgba(255,255,255,0.05)',
                                       color: 'white',
                                       cursor: 'pointer'
                                     }}
                                   >
                                     {v}
                                   </button>
                                 ))}
                               </div>
                             );
                           }
                           
                           return (
                             <input 
                               type="text"
                               value={String(rule.value)}
                               onChange={(e) => {
                                 const newRules = [...(item.dependencyRules || [])];
                                 newRules[idx] = { ...rule, value: e.target.value };
                                 onItemUpdate(item.id, { dependencyRules: newRules });
                               }}
                               style={{ background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '4px', fontSize: '0.75rem', flex: 1, padding: '4px' }}
                               placeholder="Value..."
                             />
                           );
                        })()
                      )}
                      <button 
                        onClick={() => {
                          const newRules = (item.dependencyRules || []).filter((_, i) => i !== idx);
                          onItemUpdate(item.id, { dependencyRules: newRules });
                        }}
                        style={{ color: 'var(--te-rose-500)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                      >
                         <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {item.dependencyRules && item.dependencyRules.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', border: '1px dashed var(--te-accent-500)' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--te-accent-500)', textTransform: 'uppercase', display: 'block', marginBottom: '0.6rem' }}>LOGIC_STRUCTURE.sys</label>
                  <input 
                    type="text"
                    value={item.logicString || ''}
                    onChange={(e) => onItemUpdate(item.id, { logicString: e.target.value })}
                    placeholder="e.g. ((1 AND 2) OR 3) AND 4"
                    style={{ width: '100%', padding: '0.8rem', background: '#0a0b10', color: '#00ff41', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.9rem', fontFamily: 'monospace', outline: 'none' }}
                  />
                  <div style={{ fontSize: '0.65rem', color: 'var(--te-text-muted)', marginTop: '0.6rem', lineHeight: '1.4' }}>
                    Reference rules by <span style={{ color: 'var(--te-accent-500)', fontWeight: 900 }}>NUMBER</span>. Use <span style={{ color: 'white' }}>AND, OR, NOT</span> and <span style={{ color: 'white' }}>()</span>.
                    <br/>If empty, all rules must be met (AND).
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isEditMode && (
           <button 
             onClick={() => {
                if(window.confirm("Restore this item? Any specific responses for it in active projects will be kept but hidden.")) {
                   onItemDelete(item.id);
                }
             }}
             style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', marginTop: '2rem', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--te-rose-500)', border: '1px solid var(--te-rose-500)', cursor: 'pointer', fontWeight: 900, fontSize: '0.7rem' }}
           >
              DELETE REQUIREMENT
           </button>
        )}
      </div>
      
      {showTaskMapper && (
        <TaskMappingModal 
          loopDb={loopDb}
          dbName={loopDbName}
          currentOpId={localStorage.getItem('te_active_op_id') || null}
          onSelectTask={(taskId) => {
             onItemUpdate(item.id, { linkedTaskId: taskId });
             setShowTaskMapper(false);
          }}
          onUpdateOpId={(id) => {
             localStorage.setItem('te_active_op_id', id);
          }}
          onLoadDb={handleLoadLoopDb}
          onClose={() => setShowTaskMapper(false)}
        />
      )}
    </div>
  );
};

// PERF: React.memo prevents the panel from re-rendering when FlowDashboard state changes
// for reasons unrelated to the selected item (e.g. filter changes, UI toggles, search input).
export const QuestionDetailPanel = React.memo(QuestionDetailPanel_);
