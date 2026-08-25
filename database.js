/*
 * LocalForge IndexedDB Storage
 */

const DATABASE = "LocalForge3D";
const VERSION = 1;

const STORE_RUNTIME = "runtime";
const STORE_PROJECTS = "projects";
const STORE_AUTOSAVE = "autosave";

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn(
        "[LocalForge] IndexedDB unavailable"
      );

      resolve(null);
      return;
    }

    const request =
      indexedDB.open(DATABASE, VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          STORE_RUNTIME
        )
      ) {
        db.createObjectStore(STORE_RUNTIME);
      }

      if (
        !db.objectStoreNames.contains(
          STORE_PROJECTS
        )
      ) {
        db.createObjectStore(
          STORE_PROJECTS,
          {
            keyPath: "id"
          }
        );
      }

      if (
        !db.objectStoreNames.contains(
          STORE_AUTOSAVE
        )
      ) {
        db.createObjectStore(STORE_AUTOSAVE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

async function write(store, key, value) {
  const db = await openDatabase();

  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx =
      db.transaction(store, "readwrite");

    tx.objectStore(store).put(value, key);

    tx.oncomplete = resolve;

    tx.onerror = () =>
      reject(tx.error);
  });
}

async function read(store, key) {
  const db = await openDatabase();

  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx =
      db.transaction(store, "readonly");

    const request =
      tx.objectStore(store).get(key);

    request.onsuccess = () =>
      resolve(request.result || null);

    request.onerror = () =>
      reject(request.error);
  });
}

export function saveRuntimeState(state) {
  return write(
    STORE_RUNTIME,
    "state",
    state
  );
}

export function loadRuntimeState() {
  return read(
    STORE_RUNTIME,
    "state"
  );
}

export function saveAutosave(data) {
  return write(
    STORE_AUTOSAVE,
    "current",
    data
  );
}

export function loadAutosave() {
  return read(
    STORE_AUTOSAVE,
    "current"
  );
}
