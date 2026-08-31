#!/usr/bin/env python3
"""Even out which letter holds the correct answer, by permuting each item's options.

Authoring an item naturally puts the right answer first, so a freshly written bank
answers A almost every time. That teaches the wrong reflex. This rotates the options
of each item so the keyed letter lands evenly across A, B, C and D.

The rotation is deterministic: the same input always produces the same output, so
re-running is a no-op and diffs stay reviewable.

    python3 scripts/rebalance.py --dry-run    # show what would change
    python3 scripts/rebalance.py              # rewrite the files

questions/official.json is never touched: those are the guide's own sample questions
and their published explanations refer to specific letters.
"""

import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
QDIR = ROOT / "content" / "questions"
KEYS = ["A", "B", "C", "D"]
SKIP_FILES = {"official.json"}

DRY = "--dry-run" in sys.argv


def rotate(q, shift):
    """Rotate options by `shift` positions and remap every letter reference."""
    opts = q["options"]
    n = len(opts)
    # old position i moves to new position (i + shift) % n
    mapping = {}
    new_opts = [None] * n
    for i, o in enumerate(opts):
        j = (i + shift) % n
        new_key = KEYS[j]
        mapping[o["key"]] = new_key
        new_opts[j] = {"key": new_key, "text": o["text"]}

    q["options"] = new_opts
    q["correct"] = sorted(mapping[k] for k in q["correct"])
    if q.get("why"):
        q["why"] = {mapping[k]: v for k, v in q["why"].items()}
        q["why"] = {k: q["why"][k] for k in KEYS if k in q["why"]}

    # Explanations sometimes name letters. Remap those too, or the item contradicts itself.
    def remap_text(s):
        return re.sub(
            r"\b(Option|Options|Answer|answer)\s+([A-D])((?:\s*(?:,|and|or)\s*[A-D])*)\b",
            lambda m: m.group(1) + " " + "".join(
                mapping.get(c, c) if c in mapping else c for c in m.group(2)
            ) + re.sub(r"[A-D]", lambda c: mapping.get(c.group(0), c.group(0)), m.group(3)),
            s,
        )

    if q.get("explanation"):
        q["explanation"] = remap_text(q["explanation"])
    if q.get("why"):
        q["why"] = {k: remap_text(v) for k, v in q["why"].items()}
    return q


MAX_SHARE = 0.35  # matches validate.py; a file above this gets rebalanced


def main():
    files = sorted(p for p in QDIR.glob("*.json") if p.name not in SKIP_FILES)
    if not files:
        sys.exit("no question files found")

    total_before = collections.Counter()
    total_after = collections.Counter()
    touched = 0
    changed_files = []

    for path in files:
        items = json.load(open(path, encoding="utf-8"))
        single = [q for q in items if q.get("type") != "multi"]
        multi = [q for q in items if q.get("type") == "multi"]
        if not single:
            continue

        before = collections.Counter(q["correct"][0] for q in single)
        total_before.update(before)

        top_share = max(before.values()) / len(single)
        if top_share <= MAX_SHARE:
            # Already spread; leave it alone so the diff stays small and any
            # letter references an author wrote deliberately survive.
            total_after.update(before)
            print(f"  {path.name:<14} {len(items):>3} items  balanced already "
                  f"({', '.join(f'{k}={before.get(k, 0)}' for k in KEYS)})")
            continue

        # Deal target letters round-robin over ids, so the assignment is stable
        # across runs and evenly spread rather than clumped.
        single.sort(key=lambda q: q["id"])
        n_changed = 0
        for n, q in enumerate(single):
            target = KEYS[n % 4]
            cur = q["correct"][0]
            if cur == target:
                continue
            rotate(q, (KEYS.index(target) - KEYS.index(cur)) % 4)
            n_changed += 1

        multi.sort(key=lambda q: q["id"])
        for n, q in enumerate(multi):
            shift = n % 4
            if shift:
                rotate(q, shift)
                n_changed += 1

        after = collections.Counter(q["correct"][0] for q in single)
        total_after.update(after)
        touched += n_changed
        changed_files.append((path, items))
        print(f"  {path.name:<14} {len(items):>3} items  "
              f"{', '.join(f'{k}={before.get(k, 0)}' for k in KEYS)}  ->  "
              f"{', '.join(f'{k}={after.get(k, 0)}' for k in KEYS)}  ({n_changed} rotated)")

    print("\nAcross the bank")
    print("  before:", ", ".join(f"{k}={total_before.get(k, 0)}" for k in KEYS))
    print("  after: ", ", ".join(f"{k}={total_after.get(k, 0)}" for k in KEYS))
    print(f"\n{touched} item(s) rotated in {len(changed_files)} file(s)")

    if not changed_files:
        print("Nothing to do.")
        return 0

    if DRY:
        print("\nDry run, nothing written.")
        return 0

    for path, items in changed_files:
        for q in items:
            q.pop("_file", None)
        path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  wrote {path.relative_to(ROOT)}")

    print("\nNow run: python3 scripts/validate.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
