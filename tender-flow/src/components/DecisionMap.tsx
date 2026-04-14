import React, { useMemo, useCallback, useState, useEffect, useRef, memo } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  applyEdgeChanges, 
  applyNodeChanges, 
  addEdge,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  BaseEdge,
  getBezierPath,
  EdgeLabelRenderer,
  Panel,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  Node,
  Edge,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { StandardItem, ItemResponse, DependencyRule } from '../types';
import { 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Zap, 
  Lock as LockIcon, 
  Flag,
  Plus,
  Trash2,
  GitBranch,
  Save,
  Crosshair,
  Link as LinkIcon,
  X,
  PlusCircle,
  HelpCircle,
  Shapes,
  CheckCircle2
} from 'lucide-react';
import { isItemLocked } from '../engine/evaluator';

// --- Memoized Custom Nodes ---

const NodeCardStyle = {
  padding: '1.25rem',
  borderRadius: '16px',
  minWidth: '220px',
  border: '1px solid var(--te-border)',
  boxShadow: 'var(--te-shadow-lg)',
  fontSize: '0.9rem',
  color: 'var(--te-text-main)',
  position: 'relative' as const,
  transition: 'all 0.3s ease'
};

const StandardNode = memo(({ data: _data }: NodeProps) => {
  const data = _data as any;
  const isAnswered = data.isAnswered;
  const areaColor = data.areaColor || 'var(--te-accent-500)';
  const isLocked = data.isLocked;
  
  return (
    <div style={{
      ...NodeCardStyle,
      background: isAnswered ? 'rgba(16, 185, 129, 0.05)' : (isLocked ? 'rgba(0,0,0,0.4)' : 'var(--te-bg-card)'),
      borderLeft: `5px solid ${isLocked ? '#475569' : areaColor}`,
      borderRight: isAnswered ? '2px solid var(--te-emerald-500)' : (isLocked ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--te-border)'),
      color: isLocked ? '#64748b' : 'var(--te-text-main)'
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
           {isLocked ? (
             <LockIcon size={12} color="#64748b" />
           ) : (
             <div style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                border: `2px solid ${areaColor}`,
                background: isAnswered ? areaColor : 'transparent',
                boxShadow: isAnswered ? `0 0 8px ${areaColor}` : 'none'
             }} />
           )}
           <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: isLocked ? '#64748b' : areaColor }}>{data.area}</span>
        </div>
        {data.isSynced && (
          <div 
            onClick={(e) => { e.stopPropagation(); data.onMirrorFilter?.(data.label); }}
            title="Synchronized / Mirrored Item. Click to filter siblings." 
            style={{ cursor: 'pointer', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--te-emerald-500)', fontSize: '0.55rem', fontWeight: 950, padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px', border: '1px solid rgba(16, 185, 129, 0.2)' }}
          >
            <LinkIcon size={10} /> MIRROR
          </div>
        )}
      </div>
      <div style={{ fontWeight: 800, lineHeight: 1.4, fontSize: '0.95rem' }}>{data.label}</div>
      {data.isEditMode && (
        <button onClick={(e) => data.onDelete(data.id, e)} style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--te-rose-500)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
           <Trash2 size={12} />
        </button>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

const DecisionNode = memo(({ data: _data }: NodeProps) => {
  const data = _data as any;
  const isAnswered = data.isAnswered;
  const isLocked = data.isLocked;
  const areaColor = data.areaColor || 'var(--te-accent-500)';
  
  return (
    <div style={{
      position: 'relative',
      width: '200px',
      height: '200px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      cursor: 'pointer'
    }}>
      <div style={{
        position: 'absolute',
        width: '150px',
        height: '150px',
        background: isAnswered ? 'rgba(16, 185, 129, 0.05)' : (isLocked ? 'rgba(0,0,0,0.4)' : 'var(--te-bg-card)'),
        border: `3px solid ${isLocked ? '#475569' : areaColor}`,
        transform: 'rotate(45deg)',
        boxShadow: isAnswered ? `0 0 20px ${areaColor}44` : 'var(--te-shadow-lg)',
        borderRadius: '12px'
      }} />
      
      <div style={{ position: 'relative', zIndex: 1, padding: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '8px' }}>
            {isLocked ? (
               <LockIcon size={14} color="#64748b" />
            ) : (
               <div style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  border: `2px solid ${areaColor}`,
                  background: isAnswered ? areaColor : 'transparent',
                  boxShadow: isAnswered ? `0 0 8px ${areaColor}` : 'none'
               }} />
            )}
            <div style={{ fontSize: '0.6rem', fontWeight: 950, color: isLocked ? '#64748b' : areaColor, textTransform: 'uppercase' }}>{data.area}</div>
         </div>
         {data.isSynced && (
            <div 
               onClick={(e) => { e.stopPropagation(); data.onMirrorFilter?.(data.label); }}
               title="Synchronized / Mirrored. Click to filter siblings." 
               style={{ cursor: 'pointer', position: 'absolute', top: '-15px', color: 'var(--te-emerald-500)', display: 'flex', alignItems: 'center', gap: '3px', filter: 'drop-shadow(0 0 5px rgba(16,185,129,0.3))' }}
            >
               <LinkIcon size={12} /> <span style={{ fontSize: '0.5rem', fontWeight: 950 }}>MIRROR</span>
            </div>
         )}
         <div style={{ fontWeight: 950, fontSize: '0.95rem', lineHeight: 1.3, color: isLocked ? '#64748b' : 'var(--te-text-main)' }}>{data.label}</div>
      </div>
      {data.isEditMode && (
        <button onClick={(e) => data.onDelete(data.id, e)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--te-rose-500)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
           <Trash2 size={12} />
        </button>
      )}

      <Handle type="target" position={Position.Top} style={{ background: areaColor, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: areaColor, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Left} id="no" style={{ background: 'var(--te-rose-500)', width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} id="yes" style={{ background: 'var(--te-emerald-500)', width: 10, height: 10 }} />
    </div>
  );
});

const EndNode = memo(({ data }: NodeProps) => {
  return (
    <div style={{
      width: '80px',
      height: '80px',
      borderRadius: '50%',
      background: '#1e293b',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.8rem',
      fontWeight: 950,
      border: '4px solid var(--te-rose-500)',
      boxShadow: '0 0 20px rgba(244, 63, 94, 0.3)'
    }}>
       <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
       END
    </div>
  );
});

const ActionNode = memo(({ data: _data }: NodeProps) => {
  const data = _data as any;
  const isDone = data.isAnswered;
  const isLocked = data.isLocked;
  const areaColor = data.areaColor || 'var(--te-emerald-500)';
  
  return (
    <div style={{
      ...NodeCardStyle,
      background: isDone ? 'rgba(16, 185, 129, 0.05)' : (isLocked ? 'rgba(0,0,0,0.3)' : 'var(--te-bg-card)'),
      border: `2px ${isDone ? 'solid' : (isLocked ? 'solid' : 'dashed')} ${isLocked ? '#475569' : areaColor}`,
      borderRadius: '12px',
      minWidth: '200px',
      boxShadow: isDone ? `0 0 15px ${areaColor}44` : 'var(--te-shadow-sm)',
      color: isLocked ? '#64748b' : 'var(--te-text-main)',
      opacity: isLocked ? 0.6 : 1
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {isLocked ? (
               <LockIcon size={12} color="#64748b" />
            ) : (
               <Zap size={14} color={areaColor} />
            )}
            <span style={{ fontSize: '0.6rem', fontWeight: 950, textTransform: 'uppercase', color: isLocked ? '#64748b' : areaColor }}>ACTION NODE</span>
         </div>
         {data.isSynced && (
           <div 
             onClick={(e) => { e.stopPropagation(); data.onMirrorFilter?.(data.label); }}
             title="Synced Action. Click to filter siblings." 
             style={{ cursor: 'pointer', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--te-emerald-500)', borderRadius: '50%', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
           >
             <LinkIcon size={10} />
           </div>
         )}
         {isDone && <CheckCircle2 size={14} color={areaColor} />}
      </div>
      <div style={{ fontWeight: 800, fontSize: '0.85rem', opacity: isLocked ? 0.6 : 1 }}>{data.label}</div>
      <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: isLocked ? '#64748b' : (isDone ? areaColor : 'var(--te-text-muted)'), fontWeight: 800 }}>
        STATUS: {isLocked ? 'BLOCKED' : (data.value || 'Pending')}
      </div>
      {data.isEditMode && (
        <button onClick={(e) => data.onDelete(data.id, e)} style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--te-rose-500)', color: 'white', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>
           <Trash2 size={10} />
        </button>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

const LinkNode = memo(({ data }: NodeProps) => {
  const isAnswered = data.isAnswered;
  const areaColor = data.areaColor || 'var(--te-accent-500)';
  const isLocked = data.isLocked;
  
  return (
    <div style={{
      ...NodeCardStyle,
      background: isAnswered ? 'rgba(59, 130, 246, 0.1)' : (isLocked ? 'rgba(0,0,0,0.3)' : 'var(--te-bg-card)'),
      border: `2px solid ${isLocked ? '#475569' : 'var(--te-accent-500)'}`,
      borderLeft: `6px solid ${isLocked ? '#475569' : 'var(--te-accent-500)'}`,
      borderRadius: '12px',
      color: isLocked ? '#64748b' : 'var(--te-text-main)',
      opacity: isLocked ? 0.7 : 1
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isLocked ? <LockIcon size={12} color="#64748b" /> : <LinkIcon size={14} color="var(--te-accent-400)" />}
            <span style={{ fontSize: '0.6rem', fontWeight: 950, textTransform: 'uppercase', color: isLocked ? '#64748b' : 'var(--te-accent-400)' }}>RESOURCE LINK</span>
         </div>
      </div>
      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: isLocked ? '#64748b' : 'var(--te-accent-400)', textDecoration: isLocked ? 'none' : 'underline' }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

const nodeTypes = {
  question: StandardNode,
  decision: DecisionNode,
  action: ActionNode,
  link: LinkNode,
  end: EndNode
};

const LabeledEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  }) as any;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          {data?.label && (
            <div style={{ 
              padding: '2px 8px', 
              borderRadius: '12px', 
              background: 'white', 
              border: '1px solid var(--te-border)',
              fontSize: '0.65rem',
              fontWeight: 900,
              color: 'var(--te-primary-900)',
              cursor: 'pointer'
            }}>
              {data.label}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = {
  labeled: LabeledEdge
};

interface Props {
  items: StandardItem[];
  allItems: StandardItem[];
  responses: Record<string, ItemResponse>;
  stagesList: string[];
  areas: { id: string; name: string; color?: string }[];
  onNodeClick?: (id: string) => void;
  onSaveStandard?: (data: { questions: StandardItem[], stages: any[], areas: any[] }) => void;
  stagesData?: any[];
  isEditMode?: boolean;
  onAddDependency?: (sourceId: string, targetId: string) => void;
  onUpdateDependency?: (targetItemId: string, sourceItemId: string, newValue: string) => void;
  onDeleteNode?: (id: string) => void;
  onMirrorFilter?: (text: string) => void;
}

const MapContentInternal: React.FC<Props> = ({ 
  items, 
  allItems, 
  responses, 
  stagesList, 
  areas, 
  onNodeClick,
  onSaveStandard,
  stagesData,
  isEditMode = false,
  onAddDependency,
  onUpdateDependency,
  onDeleteNode,
  onMirrorFilter
}) => {
  const { getViewport } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [clipboard, setClipboard] = useState<Node[]>([]);
  const [history, setHistory] = useState<StandardItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const saveTimeoutRef = React.useRef<any>(null);
  // Ref keeps latest responses available inside structure-rebuild effect without
  // including `responses` in that effect's dependency array.
  // Updated in render body (not useEffect) so it's always current when Effect A's
  // cleanup/re-run fires — same "always-latest ref" pattern used in OpportunityDetail.
  const responsesRef = useRef(responses);
  responsesRef.current = responses;
  // Debounce ref for the response-only node-data update (Effect B).
  const responseUpdateTimerRef = useRef<any>(null);

  const internalDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteNode?.(id);
  }, [onDeleteNode]);

  // ---------------------------------------------------------------------------
  // EFFECT A — STRUCTURAL REBUILD
  // Fires when question items, dependency rules, stage/area metadata, or edit
  // mode change. These changes are infrequent (structure edits, not typing).
  //
  // PERF FIX: `responses` is intentionally NOT in this dep array.
  // Response-based node-data updates are handled by Effect B (debounced), so we
  // no longer rebuild 200 nodes + O(N²) edges on every single keystroke.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const currentResponses = responsesRef.current;
    const visibleIds = new Set(items.map(i => i.id));

    const initialNodes: Node[] = items.map((item, idx) => {
      const resp = currentResponses[item.id];
      const areaColor = areas.find(a => a.name === item.area)?.color || '#64748b';
      const { locked } = isItemLocked(item, currentResponses);

      return {
        id: item.id,
        type: item.itemType === 'decision' ? 'decision' : (item.itemType === 'end' ? 'end' : (item.itemType === 'action' ? 'action' : (item.itemType === 'link' ? 'link' : 'question'))),
        position: item.visualPosition || { x: idx * 280, y: (stagesList.indexOf(item.stage) || 0) * 450 },
        data: {
          id: item.id,
          label: item.content,
          area: item.area,
          areaColor,
          isAnswered: resp?.status === 'answered' || resp?.status === 'confirmed',
          value: resp?.value || '',
          isLocked: locked,
          isSynced: !!item.syncId,
          isEditMode,
          onDelete: internalDelete,
          onMirrorFilter
        },
      };
    });

    const initialEdges: Edge[] = [];
    allItems.forEach(item => {
      (item.dependencyRules || []).forEach((rule, ridx) => {
        if (visibleIds.has(rule.targetId) && visibleIds.has(item.id)) {
          initialEdges.push({
            id: `e-${rule.targetId}-${item.id}-${ridx}`,
            source: rule.targetId,
            target: item.id,
            type: 'labeled',
            data: {
              label: rule.operator === 'equals' ? String(rule.value) : (rule.operator === 'any_value' ? 'IF ANY' : ''),
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--te-accent-500)', width: 20, height: 20 },
            style: { stroke: 'var(--te-accent-500)', strokeWidth: 3, opacity: 0.7 }
          });
        }
      });
    });

    setNodes(initialNodes);
    setEdges(initialEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, stagesList, areas, allItems, isEditMode, internalDelete, onMirrorFilter]);

  // ---------------------------------------------------------------------------
  // EFFECT B — RESPONSE DATA UPDATE (debounced, 120ms)
  // Only updates `isAnswered`, `value`, and `isLocked` on existing nodes.
  // Node positions, edges, and structure are NOT touched.
  //
  // PERF FIX: 120ms debounce means we batch rapid keystrokes into one update.
  // The graph map stays readable during typing without per-character re-renders.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (responseUpdateTimerRef.current) clearTimeout(responseUpdateTimerRef.current);
    responseUpdateTimerRef.current = setTimeout(() => {
      setNodes(prevNodes => {
        let changed = false;
        const next = prevNodes.map(node => {
          const item = allItems.find(i => i.id === node.id);
          if (!item) return node;
          const resp = responses[node.id];
          const { locked } = isItemLocked(item, responses);
          const isAnswered = resp?.status === 'answered' || resp?.status === 'confirmed';
          const value = resp?.value || '';
          // Skip update when nothing changed to avoid invalidating memo'd nodes
          if (node.data.isAnswered === isAnswered && node.data.value === value && node.data.isLocked === locked) {
            return node;
          }
          changed = true;
          return { ...node, data: { ...node.data, isAnswered, value, isLocked: locked } };
        });
        return changed ? next : prevNodes;
      });
    }, 120);
    return () => { if (responseUpdateTimerRef.current) clearTimeout(responseUpdateTimerRef.current); };
  }, [responses, allItems]);

  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const saveWithHistory = useCallback((newQuestions: StandardItem[]) => {
    // Add current to history
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newQuestions);
    if (nextHistory.length > 50) nextHistory.shift();
    
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    
    onSaveStandard?.({ questions: newQuestions, stages: stagesData || [], areas: areas || [] });
  }, [history, historyIndex, onSaveStandard, stagesData, areas]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      onSaveStandard?.({ questions: prev, stages: stagesData || [], areas: areas || [] });
    }
  }, [history, historyIndex, onSaveStandard, stagesData, areas]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      onSaveStandard?.({ questions: next, stages: stagesData || [], areas: areas || [] });
    }
  }, [history, historyIndex, onSaveStandard, stagesData, areas]);

  // Initial history record
  useEffect(() => {
    if (history.length === 0 && allItems.length > 0) {
      setHistory([allItems]);
      setHistoryIndex(0);
    }
  }, [allItems]);

  const onNodeDragStop = (event: any, draggedNode: Node) => {
    if (!onSaveStandard) return;
    
    const selectedNodes = nodes.filter(n => n.selected || n.id === draggedNode.id);
    const updatedItems = allItems.map(item => {
      const movedNode = selectedNodes.find(n => n.id === item.id);
      if (movedNode) {
        return { ...item, visualPosition: movedNode.position };
      }
      return item;
    });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
       saveWithHistory(updatedItems);
    }, 1000);
  };

  const copySelection = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length > 0) {
      setClipboard(selected);
      console.log(`[CLIPBOARD] Copied ${selected.length} items.`);
    }
  }, [nodes]);

  const pasteSelection = useCallback(() => {
     if (clipboard.length === 0) return;
     
     const newItems: StandardItem[] = [...allItems];
     const offset = 50;
     const idMap: Record<string, string> = {};

     // Create new items for each clipped node
     clipboard.forEach(clipNode => {
        const originalItem = allItems.find(i => i.id === clipNode.id);
        if (!originalItem) return;

        const newId = `Q_${newItems.length + 1}_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        idMap[clipNode.id] = newId;

        const newItem: StandardItem = {
          ...originalItem,
          id: newId,
          syncId: undefined, // CLONE is independent by definition in the map
          content: `${originalItem.content} (Copy)`,
          visualPosition: { 
            x: clipNode.position.x + offset, 
            y: clipNode.position.y + offset 
          }
        };
        newItems.push(newItem);
     });

     // Re-link dependencies ONLY if the target was also in the clipboard
     newItems.forEach(item => {
       if (idMap[item.id]) { // This is one of the newly pasted items
         if (item.dependencyRules) {
           item.dependencyRules = item.dependencyRules.filter(rule => {
             // Keep if target is also in the pasted set
             return idMap[rule.targetId] !== undefined;
           }).map(rule => {
             return { ...rule, targetId: idMap[rule.targetId] };
           });
         }
       }
     });

     saveWithHistory(newItems);
  }, [clipboard, allItems, saveWithHistory]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isEditMode) return;
      if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 'c') copySelection();
        if (e.key === 'v') pasteSelection();
        if (e.key === 'z') undo();
        if (e.key === 'y') redo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isEditMode, copySelection, pasteSelection]);

  const onConnect: OnConnect = (params) => {
     if (isEditMode && params.source && params.target) {
        onAddDependency?.(params.source, params.target);
     }
  };

  const addNewQuestion = (type: 'question' | 'decision' | 'end' | 'action') => {
    if (!onSaveStandard) return;
    const newId = `Q_${allItems.length + 1}_${Date.now().toString().slice(-4)}`;
    
    // Position in current center of viewport
    const { x, y, zoom } = getViewport();
    const centerX = -x / zoom + (window.innerWidth / 2) / zoom - 100;
    const centerY = -y / zoom + (window.innerHeight / 2) / zoom - 50;

    const newQ: StandardItem = {
      id: newId,
      active: true,
      stage: stagesList[0] || 'Common',
      area: areas[0]?.name || 'Initial Intake', 
      priority: 'medium',
      itemType: type,
      content: type === 'end' ? 'Flow End' : (type === 'action' ? 'New Action Point' : 'New Decision Point'),
      responseType: type === 'decision' ? 'any' : 'boolean',
      allowedValues: type === 'decision' ? ['Option A', 'Option B', 'TBD'] : [],
      mandatory: false,
      tags: [],
      order: allItems.length,
      logicString: '',
      deliverableTarget: [],
      visualPosition: { x: centerX, y: centerY }
    };
    saveWithHistory([...allItems, newQ]);
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: 'var(--te-bg-main)', overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        fitView
        minZoom={0.05}
        maxZoom={4}
        connectionMode="loose"
        panOnDrag={true}
        selectionOnDrag={false}
        selectionMode={SelectionMode.Partial}
      >
        <Background color="rgba(255,255,255,0.05)" />
        <Controls 
           style={{ 
             background: 'var(--te-primary-900)', 
             border: '1px solid var(--te-border)', 
             borderRadius: '8px', 
             padding: '4px'
           }} 
        />
        
        <MiniMap 
          style={{ height: 120, width: 220, background: 'rgba(10,15,25,0.85)', borderRadius: '12px', border: '1px solid var(--te-border)', borderBottom: '4px solid var(--te-accent-500)' }} 
          nodeColor={(n) => (n.data as any).areaColor || '#3b82f6'}
          maskColor="rgba(0,0,0,0.3)"
          zoomable
          pannable
        />

        {isEditMode && (
          <Panel position="top-left">
            <div style={{ 
              background: 'rgba(15, 23, 42, 0.95)', 
              padding: '1.75rem', 
              borderRadius: '28px', 
              border: '2px solid rgba(255,255,255,0.1)', 
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)', 
              width: '340px', 
              backdropFilter: 'blur(20px)',
              marginTop: '1rem',
              marginLeft: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                   <div style={{ background: 'var(--te-accent-500)', padding: '6px', borderRadius: '8px' }}>
                      <Shapes size={18} color="white" />
                   </div>
                   <div>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 950, color: 'white', margin: 0, letterSpacing: '0.05em' }}>MAPPING TOOLS</h3>
                      <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800, margin: 0 }}>Architect Mode Active</p>
                   </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                   <button onClick={() => addNewQuestion('question')} className="te-btn te-btn-primary" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.1rem', borderRadius: '16px', background: 'var(--te-accent-500)' }}>
                      <PlusCircle size={20} /> <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '0.85rem', fontWeight: 900 }}>QUESTION</span><span style={{ fontSize: '0.6rem', opacity: 0.7 }}>Standard task node</span></div>
                   </button>
                   <button onClick={() => addNewQuestion('decision')} className="te-btn te-btn-outline" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <GitBranch size={20} /> <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '0.85rem', fontWeight: 900 }}>DECISION</span><span style={{ fontSize: '0.6rem', opacity: 0.7 }}>Diamond branch node</span></div>
                   </button>
                    <button onClick={() => addNewQuestion('action')} className="te-btn te-btn-outline" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.1rem', borderRadius: '16px', background: 'rgba(16, 185, 129, 0.05)', border: '1px dashed var(--te-emerald-500)', color: 'var(--te-emerald-500)' }}>
                       <Zap size={20} /> <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '0.85rem', fontWeight: 900 }}>ACTION</span><span style={{ fontSize: '0.6rem', opacity: 0.7 }}>Loop Synchronized task</span></div>
                    </button>
                    <button onClick={() => addNewQuestion('end')} className="te-btn te-btn-outline" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.1rem', borderRadius: '16px', borderStyle: 'dashed', background: 'rgba(244, 63, 94, 0.05)', color: 'var(--te-rose-500)' }}>
                      <X size={20} /> <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '0.85rem', fontWeight: 900 }}>TERMINATOR</span><span style={{ fontSize: '0.6rem', opacity: 0.7 }}>End of flow branch</span></div>
                   </button>
                </div>
                <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                   <Plus size={12} color="var(--te-emerald-500)" />
                   <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, margin: 0 }}>Drag from node ports to link logic.</p>
                </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};

const MapContent = memo(MapContentInternal);

export const DecisionMap: React.FC<Props> = memo((props) => (
  <ReactFlowProvider>
    <MapContent {...props} />
  </ReactFlowProvider>
));
