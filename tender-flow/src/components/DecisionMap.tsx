import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
  MarkerType
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

// --- Custom Edge ---

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

// --- Custom Nodes ---

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

const StandardNode: React.FC<NodeProps> = ({ data }) => {
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
};

const DecisionNode: React.FC<NodeProps> = ({ data }) => {
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
};

const EndNode: React.FC<NodeProps> = ({ data }) => {
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
};

const ActionNode: React.FC<NodeProps> = ({ data }) => {
  const isDone = data.isAnswered;
  const areaColor = data.areaColor || 'var(--te-emerald-500)';
  
  return (
    <div style={{
      ...NodeCardStyle,
      background: isDone ? 'rgba(16, 185, 129, 0.1)' : 'var(--te-bg-card)',
      border: `2px ${isDone ? 'solid' : 'dashed'} ${areaColor}`,
      borderRadius: '12px',
      minWidth: '200px',
      boxShadow: isDone ? `0 0 15px ${areaColor}44` : 'var(--te-shadow-sm)'
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Zap size={14} color={areaColor} />
            <span style={{ fontSize: '0.6rem', fontWeight: 950, textTransform: 'uppercase', color: areaColor }}>ACTION NODE</span>
         </div>
         {isDone && <CheckCircle2 size={14} color={areaColor} />}
      </div>
      <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{data.label}</div>
      <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: isDone ? areaColor : 'var(--te-text-muted)', fontWeight: 800 }}>
        STATUS: {data.value || 'Pending'}
      </div>
      {data.isEditMode && (
        <button onClick={(e) => data.onDelete(data.id, e)} style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--te-rose-500)', color: 'white', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>
           <Trash2 size={10} />
        </button>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const nodeTypes = {
  question: StandardNode,
  decision: DecisionNode,
  action: ActionNode,
  end: EndNode
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
}

export const DecisionMap: React.FC<Props> = ({ 
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
  onDeleteNode
}) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const internalDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteNode?.(id);
  };

  useEffect(() => {
    const visibleIds = new Set(items.map(i => i.id));
    
    const initialNodes: Node[] = items.map((item, idx) => {
      const resp = responses[item.id];
      const areaColor = areas.find(a => a.name === item.area)?.color || '#64748b';
      const { locked } = isItemLocked(item, responses);

      return {
        id: item.id,
        type: item.itemType === 'decision' ? 'decision' : (item.itemType === 'end' ? 'end' : (item.itemType === 'action' ? 'action' : 'question')),
        position: item.visualPosition || { x: idx * 280, y: (stagesList.indexOf(item.stage) || 0) * 450 },
        data: { 
          id: item.id,
          label: item.content, 
          area: item.area, 
          areaColor, 
          isAnswered: resp?.status === 'answered' || resp?.status === 'confirmed',
          value: resp?.value || '',
          isLocked: locked,
          isEditMode,
          onDelete: internalDelete
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
  }, [items, responses, stagesList, areas, allItems, isEditMode]);

  const onNodesChange: OnNodesChange = (changes) => setNodes((nds) => applyNodeChanges(changes, nds));
  const onEdgesChange: OnEdgesChange = (changes) => setEdges((eds) => applyEdgeChanges(changes, eds));

  const onNodeDragStop = (event: any, node: Node) => {
    if (!onSaveStandard) return;
    const updatedItems = allItems.map(item => 
      item.id === node.id ? { ...item, visualPosition: node.position } : item
    );
    onSaveStandard({ questions: updatedItems, stages: stagesData || [], areas: areas || [] });
  };

  const onConnect: OnConnect = (params) => {
     if (isEditMode && params.source && params.target) {
        onAddDependency?.(params.source, params.target);
     }
  };

  const addNewQuestion = (type: 'question' | 'decision' | 'end' | 'action') => {
    if (!onSaveStandard) return;
    const newId = `Q_${allItems.length + 1}_${Date.now().toString().slice(-4)}`;
    const newQ: StandardItem = {
      id: newId,
      active: true,
      stage: stagesList[0] || 'Common',
      area: areas[0]?.name || 'Initial Intake', 
      priority: 'medium',
      itemType: type,
      content: type === 'end' ? 'Flow End' : 'New Decision Point',
      responseType: type === 'decision' ? 'any' : 'boolean',
      allowedValues: type === 'decision' ? ['Option A', 'Option B', 'TBD'] : [],
      mandatory: false,
      tags: [],
      order: allItems.length,
      logicString: '',
      deliverableTarget: [],
      visualPosition: { x: Math.random() * 500, y: Math.random() * 500 }
    };
    onSaveStandard({ questions: [...allItems, newQ], stages: stagesData || [], areas: areas || [] });
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
        connectionMode="loose"
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
