// @vitest-environment node
/**
 * Quality audit of the question bank and flashcards, run as a test.
 *
 * The schema's CHECK constraints and foreign keys already make the content
 * structurally valid, so nothing here re-checks that. This checks whether the bank
 * is any GOOD: whether a test-wise candidate could beat it without knowing the
 * material, whether it drifts into topics the exam guide puts out of scope,
 * whether coverage matches the blueprint weights, and whether items duplicate
 * each other.
 *
 * It is a test rather than a script because the guarantee is worth nothing unless
 * something runs it. ERROR findings fail the suite. WARN and INFO findings are
 * printed, because "the correct option is the longest in 21% of items" is the kind
 * of number worth seeing even when it is inside the limit.
 *
 * Node environment, not jsdom: this reads the shipped .sqlite3 file directly.
 */

import { describe, it, expect } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/* ------------------------------------------------------------------ thresholds */
// Tightening these is how you raise the bar on the bank.
const MAX_KEY_SHARE = 0.35 // no answer letter should hold more than this share
const MAX_LONGEST_CORRECT = 0.45 // correct option should not be the longest this often
const MAX_LEN_DELTA = 40 // mean chars the correct option may exceed the distractors by
const DUP_JACCARD = 0.55 // stem token overlap that counts as near-duplicate
const MIN_STEM = 60 // a stem shorter than this cannot be scenario-grounded
const MIN_DISTRACTOR = 25 // a one-liner distractor is usually a throwaway

// Section 17 of the exam guide: topics explicitly excluded. An item that TESTS one
// of these is wasted study time. Incidental mentions are only worth a WARN.
const OUT_OF_SCOPE = {
  // Scoped to the Anthropic streaming API. A scenario that merely mentions a
  // streaming HTTP client is not testing the excluded topic.
  'streaming / SSE':
    /server-sent|\bSSE\b|stream(?:ing)?\s+(?:the\s+)?(?:API\s+)?response|\bstream=True\b|streaming (?:API|endpoint|events|chunks|deltas)/i,
  'vision / images': /\bvision\b|image analysis|\bOCR\b|multimodal image/i,
  'computer use': /computer use|browser automation|desktop interaction/i,
  'prompt caching internals':
    /cache_control|\bephemeral\b|cache breakpoint|cache write|cache read|cache TTL/i,
  'rate limits / pricing math':
    /\bITPM\b|\bOTPM\b|\bRPM\b|rate limit|per million tokens|tokens per minute/i,
  'OAuth / key rotation': /\bOAuth\b|API key rotation|refresh token|bearer token/i,
  'cloud providers': /\bBedrock\b|\bVertex\b|\bAzure\b|AnthropicBedrock|AnthropicVertex/i,
  'fine-tuning / training': /fine-tun|\bRLHF\b|constitutional AI|model weights|training data/i,
  'embeddings / vector DB': /\bembedding|vector database|\bpgvector\b|\bFAISS\b|cosine similarity/i,
  tokenization: /\btokenizer\b|tokenization|BPE\b/i,
}

// Identifiers the exam guide itself names. Anything that LOOKS like a flag or a
// config path but is not on this list is a candidate hallucination.
const KNOWN_IDENTIFIERS = new Set([
  '-p', '--print', '--output-format', '--json-schema', '--resume', '--model', '--verbose',
  '/memory', '/compact', '/clear', '/review',
  '.claude/commands/', '.claude/skills/', '.claude/rules/', '.claude/', '.mcp.json',
  '~/.claude.json', '~/.claude/', 'CLAUDE.md', 'SKILL.md', 'mcp.json', 'claude.json',
  '@import', 'context: fork', 'allowed-tools', 'argument-hint', 'paths:',
  'fork_session', 'allowedTools', 'AgentDefinition', 'Task',
  'PostToolUse', 'PreToolUse', 'stop_reason', 'tool_use', 'tool_result', 'end_turn',
  'tool_choice', 'auto', 'any', 'isError', 'custom_id', 'max_tokens',
  'errorCategory', 'isRetryable', 'retriable', 'detected_pattern',
  'calculated_total', 'stated_total', 'conflict_detected',
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Explore',
  'process_refund', 'get_customer', 'lookup_order', 'escalate_to_human',
  'verify_fact', 'extract_metadata', 'load_document', 'fetch_url',
])

