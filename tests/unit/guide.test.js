// @vitest-environment node
/**
 * The exam guide, as a test.
 *
 * Every number this app states about the exam traces to one document, and until
 * now the trace was a person's word: the guide was read on 2026-08-31 and nothing
 * afterwards could tell you whether a figure had drifted. This compares what the
 * database publishes to the guide's own words, so a wrong figure fails the suite,
 * and a revision that moves one fails it loudly instead of disagreeing quietly.
 *
 * It reads `content/exam-guide.txt`, which is the shipped PDF with its whitespace
 * removed. The guide's typesetting breaks glyph runs inside words, so any extractor
 * returns "Orchestr a tion"; with the whitespace gone the comparison is exact
 * again. `bin/guide-text.sh` regenerates it, and no PDF parser is needed here.
 *
 * What this cannot reach: the retake waits, the four-attempts-per-year limit, the
 * renewal terms and the Pearson VUE mechanics are published on the certification
 * pages rather than in the guide, so `docs.policies` still rests on a manual read.
 */

import { describe, it, expect } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/* ------------------------------------------------------------------ the data */

const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} })
const db = new sqlite3.oo1.DB(':memory:', 'c')
const image = new Uint8Array(readFileSync(join(root, 'content/ccarf-content.sqlite3')))
const ptr = sqlite3.wasm.allocFromTypedArray(image)
sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', ptr, image.length, image.length,
  sqlite3.capi.SQLITE_DESERIALIZE_READONLY | sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE)

const rows = (sql) => {
  const out = []
  db.exec({ sql, rowMode: 'object', callback: (r) => out.push(r) })
  return out
}

const guide = readFileSync(join(root, 'content/exam-guide.txt'), 'utf8')
const doc = (key) => JSON.parse(rows(`SELECT json FROM docs WHERE key = '${key}'`)[0].json)
const meta = doc('meta')
const contentMeta = Object.fromEntries(rows('SELECT * FROM content_meta').map((r) => [r.key, r.value]))

/** The guide's own form of a string: whitespace gone, everything else intact. */
const squash = (s) => s.replace(/\s+/g, '')

/** Assert the guide contains this text, and say what was looked for when it does not. */
const carries = (what, text) => {
  const needle = squash(text)
  expect(guide.includes(needle), `${what}: the guide does not carry "${needle.slice(0, 90)}"`).toBe(true)
}

/* ------------------------------------------------------------------- the file */

describe('the shipped guide', () => {
  it('is the revision the content was transcribed from', () => {
    expect(guide.length).toBeGreaterThan(50_000)
    carries('guide version', `Version ${contentMeta.guideVersion}`)
    carries('effective date', `Effective ${meta.effective}`)
    carries('exam code', `Exam code ${contentMeta.examCode}`)
    expect(meta.examCode).toBe(contentMeta.examCode)
    expect(meta.guideVersion).toBe(contentMeta.guideVersion)
  })

  it('states the document control row the content claims', () => {
    // Section 18. A revision past 1.0 adds a row here before it changes anything else.
    carries('document control', `${contentMeta.guideVersion} Formatting and layout updates ${meta.effective}`)
  })
})

/* ------------------------------------------------------------------- the facts */

describe('exam facts', () => {
  it('match the guide, figure by figure', () => {
    carries('item count', `Number of items ${meta.items}`)
    carries('time limit', `Time limit ${meta.timeLimitMinutes} minutes`)
    carries('exam structure', `Exam structure ${meta.scenariosPresented} scenarios drawn from a bank of ${meta.scenarioBankSize}`)
    carries('passing score', `Scaled score of ${meta.passingScaled} on a scale of ${meta.scaleMin}–${meta.scaleMax.toLocaleString('en-US')}`)
    carries('fee', `Exam fee $${meta.feeUsd} USD`)
    carries('validity', `Validity period ${meta.validityMonths} months from the date the credential is awarded`)
  })

  it('states the item format the app states', () => {
    // The one the web gets wrong. Superseded v0.1 said "select the single response",
    // and copies of it still rank highly, so this is the assertion that settles it.
    carries('item format', meta.itemFormat.replace(';', ' items;'))
    expect(guide.includes('selectthesingleresponse')).toBe(false)
  })

  it('reports results the way the app says it does', () => {
    carries('result reporting', 'Pass/fail with scaled score')
    carries('per-domain reporting', 'the percentage of items you answered correctly within each content domain')
  })
})

/* ---------------------------------------------------------------- the blueprint */

describe('the blueprint', () => {
  it('weights the five domains as the database does', () => {
    const domains = rows('SELECT name, weight FROM domains ORDER BY ord')
    expect(domains).toHaveLength(5)
    for (const d of domains) carries(`domain ${d.name}`, `${d.name} ${d.weight}%`)
    expect(domains.reduce((n, d) => n + d.weight, 0)).toBe(100)
    carries('weight total', 'Total 100%')
  })

  it('names all thirty task statements', () => {
    const tasks = rows('SELECT id, title FROM tasks ORDER BY ord')
    expect(tasks).toHaveLength(30)
    const missing = tasks.filter((t) => !guide.includes(squash(t.title)))
    expect(missing.map((t) => `${t.id} ${t.title}`)).toEqual([])
  })

  it('names all six scenarios', () => {
    const scenarios = rows('SELECT id, title FROM scenarios ORDER BY ord')
    expect(scenarios).toHaveLength(6)
    const missing = scenarios.filter((s) => !guide.includes(squash(s.title)))
    expect(missing.map((s) => `${s.id} ${s.title}`)).toEqual([])
  })
})

/* -------------------------------------------------------------------- the scope */

describe('the scope lists', () => {
  it('draws every in-scope area from the guide', () => {
    const areas = doc('inScope')
    expect(areas.length).toBeGreaterThan(10)
    expect(areas.filter((a) => !guide.includes(squash(a)))).toEqual([])
  })

  it('draws every excluded topic from the guide', () => {
    // The database drops the guide's parentheses and rewords what is inside them,
    // so each item is matched on its leading clause rather than whole.
    const clause = (s) => s.split(/[,(]/)[0].trim()
    const excluded = doc('outOfScope')
    expect(excluded).toHaveLength(16)
    expect(excluded.filter((t) => !guide.includes(squash(clause(t))))).toEqual([])
  })
})

/* ----------------------------------------------------------- the official items */

describe('the twelve official samples', () => {
  it('are the guide\'s own, word for word', () => {
    const official = rows("SELECT id, stem FROM questions WHERE source = 'official' ORDER BY id")
    expect(official).toHaveLength(12)
    const drifted = official.filter((q) => !guide.includes(squash(q.stem)))
    expect(drifted.map((q) => q.id)).toEqual([])
  })

  it('carry the guide\'s own options', () => {
    const opts = rows(`
      SELECT o.question_id, o.text FROM options o
      JOIN questions q ON q.id = o.question_id
      WHERE q.source = 'official' ORDER BY o.question_id, o.ord`)
    expect(opts).toHaveLength(48)
    const drifted = opts.filter((o) => !guide.includes(squash(o.text)))
    expect(drifted.map((o) => `${o.question_id}: ${o.text.slice(0, 60)}`)).toEqual([])
  })
})
