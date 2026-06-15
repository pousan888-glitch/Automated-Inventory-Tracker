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

  const isLeavingBase = (header.shipFrom || '').toLowerCase().includes('schlumberger');
  const transactionType: 'IN' | 'OUT' = overrideType !== undefined ? overrideType : (isLeavingBase ? 'OUT' : 'IN');
  const currentLocation = transactionType === 'OUT' ? (header.consignee || 'ต่างประเทศ (Exported)') : 'In-Base';

  for (const item of items) {
    const serialNo = item.serialNo.trim();
    if (!serialNo) continue;

    // Separate storage key for each user: users will not overwrite each other
    const docId = `${userId}_${serialNo.replace(/\//g, '_')}`;
    const inventoryRef = doc(db, 'inventory', docId);
    const logRef = collection(db, 'logs');

    try {
      // Update/Create Master Inventory for this user
      await setDoc(inventoryRef, {
        userId,
        serialNo,
        partNo: item.partNo,
        description: item.description,
        status: transactionType,
        currentLocation: currentLocation,
        lastUpdate: serverTimestamp(),
        importEntryNo: item.importEntryNo || item.customEntry || '',
        importEntryLineNo: item.importEntryLineNo || '',
        invoiceNo: header.invoiceNo,

        // Bind CIPL metadata
        coo: item.coo || '',
        hsCode: item.hsCode || '',
        eccn: item.eccn || '',
        qty: item.qty !== undefined ? Number(item.qty) : 1,
        uom: item.uom || 'EA',
        unitPrice: item.unitPrice !== undefined ? Number(item.unitPrice) : 0,
        amount: item.amount !== undefined ? Number(item.amount) : 0,
        itemWeight: item.itemWeight || '',
        meaningInThai: item.meaningInThai || '',
        dimension: item.dimension || '',
        package: item.package || '',
        customEntry: item.customEntry || item.importEntryNo || '',
        vessel: item.vessel || '',
        segment: item.segment || '',
        ibase: item.ibase || '',
        remark: item.remark || '',
        lineItem: item.lineItem || '',
        customsStatus: item.customsStatus || ''
      }, { merge: true });

      // Add Transaction Log for this user
      await addDoc(logRef, {
        userId,
        date: serverTimestamp(),
        invoiceNo: header.invoiceNo,
        transactionType,
        serialNo,
        origin: header.shipFrom,
        destination: header.consignee,
        lineItem: item.lineItem,
        importEntryNo: item.importEntryNo || item.customEntry || '',
        importEntryLineNo: item.importEntryLineNo,

        // Bind log level metadata
        partNo: item.partNo,
        description: item.description,
        coo: item.coo || '',
        hsCode: item.hsCode || '',
        eccn: item.eccn || '',
        qty: item.qty !== undefined ? Number(item.qty) : 1,
        uom: item.uom || 'EA',
        unitPrice: item.unitPrice !== undefined ? Number(item.unitPrice) : 0,
        amount: item.amount !== undefined ? Number(item.amount) : 0,
        itemWeight: item.itemWeight || '',
        meaningInThai: item.meaningInThai || '',
        dimension: item.dimension || '',
        package: item.package || '',
        customEntry: item.customEntry || item.importEntryNo || '',
        vessel: item.vessel || '',
        segment: item.segment || '',
        ibase: item.ibase || '',
        remark: item.remark || '',
        customsStatus: item.customsStatus || ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `inventory/${serialNo}`);
    }
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

      // If no serial, generate from inbound number and item number
      if (!serialNo) {
        serialNo = `FZ-${inboundNumber || 'INBOUND'}-L${itemNumber || '1'}`;
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


