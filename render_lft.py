#!/usr/bin/env python3
"""Redraw LFT licks from Guitar Pro dump: white bg, real rhythms, articulations."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

SOLO = json.loads(Path("/workspace/gp-lft/lead_solo.json").read_text())
BARS = {b["measure"]: b for b in SOLO}
OUT = Path("/workspace/lick-app/svg")
OUT.mkdir(exist_ok=True)

# Guitar Pro / Songsterr tab numbers are Arial. Liberation Sans is Arial-metric.
FONT = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 14)
FONT_S = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 10)
FONT_L = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 14)
FONT_T = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf", 10)

COLORS = {"A": (42, 163, 214), "B": (32, 170, 64), "C": (196, 160, 0), "D": (208, 32, 48)}
FLAGS = {"Whole": 0, "Half": 0, "Quarter": 0, "Eighth": 1, "16th": 2, "32nd": 3, "64th": 4}

LICKS = {
    "LFT-1A": {"series": "A", "measures": [134]},
    "LFT-2A": {"series": "A", "measures": [135]},
    "LFT-3A": {"series": "A", "measures": [136]},
    "LFT-4A": {"series": "A", "measures": [138]},
    "LFT-5A": {"series": "A", "measures": [142]},
    "LFT-1B": {"series": "B", "measures": [143]},
    "LFT-2B": {"series": "B", "measures": [146]},
    "LFT-3B": {"series": "B", "measures": [148, 149]},
    "LFT-1C": {"series": "C", "measures": [130, 131, 132, 133], "extra": "Solo"},
    "LFT-1D": {"series": "D", "measures": [140]},
}

def disp_string(xml_s):
    # GPIF 0-based from low E -> tab 1=high E
    return 6 - int(xml_s)

def collect(measures):
    evs = []
    for mi, mnum in enumerate(measures):
        bar = BARS[mnum]
        u = 0.0
        for bt in bar["beats"]:
            rhy = bt["rhythm"]
            flags = FLAGS.get(rhy["value"], 1)
            tup = tuple(rhy["tuplet"]) if rhy["tuplet"] else None
            if bt["rest"] or not bt["notes"]:
                evs.append({
                    "bar": mi, "mnum": mnum, "u": u, "units": rhy["units"],
                    "flags": flags, "tuplet": tup, "rest": True,
                    "notes": [], "value": rhy["value"], "dots": rhy["dots"],
                })
            else:
                notes = []
                for n in bt["notes"]:
                    arts = n.get("art") or []
                    notes.append({
                        "s": disp_string(n["string"]),
                        "f": n["fret"],
                        "tie_o": n.get("tie_origin"),
                        "tie_d": n.get("tie_dest"),
                        "arts": arts,
                        "hopo": any(a.get("type") == "hopo" for a in arts),
                        "slide": any(a.get("type") == "slide" for a in arts),
                        "bend": next((a for a in arts if a.get("type") == "bend"), None),
                    })
                evs.append({
                    "bar": mi, "mnum": mnum, "u": u, "units": rhy["units"],
                    "flags": flags, "tuplet": tup, "rest": False,
                    "notes": notes, "value": rhy["value"], "dots": rhy["dots"],
                })
            u += rhy["units"]
    return evs

def units_of(value, dots=0, tuplet=None):
    DUR = {"Whole": 16, "Half": 8, "Quarter": 4, "Eighth": 2, "16th": 1, "32nd": 0.5}
    u = DUR[value]
    if dots:
        u *= (2 - 0.5 ** dots)
    if tuplet:
        u *= tuplet[1] / tuplet[0]
    return u

def bend_art(art):
    if art == "full":
        return {"type": "bend", "origin": 0, "middle": 0, "dest": 100,
                "origin_lab": None, "middle_lab": None, "dest_lab": "full"}
    if art == "full-rel":
        return {"type": "bend", "origin": 0, "middle": 100, "dest": 0,
                "origin_lab": None, "middle_lab": "full", "dest_lab": None}
    if art == "half":
        return {"type": "bend", "origin": 0, "middle": 0, "dest": 50,
                "origin_lab": None, "middle_lab": None, "dest_lab": "1/2"}
    return None

def collect_manual(measures):
    evs = []
    for mi, m in enumerate(measures):
        u = 0.0
        mnum = m["n"]
        for n in m["notes"]:
            value = n.get("value", "Eighth")
            dots = n.get("dots", 0)
            tup = tuple(n["tuplet"]) if n.get("tuplet") else None
            flags = FLAGS.get(value, 1)
            un = units_of(value, dots, tup)
            if n.get("rest") or n.get("f") == "r":
                evs.append({
                    "bar": mi, "mnum": mnum, "u": u, "units": un,
                    "flags": flags, "tuplet": tup, "rest": True,
                    "notes": [], "value": value, "dots": dots,
                })
            else:
                art = n.get("art")
                notes = [{
                    "s": n["s"], "f": n["f"],
                    "tie_o": bool(n.get("tie_o")), "tie_d": bool(n.get("tie_d")),
                    "arts": [],
                    "hopo": bool(n.get("hopo")),
                    "slide": art == "slide" or bool(n.get("slide")),
                    "bend": bend_art(art),
                    "stac": art == "stac",
                }]
                evs.append({
                    "bar": mi, "mnum": mnum, "u": u, "units": un,
                    "flags": flags, "tuplet": tup, "rest": False,
                    "notes": notes, "value": value, "dots": dots,
                })
            u += un
    return evs

def render(lid, spec):
    series = spec["series"]
    extra = spec.get("extra")
    if spec.get("manual"):
        measures_spec = spec["measures"]
        mnums = [m["n"] for m in measures_spec]
        evs = collect_manual(measures_spec)
    else:
        mnums = spec["measures"]
        evs = collect(mnums)
    nbar = len(mnums)
    UNIT = 36
    BAR_U = 16
    LEFT = 28
    TOP = 72
    GAP = 16
    STEM_TOP_OFF = 18
    H = TOP + 5 * GAP + 70
    W = int(LEFT + nbar * BAR_U * UNIT + 36)
    im = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    col = COLORS[series]

    def ly(s):
        return TOP + (s - 1) * GAP

    def bar_x(mi):
        return LEFT + mi * BAR_U * UNIT

    right = bar_x(nbar)
    for s in range(1, 7):
        d.line([(LEFT, ly(s)), (right, ly(s))], fill=(200, 200, 200), width=1)
    for mi, mnum in enumerate(mnums):
        x = bar_x(mi)
        d.line([(x, TOP), (x, ly(6))], fill=(168, 168, 168), width=1)
        d.text((x + 4, TOP - 14), str(mnum), fill=(150, 150, 150), font=FONT_S)
    d.line([(right, TOP), (right, ly(6))], fill=(168, 168, 168), width=1)
    d.text((right - 4, 8), lid, fill=col, font=FONT_L, anchor="ra")
    if extra:
        d.text((LEFT + 4, 8), extra, fill=(110, 110, 110), font=FONT_S)

    # positions
    for ev in evs:
        ev["x"] = bar_x(ev["bar"]) + ev["u"] * UNIT + 8

    # slurs for hopo chains and ties
    def slur(x0, y0, x1, y1, up=True):
        y = min(y0, y1) - (10 if up else -8)
        box = [x0 + 4, y - 6, x1 - 4, max(y0, y1) - 2]
        if box[2] <= box[0] + 4:
            return
        d.arc(box, 200, 340, fill=(50, 50, 50), width=1)

    # hopo slurs per string, consecutive only
    from collections import defaultdict
    chains = defaultdict(list)
    def flush_chain(s):
        pts = chains[s]
        if len(pts) >= 2:
            slur(pts[0][0], pts[0][1], pts[-1][0], pts[-1][1])
        chains[s] = []
    for ev in evs:
        if ev["rest"]:
            for s in list(chains):
                flush_chain(s)
            continue
        active = {n["s"] for n in ev["notes"] if n["hopo"]}
        for n in ev["notes"]:
            if n["hopo"]:
                chains[n["s"]].append((ev["x"], ly(n["s"])))
        for s in list(chains):
            if s not in active:
                flush_chain(s)
    for s in list(chains):
        flush_chain(s)

    # ties
    pending_tie = {}
    for ev in evs:
        if ev["rest"]:
            continue
        for n in ev["notes"]:
            key = n["s"]
            if n["tie_d"] and key in pending_tie:
                x0, y0 = pending_tie.pop(key)
                slur(x0, y0, ev["x"], ly(n["s"]))
            if n["tie_o"]:
                pending_tie[key] = (ev["x"], ly(n["s"]))

    # notes + articulations
    hold_bend = None  # (x, y, lab)
    for ev in evs:
        x = ev["x"]
        if ev["rest"]:
            y = ly(3)
            # simple GP-like quarter/8th rest blob
            # GP-style rest sitting on the tab (filled rectangle + stem)
            if ev["value"] in ("Whole", "Half"):
                d.rectangle([x - 8, ly(3) - 2, x + 8, ly(4) + 2], fill=(50, 50, 50))
            elif ev["value"] == "Quarter":
                d.polygon([(x, y - 10), (x + 6, y - 4), (x - 1, y + 2), (x + 7, y + 8), (x - 6, y + 1), (x + 2, y - 5)], fill=(40, 40, 40))
            else:
                d.line([(x, y - 6), (x, y + 6)], fill=(40, 40, 40), width=2)
                d.line([(x, y + 6), (x + 6, y + 2)], fill=(40, 40, 40), width=2)
            continue
        for n in ev["notes"]:
            y = ly(n["s"])
            txt = str(n["f"])
            tw = 9 if len(txt) == 1 else 12
            d.rounded_rectangle([x - tw, y - 8, x + tw, y + 8], radius=3, fill=(255, 255, 255))
            d.text((x, y), txt, fill=(17, 17, 17), font=FONT, anchor="mm")
            if n.get("stac"):
                d.ellipse([x - 1.6, y - 14, x + 1.6, y - 11], fill=(20, 20, 20))
            if n["slide"]:
                d.line([(x + tw + 1, y + 2), (x + tw + 14, y + 10)], fill=(40, 40, 40), width=2)
            bn = n["bend"]
            if bn:
                ov, mv, dv = bn["origin"], bn["middle"], bn["dest"]
                lab = bn.get("middle_lab") or bn.get("dest_lab") or bn.get("origin_lab") or "full"
                tip = y - 34  # arrowhead tip, well above the fret number
                if mv >= 50 and dv < 25 and ov < 25:
                    # bend and release: curve, then label above the peak
                    d.arc([x + 1, y - 32, x + 26, y - 6], 200, 20, fill=(34, 34, 34), width=2)
                    d.text((x + 13, y - 46), lab, fill=(40, 40, 40), font=FONT_T, anchor="ms")
                    hold_bend = None
                elif ov >= 50 and dv < 25:
                    d.arc([x - 2, y - 32, x + 20, y - 8], 20, 160, fill=(34, 34, 34), width=2)
                    d.text((x + 8, y - 46), lab, fill=(40, 40, 40), font=FONT_T, anchor="ms")
                    hold_bend = None
                else:
                    # GP-style: shaft, arrowhead, dashed hold, THEN "full" above the arrow
                    d.line([(x, y - 11), (x, tip + 5)], fill=(34, 34, 34), width=2)
                    d.polygon([(x, tip), (x - 4, tip + 8), (x + 4, tip + 8)], fill=(34, 34, 34))
                    if hold_bend and hold_bend[2] == lab:
                        hx, htip, _ = hold_bend
                        d.line([(hx + 5, htip + 2), (x - 5, tip + 2)], fill=(34, 34, 34), width=1)
                    d.text((x, tip - 4), lab, fill=(40, 40, 40), font=FONT_T, anchor="ms")
                    hold_bend = (x, tip, lab)
            else:
                hold_bend = None

    # rhythm stems + beams below staff
    ry0 = ly(6) + STEM_TOP_OFF
    stem_h = 12

    def beam_groups(events):
        groups, cur = [], []
        def flush():
            nonlocal cur
            if cur:
                groups.append(cur)
                cur = []
        for ev in events:
            if ev["rest"] or ev["flags"] == 0:
                flush()
                continue
            if not cur:
                cur = [ev]
                continue
            prev = cur[-1]
            same_bar = ev["bar"] == prev["bar"]
            same_beat = int(ev["u"] // 4) == int(prev["u"] // 4)
            same_tup = ev["tuplet"] and ev["tuplet"] == prev["tuplet"]
            # keep tuplets together only inside the same beat, so two "3"s don't merge
            if same_bar and same_beat and (ev["tuplet"] == prev["tuplet"]):
                cur.append(ev)
            else:
                flush()
                cur = [ev]
        flush()
        return groups

    for ev in evs:
        x = ev["x"]
        if ev["rest"]:
            continue
        d.line([(x, ry0), (x, ry0 + stem_h)], fill=(90, 90, 90), width=1)
        if ev["flags"] == 0:
            # quarter/half: just stem; add hook? skip
            pass
        if ev["dots"]:
            d.ellipse([x + 3, ry0 + stem_h - 2, x + 6, ry0 + stem_h + 1], fill=(90, 90, 90))

    for g in beam_groups(evs):
        if len(g) == 1:
            ev = g[0]
            x = ev["x"]
            for i in range(ev["flags"]):
                yb = ry0 + stem_h - 1 - i * 3
                d.line([(x, yb), (x + 7, yb - 3)], fill=(70, 70, 70), width=2)
            continue
        x0, x1 = g[0]["x"], g[-1]["x"]
        maxf = max(e["flags"] for e in g)
        for i in range(maxf):
            yb = ry0 + stem_h - i * 3
            # only draw beam where flags allow, split if needed
            segs, start = [], None
            for e in g:
                if e["flags"] > i:
                    if start is None:
                        start = e
                    end = e
                else:
                    if start is not None:
                        segs.append((start["x"], end["x"]))
                        start = None
            if start is not None:
                segs.append((start["x"], end["x"]))
            for a, b in segs:
                if a == b:
                    d.line([(a, yb), (a + 7, yb - 3)], fill=(70, 70, 70), width=2)
                else:
                    d.line([(a, yb), (b, yb)], fill=(70, 70, 70), width=2)
        # tuplet number
        t = g[0]["tuplet"]
        if t:
            cx = (x0 + x1) / 2
            d.text((cx, ry0 + stem_h + 8), str(t[0]), fill=(80, 80, 80), font=FONT_T, anchor="mt")
            d.line([(x0, ry0 + stem_h + 6), (cx - 6, ry0 + stem_h + 6)], fill=(120, 120, 120), width=1)
            d.line([(cx + 6, ry0 + stem_h + 6), (x1, ry0 + stem_h + 6)], fill=(120, 120, 120), width=1)

    path = OUT / f"{lid}.png"
    im.save(path)
    return path, im.size


def N(s, f, art=None, value="Eighth", dots=0, tuplet=None, **k):
    d = {"s": s, "f": f, "art": art, "value": value, "dots": dots, "tuplet": tuplet}
    d.update(k)
    return d
T8 = [3, 2]
T16 = [3, 2]

def bar(n, notes):
    return {"n": n, "notes": notes}

KYTL = {
"KYTL-2A": {"series": "A", "manual": True, "extra": "Guitar Solo 2", "measures": [
    bar(180, [
        N(3,7,"full", value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8),
        N(3,7,"full", value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8),
        N(2,5, value="Quarter"), N(3,7, value="Eighth"), N(3,5, value="Eighth"),
    ]),
    bar(181, [
        N(3,7,"full", value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8),
        N(3,7,"full", value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8),
        N(2,5, value="Quarter"), N(3,7, value="Eighth"), N(3,5, value="Eighth"),
    ]),
]},
"KYTL-8A": {"series": "A", "manual": True, "measures": [
    bar(192, [
        N(3,7,"full", value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8),
        N(3,7,"full-rel", value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(3,7, value="Eighth", tuplet=T8),
        N(2,5, value="Eighth", dots=1), N(2,5, value="16th", tie_o=True),
    ]),
    bar(193, [
        N(3,7,"full", value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8), N(3,7,"full-rel", value="Eighth", tuplet=T8),
        N(2,5, value="Eighth", tuplet=T8), N(3,7, value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8),
        N(3,7, value="Eighth", dots=1), N(2,5, value="16th", tuplet=T8), N(2,5, value="16th", tuplet=T8),
    ]),
]},
"KYTL-3A": {"series": "A", "manual": True, "measures": [
    bar(182, [
        N(2,8,"full", value="16th"), N(1,5, value="16th"), N(2,8, value="16th"), N(2,5, value="16th", slide=True),
        N(3,7, value="Eighth"), N(3,5, value="Eighth"),
        N(4,7, value="Eighth"), N(4,5, value="Eighth"),
    ]),
    bar(183, [
        N(4,7, value="Eighth"), N(3,7, value="Eighth"), N(3,5, value="Eighth"), N(4,7, value="Eighth"),
        N(4,5, value="Eighth"), N(4,3, value="Eighth"),
    ]),
]},
"KYTL-5A": {"series": "A", "manual": True, "measures": [
    bar(190, [
        N(1,8, value="Eighth", tuplet=T8), N(1,5, value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8),
        N(2,7, value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(3,7, value="Eighth", tuplet=T8),
        N(3,7, value="Eighth", tuplet=T8), N(3,7,"full", value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8),
        N(2,8, value="Eighth"),
    ]),
    bar(191, [
        N(2,8,"full", value="Eighth", tuplet=T8), N(1,5, value="Eighth", tuplet=T8), N(2,8, value="Eighth", tuplet=T8),
        N(2,5, value="Eighth", tuplet=T8), N(3,7, value="Eighth", tuplet=T8), N(3,5, value="Eighth", tuplet=T8),
        N(4,7, value="Eighth"), N(3,5, value="Eighth"),
    ]),
]},
"KYTL-7A": {"series": "A", "manual": True, "measures": [
    bar(194, [
        N(4,7, value="16th"), N(3,5, value="16th"), N(2,8,"full", value="16th"), N(3,5, value="16th"),
        N(2,8, value="Eighth", tuplet=T8), N(2,5, value="Eighth", tuplet=T8), N(3,8, value="Eighth", tuplet=T8),
        N(3,7, value="Eighth", tuplet=T8), N(3,5, value="Eighth", tuplet=T8), N(4,7, value="Eighth", tuplet=T8),
    ]),
]},
"KYTL-1A": {"series": "A", "manual": True, "measures": [
    bar(78, [
        N(2,10, value="16th", hopo=True), N(2,13, value="16th", hopo=True), N(2,10, value="16th", hopo=True),
        N(3,10, value="16th"), N(2,10, value="16th"), N(2,13,"full-rel", value="16th"),
        N(2,10, value="16th"), N(2,13, value="16th"), N(2,10, value="16th"),
        N(3,12,"full", value="Eighth"), N(3,10, value="16th"), N(3,12, value="16th"), N(3,10, value="16th"),
    ]),
    bar(79, [
        N(3,12,"full", value="16th"), N(2,10, value="16th"), N(1,10, value="16th"), N(1,13,"full", value="16th"),
        N(1,10,"stac", value="16th"), N(2,13,"stac", value="16th"), N(2,10,"stac", value="16th"),
        N(3,12, value="16th"), N(3,10, value="16th"), N(4,12, value="Eighth"),
    ]),
    bar(80, [
        N(3,12,"full-rel", value="Eighth"), N(2,10,"stac", value="Eighth"),
        N(3,12,"full", value="Eighth"), N(2,10,"stac", value="Eighth"),
        N(3,12,"full", value="Eighth"), N(2,10,"stac", value="Eighth"),
        N(3,12, value="Eighth"), N(2,10,"stac", value="Eighth"),
    ]),
    bar(81, [
        N(3,12,"full", value="Eighth"), N(3,12,"full", value="Eighth"),
        N(3,12,"full", value="Eighth"), N(2,10,"stac", value="Eighth"),
    ]),
]},
"KYTL-4A": {"series": "A", "manual": True, "measures": [
    bar(188, [
        N(3,5, value="Eighth"), N(3,8, value="Eighth"), N(2,5, value="Eighth"), N(1,5, value="Eighth"),
        N(1,8, value="Eighth"), N(3,7,"full-rel", value="Eighth"), N(3,5, value="Eighth"),
    ]),
    bar(189, [
        N(3,7, value="Eighth"), N(3,5, value="Eighth"), N(4,7, value="Eighth"),
        N(3,5, value="Eighth"), N(3,7,"full", value="Eighth"),
        N(1,5, value="Eighth"), N(2,8, value="Eighth", slide=True), N(2,5, value="Eighth"),
    ]),
]},
"KYTL-6A": {"series": "A", "manual": True, "measures": [
    bar(186, [
        N(3,7,"full", value="Eighth"), N(2,5, value="Eighth"), N(2,8, value="Eighth"),
        N(2,5, value="Eighth"), N(3,7, value="Eighth"), N(3,5, value="Eighth"),
        N(3,"r", rest=True, value="Eighth"), N(4,7, value="Eighth"),
    ]),
    bar(187, [
        N(3,5, value="Eighth"), N(4,5, value="Eighth"), N(5,7, value="Eighth"),
        N(5,5, value="Eighth"), N(5,7, value="Eighth"), N(3,5, value="Eighth"),
    ]),
]},
}


for lid, spec in LICKS.items():
    p, sz = render(lid, spec)
    print(f"{lid:8s} {sz[0]:4d}x{sz[1]}")
for lid, spec in KYTL.items():
    p, sz = render(lid, spec)
    print(f"{lid:8s} {sz[0]:4d}x{sz[1]}")
