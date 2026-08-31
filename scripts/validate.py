#!/usr/bin/env python3
"""Deep quality audit of the question bank and flashcards.

build.py checks that the data is structurally valid. This checks whether it is any
good: whether a test-wise candidate could beat it without knowing the material,
whether it drifts into topics the exam guide puts out of scope, whether coverage
matches the blueprint weights, and whether items duplicate each other.

    python3 scripts/validate.py            # report
    python3 scripts/validate.py --strict   # exit 1 on any ERROR

Findings are graded ERROR (fix before studying from this), WARN (worth a look) and
INFO (context). Exit code is non-zero only with --strict.
"""

import collections
import glob
import itertools
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
DATA = ROOT / "content"

# Thresholds. Tightening these is how you raise the bar on the bank.
MAX_KEY_SHARE = 0.35        # no answer letter should hold more than this share
MAX_LONGEST_CORRECT = 0.45  # correct option should not be the longest this often
MAX_LEN_DELTA = 40          # mean chars the correct option may exceed the distractors by
DUP_JACCARD = 0.55          # stem token overlap that counts as near-duplicate
MIN_STEM = 60               # a stem shorter than this cannot be scenario-grounded
MIN_DISTRACTOR = 25         # a one-liner distractor is usually a throwaway

# Section 17 of the exam guide: topics explicitly excluded. An item that TESTS one of
# these is wasted study time. Incidental mentions are only worth a WARN.
OUT_OF_SCOPE = {
    # Scoped to the Anthropic streaming API. A scenario that merely mentions a streaming
    # HTTP client is not testing the excluded topic.
    "streaming / SSE": r"server-sent|\bSSE\b|stream(?:ing)?\s+(?:the\s+)?(?:API\s+)?response|\bstream=True\b|streaming (?:API|endpoint|events|chunks|deltas)",
    "vision / images": r"\bvision\b|image analysis|\bOCR\b|multimodal image",
    "computer use": r"computer use|browser automation|desktop interaction",
    "prompt caching internals": r"cache_control|\bephemeral\b|cache breakpoint|cache write|cache read|cache TTL",
    "rate limits / pricing math": r"\bITPM\b|\bOTPM\b|\bRPM\b|rate limit|per million tokens|tokens per minute",
    "OAuth / key rotation": r"\bOAuth\b|API key rotation|refresh token|bearer token",
    "cloud providers": r"\bBedrock\b|\bVertex\b|\bAzure\b|AnthropicBedrock|AnthropicVertex",
    "fine-tuning / training": r"fine-tun|\bRLHF\b|constitutional AI|model weights|training data",
    "embeddings / vector DB": r"\bembedding|vector database|\bpgvector\b|\bFAISS\b|cosine similarity",
    "tokenization": r"\btokenizer\b|tokenization|BPE\b",
}

# Identifiers the exam guide itself names. Anything that LOOKS like a flag or a config
# path but is not on this list is a candidate hallucination.
KNOWN_IDENTIFIERS = {
    "-p", "--print", "--output-format", "--json-schema", "--resume", "--model", "--verbose",
    "/memory", "/compact", "/clear", "/review",
    ".claude/commands/", ".claude/skills/", ".claude/rules/", ".claude/", ".mcp.json",
    "~/.claude.json", "~/.claude/", "CLAUDE.md", "SKILL.md", "mcp.json", "claude.json",
    "@import", "context: fork", "allowed-tools", "argument-hint", "paths:",
    "fork_session", "allowedTools", "AgentDefinition", "Task",
    "PostToolUse", "PreToolUse", "stop_reason", "tool_use", "tool_result", "end_turn",
    "tool_choice", "auto", "any", "isError", "custom_id", "max_tokens",
    "errorCategory", "isRetryable", "retriable", "detected_pattern",
    "calculated_total", "stated_total", "conflict_detected",
    "Read", "Write", "Edit", "Bash", "Grep", "Glob", "Explore",
    "process_refund", "get_customer", "lookup_order", "escalate_to_human",
    "verify_fact", "extract_metadata", "load_document", "fetch_url",
}

# Things that do NOT exist, and appear on purpose as distractors. The official sample
# questions use several of these, so seeing them is expected; seeing them in a KEYED
# answer is a serious defect.
KNOWN_FALSE = {"--batch", ".claude/config.json", "CLAUDE_HEADLESS", "--headless", "config.json"}

# Rule and standards files under .claude/rules/ are named freely by each project, so a
# bare *.md is an example rather than a claim about a product feature.
EXAMPLE_FILE_RE = re.compile(r"^[\w.-]+\.md$")