// Things that do NOT exist, and appear on purpose as distractors. The official
// sample questions use several of these, so seeing them is expected; seeing one in
// a KEYED answer is a serious defect.
const KNOWN_FALSE = new Set(['--batch', '.claude/config.json', 'CLAUDE_HEADLESS', '--headless', 'config.json'])

// Rule and standards files under .claude/rules/ are named freely by each project,
// so a bare *.md is an example rather than a claim about a product feature.
const EXAMPLE_FILE_RE = /^[\w.-]+\.md$/
// Any path under .claude/ or a home-relative Claude path is a legitimate shape.
const LEGIT_PATH_RE = /^(?:~\/)?\.claude(?:\/[\w.*-]+)*\/?\.?$|^~\/\.claude\.json$/
const FLAG_RE = /(?<![\w-])--?[a-z][a-z0-9-]{1,24}(?![\w-])/g
const CONFIG_RE = /(?:~\/)?\.claude[\w./*-]*|\b[\w.-]+\.(?:json|md|toml|yaml|yml)\b/g

/* ------------------------------------------------------------------ reporting */

/** @type {{level: string, where: string, msg: string}[]} */
const findings = []
const add = (level, where, msg) => findings.push({ level, where, msg })

// Python's format() rounds halves to even; match it so the two agree exactly.
const fmt0 = (x) => {
  const r = Math.round(x)
  const out = Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0 ? r - Math.sign(x) : r
  return String(out === 0 ? 0 : out)
}
const signed0 = (x) => (x >= 0 ? '+' : '-') + fmt0(Math.abs(x))
const pct0 = (n, d) => fmt0((n / d) * 100)

/* ------------------------------------------------------------------ the data */

const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} })
const db = new sqlite3.oo1.DB(':memory:', 'c')
const image = new Uint8Array(readFileSync(join(root, 'content/ccarf-content.sqlite3')))
const ptr = sqlite3.wasm.allocFromTypedArray(image)
sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', ptr, image.length, image.length,
  sqlite3.capi.SQLITE_DESERIALIZE_READONLY | sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE)

const rows = (sql, bind) => {
  const out = []
  db.exec({ sql, bind, rowMode: 'object', callback: (r) => out.push(r) })
  return out
}

const optionRows = rows('SELECT * FROM options ORDER BY question_id, ord')
const optionsByQuestion = new Map()
for (const o of optionRows) {
  if (!optionsByQuestion.has(o.question_id)) optionsByQuestion.set(o.question_id, [])
  optionsByQuestion.get(o.question_id).push(o)
}

const qs = rows('SELECT * FROM questions ORDER BY id').map((r) => {
  const opts = optionsByQuestion.get(r.id) ?? []
  return {
    ...r,
    options: opts.map((o) => ({ key: o.key, text: o.text })),
    correct: opts.filter((o) => o.is_correct === 1).map((o) => o.key),
    why: Object.fromEntries(opts.filter((o) => o.is_correct === 0).map((o) => [o.key, o.why ?? ''])),
  }
})

const tagRows = rows('SELECT card_id, tag FROM card_tags ORDER BY card_id, ord')
const cards = rows('SELECT * FROM flashcards ORDER BY ord').map((c) => ({
  ...c,
  tags: tagRows.filter((t) => t.card_id === c.id).map((t) => t.tag),
}))

const domains = rows('SELECT * FROM domains ORDER BY ord')
const scenarios = rows('SELECT * FROM scenarios ORDER BY ord')
const taskIds = rows('SELECT id FROM tasks ORDER BY ord').map((t) => t.id)
const meta = JSON.parse(db.selectValue("SELECT json FROM docs WHERE key = 'meta'"))

