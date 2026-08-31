/**
 * Reactive mirror of the progress database.
 *
 * SQLite reads are async, and Svelte templates are not. So the app keeps a small
 * reactive snapshot in memory, writes go straight to the database, and the
 * relevant slice of the snapshot is refreshed afterwards. Nothing else caches.
 *
 * The review and drill lists are part of that snapshot. Which questions count as
 * missed, shaky, flagged or unseen is decided by a join in SQL rather than by
 * filtering an array here, and the ids it returns are what the lists below hand
 * back as questions.
 */

import * as q from '$lib/db/queries.js'
import { backend, isPersistent, sizeBytes, contentInfo } from '$lib/db/index.js'
import { loadContent, tasks, flashcards, questionById, domains, LEITNER_DAYS } from '$lib/content.js'
import { DAY_MS, pct, today } from '$lib/util.js'

class Progress {
  /** @type {Set<string>} */ read = $state(new Set())
  /** @type {Set<string>} */ practice = $state(new Set())
  /** @type {Map<string, any>} */ cards = $state(new Map())
  /** @type {Map<string, any>} */ answers = $state(new Map())
  /** @type {Set<string>} */ flags = $state(new Set())
  /** @type {any[]} */ attempts = $state([])
  /** @type {Record<string, any>} */ byDomain = $state({})
  totals = $state({ answered: 0, correct: 0, accuracy: 0 })

  /** Question ids per review scope, chosen in SQL. */
  /** @type {{missed: string[], shaky: string[], flagged: string[], unseen: string[]}} */
  selection = $state({ missed: [], shaky: [], flagged: [], unseen: [] })
  /** What was picked the last time each question was seen. */
  /** @type {Map<string, {selected: string[], correct: boolean, at: number}>} */
  lastPicks = $state(new Map())

  ready = $state(false)
  storage = $state({ backend: 'memory', persistent: false, bytes: 0 })
  /** @type {Record<string, string>} */
  content = $state({})
  shuffleOptions = $state(true)

  async load() {
    // The content database has to be read before anything that maps a question id
    // back to a question, which is most of what follows.
    await loadContent()

    const [read, cards, answers, flags, attempts, byDomain, totals, selection, lastPicks] =
      await Promise.all([
        q.readTasks(), q.cardStates(), q.questionStats(), q.flaggedQuestions(),
        q.attemptHistory(), q.domainStats(), q.answerTotals(),
        q.questionSelection(), q.lastSelections(),
      ])
    this.practice = await q.practiceDone()
    this.read = read
    this.cards = cards
    this.answers = answers
    this.flags = flags
    this.attempts = attempts
    this.byDomain = byDomain
    this.totals = totals
    this.selection = selection
    this.lastPicks = lastPicks

    this.shuffleOptions = (await q.setting('shuffleOptions', '1')) === '1'
    this.storage = {
      backend: await backend(),
      persistent: await isPersistent(),
      bytes: await sizeBytes(),
    }
    this.content = await contentInfo()
    this.ready = true
  }

  async refreshAnswers() {
    const [answers, byDomain, totals, selection, lastPicks] = await Promise.all([
      q.questionStats(), q.domainStats(), q.answerTotals(),
      q.questionSelection(), q.lastSelections(),
    ])
    this.answers = answers
    this.byDomain = byDomain
    this.totals = totals
    this.selection = selection
    this.lastPicks = lastPicks
  }

  /* ---------------------------------------------------------------- reading */

  /** @param {{id: string, domain: string}} task */
  async toggleRead(task) {
    const next = !this.read.has(task.id)
    await q.setRead(task.id, task.domain, next)
    const s = new Set(this.read)
    next ? s.add(task.id) : s.delete(task.id)
    this.read = s
  }

  /** @param {{id: string, domain: string}[]} list @param {boolean} value */
  async setReadBulk(list, value) {
    await q.setReadBulk(list, value)
    const s = new Set(this.read)
    for (const t of list) (value ? s.add(t.id) : s.delete(t.id))
    this.read = s
  }

  /* ---------------------------------------------------------------- practice */

  /**
   * @param {string} itemId
   * @param {'prep' | 'exercise'} kind
   */
  async togglePractice(itemId, kind) {
    const next = !this.practice.has(itemId)
    await q.setPractice(itemId, kind, next)
    const s = new Set(this.practice)
    next ? s.add(itemId) : s.delete(itemId)
    this.practice = s
  }

  /** @param {string[]} ids */
  practiceSummary(ids) {
    const done = ids.filter((id) => this.practice.has(id)).length
    return { done, total: ids.length, pct: pct(done, ids.length) }
  }

  /* ---------------------------------------------------------------- cards */

  /** @param {{id: string, domain: string}} card @param {'again'|'hard'|'good'} grade */
  async gradeCard(card, grade) {
    await q.gradeCard(card, grade, LEITNER_DAYS, DAY_MS)
    this.cards = await q.cardStates()
  }

  /** @param {string} [domain] */
  dueCards(domain) {
    const t = today()
    return flashcards.filter(
      (c) => (!domain || c.domain === domain) && (this.cards.get(c.id)?.dueAt ?? 0) <= t,
    )
  }

  /** @param {string} [domain] */
  cardSummary(domain) {
    const pool = domain ? flashcards.filter((c) => c.domain === domain) : flashcards
    const t = today()
    const boxes = Array(LEITNER_DAYS.length).fill(0)
    let due = 0
    let learned = 0
    for (const c of pool) {
      const st = this.cards.get(c.id)
      const box = st?.box ?? 0
      boxes[box]++
      if ((st?.dueAt ?? 0) <= t) due++
      if (box >= 3) learned++
    }
    return { total: pool.length, due, learned, boxes }
  }

  /* ---------------------------------------------------------------- answers */

