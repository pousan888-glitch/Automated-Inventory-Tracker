import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  onSnapshot,
  Timestamp,
  where,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface InventoryItem {
  userId?: string;
  serialNo: string;
  partNo: string;
  description: string;
  status: 'IN' | 'OUT';
  currentLocation: string;
  lastUpdate: any; // Firestore Timestamp
  importEntryNo?: string;
  importEntryLineNo?: string;
  inboundDate?: string;
  
  // Administrative fields from CIPL and PDF
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
  lineItem?: string;
  invoiceNo?: string;
  customsStatus?: string;
}

export function getDisplaySerial(serialNo: string | undefined): string {
  if (!serialNo) return 'N/A';
  const s = serialNo.trim().toUpperCase();
  if (s === 'N/A' || s.startsWith('N/A-') || s.startsWith('FZ-')) {
    return 'N/A';
  }
  return serialNo;
}

export interface TransactionLog {
  userId?: string;
  date: any; // Firestore Timestamp
  invoiceNo: string;
  transactionType: 'IN' | 'OUT';
  serialNo: string;
  origin: string;
  destination: string;
  lineItem: string;
  importEntryNo: string;
  importEntryLineNo: string;
  inboundDate?: string;

  // Additional fields for auditing matching items
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
  partNo?: string;
  description?: string;
  customsStatus?: string;
}