const blob = (q) =>
  [q.stem, q.explanation, ...q.options.map((o) => o.text), ...Object.values(q.why)].join(' ')

const keyedText = (q) =>
  q.stem + ' ' + q.options.filter((o) => q.correct.includes(o.key)).map((o) => o.text).join(' ')

const counter = (items) => {
  const m = new Map()
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1)
  return m
}

/* ------------------------------------------------------------------ key balance */

function checkKeyBalance() {
  const derived = qs.filter((q) => q.type !== 'multi' && q.correct.length && q.source !== 'official')
  if (!derived.length) return
  const counts = counter(derived.map((q) => q.correct[0]))
  const total = derived.length
  add('INFO', 'key balance', 'derived single-answer items: ' +
    [...'ABCD'].map((k) => `${k}=${counts.get(k) ?? 0} (${pct0(counts.get(k) ?? 0, total)}%)`).join(', '))
  for (const k of 'ABCD') {
    const n = counts.get(k) ?? 0
    if (n / total > MAX_KEY_SHARE) {
      add('ERROR', 'key balance',
        `option ${k} is the answer in ${pct0(n, total)}% of derived items ` +
        `(limit ${fmt0(MAX_KEY_SHARE * 100)}%). Rotate the keys.`)
    }
    if (n === 0) add('ERROR', 'key balance', `option ${k} is never the answer in derived items`)
  }

  // Per domain, because one lazy stretch of the bank can hide inside a balanced
  // total. This was per source file while the bank was a set of JSON files.
  const byDomain = new Map()
  for (const q of derived) {
    if (!byDomain.has(q.domain)) byDomain.set(q.domain, [])
    byDomain.get(q.domain).push(q.correct[0])
  }
  for (const [domain, keys] of [...byDomain].sort()) {
    const c = [...counter(keys)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    const [top, n] = c[0]
    if (n / keys.length > MAX_KEY_SHARE) {
      add('ERROR', domain, `answer key skew: ${top} in ${n}/${keys.length} items`)
    }
  }
}

/* ------------------------------------------------------------------ length bias */

function checkLengthBias() {
  let longestCorrect = 0
  const deltas = []
  for (const q of qs) {
    if (q.options.length !== 4) continue
    const lens = Object.fromEntries(q.options.map((o) => [o.key, o.text.length]))
    const longest = Object.keys(lens).reduce((a, b) => (lens[b] > lens[a] ? b : a))
    if (q.correct.includes(longest)) longestCorrect++
    const cor = Object.entries(lens).filter(([k]) => q.correct.includes(k)).map(([, v]) => v)
    const wrong = Object.entries(lens).filter(([k]) => !q.correct.includes(k)).map(([, v]) => v)
    if (cor.length && wrong.length) {
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
      deltas.push([mean(cor) - mean(wrong), q.id])
    }
  }
  if (!qs.length) return
  const share = longestCorrect / qs.length
  add('INFO', 'length bias',
    `correct option is the longest in ${longestCorrect}/${qs.length} items (${pct0(longestCorrect, qs.length)}%)`)
  if (share > MAX_LONGEST_CORRECT) {
    add('ERROR', 'length bias',
      `${pct0(longestCorrect, qs.length)}% exceeds the ${fmt0(MAX_LONGEST_CORRECT * 100)}% limit; ` +
      'a candidate can guess by picking the longest option')
  }

  deltas.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : -1))
  const med = deltas.length ? deltas[Math.floor(deltas.length / 2)][0] : 0
  add('INFO', 'length bias', `median correct-minus-distractor length: ${signed0(med)} chars`)
  const over = deltas.filter(([d]) => d > MAX_LEN_DELTA)
  if (over.length) {
    add('WARN', 'length bias',
      `${over.length} items where the correct option runs more than ${MAX_LEN_DELTA} chars long. ` +
      `Worst: ${over.slice(0, 10).map(([d, i]) => `${i} (${signed0(d)})`).join(', ')}`)
  }

  // Throwaway distractors read as filler and make the item easier than it looks.
  for (const q of qs) {
    for (const o of q.options) {
      if (!q.correct.includes(o.key) && o.text.length < MIN_DISTRACTOR) {
        add('WARN', q.id, `distractor ${o.key} is only ${o.text.length} chars, likely filler`)
      }
    }
  }
}

