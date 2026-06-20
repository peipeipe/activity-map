import type { Activity } from "./types";

const DATABASE = "activity-map";
const STORE = "imports";
const KEY = "latest";

export async function saveActivities(activities: Activity[]): Promise<void> {
  const database = await openDatabase();
  await transaction(database, "readwrite", (store) => store.put(activities, KEY));
  database.close();
}

export async function loadActivities(): Promise<Activity[] | null> {
  const database = await openDatabase();
  const result = await transaction<Activity[] | undefined>(database, "readonly", (store) => store.get(KEY));
  database.close();
  return result ?? null;
}

export async function clearActivities(): Promise<void> {
  const database = await openDatabase();
  await transaction(database, "readwrite", (store) => store.delete(KEY));
  database.close();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction<T = undefined>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = action(database.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
