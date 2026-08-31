-- CCAR-F prep, progress schema.
--
-- Every table records EVENTS as well as current state. Aggregates can be derived,
-- but a history that was never written cannot be recovered, and the whole point of
-- using a real database here is that "how did my accuracy in Domain 2 move over the
-- last three weeks" is a query rather than a rewrite.
--
-- Content (questions, flashcards, the blueprint) is NOT in here. It ships with the
-- app as JSON, is identical for every user, and would only go stale in a copy.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- study material

-- A task statement the learner has marked as understood.
CREATE TABLE IF NOT EXISTS reading (
  task_id     TEXT PRIMARY KEY,
  domain      TEXT NOT NULL,
  read_at     INTEGER NOT NULL
);

-- ---------------------------------------------------------------- flashcards

-- Current Leitner state per card. One row per card the learner has ever graded.
CREATE TABLE IF NOT EXISTS cards (
  card_id     TEXT PRIMARY KEY,
  domain      TEXT NOT NULL,
  box         INTEGER NOT NULL DEFAULT 0,
  due_at      INTEGER NOT NULL DEFAULT 0,
  seen        INTEGER NOT NULL DEFAULT 0,
  lapses      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_due ON cards (due_at);
CREATE INDEX IF NOT EXISTS idx_cards_domain ON cards (domain, box);

-- Every grading, so the retention curve is measurable rather than inferred.
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     TEXT NOT NULL,
  domain      TEXT NOT NULL,
  grade       TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good')),
  box_before  INTEGER NOT NULL,
  box_after   INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_time ON reviews (reviewed_at);
CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews (card_id, reviewed_at);

-- ---------------------------------------------------------------- exams

-- One mock sitting. Rows stay while in progress (finished_at IS NULL) so a
-- closed tab does not lose the attempt.
CREATE TABLE IF NOT EXISTS attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  duration_ms   INTEGER NOT NULL,
  scenarios     TEXT NOT NULL,          -- JSON array of scenario ids
  question_ids  TEXT NOT NULL,          -- JSON array, in presentation order
  cursor        INTEGER NOT NULL DEFAULT 0,
  correct       INTEGER,
  total         INTEGER,
  scaled        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_attempts_finished ON attempts (finished_at);

-- ---------------------------------------------------------------- answers

-- Every answer given, in any mode. During a mock, rows are upserted as the
-- candidate changes their mind, then frozen when the attempt is submitted.
CREATE TABLE IF NOT EXISTS answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  TEXT NOT NULL,
  domain       TEXT NOT NULL,
  task         TEXT NOT NULL,
  scenario     TEXT,
  selected     TEXT NOT NULL,           -- JSON array of option keys
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  mode         TEXT NOT NULL CHECK (mode IN ('quiz', 'exam', 'review')),
  attempt_id   INTEGER REFERENCES attempts (id) ON DELETE CASCADE,
  elapsed_ms   INTEGER,
  answered_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_answers_question ON answers (question_id, answered_at);
CREATE INDEX IF NOT EXISTS idx_answers_domain ON answers (domain, answered_at);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers (attempt_id);

-- One row per question per attempt, so re-answering inside a sitting replaces
-- rather than appends.
CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_attempt_question
  ON answers (attempt_id, question_id) WHERE attempt_id IS NOT NULL;

-- ---------------------------------------------------------------- flags

CREATE TABLE IF NOT EXISTS flags (
  question_id TEXT PRIMARY KEY,
  flagged_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------- settings

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------- views

-- Current accuracy per question, which the review lists and the "last answer was
-- wrong" filter are built on.
CREATE VIEW IF NOT EXISTS question_stats AS
SELECT
  question_id,
  domain,
  task,
  COUNT(*)                                            AS attempts,
  SUM(is_correct)                                     AS correct,
  SUM(1 - is_correct)                                 AS wrong,
  MAX(answered_at)                                    AS last_at,
  (SELECT a2.is_correct FROM answers a2
    WHERE a2.question_id = a.question_id
    ORDER BY a2.answered_at DESC LIMIT 1)             AS last_correct
FROM answers a
GROUP BY question_id;

-- Rolled up per domain, for the dashboard and the score report.
CREATE VIEW IF NOT EXISTS domain_stats AS
SELECT
  domain,
  COUNT(*)                                            AS answered,
  SUM(is_correct)                                     AS correct,
  ROUND(100.0 * SUM(is_correct) / COUNT(*), 1)        AS accuracy
FROM answers
GROUP BY domain;