/* ------------------------------------------------------------------ out of scope */

function checkOutOfScope() {
  const hits = new Map()
  const push = (label, level, id) => {
    if (!hits.has(label)) hits.set(label, [])
    hits.get(label).push([level, id])
  }
  for (const q of qs) {
    const text = blob(q)
    for (const [label, pat] of Object.entries(OUT_OF_SCOPE)) {
      if (pat.test(text)) {
        // If it appears in the stem or the keyed answer, the item turns on it.
        push(label, pat.test(keyedText(q)) ? 'ERROR' : 'WARN', q.id)
      }
    }
  }
  for (const c of cards) {
    const text = c.front + ' ' + c.back
    for (const [label, pat] of Object.entries(OUT_OF_SCOPE)) {
      if (pat.test(text)) push(label, 'ERROR', c.id)
    }
  }
  for (const [label, items] of [...hits].sort()) {
    const errs = items.filter(([l]) => l === 'ERROR').map(([, i]) => i)
    const warns = items.filter(([l]) => l === 'WARN').map(([, i]) => i)
    if (errs.length) add('ERROR', 'out of scope', `${label} is tested by: ${errs.slice(0, 12).join(', ')}`)
    if (warns.length) add('WARN', 'out of scope', `${label} mentioned in a distractor: ${warns.slice(0, 12).join(', ')}`)
  }
  if (!hits.size) add('INFO', 'out of scope', 'no excluded topics detected')
}

/* --------------------------------------------------------- invented identifiers */

/**
 * Flag anything shaped like a CLI flag or config file that the guide never names.
 *
 * Two distinct failures matter. A fabricated identifier presented as real teaches
 * the candidate something false. A known-false identifier is fine as a distractor,
 * and a defect if it is ever the keyed answer.
 */
function checkInventedIdentifiers() {
  const suspects = new Map()
  const bump = (t) => suspects.set(t, (suspects.get(t) ?? 0) + 1)

  const tokens = (text) =>
    new Set([...(text.match(FLAG_RE) ?? []), ...(text.match(CONFIG_RE) ?? [])]
      .map((m) => m.trim().replace(/\.+$/, '')))

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const NEAR =
    '(?:does not exist|do not exist|is not a|are not|not a real|no such|is wrong|are all wrong|does not|non-existent|nonexistent|invented|fictional|not a Claude Code feature|is not)'
  /** True when the text says this identifier is fake, which is the right thing to teach. */
  const denied = (text, tok) =>
    new RegExp(escape(tok) + '.{0,90}?' + NEAR, 'is').test(text) ||
    new RegExp(NEAR + '.{0,90}?' + escape(tok), 'is').test(text)

  for (const q of qs) {
    const full = blob(q)
    for (const tok of tokens(keyedText(q))) {
      if (KNOWN_FALSE.has(tok) && !denied(full, tok)) {
        add('ERROR', q.id, `'${tok}' does not exist and is presented as real in the stem or keyed answer`)
      }
    }
    for (const tok of tokens(full)) {
      if (KNOWN_IDENTIFIERS.has(tok) || KNOWN_FALSE.has(tok) ||
          LEGIT_PATH_RE.test(tok) || EXAMPLE_FILE_RE.test(tok)) continue
      bump(tok)
    }
  }

  for (const c of cards) {
    const text = c.front + ' ' + c.back
    for (const tok of tokens(text)) {
      if (KNOWN_FALSE.has(tok)) {
        if (!denied(text, tok)) add('ERROR', c.id, `'${tok}' does not exist but the card does not say so`)
      } else if (!KNOWN_IDENTIFIERS.has(tok) && !LEGIT_PATH_RE.test(tok) && !EXAMPLE_FILE_RE.test(tok)) {
        bump(tok)
      }
    }
  }

  if (suspects.size) {
    const top = [...suspects].sort((a, b) => b[1] - a[1]).slice(0, 15)
    add('WARN', 'identifiers',
      'outside the guide\'s known set, confirm each is real or a deliberate distractor: ' +
      top.map(([t, n]) => `${t} x${n}`).join(', '))
  } else {
    add('INFO', 'identifiers', 'every flag and config path is either known-real or a known distractor')
  }
}

