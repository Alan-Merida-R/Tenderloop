import React, { useMemo } from 'react';
import { StandardItem, ItemResponse } from '../types';
import { 
  ChevronRight, 
  CheckCircle2, 
  AlertTriangle, 
  Lock,
  ArrowRight,
  GitBranch,
  Flag,
  Zap,
  Lock as LockIcon
} from 'lucide-react';
import { isItemLocked, evaluateStatus } from '../engine/evaluator';

interface Props {
  items: StandardItem[];
  responses: Record<string, ItemResponse>;
  stages: string[];
  areas: { id: string; name: string; color?: string }[];
  onNodeClick?: (id: string) => void;
}

/**
 * Strategic Tree View - Jerárquico por Stages
 * Now filters out empty stages based on search/active visibility.
 */
export const ExecutiveDecisionMap: React.FC<Props> = ({ 
  items, 
  responses, 
  stages = [], 
  areas,
  onNodeClick 
}) => {
  
  const stageData = useMemo(() => {
    return stages.map(stg => {
      // Items that match the current visible set (already filtered in parent)
      const stgItems = items.filter(i => i.stage === stg);
      
      const answered = stgItems.filter(i => responses[i.id]?.status === 'answered' || responses[i.id]?.status === 'confirmed').length;
      const total = stgItems.length;
      const percentage = total > 0 ? Math.round((answered / total) * 100) : 0;
      
      if (total === 0) return null; // Hide the stage if it has no matching items
      
      return {
        name: stg,
        percentage,
        items: stgItems,
        isCompleted: percentage === 100 && total > 0
      };
    }).filter(Boolean); // Filter out stages with no items
  }, [items, responses, stages]);

  return (
    <div className="te-exec-flow" style={{ padding: '3rem', minWidth: '1100px', background: 'var(--te-bg-app)', height: '100%', overflowY: 'auto' }}>
      <div style={{ position: 'relative', maxWidth: '1400px', margin: '0 auto' }}>
        
        {stageData.length === 0 && (
          <div style={{ padding: '10rem', textAlign: 'center', opacity: 0.5, fontStyle: 'italic' }}>
             No results found matching your criteria.
          </div>
        )}

        {stageData.map((stage: any, sIdx) => (
          <div key={stage.name} style={{ marginBottom: '4rem', position: 'relative' }}>
             {/* Stage Header Node */}
             <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '2rem', position: 'relative', zIndex: 10 }}>
                <div style={{ 
                  width: '56px', height: '56px', borderRadius: '50%', background: stage.isCompleted ? 'var(--te-emerald-500)' : 'var(--te-primary-700)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950, color: 'white', border: '4px solid var(--te-bg-card)', boxShadow: 'var(--te-shadow-md)'
                }}>
                  {stage.isCompleted ? <CheckCircle2 size={24} /> : sIdx + 1}
                </div>
                <div style={{ flex: 1 }}>
                   <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--te-accent-500)', opacity: 0.6 }}>STAGE {sIdx + 1}</div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 950, color: 'var(--te-text-main)' }}>{stage.name.toUpperCase()}</h3>
                      <span style={{ fontSize: '1rem', fontWeight: 900, color: stage.isCompleted ? 'var(--te-emerald-500)' : 'var(--te-amber-500)' }}>{stage.percentage}% READY</span>
                   </div>
                </div>
             </div>

             {/* Branch and Items - TREE DIAGRAM STYLE */}
             <div style={{ paddingLeft: '80px', display: 'flex', flexDirection: 'column', gap: '0.8rem', position: 'relative' }}>
                {/* Branch Vertical Trunk (only if not last stage, or just full length) */}
                <div style={{ 
                   position: 'absolute', 
                   left: '28px', 
                   top: '-2rem', 
                   bottom: '0', 
                   width: '2px', 
                   background: 'linear-gradient(to bottom, var(--te-accent-500) 0%, rgba(255,255,255,0.05) 100%)',
                   opacity: 0.4 
                }} />
                
                  {stage.items.map((item: any, iIdx: number) => {
                    const resp = responses[item.id];
                    const currentStatus = evaluateStatus(resp);
                    const isDone = currentStatus === 'answered' || currentStatus === 'confirmed';
                    const { locked } = isItemLocked(item, responses);

                    const areaDef = areas.find(a => a.name === item.area);
                    const areaColor = areaDef?.color || 'var(--te-accent-500)';
                    
                    return (
                      <div key={item.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                         {/* Horizontal Branch Connector */}
                         <div style={{ 
                            position: 'absolute', 
                            left: '-52px', 
                            top: '50%', 
                            width: '52px', 
                            height: '2px', 
                            background: 'rgba(255,255,255,0.05)',
                            borderLeft: `3px solid ${locked ? '#475569' : areaColor}`
                         }} />

                         <div 
                           onClick={() => onNodeClick?.(item.id)}
                           style={{ 
                             flex: 1,
                             maxWidth: '500px',
                             padding: '0.9rem 1.25rem', 
                             borderRadius: '16px', 
                             background: locked ? 'rgba(15, 23, 42, 0.6)' : (isDone ? `${areaColor}11` : 'var(--te-bg-card)'), 
                             border: `1px solid ${locked ? 'rgba(255,255,255,0.03)' : (isDone ? areaColor : 'var(--te-border)')}`, 
                             borderLeft: `4px solid ${locked ? '#475569' : areaColor}`,
                             cursor: 'pointer',
                             display: 'flex',
                             alignItems: 'center',
                             gap: '1rem',
                             transition: 'all 0.2s',
                             boxShadow: isDone && !locked ? `0 4px 20px ${areaColor}22` : 'none',
                             zIndex: 1
                           }}
                         >
                            <div style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
                               {locked ? (
                                  <LockIcon size={16} color="#475569" />
                               ) : (
                                 <div style={{ 
                                    width: '10px', 
                                    height: '10px', 
                                    borderRadius: '50%', 
                                    border: `2px solid ${areaColor}`,
                                    background: isDone ? areaColor : 'transparent',
                                    boxShadow: isDone ? `0 0 10px ${areaColor}` : 'none'
                                 }} />
                               )}
                            </div>
                            <div style={{ flex: 1 }}>
                               <div style={{ fontSize: '0.65rem', fontWeight: 900, color: locked ? '#475569' : areaColor, textTransform: 'uppercase', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                 {item.itemType === 'action' && <Zap size={10} />}
                                 {item.area}
                               </div>
                               <div style={{ fontSize: '0.95rem', fontWeight: 800, color: locked ? '#475569' : 'var(--te-text-main)' }}>
                                 {item.content}
                               </div>
                               {item.itemType === 'action' && (
                                 <div style={{ fontSize: '0.6rem', fontWeight: 900, color: isDone ? 'var(--te-emerald-500)' : 'var(--te-text-muted)', marginTop: '4px', textTransform: 'uppercase' }}>
                                    LOOP SYNC: {resp?.value || 'PENDING'}
                                 </div>
                               )}
                            </div>
                            {resp?.isFlagged && <Flag size={14} color="var(--te-rose-500)" fill="currentColor" />}
                         </div>
                      </div>
                    );
                })}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
