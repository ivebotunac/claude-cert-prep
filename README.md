# CCAR-F Prep

An offline study app for the **Claude Certified Architect – Foundations** exam (CCAR-F).

Svelte 5, Vite, Tailwind v4, and two real SQLite databases running in the browser. No
server, no accounts, no network calls beyond loading the app itself. Your progress is a
SQLite file that never leaves your machine, and you can export it.

**279 practice questions** (12 of them the official samples, verbatim), **140 flashcards**
on a Leitner schedule, all **30 task statements** from the official blueprint as study
material, and a timed mock exam that draws to the real domain weights.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That is the whole setup. Build a static bundle with `npm run build`, preview it with
`npm run preview`.

To get a readable `git diff` on the content database, once per clone:

```bash
git config diff.sqlite.textconv 'sqlite3 "$1" .dump'
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run check` | Type check every `.js` and `.svelte` file via JSDoc |
| `npm run test:unit` | Vitest: pure logic, and the content quality audit |
| `npm run test:e2e` | Playwright, real browser, desktop and mobile |
| `npm run test:all` | Both suites |

## How it is laid out

```
content/
  ccarf-content.sqlite3   the study material, and the source of truth for it
src/
  App.svelte              shell, route table, boot and error states
  app.css                 Tailwind v4 theme tokens, light and dark
  lib/
    content.js            reads the content database into the shapes views render
    router.svelte.js      hash router, about forty lines
    util.js               pure helpers: shuffling, scoring, formatting
    db/
      schema.sql          the progress schema
      content-schema.sql  the content schema, as documentation and a rebuild path
      worker.js           SQLite runs here, and only here
      index.js            promise-based RPC to the worker
      queries.js          every SQL statement the app runs
    stores/progress.svelte.js   reactive mirror of the database
    components/           Question, Nav, Meter, Stat, DomainBadge, Empty
    routes/               one component per view
tests/
  unit/                   Vitest: util.js, and the question bank audit
  e2e/                    Playwright
```

## Two databases

Both are SQLite compiled to WebAssembly, on one connection, in a dedicated worker.

| Schema | What | Persistence |
|---|---|---|
| `main` | Progress: reading marks, Leitner boxes, answers, flags, mock attempts | Written to OPFS, and what export serialises |
| `content` | The study material: blueprint, tasks, questions, options, flashcards | Read-only, loaded from the shipped `.sqlite3` file on every boot |

They are on one connection so a single statement can join a question to the answers given
for it. Which questions count as missed, shaky, flagged or unseen is decided by SQL, not by
filtering an array afterwards.

`content` is attached with `ATTACH ':memory:'` and then filled by `sqlite3_deserialize()`
with the **SQLITE_DESERIALIZE_READONLY** flag, so a write to it fails with `SQLITE_READONLY`.
That is enforced by SQLite rather than by convention, and there is a test for it.

Because `sqlite3_js_db_export()` serialises `main` alone, an exported progress file contains
your history and nothing else. The exam content does not travel with it.

### Why the worker is not an optimisation

`FileSystemFileHandle.createSyncAccessHandle()`, which the persistent OPFS backend is built
on, **is only exposed inside a worker**. On the main thread the pool silently fails to
install and SQLite quietly falls back to localStorage. Running it in a worker also keeps the
UI responsive during an import.

Three backends for progress, tried in order:

| Backend | Persistent | Notes |
|---|---|---|
| `opfs-sahpool` | yes | Origin Private File System, SyncAccessHandle pool VFS. Fastest. Does **not** need the COOP/COEP headers the plain `opfs` VFS requires, which is what makes it work on static hosts. One tab at a time. |
| `kvvfs` | yes | Backed by localStorage. Same SQL, capped at a few megabytes. Used in a private window or a second tab. |
| `memory` | no | Last resort. The app says so and pushes you to export. |

Settings shows which one you got. The content database is unaffected by the choice: it is
in memory either way.

### Why progress is a database rather than a JSON blob

Every table records **events**, not just current state. Every card grading, every answer,
every attempt. So "how did my accuracy in Domain 2 move over three weeks" is a query, and
the weakest-objectives panel on the dashboard is a `GROUP BY`. Aggregates can be derived; a
history never written cannot be recovered.

