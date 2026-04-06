import React from 'react';
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
  Plus
} from 'lucide-react';
import { StandardItem, ItemResponse, ResponseStatus, ItemType } from '../types';
import { isItemLocked } from '../engine/evaluator';

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
  availableAreas?: { id: string; name: string }[];
  availableStages?: { id: string; name: string }[];
}

/**
 * Panel Lateral Derecho - Detalle de Pregunta (Punto 18 del Checklist)
 */
export const QuestionDetailPanel: React.FC<Props> = ({ 
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
  availableAreas = [],
  availableStages = []
}) => {
  if (!item) return null;

  const isManualLocked = response?.isLocked ?? false;
  const { locked: isLogicLocked, reasons } = isItemLocked(item, allResponses);
  const isLocked = isManualLocked || isLogicLocked;

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

    if (item.itemType === 'link') {
       const linkData = response?.linkInfo || { name: '', url: '' };
       const inputStyle = { width: '100%', padding: '0.8rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' };
       return (
         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
           <div>
             <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Link Label</label>
             <input 
               disabled={isLocked}
               placeholder="e.g. Documentation Portal"
               value={linkData.name}
               onChange={(e) => handleUpdate({ linkInfo: { ...linkData, name: e.target.value }, status: 'answered', value: e.target.value })}
               style={inputStyle}
             />
           </div>
           <div>
             <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Hyperlink URL</label>
             <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  disabled={isLocked}
                  placeholder="https://..."
                  value={linkData.url}
                  onChange={(e) => handleUpdate({ linkInfo: { ...linkData, url: e.target.value }, status: 'answered' })}
                  style={{ ...inputStyle, flex: 1 }}
                />
                {linkData.url && (
                  <a href={linkData.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', background: 'var(--te-primary-700)', borderRadius: '8px', color: 'var(--te-accent-500)', border: '1px solid var(--te-border)' }}>
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
        value={response?.value || ''}
        onChange={(e) => handleUpdate({ value: e.target.value, status: 'answered' })}
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
          <button 
            onClick={() => onItemDuplicate?.(item.id)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', background: 'var(--te-primary-900)', color: 'white', border: '1px solid var(--te-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontWeight: 900, fontSize: '0.75rem' }}
          >
            <GitBranch size={16} /> CLONE / DUPLICATE (OR BRANCH)
          </button>
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
                <option value="boolean">Yes/No/NA</option>
                <option value="link">Hyperlink Collection</option>
                <option value="question">Open Response (Text)</option>
                <option value="action">Action / Task</option>
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
              <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-emerald-500)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Deliverable Target (comma separated)</label>
              <input 
                value={item.deliverableTarget?.join(', ') || ''}
                onChange={(e) => onItemUpdate(item.id, { deliverableTarget: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                style={{ width: '100%', padding: '0.8rem', background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '8px', fontSize: '0.8rem' }}
                placeholder="e.g. Annex A, Proposal Text"
              />
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
                const targetItem = allItems.find(i => i.id === rule.targetId);
                return (
                  <div key={idx} style={{ padding: '1rem', background: 'var(--te-bg-card-alt)', borderRadius: '12px', border: '1px solid var(--te-border)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--te-accent-500)', fontWeight: 950, marginBottom: '0.5rem' }}>Depends on: {targetItem?.content || rule.targetId}</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select 
                        value={rule.operator}
                        onChange={(e) => {
                          const newRules = [...(item.dependencyRules || [])];
                          newRules[idx] = { ...rule, operator: e.target.value as any };
                          onItemUpdate(item.id, { dependencyRules: newRules });
                        }}
                        style={{ background: 'transparent', color: 'white', border: '1px solid var(--te-border)', borderRadius: '4px', fontSize: '0.75rem', flex: 1 }}
                      >
                        <option value="any_value">Any Response</option>
                        <option value="equals">Equals</option>
                      </select>
                      {rule.operator === 'equals' && (
                        (() => {
                           const target = allItems.find(it => it.id === rule.targetId);
                           const hasOptions = (target?.allowedValues && target.allowedValues.length > 0) || target?.itemType === 'decision' || target?.responseType === 'boolean';
                           
                           if (hasOptions) {
                             const opts = (target?.allowedValues && target.allowedValues.length > 0) 
                               ? target.allowedValues 
                               : (target?.itemType === 'boolean' || target?.responseType === 'boolean' ? ['Yes', 'No', 'N/A'] : ['TBD']);
                             
                             return (
                               <select 
                                 value={String(rule.value)}
                                 onChange={(e) => {
                                   const newRules = [...(item.dependencyRules || [])];
                                   newRules[idx] = { ...rule, value: e.target.value };
                                   onItemUpdate(item.id, { dependencyRules: newRules });
                                 }}
                                 style={{ background: 'var(--te-bg-card-alt)', color: 'white', border: '1px solid var(--te-border)', borderRadius: '4px', fontSize: '0.75rem', flex: 1, padding: '4px' }}
                               >
                                  <option value="">Select Value...</option>
                                  {opts.map(v => <option key={v} value={v}>{v}</option>)}
                               </select>
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
                        style={{ color: 'var(--te-rose-500)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                         <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
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
    </div>
  );
};
