/**
 * Every SQL statement the app runs lives here.
 *
 * Components call these functions and never touch `db` directly, so the schema
 * has exactly one consumer and a schema change has exactly one place to look.
 */

import { all, get, run, value, transaction } from './index.js'

const now = () => Date.now()

/* ------------------------------------------------------------------ reading */

/** @returns {Promise<Set<string>>} task ids marked as understood */
export async function readTasks() {
  const rows = await all('SELECT task_id FROM reading')
  return new Set(rows.map((r) => r.task_id))
}

/**
 * @param {string} taskId
 * @param {string} domain
 * @param {boolean} read
 */
export async function setRead(taskId, domain, read) {
  if (read) {
    await run(
      'INSERT INTO reading (task_id, domain, read_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT (task_id) DO UPDATE SET read_at = excluded.read_at',
      [taskId, domain, now()],
    )
  } else {
    await run('DELETE FROM reading WHERE task_id = ?', [taskId])
  }
}

/**
 * @param {{ id: string, domain: string }[]} tasks
 * @param {boolean} read
 */
export async function setReadBulk(tasks, read) {
  const t = now()
  await transaction((tx) => {
    for (const task of tasks) {
      if (read) {
        tx.run(
          'INSERT INTO reading (task_id, domain, read_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT (task_id) DO NOTHING',
          [task.id, task.domain, t],
        )
      } else {
        tx.run('DELETE FROM reading WHERE task_id = ?', [task.id])
      }
    }
  })
}

/** @returns {Promise<Record<string, number>>} read count per domain */
export async function readCountByDomain() {
  const rows = await all('SELECT domain, COUNT(*) AS n FROM reading GROUP BY domain')
  return Object.fromEntries(rows.map((r) => [r.domain, Number(r.n)]))
}

/* ------------------------------------------------------------------ cards */

/** @returns {Promise<Map<string, {box: number, dueAt: number, seen: number, lapses: number}>>} */
export async function cardStates() {
  const rows = await all('SELECT card_id, box, due_at, seen, lapses FROM cards')
  return new Map(
    rows.map((r) => [
      r.card_id,
      { box: Number(r.box), dueAt: Number(r.due_at), seen: Number(r.seen), lapses: Number(r.lapses) },
    ]),
  )
}

/**
 * Record a grading and move the card between Leitner boxes.
 * @param {{ id: string, domain: string }} card
 * @param {'again' | 'hard' | 'good'} grade
 * @param {number[]} intervalsDays indexed by box
 * @param {number} dayMs
 */
export async function gradeCard(card, grade, intervalsDays, dayMs) {
  const t = now()
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)

  const existing = await get('SELECT box, seen, lapses FROM cards WHERE card_id = ?', [card.id])
  const before = existing ? Number(existing.box) : 0
  const seen = existing ? Number(existing.seen) : 0
  const lapses = existing ? Number(existing.lapses) : 0

  const after =
    grade === 'again' ? 0 : grade === 'hard' ? before : Math.min(intervalsDays.length - 1, before + 1)
  const dueAt = midnight.getTime() + intervalsDays[after] * dayMs

  await transaction((tx) => {
    tx.run(
      'INSERT INTO cards (card_id, domain, box, due_at, seen, lapses, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT (card_id) DO UPDATE SET ' +
        'box = excluded.box, due_at = excluded.due_at, seen = excluded.seen, ' +
        'lapses = excluded.lapses, updated_at = excluded.updated_at',
      [card.id, card.domain, after, dueAt, seen + 1, lapses + (grade === 'again' ? 1 : 0), t],
    )
    tx.run(
      'INSERT INTO reviews (card_id, domain, grade, box_before, box_after, reviewed_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?)',
      [card.id, card.domain, grade, before, after, t],
    )
  })
}

/** Reviews per day over the last `days`, for the activity chart. */
export async function reviewActivity(days = 30) {
  const since = now() - days * 86400000
  return all(
    "SELECT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS day, " +
      'COUNT(*) AS n, SUM(grade = \'again\') AS lapses ' +
      'FROM reviews WHERE reviewed_at >= ? GROUP BY day ORDER BY day',
    [since],
  )
}

