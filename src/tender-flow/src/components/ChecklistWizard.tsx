import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, 
  Database,
  Search,
  RefreshCw,
  GitBranch,
  FileSearch,
  CheckCircle2
} from 'lucide-react';
import { ExecutiveFlowCase } from '../types';
import { parseExcelSheet } from '../services/excelParser';

interface Props {
  existingCases: ExecutiveFlowCase[];
  onCancel: () => void;
  onComplete: (newCase: ExecutiveFlowCase, sourceId?: string, excelBackbone?: any) => void;
}

/**
 * Checklist Wizard v5.5 - Premium Onboarding
 */
export const ChecklistWizard: React.FC<Props> = ({ existingCases, onCancel, onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1); 
  const [dbName, setDbName] = useState(localStorage.getItem('te_loop_db_name') || '');
  const [workbookData, setWorkbookData] = useState<any[]>(() => {
    const cached = localStorage.getItem('te_loop_db_cache');
    return cached ? JSON.parse(cached) : [];
  }); 
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    loopId: '',
    companyName: '',
    estimatedAmount: '',
    dueDate: '',
    industry: 'Oil & Gas',
    customerAddress: '',
    state: '',
    excelH2: '',
    salesOwner: '',
    sellerName: ''
  });

  const [sourceCaseId, setSourceCaseId] = useState<string>('');
  const [excelBackbone, setExcelBackbone] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const handleFileBrowse = async () => {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Strategy DB (Loop)', accept: { 'application/json': ['.json'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
      });
      
      const { workspaceManager } = require('../services/storage');
      await workspaceManager.setLoopDbHandle(handle);

      const file = await handle.getFile();
      setDbName(file.name);
      
      if (file.name.endsWith('.json')) {
         const content = await file.text();
         const json = JSON.parse(content);
         const rows = Array.isArray(json) ? json : (json.opportunities || json.data || []);
         setWorkbookData(rows);
         localStorage.setItem('te_loop_db_cache', JSON.stringify(rows.slice(0, 500)));
      } else {
         const buffer = await file.arrayBuffer();
         const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
         const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
         setWorkbookData(rows);
         localStorage.setItem('te_loop_db_cache', JSON.stringify(rows.slice(0, 500)));
      }
      localStorage.setItem('te_loop_db_name', file.name);
    } catch (err) { console.error(err); setError("Access denied or parse error."); }
  };

  const handleExcelBackboneImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const structure = parseExcelSheet(buffer);
        setExcelBackbone(structure);
        setStep(2);
      } catch (err) { setError("Backbone import failed."); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSyncFromLoop = () => {
    const query = (formData.loopId || formData.name).toLowerCase();
    setIsSearching(true);
    setTimeout(() => {
       const matches = workbookData.filter(row => {
          const idStr = String(row.ID || row.OP || row.id || '').toLowerCase();
          const nameStr = String(row.alias || row.Name || '').toLowerCase();
          return idStr.includes(query) || nameStr.includes(query);
       });
       setSearchResults(matches.slice(0, 5));
       setIsSearching(false);
    }, 500);
  };

  const selectOpportunity = (row: any) => {
    setFormData(prev => ({
      ...prev,
      name: row.alias || row.Name || '',
      loopId: row.ID || row.OP || row.id || '',
      companyName: row.Company || row.Customer || row.Account || '',
      industry: row.Industry || prev.industry,
      estimatedAmount: row.Amount || row.USD || '',
      customerAddress: row.Address || '',
      state: row.State || '',
      sellerName: row.Seller || row.CSE || row.Salesperson || ''
    }));
    setSearchResults([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    if (!formData.loopId || !formData.name || !formData.companyName) return;

    const newCase: ExecutiveFlowCase = {
      id: `EF-${Date.now()}`,
      loopId: formData.loopId,
      keyName: (formData.loopId + "_" + formData.name.replace(/\s+/g, '_')).substring(0, 50),
      metadata: {
        name: formData.name,
        customer: formData.companyName,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        standardVersion: '1.2',
        isArchived: false,
        status: 'active',
      },
      initialWizData: {
        proposalType: 'Budgetary',
        scopeTags: ['Migration'],
        estimatedAmount: parseFloat(formData.estimatedAmount) || 0,
        industry: formData.industry,
        dueDate: formData.dueDate,
        salesOwner: formData.salesOwner,
        sellerName: formData.sellerName,
        customerAddress: formData.customerAddress,
        state: formData.state,
        excelH2: formData.excelH2
      },
      responses: {},
      activeFilters: { areas: [], stages: [], priorities: [], deliverables: [] }
    };

    onComplete(newCase, sourceCaseId, excelBackbone);
  };

  const inputStyle = {
    background: 'var(--te-primary-700)',
    border: '1px solid var(--te-border)',
    borderRadius: '12px',
    height: '52px',
    padding: '0 1.25rem',
    color: 'var(--te-text-main)',
    width: '100%',
    marginBottom: '1.25rem',
    outline: 'none'
  };

  const labelStyle = { display: 'block', fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' as const };

  return (
    <div className="te-modal-backdrop">
      <div className="te-card fade-in" style={{ width: '1000px', maxHeight: '95vh', overflowY: 'auto', background: 'var(--te-bg-card)', padding: '4rem', border: '1px solid var(--te-border)', borderRadius: '32px', position: 'relative' }}>
        <button onClick={onCancel} style={{ position: 'absolute', top: '2.5rem', right: '2.5rem', background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer' }}><X size={28} /></button>

        {step === 1 ? (
           <div style={{ textAlign: 'center' }}>
              <div style={{ width: '80px', height: '80px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem auto', color: 'var(--te-accent-500)' }}><Database size={40} /></div>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 900 }}>Connect Strategic DB</h2>
              <div style={{ textAlign: 'left', maxWidth: '580px', margin: '0 auto', background: 'var(--te-primary-700)', padding: '3rem', borderRadius: '24px' }}>
                 <label style={labelStyle}>Loop DB Source</label>
                 <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <input style={{ ...inputStyle, marginBottom: 0 }} readOnly value={dbName} />
                    <button type="button" onClick={handleFileBrowse} className="te-btn te-btn-outline">BROWSE</button>
                 </div>
                 <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setStep(2)} className="te-btn te-btn-primary" style={{ flex: 1, padding: '1.25rem' }}>START ONBOARDING</button>
                    <label className="te-btn te-btn-outline" style={{ flex: 1, padding: '1.25rem', cursor: 'pointer', textAlign: 'center' }}>
                       CLONE BACKBONE (EXCEL)
                       <input type="file" hidden accept=".xlsx" onChange={handleExcelBackboneImport} />
                    </label>
                 </div>
              </div>
           </div>
        ) : (
           <form onSubmit={handleSubmit}>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '3rem' }}>Executive Onboarding</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '3rem' }}>
                 <div>
                    <div style={{ background: 'var(--te-primary-700)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--te-border)', marginBottom: '2rem' }}>
                       <label style={labelStyle}>Clone Backbone From Project</label>
                       <select value={sourceCaseId} onChange={e => setSourceCaseId(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }}>
                          <option value="">-- Master Template --</option>
                          {existingCases.map(c => <option key={c.id} value={c.id}>{c.metadata.name} ({c.loopId})</option>)}
                       </select>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                       <div style={{ flex: 1 }}>
                          <label style={labelStyle}>Loop Search</label>
                          <input style={{ ...inputStyle, marginBottom: 0 }} value={formData.loopId || formData.name} onChange={e => setFormData({...formData, loopId: e.target.value})} />
                       </div>
                       <button type="button" onClick={handleSyncFromLoop} className="te-btn te-btn-primary" style={{ height: '52px' }}>
                          {isSearching ? <RefreshCw className="spin" size={20} /> : <Search size={22} />}
                       </button>
                    </div>

                    {searchResults.length > 0 && (
                       <div style={{ background: 'var(--te-primary-700)', padding: '1rem', borderRadius: '12px', border: '1.5px solid var(--te-accent-500)', marginBottom: '1.5rem' }}>
                          {searchResults.map((row, i) => (
                             <div key={i} onClick={() => selectOpportunity(row)} style={{ padding: '0.8rem', cursor: 'pointer', borderBottom: i < searchResults.length - 1 ? '1px solid var(--te-border)' : 'none' }}>
                                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{row.alias || row.Name}</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>ID: {row.ID || row.OP}</div>
                             </div>
                          ))}
                       </div>
                    )}

                    <label style={labelStyle}>Investigative Alias {!formData.name && attemptedSubmit && <span style={{ color: 'var(--te-rose-500)' }}>*</span>}</label>
                    <input style={inputStyle} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                       <div><label style={labelStyle}>OP / ID {!formData.loopId && attemptedSubmit && <span style={{ color: 'var(--te-rose-500)' }}>*</span>}</label><input style={inputStyle} value={formData.loopId} onChange={e => setFormData({...formData, loopId: e.target.value})} /></div>
                       <div><label style={labelStyle}>Company Name {!formData.companyName && attemptedSubmit && <span style={{ color: 'var(--te-rose-500)' }}>*</span>}</label><input style={inputStyle} value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} /></div>
                    </div>
                    <label style={labelStyle}>Excel H2 Header</label>
                    <input style={inputStyle} value={formData.excelH2} onChange={e => setFormData({...formData, excelH2: e.target.value})} />
                 </div>

                 <div style={{ borderLeft: '1px solid var(--te-border)', paddingLeft: '3rem' }}>
                    <label style={labelStyle}>Cost (USD)</label><input style={inputStyle} value={formData.estimatedAmount} onChange={e => setFormData({...formData, estimatedAmount: e.target.value})} />
                    <label style={labelStyle}>Submitted Due</label><input style={inputStyle} type="date" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
                    <label style={labelStyle}>Lead Strategist</label><input style={inputStyle} value={formData.salesOwner} onChange={e => setFormData({...formData, salesOwner: e.target.value})} />
                    <label style={labelStyle}>Seller (CSE)</label><input style={inputStyle} value={formData.sellerName} onChange={e => setFormData({...formData, sellerName: e.target.value})} />
                 </div>
              </div>
              <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'flex-end', gap: '1.5rem', borderTop: '1px solid var(--te-border)', paddingTop: '2rem' }}>
                 <button type="button" onClick={onCancel} className="te-btn te-btn-outline">CANCEL</button>
                 <button type="submit" className="te-btn te-btn-primary" style={{ padding: '0.8rem 4rem', background: 'var(--te-emerald-500)' }}>GENERATE PROJECT</button>
              </div>
           </form>
        )}
      </div>
    </div>
  );
};