export async function processInventoryUpdate(
  header: { invoiceNo: string; date: string; shipFrom: string; consignee: string },
  items: Array<{
    lineItem: string;
    partNo: string;
    serialNo: string;
    description: string;
    importEntryNo: string;
    importEntryLineNo: string;

    // Optional administrative fields
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
    customsStatus?: string;
  }>,
  overrideType?: 'IN' | 'OUT'
) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to process inventory updates.');
  }

  const isLeavingBase = (header.shipFrom || '').toLowerCase().includes('schlumberger') ||
    (header.consignee || '').toLowerCase().includes('rig') ||
    (header.consignee || '').toLowerCase().includes('offshore') ||
    (header.consignee || '').toLowerCase().includes('export');

  const transactionType: 'IN' | 'OUT' = overrideType !== undefined ? overrideType : (isLeavingBase ? 'OUT' : 'IN');
  const currentLocation = transactionType === 'OUT' ? (header.consignee || 'ต่างประเทศ (Exported)') : 'In-Base';
  const cleanInvoiceNo = (header.invoiceNo || 'INV-UPDATE').trim();

  // 1. Fetch current inventory of this user to accurately match and calculate stock deduction
  const existingSnapshot = await getDocs(
    query(collection(db, 'inventory'), where('userId', '==', userId))
  );

  const existingItems: (InventoryItem & { _docId: string })[] = [];
  existingSnapshot.forEach(d => {
    existingItems.push({ ...(d.data() as InventoryItem), _docId: d.id });
  });

  // Helper matching function
  const findMatch = (invItem: any) => {
    const rawSerial = (invItem.serialNo || '').trim();
    const cleanSerial = rawSerial.toUpperCase();
    const normSerial = cleanSerial.replace(/[^A-Z0-9]/g, '');
    const cleanPart = (invItem.partNo || '').trim().toUpperCase();
    const cleanDesc = (invItem.description || '').trim().toLowerCase();

    // 1. Exact serial match (prefer status IN if multiple exist)
    if (cleanSerial && cleanSerial !== 'N/A' && !cleanSerial.startsWith('N/A-')) {
      const inSerialMatch = existingItems.find(e => 
        (e.serialNo || '').trim().toUpperCase() === cleanSerial && e.status === 'IN'
      );
      if (inSerialMatch) return inSerialMatch;

      const anySerialMatch = existingItems.find(e => 
        (e.serialNo || '').trim().toUpperCase() === cleanSerial
      );
      if (anySerialMatch) return anySerialMatch;

      // Normalized serial match (without symbols/spaces)
      if (normSerial.length >= 3) {
        const normInMatch = existingItems.find(e => {
          const eNorm = (e.serialNo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          return eNorm === normSerial && e.status === 'IN';
        });
        if (normInMatch) return normInMatch;

        const normAnyMatch = existingItems.find(e => {
          const eNorm = (e.serialNo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          return eNorm === normSerial;
        });
        if (normAnyMatch) return normAnyMatch;
      }
    }

    // 2. Part Number match (for consumables/parts or items where serial is N/A)
    if (cleanPart && cleanPart !== 'N/A' && cleanPart !== '-') {
      const inPartMatch = existingItems.find(e => 
        (e.partNo || '').trim().toUpperCase() === cleanPart && e.status === 'IN'
      );
      if (inPartMatch) return inPartMatch;

      const anyPartMatch = existingItems.find(e => 
        (e.partNo || '').trim().toUpperCase() === cleanPart
      );
      if (anyPartMatch) return anyPartMatch;
    }

    // 3. Description match as fallback
    if (cleanDesc && cleanDesc.length > 5 && !cleanDesc.includes('no description')) {
      const inDescMatch = existingItems.find(e => {
        const eDesc = (e.description || '').trim().toLowerCase();
        return (eDesc === cleanDesc || eDesc.includes(cleanDesc) || cleanDesc.includes(eDesc)) && e.status === 'IN';
      });
      if (inDescMatch) return inDescMatch;
    }

    return null;
  };

  // Chunk items into batches of 80 (since each item can perform up to 3 operations: update, create OUT, add log)
  for (let i = 0; i < items.length; i += 80) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + 80);

    chunk.forEach((item, chunkIdx) => {
      const idx = i + chunkIdx;
      const match = findMatch(item);
      const processQty = (item.qty !== undefined && Number(item.qty) > 0) ? Number(item.qty) : 1;
      const uom = (item.uom || match?.uom || 'EA').trim();
      const cleanCustomEntry = (item.customEntry || item.importEntryNo || match?.customEntry || '').trim();
      const cleanImportEntryNo = (item.importEntryNo || item.customEntry || match?.importEntryNo || '').trim();
      const cleanImportEntryLineNo = (item.importEntryLineNo || match?.importEntryLineNo || '').trim();
      const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : (match?.unitPrice || 0);
      const amount = item.amount !== undefined ? Number(item.amount) : (unitPrice * processQty);

      if (transactionType === 'OUT') {
        // ============================================
        // ✂️ STOCK DEDUCTION (ตัดยอดสินค้าออกจากคลัง)
        // ============================================
        if (match) {
          const currentQty = (match.qty !== undefined && Number(match.qty) > 0) ? Number(match.qty) : 1;

          if (processQty < currentQty) {
            // ✂️ Partial deduction: Remaining stock stays in base (IN), deducted portion goes OUT
            const remainingQty = currentQty - processQty;

            // 1. Update remaining item at base (status IN, reduced quantity)
            const baseRef = doc(db, 'inventory', match._docId);
            batch.update(baseRef, {
              qty: remainingQty,
              lastUpdate: serverTimestamp(),
              userId,
              remark: match.remark 
                ? `${match.remark} | ตัดยอดออก ${processQty} ${uom} (Inv: ${cleanInvoiceNo}) คงเหลือ ${remainingQty}`
                : `ตัดยอดออก ${processQty} ${uom} (Inv: ${cleanInvoiceNo}) คงเหลือ ${remainingQty}`
            });

            // Update in-memory copy so subsequent lines don't over-deduct
            match.qty = remainingQty;

            // 2. Create a separate record for the deployed / OUT portion
            const outSafeSerial = (match.serialNo || item.serialNo || 'OUT').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            const outDocId = `${userId}_${outSafeSerial}_OUT_${Date.now()}_${idx}`;
            const outRef = doc(db, 'inventory', outDocId);

            const outItemDoc: any = {
              ...match,
              userId,
              serialNo: match.serialNo,
              partNo: (item.partNo && item.partNo !== 'N/A') ? item.partNo : (match.partNo || 'N/A'),
              description: item.description || match.description,
              qty: processQty,
              uom: uom,
              status: 'OUT',
              currentLocation: currentLocation,
              invoiceNo: cleanInvoiceNo,
              lastUpdate: serverTimestamp(),
              unitPrice: unitPrice,
              amount: amount,
              remark: `ตัดยอดเบิกออกจากคลังหลัก (เดิมมี ${currentQty} -> เบิกออก ${processQty} คงเหลือในคลัง ${remainingQty} ${uom})`
            };
            if (item.vessel || match.vessel) outItemDoc.vessel = item.vessel || match.vessel;
            if (item.segment || match.segment) outItemDoc.segment = item.segment || match.segment;
            if (item.customsStatus || match.customsStatus) outItemDoc.customsStatus = item.customsStatus || match.customsStatus;

            batch.set(outRef, outItemDoc, { merge: true });

          } else {
            // ✂️ Full deduction: Entire stock is dispatched/exported (status becomes OUT)
            const itemRef = doc(db, 'inventory', match._docId);
            const updatePayload: any = {
              status: 'OUT',
              currentLocation: currentLocation,
              invoiceNo: cleanInvoiceNo,
              lastUpdate: serverTimestamp(),
              userId,
              qty: processQty,
              remark: match.remark 
                ? `${match.remark} | ตัดยอดทั้งหมด ${processQty} ${uom} (Inv: ${cleanInvoiceNo})`
                : `ตัดยอดเบิกออกทั้งหมด ${processQty} ${uom} (Inv: ${cleanInvoiceNo})`
            };
            if (unitPrice) updatePayload.unitPrice = unitPrice;
            if (amount) updatePayload.amount = amount;
            if (item.vessel) updatePayload.vessel = item.vessel;
            if (item.segment) updatePayload.segment = item.segment;

            batch.update(itemRef, updatePayload);

            match.status = 'OUT';
            match.qty = processQty;
          }
        } else {
          // Item was not previously in inventory: record directly as deployed / OUT
          let safeSerial = (item.serialNo || '').trim();
          if (!safeSerial || safeSerial.toUpperCase() === 'N/A') {
            safeSerial = `OUT-${item.partNo && item.partNo !== 'N/A' ? item.partNo : 'ITEM'}-L${item.lineItem || idx + 1}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          }
          const cleanDocSerial = safeSerial.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
          const docId = `${userId}_${cleanDocSerial}`;
          const invRef = doc(db, 'inventory', docId);

          const newOutItem: any = {
            userId,
            serialNo: safeSerial,
            partNo: (item.partNo || 'N/A').trim(),
            description: (item.description || 'No Description').trim(),
            status: 'OUT',
            currentLocation: currentLocation,
            lastUpdate: serverTimestamp(),
            importEntryNo: cleanImportEntryNo,
            importEntryLineNo: cleanImportEntryLineNo,
            invoiceNo: cleanInvoiceNo,
            qty: processQty,
            uom: uom,
            unitPrice: unitPrice,
            amount: amount,
            customEntry: cleanCustomEntry,
            remark: item.remark || `บันทึกรายการสินค้าส่งออก (Inv: ${cleanInvoiceNo})`
          };
          if (item.coo) newOutItem.coo = item.coo;
          if (item.hsCode) newOutItem.hsCode = item.hsCode;
          if (item.eccn) newOutItem.eccn = item.eccn;
          if (item.itemWeight) newOutItem.itemWeight = item.itemWeight;
          if (item.meaningInThai) newOutItem.meaningInThai = item.meaningInThai;
          if (item.dimension) newOutItem.dimension = item.dimension;
          if (item.package) newOutItem.package = item.package;
          if (item.vessel) newOutItem.vessel = item.vessel;
          if (item.segment) newOutItem.segment = item.segment;
          if (item.ibase) newOutItem.ibase = item.ibase;
          if (item.lineItem) newOutItem.lineItem = item.lineItem;
          if (item.customsStatus) newOutItem.customsStatus = item.customsStatus;

          batch.set(invRef, newOutItem, { merge: true });
        }

        // Add Transaction Log for OUT
        const logDocRef = doc(collection(db, 'logs'));
        batch.set(logDocRef, {
          userId,
          date: serverTimestamp(),
          invoiceNo: cleanInvoiceNo,
          transactionType: 'OUT',
          serialNo: match?.serialNo || item.serialNo || 'N/A',
          origin: header.shipFrom || 'In-Base',
          destination: currentLocation,
          lineItem: item.lineItem || match?.lineItem || '',
          importEntryNo: cleanImportEntryNo,
          importEntryLineNo: cleanImportEntryLineNo,
          partNo: item.partNo || match?.partNo || 'N/A',
          description: item.description || match?.description || 'No Description',
          coo: item.coo || match?.coo || '',
          hsCode: item.hsCode || match?.hsCode || '',
          eccn: item.eccn || match?.eccn || '',
          qty: processQty,
          uom: uom,
          unitPrice: unitPrice,
          amount: amount,
          remark: `ตัดยอดเบิกออกจากคลังจำนวน ${processQty} ${uom} ตามใบกำกับ ${cleanInvoiceNo}`
        });

      } else {
        // ============================================
        // 📥 RESTOCK / INCOMING (รับสินค้าเข้าคลัง)
        // ============================================
        if (match) {
          const currentQty = (match.qty !== undefined && Number(match.qty) > 0) ? Number(match.qty) : 1;
          const isUniqueSerial = match.serialNo && !match.serialNo.toUpperCase().startsWith('N/A');

          if (match.status === 'OUT') {
            // Returning from external/deployed back to Base
            const itemRef = doc(db, 'inventory', match._docId);
            batch.update(itemRef, {
              status: 'IN',
              currentLocation: 'In-Base',
              invoiceNo: cleanInvoiceNo,
              lastUpdate: serverTimestamp(),
              userId,
              qty: processQty >= currentQty ? processQty : currentQty,
              importEntryNo: cleanImportEntryNo || match.importEntryNo || '',
              importEntryLineNo: cleanImportEntryLineNo || match.importEntryLineNo || '',
              remark: match.remark 
                ? `${match.remark} | รับคืนเข้าคลัง (Inv: ${cleanInvoiceNo})`
                : `รับคืนเข้าคลัง (Inv: ${cleanInvoiceNo})`
            });
            match.status = 'IN';
          } else {
            // Already IN: For bulk/part items, increase stock qty
            const newQty = isUniqueSerial ? (item.qty !== undefined ? Number(item.qty) : currentQty) : (currentQty + processQty);
            const itemRef = doc(db, 'inventory', match._docId);

            const updatePayload: any = {
              qty: newQty,
              lastUpdate: serverTimestamp(),
              userId,
              invoiceNo: cleanInvoiceNo,
              importEntryNo: cleanImportEntryNo || match.importEntryNo || '',
              importEntryLineNo: cleanImportEntryLineNo || match.importEntryLineNo || '',
              remark: match.remark 
                ? `${match.remark} | เพิ่มสต็อก +${processQty} ${uom} (Inv: ${cleanInvoiceNo})`
                : `เพิ่มสต็อก +${processQty} ${uom} (Inv: ${cleanInvoiceNo})`
            };
            if (unitPrice) updatePayload.unitPrice = unitPrice;
            if (amount) updatePayload.amount = amount;
            if (item.vessel) updatePayload.vessel = item.vessel;
            if (item.segment) updatePayload.segment = item.segment;

            batch.update(itemRef, updatePayload);
            match.qty = newQty;
          }
        } else {
          // Brand new item received at Base
          let safeSerial = (item.serialNo || '').trim();
          if (!safeSerial || safeSerial.toUpperCase() === 'N/A') {
            safeSerial = `IN-${item.partNo && item.partNo !== 'N/A' ? item.partNo : 'ITEM'}-L${item.lineItem || idx + 1}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          }
          const cleanDocSerial = safeSerial.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
          const docId = `${userId}_${cleanDocSerial}`;
          const invRef = doc(db, 'inventory', docId);

          const newInItem: any = {
            userId,
            serialNo: safeSerial,
            partNo: (item.partNo || 'N/A').trim(),
            description: (item.description || 'No Description').trim(),
            status: 'IN',
            currentLocation: 'In-Base',
            lastUpdate: serverTimestamp(),
            importEntryNo: cleanImportEntryNo,
            importEntryLineNo: cleanImportEntryLineNo,
            invoiceNo: cleanInvoiceNo,
            qty: processQty,
            uom: uom,
            unitPrice: unitPrice,
            amount: amount,
            customEntry: cleanCustomEntry,
            remark: item.remark || `รับสินค้าเข้าคลังใหม่ (Inv: ${cleanInvoiceNo})`
          };
          if (item.coo) newInItem.coo = item.coo;
          if (item.hsCode) newInItem.hsCode = item.hsCode;
          if (item.eccn) newInItem.eccn = item.eccn;
          if (item.itemWeight) newInItem.itemWeight = item.itemWeight;
          if (item.meaningInThai) newInItem.meaningInThai = item.meaningInThai;
          if (item.dimension) newInItem.dimension = item.dimension;
          if (item.package) newInItem.package = item.package;
          if (item.vessel) newInItem.vessel = item.vessel;
          if (item.segment) newInItem.segment = item.segment;
          if (item.ibase) newInItem.ibase = item.ibase;
          if (item.lineItem) newInItem.lineItem = item.lineItem;
          if (item.customsStatus) newInItem.customsStatus = item.customsStatus;

          batch.set(invRef, newInItem, { merge: true });
        }

        // Add Transaction Log for IN
        const logDocRef = doc(collection(db, 'logs'));
        batch.set(logDocRef, {
          userId,
          date: serverTimestamp(),
          invoiceNo: cleanInvoiceNo,
          transactionType: 'IN',
          serialNo: match?.serialNo || item.serialNo || 'N/A',
          origin: header.shipFrom || 'Vendor/Supplier',
          destination: 'In-Base',
          lineItem: item.lineItem || match?.lineItem || '',
          importEntryNo: cleanImportEntryNo,
          importEntryLineNo: cleanImportEntryLineNo,
          partNo: item.partNo || match?.partNo || 'N/A',
          description: item.description || match?.description || 'No Description',
          coo: item.coo || match?.coo || '',
          hsCode: item.hsCode || match?.hsCode || '',
          eccn: item.eccn || match?.eccn || '',
          qty: processQty,
          uom: uom,
          unitPrice: unitPrice,
          amount: amount,
          remark: `รับสินค้าเข้าคลังจำนวน ${processQty} ${uom} ตามใบกำกับ ${cleanInvoiceNo}`
        });
      }
    });

    await batch.commit();
  }
}

