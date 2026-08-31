-- CCAR-F prep, content schema.
--
-- The study material: the blueprint, the task statements, the question bank and
-- the flashcards. This database is built once, shipped with the app, and ATTACHed
-- read-only beside the progress database (see worker.js). SQLite enforces the
-- read-only part, so a bug cannot rewrite an exam question.
--
-- It is deliberately a SEPARATE file from progress. Content is identical for every
-- learner and ships with the build; progress is personal and is what export writes
-- out. Keeping them apart is what stops an exported progress file from carrying a
-- transcription of Anthropic's exam guide with it.
--
-- What is normalised and what is not:
--
--   Normalised   anything the app filters, counts or joins on: domains, scenarios,
--                tasks, questions, options, flashcards.
--   docs         the reference material the Resources and Path pages render as a
--                document rather than query: policies, the reading list, the
--                learning path, partner tiers. Forcing those into fifteen tables
--                that only ever get read back whole would be more mess, not less.

-- ---------------------------------------------------------------- blueprint

CREATE TABLE domains (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  short_name     TEXT NOT NULL,
  weight         INTEGER NOT NULL,
  color          TEXT NOT NULL,
  blurb          TEXT NOT NULL,
  expected_items INTEGER NOT NULL,
  ord            INTEGER NOT NULL
);

CREATE TABLE scenarios (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  narrative TEXT NOT NULL,
  ord       INTEGER NOT NULL
);

-- Which domains a scenario leans on, and the fixed properties its questions
-- assume. Both are ordered lists rendered on the Study page.
CREATE TABLE scenario_domains (
  scenario_id TEXT NOT NULL REFERENCES scenarios (id),
  domain_id   TEXT NOT NULL REFERENCES domains (id),
  ord         INTEGER NOT NULL,
  PRIMARY KEY (scenario_id, ord)
);

CREATE TABLE scenario_props (
  scenario_id TEXT NOT NULL REFERENCES scenarios (id),
  text        TEXT NOT NULL,
  ord         INTEGER NOT NULL,
  PRIMARY KEY (scenario_id, ord)
);

-- ---------------------------------------------------------------- objectives

-- All 30 task statements from section 6 of the guide.
CREATE TABLE tasks (
  id       TEXT PRIMARY KEY,
  domain   TEXT NOT NULL REFERENCES domains (id),
  title    TEXT NOT NULL,
  key_idea TEXT NOT NULL,
  ord      INTEGER NOT NULL
);

-- The knowledge, skills and traps bullets under each task statement. One table
-- rather than three, because they are rendered the same way and differ only in
-- their heading.
CREATE TABLE task_bullets (
  task_id TEXT NOT NULL REFERENCES tasks (id),
  kind    TEXT NOT NULL CHECK (kind IN ('knowledge', 'skills', 'traps')),
  text    TEXT NOT NULL,
  ord     INTEGER NOT NULL,
  PRIMARY KEY (task_id, kind, ord)
);

-- ---------------------------------------------------------------- questions

CREATE TABLE questions (
  id           TEXT PRIMARY KEY,
  domain       TEXT NOT NULL REFERENCES domains (id),
  task         TEXT NOT NULL REFERENCES tasks (id),
  scenario     TEXT REFERENCES scenarios (id),
  type         TEXT NOT NULL CHECK (type IN ('single', 'multi')),
  -- Only meaningful for multi, where it must equal the number of correct options.
  select_count INTEGER,
  -- 'official' is a verbatim sample from section 9 of the guide, 'derived' is ours.
  source       TEXT NOT NULL CHECK (source IN ('official', 'derived')),
  stem         TEXT NOT NULL,
  explanation  TEXT NOT NULL
);

-- One row per option. `why` states the named reason a distractor fails and is
-- NULL exactly when the option is correct.
CREATE TABLE options (
  question_id TEXT NOT NULL REFERENCES questions (id),
  key         TEXT NOT NULL,
  text        TEXT NOT NULL,
  is_correct  INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  why         TEXT,
  ord         INTEGER NOT NULL,
  PRIMARY KEY (question_id, key),
  CHECK ((is_correct = 1) = (why IS NULL))
);

CREATE INDEX idx_questions_domain ON questions (domain);
CREATE INDEX idx_questions_task ON questions (task);
CREATE INDEX idx_questions_scenario ON questions (scenario);
CREATE INDEX idx_questions_source ON questions (source);
CREATE INDEX idx_options_question ON options (question_id, ord);

-- ---------------------------------------------------------------- flashcards

CREATE TABLE flashcards (
  id     TEXT PRIMARY KEY,
  domain TEXT NOT NULL REFERENCES domains (id),
  -- 'meta' rather than a task id for the exam-mechanics cards.
  task   TEXT NOT NULL,
  front  TEXT NOT NULL,
  back   TEXT NOT NULL,
  ord    INTEGER NOT NULL
);

CREATE TABLE card_tags (
  card_id TEXT NOT NULL REFERENCES flashcards (id),
  tag     TEXT NOT NULL,
  ord     INTEGER NOT NULL,
  PRIMARY KEY (card_id, ord)
);

CREATE INDEX idx_flashcards_domain ON flashcards (domain, ord);

-- ---------------------------------------------------------------- documents

-- Reference material that is read whole rather than queried. `json` is a JSON
-- document; SQLite's json_* functions can still reach into it if a query ever
-- needs to.
CREATE TABLE docs (
  key  TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

-- ---------------------------------------------------------------- provenance

-- Built-at stamp and the guide revision this content was transcribed from, so the
-- app can state what it is showing and a future build can be told apart.
CREATE TABLE content_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