  /**
   * @param {any} question
   * @param {string[]} selected
   * @param {boolean} correct
   * @param {'quiz'|'exam'|'review'} mode
   * @param {number|null} [attemptId]
   * @param {number|null} [elapsedMs]
   */
  async recordAnswer(question, selected, correct, mode, attemptId = null, elapsedMs = null) {
    await q.recordAnswer(question, selected, correct, mode, attemptId, elapsedMs)
    if (mode !== 'exam') await this.refreshAnswers()
  }

  /** @param {string} questionId */
  async toggleFlag(questionId) {
    const next = !this.flags.has(questionId)
    await q.setFlag(questionId, next)
    const s = new Set(this.flags)
    next ? s.add(questionId) : s.delete(questionId)
    this.flags = s
    this.selection = await q.questionSelection()
  }

  async clearFlags() {
    await q.clearFlags()
    this.flags = new Set()
    this.selection = { ...this.selection, flagged: [] }
  }

  /* ---------------------------------------------------------------- settings */

  /** @param {boolean} value */
  async setShuffle(value) {
    this.shuffleOptions = value
    await q.setSetting('shuffleOptions', value ? '1' : '0')
  }

  /* ---------------------------------------------------------------- derived */

  /** @param {string} domainId */
  domainProgress(domainId) {
    const domainTasks = tasks.filter((t) => t.domain === domainId)
    const readCount = domainTasks.filter((t) => this.read.has(t.id)).length
    const cards = this.cardSummary(domainId)
    const stats = this.byDomain[domainId] ?? { answered: 0, correct: 0, accuracy: 0 }
    return {
      read: readCount,
      readTotal: domainTasks.length,
      readPct: pct(readCount, domainTasks.length),
      cards,
      answered: stats.answered,
      accuracy: Math.round(stats.accuracy),
    }
  }

  readSummary() {
    const done = tasks.filter((t) => this.read.has(t.id)).length
    return { done, total: tasks.length, pct: pct(done, tasks.length) }
  }

  /**
   * A single number for "how ready am I". Coverage of the blueprint, retention of
   * the cards, and accuracy on questions, weighted 30/30/40. Accuracy is damped
   * until at least 20 answers exist so an early lucky run does not flatter you.
   */
  readiness() {
    const coverage = this.readSummary().pct
    const cards = this.cardSummary()
    const retention = pct(cards.learned, cards.total)
    const { answered, accuracy } = this.totals
    const damped = answered >= 20 ? accuracy : Math.round(accuracy * (answered / 20))
    return {
      score: Math.round(coverage * 0.3 + retention * 0.3 + damped * 0.4),
      coverage,
      retention,
      accuracy: damped,
    }
  }

  /**
   * The four review scopes. The choosing and the ordering happened in SQL; this
   * only turns ids back into questions.
   * @param {'missed' | 'shaky' | 'flagged' | 'unseen'} scope
   */
  scopedQuestions(scope) {
    return this.selection[scope].map((id) => questionById[id]).filter(Boolean)
  }

  /** Questions whose most recent answer was wrong. */
  missedQuestions() {
    return this.scopedQuestions('missed')
  }

  /** Answered both right and wrong at different times: the real soft spots. */
  shakyQuestions() {
    return this.scopedQuestions('shaky')
  }

  flaggedQuestions() {
    return this.scopedQuestions('flagged')
  }

  unseenQuestions() {
    return this.scopedQuestions('unseen')
  }

  /** What the learner picked last time, for a question they have seen. */
  /** @param {string} questionId */
  lastPick(questionId) {
    return this.lastPicks.get(questionId) ?? null
  }

  /** What to do next, ordered by whichever signal is weakest. */
  recommendations() {
    /** @type {{text: string, href: string, cta: string}[]} */
    const out = []

    const weakRead = domains
      .map((d) => ({ d, p: this.domainProgress(d.id) }))
      .filter((x) => x.p.readPct < 100)
      .sort((a, b) => a.p.readPct - b.p.readPct)[0]
    if (weakRead) {
      out.push({
        text: `Finish reading <b>${weakRead.d.name}</b>, ${weakRead.p.read} of ${weakRead.p.readTotal} done.`,
        href: `#/study/${weakRead.d.id}`,
        cta: 'Open',
      })
    }

    const due = this.cardSummary().due
    if (due > 0) {
      out.push({
        text: `<b>${due} flashcard${due === 1 ? '' : 's'}</b> due for review today.`,
        href: '#/cards',
        cta: 'Review',
      })
    }

    const weakDomain = domains
      .map((d) => ({ d, s: this.byDomain[d.id] }))
      .filter((x) => x.s && x.s.answered >= 5)
      .sort((a, b) => a.s.accuracy - b.s.accuracy)[0]
    if (weakDomain && weakDomain.s.accuracy < 75) {
      out.push({
        text: `Accuracy in <b>${weakDomain.d.name}</b> is ${Math.round(weakDomain.s.accuracy)}%.`,
        href: `#/quiz?domain=${weakDomain.d.id}`,
        cta: 'Drill it',
      })
    }

    const missed = this.missedQuestions().length
    if (missed >= 5) {
      out.push({
        text: `<b>${missed} questions</b> you last answered wrong are waiting.`,
        href: '#/review',
        cta: 'Review them',
      })
    }

    const cards = this.cardSummary()
    if (this.readSummary().pct >= 80 && cards.learned / cards.total > 0.5) {
      out.push({ text: 'You have the coverage for a full timed run.', href: '#/exam', cta: 'Sit a mock' })
    }

    if (!out.length) {
      out.push({ text: 'Start anywhere. The study material follows the blueprint.', href: '#/study', cta: 'Open' })
    }
    return out
  }
}

export const progress = new Progress()