# Any path under .claude/ or a home-relative Claude path is a legitimate shape.
LEGIT_PATH_RE = re.compile(r"^(?:~/)?\.claude(?:/[\w.*-]+)*/?\.?$|^~/\.claude\.json$")
FLAG_RE = re.compile(r"(?<![\w-])--?[a-z][a-z0-9-]{1,24}(?![\w-])")
CONFIG_RE = re.compile(r"(?:~/)?\.claude[\w./*-]*|\b[\w.-]+\.(?:json|md|toml|yaml|yml)\b")

findings = []


def add(level, where, msg):
    findings.append((level, where, msg))


def load_questions():
    qs = []
    for path in sorted((DATA / "questions").glob("*.json")):
        try:
            items = json.load(open(path, encoding="utf-8"))
        except json.JSONDecodeError as e:
            add("ERROR", path.name, f"does not parse: {e}")
            continue
        for q in items:
            q["_file"] = path.name
        qs.extend(items)
    return qs


def blob(q):
    return " ".join(
        [q.get("stem", ""), q.get("explanation", "")]
        + [o.get("text", "") for o in q.get("options", [])]
        + list((q.get("why") or {}).values())
    )


def check_key_balance(qs):
    single = [q for q in qs if q.get("type") != "multi" and q.get("correct")]
    derived = [q for q in single if q.get("source") != "official"]
    if not derived:
        return
    counts = collections.Counter(q["correct"][0] for q in derived)
    total = len(derived)
    add("INFO", "key balance", "derived single-answer items: " + ", ".join(
        f"{k}={counts.get(k, 0)} ({counts.get(k, 0) / total * 100:.0f}%)" for k in "ABCD"))
    for k in "ABCD":
        share = counts.get(k, 0) / total
        if share > MAX_KEY_SHARE:
            add("ERROR", "key balance",
                f"option {k} is the answer in {share * 100:.0f}% of derived items "
                f"(limit {MAX_KEY_SHARE * 100:.0f}%). Run rebalance.py.")
        if counts.get(k, 0) == 0:
            add("ERROR", "key balance", f"option {k} is never the answer in derived items")

    # Per-file, because one lazy bank can hide inside a balanced total.
    by_file = collections.defaultdict(list)
    for q in derived:
        by_file[q["_file"]].append(q["correct"][0])
    for f, keys in sorted(by_file.items()):
        c = collections.Counter(keys)
        top, n = c.most_common(1)[0]
        if n / len(keys) > MAX_KEY_SHARE:
            add("ERROR", f, f"answer key skew: {top} in {n}/{len(keys)} items")


