/**
 * Study content, read from the content database.
 *
 * The material ships as a SQLite file that is ATTACHed read-only beside the
 * progress database (see db/worker.js). This module runs the handful of queries
 * that shape it back into the objects the views render, once, at boot.
 *
 * The exports are module bindings assigned by `loadContent()` rather than
 * constants, because a query cannot run at import time. Nothing reads them before
 * `loadContent()` resolves: App.svelte holds every view back until the store is
 * ready, and the store loads content first.
 *
 * Reference material stays here after that first load. It is a query result, not
 * a second copy of the data, and holding it is what lets Svelte templates read it
 * synchronously. Anything that depends on progress is queried when it is needed,
 * because that belongs in SQL where it can join.
 */

import { all } from '$lib/db/index.js'

/* --------------------------------------------------------------- the exports */

/** @type {any} the blueprint: meta, domains, scenarios and the guide's reference material */
export let exam = {}
/** @type {any} researched context, explicitly not the guide */
export let context = {}
/** @type {any[]} */
export let domains = []
/** @type {any[]} */
export let scenarios = []
/** @type {any} at-a-glance numbers: items, time limit, pass mark, fee */
export let meta = {}
/** @type {any[]} all 30 task statements, flattened, with their domain attached */
export let tasks = []
/** @type {any[]} */
export let flashcards = []
/** @type {any[]} */
export let questions = []

/** @type {Record<string, any>} */
export let domainById = {}
/** @type {Record<string, any>} */
export let scenarioById = {}
/** @type {Record<string, any>} */
export let taskById = {}
/** @type {Record<string, any>} */
export let cardById = {}
/** @type {Record<string, any>} */
export let questionById = {}

/** @type {Record<string, any[]>} */
export let questionsByDomain = {}
/** @type {Record<string, any[]>} */
export let questionsByTask = {}
/** @type {Record<string, any[]>} */
export let questionsByScenario = {}
/** @type {Record<string, any[]>} */
export let cardsByDomain = {}

/** How many items the mock draws from each domain, following the blueprint. */
/** @type {Record<string, number>} */
export let examBlueprint = {}

/** Leitner intervals in days, indexed by box. Box 0 is "due today". */
export const LEITNER_DAYS = [0, 1, 3, 7, 21, 60]

/* ---------------------------------------------------------------- the loader */

/**
 * Read the content database and shape it into the objects above.
 *
 * Ten queries rather than one join per view: the child rows (options, bullets,
 * tags) are fetched whole and grouped in JS, which is one round trip to the
 * worker each instead of one per parent row.
 */