export async function wipeAllData(type: 'inventory' | 'logs' | 'all') {
  console.log(`Starting wipe process for: ${type}`);
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to wipe data.');
  }

  const collections = type === 'all' ? ['inventory', 'logs'] : [type];
  
  for (const colName of collections) {
    console.log(`Fetching documents from ${colName} for user ${userId}...`);
    const q = query(collection(db, colName), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    console.log(`Found ${snapshot.docs.length} documents in ${colName} for user ${userId}`);
    
    // Firestore batch limit is 500 operations
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 500);
      chunk.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      console.log(`Committed batch deletion for ${chunk.length} items in ${colName}`);
    }
  }
  console.log('Wipe process completed successfully');
}

export function subscribeToInventory(callback: (items: InventoryItem[]) => void) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'inventory'), 
    where('userId', '==', userId)
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs
      .map(doc => doc.data() as InventoryItem)
      .sort((a, b) => {
        const timeA = a.lastUpdate?.toMillis ? a.lastUpdate.toMillis() : 0;
        const timeB = b.lastUpdate?.toMillis ? b.lastUpdate.toMillis() : 0;
        return timeB - timeA; // Descending
      });
    callback(items);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'inventory');
  });
}

export function subscribeToLogs(callback: (logs: TransactionLog[]) => void) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'logs'), 
    where('userId', '==', userId)
  );
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs
      .map(doc => doc.data() as TransactionLog)
      .sort((a, b) => {
        const timeA = a.date?.toMillis ? a.date.toMillis() : 0;
        const timeB = b.date?.toMillis ? b.date.toMillis() : 0;
        return timeB - timeA; // Descending
      });
    callback(logs);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'logs');
  });
}

