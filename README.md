# CCAR-F Prep

An offline study app for the **Claude Certified Architect, Foundations** exam.

Vibe coded start to finish, and then made to behave: 48 unit tests, 54 end-to-end tests, and
a content audit that fails the build if the question bank drifts. The vibes got it built. The
tests are why it can be trusted with an exam you paid USD 125 to sit.

**279 practice questions** (12 of them the official samples, verbatim), **140 flashcards**,
all **30 task statements** from the blueprint, the guide's own **build exercises**, and a
timed mock exam that draws to the real domain weights.

Everything runs in the browser. No server, no accounts, and no network calls at all: the
question bank, the fonts and SQLite itself are all bundled.

---

## Run it

```sh
./bin/run.sh
```

That is the whole thing. It installs, builds, serves, and opens a browser. Needs Node 22+
and nothing else.

Already set up and just want the dev server: `npm run dev`.

**Double-clicking `dist/index.html` does not work**, and no build flag can fix it. A module
script loaded from `file://` has the origin `null` and the browser blocks it; the worker,
the content database and OPFS all need a real origin too. That is why there is a script.

## What is in it

| | |
|---|---|
| **Overview** | Readiness, per-domain progress, weakest objectives, what to do next |
| **Study** | The 30 task statements with their knowledge, skills and traps, plus worked code where the rule is otherwise vague |
| **Cards** | A term on the front, what it is on the back, on a Leitner schedule. Deliberately not questions: that is what Quiz is for |
| **Practice** | The guide's own seven things to build and four hands-on exercises, ticked off as you do them |
| **Quiz** | Immediate feedback, with the named reason each wrong option fails |
| **Mock exam** | 60 items, 120 minutes, four scenarios of six, sampled to the real weights |
| **Review** | What you got wrong, what you flagged, and what you have answered both ways |
| **Resources** | Exam strategy, the four architectural tensions, distractor patterns, scope lists |
| **Settings** | Export, import, reset, and what the storage is actually doing |

## Two databases

Both are SQLite compiled to WebAssembly, on one connection, in a worker.

**Progress** is yours: reading marks, Leitner boxes, answers, flags, mock attempts. Written
to OPFS, and the only thing export serialises.

**Content** is the study material, loaded from a shipped `.sqlite3` file and attached
read-only. SQLite refuses a write to it, so nothing in the app can rewrite an exam question,
and an exported progress file carries none of the guide with it.

They share a connection so a single query can join a question to the answers you gave for
it. That join is what decides the review lists, and what lets Review show the option you
actually picked beside the right one.

Export gives you a real `.sqlite3` file. Open it with the `sqlite3` CLI and query your own
study history:

```sql
SELECT domain, COUNT(*) AS answered, ROUND(100.0 * SUM(is_correct) / COUNT(*), 1) AS accuracy
FROM answers GROUP BY domain ORDER BY accuracy;
```

## Editing the content

The database is the source of truth. There is no JSON and no build step:

```sh
sqlite3 content/ccarf-content.sqlite3
sqlite> UPDATE questions SET stem = '...' WHERE id = 'd3-014';
```

Then `npm run test:unit`. The audit fails on anything that would let a candidate beat the
bank without knowing the material: a skewed answer key, the correct option being the
longest too often, an out-of-scope topic, a flashcard front that is secretly a question.

For a readable `git diff` on the database, once per clone:

```sh
git config diff.sqlite.textconv 'sqlite3 "$1" .dump'
```

## Two things worth knowing

**The guide contains no code.** Not one line in thirty-nine pages. The exam is judgement on
prose scenarios. The worked examples under about a third of the task statements are ours,
written to make an abstract rule concrete, and the app says so under every one.

**The scaled score is an approximation.** Anthropic publishes the cut score but not the
mapping from raw correct answers to scaled points, so the app anchors 720 at 70% and
interpolates. Watch the raw percentage too.

## Exam facts

60 items, 120 minutes, 4 scenarios drawn from a bank of 6. Multiple-choice and
multiple-response, each item stating how many to select. Pass at 720 on 100 to 1,000.
USD 125 an attempt, valid 12 months. Pearson VUE, online proctored or at a test centre.
Retake waits of 14, then 30, then 90 days, four attempts a year.

## Commands

| | |
|---|---|
| `./bin/run.sh` | Install, build, serve, open |
| `npm run dev` | Dev server with hot reload |
| `npm run check` | Type check via JSDoc |
| `npm run test:all` | Unit tests, the content audit, and the browser tests |

## Licence

MIT for the code. The study content is derived from Anthropic's certification materials and
is for personal exam preparation.
