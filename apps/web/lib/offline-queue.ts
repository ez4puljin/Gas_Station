// Offline борлуулалтын дараалал — IndexedDB (§9). Шинэ dependency-гүй (raw API).
// Идэвхтэй дараалал (active) + "хор"/conflict дараалал (dead) — давтагдашгүй terminal
// алдааг операторт харуулахаар тусгаарлана.

export interface QueuedSale {
  clientGeneratedId: string;
  stationId: string;
  createdAt: string; // ISO
  payload: unknown; // createSale body
  attempts?: number;
  lastError?: string;
}

const DB_NAME = 'fuel-pos';
const VERSION = 2;
const ACTIVE = 'sale-queue';
const DEAD = 'sale-dead';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ACTIVE)) {
        db.createObjectStore(ACTIVE, { keyPath: 'clientGeneratedId' });
      }
      if (!db.objectStoreNames.contains(DEAD)) {
        db.createObjectStore(DEAD, { keyPath: 'clientGeneratedId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ── Идэвхтэй дараалал ──
export function enqueueSale(item: QueuedSale): Promise<IDBValidKey> {
  return withStore(ACTIVE, 'readwrite', (store) => store.put(item));
}
export function getQueuedSales(): Promise<QueuedSale[]> {
  return withStore<QueuedSale[]>(ACTIVE, 'readonly', (s) => s.getAll() as IDBRequest<QueuedSale[]>);
}
export function removeQueued(clientGeneratedId: string): Promise<undefined> {
  return withStore(ACTIVE, 'readwrite', (s) => s.delete(clientGeneratedId));
}
export async function queueCount(): Promise<number> {
  try {
    return await withStore<number>(ACTIVE, 'readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

// ── Dead / conflict дараалал (гар аргаар шийдвэрлэх) ──
export async function moveToDead(item: QueuedSale, lastError: string): Promise<void> {
  await withStore(DEAD, 'readwrite', (s) => s.put({ ...item, lastError }));
  await removeQueued(item.clientGeneratedId);
}
export function getDeadSales(): Promise<QueuedSale[]> {
  return withStore<QueuedSale[]>(DEAD, 'readonly', (s) => s.getAll() as IDBRequest<QueuedSale[]>);
}
export async function deadCount(): Promise<number> {
  try {
    return await withStore<number>(DEAD, 'readonly', (s) => s.count());
  } catch {
    return 0;
  }
}
export function clearDead(): Promise<undefined> {
  return withStore(DEAD, 'readwrite', (s) => s.clear());
}