/* ------------------------------------------------------------------ answers */

/**
 * @param {{ id: string, domain: string, task: string, scenario?: string }} q
 * @param {string[]} selected
 * @param {boolean} isCorrect
 * @param {'quiz' | 'exam' | 'review'} mode
 * @param {number | null} [attemptId]
 * @param {number | null} [elapsedMs]
 */
export async function recordAnswer(q, selected, isCorrect, mode, attemptId = null, elapsedMs = null) {
  const args = [
    q.id, q.domain, q.task, q.scenario ?? null,
    JSON.stringify(selected), isCorrect ? 1 : 0, mode, attemptId, elapsedMs, now(),
  ]
  if (attemptId != null) {
    // One row per question per attempt: changing your mind replaces the row.
    await run(
      'INSERT INTO answers (question_id, domain, task, scenario, selected, is_correct, mode, attempt_id, elapsed_ms, answered_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
        // The uniqueness is enforced by a PARTIAL index, so the conflict target
        // has to repeat its WHERE clause or SQLite cannot match it.
        'ON CONFLICT (attempt_id, question_id) WHERE attempt_id IS NOT NULL DO UPDATE SET ' +
        'selected = excluded.selected, is_correct = excluded.is_correct, ' +
        'elapsed_ms = excluded.elapsed_ms, answered_at = excluded.answered_at',
      args,
    )
  } else {
    await run(
      'INSERT INTO answers (question_id, domain, task, scenario, selected, is_correct, mode, attempt_id, elapsed_ms, answered_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args,
    )
  }
}

/** @returns {Promise<Map<string, {attempts:number, correct:number, wrong:number, lastCorrect:boolean, lastAt:number}>>} */
export async function questionStats() {
  const rows = await all(
    'SELECT question_id, attempts, correct, wrong, last_correct, last_at FROM question_stats',
  )
  return new Map(
    rows.map((r) => [
      r.question_id,
      {
        attempts: Number(r.attempts),
        correct: Number(r.correct),
        wrong: Number(r.wrong),
        lastCorrect: Number(r.last_correct) === 1,
        lastAt: Number(r.last_at),
      },
    ]),
  )
}

/** @returns {Promise<Record<string, {answered:number, correct:number, accuracy:number}>>} */
export async function domainStats() {
  const rows = await all('SELECT domain, answered, correct, accuracy FROM domain_stats')
  return Object.fromEntries(
    rows.map((r) => [
      r.domain,
      { answered: Number(r.answered), correct: Number(r.correct), accuracy: Number(r.accuracy ?? 0) },
    ]),
  )
}

/** Overall counts, excluding nothing. */
export async function answerTotals() {
  const row = await get(
    'SELECT COUNT(*) AS answered, COALESCE(SUM(is_correct), 0) AS correct FROM answers',
  )
  const answered = Number(row?.answered ?? 0)
  const correct = Number(row?.correct ?? 0)
  return { answered, correct, accuracy: answered ? Math.round((correct / answered) * 100) : 0 }
}

/** Rolling accuracy by week, so improvement is visible rather than assumed. */
export async function accuracyOverTime(weeks = 12) {
  const since = now() - weeks * 7 * 86400000
  return all(
    "SELECT strftime('%Y-%W', answered_at / 1000, 'unixepoch', 'localtime') AS week, " +
      'domain, COUNT(*) AS answered, SUM(is_correct) AS correct ' +
      'FROM answers WHERE answered_at >= ? GROUP BY week, domain ORDER BY week',
    [since],
  )
}

/** The task statements you get wrong most often, weakest first. */
export async function weakestTasks(minAttempts = 3, limit = 8) {
  return all(
    'SELECT task, domain, COUNT(*) AS attempts, SUM(is_correct) AS correct, ' +
      'ROUND(100.0 * SUM(is_correct) / COUNT(*), 0) AS accuracy ' +
      'FROM answers GROUP BY task HAVING attempts >= ? ORDER BY accuracy ASC, attempts DESC LIMIT ?',
    [minAttempts, limit],
  )
}

/* ------------------------------------------------------------------ flags */