export async function loadContent() {
  const [
    domainRows, scenarioRows, scenarioDomains, scenarioProps,
    taskRows, bulletRows, questionRows, optionRows, cardRows, tagRows, docRows,
  ] = await Promise.all([
    all('SELECT * FROM content.domains ORDER BY ord'),
    all('SELECT * FROM content.scenarios ORDER BY ord'),
    all('SELECT scenario_id, domain_id FROM content.scenario_domains ORDER BY scenario_id, ord'),
    all('SELECT scenario_id, text FROM content.scenario_props ORDER BY scenario_id, ord'),
    all('SELECT * FROM content.tasks ORDER BY ord'),
    all('SELECT task_id, kind, text FROM content.task_bullets ORDER BY task_id, ord'),
    all('SELECT * FROM content.questions ORDER BY id'),
    all('SELECT question_id, key, text, is_correct, why FROM content.options ORDER BY question_id, ord'),
    all('SELECT * FROM content.flashcards ORDER BY ord'),
    all('SELECT card_id, tag FROM content.card_tags ORDER BY card_id, ord'),
    all('SELECT key, json FROM content.docs'),
  ])

  const docs = Object.fromEntries(docRows.map((r) => [r.key, JSON.parse(r.json)]))
  context = docs.context
  meta = docs.meta

  domains = domainRows.map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    weight: Number(r.weight),
    color: r.color,
    blurb: r.blurb,
    expectedItems: Number(r.expected_items),
  }))

  const scenarioDomainsById = groupValues(scenarioDomains, (r) => r.scenario_id, (r) => r.domain_id)
  const scenarioPropsById = groupValues(scenarioProps, (r) => r.scenario_id, (r) => r.text)
  scenarios = scenarioRows.map((r) => ({
    id: r.id,
    title: r.title,
    narrative: r.narrative,
    primaryDomains: scenarioDomainsById[r.id] ?? [],
    keyProps: scenarioPropsById[r.id] ?? [],
  }))

  // Bullets arrive in one list and split three ways by `kind`.
  /** @type {Record<string, Record<string, string[]>>} */
  const bulletsByTask = {}
  for (const b of bulletRows) {
    const kinds = (bulletsByTask[b.task_id] ??= {})
    ;(kinds[b.kind] ??= []).push(b.text)
  }
  tasks = taskRows.map((r) => ({
    id: r.id,
    domain: r.domain,
    title: r.title,
    keyIdea: r.key_idea,
    knowledge: bulletsByTask[r.id]?.knowledge ?? [],
    skills: bulletsByTask[r.id]?.skills ?? [],
    traps: bulletsByTask[r.id]?.traps ?? [],
  }))

  // A question's options, the keys that are correct, and the reason each of the
  // others fails. Everything outside the view layer works in these source keys;
  // presentOptions() is the only thing that relabels them.
  /** @type {Record<string, any[]>} */
  const optionsByQuestion = {}
  for (const o of optionRows) (optionsByQuestion[o.question_id] ??= []).push(o)
  questions = questionRows.map((r) => {
    const opts = optionsByQuestion[r.id] ?? []
    /** @type {Record<string, string>} */
    const why = {}
    for (const o of opts) if (Number(o.is_correct) === 0 && o.why != null) why[o.key] = o.why
    return {
      id: r.id,
      domain: r.domain,
      task: r.task,
      scenario: r.scenario ?? undefined,
      type: r.type,
      selectCount: r.select_count == null ? undefined : Number(r.select_count),
      source: r.source,
      stem: r.stem,
      explanation: r.explanation,
      options: opts.map((o) => ({ key: o.key, text: o.text })),
      correct: opts.filter((o) => Number(o.is_correct) === 1).map((o) => o.key),
      why,
    }
  })

  const tagsByCard = groupValues(tagRows, (r) => r.card_id, (r) => r.tag)
  flashcards = cardRows.map((r) => ({
    id: r.id,
    domain: r.domain,
    task: r.task,
    front: r.front,
    back: r.back,
    tags: tagsByCard[r.id] ?? [],
  }))

  // The guide's reference material, rebuilt as one object so the views that read
  // it whole are unchanged by where it now comes from.
  exam = { meta, domains, scenarios, ...docs }
  delete exam.context

  domainById = byId(domains)
  scenarioById = byId(scenarios)
  taskById = byId(tasks)
  cardById = byId(flashcards)
  questionById = byId(questions)

  questionsByDomain = groupBy(questions, (q) => q.domain)
  questionsByTask = groupBy(questions, (q) => q.task)
  questionsByScenario = groupBy(questions, (q) => q.scenario)
  cardsByDomain = groupBy(flashcards, (c) => c.domain)

  examBlueprint = buildBlueprint()
}

/* --------------------------------------------------------------- small helpers */

/**
 * @param {any[]} items
 * @returns {Record<string, any>}
 */
function byId(items) {
  return Object.fromEntries(items.map((x) => [x.id, x]))
}

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
    if (k == null) continue
    ;(out[k] ??= []).push(item)
  }
  return out
}

/**
 * @param {any[]} rows
 * @param {(row: any) => string} key
 * @param {(row: any) => any} value
 * @returns {Record<string, any[]>}
 */
function groupValues(rows, key, value) {
  /** @type {Record<string, any[]>} */
  const out = {}
  for (const row of rows) (out[key(row)] ??= []).push(value(row))
  return out
}

/**
 * Items per domain in a mock paper. Rounded to the blueprint weights, with the
 * last domain taking the remainder so the total is exactly meta.items.
 */
function buildBlueprint() {
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
}
