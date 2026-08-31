/**
 * The database runs in this worker, and only here.
 *
 * Two reasons, one of them non-negotiable:
 *
 *  1. FileSystemFileHandle.createSyncAccessHandle() is exposed ONLY in a dedicated
 *     worker. The opfs-sahpool VFS is built on it, so on the main thread the pool
 *     silently fails to install and SQLite falls back to localStorage. Persistent
 *     OPFS storage is therefore worker-only, not a preference.
 *  2. SQLite calls are synchronous. Running them off the main thread keeps the UI
 *     responsive during a large query or an import.
 *
 * The protocol is a minimal request/response over postMessage: every message
 * carries an id, and the client resolves the matching promise.
 *
 * TWO databases share this one connection:
 *
 *   main     progress. Personal, writable, and what export serialises.
 *   content  the study material, ATTACHed from the shipped .sqlite3 image and
 *            deserialised READONLY, so SQLite itself refuses a write to it.
 *
 * One connection rather than two, because that is what lets a single statement
 * join a question to the answers given for it. sqlite3_js_db_export() serialises
 * `main` alone, so the content never leaks into an exported progress file.
 */

/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

/** @type {DedicatedWorkerGlobalScope} */
// @ts-expect-error `self` is the worker scope here, not a Window.
const ctx = self

const DB_NAME = 'ccarf-prep.sqlite3'
const POOL_NAME = 'ccarf-prep-pool'

/** @type {any} */ let sqlite3
/** @type {any} */ let db
/** @type {any} */ let pool
/** @type {'opfs-sahpool' | 'kvvfs' | 'memory'} */ let backend = 'memory'
/** Kept so the content can be re-attached after an import without a refetch. */
/** @type {Uint8Array | null} */ let contentImage = null

/**
 * @param {string} schemaSql
 * @param {number} schemaVersion
 * @param {string} contentUrl
 */
async function init(schemaSql, schemaVersion, contentUrl) {
  sqlite3 = await /** @type {any} */ (sqlite3InitModule)({
    print: () => {},
    printErr: (/** @type {string} */ msg) => {
      // The library probes the plain "opfs" VFS too, which does need COOP/COEP.
      // We never use it, so that warning is noise.
      if (typeof msg === 'string' && /COOP|COEP|SharedArrayBuffer/i.test(msg)) return
      console.warn('[sqlite]', msg)
    },
  })

  // Preference order: persistent and fast, persistent and small, neither.
  try {
    if (!sqlite3.installOpfsSAHPoolVfs) throw new Error('SAHPool VFS not compiled in')
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME, initialCapacity: 12 })
    db = new pool.OpfsSAHPoolDb('/' + DB_NAME)
    backend = 'opfs-sahpool'
  } catch {
    try {
      if (!sqlite3.oo1.JsStorageDb) throw new Error('kvvfs unavailable')
      db = new sqlite3.oo1.JsStorageDb('local')
      backend = 'kvvfs'
    } catch {
      db = new sqlite3.oo1.DB(':memory:', 'c')
      backend = 'memory'
    }
  }

  db.exec(schemaSql)

  const current = Number(db.selectValue('PRAGMA user_version') ?? 0)
  if (current !== schemaVersion) {
    // Migrations go here, each guarded by the version it upgrades from.
    // The base schema is idempotent via CREATE ... IF NOT EXISTS.
    db.exec(`PRAGMA user_version = ${schemaVersion}`)
  }

  const res = await fetch(contentUrl)
  if (!res.ok) throw new Error(`could not load the study content: HTTP ${res.status}`)
  contentImage = new Uint8Array(await res.arrayBuffer())
  attachContent()

  return { backend, version: schemaVersion, content: contentStamp() }
}

/** True when the content schema is on the current connection. */
function contentAttached() {
  let found = false
  db.exec({
    sql: 'PRAGMA database_list',
    rowMode: 'object',
    callback: (/** @type {any} */ row) => {
      if (row.name === 'content') found = true
    },
  })
  return found
}

/**
 * Attach the shipped content image as a read-only in-memory schema.
 *
 * ATTACH ':memory:' creates an empty schema, and sqlite3_deserialize() then
 * replaces its contents with the image. SQLITE_DESERIALIZE_READONLY is what makes
 * a write to content.* fail with SQLITE_READONLY rather than merely being a rule
 * nobody enforces. FREEONCLOSE hands the wasm allocation to SQLite to free.
 *
 * Called again after an import, because the OPFS path reopens the connection and
 * an ATTACH does not survive that.
 */