/* ------------------------------------------------------------------ duplication */

function checkDuplicates() {
  const toks = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean))
  const cache = qs.map((q) => [q, toks(q.stem)])
  const pairs = []
  for (let i = 0; i < cache.length; i++) {
    for (let j = i + 1; j < cache.length; j++) {
      const [a, ta] = cache[i]
      const [b, tb] = cache[j]
      if (!ta.size || !tb.size) continue
      let inter = 0
      for (const t of ta) if (tb.has(t)) inter++
      const jac = inter / (ta.size + tb.size - inter)
      if (jac > DUP_JACCARD) pairs.push([Math.round(jac * 100) / 100, a.id, b.id])
    }
  }
  pairs.sort((x, y) => y[0] - x[0])
  if (pairs.length) {
    add('WARN', 'duplication',
      `${pairs.length} near-duplicate stem pair(s): ` +
      pairs.slice(0, 10).map(([j, x, y]) => `${x}~${y} (${j})`).join('; '))
  } else {
    add('INFO', 'duplication', 'no near-duplicate stems')
  }

  // Identical option text inside one item makes two answers indistinguishable.
  for (const q of qs) {
    const texts = q.options.map((o) => o.text.trim().toLowerCase())
    if (new Set(texts).size !== texts.length) add('ERROR', q.id, 'two options have identical text')
  }
}

/* ------------------------------------------------------------------ coverage */

function checkCoverage() {
  const items = meta.items
  const byDom = counter(qs.map((q) => q.domain))
  add('INFO', 'coverage', `${qs.length} questions, ${cards.length} cards`)

  for (const d of domains) {
    const draw = Math.round((items * d.weight) / 100)
    const have = byDom.get(d.id) ?? 0
    const ratio = draw ? have / draw : 0
    const note = `${d.id} ${d.weight}%: ${have} questions for a draw of ${draw} (${ratio.toFixed(1)}x)`
    if (ratio < 1.5) add('ERROR', 'coverage', note + ' — too few to avoid heavy repetition across attempts')
    else if (ratio < 2.5) add('WARN', 'coverage', note + ' — thin, attempts will overlap noticeably')
    else add('INFO', 'coverage', note)
  }

  if (qs.length < items * 2) {
    add('WARN', 'coverage',
      `${qs.length} questions for a ${items}-item exam means about ${pct0(items, qs.length)}% ` +
      'of the bank appears in every attempt')
  }

  const byTask = counter(qs.map((q) => q.task))
  const missing = taskIds.filter((t) => (byTask.get(t) ?? 0) === 0)
  const thin = taskIds.filter((t) => (byTask.get(t) ?? 0) < 3)
  if (missing.length) add('ERROR', 'coverage', `task statements with no questions: ${missing.join(', ')}`)
  if (thin.length) add('WARN', 'coverage', `task statements with fewer than 3 questions: ${thin.join(', ')}`)

  const byScen = counter(qs.map((q) => q.scenario))
  add('INFO', 'coverage', 'per scenario: ' +
    scenarios.map((s) => `${s.id}=${byScen.get(s.id) ?? 0}`).join(', '))
  for (const s of scenarios) {
    const n = byScen.get(s.id) ?? 0
    if (n < 12) {
      add('WARN', 'coverage',
        `scenario ${s.id} has only ${n} questions; a draw including it will lean on the same items`)
    }
  }

  const multi = qs.filter((q) => q.type === 'multi').length
  add('INFO', 'format', `multiple-response items: ${multi}/${qs.length} (${pct0(multi, qs.length)}%)`)
  const share = (multi / qs.length) * 100
  if (!(share >= 8 && share <= 30)) {
    add('WARN', 'format', 'multiple-response share is outside the 8-30% band the real exam suggests')
  }
}