/** @returns {Promise<Set<string>>} */
export async function flaggedQuestions() {
  const rows = await all('SELECT question_id FROM flags')
  return new Set(rows.map((r) => r.question_id))
}

/**
 * @param {string} questionId
 * @param {boolean} flagged
 */
export async function setFlag(questionId, flagged) {
  if (flagged) {
    await run('INSERT INTO flags (question_id, flagged_at) VALUES (?, ?) ON CONFLICT DO NOTHING', [
      questionId, now(),
    ])
  } else {
    await run('DELETE FROM flags WHERE question_id = ?', [questionId])
  }
}

export async function clearFlags() {
  await run('DELETE FROM flags')
}

/* ------------------------------------------------------------------ attempts */

/**
 * @param {string[]} questionIds
 * @param {string[]} scenarios
 * @param {number} durationMs
 * @returns {Promise<number>} attempt id
 */
export async function startAttempt(questionIds, scenarios, durationMs) {
  await run(
    'INSERT INTO attempts (started_at, duration_ms, scenarios, question_ids) VALUES (?, ?, ?, ?)',
    [now(), durationMs, JSON.stringify(scenarios), JSON.stringify(questionIds)],
  )
  return Number(await value('SELECT last_insert_rowid()'))
}

/** The sitting still in progress, if any. */
export async function activeAttempt() {
  const row = await get('SELECT * FROM attempts WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1')
  return row ? hydrateAttempt(row) : null
}

/**
 * @param {number} attemptId
 * @param {number} cursor
 */
export async function setAttemptCursor(attemptId, cursor) {
  await run('UPDATE attempts SET cursor = ? WHERE id = ?', [cursor, attemptId])
}

/**
 * @param {number} attemptId
 * @param {number} correct
 * @param {number} total
 * @param {number} scaled
 */
export async function finishAttempt(attemptId, correct, total, scaled) {
  await run(
    'UPDATE attempts SET finished_at = ?, correct = ?, total = ?, scaled = ? WHERE id = ?',
    [now(), correct, total, scaled, attemptId],
  )
}

export async function attemptHistory() {
  const rows = await all(
    'SELECT * FROM attempts WHERE finished_at IS NOT NULL ORDER BY finished_at DESC',
  )
  return rows.map(hydrateAttempt)
}

/** @param {number} id */
export async function attempt(id) {
  const row = await get('SELECT * FROM attempts WHERE id = ?', [id])
  return row ? hydrateAttempt(row) : null
}

/** Answers belonging to one attempt, keyed by question id. */
/** @param {number} attemptId */
export async function attemptAnswers(attemptId) {
  const rows = await all(
    'SELECT question_id, selected, is_correct FROM answers WHERE attempt_id = ?',
    [attemptId],
  )
  return new Map(
    rows.map((r) => [r.question_id, { selected: JSON.parse(r.selected), correct: Number(r.is_correct) === 1 }]),
  )
}

/** Percent correct per domain within one attempt, for the score report. */
/** @param {number} attemptId */
export async function attemptDomainBreakdown(attemptId) {
  return all(
    'SELECT domain, COUNT(*) AS total, SUM(is_correct) AS correct ' +
      'FROM answers WHERE attempt_id = ? GROUP BY domain',
    [attemptId],
  )
}

/** @param {number} id */
export async function deleteAttempt(id) {
  await run('DELETE FROM attempts WHERE id = ?', [id])
}

/** @param {Record<string, any>} row */
function hydrateAttempt(row) {
  return {
    id: Number(row.id),
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    durationMs: Number(row.duration_ms),
    scenarios: JSON.parse(row.scenarios),
    questionIds: JSON.parse(row.question_ids),
    cursor: Number(row.cursor ?? 0),
    correct: row.correct == null ? null : Number(row.correct),
    total: row.total == null ? null : Number(row.total),
    scaled: row.scaled == null ? null : Number(row.scaled),
  }
}

/* ------------------------------------------------------------------ settings */

/**
 * @param {string} key
 * @param {string} fallback
 */
export async function setting(key, fallback = '') {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key])
  return row ? row.value : fallback
}

/**
 * @param {string} key
 * @param {string} val
 */
export async function setSetting(key, val) {
  await run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, val],
  )
}