function attachContent() {
  if (!contentImage) throw new Error('content image not loaded')
  if (contentAttached()) return

  db.exec("ATTACH ':memory:' AS content")
  const ptr = sqlite3.wasm.allocFromTypedArray(contentImage)
  const rc = sqlite3.capi.sqlite3_deserialize(
    db.pointer, 'content', ptr, contentImage.length, contentImage.length,
    sqlite3.capi.SQLITE_DESERIALIZE_READONLY | sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
  )
  if (rc !== 0) throw new Error(`could not attach the study content: sqlite rc ${rc}`)
}

/** What the content says about itself, for the Settings panel. */
function contentStamp() {
  /** @type {Record<string, string>} */
  const out = {}
  db.exec({
    sql: 'SELECT key, value FROM content.content_meta',
    rowMode: 'object',
    callback: (/** @type {any} */ row) => {
      out[row.key] = row.value
    },
  })
  out.bytes = String(contentImage?.length ?? 0)
  return out
}

/** @param {string} sql @param {any} bind */
function all(sql, bind) {
  /** @type {any[]} */
  const rows = []
  db.exec({ sql, bind, rowMode: 'object', callback: (/** @type {any} */ row) => rows.push(row) })
  return rows
}

/** @param {{sql: string, bind?: any}[]} statements */
function transaction(statements) {
  db.exec('BEGIN')
  try {
    for (const s of statements) db.exec({ sql: s.sql, bind: s.bind })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function exportBytes() {
  return sqlite3.capi.sqlite3_js_db_export(db.pointer)
}

/** @param {Uint8Array} bytes */
async function importBytes(bytes) {
  if (backend === 'opfs-sahpool') {
    db.close()
    await pool.importDb('/' + DB_NAME, bytes)
    db = new pool.OpfsSAHPoolDb('/' + DB_NAME)
    // A new connection carries no ATTACH, so the content has to go back on.
    attachContent()
    return
  }
  // kvvfs and memory have no file to swap, so rebuild in place from the image.
  const tmp = new sqlite3.oo1.DB(':memory:', 'c')
  const ptr = sqlite3.wasm.allocFromTypedArray(bytes)
  sqlite3.capi.sqlite3_deserialize(
    tmp.pointer, 'main', ptr, bytes.length, bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
  )
  db.exec('PRAGMA writable_schema = 1; DELETE FROM sqlite_master; PRAGMA writable_schema = 0; VACUUM')
  /** @type {string[]} */
  const ddl = []
  tmp.exec({
    sql: "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
    rowMode: 0,
    callback: (/** @type {string} */ sql) => ddl.push(sql),
  })
  for (const sql of ddl) db.exec(sql)
  /** @type {string[]} */
  const tables = []
  tmp.exec({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    rowMode: 0,
    callback: (/** @type {string} */ name) => tables.push(name),
  })
  for (const t of tables) {
    /** @type {Record<string, any>[]} */
    const rows = []
    tmp.exec({
      sql: `SELECT * FROM "${t}"`,
      rowMode: 'object',
      callback: (/** @type {any} */ r) => rows.push(r),
    })
    for (const row of rows) {
      const cols = Object.keys(row)
      db.exec({
        sql: `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        bind: cols.map((c) => row[c]),
      })
    }
  }
  tmp.close()
}

/** @type {Record<string, (payload: any) => any>} */
const handlers = {
  init: ({ schemaSql, schemaVersion, contentUrl }) => init(schemaSql, schemaVersion, contentUrl),
  run: ({ sql, bind }) => void db.exec({ sql, bind }),
  all: ({ sql, bind }) => all(sql, bind),
  get: ({ sql, bind }) => all(sql, bind)[0] ?? null,
  value: ({ sql, bind }) => db.selectValue(sql, bind),
  transaction: ({ statements }) => transaction(statements),
  export: () => exportBytes(),
  import: ({ bytes }) => importBytes(bytes),
  backend: () => backend,
}

ctx.onmessage = async (event) => {
  const { id, type, payload } = event.data ?? {}
  const handler = handlers[type]
  if (!handler) {
    ctx.postMessage({ id, error: `unknown message type: ${type}` })
    return
  }
  try {
    const result = await handler(payload ?? {})
    // Transfer the export buffer rather than copying it across the boundary.
    if (type === 'export' && result?.buffer) {
      ctx.postMessage({ id, result }, [result.buffer])
    } else {
      ctx.postMessage({ id, result })
    }
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
