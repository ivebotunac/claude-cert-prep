# CLAUDE.md

Study app for the **Claude Certified Architect – Foundations** exam (CCAR-F).
Svelte 5 (runes), Vite, Tailwind v4, SQLite WASM in a worker. Static build, no backend.

The app is small and finished. **Most work here is content work**: 279 questions, 140
flashcards and the blueprint, and whether that content is factually correct and free of the
tells that let someone pass a practice test without knowing the material.

## Commands

```bash
./bin/run.sh                             # install, build, serve, open
npm run dev                              # dev server
npm run build                            # static build into dist/
npm run check                            # type check via JSDoc; must be 0 errors
npm run test:unit                        # vitest: util.js, and the content audit
npm run test:e2e                         # playwright, chromium + mobile
npm run test:all                         # both
```

**Before committing**: `npm run check` at 0 errors and `npm run test:all` green. The content
audit is inside `test:unit`, so a bank that regressed fails the suite.

## Deployment

Firebase App Hosting, with automatic rollouts on, so **a push to `main` is a deploy** and it
reaches the public site in about a minute. The README has the URL; `firebase
apphosting:backends:list` names the project and backend behind it, which are deliberately
not written down here.

App Hosting has adapters for Next.js and Angular only. A Vite SPA falls through to the Node
buildpack, which needs a process on `$PORT`, which is what `server.js` is. It reads and
gzips each file in `dist/` once and then serves it from memory; compressing per request was
slow enough on the wasm binary and the content database to be measurable at the browser.

## Architecture

```
content/ccarf-content.sqlite3   the study material. The source of truth, edited with SQL.
src/lib/content.js              reads it at boot into the shapes the views render
src/lib/db/                     schema.sql (progress), content-schema.sql (content),
                                worker.js, index.js (RPC), queries.js (all SQL)
src/lib/stores/                 progress.svelte.js: the reactive mirror of the database
src/lib/routes/                 one component per view, registered in App.svelte's `views`.
                                Practice tracks the guide's build steps in the progress database
src/lib/components/             Question, Nav, Meter, Stat, DomainBadge, Empty
tests/unit/                     util.js, and content.test.js: the question bank audit
tests/e2e/                      playwright against a real preview build
server.js                       serves dist/ in production. Not used locally
apphosting.yaml                 App Hosting build and run settings
```

### Two databases, one connection

`main` is progress: personal, writable, and the only thing export serialises. `content` is
the study material, ATTACHed from the shipped `.sqlite3` file and filled by
`sqlite3_deserialize()` with **SQLITE_DESERIALIZE_READONLY**.

Three consequences worth holding on to:

- A write to `content.*` fails with `SQLITE_READONLY`. That is SQLite enforcing it, not a
  convention. There is a test asserting it, and it should stay.
- One connection is what lets a statement join a question to the answers given for it. The
  review and drill lists in `queries.js` are that join. Do not reintroduce array filtering
  for them.
- `sqlite3_js_db_export()` serialises `main` alone, so an exported progress file carries the
  learner's history and none of the guide's content. Keeping the two schemas separate is
  what makes that true.

**An ATTACH does not survive a reconnect.** `importBytes()` on the OPFS path closes and
reopens the connection, so it calls `attachContent()` again. Anything else that reopens the
database has to do the same or every content query starts failing with "no such table".

### The worker is not optional

`FileSystemFileHandle.createSyncAccessHandle()` is exposed **only in a dedicated worker**.
The `opfs-sahpool` VFS is built on it. Move the database to the main thread and it silently
falls back to `kvvfs` (localStorage), losing OPFS persistence with no error. This was found
by an e2e test asserting the backend, which is why that test exists.

Backends for progress, tried in order: `opfs-sahpool` (persistent, fastest, no COOP/COEP
needed, single tab), `kvvfs` (persistent, localStorage-capped), `memory` (nothing survives).
The content database is in memory regardless.

### Database rules

- **Every SQL statement lives in `queries.js`.** Components call functions, never `db`.
  `content.js` is the one exception, and only for the boot-time content read.
- **Tables record events, not just state.** `reviews` and `answers` are append-oriented so
  history is queryable. Deriving an aggregate later is easy; recovering a history you never
  wrote is impossible.
- `answers` has a **partial** unique index (`WHERE attempt_id IS NOT NULL`). An `ON CONFLICT`
  against it **must repeat the WHERE clause**, or SQLite raises "ON CONFLICT clause does not
  match any PRIMARY KEY or UNIQUE constraint" at runtime. This silently lost mock-exam
  answers once.
- Changing `schema.sql` means bumping `SCHEMA_VERSION` in `db/index.js` and adding the
  migration in `worker.js`, guarded by the version it upgrades from.
- Transactions are collected and sent as one message. Do not await anything unrelated inside
  a `transaction()` callback.
- Qualify content tables as `content.questions`. An unqualified name is progress.

### Svelte conventions

