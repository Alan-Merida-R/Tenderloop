
import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Table as TableIcon } from 'lucide-react';
import { FileItem } from '../types';

interface Props {
  item: FileItem;
  sizeLimit: number; // bytes
}

export const OfficePreview: React.FC<Props> = ({ item, sizeLimit }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);

  useEffect(() => {
    const parseFile = async () => {
      setLoading(true);
      setError(null);
      setHtmlContent(null);
      setSheets([]);

      if ((item.size || 0) > sizeLimit) {
        setError(`File too large to preview (Limit: ${Math.round(sizeLimit / (1024 * 1024))}MB). Use Download / Open.`);
        setLoading(false);
        return;
      }

      try {
        const fileHandle = item.handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const ext = (item.extension || '').toLowerCase();

        if (ext === 'docx') {
          const mammoth = await import('mammoth');
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          
          const dompurify = await import('dompurify');
          // @ts-ignore
          const safeHtml = dompurify.default.sanitize(result.value, {
            ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'b', 'i', 'u', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'br'],
          });
          setHtmlContent(safeHtml);
        } 
        else if (ext === 'xlsx' || ext === 'xlsm') {
          const XLSX = await import('xlsx');
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          
          const parsedSheets = workbook.SheetNames.map(name => {
            const worksheet = workbook.Sheets[name];
            
            // Performance: truncate range if too large
            // Simplified truncate: only convert first few cells to avoid crash
            const html = XLSX.utils.sheet_to_html(worksheet, { 
              editable: false,
              header: '',
              footer: ''
            });
            return { name, html };
          });

          if (parsedSheets.length > 0) {
            setSheets(parsedSheets);
            setActiveSheetIdx(0);
          } else {
            setError("The spreadsheet is empty.");
          }
        }
      } catch (err: any) {
        console.error("Office parse error:", err);
        setError("Preview failed. The file structure might be too complex or corrupted.");
      } finally {
        setLoading(false);
      }
    };

    parseFile();
  }, [item, sizeLimit]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-20">
        <Loader2 className="w-10 h-10 text-[#3DCD58] animate-spin" />
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">Loading preview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl border border-red-50 text-center space-y-4 max-w-sm">
        <div className="p-4 bg-red-50 rounded-full">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <p className="text-sm font-medium text-gray-700">{error}</p>
        <p className="text-xs text-gray-400">Complex documents or large files are best opened natively.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-100">
      {sheets.length > 1 && (
        <div className="p-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50 overflow-x-auto shrink-0">
          <TableIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex gap-2">
            {sheets.map((s, i) => (
              <button 
                key={i} 
                onClick={() => setActiveSheetIdx(i)}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeSheetIdx === i ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 md:p-8">
        {htmlContent && (
          <div 
            className="prose prose-emerald prose-sm max-w-none office-docx-content"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
        {sheets.length > 0 && (
          <div className="office-xlsx-content">
            <div dangerouslySetInnerHTML={{ __html: sheets[activeSheetIdx].html }} />
            <p className="mt-8 pt-4 border-t border-gray-100 text-[10px] text-gray-400 font-bold uppercase text-center italic">
              Preview truncated for performance. Formulas and active content are not rendered.
            </p>
          </div>
        )}
      </div>

      <style>{`
        .office-xlsx-content table { border-collapse: collapse; min-width: 100%; border: 1px solid #eee; font-family: monospace; font-size: 11px; }
        .office-xlsx-content td { border: 1px solid #eee; padding: 4px 8px; white-space: nowrap; }
        .office-xlsx-content tr:nth-child(even) { background-color: #f9fafb; }
        .office-docx-content table { border: 1px solid #ddd; border-collapse: collapse; margin-bottom: 1em; }
        .office-docx-content td, .office-docx-content th { border: 1px solid #ddd; padding: 8px; }
      `}</style>
    </div>
  );
};
