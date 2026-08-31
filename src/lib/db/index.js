/**
 * Client side of the SQLite storage layer.
 *
 * The database itself lives in a dedicated worker (see worker.js), because the
 * OPFS SyncAccessHandle API that persistent storage depends on is only exposed
 * there. This module is a thin promise-based RPC over postMessage.
 *
 * Two databases, one connection. `main` is progress: personal, writable, and what
 * export serialises. `content` is the study material, ATTACHed from a .sqlite3
 * file that ships with the build and deserialised READONLY. Content queries are
 * written against `content.*` and can join straight onto progress tables.
 *
 * The only fetch is the content image, from our own origin. Nothing is sent
 * anywhere, and the progress database never leaves the browser.
 *
 * Three backends, tried in this order inside the worker:
 *
 *   opfs-sahpool  Origin Private File System, SyncAccessHandle pool VFS.
 *                 Persistent and fastest. Does NOT need the COOP/COEP headers the
 *                 plain "opfs" VFS requires, which is what makes it work on static
 *                 hosts like GitHub Pages. One tab at a time.
 *   kvvfs         Backed by localStorage. Persistent, same SQL, but limited by the
 *                 localStorage quota. Used when OPFS is unavailable, for example in
 *                 a private window or a second tab.
 *   memory        No persistence. Last resort so the app still runs; the UI says so
 *                 and pushes the learner toward exporting.
 *
 * OPFS databases can vanish for reasons no app controls (browser storage cleanup,
 * disk utilities, permission changes), so export is a first-class feature.
 */

import schemaSql from './schema.sql?raw'
// Vite emits the database as a build asset and hands back its URL, base path and
// content hash included. The worker fetches it and attaches it read-only.
import contentUrl from '$content/ccarf-content.sqlite3?url'

/** Bump when schema.sql needs a migration, and add the migration in worker.js. */
const SCHEMA_VERSION = 2

/** @typedef {'opfs-sahpool' | 'kvvfs' | 'memory'} Backend */

/** @type {Worker | null} */
let worker = null
/** @type {Map<number, {resolve: Function, reject: Function}>} */
const pending = new Map()
let nextId = 1

/** @type {Promise<{backend: Backend}> | null} */
let ready = null
/** @type {Backend} */
let currentBackend = 'memory'
/** @type {Record<string, string>} */
let currentContent = {}

function spawn() {
  const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  w.onmessage = (event) => {
    const { id, result, error } = event.data ?? {}
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    error ? entry.reject(new Error(error)) : entry.resolve(result)
  }
  w.onerror = (event) => {
    const err = new Error(event.message || 'database worker failed')
    for (const { reject } of pending.values()) reject(err)
    pending.clear()
  }
  return w
}

/**
 * @param {string} type
 * @param {any} [payload]
 * @param {Transferable[]} [transfer]
 * @returns {Promise<any>}
 */
function send(type, payload, transfer) {
  const w = worker ?? (worker = spawn())
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, type, payload }, transfer ?? [])
  })
}

/** Open the database once. Safe to call concurrently and repeatedly. */
export function open() {
  if (!ready) {
    ready = send('init', {
      schemaSql,
      schemaVersion: SCHEMA_VERSION,
      // Absolute, because the worker resolves a relative URL against its own
      // module URL rather than the page.
      contentUrl: new URL(contentUrl, location.href).href,
    }).then((info) => {
      currentBackend = info.backend
      currentContent = info.content ?? {}
      return info
    })
  }
  return ready
}

/* ------------------------------------------------------------------ queries */

/**
 * Run a statement that returns nothing.
 * @param {string} sql
 * @param {any[] | Record<string, any>} [bind]
 */
export async function run(sql, bind) {
  await open()
  return send('run', { sql, bind })
}

/**
 * Run a query and return rows as plain objects.
 * @param {string} sql
 * @param {any[] | Record<string, any>} [bind]
 * @returns {Promise<Record<string, any>[]>}
 */
export async function all(sql, bind) {
  await open()
  return send('all', { sql, bind })
}

/**
 * First row, or null.
 * @param {string} sql
 * @param {any[] | Record<string, any>} [bind]
 */
export async function get(sql, bind) {
  await open()
  return send('get', { sql, bind })
}

/**
 * First column of the first row.
 * @param {string} sql
 * @param {any[] | Record<string, any>} [bind]
 */
export async function value(sql, bind) {
  await open()
  return send('value', { sql, bind })
}

/**
 * Run several statements atomically.
 *
 * The statements are collected first and sent as one message, because a
 * transaction cannot span round trips to the worker without risking another
 * caller interleaving a statement inside it.
 *
 * @param {(tx: { run: (sql: string, bind?: any) => void }) => void} fn
 */
export async function transaction(fn) {
  await open()
  /** @type {{sql: string, bind?: any}[]} */
  const statements = []
  fn({ run: (sql, bind) => statements.push({ sql, bind }) })
  if (!statements.length) return
  return send('transaction', { statements })
}

/* ------------------------------------------------------------------ storage */

/** Which backend actually opened, so the UI can report it honestly. */
export async function backend() {
  await open()
  return currentBackend
}

/** The shipped content's own stamp: guide version, build date, size. */
export async function contentInfo() {
  await open()
  return currentContent
}

/** True when progress survives a page reload. */
export async function isPersistent() {
  return (await backend()) !== 'memory'
}

/** Bytes the database occupies, for the storage panel. */
export async function sizeBytes() {
  const [pageSize, pageCount] = await Promise.all([
    value('PRAGMA page_size'),
    value('PRAGMA page_count'),
  ])
  return Number(pageSize) * Number(pageCount)
}

/**
 * Serialise the whole database, for download. The result is a real SQLite file:
 * it opens in the sqlite3 CLI, in DB Browser for SQLite, or anywhere else.
 * @returns {Promise<Uint8Array>}
 */
export async function exportBytes() {
  await open()
  return send('export')
}

/**
 * Replace the database with an imported file. Destructive: the caller confirms.
 * @param {ArrayBuffer} buffer
 */
export async function importBytes(buffer) {
  await open()
  const bytes = new Uint8Array(buffer)
  return send('import', { bytes }, [bytes.buffer])
}

/** Drop every row but keep the schema. */
export async function reset() {
  await transaction((tx) => {
    // Every table in schema.sql. A new table that is not listed here survives a
    // reset, which is a silent bug: the button says all progress and means it.
    for (const t of ['answers', 'attempts', 'reviews', 'cards', 'reading', 'practice', 'flags', 'settings']) {
      tx.run(`DELETE FROM ${t}`)
    }
    tx.run("DELETE FROM sqlite_sequence WHERE name IN ('answers', 'attempts', 'reviews')")
  })
}