- **Runes only.** `$state`, `$derived`, `$props`, `$effect`, `$bindable`. Never `export let`,
  `$:`, `on:click`, or `<slot>`. Handlers are properties: `onclick={fn}`. Snippets via
  `{#snippet}` and `{@render}`.
- **Colours come from CSS variables only**: `var(--color-ink-2)`, `var(--color-surface)` and
  friends, written as `text-[var(--color-ink-2)]`. Never a raw hex, never `bg-slate-800`.
  The one exception is a domain's own colour, which is data and arrives from the database.
- **Nothing is rounded and nothing casts a shadow.** Structure is one-pixel rules. If a
  border-radius or a box-shadow is creeping back in, the change is fighting the system.
- **Every number is set in the mono face.** `font-mono` also turns on tabular figures, so
  a column of them lines up. Prose is the sans; a figure in the sans reads as a label.
- **Content strings go through `richText()`** from `$lib/util.js` and render with `{@html}`.
  That escapes HTML and wraps technical identifiers in `<code>`. UI labels written in the
  component do not need it.
- Imports use `$lib/` and `$content/`, never relative paths climbing out of a directory.
- Adding a route: create it in `src/lib/routes/`, register it in the `views` map in
  `App.svelte`, add a nav entry in `Nav.svelte` if it is top-level.
- `content.js` exports are module bindings assigned by `loadContent()`, not constants. They
  are populated before any view mounts, because `App.svelte` gates on `progress.ready` and
  `progress.load()` awaits `loadContent()` first. Read them; do not assign them.

## The look

One palette, light, defined once in `app.css`. There is no dark variant and no theme
setting: a single set of colours tuned once stays honest, where two sets drift until one
is quietly wrong. Do not add one back without deciding that trade again.

IBM Plex Sans and IBM Plex Mono, self-hosted from `@fontsource` (latin subset, three
weights each). They are `@import`ed at the top of `app.css`, not linked from a font host,
because the app promises no network calls and that promise is worth more than the 110 KB.

`.card` is a framed panel, not a floating one. `.rows` separates its children with the
quieter rule. `.th` and `.td` are the table pair, `.label` the mono caption, `.section`
the heading above a panel.

## Content

### Editing it

The database is the source of truth. There is no JSON to regenerate from and no build step.

```sh
sqlite3 content/ccarf-content.sqlite3
sqlite> UPDATE questions SET stem = '...' WHERE id = 'd3-014';
```

Then `npm run test:unit`. For a readable `git diff`, once per clone:
`git config diff.sqlite.textconv 'sqlite3 "$1" .dump'`.

### Shape

`questions` holds one row per item; `options` holds one row per option with `is_correct` and
`why`. A `CHECK` enforces the rule that used to live in prose: **`why` is present for every
distractor and NULL for every correct option**. `select_count` is set only on `type = 'multi'`
and must equal the number of correct options. `source` is `'official'` for the 12 verbatim
guide questions and `'derived'` for the rest.

**A flashcard is not a quiz item.** The front is a term, a field, a threshold or a named
pattern. The back is what it is and when it applies. The deck once carried 138 fronts ending in
a question mark, which meant Flashcards and Quiz tested the same thing and the Leitner schedule
measured recognition of a question rather than recall of the material. `checkCardShape` in the
audit fails the suite on a front that ends in `?`.

Flashcards are `flashcards` plus `card_tags`. `task` may be `'meta'` for exam mechanics. One
fact per card; a back listing more than three things gets split.

`task_examples` holds the worked code under a task statement. **The guide contains no code at
all**, in any of its thirty-nine pages, so these are ours and the view labels them as such. They
exist for about a third of the thirty statements, only where the rule stays vague without one.

`docs` holds the reference material that the Resources and Path pages render whole rather
than query: policies, the reading list, the learning path, partner tiers. It is JSON text on
purpose. Normalising it would produce a dozen tables that are only ever read back entire.

### House style

Items that fail these are worse than no items, because they teach the wrong reflex.

- **Scenario-grounded stems.** Concrete production symptoms: percentages, counts, log
  excerpts, latency, amounts. "Production logs show the agent skips get_customer in 12% of
  cases" beats "which is best practice".
- **Exactly one clearly best answer.** Every distractor plausible enough that a careless
  reader picks it, and failing for a *named* reason that goes in `why`.
- **Proportionate response is the exam's core value.** The key is almost always the smallest
  change that addresses the stated root cause.
- **Recurring distractor families**, all from the official samples: over-engineered
  infrastructure (a classifier, a routing layer, a trained model, speculative caching); a
  prompt-based fix where a deterministic guarantee is required; blaming a downstream
  component that worked correctly within its assignment; invented features
  (`CLAUDE_HEADLESS`, `--batch`, `.claude/config.json`); a bigger model or context window for
  an attention or decomposition problem; shifting burden onto humans; self-reported
  confidence or sentiment as a proxy for complexity.
