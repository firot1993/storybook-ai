const DB_NAME = 'storybook-ai-local'
const DB_VERSION = 1
const STORE_NAME = 'kv'
const CURRENT_STORY_KEY = 'currentStory'

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB is not available in this browser environment.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'))
  })
}

export async function setCurrentStoryInIndexedDB(story: unknown): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(story, CURRENT_STORY_KEY)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Failed to write story to IndexedDB.'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB write transaction aborted.'))
  })
  db.close()
}

export async function getCurrentStoryFromIndexedDB<T>(): Promise<T | null> {
  const db = await openDb()
  const result = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(CURRENT_STORY_KEY)

    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null)
    }
    request.onerror = () => {
      reject(request.error || new Error('Failed to read story from IndexedDB.'))
    }
  })
  db.close()
  return result
}

export async function clearCurrentStoryInIndexedDB(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(CURRENT_STORY_KEY)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Failed to clear story in IndexedDB.'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB clear transaction aborted.'))
  })
  db.close()
}
