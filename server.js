/**
 * Static file server for the hosted build.
 *
 * App Hosting has no framework adapter for Vite, so it falls back to the Node
 * buildpack, which needs a process listening on $PORT. This is that process. It
 * serves dist/ and nothing else.
 *
 * Written on node:http rather than a static-server package so the dependency
 * list stays at the three the browser actually needs. Nothing here runs in the
 * browser, and once the page has loaded the app makes no further network calls.
 */

import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)

const ROOT = fileURLToPath(new URL('./dist/', import.meta.url))
const PORT = Number(process.env.PORT ?? 8080)

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  // sqlite-wasm instantiates by streaming, which rejects any type but this one.
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.sqlite3': 'application/vnd.sqlite3',
}

/** Worth it: the wasm binary and the content database are 1.7 MB between them. */
const COMPRESSIBLE = new Set(['.css', '.html', '.js', '.json', '.svg', '.sqlite3', '.wasm'])

/**
 * dist/ cannot change while the process runs, so every file is read and gzipped
 * once and then served from memory. Compressing per request instead is slow
 * enough on the two large binaries to be measurable at the browser.
 *
 * Keyed by resolved path, and misses are never kept: caching them would let any
 * scanner walking made-up URLs grow this map without limit.
 *
 * @type {Map<string, Promise<{type: string, raw: Buffer, gz: Buffer | null} | null>>}
 */
const cache = new Map()

async function read(path) {
  let info
  try {
    info = await stat(path)
  } catch {
    return null
  }
  if (!info.isFile()) return null

  const ext = extname(path)
  const raw = await readFile(path)
  return {
    type: TYPES[ext] ?? 'application/octet-stream',
    raw,
    gz: COMPRESSIBLE.has(ext) ? await gzipAsync(raw, { level: 9 }) : null,
  }
}

function load(path) {
  let entry = cache.get(path)
  if (!entry) {
    entry = read(path).then((result) => {
      if (!result) cache.delete(path)
      return result
    })
    cache.set(path, entry)
  }
  return entry
}

/** Resolve a request path inside dist/, or null if it tries to escape. */
function resolve(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const full = join(ROOT, normalize(decoded))
  return full.startsWith(ROOT) ? full : null
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end()
    return
  }

  const urlPath = new URL(req.url, 'http://localhost').pathname
  let path = resolve(urlPath === '/' ? '/index.html' : urlPath)
  if (!path) {
    res.writeHead(403).end()
    return
  }

  let entry = await load(path)
  // Routing is hash-based, so a bare path is only ever someone typing a URL.
  // Extensionless only: a missing asset has to stay a 404 rather than come back
  // as HTML with a 200, which is a miserable thing to debug inside a worker.
  if (!entry && !extname(path)) {
    path = join(ROOT, 'index.html')
    entry = await load(path)
  }
  if (!entry) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
    return
  }

  const gz = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  const body = gz ? entry.gz : entry.raw

  res.writeHead(200, {
    'content-type': entry.type,
    'content-length': body.length,
    // Everything under assets/ carries a content hash in its name, so it can be
    // cached forever. index.html is the one file that must not be.
    'cache-control': urlPath.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
    'x-content-type-options': 'nosniff',
    ...(entry.gz ? { vary: 'Accept-Encoding' } : {}),
    ...(gz ? { 'content-encoding': 'gzip' } : {}),
  })
  res.end(req.method === 'HEAD' ? undefined : body)
})

server.listen(PORT, '0.0.0.0', () => console.log(`serving dist/ on ${PORT}`))