- **Never test an out-of-scope topic.** Section 17 of the guide excludes sixteen of them.
  The audit scans for all sixteen.
- **Plain English. No em dashes.** Technical identifiers verbatim.

### Two biases that keep coming back

Invisible to a schema check, and both let someone score well knowing nothing.

1. **Answer-key position.** Writing an item naturally puts the right answer first; a fresh
   bank keys A almost every time. Guarded twice: the bank's keys were rotated flat when it
   was written and the audit fails if any letter passes 35%, and the app shuffles at render
   time via `presentOptions()`, seeded on question id plus a per-sitting salt. In
   `Question.svelte`, everything works in **source** keys; only the display layer uses shown
   letters, and `shownKey` translates for feedback. Keep those two key spaces separate.
   Adding questions means checking the spread again, and rotating by hand if it slipped.
2. **Option length.** The key tends to be longest because it states the mechanism while
   distractors are one-liners. Target: longest in under 45% of items, no more than ~25 chars
   above the mean distractor. Fix by *tightening the key* and *giving distractors real
   substance*, never by padding. Shuffling does nothing for this one.

## Sources of truth, in priority order

1. **The official exam guide** (v1.0, July 2026, exam code CCAR-F). Section 6 has all 30 task
   statements, section 9 the 12 samples, section 17 the scope lists. If the guide says it, it
   is correct for this exam even where live docs have moved on. `content_meta` records the
   revision the database was transcribed from.
2. **Live Anthropic documentation** for what the guide leaves open. Use the `context7` MCP
   server (`resolve-library-id`, then `query-docs`). Fall back to `parallel-search` only if
   context7 has nothing.
3. The `context` row in `docs` is **researched context, not the guide**. Where it disagrees
   with the guide's own tables, the guide wins.

**A web search will contradict the guide on item format, and the web is wrong.** v1.0 says
"Multiple-choice and multiple-response items; each item states how many responses to select".
The superseded v0.1 of February 2025 said "select the single response", and copies of it are
still near the top of the results on several prep sites, so anyone who checks this online
finds confident sources on both sides. Verified against the v1.0 PDF on 2026-08-31, which is
byte-identical to the one Anthropic links from the Partner Academy. Do not "fix" the bank on
the strength of a search result.

Two things in the app are ours rather than the guide's, and neither is published anywhere:
the share of multiple-response items, roughly one in seven here, and scoring them all or
nothing. All twelve official samples are single-answer, which is where the impression that
the exam has no multi-response items comes from.

If the guide is revised past v1.0, the tables to re-check against it are `tasks` and
`task_bullets` (all 30 statements, titles and bullet counts), `domains` (the five weights),
`scenarios` (six titles), and the `meta`, `inScope` and `outOfScope` docs.

## The blueprint

| Domain | Weight | Tasks | Questions |
|---|---:|---|---:|
| D1 Agentic Architecture & Orchestration | 27% | 1.1–1.7 | 71 |
| D2 Tool Design & MCP Integration | 18% | 2.1–2.5 | 50 |
| D3 Claude Code Configuration & Workflows | 20% | 3.1–3.6 | 58 |
| D4 Prompt Engineering & Structured Output | 20% | 4.1–4.6 | 56 |
| D5 Context Management & Reliability | 15% | 5.1–5.6 | 44 |

60 items, 120 minutes, 4 scenarios of 6, scaled 100–1,000, cut 720. The mock engine
reproduces all of it.

## Do not

- Edit the twelve rows with `source = 'official'`. Those are the guide's own samples, verbatim
  down to the punctuation, and their value is being unaltered. The em dash in `off-12` is the
  guide's; the audit exempts quoted samples from the house-style ban for exactly that reason.
- Turn a flashcard front back into a question. See the flashcard rule above.
- Add a code example to a task statement whose rule is already clear without one.
- Put the content back into JSON, or add a build step that generates the database from
  something else. The database is the source.
- Add a dependency without a reason that survives being asked twice. The runtime list is
  three entries: SQLite, and the two `@fontsource` packages that keep the typefaces local
  so the app still has no network calls.
- Make this repository public. The deployed site already serves the same content, by an
  explicit decision on 2026-08-31, but the repository stays private: a public repo also
  exposes the history and the bank in a form that is trivially forkable.
- Put `/Users/...` paths, credentials or personal references into tracked files.
- Hard-code a colour, or add a route without registering it in `App.svelte`.

## Where the gaps are

`npm run test:unit` prints the current picture. Standing work:

- Coverage is 4.4x to 4.9x the draw size per domain. More questions means less repetition
  across repeat mock attempts.
- Card `fc-120` has a list-shaped back that the audit flags as hard to self-grade.
- `progress.lastPicks` now carries the option keys the learner chose last time, and
  `Review.svelte` still only shows the key. Rendering the learner's own pick beside it is a
  small change to that component and the obvious next one.
