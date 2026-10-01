#!/usr/bin/env python3
"""Build site/data.json from the Claude Code session transcript.

Adapted from the slack-video-recreation replay site's build_data.py. It
snapshots the session JSONL and its subagent transcripts, cuts the main
transcript at the prompt that asked for this website, and writes a scrubbed
data.json for the static site. Curated summaries live in CURATED_* below and
are matched to prompts by text prefix.

Usage:
    python3 tools/build_site_data.py              # defaults below
    python3 tools/build_site_data.py --no-media   # skip encoding the videos

Organization-specific terms to scrub are read one per line from
tools/scrub_terms.local.txt, which must stay out of version control.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import tempfile

HOME = os.path.expanduser("~")
SESSION_ID = "8e1abaa4-6bd3-4360-abc3-251142b0b31c"
PROJECT_LOG_DIR = os.path.join(HOME, ".claude/projects/-Users-" + os.path.basename(HOME))
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
SITE_DIR = os.path.join(PROJECT_DIR, "site")

# The replay stops before this prompt (the request for this website).
STOP_PROMPT_PREFIX = "Build a similar site"
SOURCE_POST = "https://x.com/byshubh/status/2104974911425196258"

# --------------------------------------------------------------------------
# Pricing (USD per million tokens), same table as the reference site.
# --------------------------------------------------------------------------
PRICING = {
    "claude-opus-5-5": {
        "label": "Claude Opus 5.5",
        "input": 4.00, "output": 20.00,
        "cache_write_5m": 5.00, "cache_write_1h": 8.00, "cache_read": 0.20,
    },
    "claude-sonnet-5-5": {
        "label": "Claude Sonnet 5.5",
        "input": 2.00, "output": 10.00,
        "cache_write_5m": 2.50, "cache_write_1h": 4.00, "cache_read": 0.20,
    },
}
PRICING_SOURCE = (
    "Anthropic first-party API list prices from the claude-api skill "
    "(model table cached 2026-09-25). Cache writes are 1.25x input for the "
    "5-minute TTL and 2x input for the 1-hour TTL."
)

IDLE_GAP_SECONDS = 300

SEGMENTS = [
    {"key": "a", "label": "0-3.9 s", "title": "Spheres, logo and icon morph"},
    {"key": "b", "label": "3.7-9.3 s", "title": "Headline, suggestions and prompt box"},
    {"key": "c", "label": "9.2-14.68 s", "title": "Click, Runner thinking and grid card"},
]
SEGMENT_HINTS = [
    ("0-3.9", "a"), ("blobs/logo", "a"),
    ("3.7-9.3", "b"), ("text/carousel", "b"),
    ("9.2-14.68", "c"), ("click/thinking", "c"),
]

# --------------------------------------------------------------------------
# Curated, human-written summaries, matched by prompt prefix.
# --------------------------------------------------------------------------
CURATED_PROMPTS = [
    ("Make a new folder in ~/, Try recreating this video", [
        "Mapped the 14.7-second Runner promo shot by shot, rebuilt it as a deterministic web page captured frame by frame, and ran two rounds of three parallel critics, taking SSIM from 0.862 to 0.918 before sending it to a third.",
        "Created ~/video-recreation, copied in the clip and its mp3, and probed them (1920x1080, 24 fps, 14.68 s). It cut contact sheets at 2 and 4 fps and full-resolution stills to map every shot: the metaball spheres, the Runner logo ring, an icon morphing into a chat bubble, the \"Ask about anything\" headline, a suggestion wheel, the prompt box, the click, Runner thinking and a 0/1 grid card.",
        "Timed the cuts with librosa onset detection on the mp3 and picked fonts by measuring text widths against crops of the reference: Geist first, then Figtree and Open Sans after round two.",
        "Wrote the whole piece as one page (src/index.html and src/comp.js) with a seek(t) function that draws any frame from scratch. The spheres and the logo use a custom WebGL signed-distance-field shader. The text, wheel, prompt box, cursor, loader and grid are DOM, SVG and canvas. render.mjs captures every frame with Playwright and assemble.py builds the mp4 with ffmpeg, muxing the original mp3 in unchanged. A full render takes about 25 to 30 seconds.",
        "Built its own checks before calling in critics: compare.sh stacks reference and recreation frames into sheets, and score.sh prints SSIM per second and the worst frames. After two rounds of fixes from its own sheets, the first scored render (with 4-subframe motion blur) measured 0.862.",
        "Launched three background critics, one per segment (0-3.9 s, 3.7-9.3 s, 9.2-14.68 s). Each could read the source but not edit it, and had to return measured corrections mapped to parameter names plus a 1-10 score. Round one scored 3, 4 and 4.5.",
        "Rewrote scenes A to G against those numbers. All three critics found that the reference has no motion blur, so it dropped the 4-subframe blur for crisp single samples. SSIM rose to 0.9125. Round two scored 6, 7 and 6, and its fixes took SSIM to 0.9164. A regression in the 10-11 s click section cost 0.03 in that second; after fixing it, SSIM reached 0.9184 and it sent the render to round three.",
    ]),
    ("I think we should be done after this", [
        "Agreed to make critic round three the last pass. It applied all three reports (scores 5, 7 and 6), rendered the final version at SSIM 0.9256 and handed it over.",
        "The round-three fixes: fused necks on the header logo instead of loose dots, a clockwise sweep on the send-button glow, a cursor offset bug, button release timing, collapse timing measured ball by ball, and a grid that zooms uniformly.",
        "Its handover listed where the recreation still differs. The intro spheres (0-1.15 s) are the weakest stretch. The random digit grid in the last 0.4 s cannot match pixel for pixel, though it looks right. The speech-bubble tail lacks a slight hook, and the original has fine film grain on the text.",
    ]),
    ("Make a side by side comparison video", [
        "Rendered a 1920x1080 side-by-side video, with the original on the left labelled \"Original\" and the recreation on the right labelled \"Opus 5.5\". Both play in sync over the original audio. It checked a frame at 6.5 s to confirm the halves line up.",
    ]),
]

CURATED_VERSIONS = {
    1: "First full render, one sample per frame. Spheres had a ring artifact and the logo pairs did not fuse.",
    2: "Shader shading, typing timing, label sizes, cursor and camera fixed from Claude's own comparison sheets.",
    3: "First scored render, with 4-subframe motion blur. Sent to critic round one.",
    4: "Scenes A to G rewritten against round-one measurements. Motion blur dropped for crisp single samples.",
    5: "Round-two fixes: Figtree and Open Sans, a teal hue ramp, staggered collapse, new icon geometry.",
    6: "Fixed a regression in the 10-11 s click section. Sent to critic round three.",
    7: "Round-three fixes: fused logo necks, clockwise send glow, cursor path, zooming grid. Final.",
}

TAKEAWAYS = [
    {
        "title": "One prompt set up the whole loop",
        "body": "\"Have a judge of critics at the end analyze so you iterative loop until it looks the same\" got Claude to build comparison sheets, an SSIM scorer and a three-critic panel on its own. The user's only other message in the next 84 minutes was the one that ended it.",
    },
    {
        "title": "Pinning the audio removed a whole problem",
        "body": "\"use the exact mp3 audio, no need to generate any new audio\" meant the soundtrack was muxed in unchanged and every iteration went to the picture. In the earlier Slack recreation, matching the score took several extra prompts and renders.",
    },
    {
        "title": "Critics split by time returned numbers, not opinions",
        "body": "Each critic owned one overlapping slice of the video and had to return pixel coordinates, RGB values and timings mapped to parameter names. Claude could apply the reports directly, and the critics agreed on a finding none of them was asked about: the reference has no motion blur.",
    },
    {
        "title": "An objective metric kept the loop honest",
        "body": "SSIM after every full render caught a drop in the 10-11 s click section that no critic had reported yet. It also gave a steady signal while critic scores moved around: each round used fresh critics, so the first segment went from 6 to 5 even as its SSIM held.",
    },
    {
        "title": "A one-line stop condition ended it cleanly",
        "body": "\"I think we should be done after this\" turned round three into the final pass. Claude applied those fixes, rendered once more and handed over the result with a list of what still differs.",
    },
]

# --------------------------------------------------------------------------
# Privacy scrub
# --------------------------------------------------------------------------
_USER = os.path.basename(HOME)
SCRUBS = [
    (re.compile(r"<system-reminder>[\s\S]*?</system-reminder>"), ""),
    (re.compile(r"/private/tmp/claude-\d+/[^/\s'\"`]+/[0-9a-f-]{36}/scratchpad"), "<scratchpad>"),
    (re.compile(r"/private/tmp/claude-\d+/[^\s'\"`]*"), "<tmp>"),
    (re.compile(re.escape(HOME)), "~"),
    (re.compile(r"/Users/[A-Za-z0-9._-]+"), "~"),
    (re.compile(r"/Users/"), "~/"),
    (re.compile(r"\$HOME"), "~"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email]"),
    (re.compile(r"\bs" + r"k-[A-Za-z0-9_-]{16,}"), "[key]"),
    (re.compile(r"\btool" + r"u_[A-Za-z0-9]+"), "[tool id]"),
    (re.compile(r"(?i)(authorization|x-api-key)\s*[:=]\s*\S+"), r"\1: [redacted]"),
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9._-]{16,}"), "Bearer [redacted]"),
    (re.compile(r"npm warn Unknown user config[^\n]*"), "npm warn Unknown user config [redacted]"),
    (re.compile(r"(?i)//(?:artifactory|jfrog)[^\s)'\"]*"), "[internal registry]"),
    (re.compile(re.escape(_USER), re.I), "user"),
]

EXTRA_SCRUB_FILE = os.path.join(TOOLS_DIR, "scrub_terms.local.txt")
if os.path.exists(EXTRA_SCRUB_FILE):
    for term in open(EXTRA_SCRUB_FILE).read().split():
        SCRUBS.insert(-1, (re.compile(r"(?i)[^\s'\"(]*" + re.escape(term) + r"[^\s'\"]*"), "[redacted]"))


def scrub(s):
    if isinstance(s, str):
        for pat, rep in SCRUBS:
            s = pat.sub(rep, s)
        return s.replace("\u2014", "-")
    if isinstance(s, list):
        return [scrub(x) for x in s]
    if isinstance(s, dict):
        return {k: scrub(v) for k, v in s.items()}
    return s


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def ts(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def load(path):
    out = []
    with open(path) as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            d["_i"] = i
            out.append(d)
    return out


def text_of(content):
    if isinstance(content, str):
        return content
    return "\n".join(b.get("text", "") for b in content or [] if b.get("type") == "text")


def has_image(content):
    return isinstance(content, list) and any(b.get("type") == "image" for b in content)


def usage_by_message(entries):
    seen = {}
    for d in entries:
        if d.get("type") != "assistant":
            continue
        m = d["message"]
        key = m.get("id") or d.get("requestId") or d.get("uuid")
        seen[key] = (m.get("model"), m.get("usage") or {})
    return seen


def sum_usage(msgs):
    tot = collections.Counter()
    cost = 0.0
    for model, u in msgs.values():
        cc = u.get("cache_creation") or {}
        w5 = cc.get("ephemeral_5m_input_tokens")
        w1 = cc.get("ephemeral_1h_input_tokens")
        if w5 is None and w1 is None:
            w5, w1 = u.get("cache_creation_input_tokens") or 0, 0
        row = {
            "input": u.get("input_tokens") or 0,
            "output": u.get("output_tokens") or 0,
            "cache_write_5m": w5 or 0,
            "cache_write_1h": w1 or 0,
            "cache_read": u.get("cache_read_input_tokens") or 0,
        }
        for k, v in row.items():
            tot[k] += v
        p = PRICING.get(model)
        if p:
            cost += sum(row[k] * p[k] for k in row) / 1e6
        tot["responses"] += 1
    t = dict(tot)
    t["cache_write"] = t.get("cache_write_5m", 0) + t.get("cache_write_1h", 0)
    t["cost_usd"] = round(cost, 4)
    return t


def tool_uses(entries):
    for d in entries:
        if d.get("type") != "assistant":
            continue
        for b in d["message"].get("content") or []:
            if b.get("type") == "tool_use":
                yield d, b


def result_text(content):
    if isinstance(content, str):
        return content
    parts = []
    for b in content or []:
        if b.get("type") == "text":
            parts.append(b.get("text", ""))
        elif b.get("type") == "image":
            parts.append("[image]")
    return "\n".join(parts)


def tool_results(entries):
    out = {}
    for d in entries:
        if d.get("type") == "user" and isinstance(d["message"].get("content"), list):
            for b in d["message"]["content"]:
                if b.get("type") == "tool_result":
                    out[b.get("tool_use_id")] = (result_text(b.get("content")), bool(b.get("is_error")), d)
    return out


FILE_PATTERNS = [
    r"cat > ([\w./-]+) <<",
    r"\bp\s*=\s*'([\w./-]+\.(?:js|html|py|mjs|sh))'",
    r"\bh\s*=\s*'([\w./-]+\.(?:js|html))'",
    r"sed -i '' .*? ([\w./-]+\.(?:py|js|html))\b",
]


def files_from_command(cmd):
    out = set()
    for p in FILE_PATTERNS:
        for f in re.findall(p, cmd):
            if "scratchpad" not in f and not f.startswith("/private"):
                out.add(os.path.basename(f))
    return out


FULL_RENDER_RE = re.compile(r"rendered (\d{3}) frames x(\d+) in ([\d.]+)s")
SSIM_RE = re.compile(r"overall SSIM ([\d.]+)")
SCORE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*/\s*10\b")


def segment_of(description):
    for hint, key in SEGMENT_HINTS:
        if hint in (description or ""):
            return key
    return None


def round_of(description):
    m = re.search(r"round (\d+)", description or "", re.I)
    return int(m.group(1)) if m else 1


def friendly_name(description):
    seg = segment_of(description)
    if seg:
        s = next(x for x in SEGMENTS if x["key"] == seg)
        return "critic " + s["label"] + ", round " + str(round_of(description))
    return description or "subagent"


def first_score(body):
    for m in SCORE_RE.finditer(body):
        v = float(m.group(1))
        if v <= 10:
            return v
    return None


def handback_body(txt):
    body = txt.split("The report follows:", 1)[-1].split("</agent-message>", 1)[0]
    return "\n".join(line[2:] if line.startswith("  ") else line for line in body.splitlines()).strip()


VERDICT_RE = re.compile(r"(?i)score[^/]{0,40}?(\d+(?:\.\d+)?)\s*/\s*10\b")


def final_score(body):
    """Critics end with 'Similarity score: N/10'; take the last such verdict."""
    hits = [float(m.group(1)) for m in VERDICT_RE.finditer(body) if float(m.group(1)) <= 10]
    return hits[-1] if hits else first_score(body[:400])


# --------------------------------------------------------------------------
# Main build
# --------------------------------------------------------------------------
def snapshot(session_file, subagent_dir):
    snap = tempfile.mkdtemp(prefix="session-snap-")
    taken = dt.datetime.now(dt.timezone.utc)
    shutil.copy2(session_file, os.path.join(snap, "main.jsonl"))
    sub = os.path.join(snap, "subagents")
    if os.path.isdir(subagent_dir):
        shutil.copytree(subagent_dir, sub)
    else:
        os.makedirs(sub)
    return snap, taken


def cut_at_stop(main):
    for d in main:
        if d.get("type") == "user" and (d.get("origin") or {}).get("kind") == "human":
            if text_of(d["message"]["content"]).strip().startswith(STOP_PROMPT_PREFIX):
                return [x for x in main if x["_i"] < d["_i"]], d["timestamp"]
    return main, None


def build(session_file, subagent_dir):
    snap, taken = snapshot(session_file, subagent_dir)
    main, cut_at = cut_at_stop(load(os.path.join(snap, "main.jsonl")))
    main_tool_ids = {b.get("id") for _, b in tool_uses(main)}

    # ---- subagents launched before the cut
    subagents, sub_entries_all = [], []
    for meta_path in sorted(glob.glob(os.path.join(snap, "subagents", "*.meta.json"))):
        meta = json.load(open(meta_path))
        if meta.get("toolUseId") not in main_tool_ids:
            continue
        aid = os.path.basename(meta_path).replace(".meta.json", "").replace("agent-", "")
        jl = meta_path.replace(".meta.json", ".jsonl")
        entries = load(jl) if os.path.exists(jl) else []
        sub_entries_all.extend(entries)
        models = collections.Counter(d["message"].get("model") for d in entries if d.get("type") == "assistant")
        tools = collections.Counter(b["name"] for _, b in tool_uses(entries))
        stamps = [ts(d["timestamp"]) for d in entries if d.get("timestamp")]
        subagents.append({
            "id": aid,
            "description": meta.get("description"),
            "name": friendly_name(meta.get("description")),
            "segment": segment_of(meta.get("description")),
            "round": round_of(meta.get("description")),
            "model": models.most_common(1)[0][0] if models else meta.get("model"),
            "tool_use_id": meta.get("toolUseId"),
            "usage": sum_usage(usage_by_message(entries)),
            "tool_calls": dict(tools.most_common()),
            "tool_calls_total": sum(tools.values()),
            "first": min(stamps).isoformat() if stamps else None,
            "last": max(stamps).isoformat() if stamps else None,
        })
    subagents.sort(key=lambda s: (s["round"], s["segment"] or ""))
    sub_by_id = {s["id"]: s for s in subagents}
    sub_by_tool = {s["tool_use_id"]: s for s in subagents}
    results = tool_results(main)

    # ---- walk the main transcript
    prompts, events, renders = [], [], []
    seen_hb = set()
    tool_counter = collections.Counter()
    for d in main:
        t = d.get("type")
        o = d.get("origin") or {}
        if t == "assistant":
            for b in d["message"].get("content") or []:
                if b.get("type") != "tool_use":
                    continue
                tool_counter[b["name"]] += 1
                if b["name"] == "Bash":
                    res = (results.get(b.get("id")) or ("",))[0]
                    m = FULL_RENDER_RE.search(res)
                    if m and int(m.group(1)) >= 350:
                        sm = SSIM_RE.search(res)
                        renders.append({"at": d["timestamp"], "_i": d["_i"], "samples": int(m.group(2)),
                                        "seconds": float(m.group(3)),
                                        "ssim": float(sm.group(1)) if sm else None})
            continue
        prompt_content = None
        if t == "user" and o.get("kind") == "human":
            prompt_content, typed_at, queued = d["message"]["content"], d["timestamp"], False
        elif t == "attachment" and (d.get("attachment") or {}).get("type") == "queued_command":
            a = d["attachment"]
            p = a.get("prompt")
            ptxt = p if isinstance(p, str) else text_of(p)
            if (a.get("origin") or {}).get("kind") == "human":
                prompt_content, typed_at, queued = p, a.get("timestamp") or d["timestamp"], True
            elif "<agent-message from=" in ptxt:
                _report(ptxt, d, sub_by_id, seen_hb, events)
                continue
            else:
                continue
        elif t == "user" and o.get("kind") == "peer":
            _report(text_of(d["message"]["content"]), d, sub_by_id, seen_hb, events)
            continue
        elif t == "user":
            c = d["message"]["content"]
            txt = c if isinstance(c, str) else text_of(c)
            if txt.startswith("[Request interrupted by user"):
                events.append({"kind": "interrupt", "at": d["timestamp"], "_i": d["_i"]})
            continue
        if prompt_content is None:
            continue
        txt = prompt_content if isinstance(prompt_content, str) else text_of(prompt_content)
        txt = re.sub(r"\s*\n\s+", " ", txt).strip()
        prompts.append({"_i": d["_i"], "at": typed_at, "text": txt, "image": has_image(prompt_content), "queued": queued})

    for n, r in enumerate(renders):
        r["version"] = n + 1
        r["note"] = CURATED_VERSIONS.get(n + 1, "")

    # ---- per-prompt facts
    prompts.sort(key=lambda p: p["_i"])
    bounds = [p["_i"] for p in prompts] + [10 ** 9]
    for n, p in enumerate(prompts):
        lo, hi = bounds[n], bounds[n + 1]
        tools, files, agents, last_text = collections.Counter(), set(), [], None
        for d in main:
            if not (lo < d["_i"] < hi) or d.get("type") != "assistant":
                continue
            for b in d["message"].get("content") or []:
                if b.get("type") == "text" and b["text"].strip():
                    last_text = b["text"].strip()
                if b.get("type") != "tool_use":
                    continue
                name, inp = b["name"], b.get("input") or {}
                if name == "ToolSearch":
                    continue
                tools[name] += 1
                if name in ("Write", "Edit"):
                    files.add(os.path.basename(inp.get("file_path", "")))
                if name == "Bash":
                    files |= files_from_command(inp.get("command", ""))
                if name == "Agent":
                    s = sub_by_tool.get(b.get("id")) or {}
                    agents.append({"name": s.get("name") or inp.get("description"), "round": s.get("round")})
        p["tools"] = dict(tools.most_common())
        p["files"] = sorted(f for f in files if f)
        p["agents_launched"] = agents
        p["renders"] = [r["version"] for r in renders if lo < r["_i"] < hi]
        p["last_reply"] = (last_text or "")[:900]
        p["summary"] = next((s for pre, s in CURATED_PROMPTS if p["text"].startswith(pre)), [])
    for e in events:
        e["segment"] = next((n for n in range(len(prompts)) if bounds[n] < e["_i"] < bounds[n + 1]), None)

    # ---- critic scores: one series per segment, one point per round
    scores = []
    for seg in SEGMENTS:
        pts = []
        for e in events:
            s = sub_by_id.get(e.get("agent_id"))
            if e["kind"] == "report" and s and s["segment"] == seg["key"] and e["score"] is not None:
                pts.append({"round": s["round"], "score": e["score"]})
        scores.append({**seg, "points": sorted(pts, key=lambda x: x["round"])})

    # ---- stats
    start = ts(prompts[0]["at"])
    end = max(ts(d["timestamp"]) for d in main if d.get("type") == "assistant")
    stamps = sorted({ts(d["timestamp"]) for d in main + sub_entries_all
                     if d.get("timestamp") and d.get("type") in ("user", "assistant", "attachment")})
    stamps = [x for x in stamps if start <= x <= end]
    gaps = [(b - a).total_seconds() for a, b in zip(stamps, stamps[1:])]
    active = sum(g for g in gaps if g <= IDLE_GAP_SECONDS)
    idle_gaps = [[x.isoformat(), y.isoformat()] for x, y in zip(stamps, stamps[1:])
                 if (y - x).total_seconds() > IDLE_GAP_SECONDS]
    main_usage = sum_usage(usage_by_message(main))
    sub_tools = collections.Counter()
    for s in subagents:
        sub_tools.update(s["tool_calls"])
    totals = collections.Counter()
    for u in [main_usage] + [s["usage"] for s in subagents]:
        for k, v in u.items():
            totals[k] += v
    totals["cost_usd"] = round(totals["cost_usd"], 2)
    main_models = collections.Counter(d["message"].get("model") for d in main if d.get("type") == "assistant")

    data = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "snapshot_at": taken.isoformat(timespec="seconds"),
        "cut_at": cut_at,
        "session": {
            "start": start.isoformat(), "end": end.isoformat(),
            "wall_clock_seconds": int((end - start).total_seconds()),
            "active_seconds": int(active),
            "idle_gap_threshold_seconds": IDLE_GAP_SECONDS,
            "idle_gaps": idle_gaps,
            "main_model": main_models.most_common(1)[0][0] if main_models else None,
            "cli_version": next((d.get("version") for d in main if d.get("version")), None),
            "source_post": SOURCE_POST,
        },
        "counts": {
            "user_prompts": len(prompts),
            "queued_prompts": sum(p["queued"] for p in prompts),
            "interruptions": sum(e["kind"] == "interrupt" for e in events),
            "assistant_responses_main": main_usage.get("responses", 0),
            "tool_calls_main": dict(tool_counter.most_common()),
            "tool_calls_main_total": sum(tool_counter.values()),
            "tool_calls_subagents": dict(sub_tools.most_common()),
            "tool_calls_subagents_total": sum(sub_tools.values()),
            "subagents": len(subagents),
            "critic_rounds": max((s["round"] for s in subagents), default=0),
            "renders": len(renders),
            "scored_renders": sum(r["ssim"] is not None for r in renders),
        },
        "usage": {"main": main_usage, "total": dict(totals)},
        "pricing": {"models": {k: v for k, v in PRICING.items() if k in main_models or any(s["model"] == k for s in subagents)},
                    "source": PRICING_SOURCE},
        "segments": SEGMENTS,
        "subagents": [{k: v for k, v in s.items() if k not in ("id", "tool_use_id", "description")} for s in subagents],
        "scores": scores,
        "versions": renders,
        "prompts": prompts,
        "events": events,
        "takeaways": TAKEAWAYS,
        "replay": build_replay(main, sub_entries_all, sub_by_id, sub_by_tool, results),
    }
    shutil.rmtree(snap, ignore_errors=True)
    return strip_private(scrub(data))


def _report(txt, d, sub_by_id, seen, events):
    m = re.search(r'<agent-message from="([^"]+)"', txt)
    aid = m.group(1) if m else (d.get("origin") or {}).get("from")
    body = handback_body(txt)
    key = (aid, body[:200])
    if key in seen:
        return
    seen.add(key)
    s = sub_by_id.get(aid) or {}
    events.append({"kind": "report", "at": d.get("timestamp"), "_i": d["_i"], "agent_id": aid,
                   "agent": s.get("name") or "subagent", "round": s.get("round"),
                   "score": final_score(body)})


# --------------------------------------------------------------------------
# Replay log for the terminal hero
# --------------------------------------------------------------------------
REPLAY_INPUT_LIMIT = 1400
REPLAY_OUTPUT_LIMIT = 1400


def clip(s, limit):
    s = scrub(s or "")
    if len(s) <= limit:
        return s
    return s[:limit].rstrip() + f"\n... [{len(s) - limit} more characters]"


def tool_label(name, inp):
    if name == "Bash":
        return name, (inp.get("command") or "").strip()
    if name in ("Read", "Write", "Edit"):
        return name, inp.get("file_path", "")
    if name == "ToolSearch":
        return name, inp.get("query", "")
    return name, json.dumps(inp)[:200]


def tool_input_text(name, inp):
    if name == "Bash":
        return inp.get("command", "")
    if name == "Agent":
        return inp.get("prompt", "")
    if name == "Write":
        return inp.get("file_path", "") + "\n\n" + (inp.get("content") or "")
    return json.dumps(inp, indent=1)


def humanize_ids(text, id_names):
    text = re.sub(r"\s*\(background ID \w+\)", "", text)
    for aid, name in id_names.items():
        text = text.replace(aid, name).replace(aid[:7], name)
    return text


def build_replay(main, sub_entries_all, sub_by_id, sub_by_tool, results):
    id_names = {aid: s["name"] for aid, s in sub_by_id.items()}
    records = []
    for entries in (main, sub_entries_all):
        firsts = {}
        for d in entries:
            if d.get("type") != "assistant":
                continue
            m = d["message"]
            key = m.get("id") or d.get("requestId") or d.get("uuid")
            t0 = firsts[key][0] if key in firsts else ts(d["timestamp"])
            firsts[key] = (t0, m.get("model"), m.get("usage") or {})
        records.extend(firsts.values())
    usage_pts = []
    for t, model, u in records:
        one = sum_usage({"x": (model, u)})
        usage_pts.append((t, one["input"] + one["output"] + one["cache_write"] + one["cache_read"], one["cost_usd"]))
    usage_pts.sort()
    tool_pts = sorted(ts(d["timestamp"]) for d, _ in tool_uses(main + sub_entries_all))

    out, seen_hb = [], set()
    for d in main:
        t = d.get("type")
        o = d.get("origin") or {}
        at = d.get("timestamp")
        if t == "assistant":
            for b in d["message"].get("content") or []:
                if b.get("type") == "text" and b["text"].strip():
                    out.append({"t": "text", "at": at, "text": humanize_ids(b["text"].strip(), id_names)})
                elif b.get("type") == "tool_use":
                    name, inp = b["name"], b.get("input") or {}
                    shown, arg = tool_label(name, inp)
                    res, err, _ = results.get(b.get("id"), ("", False, None))
                    summary = None
                    if name == "Agent":
                        sub = sub_by_tool.get(b.get("id")) or {}
                        model = (PRICING.get(sub.get("model")) or {}).get("label", "").replace("Claude ", "")
                        arg = sub.get("name") or inp.get("description") or ""
                        summary = "Launched in the background" + (" on " + model if model else "")
                        res = summary + ". Task: " + arg
                    elif name == "ToolSearch":
                        summary = "Loaded tool: " + (inp.get("query") or "").replace("select:", "")
                        res = summary
                    ev = {"t": "tool", "at": at, "name": shown, "arg": humanize_ids(arg, id_names)[:600],
                          "input": clip(humanize_ids(tool_input_text(name, inp), id_names), REPLAY_INPUT_LIMIT),
                          "output": clip(humanize_ids(res, id_names), REPLAY_OUTPUT_LIMIT),
                          "lines": len(scrub(res).strip().splitlines()), "error": err}
                    if summary:
                        ev["summary"] = summary
                    out.append(ev)
            continue
        if t == "user" and o.get("kind") == "human":
            c = d["message"]["content"]
            out.append({"t": "prompt", "at": at, "text": re.sub(r"\s*\n\s+", " ", text_of(c)).strip(),
                        "image": has_image(c), "queued": False})
        elif t == "attachment" and (d.get("attachment") or {}).get("type") == "queued_command":
            a = d["attachment"]
            p = a.get("prompt")
            ptxt = p if isinstance(p, str) else text_of(p)
            if (a.get("origin") or {}).get("kind") == "human":
                out.append({"t": "prompt", "at": a.get("timestamp") or at, "text": ptxt.strip(),
                            "image": has_image(p), "queued": True})
            elif "<agent-message from=" in ptxt:
                _replay_report(ptxt, at, seen_hb, out, id_names)
        elif t == "user" and o.get("kind") == "peer":
            _replay_report(text_of(d["message"]["content"]), at, seen_hb, out, id_names)
        elif t == "user":
            c = d["message"]["content"]
            txt = c if isinstance(c, str) else text_of(c)
            if txt.startswith("[Request interrupted by user"):
                out.append({"t": "interrupt", "at": at})

    ui = ti = 0
    tok = cost = 0.0
    last = None
    for ev in out:
        t = ts(ev["at"])
        if last and t < last:
            t = last
        last = t
        while ui < len(usage_pts) and usage_pts[ui][0] <= t:
            tok += usage_pts[ui][1]
            cost += usage_pts[ui][2]
            ui += 1
        while ti < len(tool_pts) and tool_pts[ti] <= t:
            ti += 1
        ev["cum"] = [int(tok), round(cost, 4), ti]
    return out


def _replay_report(txt, at, seen, out, id_names):
    m = re.search(r'<agent-message from="([^"]+)"', txt)
    aid = m.group(1) if m else None
    body = handback_body(txt)
    key = (aid, body[:200])
    if key in seen:
        return
    seen.add(key)
    out.append({"t": "report", "at": at, "agent": id_names.get(aid, "subagent"),
                "score": final_score(body), "text": clip(humanize_ids(body, id_names), 1600)})


def strip_private(obj):
    if isinstance(obj, dict):
        return {k: strip_private(v) for k, v in obj.items() if not k.startswith("_") and k != "agent_id"}
    if isinstance(obj, list):
        return [strip_private(x) for x in obj]
    return obj


def encode_media():
    """Copy or re-encode the three videos into site/media and grab posters."""
    media = os.path.join(SITE_DIR, "media")
    os.makedirs(media, exist_ok=True)
    jobs = [
        (os.path.join(PROJECT_DIR, "ref/video.mp4"), "original", ["-c", "copy"]),
        (os.path.join(PROJECT_DIR, "out/recreation.mp4"), "recreation",
         ["-c:v", "libx264", "-crf", "22", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"]),
        (os.path.join(PROJECT_DIR, "out/side_by_side.mp4"), "side-by-side", ["-c", "copy"]),
    ]
    if not shutil.which("ffmpeg"):
        print("ffmpeg not found, skipping media")
        return
    for src, name, codec in jobs:
        if not os.path.exists(src):
            print("missing", src)
            continue
        dst = os.path.join(media, name + ".mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, *codec, "-movflags", "+faststart", dst], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "2.2", "-i", dst, "-frames:v", "1",
                        "-vf", "scale=960:-2", "-q:v", "4", os.path.join(media, name + ".jpg")], check=True)


def main_cli():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default=os.path.join(PROJECT_LOG_DIR, SESSION_ID + ".jsonl"))
    ap.add_argument("--subagents", default=os.path.join(PROJECT_LOG_DIR, SESSION_ID, "subagents"))
    ap.add_argument("--out", default=os.path.join(SITE_DIR, "data.json"))
    ap.add_argument("--no-media", action="store_true")
    args = ap.parse_args()
    data = build(args.session, args.subagents)
    with open(args.out, "w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    if not args.no_media:
        encode_media()
    c, u = data["counts"], data["usage"]["total"]
    print(f"wrote {args.out}: {c['user_prompts']} prompts, {c['renders']} full renders, "
          f"{c['subagents']} subagents, ${u['cost_usd']:.2f} estimated")


if __name__ == "__main__":
    main_cli()