/* ------------------------------------------------------------------ prose */

function checkProse() {
  for (const item of [...qs, ...cards]) {
    const text = JSON.stringify(item)
    if (text.includes('—')) add('WARN', item.id, 'contains an em dash (house style bans them)')
    if ((item.stem ?? '').includes('  ')) add('WARN', item.id, 'double space in stem')
  }

  const short = qs.filter((q) => q.stem.length < MIN_STEM).map((q) => q.id)
  if (short.length) {
    add('WARN', 'stems',
      `${short.length} stems under ${MIN_STEM} chars, likely not scenario-grounded: ` +
      short.slice(0, 12).join(', '))
  }

  // An explanation naming an option letter breaks if the options are reshuffled.
  const letter = qs.filter((q) =>
    /\b(?:Option|Options|Answer)\s+[A-D]\b/.test(q.explanation + ' ' + Object.values(q.why).join(' ')),
  ).map((q) => q.id)
  if (letter.length) {
    add('WARN', 'explanations',
      `${letter.length} explanations name an option letter, which breaks under reshuffling: ` +
      letter.slice(0, 12).join(', '))
  }

  // Cards whose back is a long list are hard to self-grade.
  for (const c of cards) {
    const back = c.back
    const count = (s, ch) => s.split(ch).length - 1
    if (count(back, ',') >= 4 || count(back, ';') >= 3) {
      add('WARN', c.id, 'card back reads as a list; consider splitting it')
    }
    if (back.length > 400) add('WARN', c.id, `card back is ${back.length} chars, too long to recall`)
  }
}

/* ------------------------------------------------------------------ the suite */

/** Run one check in isolation and hand back what it found. */
function run(fn) {
  findings.length = 0
  fn()
  return {
    errors: findings.filter((f) => f.level === 'ERROR'),
    notes: findings.filter((f) => f.level !== 'ERROR'),
  }
}

/**
 * @param {string} name
 * @param {() => void} check
 */
function audits(name, check) {
  it(name, () => {
    const { errors, notes } = run(check)
    for (const n of notes) console.log(`  ${n.level.padEnd(5)} ${n.where.padEnd(16)} ${n.msg}`)
    expect(errors.map((e) => `${e.where}: ${e.msg}`)).toEqual([])
  })
}

describe('question bank', () => {
  it('holds the whole blueprint', () => {
    expect(qs.length).toBe(279)
    expect(cards.length).toBe(140)
    expect(taskIds.length).toBe(30)
    expect(domains.length).toBe(5)
    expect(scenarios.length).toBe(6)
  })

  it('ships the official samples unaltered and marked', () => {
    const official = qs.filter((q) => q.source === 'official')
    expect(official.length).toBe(12)
  })

  it('is read-only', () => {
    expect(() => db.exec("UPDATE questions SET stem = 'tampered'")).toThrow(/readonly/i)
  })

  audits('keeps the answer key evenly spread', checkKeyBalance)
  audits('does not let the correct option be the longest', checkLengthBias)
  audits('tests nothing the guide puts out of scope', checkOutOfScope)
  audits('invents no flags or config paths', checkInventedIdentifiers)
  audits('has no duplicate stems or options', checkDuplicates)
  audits('covers every domain and task statement', checkCoverage)
  audits('follows the house style', checkProse)
})
