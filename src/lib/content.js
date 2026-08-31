/**
 * Study content: the blueprint, the questions, the flashcards.
 *
 * This is static data that ships with the app and is identical for every user.
 * It is imported at build time, not fetched, so there is no loading state and no
 * network dependency. Progress is the only thing that lives in the database.
 */

import exam from '$content/exam.json'
import objectives from '$content/objectives.json'
import context from '$content/context.json'
import flashcards from '$content/flashcards.json'

// Every bank under content/questions/ is picked up automatically, so adding
// d6.json needs no code change.
/** @type {Record<string, any>} */
const banks = import.meta.glob('$content/questions/*.json', { eager: true, import: 'default' })

/** @type {any[]} */
export const questions = Object.keys(banks)
  .sort()
  .flatMap((path) => banks[path])

export { exam, objectives, context, flashcards }

/** @type {any[]} */
export const domains = exam.domains
/** @type {any[]} */
export const scenarios = exam.scenarios
export const meta = exam.meta

/** @type {Record<string, any>} */
export const domainById = Object.fromEntries(domains.map((d) => [d.id, d]))
/** @type {Record<string, any>} */
export const scenarioById = Object.fromEntries(scenarios.map((s) => [s.id, s]))
/** @type {Record<string, any>} */
export const questionById = Object.fromEntries(questions.map((q) => [q.id, q]))
/** @type {Record<string, any>} */
export const cardById = Object.fromEntries(flashcards.map((c) => [c.id, c]))

/** Every task statement, flattened, with its domain attached. */
/** @type {Record<string, any>} */
const objectivesByDomain = objectives

/** @type {any[]} */
export const tasks = domains.flatMap((d) =>
  (objectivesByDomain[d.id] ?? []).map((/** @type {any} */ t) => ({ ...t, domain: d.id })),
)
/** @type {Record<string, any>} */
export const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]))

/** Questions grouped by the things the UI filters on. */
export const questionsByDomain = groupBy(questions, (q) => q.domain)
export const questionsByTask = groupBy(questions, (q) => q.task)
export const questionsByScenario = groupBy(questions, (q) => q.scenario)
export const cardsByDomain = groupBy(flashcards, (c) => c.domain)

/**
 * @param {any[]} items
 * @param {(item: any) => string} key
 * @returns {Record<string, any[]>}
 */
function groupBy(items, key) {
  /** @type {Record<string, any[]>} */
  const out = {}
  for (const item of items) {
    const k = key(item)
    ;(out[k] ??= []).push(item)
  }
  return out
}

/** Leitner intervals in days, indexed by box. Box 0 is "due today". */
export const LEITNER_DAYS = [0, 1, 3, 7, 21, 60]

/** How many items the mock draws from each domain, following the blueprint. */
export const examBlueprint = (() => {
  /** @type {Record<string, number>} */
  const target = {}
  let assigned = 0
  domains.forEach((d, i) => {
    const n =
      i === domains.length - 1 ? meta.items - assigned : Math.round((meta.items * d.weight) / 100)
    target[d.id] = n
    assigned += n
  })
  return target
})()
