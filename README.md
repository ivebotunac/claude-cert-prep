# CCAR-F Prep

A study app for the **Claude Certified Architect, Foundations** exam.

### [→ Open the app](https://claude-cert-prep--tech-primo.us-east4.hosted.app)

Nothing to install and nothing to sign up for. It runs entirely in your browser, and your
answers, flashcard boxes and mock attempts are stored on your own machine and never sent
anywhere.

Vibe coded start to finish, and then made to behave: 48 unit tests, 54 browser tests, and a
content audit that fails the build if the question bank drifts. The vibes got it built. The
tests are why you can trust it with a real exam.

**279 practice questions**, 12 of them the official samples word for word, **140 flashcards**,
all **30 task statements** from the blueprint, the guide's own build exercises, and a timed
mock exam that draws to the real domain weights.

## What is in it

| | |
|---|---|
| **Overview** | Readiness, per-domain progress, weakest objectives, what to do next |
| **Study** | The 30 task statements with their knowledge, skills and traps, plus worked code where the rule is otherwise vague |
| **Cards** | A term on the front, what it is on the back, on a spaced-repetition schedule |
| **Practice** | The guide's own seven things to build and four hands-on exercises, ticked off as you do them |
| **Quiz** | Immediate feedback, with the named reason each wrong option fails |
| **Mock exam** | 60 items, 120 minutes, four scenarios of six, sampled to the real weights |
| **Review** | What you got wrong, what you flagged, and what you have answered both ways |
| **Resources** | Exam strategy, the four architectural tensions, distractor patterns, scope lists |
| **Settings** | Export your progress, import it back, or start over |

## Exam facts

60 items, 120 minutes, 4 scenarios drawn from a bank of 6. Multiple-choice and
multiple-response, each item stating how many to select. Pass at 720 on 100 to 1,000, and
the certification is valid 12 months. Pearson VUE, online proctored or at a test centre.
Retake waits of 14, then 30, then 90 days, four attempts a year.

Two things the app will tell you again while you use it. **The guide contains no code**, not
one line in thirty-nine pages, so the worked examples are ours and the exam itself is
judgement on prose. And **the scaled score is an approximation**: Anthropic publishes the
pass mark but not how raw answers map to it, so watch the raw percentage too.

## Running it yourself

```sh
npm install
npm run dev
```

Node 22+ and nothing else.

| | |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run test:all` | Unit tests, the content audit, and the browser tests |

## Official sources

This is an unofficial study aid. It is not affiliated with, endorsed by, or produced by
Anthropic. Everything in it is worked from Anthropic's own published exam guide, and where
the two ever disagree the guide is right and this app is wrong. Go and read the real thing:

| | |
|---|---|
| [Anthropic Partner Academy](https://anthropic-partners.skilljar.com/page/partner-certifications) | The certification programme, and the exam guide, terms and exam policy as PDFs |
| [Claude Certified Architect, Foundations](https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification) | The exam this app prepares for, and where you register for it |
| [Pearson VUE](https://www.pearsonvue.com/us/en/anthropic.html) | Scheduling, retakes, and what exam day actually looks like |
| [Anthropic Academy](https://www.anthropic.com/learn) | Anthropic's own free courses on the material |
| [Claude Code docs](https://docs.claude.com/en/docs/claude-code/overview) | The primary source for most of what the exam tests |
| [Model Context Protocol](https://modelcontextprotocol.io) | The MCP specification, in full |

## Licence

MIT for the code. Claude and Anthropic are trademarks of Anthropic, PBC. The study content
is derived from Anthropic's certification materials and is here for personal exam
preparation only.
