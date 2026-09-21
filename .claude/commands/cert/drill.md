---
description: Teach and test one domain or task statement, with the reason every wrong option is wrong
argument-hint: [domain or task, for example D3 or 3.2]
---

Drill the area in `$ARGUMENTS`, following the `exam-coach` skill.

If nothing was given, read `context/coach/state.md` and drill the weakest task in it.
If that file does not exist either, run `node .claude/skills/exam-coach/scripts/bank.mjs stats`
and ask which domain they want, naming the weights so the choice is informed.

Teach the task statement first with `task <id>`, then ask items filtered to that domain
or task, one at a time, keys revealed only after an answer. Ten items unless they say
otherwise, or fewer if the filter holds fewer.

Close by rewriting `context/coach/state.md` with what was missed.
