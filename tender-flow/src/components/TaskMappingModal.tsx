import React, { useState, useMemo } from 'react';
import { Search, X, CheckCircle2, Database, AlertCircle, AlertTriangle } from 'lucide-react';

interface TaskMappingModalProps {
  loopDb: any[]; 
  dbName: string | null;
  currentOpId: string | null;
  onSelectTask: (taskId: string) => void;
  onUpdateOpId: (opId: string) => void;
  onLoadDb: () => void; // New: Callback to trigger file picker in parent
  onClose: () => void;
}

/**
 * MAPPING TOOL ASSISTANT v2.0
 * Helps link an Action node to a Loop Task with DB verification.
 */
export const TaskMappingModal: React.FC<TaskMappingModalProps> = ({ 
  loopDb, 
  dbName,
  currentOpId, 
  onSelectTask, 
  onUpdateOpId, 
  onLoadDb,
  onClose 
}) => {
  const [opSearchQuery, setOpSearchQuery] = useState('');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [step, setStep] = useState<'db_verify' | 'op_search' | 'task_linking'>(
    !loopDb || loopDb.length === 0 ? 'db_verify' : (currentOpId ? 'task_linking' : 'op_search')
  );

  // FIND OPPORTUNITIES
  // FIND OPPORTUNITIES
  const opSearchResults = useMemo(() => {
    if (!opSearchQuery || opSearchQuery.length < 2) return [];
    const q = opSearchQuery.toLowerCase();
    return (loopDb || []).filter(row => {
      // Polymorphic search (Handles Excel rows or JSON Opportunity objects)
      const id = String(row.ID || row.id || row.OP || row.qlk || '').toLowerCase();
      const name = String(row.Name || row.alias || row.title || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    }).slice(0, 10);
  }, [loopDb, opSearchQuery]);

  // FIND TASKS FOR CURRENT OP
  const tasksForThisOp = useMemo(() => {
    if (!currentOpId) return [];
    
    // Check if it's the JSON structure (Opportunity objects with .tasks)
    const opItem = (loopDb || []).find(it => {
       const id = String(it.id || it.ID || it.OP || it.qlk || '');
       return id === currentOpId;
    });

    let rawTasks = [];
    if (opItem && Array.isArray(opItem.tasks)) {
       rawTasks = opItem.tasks; // Native JSON structure
    } else {
       // Fallback: Excel-style flat list (filter by OP_ID reference)
       rawTasks = (loopDb || []).filter(row => {
          const rowOpId = String(row.OP_ID || row.Opportunity_ID || row.Opportunity || row.parent_id || '');
          return rowOpId === currentOpId && (row.Task || row.task_name || row.Description || row.title);
       });
    }

    if (!taskSearchQuery) return rawTasks;
    const q = taskSearchQuery.toLowerCase();
    return rawTasks.filter((t: any) => {
       const title = (t.title || t.Task || t.Description || t.task_name || '').toLowerCase();
       return title.includes(q);
    });
  }, [loopDb, currentOpId, taskSearchQuery]);

  return (
    <div className="te-modal-backdrop" style={{ zIndex: 1000, position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="te-card fade-in" style={{ width: '600px', background: 'var(--te-bg-card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--te-border)', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        
        {/* Connection Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '0.8rem 1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--te-border)' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: loopDb?.length > 0 ? 'var(--te-emerald-500)' : 'var(--te-rose-500)', boxShadow: loopDb?.length > 0 ? '0 0 10px var(--te-emerald-500)' : 'none' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase' }}>
                {dbName ? `Connected: ${dbName}` : 'No Loop DB Connected'}
              </span>
           </div>
           <button onClick={onLoadDb} className="te-btn te-btn-outline" style={{ fontSize: '0.6rem', padding: '4px 10px', fontWeight: 900 }}>SWITCH DATABASE</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 950, textTransform: 'uppercase', color: 'white', letterSpacing: '-0.02em' }}>
            {step === 'db_verify' ? 'Verify Loop Connection' : (step === 'op_search' ? 'Identify Opportunity' : 'Select Sync Task')}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer', opacity: 0.5 }}><X size={24} /></button>
        </div>

        {step === 'db_verify' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <Database size={64} color="var(--te-accent-500)" style={{ marginBottom: '1.5rem', opacity: 0.8 }} />
            <p style={{ color: 'var(--te-text-muted)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.5' }}>
              To synchronize strategic actions, you must connect the current <b>TenderLoop Database (Excel)</b>.
            </p>
            {loopDb?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button onClick={() => setStep(currentOpId ? 'task_linking' : 'op_search')} className="te-btn te-btn-primary" style={{ width: '100%', padding: '1rem', fontWeight: 950 }}>KEEP CURRENT DATABASE</button>
                <button onClick={onLoadDb} className="te-btn te-btn-outline" style={{ width: '100%', padding: '1rem', fontWeight: 950 }}>SELECT DIFFERENT DATABASE</button>
              </div>
            ) : (
              <button onClick={onLoadDb} className="te-btn te-btn-primary" style={{ width: '100%', padding: '1rem', fontWeight: 950 }}>SELECT LOOP RECORD FILE (.xlsx)</button>
            )}
          </div>
        )}

        {step === 'op_search' && (
          <div>
            <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem' }}>
               <AlertCircle size={20} color="var(--te-accent-500)" style={{ flexShrink: 0 }} />
               <p style={{ fontSize: '0.75rem', color: 'var(--te-text-muted)', lineHeight: '1.4' }}>Search for the <b>Loop Opportunity</b> to retrieve its live task list.</p>
            </div>
            
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
               <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--te-text-muted)' }} />
               <input 
                 autoFocus
                 placeholder="Search by ID, Name or Alias..."
                 value={opSearchQuery}
                 onChange={(e) => setOpSearchQuery(e.target.value)}
                 style={{ width: '100%', padding: '0.9rem 1.25rem 0.9rem 2.8rem', background: 'var(--te-bg-card-alt)', border: '1px solid var(--te-border)', borderRadius: '12px', color: 'white', outline: 'none', fontSize: '0.9rem' }}
               />
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="hide-scrollbar">
              {opSearchResults.map((op, i) => (
                <div 
                  key={i} 
                  onClick={() => {
                    const id = op.ID || op.OP || op.id;
                    onUpdateOpId(id);
                    setStep('task_linking');
                  }}
                  className="te-list-item" 
                  style={{ padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', cursor: 'pointer', border: '1px solid var(--te-border)', transition: 'all 0.2s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div>
                        <div style={{ fontWeight: 900, color: 'white', fontSize: '0.95rem', marginBottom: '0.2rem' }}>{op.alias || op.Name || 'Unnamed'}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--te-accent-500)', fontWeight: 800 }}>ID: {op.ID || op.OP || op.id}</div>
                     </div>
                     <CheckCircle2 size={18} color="var(--te-accent-500)" />
                  </div>
                </div>
              ))}
              {opSearchQuery.length >= 2 && opSearchResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--te-rose-400)', fontSize: '0.85rem', fontWeight: 800 }}>
                   <AlertTriangle size={32} style={{ margin: '0 auto 1rem auto', display: 'block', opacity: 0.6 }} />
                   No matching opportunity found.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'task_linking' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', padding: '0.8rem 1.25rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
               <div style={{ fontSize: '0.75rem', fontWeight: 950, color: 'var(--te-accent-500)', textTransform: 'uppercase' }}>OP: {currentOpId}</div>
               <button onClick={() => setStep('op_search')} style={{ fontSize: '0.65rem', background: 'none', border: 'none', color: 'var(--te-text-muted)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 900 }}>CHANGE OPPORTUNITY</button>
            </div>

            <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
               <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--te-text-muted)' }} />
               <input 
                 autoFocus
                 placeholder="Search task by name..."
                 value={taskSearchQuery}
                 onChange={(e) => setTaskSearchQuery(e.target.value)}
                 style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: 'var(--te-bg-card-alt)', border: '1px solid var(--te-border)', borderRadius: '10px', color: 'white', outline: 'none', fontSize: '0.8rem' }}
               />
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="hide-scrollbar">
              {tasksForThisOp.length > 0 ? tasksForThisOp.map((task, i) => (
                <div 
                  key={i} 
                  onClick={() => onSelectTask(task.Task_ID || task.id || `T-${i}`)}
                  className="te-list-item" 
                  style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', cursor: 'pointer', border: '1px solid var(--te-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'transform 0.2s' }}
                >
                  <div style={{ flex: 1, paddingRight: '1rem' }}>
                    <div style={{ fontWeight: 950, fontSize: '0.95rem', color: 'white', marginBottom: '0.4rem', letterSpacing: '-0.01em' }}>
                      {task.title || task.Task || task.Description || task.task_name}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                       <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--te-emerald-500)' }} />
                       <span style={{ fontSize: '0.65rem', color: 'var(--te-emerald-500)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                         {task.Status || task.status || 'Pending'}
                       </span>
                    </div>
                  </div>
                  <CheckCircle2 size={20} color="var(--te-emerald-500)" style={{ opacity: 0.8 }} />
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '3.5rem 2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px dashed var(--te-border)' }}>
                   <p style={{ color: 'var(--te-text-muted)', fontSize: '0.9rem', fontWeight: 900 }}>No tasks found for this Opportunity in Loop DB.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
