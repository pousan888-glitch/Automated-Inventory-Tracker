import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone, type FileRejection, type DropEvent } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { Upload, FileCheck, Loader2, AlertCircle, CheckCircle2, ArrowDownLeft, ArrowUpRight, FileSpreadsheet } from 'lucide-react';
import { processInventoryUpdate, subscribeToInventory, InventoryItem, importFzInventoryReport } from '../lib/inventoryService';
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

// Levenshtein distance for fuzzy matching
function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

// Word tokenization
function getWords(str: string): Set<string> {
  return new Set(
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

// Token Jaccard similarity for descriptions
function getWordSimilarity(str1: string, str2: string): number {
  const w1 = getWords(str1);
  const w2 = getWords(str2);
  if (w1.size === 0 || w2.size === 0) return 0;
  const intersection = new Set([...w1].filter((x) => w2.has(x)));
  const union = new Set([...w1, ...w2]);
  return intersection.size / union.size;
}

export default function FileProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadType, setUploadType] = useState<'IN' | 'OUT'>('IN');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [fzExtractedData, setFzExtractedData] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Track existing master inventory items
  const [existingInventory, setExistingInventory] = useState<InventoryItem[]>([]);
  // Track resolutions for fuzzy similar matches on row index
  const [resolutions, setResolutions] = useState<Record<number, { type: 'same' | 'separate'; originalSerial: string; correctedSerial?: string }>>({});

  useEffect(() => {
    const unsubscribe = subscribeToInventory((items) => {
      setExistingInventory(items);
    });
    return () => unsubscribe();
  }, []);

  // Check if a row has a potential match in current inventory
  const isFuzzyMatch = useCallback((item: any) => {
    const serialNormalized = (item.serialNo || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!serialNormalized || serialNormalized === 'na' || serialNormalized === 'n/a') return null;

    for (const existing of existingInventory) {
      const existingSerialNormalized = (existing.serialNo || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (!existingSerialNormalized || existingSerialNormalized === 'na' || existingSerialNormalized === 'n/a') continue;

      // Type 1: Format Typo (Same normalized characters but different symbols/spaces/casing)
      const isFormatTypo = (serialNormalized === existingSerialNormalized) && (item.serialNo !== existing.serialNo);

      // Type 2: Close serial match by character edit distance (Levenshtein <= 2) and description is highly similar or part number matches
      const dist = getLevenshteinDistance(serialNormalized, existingSerialNormalized);
      const isCloseSerial = dist > 0 && dist <= 2;
      const descSim = getWordSimilarity(item.description, existing.description);
      const partNoMatch = item.partNo && existing.partNo && (item.partNo.toLowerCase().trim() === existing.partNo.toLowerCase().trim());
      
      const isDescriptionOrPartSimilar = descSim > 0.4 || partNoMatch;

      if (isFormatTypo || (isCloseSerial && isDescriptionOrPartSimilar)) {
        return {
          existing,
          reason: isFormatTypo 
            ? 'รูปแบบตัวอักษรพิมพ์ใหญ่/เล็กหรืออักขระพิเศษต่างกันเล็กน้อย (Format punctuation discrepancy)' 
            : `รหัสซีเรียลพิมพ์ผิดหรือใกล้เคียงกัน (ระยะแก้ไข=${dist}) และคำอธิบายชิ้นงานมีความคล้ายคลึงกัน`,
          score: Math.max(descSim, partNoMatch ? 1 : 0),
          dist
        };
      }
    }
    return null;
  }, [existingInventory]);

  const handleResolveSame = (idx: number, correctedSerial: string) => {
    if (!extractedData) return;
    const updatedItems = [...extractedData.items];
    const originalSerial = updatedItems[idx].serialNo;
    updatedItems[idx].serialNo = correctedSerial;
    setExtractedData({
      ...extractedData,
      items: updatedItems
    });
    setResolutions(prev => ({
      ...prev,
      [idx]: { type: 'same', originalSerial, correctedSerial }
    }));
  };

  const handleResolveSeparate = (idx: number) => {
    if (!extractedData) return;
    setResolutions(prev => ({
      ...prev,
      [idx]: { type: 'separate', originalSerial: extractedData.items[idx].serialNo }
    }));
  };

  const pendingVerificationCount = extractedData?.items.reduce((acc, item, idx) => {
    const match = isFuzzyMatch(item);
    if (match && !resolutions[idx]) {
      return acc + 1;
    }
    return acc;
  }, 0) || 0;

  const totalFuzzyMatchCount = extractedData?.items.reduce((acc, item) => {
    const match = isFuzzyMatch(item);
    return match ? acc + 1 : acc;
  }, 0) || 0;

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setSuccess(false);
    setResolutions({});

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<RowData>(worksheet, { header: 1 });

        console.log('Parsed JSON:', jsonData);

        // Heuristic for table start (look for Serial No header)
        let tableHeaderIdx = -1;
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (Array.isArray(row) && row.some((cell: any) => cell && String(cell).toLowerCase().includes('serial no'))) {
            tableHeaderIdx = i;
            break;
          }
        }

        // Robust extraction logic
        let invoiceNo = '';
        let date = '';
        let shipFrom = '';
        let consignee = '';
        let segment = '';
        let vessel = '';
        let invoiceStatus = '';
        const items: any[] = [];

        // Scan pre-table rows (or up to first 30 rows if table header not found) for header information
        const headerLimit = tableHeaderIdx !== -1 ? tableHeaderIdx : Math.min(30, jsonData.length);
        const headerRows = jsonData.slice(0, headerLimit);
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
                  if (val && !val.toLowerCase().includes('attn') && val.length >= 2) return val;
                }
                // Look for value in the rows directly below this cell
                const currentRowIdx = jsonData.indexOf(row);
                for (let i = 1; i <= 3; i++) {
                  const nextRow = jsonData[currentRowIdx + i] as any[];
                  if (nextRow && nextRow[idx]) {
                    const val = String(nextRow[idx]).trim();
                    if (val && val.length >= 2 && !val.toLowerCase().includes('attn')) return val;
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

            const extractedStatus = extractValue('status');
            if (extractedStatus) {
              const cleanedStatus = extractedStatus.toUpperCase().trim();
              if (cleanedStatus === 'FZ' || cleanedStatus === 'LOCAL' || cleanedStatus.includes('LOCAL') || cleanedStatus.includes('FZ')) {
                invoiceStatus = cleanedStatus;
              }
            }
          });
        });

        if (invoiceStatus && invoiceNo) {
          const suffix = invoiceStatus.toUpperCase();
          if (!invoiceNo.toUpperCase().includes(suffix)) {
            invoiceNo = `${invoiceNo}-${suffix}`;
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
              const parsedIenVal = ienIdx !== -1 ? String(row[ienIdx] || '').trim() : '';
              const parsedCustomVal = customIdx !== -1 ? String(row[customIdx] || '').trim() : '';
              const finalEntryNo = parsedIenVal || parsedCustomVal || '';

              items.push({
                lineItem: String(row[lIdx] || i - tableHeaderIdx),
                partNo: String(row[pIdx] || 'N/A'),
                serialNo: String(row[sIdx]).trim(),
                description: String(row[dIdx] || 'No Description'),
                importEntryNo: finalEntryNo,
                importEntryLineNo: ielIdx !== -1 ? String(row[ielIdx] || '').trim() : '',

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
                customEntry: finalEntryNo,
                vessel: (vesselIdx !== -1 && String(row[vesselIdx] || '').trim()) ? String(row[vesselIdx]).trim() : vessel,
                segment: (segmentIdx !== -1 && String(row[segmentIdx] || '').trim()) ? String(row[segmentIdx]).trim() : segment,
                ibase: ibaseIdx !== -1 ? String(row[ibaseIdx] || '') : '',
                remark: remarkIdx !== -1 ? String(row[remarkIdx] || '') : '',
                customsStatus: invoiceStatus
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

        const isLeaving = (shipFrom || '').toLowerCase().includes('schlumberger');
        setUploadType(isLeaving ? 'OUT' : 'IN');

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

  const onDropFz = useCallback((acceptedFiles: File[]) => {
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
        
        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        console.log('FZ Parsed JSON:', jsonData);

        let headerRowIdx = -1;
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (Array.isArray(row) && row.some((cell: any) => cell && (String(cell).toLowerCase().includes('inbound_number') || String(cell).toLowerCase().includes('inbound number')))) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (Array.isArray(row)) {
              const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
              if (rowStr.includes('description') && (rowStr.includes('quantity') || rowStr.includes('qty') || rowStr.includes('itemnumber') || rowStr.includes('item number'))) {
                headerRowIdx = i;
                break;
              }
            }
          }
        }

        if (headerRowIdx === -1) {
          throw new Error('ไม่พบเทมเพลต SCHLUMBERGER - FZ Inventory Report (ไม่พบคอลัมน์ Inbound_Number หรือ Description)');
        }

        const headerRow = (jsonData[headerRowIdx] as any[]).map(h => String(h || '').toLowerCase().trim());
        const getColIdx = (names: string[]) => {
          return headerRow.findIndex(h => h && names.some(name => h.replace(/[^a-z0-9]/g, '').includes(name.replace(/[^a-z0-9]/g, ''))));
        };

        const inboundNumberIdx = getColIdx(['inboundnumber', 'inbound_number', 'customsentry', 'customentry', 'entryno']);
        const itemNumberIdx = getColIdx(['itemnumber', 'item_number', 'lineitem', 'item', 'line']);
        const inboundDateIdx = getColIdx(['inbounddate', 'inbound_date', 'date']);
        const descriptionIdx = getColIdx(['description', 'desc']);
        const unitTypeIdx = getColIdx(['unittype', 'unit_type', 'uom', 'unit']);
        const quantityIdx = getColIdx(['quantity', 'qty', 'quantities']);
        const valueIdx = getColIdx(['value', 'val', 'coo', 'country']);
        const dutyIncomeIdx = getColIdx(['dutyincome', 'duty_income', 'segment']);

        const fzItems: any[] = [];
        for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (!row || row.length === 0) continue;

          const descVal = descriptionIdx !== -1 ? String(row[descriptionIdx] || '').trim() : '';
          const inboundNumVal = inboundNumberIdx !== -1 ? String(row[inboundNumberIdx] || '').trim() : '';
          if (!descVal && !inboundNumVal) continue;

          if (descVal.toLowerCase().includes('total') || inboundNumVal.toLowerCase().includes('total')) {
            continue;
          }

          const rawInboundDate = inboundDateIdx !== -1 ? row[inboundDateIdx] : '';
          let formattedDate = '';
          if (rawInboundDate) {
            if (typeof rawInboundDate === 'number') {
              try {
                const dateObj = new Date((rawInboundDate - 25569) * 86400 * 1000);
                formattedDate = dateObj.toLocaleDateString('en-GB'); 
              } catch (dateErr) {
                formattedDate = String(rawInboundDate).trim();
              }
            } else {
              formattedDate = String(rawInboundDate).trim();
            }
          }

          fzItems.push({
            inboundNumber: inboundNumVal,
            itemNumber: itemNumberIdx !== -1 ? String(row[itemNumberIdx] || '').trim() : String(fzItems.length + 1),
            inboundDate: formattedDate,
            description: descVal,
            unitType: unitTypeIdx !== -1 ? String(row[unitTypeIdx] || 'EA').trim() : 'EA',
            quantity: quantityIdx !== -1 ? Number(row[quantityIdx]) || 1 : 1,
            value: valueIdx !== -1 ? String(row[valueIdx] || '').trim() : '',
            dutyIncome: dutyIncomeIdx !== -1 ? String(row[dutyIncomeIdx] || '').trim() : ''
          });
        }

        if (fzItems.length === 0) {
          throw new Error('ไม่พบข้อมูลสินค้ารายการใดในเอกสาร FZ Report นี้');
        }

        setFzExtractedData(fzItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse FZ Inventory Report.');
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

  // @ts-ignore
  const { getRootProps: getFzRootProps, getInputProps: getFzInputProps, isDragActive: isFzDragActive } = useDropzone({
    onDrop: (files) => onDropFz(files),
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false
  });

  const handleConfirmFz = async () => {
    if (!fzExtractedData) return;
    setIsProcessing(true);
    try {
      await importFzInventoryReport(fzExtractedData);
      setSuccess(true);
      setFzExtractedData(null);
    } catch (err: any) {
      setError(`Failed to import FZ Report: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!extractedData) return;
    setIsProcessing(true);
    try {
      await processInventoryUpdate(extractedData.header, extractedData.items, uploadType);
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
      {!extractedData && !fzExtractedData && (
        <>
          {/* 🟢 Select Upload Mode Toggle Segmented Control */}
          <div className="bg-white border-2 border-slate-900 p-5 neo-brutalism-shadow space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block font-mono">
              ขั้นตอนที่ 1: เลือกเมนูสินค้าใน INVOICE (CHOOSE CIPL DIRECTION VALUE)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setUploadType('IN')}
                className={cn(
                  "flex flex-col sm:flex-row items-center justify-start gap-4 p-4 border-2 font-black text-xs uppercase tracking-wider transition-all cursor-pointer rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 text-left",
                  uploadType === 'IN'
                    ? "bg-emerald-50 border-emerald-600 text-emerald-800 ring-2 ring-emerald-600/30"
                    : "bg-white border-slate-300 hover:border-slate-800 text-slate-600"
                )}
              >
                <div className={cn(
                  "p-2 border shrink-0 flex items-center justify-center rounded-none",
                  uploadType === 'IN' ? "border-emerald-600 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-slate-50 text-slate-400"
                )}>
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[11px] font-black tracking-wide">ของเข้าคลัง (INCOMING / IMPORT)</span>
                  <span className="text-[9px] font-medium text-slate-400 block tracking-normal normal-case mt-0.5 font-mono">
                    สแกนเข้าระบบจัดเก็บคลังหลัก / สถานะสินค้าเปลี่ยนเป็น IN
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setUploadType('OUT')}
                className={cn(
                  "flex flex-col sm:flex-row items-center justify-start gap-4 p-4 border-2 font-black text-xs uppercase tracking-wider transition-all cursor-pointer rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 text-left",
                  uploadType === 'OUT'
                    ? "bg-red-50 border-red-600 text-red-800 ring-2 ring-red-600/30"
                    : "bg-white border-slate-300 hover:border-slate-800 text-slate-600"
                )}
              >
                <div className={cn(
                  "p-2 border shrink-0 flex items-center justify-center rounded-none",
                  uploadType === 'OUT' ? "border-red-600 bg-red-100 text-red-700" : "border-slate-300 bg-slate-50 text-slate-400"
                )}>
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[11px] font-black tracking-wide">ของออก / ส่งไปต่างประเทศ (OUTGOING / EXPORT)</span>
                  <span className="text-[9px] font-medium text-slate-400 block tracking-normal normal-case mt-0.5 font-mono">
                    สินค้าเตรียมส่งออกต่างประเทศ / สถานะสินค้าเป็น OUT
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div 
            {...getRootProps()} 
            className={cn(
              "border-4 border-dashed p-16 flex flex-col items-center justify-center transition-all bg-white cursor-pointer",
              isDragActive ? "border-blue-600 bg-blue-50" : "border-slate-300 hover:border-slate-900",
              uploadType === 'IN' ? "hover:bg-emerald-50/20" : "hover:bg-red-50/20"
            )}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 border-2 border-slate-900 flex items-center justify-center mb-6 bg-slate-100">
              <Upload className="w-8 h-8 text-slate-900" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest mb-2 font-sans text-center">
              Upload Shipping Invoice ({uploadType === 'IN' ? 'ของเข้า / INCOMING' : 'ของออก / OUTGOING'})
            </h3>
            <p className="text-[10px] opacity-40 uppercase tracking-widest text-center max-w-xs font-mono">
              Supports XLSX, CSV, XLS
            </p>
            <button className={cn(
              "mt-8 px-12 py-3 text-white font-bold text-[10px] uppercase tracking-widest active-neo-brutalism neo-brutalism-shadow",
              uploadType === 'IN' ? "bg-emerald-600" : "bg-red-600"
            )}>
              Browse Files
            </button>
          </div>

          {/* 📦 SCHLUMBERGER - FZ Inventory Report Upload Section */}
          <div className="bg-white border-2 border-slate-900 p-5 neo-brutalism-shadow space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block font-mono">
              ข้อมูลประมวลผลรายงานสินค้า Free Zone (SCHLUMBERGER - FZ INVENTORY REPORT)
            </label>
            <div 
              {...getFzRootProps()} 
              className={cn(
                "border-4 border-dashed p-12 flex flex-col items-center justify-center transition-all bg-slate-50 cursor-pointer",
                isFzDragActive ? "border-amber-600 bg-amber-50" : "border-slate-300 hover:border-slate-900"
              )}
            >
              <input {...getFzInputProps()} />
              <div className="w-12 h-12 border-2 border-slate-900 flex items-center justify-center mb-4 bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <FileSpreadsheet className="w-6 h-6 text-slate-900" />
              </div>
              <h4 className="text-[11px] font-black uppercase tracking-widest mb-1 font-sans text-center">
                SCHLUMBERGER - FZ Inventory Report
              </h4>
              <p className="text-[9px] opacity-50 uppercase tracking-widest text-center max-w-xs font-mono">
                สแกนรายงานอัปเดตคลังรายสัปดาห์จากผู้บริหารฟรีโซน (XLSX, CSV, XLS)
              </p>
              <button className="mt-4 px-8 py-2 bg-slate-950 text-white font-bold text-[9px] uppercase tracking-widest active-neo-brutalism shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                Browse FZ Inventory Report
              </button>
            </div>
          </div>
        </>
      )}

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

        {fzExtractedData && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border-2 border-slate-900 flex flex-col"
          >
            <div className="bg-amber-600 p-4 flex justify-between items-center border-b-2 border-slate-900">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-3">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                รายงานสินค้า Free Zone (SCHLUMBERGER FZ REPORT PREVIEW)
              </h3>
              <div className="flex gap-4">
                <button 
                  onClick={() => { setFzExtractedData(null); }}
                  className="px-6 py-2 bg-white border-2 border-slate-900 text-slate-900 text-[10px] font-bold uppercase transition-all active-neo-brutalism shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-slate-50"
                >
                  Discard
                </button>
                <button 
                  onClick={handleConfirmFz}
                  className="px-8 py-2 border-2 border-slate-900 text-[10px] bg-emerald-600 text-white hover:bg-emerald-700 font-bold uppercase transition-all active-neo-brutalism shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
                >
                  Confirm & Commit Report ({fzExtractedData.length} items)
                </button>
              </div>
            </div>

            <div className="p-4 bg-amber-50/50 border-b-2 border-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4.5 h-4.5 text-amber-600" />
              <p className="text-[10px] font-sans text-amber-800 font-bold uppercase tracking-wide">
                📄 รายการเหล่านี้จะถูก บันทึก / อัปเดต สู่ Master Inventory โดยอัตโนมัติด้วยสถานะ IN และพิกัดจัดเก็บจัดเป็น Free Zone
              </p>
            </div>

            <div className="max-h-[500px] overflow-y-auto p-4 bg-slate-50">
              <table className="w-full text-left border-collapse bg-white border-2 border-slate-900">
                <thead className="sticky top-0 bg-slate-900 text-white select-none">
                  <tr>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest">Line Item</th>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest">Inbound Number</th>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest">Inbound Date</th>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest">Description</th>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-center">Unit Type (UOM)</th>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-center">Qty</th>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-center">COO (Value)</th>
                    <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-center">Segment</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] font-mono divide-y divide-slate-200">
                  {fzExtractedData.map((item, idx) => {
                    const serialMatch = item.description.match(/\(SERIAL\s*:\s*([^)]+)\)/i);
                    const serial = serialMatch ? serialMatch[1].trim() : '';

                    return (
                      <tr key={idx} className="hover:bg-slate-100/50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-bold text-center select-none">{item.itemNumber}</td>
                        <td className="px-4 py-3 text-blue-600 font-bold">{item.inboundNumber}</td>
                        <td className="px-4 py-3 text-slate-800 font-bold">{item.inboundDate || '-'}</td>
                        <td className="px-4 py-3 text-slate-900 font-sans font-medium">
                          <p className="font-bold leading-tight">{item.description}</p>
                          {serial && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 bg-purple-50 border border-purple-300 text-purple-700 text-[9px] font-black tracking-widest uppercase font-mono shadow-sm">
                              📌 Serial Match: {serial}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-650 font-bold uppercase">{item.unitType}</td>
                        <td className="px-4 py-3 text-center text-slate-900 font-bold">{item.quantity}</td>
                        <td className="px-4 py-3 text-center text-slate-700 font-black uppercase">{item.value || '-'}</td>
                        <td className="px-4 py-3 text-center text-slate-700 font-bold">{item.dutyIncome || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
                  onClick={() => { setExtractedData(null); setResolutions({}); }}
                  className="px-6 py-2 bg-white border-2 border-slate-900 text-slate-900 text-[10px] font-bold uppercase transition-all active-neo-brutalism shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  Discard
                </button>
                <button 
                  onClick={handleConfirm}
                  disabled={pendingVerificationCount > 0}
                  className={cn(
                    "px-8 py-2 border-2 border-slate-900 text-[10px] font-bold uppercase transition-all active-neo-brutalism shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                    pendingVerificationCount > 0 
                      ? "bg-slate-300 text-slate-500 border-slate-400 cursor-not-allowed shadow-none" 
                      : "bg-emerald-500 text-white hover:bg-emerald-600"
                  )}
                >
                  {pendingVerificationCount > 0 ? `Verify Needed (${pendingVerificationCount})` : 'Confirm & Commit'}
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-b-2 border-slate-900 bg-slate-50">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block font-mono">
                    เลขที่ใบกำกับสินค้า (Invoice Ref No.)
                  </label>
                  <input
                    type="text"
                    value={extractedData.header.invoiceNo}
                    onChange={(e) => setExtractedData({
                      ...extractedData,
                      header: { ...extractedData.header, invoiceNo: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-900 font-mono text-xs font-black focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block font-mono">
                    วันที่ออกเอกสาร (Document Date)
                  </label>
                  <input
                    type="text"
                    value={extractedData.header.date}
                    onChange={(e) => setExtractedData({
                      ...extractedData,
                      header: { ...extractedData.header, date: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-900 font-mono text-xs font-black focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                  />
                </div>

                <div className="bg-white p-3 border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 block font-mono">
                    ปรับแก้ประเภทขบวนการ (PROCESS TYPE OVERRIDE)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadType('IN')}
                      className={cn(
                        "py-1.5 font-black text-[10px] uppercase tracking-wider text-center border-2 cursor-pointer transition-all active-translate-y-0.5",
                        uploadType === 'IN'
                          ? "bg-emerald-50 border-emerald-600 text-emerald-800"
                          : "bg-slate-50 border-slate-300 text-slate-400"
                      )}
                    >
                      ของเข้า (IN)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadType('OUT')}
                      className={cn(
                        "py-1.5 font-black text-[10px] uppercase tracking-wider text-center border-2 cursor-pointer transition-all active-translate-y-0.5",
                        uploadType === 'OUT'
                          ? "bg-red-50 border-red-600 text-red-800"
                          : "bg-slate-50 border-slate-300 text-slate-400"
                      )}
                    >
                      ของออก (OUT)
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-l-0 md:border-l-2 md:border-slate-300 md:pl-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block font-mono">
                    ผู้ส่งของต้นทาง (Ship From / Origin)
                  </label>
                  <input
                    type="text"
                    value={extractedData.header.shipFrom}
                    onChange={(e) => setExtractedData({
                      ...extractedData,
                      header: { ...extractedData.header, shipFrom: e.target.value }
                    })}
                    placeholder="เช่น Schlumberger Solutions"
                    className="w-full px-3 py-2 bg-white border-2 border-slate-900 font-sans text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block font-mono">
                    ผู้รับของปลายทาง (Consignee / Destination)
                  </label>
                  <input
                    type="text"
                    value={extractedData.header.consignee}
                    onChange={(e) => setExtractedData({
                      ...extractedData,
                      header: { ...extractedData.header, consignee: e.target.value }
                    })}
                    placeholder="ระบุจุดหมายหรือผู้รับ (เว้นว่างไว้จะพิจารณาเป็น ต่างประเทศ อัตโนมัติ)"
                    className="w-full px-3 py-2 bg-white border-2 border-slate-900 font-sans text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                  />
                  {uploadType === 'OUT' && (
                    <p className="text-[9px] text-amber-600 font-mono font-medium mt-1">
                      💡 กรณีส่งไปต่างประเทศ สามารถพิมพ์แก้ไขชื่อปลายทางได้ด้วยตัวเองจากตรงนี้!
                    </p>
                  )}
                </div>
              </div>
            </div>

            {totalFuzzyMatchCount > 0 && (
              <div className="p-4 bg-amber-50 border-b-2 border-slate-900 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="p-2 border-2 border-amber-600 bg-amber-100 text-amber-800 shrink-0">
                    <AlertCircle className="w-5 h-5 animate-pulse text-amber-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider">
                      ⚠️ พบข้อมูลสินค้าที่คล้ายคลึงกันในคลัง (Similarity / Fuzzy Match Detected)
                    </h4>
                    <p className="text-[11px] text-amber-700 font-medium font-sans">
                      ระบบตรวจพบรายการที่มีรหัสซีเรียลหรือคำอธิบายสินค้าใกล้เคียงกับสินค้าในคลังปัจจุบันจำนวน <span className="font-bold underline">{totalFuzzyMatchCount}</span> รายการ โปรดยืนยันความถูกต้องในตารางก่อนที่จะสรุปคลังสินค้า
                    </p>
                    {pendingVerificationCount > 0 ? (
                      <p className="text-[10px] text-rose-600 font-black uppercase mt-1">
                        🚨 เหลืออีก {pendingVerificationCount} รายการที่ต้องคลิกเพื่อตัดสินใจก่อนที่จะ Commit บันทึกค่าได้
                      </p>
                    ) : (
                      <p className="text-[10px] text-emerald-600 font-black uppercase mt-1">
                        ✓ ยืนยันความสอดคล้องครบทุกรายการแล้ว คุณสามารถกด "Confirm & Commit" ได้อย่างปลอดภัย!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

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
                  {extractedData.items.map((item, idx) => {
                    const match = isFuzzyMatch(item);
                    const resolution = resolutions[idx];
                    const hasWarning = !!match;
                    const isPending = hasWarning && !resolution;

                    return (
                      <React.Fragment key={idx}>
                        <tr className={cn(
                          "hover:bg-slate-50 transition-colors",
                          isPending ? "bg-amber-50/40" : "",
                          resolution?.type === 'same' ? "bg-emerald-50/20 text-slate-900" : "",
                          resolution?.type === 'separate' ? "bg-blue-50/20 text-slate-900" : ""
                        )}>
                          <td className="px-6 py-3 text-slate-400">{item.lineItem}</td>
                          <td className="px-6 py-3 font-black text-slate-900">
                            {item.serialNo}
                            {resolution?.type === 'same' && (
                              <span className="block text-[8px] font-sans font-medium text-emerald-600">
                                (ซีเรียลเปลี่ยนตามระบบคลังแล้ว)
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            <strong>{item.partNo}</strong> / {item.description}
                          </td>
                          <td className="px-6 py-3 text-blue-600 font-bold">{item.importEntryNo || '-'}</td>
                          <td className="px-6 py-3 text-blue-600 font-bold">{item.importEntryLineNo || '-'}</td>
                          <td className="px-6 py-3 text-right">
                            {hasWarning ? (
                              isPending ? (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-mono px-2.5 py-1 font-bold border-2 border-amber-600 uppercase animate-pulse">
                                  ⚠️ รอตรวจสอบ
                                </span>
                              ) : resolution?.type === 'same' ? (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-mono px-2.5 py-1 font-bold border-2 border-emerald-600 uppercase">
                                  ✓ ตัวเดียวกัน
                                </span>
                              ) : (
                                <span className="bg-blue-100 text-blue-800 text-[9px] font-mono px-2.5 py-1 font-bold border-2 border-blue-600 uppercase">
                                  ✓ แยกคนละชิ้น
                                </span>
                              )
                            ) : (
                              <span className="text-emerald-700 font-bold uppercase text-[9px]">✓ Valid</span>
                            )}
                          </td>
                        </tr>

                        {hasWarning && (
                          <tr className={cn(
                            "border-b border-t",
                            isPending ? "bg-amber-50/20 border-amber-200" :
                            resolution?.type === 'same' ? "bg-emerald-50/10 border-emerald-100" : "bg-slate-50/30 border-slate-100"
                          )}>
                            <td colSpan={6} className="p-4 px-8">
                              <div className="border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3 font-sans">
                                <div className="flex items-start gap-3">
                                  <div className={cn(
                                    "p-1.5 border-2 shrink-0 rounded-none",
                                    isPending ? "bg-amber-100 border-amber-600 text-amber-700" :
                                    resolution?.type === 'same' ? "bg-emerald-100 border-emerald-600 text-emerald-700" : "bg-blue-100 border-blue-600 text-blue-700"
                                  )}>
                                    <AlertCircle className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <p className="font-black uppercase tracking-wider text-[10px] text-slate-800 font-mono">
                                        {isPending ? '⚠️ ตรวจพบข้อมูลซ้ำซ้อนหรือใกล้เคียงในระบบ' : '✓ ตรวจสอบความถูกต้องเสร็จสิ้นแล้ว'}
                                      </p>
                                    </div>
                                    <p className="text-slate-500 font-medium text-[11px]">
                                      {isPending 
                                        ? `พบสินค้าในคลังปัจจุบันที่มีลักษณะใกล้เคียงกับข้อมูลในไฟล์: "${match.reason || ''}" กรุณาเลือกว่าเป็นชิ้นเดียวกัน หรือคนละชิ้นงาน?` 
                                        : resolution?.type === 'same' 
                                          ? `ยืนยัน "เป็นสินค้าชิ้นเดียวกัน" ระบบปรับรหัสซีเรียลจาก "${resolution.originalSerial}" เป็น "${resolution.correctedSerial}" ตรงกับคลังเพื่อเตรียมทำรายการ` 
                                          : `ยืนยัน "เป็นสินค้าคนละชิ้นงาน" ระบบจะบันทึกรหัสซีเรียล "${resolution.originalSerial}" เป็นคีย์ชิ้นงานแยกใหม่โดยสมบูรณ์`}
                                    </p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-[11px] font-mono">
                                  <div className="border-2 border-slate-900 p-3 bg-red-50/10">
                                    <p className="font-bold text-red-800 mb-1 font-sans text-[10px] uppercase">📦 ข้อมูลจากไฟล์ Invoice</p>
                                    <p><strong>Serial No:</strong> <span className="bg-red-100 px-1 font-bold">{resolution?.originalSerial || item.serialNo}</span></p>
                                    <p className="truncate"><strong>Description:</strong> {item.description}</p>
                                    <p><strong>Part Reference:</strong> {item.partNo || 'N/A'}</p>
                                  </div>
                                  {match && (
                                    <div className="border-2 border-slate-900 p-3 bg-emerald-50/10">
                                      <p className="font-bold text-emerald-800 mb-1 font-sans text-[10px] uppercase">🏛️ ข้อมูลจริงในคลังสินค้า (System Inventory)</p>
                                      <p><strong>Serial No:</strong> <span className="bg-emerald-100 px-1 font-bold">{match.existing.serialNo}</span></p>
                                      <p className="truncate"><strong>Description:</strong> {match.existing.description}</p>
                                      <p><strong>Part Reference:</strong> {match.existing.partNo || 'N/A'}</p>
                                      <p><strong>Status:</strong> <span className={cn(
                                        "px-1 text-[9px] font-bold uppercase",
                                        match.existing.status === 'IN' ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                                      )}>{match.existing.status}</span></p>
                                    </div>
                                  )}
                                </div>

                                <div className="flex gap-2 justify-end pt-1">
                                  {isPending ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleResolveSeparate(idx)}
                                        className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-900 font-sans font-black text-[10px] uppercase cursor-pointer rounded-none transition-all active:translate-y-0.5 active:shadow-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                                      >
                                        เป็นคนละชิ้นกัน (Separate Item)
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleResolveSame(idx, match.existing.serialNo)}
                                        className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 border-2 border-slate-900 font-sans font-black text-[10px] uppercase cursor-pointer rounded-none transition-all active:translate-y-0.5 active:shadow-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                                      >
                                        เป็นสินค้าชิ้นเดียวกัน (Merge / Same Item)
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (resolution?.type === 'same' && resolution.originalSerial) {
                                          const updatedItems = [...extractedData.items];
                                          updatedItems[idx].serialNo = resolution.originalSerial;
                                          setExtractedData({ ...extractedData, items: updatedItems });
                                        }
                                        setResolutions(prev => {
                                          const newRes = { ...prev };
                                          delete newRes[idx];
                                          return newRes;
                                        });
                                      }}
                                      className="px-3 py-1 bg-white text-rose-600 border border-slate-300 hover:border-rose-600 font-sans font-bold text-[9px] uppercase cursor-pointer transition-all"
                                    >
                                      Reset / ดึงค่ากลับเพื่อแก้ไข
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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