Export gives you a real `.sqlite3` file. Open it with the `sqlite3` CLI or DB Browser for
SQLite and query your own study history:

```sql
SELECT domain, COUNT(*) AS answered, ROUND(100.0 * SUM(is_correct) / COUNT(*), 1) AS accuracy
FROM answers GROUP BY domain ORDER BY accuracy;
```

## What is in each section

- **Dashboard**: readiness score, per-domain progress, weakest objectives ranked by
  accuracy, and a recommendation based on whichever signal is weakest.
- **Study**: the blueprint as readable material. Each task statement expands to its
  knowledge and skills bullets plus the traps that punish skimming. Tick one when you can
  explain it without looking.
- **Flashcards**: Leitner boxes at 1, 3, 7, 21 and 60 days. Space reveals, then 1/2/3 grades.
- **Quiz**: immediate feedback with the reason each distractor fails. Scope by domain,
  scenario, task statement, or to what you have not tried, got wrong, or flagged.
- **Mock exam**: 60 items in 120 minutes, four scenarios of six, sampled to the
  27/18/20/20/15 weights and grouped by scenario so each narrative is read once. No feedback
  until you submit. Closing the tab does not lose the attempt, and the clock keeps running.
- **Review**: what you got wrong, what you flagged, and what you have answered both ways at
  different times. The third list is where the real gaps hide.
- **Path**: the four learning path courses with module lists, OnVUE mechanics, the
  credential family, partner tiers, and the distractor patterns worth memorising.
- **Resources**: the official prep plan and exercises, reading list, in-scope and
  out-of-scope lists, policies.
- **Settings**: theme, option shuffling, storage backend, export, import, reset.

## Editing the content

The database is the source of truth, so an edit is SQL:

```sh
sqlite3 content/ccarf-content.sqlite3
sqlite> UPDATE questions SET stem = '...' WHERE id = 'd3-014';
```

DB Browser for SQLite works too if you would rather see a grid. Either way, run
`npm run test:unit` afterwards: the audit is a test, and it fails on anything that would let
a candidate beat the bank without knowing the material. The schema's own CHECK constraints
catch the structural mistakes first, including the one that matters most, that every
distractor carries a stated reason for failing and no correct option does.

`git diff` on the database is readable once the textconv driver above is configured.

## Content quality

A practice bank is worse than useless if it can be beaten without knowing the material.
`tests/unit/content.test.js` is the guard, and it runs with every `npm run test:unit`.

Current state of the bank:

| Check | Result |
|---|---|
| Answer key spread | A 26%, B 26%, C 25%, D 23% |
| Correct answer is the longest option | 21% (chance is ~25%) |
| Out-of-scope topics tested | none |
| Near-duplicate stems | none |
| Questions per domain vs mock draw | 4.4x to 4.9x |
| Multiple-response share | 14% |

Answer position is guarded twice: the keys were rotated flat across the bank when it was
written, and the app **shuffles options at render time**, seeded from the question id plus a
per-sitting salt. The order stays stable while you are looking at an item, and differs next
time.

## The scaled score is an approximation

Anthropic publishes the cut score (720 on 100–1,000) but not the mapping from raw correct
answers to scaled points. The app anchors 720 at 70% correct and interpolates linearly.
Treat it as a signal and watch the raw percentage too.

## Exam facts

60 items, 120 minutes (about 135 minutes seat time), 4 scenarios drawn from a bank of 6.
Multiple-choice and multiple-response; each item states how many to select. Pass at 720 on a
100–1,000 scale. USD 125 per attempt. Valid 12 months, renewed with a free non-proctored
assessment. Delivered by Pearson VUE, online proctored or at a test centre. Retake waits:
14 days, then 30, then 90; four attempts per rolling 12 months.

## Sources

The `domains`, `scenarios`, `tasks`, `task_bullets` and `questions` tables, and the `docs`
rows other than `context`, are transcribed from the official *Claude Certified Architect –
Foundations Exam Guide*, v1.0, July 2026. `content_meta` records which revision.

The `context` doc is researched context gathered on 31 August 2026, kept separate because it
is **not** the guide. Where the two disagree, the guide wins, and the app labels the
researched material as such.

## Licence

MIT for the code. The study content is derived from Anthropic's certification materials and
is for personal exam preparation.
