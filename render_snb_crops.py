#!/usr/bin/env python3
"""Render Snowblind Song Map tab crops from Songsterr CDN JSON."""
from __future__ import annotations

import gzip
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "section-crops"
SONG_ID = 2605
REVISION = 7470981
IMAGE = "v0-3-2-NyWq0N6nXh2XXhXf"
CDN = f"https://dqsljvtekg760.cloudfront.net/{SONG_ID}/{REVISION}/{IMAGE}"

# 1-based inclusive bars; track 1=Rhythm, 2=Lead
CHIPS = [
    ("SNB-I1", 1, 4, 1),
    ("SNB-V1", 9, 10, 1),
    ("SNB-V2", 21, 22, 1),
    ("SNB-B1", 49, 52, 1),
    ("SNB-S1", 68, 84, 2),
    ("SNB-B2", 101, 102, 1),
    ("SNB-S2", 132, 160, 2),
]

try:
    FONT = ImageFont.truetype(
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 15
    )
    FONT_SM = ImageFont.truetype(
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 10
    )
except OSError:
    FONT = ImageFont.load_default()
    FONT_SM = FONT

# Layout
LEFT = 18
RIGHT = 18
TOP = 22
BOTTOM = 18
STR_GAP = 16  # 6 strings -> 5 gaps
STAFF_H = 5 * STR_GAP
ROW_GAP = 36
MEASURE_W = 160  # short ranges
MEASURE_W_SOLO = 340
MAX_WIDTH = 1800
BARS_PER_ROW_SOLO = 5


def fetch_track(track_index: int) -> dict:
    url = f"{CDN}/{track_index}.json"
    with urllib.request.urlopen(url, timeout=60) as resp:
        raw = resp.read()
    try:
        data = gzip.decompress(raw)
    except OSError:
        data = raw
    return json.loads(data)


def beat_units(beat: dict) -> float:
    """Return beat length in quarter-note units (duration [num, den])."""
    dur = beat.get("duration") or [1, 4]
    if isinstance(dur, list) and len(dur) >= 2 and dur[1]:
        return (4.0 * dur[0]) / dur[1]
    # type is denominator-ish (4=quarter, 8=eighth)
    t = beat.get("type") or 4
    return 4.0 / float(t)


def collect_beats(measure: dict) -> list[dict]:
    voices = measure.get("voices") or []
    if not voices:
        return []
    return list(voices[0].get("beats") or [])


def is_sounding(beat: dict) -> bool:
    if beat.get("rest"):
        return False
    notes = beat.get("notes") or []
    for n in notes:
        if n.get("rest"):
            continue
        if n.get("fret") is None and n.get("string") is None:
            continue
        if n.get("fret") is not None and n.get("string") is not None:
            return True
    return False


def note_frets(beat: dict) -> list[tuple[int, int]]:
    """Return (string0=highE, fret) for sounding notes."""
    out = []
    for n in beat.get("notes") or []:
        if n.get("rest"):
            continue
        s, f = n.get("string"), n.get("fret")
        if s is None or f is None:
            continue
        out.append((int(s), int(f)))
    return out


def render_chip(track: dict, bar_lo: int, bar_hi: int, out_path: Path) -> None:
    measures = track["measures"]
    idxs = list(range(bar_lo - 1, bar_hi))  # 0-based
    n = len(idxs)

    # Multi-row for long solos when a single strip would exceed MAX_WIDTH
    multi = n * MEASURE_W + LEFT + RIGHT > MAX_WIDTH
    if multi:
        bars_per_row = BARS_PER_ROW_SOLO
        mw = MEASURE_W_SOLO
    else:
        bars_per_row = n
        mw = MEASURE_W
        if n <= 2:
            mw = 200
        elif n <= 4:
            mw = 170

    rows = [idxs[i : i + bars_per_row] for i in range(0, n, bars_per_row)]
    cols = max(len(r) for r in rows)

    W = LEFT + cols * mw + RIGHT
    H = TOP + len(rows) * STAFF_H + (len(rows) - 1) * ROW_GAP + BOTTOM

    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    for ri, row in enumerate(rows):
        y0 = TOP + ri * (STAFF_H + ROW_GAP)
        # string lines (0 = high E = top)
        for s in range(6):
            y = y0 + s * STR_GAP
            draw.line([(LEFT, y), (LEFT + len(row) * mw, y)], fill=(40, 40, 40), width=1)

        # left barline
        draw.line([(LEFT, y0), (LEFT, y0 + STAFF_H)], fill=(20, 20, 20), width=2)

        for bi, mi in enumerate(row):
            x0 = LEFT + bi * mw
            x1 = x0 + mw
            # right barline of measure
            draw.line([(x1, y0), (x1, y0 + STAFF_H)], fill=(20, 20, 20), width=2)

            m = measures[mi]
            beats = collect_beats(m)
            # total duration in quarters (fallback 4)
            total = sum(beat_units(b) for b in beats) or 4.0
            # leave padding inside measure
            pad = 10
            usable = mw - 2 * pad
            cursor = 0.0
            for beat in beats:
                u = beat_units(beat)
                # place note at start of its slot
                cx = x0 + pad + (cursor / total) * usable
                if is_sounding(beat):
                    for s, fret in note_frets(beat):
                        # JSON string 0 = high E = top line
                        sy = y0 + s * STR_GAP
                        label = str(fret)
                        # white disc behind number to break the string line
                        bbox = draw.textbbox((0, 0), label, font=FONT)
                        tw = bbox[2] - bbox[0]
                        th = bbox[3] - bbox[1]
                        draw.ellipse(
                            [cx - tw / 2 - 3, sy - th / 2 - 2, cx + tw / 2 + 3, sy + th / 2 + 2],
                            fill=(255, 255, 255),
                        )
                        draw.text(
                            (cx - tw / 2, sy - th / 2 - 1),
                            label,
                            fill=(10, 10, 10),
                            font=FONT,
                        )
                    # optional simple stem above staff
                    stem_x = cx
                    draw.line(
                        [(stem_x, y0 - 10), (stem_x, y0 - 2)],
                        fill=(90, 90, 90),
                        width=1,
                    )
                cursor += u

            # bar number (small) under first measure of crop / each row start
            if bi == 0 and ri == 0:
                draw.text(
                    (x0 + 4, y0 + STAFF_H + 2),
                    str(mi + 1),
                    fill=(140, 140, 140),
                    font=FONT_SM,
                )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    print(f"wrote {out_path.name} {img.size} bars {bar_lo}-{bar_hi}")


def main() -> None:
    tracks = {1: fetch_track(1), 2: fetch_track(2)}
    print("rhythm:", tracks[1]["name"], len(tracks[1]["measures"]), "measures")
    print("lead:", tracks[2]["name"], len(tracks[2]["measures"]), "measures")
    for lick_id, lo, hi, ti in CHIPS:
        render_chip(tracks[ti], lo, hi, OUT / f"{lick_id}.png")


if __name__ == "__main__":
    main()
