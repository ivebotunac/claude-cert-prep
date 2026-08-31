# CLAUDE.md

Study app for the **Claude Certified Architect – Foundations** exam (CCAR-F).
Svelte 5 (runes), Vite, Tailwind v4, SQLite WASM in a worker. Static build, no backend.

The app is small and finished. **Most work here is content work**: 279 questions, 140
flashcards and the blueprint, and whether that content is factually correct and free of the
tells that let someone pass a practice test without knowing the material.

## Commands

```bash
npm run dev                              # dev server
npm run build                            # static build into dist/
npm run check                            # type check via JSDoc; must be 0 errors
npm run test:unit                        # vitest
npm run test:e2e                         # playwright, chromium + mobile
python3 scripts/validate.py              # content audit; must be 0 ERRORs
python3 scripts/rebalance.py --dry-run   # preview answer-key rotation
python3 scripts/verify_guide.py guide.txt
```

**Before committing**: `npm run check` at 0 errors, `npm run test:all` green,
`python3 scripts/validate.py --strict` passing. CI runs all three.

## Architecture

```
content/            JSON, the source of truth. Never generated, always hand-edited.
scripts/            Python content tooling. No dependencies, no venv.
src/lib/db/         SQLite. schema.sql, worker.js, index.js (RPC), queries.js (all SQL).
src/lib/stores/     progress.svelte.js: the reactive mirror of the database.
src/lib/routes/     one component per view, registered in App.svelte's `views` map.
src/lib/components/ Question, Nav, Meter, Stat, DomainBadge, Empty.
tests/unit/         vitest, pure logic only.
tests/e2e/          playwright against a real preview build.
```

### The worker is not optional

`FileSystemFileHandle.createSyncAccessHandle()` is exposed **only in a dedicated worker**.
The `opfs-sahpool` VFS is built on it. Move the database to the main thread and it silently
falls back to `kvvfs` (localStorage), losing OPFS persistence with no error. This was found
by an e2e test asserting the backend, which is why that test exists.

Backends, tried in order: `opfs-sahpool` (persistent, fastest, no COOP/COEP needed, single
tab), `kvvfs` (persistent, localStorage-capped), `memory` (nothing survives).

### Database rules

- **Every SQL statement lives in `queries.js`.** Components call functions, never `db`.
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

### Svelte conventions

- **Runes only.** `$state`, `$derived`, `$props`, `$effect`, `$bindable`. Never `export let`,
  `$:`, `on:click`, or `<slot>`. Handlers are properties: `onclick={fn}`. Snippets via
  `{#snippet}` and `{@render}`.
- **Colours come from CSS variables only**: `var(--color-ink-2)`, `var(--color-surface)` and
  friends, written as `text-[var(--color-ink-2)]`. Never a raw hex, never `bg-slate-800`.
  The dark theme is token swaps; a literal colour breaks it.
- **Content strings go through `richText()`** from `$lib/util.js` and render with `{@html}`.
  That escapes HTML and wraps technical identifiers in `<code>`. UI labels written in the
  component do not need it.
- Imports use `$lib/` and `$content/`, never relative paths climbing out of a directory.
- Adding a route: create it in `src/lib/routes/`, register it in the `views` map in
  `App.svelte`, add a nav entry in `Nav.svelte` if it is top-level.

## Content

### Question shape

```json
{
  "id": "d3-014", "domain": "D3", "task": "3.3", "scenario": "S2",
  "type": "single", "selectCount": 2, "source": "derived",
  "stem": "...",
  "options": [{ "key": "A", "text": "..." }],
  "correct": ["B"],
  "explanation": "...",
  "why": { "A": "...", "C": "...", "D": "..." }
}
```

`selectCount` only on `type: "multi"` and it must equal `correct.length`. `why` has exactly
one entry per option **not** in `correct`, and none for those that are. `source` is
`"official"` for the 12 verbatim guide questions, `"derived"` for the rest.

Flashcards: `{ id, domain, task, front, back, tags[] }`. `task` may be `"meta"` for exam
mechanics. One fact per card; a back listing more than three things gets split.

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
  `validate.py` scans for all sixteen.
- **Plain English. No em dashes.** Technical identifiers verbatim.

### Two biases that keep coming back

Invisible to a schema check, and both let someone score well knowing nothing.

1. **Answer-key position.** Writing an item naturally puts the right answer first; a fresh
   bank keys A almost every time. Guarded twice: `rebalance.py` rotates the files
   (remapping `correct`, `why`, and any option letters named in explanations), and the app
   shuffles at render time via `presentOptions()`, seeded on question id plus a per-sitting
   salt. In `Question.svelte`, everything works in **source** keys; only the display layer
   uses shown letters, and `shownKey` translates for feedback. Keep those two key spaces
   separate.
2. **Option length.** The key tends to be longest because it states the mechanism while
   distractors are one-liners. Target: longest in under 45% of items, no more than ~25 chars
   above the mean distractor. Fix by *tightening the key* and *giving distractors real
   substance*, never by padding. Shuffling does nothing for this one.

## Sources of truth, in priority order

1. **The official exam guide** (v1.0, July 2026, exam code CCAR-F). Section 6 has all 30 task
   statements, section 9 the 12 samples, section 17 the scope lists. If the guide says it, it
   is correct for this exam even where live docs have moved on.
2. **Live Anthropic documentation** for what the guide leaves open. Use the `context7` MCP
   server (`resolve-library-id`, then `query-docs`). Fall back to `parallel-search` only if
   context7 has nothing.
3. `content/context.json` is **researched context, not the guide**. Where it disagrees with
   `exam.json`, the guide wins.

`scripts/verify_guide.py` diffs `content/` against the guide text: all 30 task statements
with matching titles, bullet counts per task, the five weights, the at-a-glance numbers, the
scenario titles, the scope bullet counts. Run it if the guide is revised past v1.0.

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

- Edit `content/questions/official.json`. Those are the guide's own samples, verbatim, and
  their value is being unaltered. `rebalance.py` skips this file.
- Add a dependency without a reason that survives being asked twice. The runtime dependency
  list is one entry long.
- Make this repository public. It contains a verbatim transcription of Anthropic's
  proprietary exam guide, including all 12 official sample questions and their keys.
- Put `/Users/...` paths, credentials or personal references into tracked files.
- Hard-code a colour, or add a route without registering it in `App.svelte`.

## Where the gaps are

`python3 scripts/validate.py` prints the current picture. Standing work:

- Coverage is 4.4x to 4.9x the draw size per domain. More questions means less repetition
  across repeat mock attempts.
- `Review.svelte` shows the key on an expanded past question but cannot highlight what the
  learner originally picked, because `question_stats` exposes tallies rather than the chosen
  option keys. A query against `answers` would fix it.
- Card `fc-120` has a list-shaped back that `validate.py` flags as hard to self-grade.
