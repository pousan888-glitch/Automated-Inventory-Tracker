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

    // Optional admin fields
    coo?: string;
    hsCode?: string;
    eccn?: string;
    qty?: number;
    uom?: string;
    unitPrice?: number;
    amount?: number;
    itemWeight?: string | number;
    meaningInThai?: string;
    dimension?: string;
    package?: string;
    customEntry?: string;
    vessel?: string;
    segment?: string;
    ibase?: string;
    remark?: string;
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
        let segment = '';
        let vessel = '';
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

            const extractedSegment = extractValue('segment');
            if (extractedSegment) segment = extractedSegment;

            const extractedVessel = extractValue('vessel');
            if (extractedVessel) vessel = extractedVessel;
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
          const getIdx = (name: string) => headerRow.findIndex(h => h && h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, '')));
          
          const sIdx = getIdx('serialno');
          const pIdx = getIdx('partno');
          const dIdx = getIdx('description');
          const lIdx = getIdx('lineitem') !== -1 ? getIdx('lineitem') : getIdx('item');
          const ienIdx = getIdx('importentryno');
          const ielIdx = getIdx('importentryline');

          // Retrieve optional administrative properties
          const cooIdx = getIdx('coo') !== -1 ? getIdx('coo') : getIdx('countryoforigin');
          const hsIdx = getIdx('hscode') !== -1 ? getIdx('hscode') : getIdx('hs');
          const eccnIdx = getIdx('eccn');
          const qtyIdx = getIdx('qty') !== -1 ? getIdx('qty') : getIdx('quantity');
          const uomIdx = getIdx('uom') !== -1 ? getIdx('uom') : getIdx('unitofmeasure');
          const unitPriceIdx = getIdx('unitprice') !== -1 ? getIdx('unitprice') : getIdx('unit');
          const amountIdx = getIdx('amount');
          const weightIdx = getIdx('itemweight') !== -1 ? getIdx('itemweight') : (getIdx('weight') !== -1 ? getIdx('weight') : getIdx('itemweightkg'));
          const thaiIdx = getIdx('meaninginthai') !== -1 ? getIdx('meaninginthai') : (getIdx('thai') !== -1 ? getIdx('thai') : getIdx('meaning'));
          const dimIdx = getIdx('dimension') !== -1 ? getIdx('dimension') : getIdx('dimention');
          const pkgIdx = getIdx('package');
          const customIdx = getIdx('customentry') !== -1 ? getIdx('customentry') : getIdx('custom');
          const vesselIdx = getIdx('vessel');
          const segmentIdx = getIdx('segment');
          const ibaseIdx = getIdx('ibase');
          const remarkIdx = getIdx('remark');

          for (let i = tableHeaderIdx + 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            if (!row) continue;

            // Stop parsing if we hit the total row or packing details section
            const rowString = row.map(cell => cell ? String(cell).toLowerCase().trim() : '').join(' ');
            if (rowString.includes('total') || rowString.includes('packing details') || rowString.includes('special instructions')) {
              break;
            }

            if (sIdx !== -1 && row[sIdx]) {
              items.push({
                lineItem: String(row[lIdx] || i - tableHeaderIdx),
                partNo: String(row[pIdx] || 'N/A'),
                serialNo: String(row[sIdx]).trim(),
                description: String(row[dIdx] || 'No Description'),
                importEntryNo: String(row[ienIdx] || ''),
                importEntryLineNo: String(row[ielIdx] || ''),

                coo: cooIdx !== -1 ? String(row[cooIdx] || '') : '',
                hsCode: hsIdx !== -1 ? String(row[hsIdx] || '') : '',
                eccn: eccnIdx !== -1 ? String(row[eccnIdx] || '') : '',
                qty: qtyIdx !== -1 && row[qtyIdx] !== undefined ? Number(row[qtyIdx]) : 1,
                uom: uomIdx !== -1 ? String(row[uomIdx] || 'EA') : 'EA',
                unitPrice: unitPriceIdx !== -1 && row[unitPriceIdx] !== undefined ? Number(row[unitPriceIdx]) : 0,
                amount: amountIdx !== -1 && row[amountIdx] !== undefined ? Number(row[amountIdx]) : 0,
                itemWeight: weightIdx !== -1 ? String(row[weightIdx] || '') : '',
                meaningInThai: thaiIdx !== -1 ? String(row[thaiIdx] || '') : '',
                dimension: dimIdx !== -1 ? String(row[dimIdx] || '') : '',
                package: pkgIdx !== -1 ? String(row[pkgIdx] || '') : '',
                customEntry: customIdx !== -1 ? String(row[customIdx] || '') : '',
                vessel: (vesselIdx !== -1 && String(row[vesselIdx] || '').trim()) ? String(row[vesselIdx]).trim() : vessel,
                segment: (segmentIdx !== -1 && String(row[segmentIdx] || '').trim()) ? String(row[segmentIdx]).trim() : segment,
                ibase: ibaseIdx !== -1 ? String(row[ibaseIdx] || '') : '',
                remark: remarkIdx !== -1 ? String(row[remarkIdx] || '') : '',
              });
            }
          }
        }

        // Parse PACKING DETAILS table at the bottom of the invoice if present
        let packingHeaderIdx = -1;
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (Array.isArray(row) && row.some((cell: any) => cell && String(cell).toLowerCase().includes('package type'))) {
            packingHeaderIdx = i;
            break;
          }
        }

        const parseWeightNum = (val: string | number | undefined): number => {
          if (val === undefined || val === null) return 0;
          if (typeof val === 'number') return val;
          const cleaned = String(val).replace(/,/g, '').trim();
          const match = cleaned.match(/[\d.]+/);
          if (match) {
            const parsed = parseFloat(match[0]);
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        const parseItemLinesFromRemark = (remark: string): number[] => {
          if (!remark) return [];
          const lineNumbers: number[] = [];
          
          // Clean the remark by replacing non-numeric/non-separator chars with spaces
          const cleaned = remark.toLowerCase().replace(/[^0-9\s,-]/g, ' ');
          
          // Split by commas
          const parts = cleaned.split(',');
          parts.forEach(part => {
            const trimmed = part.trim();
            if (!trimmed) return;

            // Handle range match like "2-7" or "2 to 7"
            const rangeMatch = trimmed.match(/(\d+)\s*[-to]+\s*(\d+)/);
            if (rangeMatch) {
              const start = parseInt(rangeMatch[1], 10);
              const end = parseInt(rangeMatch[2], 10);
              if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                  if (!lineNumbers.includes(i)) lineNumbers.push(i);
                }
              }
            } else {
              // Handle list of single items
              const singleMatches = trimmed.match(/\d+/g);
              if (singleMatches) {
                singleMatches.forEach(numStr => {
                  const num = parseInt(numStr, 10);
                  if (!isNaN(num) && !lineNumbers.includes(num)) {
                    lineNumbers.push(num);
                  }
                });
              }
            }
          });
          
          return lineNumbers;
        };

        if (packingHeaderIdx !== -1) {
          const pHeader = (jsonData[packingHeaderIdx] as any[]).map(h => String(h || '').toLowerCase());
          const getPIdx = (name: string) => pHeader.findIndex(h => h && h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, '')));
          
          const pkgTypeIdx = getPIdx('packagetype') !== -1 ? getPIdx('packagetype') : getPIdx('package');
          const pRemarkIdx = getPIdx('remark');
          
          // Identify Net Weight and Gross Weight columns in packing details
          const netWeightIdx = pHeader.findIndex(h => h && (h.includes('net') || h.includes('n.w')));
          const grossWeightIdx = pHeader.findIndex(h => h && (h.includes('gross') || h.includes('g.w')));
          const dimStartIdx = pHeader.findIndex(h => h && h.includes('dimension'));
          
          const packages: Array<{
            pkgTypeVal: string;
            dimensionVal: string;
            netW: string;
            grossW: string;
            remarkVal: string;
            matchedLines: number[];
          }> = [];

          for (let i = packingHeaderIdx + 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            if (!row || row.length === 0) continue;
            
            // If we hit standard text at the bottom, stop
            const rowString = row.map(cell => cell ? String(cell).toLowerCase().trim() : '').join(' ');
            if (rowString.includes('special instructions') || rowString.includes('authorized signature') || rowString.includes('hereby declare')) {
              break;
            }
            
            const pkgTypeVal = pkgTypeIdx !== -1 ? String(row[pkgTypeIdx] || '').trim() : '';
            const remarkVal = pRemarkIdx !== -1 ? String(row[pRemarkIdx] || '').trim() : '';
            
            // Reconstruct dimensions (L, W, H listed in successive columns)
            let dimensionVal = '';
            if (dimStartIdx !== -1 && dimStartIdx + 2 < row.length) {
              const l = row[dimStartIdx];
              const w = row[dimStartIdx + 1];
              const h = row[dimStartIdx + 2];
              if (l !== undefined || w !== undefined || h !== undefined) {
                dimensionVal = `${l || ''} x ${w || ''} x ${h || ''}`.trim().replace(/\s*x\s*$/, '');
              }
            } else {
              const dimCell = row.find(c => c && String(c).includes('x'));
              if (dimCell) dimensionVal = String(dimCell);
            }
            
            let netW = '';
            if (netWeightIdx !== -1) {
              netW = String(row[netWeightIdx] || '').trim();
            }
            
            let grossW = '';
            if (grossWeightIdx !== -1) {
              grossW = String(row[grossWeightIdx] || '').trim();
            } else {
              const weightCellIdx = pHeader.findIndex(h => h && h.includes('weight'));
              if (weightCellIdx !== -1) {
                grossW = String(row[weightCellIdx] || '').trim();
              }
            }
            
            if (pkgTypeVal || remarkVal) {
              packages.push({
                pkgTypeVal,
                dimensionVal,
                netW,
                grossW,
                remarkVal,
                matchedLines: parseItemLinesFromRemark(remarkVal),
              });
            }
          }

          // Match each item to the best scoring package
          items.forEach(item => {
            let bestPkg: typeof packages[0] | null = null;
            let highestScore = -1;

            packages.forEach(pkg => {
              let score = 0;

              // 1. Direct serial number match (highest priority)
              if (item.serialNo && pkg.pkgTypeVal.toLowerCase().includes(item.serialNo.toLowerCase())) {
                score = 100;
              }

              // 2. Remark range match
              const itemLineNum = parseInt(item.lineItem, 10);
              if (!isNaN(itemLineNum) && pkg.matchedLines.includes(itemLineNum)) {
                // If package matches the line item, give priority to smaller/more specific list sizes
                const rangeSize = pkg.matchedLines.length;
                const remarkScore = Math.max(10, 50 - rangeSize);
                if (remarkScore > score) {
                  score = remarkScore;
                }
              }

              // 3. Physical weight match bonus
              const itemWNum = parseWeightNum(item.itemWeight);
              const pkgNetWNum = parseWeightNum(pkg.netW);
              const pkgGrossWNum = parseWeightNum(pkg.grossW);

              if (itemWNum > 0) {
                // Perfect matching for weight (net or gross) as we expect physical items to match package parameters
                if (Math.abs(itemWNum - pkgNetWNum) < 1.0 || Math.abs(itemWNum - pkgGrossWNum) < 1.0) {
                  score += 25; // Significant boost to steer overlap correctly
                }
              }

              if (score > highestScore && score > 0) {
                highestScore = score;
                bestPkg = pkg;
              }
            });

            if (bestPkg) {
              const pkg: typeof packages[0] = bestPkg;
              if (pkg.pkgTypeVal) item.package = pkg.pkgTypeVal;
              if (pkg.dimensionVal) item.dimension = pkg.dimensionVal;
              if (pkg.grossW) item.itemWeight = pkg.grossW;
            }
          });
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
