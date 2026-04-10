import React, { useState } from 'react';
import { StandardItem, Priority, ItemType, DependencyRule } from '../types';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  MapPin, 
  ClipboardList,
  Zap,
  ArrowUp,
  ArrowDown,
  Palette,
  Search,
  CheckCircle2,
  Lock,
  FileDown,
  FileText
} from 'lucide-react';
import { exportToExcel } from '../services/exporter';

interface Props {
  questions: StandardItem[];
  stages: { id: string; name: string; order: number; active: boolean }[];
  areas: { id: string; name: string; order: number; active: boolean; color?: string }[];
  deliverables?: { id: string; name: string; order: number; active: boolean }[];
  onSave: (data: { questions: StandardItem[], stages: any[], areas: any[], deliverables: any[] }) => void;
  onClose: () => void;
  responses?: Record<string, any>;
  onResponseUpdate?: (itemId: string, updates: any) => void;
}

/**
 * Standard Structure Editor v3.0 - Premium Theme-Aware Design
 */
export const StructureEditor: React.FC<Props> = ({ 
  questions: initialQuestions, 
  stages: initialStages, 
  areas: initialAreas, 
  deliverables: initialDeliverables = [],
  onSave, 
  onClose,
  responses,
  onResponseUpdate
}) => {
  const [activeTab, setActiveTab] = useState<'questions' | 'stages' | 'areas' | 'deliverables'>('questions');
  const [questions, setQuestions] = useState<StandardItem[]>(initialQuestions);
  const [stages, setStages] = useState(initialStages);
  const [areas, setAreas] = useState(initialAreas);
  const [deliverables, setDeliverables] = useState(initialDeliverables);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [depSearch, setDepSearch] = useState('');
  const [mainSearch, setMainSearch] = useState('');

  const handleUpdateQuestion = (id: string, updates: Partial<StandardItem>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const handleAddQuestion = () => {
    const newId = `Q_${questions.length + 1}_${Date.now().toString().slice(-4)}`;
    const newQ: StandardItem = {
      id: newId,
      active: true,
      stage: stages[0]?.name || 'Intake',
      area: areas[0]?.name || 'Common', 
      priority: 'medium',
      itemType: 'question',
      content: 'New Decision Point',
      responseType: 'any',
      mandatory: false,
      tags: [],
      order: questions.length,
      logicString: '',
      deliverableTarget: []
    };
    setQuestions([...questions, newQ]);
    setEditingId(newId);
  };

  const handleStageOrderChange = (index: number, newOrder: number) => {
    const updatedStages = [...stages];
    const oldOrder = updatedStages[index].order;
    updatedStages[index].order = newOrder;
    updatedStages.forEach((s, i) => { if (i !== index && s.order === newOrder) s.order = oldOrder; });
    setStages(updatedStages.sort((a,b) => a.order - b.order));
  };

  const inputStyle = {
    width: '100%', 
    background: 'var(--te-primary-700)', 
    border: '1px solid var(--te-border)', 
    color: 'var(--te-text-main)', 
    padding: '0.8rem 1rem', 
    borderRadius: '12px',
    fontSize: '0.9rem',
    outline: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
  };

  const labelStyle = { 
    display: 'block', 
    fontSize: '0.7rem', 
    marginBottom: '0.5rem', 
    color: 'var(--te-text-muted)', 
    fontWeight: 900, 
    textTransform: 'uppercase' as const 
  };

  const palette = ['#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#d53f8c', '#319795', '#2b6cb0', '#dd6b20', '#4a5568'];

  return (
    <div className="te-modal-backdrop">
      <div className="te-card fade-in" style={{ width: '1300px', height: '90vh', overflow: 'hidden', background: 'var(--te-bg-card)', border: '1px solid var(--te-border)', borderRadius: '32px', display: 'flex', flexDirection: 'column', color: 'var(--te-text-main)', boxShadow: 'var(--te-shadow-md)' }}>
        <header style={{ padding: '2rem 3.5rem', borderBottom: '1px solid var(--te-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--te-primary-700)' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--te-text-main)' }}>ENGINE STRUCTURE BACKBONE v3.0</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--te-text-muted)' }}>Configure Master Operational Flows & Gate Definitions.</p>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <button onClick={() => exportToExcel({ responses: {} } as any, questions, stages, areas)} className="te-btn te-btn-outline" style={{ fontWeight: 900, padding: '0.8rem 2rem', borderRadius: '12px' }}>
              <FileDown size={18} /> DOWNLOAD BACKBONE
            </button>
            <button onClick={() => onSave({ questions, stages, areas, deliverables })} className="te-btn te-btn-primary" style={{ background: 'var(--te-emerald-500)', color: 'white', fontWeight: 900, padding: '0.8rem 2rem', borderRadius: '12px', boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.4)' }}>
              <Save size={18} /> SAVE MASTER BACKBONE
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer' }}><X size={32} /></button>
          </div>
        </header>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <aside style={{ width: '260px', borderRight: '1px solid var(--te-border)', padding: '2.5rem 1.5rem', background: 'var(--te-bg-card-alt)' }}>
            {[
              { id: 'questions', icon: ClipboardList, label: 'MASTER Q' },
              { id: 'stages', icon: Layers, label: 'STAGES & GATING' },
              { id: 'areas', icon: MapPin, label: 'FUNCTIONAL AREAS' },
              { id: 'deliverables', icon: FileText, label: 'DELIVERABLES' }
            ].map(tab => (
              <div key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{ padding: '1rem 1.25rem', borderRadius: '14px', cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', background: activeTab === tab.id ? 'var(--te-accent-500)' : 'transparent', color: activeTab === tab.id ? 'white' : 'var(--te-text-muted)', marginBottom: '0.75rem', transition: 'all 0.2s', boxShadow: activeTab === tab.id ? '0 10px 20px -5px rgba(59, 130, 246, 0.4)' : 'none' }}>
                <tab.icon size={20} /> <span style={{ fontWeight: 900, fontSize: '0.9rem' }}>{tab.label}</span>
              </div>
            ))}
          </aside>

          <main style={{ flex: 1, overflowY: 'auto', padding: '3.5rem', background: 'var(--te-bg-card)' }}>
            {activeTab === 'questions' && (
              <div style={{ maxWidth: '950px' }}>
                <div style={{ 
                  background: 'var(--te-primary-700)', 
                  padding: '2rem 2.5rem', 
                  borderRadius: '24px', 
                  marginBottom: '2.5rem',
                  border: '1px solid var(--te-border)',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2.5rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <Search style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, color: 'var(--te-accent-500)' }} size={20} />
                      <input 
                        style={{ 
                          ...inputStyle, 
                          paddingLeft: '3.5rem', 
                          marginBottom: 0, 
                          background: 'rgba(0,0,0,0.2)', 
                          fontSize: '1rem',
                          height: '56px',
                          border: '1px solid var(--te-accent-500)',
                          boxShadow: '0 0 15px rgba(59, 130, 246, 0.1)'
                        }} 
                        placeholder="Search backbone by keyword, ID, or intent..." 
                        value={mainSearch}
                        onChange={(e) => setMainSearch(e.target.value)}
                      />
                    </div>
                    <button onClick={handleAddQuestion} className="te-btn" style={{ background: 'var(--te-accent-500)', color: 'white', fontWeight: 900, height: '56px', padding: '0 2rem', borderRadius: '14px', whiteSpace: 'nowrap' }}>
                      <Plus size={20} /> ADD NEW POINT
                    </button>
                  </div>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', fontSize: '0.7rem', fontWeight: 800, color: 'var(--te-text-muted)' }}>
                     <span>TOTAL POINTS: {questions.length}</span>
                     <span style={{ color: 'var(--te-accent-500)' }}>SEARCHING: {mainSearch || 'ALL ITEMS'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {questions
                    .filter(q => !mainSearch || q.content.toLowerCase().includes(mainSearch.toLowerCase()) || q.id.toLowerCase().includes(mainSearch.toLowerCase()))
                    .sort((a,b) => (a.order || 0) - (b.order || 0))
                    .map((q) => (
                    <div key={q.id} className="te-card" style={{ background: 'var(--te-bg-card-alt)', border: '1px solid var(--te-border)', borderRadius: '16px', overflow: 'hidden' }}>
                      <div onClick={() => setEditingId(editingId === q.id ? null : q.id)} style={{ padding: '1.25rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1 }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--te-accent-500)', fontWeight: 900, border: '1px solid var(--te-accent-500)', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(49, 130, 206, 0.05)' }}>{q.id}</span>
                            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--te-text-main)' }}>{q.content}</span>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <span className="te-badge" style={{ fontSize: '11px', background: 'var(--te-primary-700)', color: 'var(--te-accent-500)', fontWeight: 900 }}>{q.stage.toUpperCase()}</span>
                            <span className="te-badge" style={{ fontSize: '11px', background: areas.find(a => a.name === q.area)?.color || 'var(--te-primary-700)', color: 'white', fontWeight: 900 }}>{q.area.toUpperCase()}</span>
                            {editingId === q.id ? <ChevronDown size={20} color="var(--te-text-muted)" /> : <ChevronRight size={20} color="var(--te-text-muted)" />}
                         </div>
                      </div>

                      {editingId === q.id && (
                        <div style={{ padding: '3rem', background: 'var(--te-bg-card)', borderTop: '2px solid var(--te-border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '4rem' }}>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                   <div>
                                      <label style={labelStyle}>Question Content</label>
                                      <textarea style={{ ...inputStyle, minHeight: '80px', fontSize: '1rem', fontWeight: 800 }} value={q.content} onChange={(e) => handleUpdateQuestion(q.id, { content: e.target.value })} />
                                   </div>
                                   <div>
                                      <label style={labelStyle}>Question Type</label>
                                      <select style={{ ...inputStyle, color: 'white', backgroundColor: 'var(--te-primary-700)' }} value={q.itemType} onChange={(e) => handleUpdateQuestion(q.id, { itemType: e.target.value as any })}>
                                         <option value="decision" style={{ color: 'black' }}>Decision (Logic Branch)</option>
                                         <option value="boolean" style={{ color: 'black' }}>Yes/No/NA</option>
                                         <option value="link" style={{ color: 'black' }}>Hyperlink Collection</option>
                                         <option value="question" style={{ color: 'black' }}>Open Response (Text)</option>
                                         <option value="action" style={{ color: 'black' }}>Action / Task</option>
                                      </select>
                                   </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                   <div>
                                     <label style={labelStyle}>Operative Stage</label>
                                     <select style={{ ...inputStyle, color: "white", backgroundColor: "var(--te-primary-700)" }} value={q.stage} onChange={(e) => handleUpdateQuestion(q.id, { stage: e.target.value })}>
                                       {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                     </select>
                                   </div>
                                   <div>
                                      <label style={labelStyle}>Functional Owner</label>
                                      <select style={{ ...inputStyle, color: "white", backgroundColor: "var(--te-primary-700)" }} value={q.area} onChange={(e) => handleUpdateQuestion(q.id, { area: e.target.value })}>
                                         {areas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                      </select>
                                   </div>
                                </div>
                                <div>
                                  <label style={labelStyle}>Operational Guidance</label>
                                  <textarea style={{ ...inputStyle, minHeight: '100px' }} placeholder="Define the investigative value of this point..." value={q.description || ''} onChange={(e) => handleUpdateQuestion(q.id, { description: e.target.value })} />
                                </div>

                                {responses && onResponseUpdate && (
                                  <div style={{ marginTop: '1rem', padding: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '16px', border: '1px solid var(--te-emerald-500)' }}>
                                    <label style={{ ...labelStyle, color: 'var(--te-emerald-500)' }}>Current Respondent Answer (ENGINE OVERRIDE)</label>
                                    <input 
                                      style={{ ...inputStyle, background: 'var(--te-bg-card)', border: '1px solid var(--te-border)', color: 'var(--te-emerald-500)', fontWeight: 900 }} 
                                      value={responses[q.id]?.value || ''} 
                                      onChange={(e) => onResponseUpdate(q.id, { value: e.target.value, status: 'answered' })} 
                                    />
                                  </div>
                                )}
                             </div>

                             <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingLeft: '3rem', borderLeft: '2px solid var(--te-border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                   <div>
                                     <label style={labelStyle}>Data Type</label>
                                     <select style={inputStyle} value={q.itemType} onChange={(e) => handleUpdateQuestion(q.id, { itemType: e.target.value as any })}>
                                       <option value="question">Standard Point</option>
                                       <option value="decision">Closed Decision</option>
                                       <option value="link">Hyperlink / Hipervínculo</option>
                                       <option value="risk_check">Security / Risk</option>
                                     </select>
                                   </div>
                                   <div>
                                     <label style={labelStyle}>Gating Level</label>
                                     <select style={inputStyle} value={q.priority} onChange={(e) => handleUpdateQuestion(q.id, { priority: e.target.value as any, mandatory: e.target.value === 'mandatory' })}>
                                       <option value="low">Low Influence</option>
                                       <option value="medium">Standard Priority</option>
                                       <option value="critical">Critical Indicator</option>
                                       <option value="mandatory">Mandatory Flow Stop</option>
                                     </select>
                                   </div>
                                </div>

                                {q.itemType === 'decision' && (
                                  <div style={{ background: 'var(--te-primary-700)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--te-accent-500)' }}>
                                     <label style={{ ...labelStyle, color: 'var(--te-accent-500)' }}>Decision Matrix Options</label>
                                     <input style={inputStyle} placeholder="Firm, Budgetary, TBD" value={(q.allowedValues || []).join(', ')} onChange={e => handleUpdateQuestion(q.id, { allowedValues: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} />
                                     
                                     <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <input type="checkbox" style={{ width: '20px', height: '20px' }} checked={!!q.isMultipleSelection} onChange={e => handleUpdateQuestion(q.id, { isMultipleSelection: e.target.checked })} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Allow multi-choice selection</span>
                                     </div>
                                  </div>
                                )}

                                {/** Advanced Dependency Manager (Punto 24) */}
                                <div style={{ background: 'var(--te-primary-700)', padding: '2rem', borderRadius: '24px', border: '1px solid var(--te-border)' }}>
                                   <label style={{ ...labelStyle, color: 'var(--te-accent-500)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                      <Zap size={16} /> Advanced Strategic Gating
                                   </label>
                                   <p style={{ fontSize: '11px', color: 'var(--te-text-muted)', marginBottom: '1.5rem', lineHeight: '1.4' }}>Define which previous milestones unlock this investigation point.</p>
                                   
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                                       {(q.dependencyRules || []).map((rule, ridx) => {
                                          const target = questions.find(x => x.id === rule.targetId);
                                          const isTargetAction = target?.itemType === 'action';

                                          return (
                                             <div key={ridx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--te-bg-card)', padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid var(--te-border)' }}>
                                                <div style={{ flex: 1 }}>
                                                   <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'white' }}>{target?.content || rule.targetId}</div>
                                                   <div style={{ fontSize: '0.65rem', color: 'var(--te-accent-500)', fontWeight: 800 }}>
                                                      REQUIRES: {rule.operator === 'any_value' ? 'ANY VALID RESPONSE' : (isTargetAction ? `STATUS BECOMES "${String(rule.value).toUpperCase()}"` : `MUST EQUAL "${rule.value}"`)}
                                                   </div>
                                                </div>

                                                {rule.operator === 'equals' && (
                                                   <select 
                                                      style={{ padding: '4px', fontSize: '0.65rem', borderRadius: '4px', border: 'none', background: 'var(--te-primary-900)', color: 'white' }}
                                                      value={rule.value}
                                                      onChange={(e) => {
                                                         const next = [...(q.dependencyRules || [])];
                                                         next[ridx] = { ...rule, value: e.target.value };
                                                         handleUpdateQuestion(q.id, { dependencyRules: next });
                                                      }}
                                                   >
                                                      {isTargetAction ? (
                                                         <>
                                                            <option value="pending" style={{ color: 'black' }}>Pending</option>
                                                            <option value="in_progress" style={{ color: 'black' }}>In Progress</option>
                                                            <option value="answered" style={{ color: 'black' }}>Completed</option>
                                                         </>
                                                      ) : (
                                                         (target?.allowedValues || ['Yes', 'No']).map(v => (
                                                            <option key={v} value={v} style={{ color: 'black' }}>{v}</option>
                                                         ))
                                                      )}
                                                   </select>
                                                )}

                                                <button 
                                                   onClick={() => {
                                                      const newRules = (q.dependencyRules || []).filter((_, i) => i !== ridx);
                                                      handleUpdateQuestion(q.id, { dependencyRules: newRules });
                                                   }}
                                                   style={{ background: 'transparent', border: 'none', color: 'var(--te-rose-500)', cursor: 'pointer' }}
                                                >
                                                   <X size={16} />
                                                </button>
                                             </div>
                                          );
                                       })}
                                    </div>

                                   <div style={{ position: 'relative' }}>
                                      <div style={{ position: 'relative' }}>
                                         <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} size={16} />
                                         <input 
                                            style={{ ...inputStyle, paddingLeft: '3rem', marginBottom: '0.5rem' }} 
                                            placeholder="Search strategic items to link..." 
                                            value={depSearch} 
                                            onChange={e => setDepSearch(e.target.value)} 
                                         />
                                      </div>
                                      
                                      {depSearch && (
                                         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--te-primary-700)', border: '1px solid var(--te-border)', borderRadius: '12px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: 'var(--te-shadow-md)' }}>
                                            {questions
                                               .filter(x => x.id !== q.id && (x.content.toLowerCase().includes(depSearch.toLowerCase()) || x.id.toLowerCase().includes(depSearch.toLowerCase())))
                                               .slice(0, 5)
                                               .map(target => (
                                                  <div 
                                                     key={target.id} 
                                                     onClick={() => {
                                                        const isDecision = target.itemType === 'decision' || target.itemType === 'boolean';
                                                        const newRule: DependencyRule = {
                                                           targetId: target.id,
                                                           operator: isDecision ? 'equals' : 'any_value',
                                                           value: isDecision ? (target.allowedValues?.[0] || 'Yes') : 'answered'
                                                        };
                                                        handleUpdateQuestion(q.id, { dependencyRules: [...(q.dependencyRules || []), newRule] });
                                                        setDepSearch('');
                                                     }}
                                                     className="hover-bright"
                                                     style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--te-border)', cursor: 'pointer', fontSize: '0.8rem' }}
                                                  >
                                                     <div style={{ fontWeight: 800 }}>{target.content}</div>
                                                     <div style={{ fontSize: '0.7rem', color: 'var(--te-text-muted)' }}>{target.area} • {target.stage}</div>
                                                  </div>
                                               ))
                                            }
                                         </div>
                                      )}
                                   </div>
                                   
                                   <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', alignItems: 'center' }}>
                                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--te-text-muted)', textTransform: 'uppercase' }}>Logic Operator</label>
                                      <div style={{ display: 'flex', background: 'var(--te-bg-card)', borderRadius: '8px', padding: '3px' }}>
                                         {['AND', 'OR', 'NOT'].map(op => (
                                            <button 
                                               key={op}
                                               onClick={() => handleUpdateQuestion(q.id, { dependencyOperator: op as any })}
                                               style={{ 
                                                  padding: '0.4rem 1rem', 
                                                  fontSize: '0.7rem', 
                                                  fontWeight: 900, 
                                                  borderRadius: '6px', 
                                                  border: 'none',
                                                  background: q.dependencyOperator === op || (!q.dependencyOperator && op === 'AND') ? 'var(--te-accent-500)' : 'transparent',
                                                  color: q.dependencyOperator === op || (!q.dependencyOperator && op === 'AND') ? 'white' : 'var(--te-text-muted)',
                                                  cursor: 'pointer'
                                               }}
                                            >
                                               {op}
                                            </button>
                                         ))}
                                      </div>
                                   </div>
                                </div>

                                <div>
                                   <label style={labelStyle}><CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Legacy Logic String</label>
                                   <input style={inputStyle} placeholder="e.g. Q1:YES,AND,Q4:FIRM" value={q.logicString || ''} onChange={e => handleUpdateQuestion(q.id, { logicString: e.target.value })} />
                                </div>

                                <div>
                                   <button onClick={() => setQuestions(prev => prev.filter(item => item.id !== q.id))} style={{ color: 'var(--te-rose-500)', fontSize: '0.85rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 900, marginTop: '2rem' }}>
                                      <Trash2 size={18} /> DISCARD POINT
                                   </button>
                                </div>
                             </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'stages' && (
               <div style={{ maxWidth: '650px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3.5rem' }}>
                     <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--te-text-main)' }}>OPERATIVE SEQUENCING</h3>
                     <button onClick={() => setStages([...stages, { id: `S_${Date.now()}`, name: 'New Stage', order: stages.length + 1, active: true }])} className="te-btn te-btn-primary" style={{ background: 'var(--te-accent-500)', color: 'white', fontWeight: 900, borderRadius: '12px' }}><Plus size={18} /> ADD STAGE</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {stages.sort((a,b) => a.order - b.order).map((s, idx) => {
                        const isCommon = s.name.toLowerCase() === 'common';
                        return (
                          <div key={s.id} style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', background: 'var(--te-bg-card-alt)', padding: '1.25rem 2rem', borderRadius: '16px', border: '1px solid var(--te-border)', opacity: isCommon ? 0.8 : 1 }}>
                             <div style={{ width: '40px', fontSize: '1.2rem', fontWeight: 900, color: 'var(--te-accent-500)' }}>{idx + 1}</div>
                             <input 
                                disabled={isCommon}
                                style={{ ...inputStyle, flex: 1, marginBottom: 0, fontWeight: 800, background: isCommon ? 'transparent' : 'var(--te-primary-700)', border: isCommon ? 'none' : '1px solid var(--te-border)' }} 
                                value={s.name} 
                                onChange={e => setStages(prev => prev.map(x => x.id === s.id ? {...x, name: e.target.value} : x))} 
                             />
                             <div style={{ display: 'flex', gap: '8px' }}>
                                <button disabled={idx === 0 || isCommon} onClick={() => handleStageOrderChange(idx, idx - 1)} className="te-btn te-btn-outline" style={{ padding: '0.6rem', border: '1px solid var(--te-border)' }}><ArrowUp size={16} /></button>
                                <button disabled={idx === stages.length - 1 || isCommon} onClick={() => handleStageOrderChange(idx, idx + 1)} className="te-btn te-btn-outline" style={{ padding: '0.6rem', border: '1px solid var(--te-border)' }}><ArrowDown size={16} /></button>
                             </div>
                             {!isCommon && <button onClick={() => setStages(prev => prev.filter(x => x.id !== s.id))} style={{ background: 'transparent', border: 'none', color: 'var(--te-rose-500)', cursor: 'pointer' }}><Trash2 size={20} /></button>}
                             {isCommon && <Lock size={16} color="var(--te-text-muted)" />}
                          </div>
                        );
                      })}
                  </div>
               </div>
            )}

            {activeTab === 'areas' && (
               <div style={{ maxWidth: '800px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3.5rem' }}>
                     <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--te-text-main)' }}>FUNCTIONAL OWNERSHIP</h3>
                     <button onClick={() => setAreas([...areas, { id: `A_${Date.now()}`, name: 'New Area', order: areas.length, active: true, color: palette[areas.length % palette.length] }])} className="te-btn te-btn-primary" style={{ background: 'var(--te-accent-500)', color: 'white', fontWeight: 900, borderRadius: '12px' }}><Plus size={18} /> NEW AREA</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                     {areas.map((a) => {
                        const isCommon = a.name.toLowerCase() === 'common';
                        return (
                          <div key={a.id} style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', background: 'var(--te-bg-card-alt)', padding: '1.5rem 2rem', borderRadius: '18px', border: isCommon ? '1px solid var(--te-border)' : `2px solid ${a.color || 'var(--te-border)'}`, boxShadow: '0 4px 10px rgba(0,0,0,0.02)', opacity: isCommon ? 0.8 : 1 }}>
                             <input 
                                disabled={isCommon}
                                style={{ ...inputStyle, flex: 1, marginBottom: 0, fontWeight: 900, fontSize: '1.1rem', background: isCommon ? 'transparent' : 'var(--te-primary-700)', border: isCommon ? 'none' : '1px solid var(--te-border)' }} 
                                value={a.name} 
                                onChange={e => setAreas(prev => prev.map(x => x.id === a.id ? {...x, name: e.target.value} : x))} 
                             />
                             <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--te-bg-card)', padding: '0.5rem 1.25rem', borderRadius: '50px', border: '1px solid var(--te-border)' }}>
                                <label style={{ cursor: isCommon ? 'default' : 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Custom Color Picker">
                                   <Palette size={20} color={a.color || 'var(--te-text-muted)'} />
                                   <input 
                                     type="color" 
                                     disabled={isCommon}
                                     value={a.color || '#3b82f6'} 
                                     onChange={e => setAreas(prev => prev.map(x => x.id === a.id ? {...x, color: e.target.value} : x))}
                                     style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                                   />
                                </label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                   {palette.map(p => {
                                      const isSelected = a.color === p;
                                      return (
                                        <div 
                                           key={p} 
                                           onClick={() => !isCommon && setAreas(prev => prev.map(x => x.id === a.id ? {...x, color: p} : x))}
                                           style={{ 
                                             width: '20px', 
                                             height: '20px', 
                                             borderRadius: '50%', 
                                             background: p, 
                                             cursor: isCommon ? 'default' : 'pointer', 
                                             border: isSelected ? '2px solid white' : '1px solid rgba(255,255,255,0.05)', 
                                             boxShadow: isSelected ? `0 0 12px ${p}88` : 'none',
                                             transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                                             transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                             opacity: isCommon ? 0.3 : 1,
                                             zIndex: isSelected ? 2 : 1
                                           }}
                                        />
                                      );
                                   })}
                                </div>
                             </div>
                             {!isCommon && <button onClick={() => setAreas(prev => prev.filter(x => x.id !== a.id))} style={{ background: 'transparent', border: 'none', color: 'var(--te-rose-500)', cursor: 'pointer' }}><Trash2 size={24} /></button>}
                             {isCommon && <Lock size={20} color="var(--te-text-muted)" />}
                          </div>
                        );
                      })}
                  </div>
               </div>
            )}

            {activeTab === 'deliverables' && (
               <div style={{ maxWidth: '650px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3.5rem' }}>
                     <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--te-text-main)' }}>STRATEGIC DELIVERABLES</h3>
                     <button onClick={() => setDeliverables([...deliverables, { id: `D_${Date.now()}`, name: 'New Deliverable', order: deliverables.length + 1, active: true }])} className="te-btn te-btn-primary" style={{ background: 'var(--te-emerald-500)', color: 'white', fontWeight: 900, borderRadius: '12px' }}><Plus size={18} /> ADD DELIVERABLE</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {deliverables.sort((a,b) => a.order - b.order).map((d, idx) => (
                        <div key={d.id} style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', background: 'var(--te-bg-card-alt)', padding: '1.25rem 2rem', borderRadius: '16px', border: '1px solid var(--te-border)' }}>
                           <div style={{ width: '40px', fontSize: '1.1rem', fontWeight: 900, color: 'var(--te-emerald-500)' }}><FileText size={20} /></div>
                           <input 
                              style={{ ...inputStyle, flex: 1, marginBottom: 0, fontWeight: 800, background: 'var(--te-primary-700)', border: '1px solid var(--te-border)' }} 
                              value={d.name} 
                              onChange={e => setDeliverables(prev => prev.map(x => x.id === d.id ? {...x, name: e.target.value} : x))} 
                           />
                           <div style={{ display: 'flex', gap: '8px' }}>
                              <button disabled={idx === 0} onClick={() => {
                                 const next = [...deliverables]; const old = next[idx].order; next[idx].order = next[idx-1].order; next[idx-1].order = old;
                                 setDeliverables(next.sort((a,b) => a.order - b.order));
                              }} className="te-btn te-btn-outline" style={{ padding: '0.6rem', border: '1px solid var(--te-border)' }}><ArrowUp size={16} /></button>
                              <button disabled={idx === deliverables.length - 1} onClick={() => {
                                 const next = [...deliverables]; const old = next[idx].order; next[idx].order = next[idx+1].order; next[idx+1].order = old;
                                 setDeliverables(next.sort((a,b) => a.order - b.order));
                              }} className="te-btn te-btn-outline" style={{ padding: '0.6rem', border: '1px solid var(--te-border)' }}><ArrowDown size={16} /></button>
                           </div>
                           <button onClick={() => setDeliverables(prev => prev.filter(x => x.id !== d.id))} style={{ background: 'transparent', border: 'none', color: 'var(--te-rose-500)', cursor: 'pointer' }}><Trash2 size={20} /></button>
                        </div>
                      ))}
                  </div>
               </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
