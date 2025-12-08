import { openDB, type DBSchema } from 'idb'
import type { TransactionRecord } from './pdfParser'

const DB_NAME = 'barik-history'
const DB_VERSION = 1
const STORE_NAME = 'entries'

export type HistoryEntry = {
  id: string
  filename: string
  createdAt: string
  pages: number
  total: number
  records: TransactionRecord[]
}

interface HistorySchema extends DBSchema {
  entries: {
    key: string
    value: HistoryEntry
  }
}

async function getDb() {
  return openDB<HistorySchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    },
  })
}

export async function saveHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'> & { createdAt?: string }): Promise<HistoryEntry> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const payload: HistoryEntry = {
    id,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    filename: entry.filename,
    pages: entry.pages,
    total: entry.records.length,
    records: entry.records,
  }
  await db.put(STORE_NAME, payload)
  return payload
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await getDb()
  const entries = await db.getAll(STORE_NAME)
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  const db = await getDb()
  return db.get(STORE_NAME, id)
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}
