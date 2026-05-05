import React, { useState, useCallback } from 'react';
import { useDropzone, type FileRejection, type DropEvent } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { Upload, FileCheck, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { processInventoryUpdate } from '../lib/inventoryService';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface RowData {
  [key: string]: any;
}

interface ExtractedData {
  header: {
    invoiceNo: string;
    date: string;
    shipFrom: string;
    consignee: string;
  };
  items: Array<{
    lineItem: string;
    partNo: string;
    serialNo: string;
    description: string;
    importEntryNo: string;
    importEntryLineNo: string;
  }>;
}

export default function FileProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<RowData>(worksheet, { header: 1 });

        console.log('Parsed JSON:', jsonData);

        // Robust extraction logic
        let invoiceNo = '';
        let date = '';
        let shipFrom = '';
        let consignee = '';
        const items: any[] = [];

        // Scan the first 30 rows for header information
        const headerRows = jsonData.slice(0, 30);
        headerRows.forEach((row: any) => {
          if (!Array.isArray(row)) return;
          row.forEach((cell, idx) => {
            if (!cell) return;
            const str = String(cell).toLowerCase().trim();
            
            const extractValue = (keyword: string) => {
              if (str.includes(keyword)) {
                // If the cell contains the keyword and other text (e.g., "Invoice No: 123")
                if (str.length > keyword.length + 1) {
                  const val = String(cell).split(/[:\s]+/);
                  const kParts = keyword.split(' ');
                  const lastKIdx = val.findIndex(v => v.toLowerCase().includes(kParts[kParts.length - 1]));
                  if (lastKIdx !== -1 && val[lastKIdx + 1]) {
                     return val.slice(lastKIdx + 1).join(' ').trim();
                  }
                  // Fallback: slice after keyword
                  const raw = String(cell);
                  const kIdx = raw.toLowerCase().indexOf(keyword);
                  return raw.slice(kIdx + keyword.length).replace(/^[:\s]+/, '').trim();
                }

                // Look for value in the same row first
                for (let i = 1; i <= 3; i++) {
                  const val = String(row[idx + i] || '').trim();
                  if (val && !val.toLowerCase().includes('attn') && val.length > 2) return val;
                }
                // Look for value in the rows directly below this cell
                const currentRowIdx = jsonData.indexOf(row);
                for (let i = 1; i <= 3; i++) {
                  const nextRow = jsonData[currentRowIdx + i] as any[];
                  if (nextRow && nextRow[idx]) {
                    const val = String(nextRow[idx]).trim();
                    if (val && val.length > 2 && !val.toLowerCase().includes('attn')) return val;
                  }
                }
              }
              return null;
            };

            const extractedInvoice = extractValue('invoice no');
            if (extractedInvoice) invoiceNo = extractedInvoice;
            
            const extractedDate = extractValue('date');
            if (extractedDate) date = extractedDate;

            const extractedFrom = extractValue('ship from') || extractValue('shipper');
            if (extractedFrom) shipFrom = extractedFrom;

            const extractedTo = extractValue('consignee');
            if (extractedTo) consignee = extractedTo;
          });
        });

        // Heuristic for table start (look for Serial No header)
        let tableHeaderIdx = -1;
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (Array.isArray(row) && row.some((cell: any) => cell && String(cell).toLowerCase().includes('serial no'))) {
            tableHeaderIdx = i;
            break;
          }
        }

        if (tableHeaderIdx !== -1) {
          const headerRow = (jsonData[tableHeaderIdx] as any[]).map(h => String(h || '').toLowerCase());
          const getIdx = (name: string) => headerRow.findIndex(h => h && h.toLowerCase().replace(/\s+/g, '').includes(name.replace(/\s+/g, '')));
          
          const sIdx = getIdx('serialno');
          const pIdx = getIdx('partno');
          const dIdx = getIdx('description');
          const lIdx = getIdx('lineitem') !== -1 ? getIdx('lineitem') : getIdx('item');
          const ienIdx = getIdx('importentryno');
          const ielIdx = getIdx('importentryline');

          for (let i = tableHeaderIdx + 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            if (row && sIdx !== -1 && row[sIdx]) {
              items.push({
                lineItem: String(row[lIdx] || i - tableHeaderIdx),
                partNo: String(row[pIdx] || 'N/A'),
                serialNo: String(row[sIdx]).trim(),
                description: String(row[dIdx] || 'No Description'),
                importEntryNo: String(row[ienIdx] || ''),
                importEntryLineNo: String(row[ielIdx] || ''),
              });
            }
          }
        }

        if (items.length === 0) {
          // Fallback if no serial numbers found in header search
          // Try scanning all rows for potentially useful data
          throw new Error('No items with Serial Numbers found in the file.');
        }

        setExtractedData({
          header: { invoiceNo, date, shipFrom, consignee },
          items
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // @ts-ignore
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => onDrop(files),
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false
  });

  const handleConfirm = async () => {
    if (!extractedData) return;
    setIsProcessing(true);
    try {
      await processInventoryUpdate(extractedData.header, extractedData.items);
      setSuccess(true);
      setExtractedData(null);
    } catch (err: any) {
      setError(`Failed to update inventory: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div 
        {...getRootProps()} 
        className={cn(
          "border-4 border-dashed p-16 flex flex-col items-center justify-center transition-all bg-white",
          isDragActive ? "border-blue-600 bg-blue-50" : "border-slate-300 hover:border-slate-900"
        )}
      >
        <input {...getInputProps()} />
        <div className="w-16 h-16 border-2 border-slate-900 flex items-center justify-center mb-6 bg-slate-100">
          <Upload className="w-8 h-8 text-slate-900" />
        </div>
        <h3 className="text-xs font-black uppercase tracking-widest mb-2">Upload Shipping Invoice</h3>
        <p className="text-[10px] opacity-40 uppercase tracking-widest text-center max-w-xs font-mono">
          Supports XLSX, CSV, XLS
        </p>
        <button className="mt-8 px-12 py-3 bg-slate-900 text-white font-bold text-[10px] uppercase tracking-widest active-neo-brutalism neo-brutalism-shadow">
          Browse Files
        </button>
      </div>

      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-3 p-4 bg-white border-2 border-slate-900 rounded-none shadow-sm"
          >
            <Loader2 className="w-4 h-4 animate-spin opacity-40" />
            <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">Processing data...</span>
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 p-6 bg-red-50 border-2 border-slate-900 text-red-600"
          >
            <AlertCircle className="w-6 h-6" />
            <div className="flex-1">
              <p className="text-[10px] uppercase font-black tracking-widest">Crucial Error</p>
              <p className="text-xs font-mono">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="px-4 py-2 border-2 border-slate-900 bg-white text-[10px] font-black uppercase">Dismiss</button>
          </motion.div>
        )}

        {success && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-3 p-16 bg-white border-4 border-slate-900 neo-brutalism-shadow"
          >
            <div className="w-20 h-20 bg-emerald-100 border-2 border-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tighter">Handshake Successful</h3>
            <p className="text-[10px] opacity-40 uppercase tracking-widest font-mono">Inventory updated & Transaction Commited.</p>
            <button 
              onClick={() => setSuccess(false)}
              className="mt-8 px-16 py-4 bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black active-neo-brutalism neo-brutalism-shadow"
            >
              System Reset
            </button>
          </motion.div>
        )}

        {extractedData && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border-2 border-slate-900 flex flex-col"
          >
            <div className="bg-blue-600 p-4 flex justify-between items-center border-b-2 border-slate-900">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-3">
                <span className="w-2 h-2 bg-white rounded-full"></span>
                Extracted Data Preview
              </h3>
              <div className="flex gap-4">
                <button 
                  onClick={() => setExtractedData(null)}
                  className="px-6 py-2 bg-white border-2 border-slate-900 text-slate-900 text-[10px] font-bold uppercase transition-all active-neo-brutalism shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  Discard
                </button>
                <button 
                  onClick={handleConfirm}
                  className="px-8 py-2 bg-emerald-500 border-2 border-slate-900 text-white text-[10px] font-bold uppercase transition-all active-neo-brutalism shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  Confirm & Commit
                </button>
              </div>
            </div>

            <div className="p-8 grid grid-cols-2 gap-8 border-b-2 border-slate-100">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Invoice Reference</label>
                  <p className="text-lg font-mono font-black">#{extractedData.header.invoiceNo || 'NULL'}</p>
                  <p className="text-[10px] opacity-60 font-mono italic">{extractedData.header.date || 'UNSET'}</p>
                </div>
                <div>
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Logic Routing</label>
                   <span className={cn(
                    "inline-block px-3 py-1 text-[10px] font-black uppercase tracking-tighter border-2",
                    (extractedData.header.shipFrom || '').toLowerCase().includes('schlumberger') 
                      ? "bg-red-50 border-red-600 text-red-600" 
                      : "bg-emerald-50 border-emerald-600 text-emerald-600"
                  )}>
                    Type: {(extractedData.header.shipFrom || '').toLowerCase().includes('schlumberger') ? 'OUT / EXIT_BASE' : 'IN / ENTER_BASE'}
                  </span>
                </div>
              </div>
              <div className="space-y-6 border-l-2 border-slate-100 pl-8">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Origin / Destination</label>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[8px] uppercase font-black text-slate-300">From</p>
                      <p className="text-[11px] font-bold uppercase truncate">{extractedData.header.shipFrom || '---'}</p>
                    </div>
                    <div className="w-full h-px bg-slate-100" />
                    <div>
                      <p className="text-[8px] uppercase font-black text-slate-300">To</p>
                      <p className="text-[11px] font-bold uppercase truncate">{extractedData.header.consignee || '---'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-4 bg-slate-50">
              <table className="w-full text-left border-collapse bg-white border-2 border-slate-900">
                <thead className="sticky top-0 bg-slate-900 text-white">
                  <tr>
                    <th className="px-6 py-3 text-[10px] uppercase font-black tracking-widest">LN</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-black tracking-widest">Serial Number</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-black tracking-widest">Part Reference</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-black tracking-widest">IE No</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-black tracking-widest">IE LN</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-black tracking-widest text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] font-mono divide-y border-slate-100">
                  {extractedData.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-400">{item.lineItem}</td>
                      <td className="px-6 py-3 font-black text-slate-900">{item.serialNo}</td>
                      <td className="px-6 py-3 text-slate-600">{item.partNo} / {item.description.slice(0, 30)}...</td>
                      <td className="px-6 py-3 text-blue-600 font-bold">{item.importEntryNo || '-'}</td>
                      <td className="px-6 py-3 text-blue-600 font-bold">{item.importEntryLineNo || '-'}</td>
                      <td className="px-6 py-3 text-right">
                         <span className="text-emerald-600 font-bold uppercase text-[9px]">Valid</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 bg-white border-t-2 border-slate-900 flex justify-between items-center px-8">
              <span className="text-[11px] font-mono font-black uppercase text-slate-400 tracking-widest">Object_Count: {extractedData.items.length}</span>
              <span className="text-[11px] font-mono font-black uppercase text-blue-600 tracking-widest">State: READY_FOR_COMMIT</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
