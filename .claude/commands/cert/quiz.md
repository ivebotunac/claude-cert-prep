---
description: A mixed set drawn to the real domain weights, with immediate rationales
argument-hint: [how many items, default 10]
---

Quiz the user on a mixed set, following the `exam-coach` skill. Default to 10 items
unless `$ARGUMENTS` gives a count.

Draw to the blueprint rather than evenly: run `bank.mjs stats` and allocate the items by
domain weight, so 27% of them come from D1 and 15% from D5. Ask domain by domain, but do
not announce which domain an item came from before it is answered, because the domain is
half the answer.

Feedback comes after each item, not at the end: this is practice, not a measurement. For a
measurement with a clock and a scaled score, point them at the app's Mock tab.

Finish with the per-domain tally, the two weakest domains weighted by exam share, and an
updated `context/coach/state.md`.
