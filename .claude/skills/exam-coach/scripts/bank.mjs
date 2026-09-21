#!/usr/bin/env node
/**
 * Read-only access to the study content for a coaching session in the terminal.
 *
 * The app reads content/ccarf-content.sqlite3 in the browser; this reads the same
 * file through the sqlite3 CLI, so a drill in Claude Code and a quiz in the app are
 * the same 279 questions and the same per-option reasons. Nothing here writes.
 *
 * `ask` deliberately withholds the answer. The transcript of a coaching session is
 * something the learner reads, so an item and its key must never arrive in the same
 * output: ask, let them answer, then call `key`.
 *
 * Options come out in the order the database holds them, not shuffled. The bank's
 * keys were rotated flat when it was written and the audit fails the suite if any
 * letter passes 35%, so position carries no signal to shuffle away.
 *
 * Standard library only. Needs the sqlite3 CLI, which is what the content is edited
 * with anyway.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '../../../..')
const DB = join(root, 'content/ccarf-content.sqlite3')

if (!existsSync(DB)) fail(`no content database at ${DB.slice(root.length + 1)}`)

/** @param {string} msg */
function fail(msg) {
  console.error(msg)
  process.exit(1)
}

/** @param {string} sql */
function rows(sql) {
  let out
  try {
    out = execFileSync('sqlite3', ['-readonly', '-json', DB, sql], { encoding: 'utf8' }).trim()
  } catch (e) {
    fail(`sqlite3 failed: ${e.stderr || e.message}`)
  }
  return out ? JSON.parse(out) : []
}