def check_length_bias(qs):
    longest_correct = 0
    deltas = []
    for q in qs:
        opts = q.get("options") or []
        if len(opts) != 4:
            continue
        lens = {o["key"]: len(o.get("text", "")) for o in opts}
        if max(lens, key=lens.get) in q["correct"]:
            longest_correct += 1
        cor = [v for k, v in lens.items() if k in q["correct"]]
        wrong = [v for k, v in lens.items() if k not in q["correct"]]
        if cor and wrong:
            deltas.append((sum(cor) / len(cor) - sum(wrong) / len(wrong), q["id"]))
    if not qs:
        return
    share = longest_correct / len(qs)
    add("INFO", "length bias",
        f"correct option is the longest in {longest_correct}/{len(qs)} items ({share * 100:.0f}%)")
    if share > MAX_LONGEST_CORRECT:
        add("ERROR", "length bias",
            f"{share * 100:.0f}% exceeds the {MAX_LONGEST_CORRECT * 100:.0f}% limit; "
            "a candidate can guess by picking the longest option")

    deltas.sort(reverse=True)
    med = deltas[len(deltas) // 2][0] if deltas else 0
    add("INFO", "length bias", f"median correct-minus-distractor length: {med:+.0f} chars")
    over = [(round(d), i) for d, i in deltas if d > MAX_LEN_DELTA]
    if over:
        add("WARN", "length bias",
            f"{len(over)} items where the correct option runs more than {MAX_LEN_DELTA} chars long. "
            f"Worst: {', '.join(f'{i} ({d:+})' for d, i in over[:10])}")

    # Throwaway distractors read as filler and make the item easier than it looks.
    for q in qs:
        for o in q.get("options", []):
            if o["key"] not in q["correct"] and len(o.get("text", "")) < MIN_DISTRACTOR:
                add("WARN", q["id"], f"distractor {o['key']} is only {len(o['text'])} chars, likely filler")


def check_out_of_scope(qs, cards):
    hits = collections.defaultdict(list)
    for q in qs:
        text = blob(q)
        for label, pat in OUT_OF_SCOPE.items():
            if re.search(pat, text, re.I):
                # If it appears in the stem or the keyed answer, the item turns on it.
                keyed = q.get("stem", "") + " " + " ".join(
                    o["text"] for o in q.get("options", []) if o["key"] in q["correct"])
                level = "ERROR" if re.search(pat, keyed, re.I) else "WARN"
                hits[label].append((level, q["id"]))
    for c in cards:
        text = c.get("front", "") + " " + c.get("back", "")
        for label, pat in OUT_OF_SCOPE.items():
            if re.search(pat, text, re.I):
                hits[label].append(("ERROR", c["id"]))

    for label, items in sorted(hits.items()):
        errs = [i for lvl, i in items if lvl == "ERROR"]
        warns = [i for lvl, i in items if lvl == "WARN"]
        if errs:
            add("ERROR", "out of scope", f"{label} is tested by: {', '.join(errs[:12])}")
        if warns:
            add("WARN", "out of scope", f"{label} mentioned in a distractor: {', '.join(warns[:12])}")
    if not hits:
        add("INFO", "out of scope", "no excluded topics detected")


def check_invented_identifiers(qs, cards):
    """Flag anything shaped like a CLI flag or config file that the guide never names.

    Two distinct failures matter here. A fabricated identifier presented as real
    teaches the candidate something false. A known-false identifier is fine as a
    distractor, and a defect if it is ever the keyed answer.
    """
    suspects = collections.Counter()

    def tokens(text):
        return {m.strip().rstrip(".") for m in FLAG_RE.findall(text) + CONFIG_RE.findall(text)}

    def denied(text, tok):
        """True when the text says this identifier is fake, which is the correct thing to teach."""
        window = re.escape(tok) + r".{0,90}?" if True else ""
        near = r"(?:does not exist|do not exist|is not a|are not|not a real|no such|is wrong|are all wrong|does not|non-existent|nonexistent|invented|fictional|not a Claude Code feature|is not)"
        return bool(
            re.search(window + near, text, re.I | re.S)
            or re.search(near + r".{0,90}?" + re.escape(tok), text, re.I | re.S)
        )

    for q in qs:
        keyed = q.get("stem", "") + " " + " ".join(
            o["text"] for o in q.get("options", []) if o["key"] in q["correct"])
        full = blob(q)
        for tok in tokens(keyed):
            if tok in KNOWN_FALSE and not denied(full, tok):
                add("ERROR", q["id"], f"'{tok}' does not exist and is presented as real in the stem or keyed answer")
        for tok in tokens(full):
            if (tok in KNOWN_IDENTIFIERS or tok in KNOWN_FALSE
                    or LEGIT_PATH_RE.match(tok) or EXAMPLE_FILE_RE.match(tok)):
                continue
            suspects[tok] += 1

    for c in cards:
        text = c.get("front", "") + " " + c.get("back", "")
        for tok in tokens(text):
            if tok in KNOWN_FALSE:
                if not denied(text, tok):
                    add("ERROR", c["id"], f"'{tok}' does not exist but the card does not say so")
            elif (tok not in KNOWN_IDENTIFIERS and not LEGIT_PATH_RE.match(tok)
                  and not EXAMPLE_FILE_RE.match(tok)):
                suspects[tok] += 1

    if suspects:
        add("WARN", "identifiers",
            "outside the guide's known set, confirm each is real or a deliberate distractor: "
            + ", ".join(f"{t} x{n}" for t, n in suspects.most_common(15)))
    else:
        add("INFO", "identifiers", "every flag and config path is either known-real or a known distractor")


def check_duplicates(qs):
    def toks(s):
        return set(re.sub(r"[^a-z0-9 ]", "", s.lower()).split())

    pairs = []
    for a, b in itertools.combinations(qs, 2):
        ta, tb = toks(a.get("stem", "")), toks(b.get("stem", ""))
        if not ta or not tb:
            continue
        j = len(ta & tb) / len(ta | tb)
        if j > DUP_JACCARD:
            pairs.append((round(j, 2), a["id"], b["id"]))
    pairs.sort(reverse=True)
    if pairs:
        add("WARN", "duplication",
            f"{len(pairs)} near-duplicate stem pair(s): "
            + "; ".join(f"{x}~{y} ({j})" for j, x, y in pairs[:10]))
    else:
        add("INFO", "duplication", "no near-duplicate stems")

    # Identical option text inside one item makes two answers indistinguishable.
    for q in qs:
        texts = [o.get("text", "").strip().lower() for o in q.get("options", [])]
        if len(set(texts)) != len(texts):
            add("ERROR", q["id"], "two options have identical text")


def check_coverage(qs, cards, exam, objectives):
    weights = {d["id"]: d["weight"] for d in exam["domains"]}
    items = exam["meta"]["items"]
    by_dom = collections.Counter(q["domain"] for q in qs)
    add("INFO", "coverage", f"{len(qs)} questions, {len(cards)} cards")

    for d in exam["domains"]:
        draw = round(items * d["weight"] / 100)
        have = by_dom.get(d["id"], 0)
        ratio = have / draw if draw else 0
        note = f"{d['id']} {d['weight']}%: {have} questions for a draw of {draw} ({ratio:.1f}x)"
        if ratio < 1.5:
            add("ERROR", "coverage", note + " — too few to avoid heavy repetition across attempts")
        elif ratio < 2.5:
            add("WARN", "coverage", note + " — thin, attempts will overlap noticeably")
        else:
            add("INFO", "coverage", note)

    if len(qs) < items * 2:
        add("WARN", "coverage",
            f"{len(qs)} questions for a {items}-item exam means about {items / len(qs) * 100:.0f}% "
            "of the bank appears in every attempt")

    task_ids = [t["id"] for tasks in objectives.values() for t in tasks]
    by_task = collections.Counter(q["task"] for q in qs)
    thin = [t for t in task_ids if by_task.get(t, 0) < 3]
    missing = [t for t in task_ids if by_task.get(t, 0) == 0]
    if missing:
        add("ERROR", "coverage", f"task statements with no questions: {', '.join(missing)}")
    if thin:
        add("WARN", "coverage", f"task statements with fewer than 3 questions: {', '.join(thin)}")

    by_scen = collections.Counter(q.get("scenario") for q in qs)
    add("INFO", "coverage", "per scenario: " + ", ".join(
        f"{s['id']}={by_scen.get(s['id'], 0)}" for s in exam["scenarios"]))
    for s in exam["scenarios"]:
        if by_scen.get(s["id"], 0) < 12:
            add("WARN", "coverage",
                f"scenario {s['id']} has only {by_scen.get(s['id'], 0)} questions; "
                "a draw including it will lean on the same items")

    multi = sum(1 for q in qs if q.get("type") == "multi")
    add("INFO", "format", f"multiple-response items: {multi}/{len(qs)} ({multi / len(qs) * 100:.0f}%)")
    if not 8 <= multi / len(qs) * 100 <= 30:
        add("WARN", "format", "multiple-response share is outside the 8-30% band the real exam suggests")


def check_prose(qs, cards):
    for item in list(qs) + list(cards):
        text = json.dumps(item, ensure_ascii=False)
        if "—" in text:
            add("WARN", item["id"], "contains an em dash (house style bans them)")
        if "  " in item.get("stem", ""):
            add("WARN", item["id"], "double space in stem")

    short = [q["id"] for q in qs if len(q.get("stem", "")) < MIN_STEM]
    if short:
        add("WARN", "stems", f"{len(short)} stems under {MIN_STEM} chars, likely not scenario-grounded: "
            + ", ".join(short[:12]))

    # An explanation naming an option letter breaks if the options are ever reshuffled.
    letter = [q["id"] for q in qs
              if re.search(r"\b(?:Option|Options|Answer)\s+[A-D]\b",
                           q.get("explanation", "") + " " + " ".join((q.get("why") or {}).values()))]
    if letter:
        add("WARN", "explanations",
            f"{len(letter)} explanations name an option letter, which breaks under reshuffling: "
            + ", ".join(letter[:12]))

    # Cards whose back is a long list are hard to self-grade.
    for c in cards:
        back = c.get("back", "")
        if back.count(",") >= 4 or back.count(";") >= 3:
            add("WARN", c["id"], "card back reads as a list; consider splitting it")
        if len(back) > 400:
            add("WARN", c["id"], f"card back is {len(back)} chars, too long to recall")


def main():
    exam = json.load(open(DATA / "exam.json", encoding="utf-8"))
    objectives = json.load(open(DATA / "objectives.json", encoding="utf-8"))
    qs = load_questions()
    try:
        cards = json.load(open(DATA / "flashcards.json", encoding="utf-8"))
    except FileNotFoundError:
        cards = []

    check_key_balance(qs)
    check_length_bias(qs)
    check_out_of_scope(qs, cards)
    check_invented_identifiers(qs, cards)
    check_duplicates(qs)
    check_coverage(qs, cards, exam, objectives)
    check_prose(qs, cards)

    order = {"ERROR": 0, "WARN": 1, "INFO": 2}
    findings.sort(key=lambda f: (order[f[0]], f[1]))

    counts = collections.Counter(f[0] for f in findings)
    print("=" * 74)
    print(f"CCAR-F data audit: {counts['ERROR']} errors, {counts['WARN']} warnings, {counts['INFO']} notes")
    print("=" * 74)
    current = None
    for level, where, msg in findings:
        if level != current:
            print()
            current = level
        print(f"  {level:<5} {where:<16} {msg}")
    print()

    if counts["ERROR"]:
        print("Fix the errors before studying from this bank.")
    elif counts["WARN"]:
        print("No errors. Review the warnings when you next touch the content.")
    else:
        print("Clean.")

    return 1 if (counts["ERROR"] and "--strict" in sys.argv) else 0


if __name__ == "__main__":
    sys.exit(main())