export async function updateInventoryItem(item: InventoryItem) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to update an inventory item.');
  }
  const docId = `${userId}_${item.serialNo.replace(/\//g, '_')}`;
  const inventoryRef = doc(db, 'inventory', docId);
  await setDoc(inventoryRef, {
    ...item,
    userId,
    lastUpdate: serverTimestamp()
  }, { merge: true });
}

export async function importMasterInventory(items: Array<Partial<InventoryItem>>) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to import master inventory.');
  }

  for (let i = 0; i < items.length; i += 500) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + 500);

    chunk.forEach((item) => {
      let serialNo = (item.serialNo || '').trim();
      const partNo = (item.partNo || '').trim();
      const lineItem = (item.lineItem || '').trim();

      // If serial number is empty or "N/A", generate a unique key to prevent grouping overwrites
      if (!serialNo || serialNo.toUpperCase() === 'N/A') {
        const uniqueSuffix = lineItem ? `L${lineItem}` : Math.random().toString(36).substring(2, 7).toUpperCase();
        serialNo = `N/A-${partNo || 'ITEM'}-${uniqueSuffix}`;
      }

      const docId = `${userId}_${serialNo.replace(/\//g, '_')}`;
      const inventoryRef = doc(db, 'inventory', docId);

      const cleanCustomEntry = (item.customEntry || item.importEntryNo || '').trim();
      const cleanImportEntryNo = (item.importEntryNo || item.customEntry || '').trim();

      const cleanItem: any = {
        userId,
        serialNo,
        partNo: partNo || 'N/A',
        description: (item.description || '').trim() || 'No Description',
        status: (item.status === 'OUT' ? 'OUT' : 'IN'),
        currentLocation: (item.currentLocation || 'In-Base').trim(),
        lastUpdate: serverTimestamp(),
        importEntryNo: cleanImportEntryNo,
        importEntryLineNo: (item.importEntryLineNo || '').trim(),
        invoiceNo: (item.invoiceNo || '').trim(),
        lineItem: lineItem,
        customEntry: cleanCustomEntry
      };

      if (item.coo) cleanItem.coo = String(item.coo).trim();
      if (item.hsCode) cleanItem.hsCode = String(item.hsCode).trim();
      if (item.eccn) cleanItem.eccn = String(item.eccn).trim();
      if (item.qty !== undefined) cleanItem.qty = Number(item.qty);
      if (item.uom) cleanItem.uom = String(item.uom).trim();
      if (item.unitPrice !== undefined) cleanItem.unitPrice = Number(item.unitPrice);
      if (item.amount !== undefined) cleanItem.amount = Number(item.amount);
      if (item.itemWeight !== undefined) cleanItem.itemWeight = item.itemWeight;
      if (item.meaningInThai) cleanItem.meaningInThai = String(item.meaningInThai).trim();
      if (item.dimension) cleanItem.dimension = String(item.dimension).trim();
      if (item.package) cleanItem.package = String(item.package).trim();
      if (item.customEntry) cleanItem.customEntry = String(item.customEntry).trim();
      if (item.vessel) cleanItem.vessel = String(item.vessel).trim();
      if (item.segment) cleanItem.segment = String(item.segment).trim();
      if (item.ibase) cleanItem.ibase = String(item.ibase).trim();
      if (item.remark) cleanItem.remark = String(item.remark).trim();
      if (item.customsStatus) cleanItem.customsStatus = String(item.customsStatus).trim();

      batch.set(inventoryRef, cleanItem, { merge: true });
    });

    await batch.commit();
  }
}

