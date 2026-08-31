/** Small helpers with no framework or database dependency, so they are trivially testable. */

export const DAY_MS = 86_400_000

/** Midnight today, local time. Card due dates are day-granular. */
export function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Deterministic 32-bit hash, used to seed shuffles from a string.
 * @param {string} str
 */
export function seedFrom(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Fisher-Yates. With a seed the result is reproducible, which is what keeps a
 * question's option order stable while you are looking at it.
 * @template T
 * @param {T[]} arr
 * @param {number} [seed]
 * @returns {T[]}
 */
export function shuffle(arr, seed) {
  const a = arr.slice()
  let s = seed ?? Math.floor(Math.random() * 1e9)
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Present a question's options in a shuffled order so answer position is never a
 * cue, while keeping that order stable for a given question within a sitting.
 *
 * Returns options relabelled A-D in display order. `src` on each option is the
 * key the content file uses; everything outside the view layer works in source
 * keys, so scoring never has to know about the shuffle.
 *
 * @param {{ id: string, options: {key: string, text: string}[] }} q
 * @param {string} salt
 * @param {boolean} [enabled]
 */
export function presentOptions(q, salt, enabled = true) {
  if (!enabled) {
    return {
      options: q.options.map((o) => ({ ...o, src: o.key })),
      toShown: (/** @type {string} */ k) => k,
    }
  }
  const order = shuffle(q.options.map((o) => o.key), seedFrom(q.id + ':' + salt))
  /** @type {Record<string, string>} */
  const toShown = {}
  const options = order.map((srcKey, i) => {
    const shownKey = 'ABCD'[i]
    toShown[srcKey] = shownKey
    const source = q.options.find((o) => o.key === srcKey)
    return { key: shownKey, src: srcKey, text: source ? source.text : '' }
  })
  return { options, toShown: (/** @type {string} */ k) => toShown[k] ?? k }
}

/**
 * Did the selection match the key exactly? Multiple-response items are
 * all-or-nothing, as the real exam states.
 * @param {string[]} selected
 * @param {string[]} correct
 */
export function isCorrect(selected, correct) {
  return selected.length === correct.length && selected.every((k) => correct.includes(k))
}

/**
 * Approximate the scaled score.
 *
 * Anthropic publishes the cut score (720 on 100-1000) but not the mapping from
 * raw correct answers to scaled points, so this anchors 720 at 70% correct and
 * interpolates linearly either side. Treat it as a signal, not a prediction.
 *
 * @param {number} correct
 * @param {number} total
 */
export function scaledScore(correct, total) {
  const p = total ? correct / total : 0
  const CUT_P = 0.7
  const CUT_S = 720
  const v = p >= CUT_P ? CUT_S + ((p - CUT_P) / (1 - CUT_P)) * (1000 - CUT_S) : 100 + (p / CUT_P) * (CUT_S - 100)
  return Math.round(v)
}

/** @param {number} n @param {number} d */
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

/** @param {number} ms */
export function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** @param {number} ts */
export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** @type {Record<string, string>} */
const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/**
 * Escape HTML, then wrap technical identifiers in <code>. Content is authored as
 * plain text; this is what makes `stop_reason` and `.claude/rules/` read like code
 * without the JSON carrying markup.
 * @param {string} s
 */
export function richText(s) {
  const escaped = String(s ?? '').replace(/[&<>"]/g, (c) => ESCAPE[c])
  return escaped.replace(
    /(`[^`]+`)|(\b(?:stop_reason|tool_choice|tool_use|tool_result|end_turn|custom_id|isError|isRetryable|errorCategory|allowedTools|fork_session|PostToolUse|PreToolUse|AgentDefinition|max_tokens|argument-hint|allowed-tools|retriable|detected_pattern|calculated_total|stated_total|conflict_detected|selectCount|Pydantic)\b)|(--?[a-z][a-z-]{1,22})|((?:~\/|\.)?[\w.~/-]*\.(?:json|md|tsx|ts|js|py|jsonl|sql))|(\.claude\/[\w./*-]+)|(\bcontext: fork\b)/g,
    (m) => `<code>${m.replace(/^`|`$/g, '')}</code>`,
  )
}
