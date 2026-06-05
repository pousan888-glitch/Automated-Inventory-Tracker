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
  }>
) {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be authenticated to process inventory updates.');
  }

  const isLeavingBase = (header.shipFrom || '').toLowerCase().includes('schlumberger');
  const transactionType: 'IN' | 'OUT' = isLeavingBase ? 'OUT' : 'IN';
  const currentLocation = isLeavingBase ? header.consignee : 'In-Base';

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
        importEntryNo: item.importEntryNo || '',
        importEntryLineNo: item.importEntryLineNo || ''
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
        importEntryNo: item.importEntryNo,
        importEntryLineNo: item.importEntryLineNo
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