export async function importFzInventoryReport(
  items: Array<{
    inboundNumber: string;
    itemNumber: string;
    inboundDate: string;
    description: string;
    unitType: string;
    quantity: number;
    value: string; // COO
    dutyIncome: string; // segment
  }>
) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to import FZ inventory reports.');
  }

  for (let i = 0; i < items.length; i += 500) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + 500);

    chunk.forEach((item) => {
      const inboundNumber = (item.inboundNumber || '').trim();
      const itemNumber = (item.itemNumber || '').trim();
      const rawDescription = (item.description || '').trim();
      const inboundDate = (item.inboundDate || '').trim();
      const uom = (item.unitType || 'EA').trim();
      const qty = Number(item.quantity) || 1;
      const coo = (item.value || '').trim();
      const segment = (item.dutyIncome || '').trim();

      // Extract serial from description if possible
      let serialNo = '';
      const serialMatch = rawDescription.match(/\(SERIAL\s*:\s*([^)]+)\)/i);
      if (serialMatch && serialMatch[1]) {
        serialNo = serialMatch[1].trim();
      }

      // If no serial, do not put invoice/inbound number in there. Just use a unique generated FZ N/A serial
      if (!serialNo) {
        const uniqueId = Math.random().toString(36).substring(2, 7).toUpperCase();
        serialNo = `N/A-FZ-L${itemNumber || '1'}-${uniqueId}`;
      }

      const docId = `${userId}_${serialNo.replace(/\//g, '_')}`;
      const inventoryRef = doc(db, 'inventory', docId);

      const fzItem: any = {
        userId,
        serialNo,
        partNo: 'N/A',
        description: rawDescription || 'No Description',
        status: 'IN',
        currentLocation: 'Free Zone',
        lastUpdate: serverTimestamp(),
        importEntryNo: inboundNumber,
        importEntryLineNo: itemNumber,
        inboundDate: inboundDate,
        coo: coo,
        uom: uom,
        qty: qty,
        segment: segment,
        lineItem: itemNumber,
        customEntry: inboundNumber,
        customsStatus: 'FZ',
        invoiceNo: 'FZ-REPORT'
      };

      batch.set(inventoryRef, fzItem, { merge: true });
    });

    await batch.commit();
  }
}