/** Single-quote a value for SQL. Arguments reach here from a prompt, so nothing is interpolated raw. */
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`
const list = (v) => v.split(',').map((s) => lit(s.trim())).join(', ')

/* ------------------------------------------------------------------ arguments */

const [, , command, ...rest] = process.argv
/** @type {Record<string, string>} */
const flags = {}
const positional = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') ? 'true' : rest[++i] ?? 'true'
  else positional.push(rest[i])
}

const count = Math.min(Number(flags.count ?? 5) || 5, 25)

/**
 * A WHERE clause built only from the filters the table can answer, so
 * `cards --scenario S1` says flashcards have no scenario instead of handing the
 * learner a SQL parse error.
 * @param {string[]} columns
 */
function where(columns) {
  const has = (c) => columns.includes(c)
  const parts = []
  if (flags.domain) parts.push(has('domain') ? `domain = ${lit(flags.domain.toUpperCase())}` : fail('--domain does not apply here'))
  if (flags.task) parts.push(has('task') ? `task = ${lit(flags.task)}` : fail('--task does not apply here'))
  if (flags.scenario) parts.push(has('scenario') ? `scenario = ${lit(flags.scenario.toUpperCase())}` : fail('only questions carry a scenario; drop --scenario'))
  if (flags.exclude) parts.push(`id NOT IN (${list(flags.exclude)})`)
  return parts.length ? `WHERE ${parts.join(' AND ')}` : ''
}

/* ------------------------------------------------------------------- commands */

const commands = {
  /** The blueprint, plus what the bank holds per domain. Draw weighted from this. */
  stats() {
    const ds = rows(`
      SELECT d.id, d.short_name, d.weight, d.expected_items,
             (SELECT COUNT(*) FROM questions q WHERE q.domain = d.id) AS questions,
             (SELECT COUNT(*) FROM flashcards f WHERE f.domain = d.id) AS cards
        FROM domains d ORDER BY d.ord`)
    for (const d of ds) {
      console.log(`${d.id}  ${d.short_name.padEnd(24)} ${String(d.weight).padStart(2)}%  ` +
        `${String(d.expected_items).padStart(2)} of 60 items   bank: ${d.questions} questions, ${d.cards} cards`)
    }
    const [{ n }] = rows('SELECT COUNT(*) AS n FROM questions')
    console.log(`\n${n} questions. A 60-item paper draws 4 scenarios from 6; the per-domain counts above are the draw.`)
  },

  /** Task statements, for teaching before testing. */
  tasks() {
    const only = flags.domain ? `WHERE domain = ${lit(flags.domain.toUpperCase())}` : ''
    for (const t of rows(`SELECT id, domain, title, key_idea FROM tasks ${only} ORDER BY ord`)) {
      console.log(`${t.id}  [${t.domain}] ${t.title}\n      ${t.key_idea}\n`)
    }
  },

  /** One task statement in full: what the guide lists as knowledge, skills and traps. */
  task() {
    const id = positional[0] || flags.task
    if (!id) fail('usage: bank.mjs task <id>, for example 3.2')
    const [t] = rows(`SELECT * FROM tasks WHERE id = ${lit(id)}`)
    if (!t) fail(`no task ${id}`)
    console.log(`${t.id}  ${t.title}\n${t.key_idea}\n`)
    for (const kind of ['knowledge', 'skills', 'traps']) {
      const bs = rows(`SELECT text FROM task_bullets WHERE task_id = ${lit(id)} AND kind = ${lit(kind)} ORDER BY ord`)
      if (!bs.length) continue
      console.log(`${kind}:`)
      for (const b of bs) console.log(`  - ${b.text}`)
      console.log()
    }
    const ex = rows(`SELECT lang, title, code, note FROM task_examples WHERE task_id = ${lit(id)} ORDER BY ord`)
    for (const e of ex) console.log(`worked example (ours, the guide carries no code) - ${e.title}\n\`\`\`${e.lang}\n${e.code}\n\`\`\`\n${e.note}\n`)
  },

  /** Items to put to the learner. No key, no explanation: call `key` after they answer. */
  ask() {
    const qs = rows(`SELECT id, domain, task, scenario, type, select_count, stem FROM questions ${where(['domain', 'task', 'scenario', 'id'])} ORDER BY RANDOM() LIMIT ${count}`)
    if (!qs.length) fail('nothing matched that filter')
    for (const q of qs) {
      const howMany = q.type === 'multi' ? `select ${q.select_count}` : 'select one'
      console.log(`[${q.id}] ${q.domain} ${q.task}${q.scenario ? ' ' + q.scenario : ''}  (${howMany})`)
      console.log(q.stem)
      for (const o of rows(`SELECT key, text FROM options WHERE question_id = ${lit(q.id)} ORDER BY ord`)) {
        console.log(`  ${o.key}. ${o.text}`)
      }
      console.log()
    }
    console.log(`ids: ${qs.map((q) => q.id).join(',')}`)
    console.log('Pass these to --exclude on the next call so nothing repeats in this sitting.')
  },

  /** The key and the named reason each distractor fails. Only after the learner has answered. */
  key() {
    const ids = positional.length ? positional.join(',') : flags.id
    if (!ids) fail('usage: bank.mjs key <id> [id ...]')
    for (const id of ids.split(',').map((s) => s.trim())) {
      const [q] = rows(`SELECT id, type, select_count, explanation FROM questions WHERE id = ${lit(id)}`)
      if (!q) { console.log(`${id}: no such question\n`); continue }
      const opts = rows(`SELECT key, is_correct, why FROM options WHERE question_id = ${lit(id)} ORDER BY ord`)
      const correct = opts.filter((o) => o.is_correct).map((o) => o.key)
      console.log(`[${q.id}] correct: ${correct.join(' and ')}${q.type === 'multi' ? ` (${q.select_count} to select, all or nothing)` : ''}`)
      console.log(q.explanation)
      for (const o of opts.filter((o) => !o.is_correct)) console.log(`  ${o.key} fails: ${o.why}`)
      console.log()
    }
  },

  /** Flashcard fronts. The back is a separate call, for the same reason `ask` withholds the key. */
  cards() {
    const cs = rows(`SELECT id, domain, task, front FROM flashcards ${where(['domain', 'task', 'id'])} ORDER BY RANDOM() LIMIT ${count}`)
    if (!cs.length) fail('nothing matched that filter')
    for (const c of cs) console.log(`[${c.id}] ${c.domain} ${c.task}  ${c.front}`)
    console.log(`\nids: ${cs.map((c) => c.id).join(',')}`)
  },

  /** The back of one or more cards. */
  card() {
    const ids = positional.length ? positional.join(',') : flags.id
    if (!ids) fail('usage: bank.mjs card <id> [id ...]')
    for (const id of ids.split(',').map((s) => s.trim())) {
      const [c] = rows(`SELECT id, front, back FROM flashcards WHERE id = ${lit(id)}`)
      if (!c) { console.log(`${id}: no such card\n`); continue }
      console.log(`[${c.id}] ${c.front}\n${c.back}\n`)
    }
  },

  /** The reference material the Resources page renders: strategy, tensions, distinctions, scope. */
  doc() {
    const key = positional[0]
    if (!key) {
      console.log(rows('SELECT key FROM docs ORDER BY key').map((r) => r.key).join(', '))
      return
    }
    const [d] = rows(`SELECT json FROM docs WHERE key = ${lit(key)}`)
    if (!d) fail(`no doc ${key}`)
    console.log(JSON.stringify(JSON.parse(d.json), null, 2))
  },
}

if (!command || !commands[command]) {
  console.log(`usage: node ${join('.claude/skills/exam-coach/scripts', 'bank.mjs')} <command>

  stats                          the blueprint and what the bank holds per domain
  tasks [--domain D3]            the task statements, one line each
  task <id>                      one statement with its knowledge, skills and traps
  ask [--domain D3] [--task 3.2] [--scenario S5] [--count 5] [--exclude id,id]
                                 items to put to the learner, without the key
  key <id> [id ...]              the key, the explanation, and why each distractor fails
  cards [--domain D5] [--count 10]   flashcard fronts
  card <id> [id ...]             the backs
  doc [key]                      reference material, or the list of keys`)
  process.exit(command ? 1 : 0)
}

commands[command]()
