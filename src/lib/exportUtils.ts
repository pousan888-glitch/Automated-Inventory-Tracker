import * as XLSX from 'xlsx';
import { InventoryItem, TransactionLog, getDisplaySerial } from './inventoryService';

/**
 * Utility to convert raw database items into beautifully labeled Excel structures 
 * exactly corresponding to the CIPL administrative column standards (COO, HS CODE, etc.).
 */
export function exportItemsToExcel(items: InventoryItem[], filename = 'inventory_export.xlsx') {
  const headers = [
    'LINE ITEM',       // 0
    'PART NO.',        // 1
    'Serial No.',      // 2
    'DESCRIPTION',     // 3
    '',                // 4
    '',                // 5
    '',                // 6
    '',                // 7
    'COO',             // 8
    'HS CODE',         // 9
    'ECCN',            // 10
    'QTY',             // 11
    '',                // 12
    'UOM',             // 13
    '',                // 14
    'UNIT PRICE',      // 15
    'AMOUNT',          // 16
    'Item Weight',     // 17
    'Meaning in Thai', // 18
    'Dimention',       // 19
    'Package',         // 20
    'Status',          // 21
    'Custom entry',    // 22
    'Destination',     // 23
    'Vessel',          // 24
    'Segment',         // 25
    'ibase',           // 26
    'Remark',          // 27
    'Import Entry No', // 28
    'Import Entry Line',// 29
    'Inbound Date'     // 30
  ];

  const formatUSD = (val: number | undefined) => {
    if (val === undefined || val === null) return 'USD 0.00';
    const num = Number(val);
    if (isNaN(num)) return `USD ${val}`;
    return 'USD ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const rows = items.map((item, idx) => {
    const qtyVal = item.qty !== undefined ? Number(item.qty) : 1;
    const unitPriceVal = item.unitPrice !== undefined ? Number(item.unitPrice) : 0;
    const amountVal = item.amount !== undefined ? Number(item.amount) : (qtyVal * unitPriceVal);

    return [
      item.lineItem || String(idx + 1),       // 0
      item.partNo || '',                      // 1
      getDisplaySerial(item.serialNo),        // 2
      item.description || '',                 // 3
      '',                                     // 4
      '',                                     // 5
      '',                                     // 6
      '',                                     // 7
      item.coo || 'TH',                       // 8
      item.hsCode || '',                      // 9
      item.eccn || 'EAR99',                   // 10
      '',                                     // 11
      qtyVal,                                 // 12
      item.uom || 'EA',                       // 13
      '',                                     // 14
      formatUSD(unitPriceVal),                // 15
      formatUSD(amountVal),                   // 16
      item.itemWeight !== undefined ? String(item.itemWeight) : '', // 17
      item.meaningInThai || '',               // 18
      item.dimension || '',                   // 19
      item.package || '',                     // 20
      item.status || '',                      // 21
      item.customEntry || '',                 // 22
      item.currentLocation || 'In-Base',      // 23
      item.vessel || '',                      // 24
      item.segment || '',                     // 25
      item.ibase || '',                       // 26
      item.remark || '',                      // 27
      item.importEntryNo || '',               // 28
      item.importEntryLineNo || '',           // 29
      item.inboundDate || ''                  // 30
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();

  // Define column widths
  worksheet['!cols'] = headers.map((k, colIdx) => {
    let maxLen = k.length;
    rows.forEach(row => {
      const val = String(row[colIdx] || '');
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(maxLen + 4, 45) };
  });

  // Merging columns D to H (c:3 to c:7) for ALL rows (header row index 0, and data rows 1..items.length)
  const merges = [];
  for (let r = 0; r <= items.length; r++) {
    merges.push({ s: { r: r, c: 3 }, e: { r: r, c: 7 } });
  }
  worksheet['!merges'] = merges;

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Inventory');
  XLSX.writeFile(workbook, filename);
}

/**
 * Robust export helper for Transaction Logs
 */
export function exportLogsToExcel(logs: TransactionLog[], filename = 'transaction_history_export.xlsx') {
  const formatUSD = (val: number | undefined) => {
    if (val === undefined || val === null) return 'USD 0.00';
    const num = Number(val);
    if (isNaN(num)) return `USD ${val}`;
    return 'USD ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const tableData = logs.map((log, idx) => {
    return {
      'DATE': log.date?.toDate ? log.date.toDate().toLocaleString('en-US') : '',
      'INVOICE NO': log.invoiceNo || '',
      'TRANSACTION TYPE': log.transactionType || '',
      'LINE ITEM': log.lineItem || String(idx + 1),
      'PART NO.': log.partNo || '',
      'Serial No.': log.serialNo || '',
      'DESCRIPTION': log.description || '',
      'COO': log.coo || '',
      'HS CODE': log.hsCode || '',
      'ECCN': log.eccn || '',
      'QTY': log.qty !== undefined ? Number(log.qty) : 1,
      'UOM': log.uom || 'EA',
      'UNIT PRICE': log.unitPrice !== undefined ? formatUSD(Number(log.unitPrice)) : 'USD 0.00',
      'AMOUNT': log.amount !== undefined ? formatUSD(Number(log.amount)) : 'USD 0.00',
      'Item Weight (KG)': log.itemWeight || '',
      'Meaning in Thai': log.meaningInThai || '',
      'Dimention': log.dimension || '',
      'Package': log.package || '',
      'Custom entry': log.customEntry || '',
      'Origin': log.origin || '',
      'Destination': log.destination || '',
      'Vessel': log.vessel || '',
      'Segment': log.segment || '',
      'ibase': log.ibase || '',
      'Remark': log.remark || '',
      'Import Entry No': log.importEntryNo || '',
      'Import Entry Line': log.importEntryLineNo || ''
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(tableData);
  const workbook = XLSX.utils.book_new();

  const keys = Object.keys(tableData[0] || {});
  worksheet['!cols'] = keys.map(k => {
    let maxLen = k.length;
    tableData.forEach(row => {
      const val = String((row as any)[k] || '');
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(maxLen + 4, 45) };
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaction Journal');
  XLSX.writeFile(workbook, filename);
}

/**
 * Technical helper to format items as a cleaner, tab-separated string (TSV)
 * which can be directly copied to the clipboard and pasted into MS Excel/Google Sheets.
 */
export function generateItemsTSV(items: InventoryItem[]): string {
  const headers = [
    'LINE ITEM',       // 0
    'PART NO.',        // 1
    'Serial No.',      // 2
    'DESCRIPTION',     // 3
    '',                // 4
    '',                // 5
    '',                // 6
    '',                // 7
    'COO',             // 8
    'HS CODE',         // 9
    'ECCN',            // 10
    'QTY',             // 11
    '',                // 12
    'UOM',             // 13
    '',                // 14
    'UNIT PRICE',      // 15
    'AMOUNT',          // 16
    'Item Weight',     // 17
    'Meaning in Thai', // 18
    'Dimention',       // 19
    'Package',         // 20
    'Status',          // 21
    'Custom entry',    // 22
    'Destination',     // 23
    'Vessel',          // 24
    'Segment',         // 25
    'ibase',           // 26
    'Remark',          // 27
    'Import Entry No', // 28
    'Import Entry Line',// 29
    'Inbound Date'     // 30
  ];

  const formatUSD = (val: number | undefined) => {
    if (val === undefined || val === null) return 'USD 0.00';
    const num = Number(val);
    if (isNaN(num)) return `USD ${val}`;
    return 'USD ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const rows = items.map((item, idx) => {
    const qtyVal = item.qty !== undefined ? Number(item.qty) : 1;
    const unitPriceVal = item.unitPrice !== undefined ? Number(item.unitPrice) : 0;
    const amountVal = item.amount !== undefined ? Number(item.amount) : (qtyVal * unitPriceVal);

    const vals = [
      item.lineItem || String(idx + 1),       // 0
      item.partNo || '',                      // 1
      getDisplaySerial(item.serialNo),        // 2
      item.description || '',                 // 3
      '',                                     // 4
      '',                                     // 5
      '',                                     // 6
      '',                                     // 7
      item.coo || 'TH',                       // 8
      item.hsCode || '',                      // 9
      item.eccn || 'EAR99',                   // 10
      '',                                     // 11
      qtyVal,                                 // 12
      item.uom || 'EA',                       // 13
      '',                                     // 14
      formatUSD(unitPriceVal),                // 15
      formatUSD(amountVal),                   // 16
      item.itemWeight !== undefined ? String(item.itemWeight) : '', // 17
      item.meaningInThai || '',               // 18
      item.dimension || '',                   // 19
      item.package || '',                     // 20
      item.status || '',                      // 21
      item.customEntry || '',                 // 22
      item.currentLocation || 'In-Base',      // 23
      item.vessel || '',                      // 24
      item.segment || '',                     // 25
      item.ibase || '',                       // 26
      item.remark || '',                      // 27
      item.importEntryNo || '',               // 28
      item.importEntryLineNo || '',           // 29
      item.inboundDate || ''                  // 30
    ];

    return vals.map(val => {
      let s = String(val === undefined || val === null ? '' : val);
      // Escape for Excel TSV format: wrapping in quotes if it has tab, newline, or quotes
      if (s.includes('\t') || s.includes('\n') || s.includes('\r') || s.includes('"')) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join('\t');
  });

  return [headers.join('\t'), ...rows].join('\n');
}

