# CCAR-F Prep

An offline study app for the **Claude Certified Architect – Foundations** exam (CCAR-F).

Svelte 5, Vite, Tailwind v4, and a real SQLite database running in the browser. No server,
no accounts, no network calls. Your progress is a SQLite file that never leaves your
machine, and you can export it.

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

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run check` | Type check every `.js` and `.svelte` file via JSDoc |
| `npm run test:unit` | Vitest, pure logic |
| `npm run test:e2e` | Playwright, real browser, desktop and mobile |
| `npm run test:all` | Both suites |
| `npm run content:validate` | Audit the question bank for bias, scope drift and coverage |
| `npm run content:rebalance` | Even out which letter holds the correct answer |
| `npm run content:verify -- guide.txt` | Diff the blueprint against the official guide |

## How it is laid out

```
content/                  study content as JSON, the source of truth
  exam.json               blueprint, domains, scenarios, policies, reading list
  objectives.json         all 30 task statements with knowledge, skills and traps
  context.json            learning path, exam-day mechanics, partner tiers
  flashcards.json         140 Leitner cards
  questions/*.json        279 questions across ten banks
scripts/                  Python content tooling, no dependencies
  validate.py             quality audit: bias, out-of-scope, duplication, coverage
  rebalance.py            deterministic answer-key rotation
  verify_guide.py         diff content/ against the official guide text
src/
  App.svelte              shell, route table, boot and error states
  app.css                 Tailwind v4 theme tokens, light and dark
  lib/
    content.js            imports the JSON and builds the lookup indexes
    router.svelte.js      hash router, about forty lines
    util.js               pure helpers: shuffling, scoring, formatting
    db/
      schema.sql          the progress schema
      worker.js           SQLite runs here, and only here
      index.js            promise-based RPC to the worker
      queries.js          every SQL statement the app runs
    stores/progress.svelte.js   reactive mirror of the database
    components/           Question, Nav, Meter, Stat, DomainBadge, Empty
    routes/               one component per view
tests/
  unit/                   Vitest
  e2e/                    Playwright
```

## The database

Progress lives in SQLite compiled to WebAssembly, running in a dedicated worker.

That worker is not an optimisation. `FileSystemFileHandle.createSyncAccessHandle()`, which
the persistent OPFS backend is built on, **is only exposed inside a worker**. On the main
thread the pool silently fails to install and SQLite quietly falls back to localStorage.
Running it in a worker also keeps the UI responsive during an import.

Three backends, tried in order:

| Backend | Persistent | Notes |
|---|---|---|
| `opfs-sahpool` | yes | Origin Private File System, SyncAccessHandle pool VFS. Fastest. Does **not** need the COOP/COEP headers the plain `opfs` VFS requires, which is what makes it work on static hosts like GitHub Pages. One tab at a time. |
| `kvvfs` | yes | Backed by localStorage. Same SQL, capped at a few megabytes. Used in a private window or a second tab. |
| `memory` | no | Last resort. The app says so and pushes you to export. |

Settings shows which one you got.

Why a database rather than a JSON blob in localStorage: every table records **events**, not
just current state. Every card grading, every answer, every attempt. So "how did my accuracy
in Domain 2 move over three weeks" is a query, and the weakest-objectives panel on the
dashboard is a `GROUP BY`. Aggregates can be derived; a history never written cannot be
recovered.

Export gives you a real `.sqlite3` file. Open it with the `sqlite3` CLI or DB Browser for
SQLite and query your own study history:

```sql
SELECT domain, COUNT(*) AS answered, ROUND(100.0 * SUM(is_correct) / COUNT(*), 1) AS accuracy
FROM answers GROUP BY domain ORDER BY accuracy;
```

## What is in each section

- **Dashboard** — readiness score, per-domain progress, weakest objectives ranked by
  accuracy, and a recommendation based on whichever signal is weakest.
- **Study** — the blueprint as readable material. Each task statement expands to its
  knowledge and skills bullets plus the traps that punish skimming. Tick one when you can
  explain it without looking.
- **Flashcards** — Leitner boxes at 1, 3, 7, 21 and 60 days. Space reveals, then 1/2/3 grades.
- **Quiz** — immediate feedback with the reason each distractor fails. Scope by domain,
  scenario, task statement, or to what you have not tried, got wrong, or flagged.
- **Mock exam** — 60 items in 120 minutes, four scenarios of six, sampled to the
  27/18/20/20/15 weights and grouped by scenario so each narrative is read once. No feedback
  until you submit. Closing the tab does not lose the attempt, and the clock keeps running.
- **Review** — what you got wrong, what you flagged, and what you have answered both ways at
  different times. The third list is where the real gaps hide.
- **Path** — the four learning path courses with module lists, OnVUE mechanics, the
  credential family, partner tiers, and the distractor patterns worth memorising.
- **Resources** — the official prep plan and exercises, reading list, in-scope and
  out-of-scope lists, policies.
- **Settings** — theme, option shuffling, storage backend, export, import, reset.

## Content quality

A practice bank is worse than useless if it can be beaten without knowing the material.
`scripts/validate.py` is the guard, and CI runs it with `--strict`.

Current state of the bank:

| Check | Result |
|---|---|
| Answer key spread | A 26%, B 26%, C 25%, D 23% |
| Correct answer is the longest option | 21% (chance is ~25%) |
| Out-of-scope topics tested | none |
| Near-duplicate stems | none |
| Questions per domain vs mock draw | 4.4x to 4.9x |
| Multiple-response share | 14% |

Answer position is guarded twice: `rebalance.py` evens out the files, and the app **shuffles
options at render time**, seeded from the question id plus a per-sitting salt. The order
stays stable while you are looking at an item, and differs next time.

## The scaled score is an approximation

Anthropic publishes the cut score (720 on 100–1,000) but not the mapping from raw correct
answers to scaled points. The app anchors 720 at 70% correct and interpolates linearly.
Treat it as a signal and watch the raw percentage too.

## Exam facts

60 items, 120 minutes (about 135 minutes seat time), 4 scenarios drawn from a bank of 6.
Multiple-choice and multiple-response; each item states how many to select. Pass at 720 on a
100–1,000 scale. $125 per attempt. Valid 12 months, renewed with a free non-proctored
assessment. Delivered by Pearson VUE, online proctored or at a test centre. Retake waits:
14 days, then 30, then 90; four attempts per rolling 12 months.

## Sources

`content/exam.json` and `content/objectives.json` are transcribed from the official
*Claude Certified Architect – Foundations Exam Guide*, v1.0, July 2026.
`scripts/verify_guide.py` diffs them against the guide text and reports anything that has
drifted, which is how a future revision gets picked up.

`content/context.json` is researched context gathered on 31 August 2026, kept in a separate
file because it is **not** the guide. Where the two disagree, the guide wins, and the app
labels the researched material as such.

## Licence

MIT for the code. The study content is derived from Anthropic's certification materials and
is for personal exam preparation.