export async function processPartialInOut(params: {
  item: InventoryItem;
  transactionType: 'IN' | 'OUT';
  qtyToProcess: number;
  destinationLocation: string;
  invoiceNo?: string;
  remark?: string;
}) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to process inventory updates.');
  }

  const { item, transactionType, qtyToProcess, destinationLocation, invoiceNo, remark } = params;
  const currentQty = item.qty !== undefined && item.qty > 0 ? Number(item.qty) : 1;
  const processQty = Math.max(1, Math.min(qtyToProcess, transactionType === 'OUT' ? currentQty : 999999));

  const docId = `${userId}_${item.serialNo.replace(/\//g, '_')}`;
  const inventoryRef = doc(db, 'inventory', docId);
  const logRef = collection(db, 'logs');

  const cleanInvoiceNo = (invoiceNo || (transactionType === 'OUT' ? 'OUT-STOCK' : 'IN-STOCK')).trim();
  const cleanDestination = (destinationLocation || (transactionType === 'OUT' ? 'ต่างประเทศ/เบิกใช้งาน' : 'In-Base')).trim();

  try {
    if (transactionType === 'OUT') {
      if (processQty >= currentQty) {
        // Entire stock goes OUT
        await setDoc(inventoryRef, {
          ...item,
          userId,
          qty: currentQty,
          status: 'OUT',
          currentLocation: cleanDestination,
          lastUpdate: serverTimestamp(),
          remark: remark ? (item.remark ? `${item.remark} | ${remark}` : remark) : (item.remark || '')
        }, { merge: true });
      } else {
        // Partial OUT: Deduct from existing base item, create new record for OUT portion
        const remainingQty = currentQty - processQty;
        
        // 1. Update remaining item at base
        await setDoc(inventoryRef, {
          ...item,
          userId,
          qty: remainingQty,
          lastUpdate: serverTimestamp()
        }, { merge: true });

        // 2. Create a separate record for deployed/OUT portion
        const outDocId = `${userId}_${item.serialNo.replace(/\//g, '_')}_OUT_${Date.now()}`;
        const outInventoryRef = doc(db, 'inventory', outDocId);
        await setDoc(outInventoryRef, {
          ...item,
          userId,
          serialNo: item.serialNo,
          qty: processQty,
          status: 'OUT',
          currentLocation: cleanDestination,
          invoiceNo: cleanInvoiceNo,
          lastUpdate: serverTimestamp(),
          remark: remark || `เบิกออกจากซีเรียลหลัก (${currentQty} -> เหลือ ${remainingQty})`
        }, { merge: true });
      }

      // Add transaction log
      await addDoc(logRef, {
        userId,
        date: serverTimestamp(),
        invoiceNo: cleanInvoiceNo,
        transactionType: 'OUT',
        serialNo: item.serialNo,
        partNo: item.partNo || 'N/A',
        description: item.description || '',
        origin: item.currentLocation || 'In-Base',
        destination: cleanDestination,
        qty: processQty,
        uom: item.uom || 'EA',
        importEntryNo: item.importEntryNo || item.customEntry || '',
        importEntryLineNo: item.importEntryLineNo || item.lineItem || '',
        unitPrice: item.unitPrice || 0,
        amount: (item.unitPrice || 0) * processQty,
        remark: remark || `ตัดสต็อกเบิกออกจำนวน ${processQty} ${item.uom || 'EA'}`
      });

    } else {
      // transactionType === 'IN'
      if (item.status === 'OUT') {
        if (processQty >= currentQty) {
          // Entire OUT stock returns IN
          await setDoc(inventoryRef, {
            ...item,
            userId,
            qty: currentQty,
            status: 'IN',
            currentLocation: 'In-Base',
            lastUpdate: serverTimestamp(),
            remark: remark ? (item.remark ? `${item.remark} | ${remark}` : remark) : (item.remark || '')
          }, { merge: true });
        } else {
          // Partial return IN
          const remainingOutQty = currentQty - processQty;
          
          // Update OUT item
          await setDoc(inventoryRef, {
            ...item,
            userId,
            qty: remainingOutQty,
            lastUpdate: serverTimestamp()
          }, { merge: true });

          // Also check or add IN stock
          const inDocId = `${userId}_${item.serialNo.replace(/\//g, '_')}_IN_${Date.now()}`;
          const inInventoryRef = doc(db, 'inventory', inDocId);
          await setDoc(inInventoryRef, {
            ...item,
            userId,
            serialNo: item.serialNo,
            qty: processQty,
            status: 'IN',
            currentLocation: 'In-Base',
            invoiceNo: cleanInvoiceNo,
            lastUpdate: serverTimestamp(),
            remark: remark || `คืนสต็อกเข้าคลังจำนวน ${processQty}`
          }, { merge: true });
        }
      } else {
        // Item is already IN, increase base stock qty
        const newQty = currentQty + processQty;
        await setDoc(inventoryRef, {
          ...item,
          userId,
          qty: newQty,
          status: 'IN',
          currentLocation: 'In-Base',
          lastUpdate: serverTimestamp(),
          remark: remark ? (item.remark ? `${item.remark} | ${remark}` : remark) : (item.remark || '')
        }, { merge: true });
      }

      // Add transaction log
      await addDoc(logRef, {
        userId,
        date: serverTimestamp(),
        invoiceNo: cleanInvoiceNo,
        transactionType: 'IN',
        serialNo: item.serialNo,
        partNo: item.partNo || 'N/A',
        description: item.description || '',
        origin: item.currentLocation || 'External',
        destination: 'In-Base',
        qty: processQty,
        uom: item.uom || 'EA',
        importEntryNo: item.importEntryNo || item.customEntry || '',
        importEntryLineNo: item.importEntryLineNo || item.lineItem || '',
        unitPrice: item.unitPrice || 0,
        amount: (item.unitPrice || 0) * processQty,
        remark: remark || `รับสินค้าเข้าคลังจำนวน ${processQty} ${item.uom || 'EA'}`
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `inventory/${item.serialNo}`);
  }
}

export async function addManualInventoryItem(item: Partial<InventoryItem>) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to add custom inventory items.');
  }

  let serialNo = (item.serialNo || '').trim();
  if (!serialNo || serialNo.toUpperCase() === 'N/A') {
    const uniqueId = Math.random().toString(36).substring(2, 7).toUpperCase();
    serialNo = `N/A-MANUAL-${uniqueId}`;
  }

  const partNo = (item.partNo || '').trim() || 'N/A';
  const description = (item.description || '').trim() || 'No Description';
  const status = item.status === 'OUT' ? 'OUT' : 'IN';
  const currentLocation = (item.currentLocation || 'In-Base').trim();
  
  const docId = `${userId}_${serialNo.replace(/\//g, '_')}`;
  const inventoryRef = doc(db, 'inventory', docId);
  const logRef = collection(db, 'logs');

  const cleanItem: any = {
    userId,
    serialNo,
    partNo,
    description,
    status,
    currentLocation,
    lastUpdate: serverTimestamp(),
    invoiceNo: (item.invoiceNo || 'MANUAL-ADD').trim(),
    importEntryNo: (item.importEntryNo || item.customEntry || '').trim(),
    importEntryLineNo: (item.importEntryLineNo || '').trim(),
    inboundDate: (item.inboundDate || '').trim(),
    coo: (item.coo || '').trim(),
    hsCode: (item.hsCode || '').trim(),
    eccn: (item.eccn || '').trim(),
    qty: item.qty !== undefined ? Number(item.qty) : 1,
    uom: (item.uom || 'EA').trim(),
    unitPrice: item.unitPrice !== undefined ? Number(item.unitPrice) : 0,
    amount: item.amount !== undefined ? Number(item.amount) : 0,
    itemWeight: item.itemWeight !== undefined ? item.itemWeight : '',
    meaningInThai: (item.meaningInThai || '').trim(),
    dimension: (item.dimension || '').trim(),
    package: (item.package || '').trim(),
    customEntry: (item.customEntry || item.importEntryNo || '').trim(),
    vessel: (item.vessel || '').trim(),
    segment: (item.segment || '').trim(),
    ibase: (item.ibase || '').trim(),
    remark: (item.remark || '').trim(),
    lineItem: (item.lineItem || '').trim(),
    customsStatus: (item.customsStatus || '').trim()
  };

  try {
    await setDoc(inventoryRef, cleanItem, { merge: true });

    // Also insert a transaction log
    await addDoc(logRef, {
      userId,
      date: serverTimestamp(),
      invoiceNo: cleanItem.invoiceNo,
      transactionType: status,
      serialNo,
      origin: status === 'IN' ? 'MANUAL-ENTRY' : 'In-Base',
      destination: currentLocation,
      lineItem: cleanItem.lineItem,
      importEntryNo: cleanItem.importEntryNo,
      importEntryLineNo: cleanItem.importEntryLineNo,
      inboundDate: cleanItem.inboundDate,
      partNo,
      description,
      coo: cleanItem.coo,
      hsCode: cleanItem.hsCode,
      eccn: cleanItem.eccn,
      qty: cleanItem.qty,
      uom: cleanItem.uom,
      unitPrice: cleanItem.unitPrice,
      amount: cleanItem.amount,
      itemWeight: cleanItem.itemWeight,
      meaningInThai: cleanItem.meaningInThai,
      dimension: cleanItem.dimension,
      package: cleanItem.package,
      customEntry: cleanItem.customEntry,
      vessel: cleanItem.vessel,
      segment: cleanItem.segment,
      ibase: cleanItem.ibase,
      remark: cleanItem.remark,
      customsStatus: cleanItem.customsStatus
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `inventory/${serialNo}`);
  }
}


