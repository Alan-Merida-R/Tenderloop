import React from 'react';
import { Database, Plus, FolderOpen, RefreshCw, Download, AlertTriangle, ChevronDown } from 'lucide-react';
import { RecentDB, WorkspaceStatus, TenderFlowWorkspace } from '../types';

interface EnginePanelProps {
  status: WorkspaceStatus;
  currentDBName: string;
  recentDBs: RecentDB[];
  onOpenDB: () => void;
  onNewDB: () => void;
  onChangeDB: () => void;
  onDownload: () => void;
}

export const EnginePanel: React.FC<EnginePanelProps> = ({
  status,
  currentDBName,
  recentDBs,
  onOpenDB,
  onNewDB,
  onChangeDB,
  onDownload
}) => {
  const [isRecentOpen, setIsRecentOpen] = React.useState(false);

  const getStatusColor = () => {
    switch (status) {
      case 'Synced': return '#10b981';
      case 'Saving': return '#3b82f6';
      case 'Save pending': return '#f59e0b';
      case 'File disconnected':
      case 'Invalid path':
      case 'Write permission required': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="te-engine-panel" style={{ 
      background: 'rgba(0,0,0,0.2)', 
      padding: '0.75rem', 
      borderRadius: '12px', 
      border: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>
          <Database size={10} /> WORKSPACE BD
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6rem', fontWeight: 800, color: getStatusColor() }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(), animation: status === 'Saving' ? 'pulse 1s infinite' : 'none' }} />
          {status.toUpperCase()}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div 
          onClick={() => setIsRecentOpen(!isRecentOpen)}
          style={{ 
            fontSize: '0.75rem', 
            fontWeight: 800, 
            color: 'white', 
            background: 'rgba(255,255,255,0.05)', 
            padding: '0.4rem 0.6rem', 
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentDBName || 'No file selected'}
          </span>
          <ChevronDown size={14} style={{ transform: isRecentOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        {isRecentOpen && recentDBs.length > 0 && (
          <div style={{ 
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            right: 0, 
            background: '#1e293b', 
            border: '1px solid rgba(255,255,255,0.1)', 
            borderRadius: '6px', 
            marginTop: '0.25rem',
            zIndex: 1000,
            maxHeight: '150px',
            overflowY: 'auto',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)'
          }}>
            {recentDBs.map(db => (
              <div 
                key={db.id}
                onClick={() => { /* Handle recent opening if possible */ }}
                style={{ padding: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                className="hover-bright"
              >
                {db.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
        <button onClick={onOpenDB} className="te-engine-btn"><FolderOpen size={12} /> Open DB</button>
        <button onClick={onNewDB} className="te-engine-btn"><Plus size={12} /> New DB</button>
        <button onClick={onChangeDB} className="te-engine-btn"><RefreshCw size={12} /> Change DB</button>
        <button onClick={onDownload} className="te-engine-btn"><Download size={12} /> Download</button>
      </div>
      
      <style>{`
        .te-engine-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.3rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 0.4rem;
          border-radius: 6px;
          font-size: 0.6rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
        }
        .te-engine-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
        }
        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

interface ZeroStateOverlayProps {
  onOpenDB: () => void;
  onNewDB: () => void;
}

export const ZeroStateOverlay: React.FC<ZeroStateOverlayProps> = ({ onOpenDB, onNewDB }) => {
  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      background: 'rgba(15, 23, 42, 0.95)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 9999,
      backdropFilter: 'blur(8px)'
    }}>
      <div style={{ 
        maxWidth: '400px', 
        width: '100%', 
        padding: '3rem', 
        textAlign: 'center',
        background: '#1e293b',
        borderRadius: '24px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ 
          width: '64px', 
          height: '64px', 
          background: 'rgba(59, 130, 246, 0.1)', 
          borderRadius: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: '#3b82f6',
          margin: '0 auto 1.5rem auto'
        }}>
          <Database size={32} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', marginBottom: '1rem' }}>No Workspace Active</h2>
        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '2.5rem' }}>
          Please select or create a Workspace BD to start working. Your changes will be saved directly to the file.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            onClick={onOpenDB}
            style={{ 
              padding: '1rem', 
              background: '#3b82f6', 
              color: 'white', 
              border: 'none', 
              borderRadius: '12px', 
              fontWeight: 800, 
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <FolderOpen size={20} /> Open DB
          </button>
          <button 
            onClick={onNewDB}
            style={{ 
              padding: '1rem', 
              background: 'rgba(255,255,255,0.05)', 
              color: 'white', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '12px', 
              fontWeight: 800, 
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <Plus size={20} /> New DB
          </button>
        </div>
      </div>
    </div>
  );
};
