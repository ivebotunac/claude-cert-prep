#!/usr/bin/env python3
"""Verify that data/ still matches the official exam guide.

`exam.json` and `objectives.json` are a transcription of Anthropic's exam guide PDF.
Transcriptions drift, and the guide itself gets revised. This diffs what is in the repo
against the guide text and reports anything that no longer lines up.

Extract the text first, then point this at it:

    pdftotext -layout "Claude Certified Architect – Foundations Certification Exam Guide.pdf" guide.txt
    python3 scripts/verify_guide.py guide.txt

Checks: every task statement present with a matching title, matching counts of the
"Knowledge of" and "Skills in" bullets, the five domain weights, the exam-at-a-glance
numbers, and the in-scope and out-of-scope bullet counts.

Exits 1 if anything mismatches, so it can gate a content change.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
DATA = ROOT / "content"

problems = []
notes = []


def norm(s):
    """Collapse whitespace and repair hyphens that pdftotext splits across line breaks."""
    s = re.sub(r"(\w)-\s+(\w)", r"\1-\2", s)
    return " ".join(s.split()).strip().lower()


def check_tasks(guide, objectives):
    found = re.findall(r"Task Statement (\d\.\d):\s*(.+?)(?=\nKnowledge of:)", guide, re.S)
    guide_tasks = {n: norm(t) for n, t in found}
    mine = {t["id"]: t for tasks in objectives.values() for t in tasks}

    notes.append(f"task statements: guide {len(guide_tasks)}, objectives.json {len(mine)}")

    for n in guide_tasks:
        if n not in mine:
            problems.append(f"task {n} is in the guide but missing from objectives.json")
    for n in mine:
        if n not in guide_tasks:
            problems.append(f"task {n} is in objectives.json but not in the guide")

    for n, title in guide_tasks.items():
        if n in mine and norm(mine[n]["title"]) != title:
            problems.append(
                f"task {n} title differs\n      guide: {title}\n      repo : {norm(mine[n]['title'])}")

    # Bullet counts are a cheap proxy for "did we drop a line".
    blocks = re.split(r"Task Statement \d\.\d:", guide)[1:]
    for (n, _), block in zip(found, blocks):
        if "Knowledge of:" not in block or "Skills in:" not in block:
            continue
        k = block.split("Knowledge of:")[1].split("Skills in:")[0]
        s = re.split(r"Task Statement|Domain \d:|\n7\. How to Prepare", block.split("Skills in:")[1])[0]
        gk, gs = len(re.findall(r"^\s*•", k, re.M)), len(re.findall(r"^\s*•", s, re.M))
        if n not in mine:
            continue
        mk, ms = len(mine[n]["knowledge"]), len(mine[n]["skills"])
        if (gk, gs) != (mk, ms):
            problems.append(
                f"task {n} bullet counts differ: guide has {gk} knowledge and {gs} skills, "
                f"repo has {mk} and {ms}")


def check_weights(guide, exam):
    found = re.findall(r"\n(\d)\s+(.+?)\s+(\d\d)%", guide)
    guide_w = {f"D{n}": int(w) for n, _, w in found}
    for d in exam["domains"]:
        gw = guide_w.get(d["id"])
        if gw is None:
            problems.append(f"domain {d['id']} weight not found in the guide")
        elif gw != d["weight"]:
            problems.append(f"domain {d['id']} weight: guide {gw}%, repo {d['weight']}%")
    total = sum(d["weight"] for d in exam["domains"])
    if total != 100:
        problems.append(f"domain weights sum to {total}%, not 100%")
    notes.append("domain weights: " + ", ".join(f"{d['id']}={d['weight']}%" for d in exam["domains"]))


def check_meta(guide, exam):
    m = exam["meta"]
    expect = [
        (r"Number of items\s+(\d+)", "items", m["items"]),
        (r"Time limit\s+(\d+) minutes", "timeLimitMinutes", m["timeLimitMinutes"]),
        (r"Scaled score of (\d+)", "passingScaled", m["passingScaled"]),
        (r"Exam fee\s+\$(\d+)", "feeUsd", m["feeUsd"]),
        (r"(\d+) months from the date", "validityMonths", m["validityMonths"]),
        (r"(\d) scenarios drawn from a bank of \d", "scenariosPresented", m["scenariosPresented"]),
        (r"\d scenarios drawn from a bank of (\d)", "scenarioBankSize", m["scenarioBankSize"]),
    ]
    for pattern, field, mine in expect:
        hit = re.search(pattern, guide)
        if not hit:
            problems.append(f"could not locate '{field}' in the guide to verify it")
        elif int(hit.group(1)) != mine:
            problems.append(f"{field}: guide says {hit.group(1)}, repo says {mine}")
    notes.append(
        f"exam facts: {m['items']} items, {m['timeLimitMinutes']} min, cut {m['passingScaled']}, "
        f"${m['feeUsd']}, {m['validityMonths']} months")


def check_scope(guide, exam):
    for header, nxt, field in [
        ("In-Scope Topics", "Out-of-Scope Topics", "inScope"),
        ("Out-of-Scope Topics", "18. Document Control", "outOfScope"),
    ]:
        if header not in guide:
            problems.append(f"section '{header}' not found in the guide")
            continue
        section = guide.split(header)[1].split(nxt)[0]
        n = len(re.findall(r"^•", section, re.M))
        mine = len(exam[field])
        if n != mine:
            problems.append(f"{field}: guide lists {n} bullets, repo has {mine}")
        notes.append(f"{field}: {mine} bullets")


def check_scenarios(guide, exam):
    for s in exam["scenarios"]:
        if f"Scenario {s['id'][1]}: {s['title']}" not in guide:
            problems.append(f"scenario {s['id']} '{s['title']}' not found in the guide under that title")
    notes.append(f"scenarios: {len(exam['scenarios'])} verified by title")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    guide_path = pathlib.Path(sys.argv[1])
    if not guide_path.exists():
        sys.exit(f"no such file: {guide_path}")
    guide = guide_path.read_text(encoding="utf-8", errors="replace")

    exam = json.load(open(DATA / "exam.json", encoding="utf-8"))
    objectives = json.load(open(DATA / "objectives.json", encoding="utf-8"))

    version = re.search(r"Version ([\d.]+) · Effective (\w+ \d{4})", guide)
    if version:
        notes.insert(0, f"guide version {version.group(1)}, effective {version.group(2)}")
        if version.group(1) != exam["meta"].get("guideVersion"):
            problems.append(
                f"guide version {version.group(1)} but exam.json records "
                f"{exam['meta'].get('guideVersion')}; re-transcribe before trusting the rest")

    check_tasks(guide, objectives)
    check_weights(guide, exam)
    check_meta(guide, exam)
    check_scope(guide, exam)
    check_scenarios(guide, exam)

    print("=" * 70)
    print("Transcription check against the official exam guide")
    print("=" * 70)
    for n in notes:
        print(f"  . {n}")
    print()
    if problems:
        print(f"{len(problems)} mismatch(es):")
        for p in problems:
            print(f"  ! {p}")
        return 1
    print("  data/ matches the guide.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
