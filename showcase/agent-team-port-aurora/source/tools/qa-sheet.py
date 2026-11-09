#!/usr/bin/env python3
"""tools/qa-sheet.py — contact sheets, detail crops and image metrics for QA.

Reads a report JSON containing {meta, scenarios, worldActive}, writes:
  shots/qa/sheet-day.png, sheet-night.png, sheet-details.png, sheet-all.png,
  sheet-clean.png, crops/*.png
and prints one JSON object (last stdout line) with:
  {sheets:[...], checks:[...], metrics:{...}}

No third-party deps beyond Pillow (guaranteed by the workspace bundle).
"""
import argparse
import colorsys
import json
import math
import os
import statistics
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageStat

PAPER = (239, 228, 210)
INK = (46, 40, 34)
INK_SOFT = (110, 99, 84)
NIGHT = (25, 21, 16)
BRASS = (185, 147, 90)

FONT_PATHS = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]


def load_font(size):
    for p in FONT_PATHS:
        try:
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()


def luminance(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def image_metrics(img):
    """Coarse palette / quality metrics on a downsampled RGB image."""
    w, h = img.size
    small = img.convert("RGB")
    scale = max(1, int(math.sqrt((small.width * small.height) / 160000)))
    if scale > 1:
        small = small.resize((max(1, small.width // scale), max(1, small.height // scale)), Image.BILINEAR)
    px = list(small.getdata())
    n = len(px)
    lums, sats = [], []
    rmean = gmean = bmean = 0.0
    rg = yb = rg2 = yb2 = 0.0
    blown = black = 0
    hue_bins = [0] * 12
    for (r, g, b) in px:
        lum = luminance(r, g, b)
        lums.append(lum)
        rmean += r
        gmean += g
        bmean += b
        mx, mn = max(r, g, b), min(r, g, b)
        sat = 0 if mx == 0 else (mx - mn) / mx
        sats.append(sat)
        if lum > 250:
            blown += 1
        if lum < 6:
            black += 1
        if sat > 0.12:
            hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            hue_bins[int(hh * 12) % 12] += 1
        rg += r - g
        yb += 0.5 * (r + g) - b
        rg2 += (r - g) ** 2
        yb2 += (0.5 * (r + g) - b) ** 2
    rg /= n
    yb /= n
    colorfulness = math.sqrt(max(0, rg2 / n - rg * rg) + max(0, yb2 / n - yb * yb)) + 0.3 * math.hypot(rg, yb)
    lums.sort()
    p10 = lums[int(n * 0.10)]
    p50 = lums[int(n * 0.50)]
    p90 = lums[int(n * 0.90)]
    vivid = sum(1 for s in sats if s > 0.25) / n
    return {
        "width": w,
        "height": h,
        "meanLum": round(statistics.fmean(lums), 2),
        "medianLum": round(p50, 2),
        "p10Lum": round(p10, 2),
        "p90Lum": round(p90, 2),
        "stdLum": round(statistics.pstdev(lums), 2),
        "meanSat": round(statistics.fmean(sats), 4),
        "vividFrac": round(vivid, 4),
        "colorfulness": round(colorfulness, 2),
        "blownFrac": round(blown / n, 5),
        "blackFrac": round(black / n, 5),
        "hueBins": hue_bins,
        "hueSpread": sum(1 for v in hue_bins if v / n > 0.01),
        "meanRGB": [round(rmean / n, 1), round(gmean / n, 1), round(bmean / n, 1)],
    }


def estimate_background(img):
    """Median color of 8 small patches inset from the borders."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    patch = max(8, int(min(w, h) * 0.045))
    pts = []
    for fx, fy in ((0.06, 0.06), (0.5, 0.05), (0.94, 0.06), (0.05, 0.5), (0.95, 0.5), (0.06, 0.94), (0.5, 0.95), (0.94, 0.94)):
        x = int(w * fx) - patch // 2
        y = int(h * fy) - patch // 2
        if x < 0 or y < 0 or x + patch > w or y + patch > h:
            continue
        crop = rgb.crop((x, y, x + patch, y + patch))
        pts.extend(list(crop.getdata()))
    if not pts:
        return (239, 228, 210)
    return tuple(int(statistics.median(p[i] for p in pts)) for i in range(3))


def model_bbox(img, trim=0.03, sw=480):
    """Bounding box of the model as fractions of the frame (background-suppressed).

    Colour mask over a lightly blurred 480px working image: the paper backdrop
    is bright and warm (low saturation-ish, lum >120), while the model carries
    dark plinth/water/structures (lum<120), saturated paints (sat>0.42) or teal
    water (hue 0.35-0.62, sat>0.22). Robust against the film-grain overlay,
    unlike a raw edge filter.
    """
    rgb = img.convert("RGB")
    w, h = rgb.size
    sh = max(1, int(sw * h / w))
    small = rgb.resize((sw, sh), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.0))
    px = list(small.getdata())
    x0, x1 = int(sw * trim), int(sw * (1 - trim))
    y0, y1 = int(sh * trim), int(sh * (1 - trim))
    minx, miny, maxx, maxy = sw, sh, -1, -1
    count = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[y * sw + x]
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            mx, mn = max(r, g, b), min(r, g, b)
            sat = 0 if mx == 0 else (mx - mn) / mx
            hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if lum < 120 or sat > 0.42 or (0.35 < hh < 0.62 and sat > 0.22):
                count += 1
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
    if maxx < 0:
        return None
    fx0, fy0 = minx / sw, miny / sh
    fx1, fy1 = maxx / sw, maxy / sh
    return {
        "x": round(fx0, 4), "y": round(fy0, 4), "w": round(fx1 - fx0, 4), "h": round(fy1 - fy0, 4),
        "right": round(fx1, 4), "bottom": round(fy1, 4),
        "cx": round((fx0 + fx1) / 2, 4), "cy": round((fy0 + fy1) / 2, 4),
        "occupancy": round((fx1 - fx0) * (fy1 - fy0), 4),
        "maskFrac": round(count / max(1, (x1 - x0) * (y1 - y0)), 4),
        "trim": trim,
    }


def artifact_scan(img, sw=480):
    """Detect debugging / broken-material artifacts at low resolution.

    - large opaque near-black blocks (e.g. untextured billboards, ~lum<32)
    - magenta / hot-pink surfaces (missing material colour placeholder)
    Returns fractions of the frame plus the largest components, so WIP
    artifact regressions are caught without eyeballing every screenshot.
    """
    rgb = img.convert("RGB")
    w, h = rgb.size
    sh = max(1, int(sw * h / w))
    small = rgb.resize((sw, sh), Image.BILINEAR)
    px = list(small.getdata())
    n = sw * sh
    dark = bytearray(n)
    mag = bytearray(n)
    for i, (r, g, b) in enumerate(px):
        if 0.2126 * r + 0.7152 * g + 0.0722 * b < 32:
            dark[i] = 1
        mx, mn = max(r, g, b), min(r, g, b)
        if mx > 60 and (mx - mn) / mx > 0.6:
            hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if 0.72 < hh < 0.96 and 0.2 < ll < 0.8:
                mag[i] = 1

    def comps(mask, min_area):
        seen = bytearray(n)
        out = []
        for start in range(n):
            if not mask[start] or seen[start]:
                continue
            seen[start] = 1
            stack = [start]
            cells = []
            while stack:
                j = stack.pop()
                cells.append(j)
                x, y = j % sw, j // sw
                for k in (j - 1 if x > 0 else -1, j + 1 if x < sw - 1 else -1,
                          j - sw if y > 0 else -1, j + sw if y < sh - 1 else -1):
                    if k >= 0 and mask[k] and not seen[k]:
                        seen[k] = 1
                        stack.append(k)
            if len(cells) >= min_area:
                xs = [c % sw for c in cells]
                ys = [c // sw for c in cells]
                out.append({
                    "area": len(cells),
                    "x": round(min(xs) / sw, 3), "y": round(min(ys) / sh, 3),
                    "w": round((max(xs) - min(xs)) / sw, 3), "h": round((max(ys) - min(ys)) / sh, 3),
                })
        out.sort(key=lambda c: -c["area"])
        return out

    dark_comps = comps(dark, 120)
    mag_comps = comps(mag, 60)
    return {
        "darkFrac": round(sum(dark) / n, 4),
        "darkLargeFrac": round(sum(c["area"] for c in dark_comps) / n, 4),
        "darkComps": dark_comps[:6],
        "magFrac": round(sum(mag) / n, 4),
        "magLargeFrac": round(sum(c["area"] for c in mag_comps) / n, 4),
        "magComps": mag_comps[:6],
    }


def top_colors(img, k=6):
    small = img.convert("RGB").resize((160, max(1, int(160 * img.height / img.width))), Image.BILINEAR)
    px = list(small.getdata())
    buckets = {}
    for (r, g, b) in px:
        key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5)
        if key in buckets:
            buckets[key][0] += 1
            buckets[key][1] += r
            buckets[key][2] += g
            buckets[key][3] += b
        else:
            buckets[key] = [1, r, g, b]
    top = sorted(buckets.values(), key=lambda v: -v[0])[:k]
    n = len(px)
    out = []
    for cnt, rr, gg, bb in top:
        out.append({"hex": "#%02x%02x%02x" % (rr // cnt, gg // cnt, bb // cnt), "frac": round(cnt / n, 4)})
    return out


def contain(img, w, h):
    iw, ih = img.size
    scale = min(w / iw, h / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), PAPER)
    canvas.paste(resized, ((w - nw) // 2, (h - nh) // 2))
    return canvas


def make_sheet(name, entries, out_dir, root, cell_w=560, cell_h=None, cols=4, title="", subtitle=""):
    """entries: list of (caption, image path) or (caption, image path, tag)."""
    if not entries:
        return None
    pad = 22
    cap = 30
    head = 68
    if cell_h is None:
        cell_h = int(cell_w * 0.66)
    rows = (len(entries) + cols - 1) // cols
    W = pad * 2 + cols * cell_w + (cols - 1) * 14
    H = head + pad + rows * (cell_h + cap) + (rows - 1) * 14
    sheet = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(sheet)
    f_title = load_font(24)
    f_sub = load_font(13)
    f_cap = load_font(12)
    f_tag = load_font(11)
    draw.text((pad, 18), title or name, font=f_title, fill=INK)
    if subtitle:
        draw.text((pad, 46), subtitle, font=f_sub, fill=INK_SOFT)
    for i, entry in enumerate(entries):
        caption = entry[0]
        img_path = entry[1]
        tag = entry[2] if len(entry) > 2 else ""
        r = i // cols
        c = i % cols
        x = pad + c * (cell_w + 14)
        y = head + pad + r * (cell_h + cap + 14)
        try:
            im = Image.open(img_path).convert("RGB")
        except Exception as exc:  # noqa: BLE001
            draw.rectangle([x, y, x + cell_w, y + cell_h], outline=(180, 90, 80))
            draw.text((x + 8, y + 8), "missing: " + os.path.basename(img_path), font=f_cap, fill=(150, 60, 50))
            continue
        cell = contain(im, cell_w, cell_h)
        sheet.paste(cell, (x, y))
        draw.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline=(212, 199, 178))
        label = caption
        draw.text((x + 4, y + cell_h + 6), label, font=f_cap, fill=INK)
        if tag:
            tw = draw.textlength(tag, font=f_tag)
            draw.text((x + cell_w - tw - 4, y + cell_h + 6), tag, font=f_tag, fill=BRASS)
    path = os.path.join(out_dir, name)
    sheet.save(path, "PNG", optimize=True)
    return {"name": name, "file": os.path.relpath(path, root).replace(os.sep, "/"), "bytes": os.path.getsize(path), "w": W, "h": H, "cells": len(entries)}


def make_crops(scenarios, out_dir, root):
    crops_dir = os.path.join(out_dir, "crops")
    os.makedirs(crops_dir, exist_ok=True)
    made = []
    by_id = {s["id"]: s for s in scenarios}
    # hero clean: quadrant crops at native resolution
    for session in ("desktop-day", "desktop-night"):
        src = by_id.get(session + "-hero-clean")
        if not src:
            continue
        p = os.path.normpath(os.path.join(root, src["file"]))
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGB")
        W, H = im.size
        boxes = {
            "nw": (0.04, 0.10, 0.54, 0.60),
            "ne": (0.46, 0.10, 0.96, 0.60),
            "sw": (0.04, 0.40, 0.54, 0.90),
            "se": (0.46, 0.40, 0.96, 0.90),
        }
        for key, (fx0, fy0, fx1, fy1) in boxes.items():
            box = (int(W * fx0), int(H * fy0), int(W * fx1), int(H * fy1))
            name = "%s-hero-clean-%s.png" % (session, key)
            crop = im.crop(box)
            crop.save(os.path.join(crops_dir, name), "PNG", optimize=True)
            made.append({"file": "shots/qa/crops/" + name, "w": crop.width, "h": crop.height})
    # close-ups: centre crops limited to 1280x900 native
    for s in scenarios:
        if s.get("clean") and s["id"] not in ("desktop-day-hero-clean", "desktop-night-hero-clean"):
            p = os.path.normpath(os.path.join(root, s["file"]))
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert("RGB")
            W, H = im.size
            cw, ch = min(W, 1280), min(H, 900)
            if cw < 500 or ch < 350:
                continue
            left = (W - cw) // 2
            top = (H - ch) // 2
            name = s["id"] + "-centre.png"
            crop = im.crop((left, top, left + cw, top + ch))
            crop.save(os.path.join(crops_dir, name), "PNG", optimize=True)
            made.append({"file": "shots/qa/crops/" + name, "w": crop.width, "h": crop.height})
    return made


def make_label_crops(scenarios, out_dir, root, limit=16):
    """Crop every visible label card region at 1:1 for leader-line review."""
    crops_dir = os.path.join(out_dir, "crops")
    os.makedirs(crops_dir, exist_ok=True)
    made = []
    for s in scenarios:
        ui = s.get("ui") or {}
        cards = ui.get("labelCards") or []
        vw = ui.get("vw")
        if not cards or not vw:
            continue
        p = os.path.normpath(os.path.join(root, s["file"]))
        if not os.path.exists(p):
            continue
        try:
            im = Image.open(p).convert("RGB")
        except Exception:
            continue
        scale = im.width / float(vw)
        W, H = im.size
        for i, card in enumerate(cards[:6]):
            if len(made) >= limit:
                return made
            r = card.get("rect") or {}
            try:
                x0 = max(0, int((r["x"] - 150) * scale))
                y0 = max(0, int((r["y"] - 90) * scale))
                x1 = min(W, int((r["right"] + 150) * scale))
                y1 = min(H, int((r["bottom"] + 90) * scale))
            except KeyError:
                continue
            if x1 - x0 < 120 or y1 - y0 < 80:
                continue
            name = "labels-%s-%02d.png" % (s["id"], i + 1)
            im.crop((x0, y0, x1, y1)).save(os.path.join(crops_dir, name), "PNG", optimize=True)
            made.append({"file": "shots/qa/crops/" + name, "w": x1 - x0, "h": y1 - y0, "scenario": s["id"], "label": card.get("text")})
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    with open(args.report, "r", encoding="utf-8") as fh:
        report = json.load(fh)
    scenarios = report.get("scenarios", [])
    meta = report.get("meta", {})
    world_active = bool(report.get("worldActive"))
    mode = (meta.get("mode") or "headless")
    visual_gate = mode == "headed"

    def mode_gate(check):
        """Visual checks are gated identically in headless and headed runs.

        (Earlier the team suspected headless SwiftShader tile corruption, but the
        artifacts turned out to be real world-code bugs that have since been
        fixed; headless screenshots are the default evidence. `--headed` runs are
        still supported for final acceptance on a real GPU window.)"""
        return check
    out_dir = args.out
    root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

    metrics = {}
    for s in scenarios:
        p = os.path.normpath(os.path.join(root, s["file"]))
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGB")
        m = image_metrics(im)
        m["file"] = s["file"]
        m["session"] = s.get("session")
        m["view"] = s.get("view")
        m["clean"] = bool(s.get("clean"))
        m["mode"] = s.get("mode")
        if s.get("clean"):
            try:
                m["bbox"] = model_bbox(im)
            except Exception:
                m["bbox"] = None
        m["topColors"] = top_colors(im)
        try:
            m["artifacts"] = artifact_scan(im)
        except Exception:
            m["artifacts"] = None
        metrics[s["id"]] = m

    checks = []
    fails = []
    warns = []
    by_id = {s["id"]: s for s in scenarios}

    # ---- blank / uniform frame check
    for sid, m in metrics.items():
        if m["stdLum"] < 4.0 or m["meanLum"] < 4 or m["meanLum"] > 251:
            fails.append(sid + " nearly uniform (std=" + str(m["stdLum"]) + ")")
    checks.append(mode_gate({
        "id": "frames-not-blank", "group": "visual", "status": "fail" if fails else "pass",
        "name": "No blank / uniform frames",
        "detail": {"failures": fails[:8], "frames": len(metrics)},
    }))

    # ---- debug-material artifacts (magenta placeholders / black blocks)
    mag_bad = []
    dark_fail = []
    dark_warn = []
    for sid, m in sorted(metrics.items()):
        art = m.get("artifacts")
        if not art:
            continue
        if "nopost" in sid:
            continue  # reference capture only (different tone-map path, darker by design)
        night = bool((m.get("mode") or {}).get("night"))
        if art["magLargeFrac"] > 0.0004 or art["magFrac"] > 0.004:
            mag_bad.append({"id": sid, "magLargeFrac": art["magLargeFrac"], "comps": art["magComps"][:2]})
        if not night:
            if art["darkLargeFrac"] > 0.006:
                dark_fail.append({"id": sid, "darkLargeFrac": art["darkLargeFrac"], "comps": art["darkComps"][:2]})
            elif art["darkLargeFrac"] > 0.002:
                dark_warn.append({"id": sid, "darkLargeFrac": art["darkLargeFrac"]})
    checks.append(mode_gate({
        "id": "artifact-magenta", "group": "visual",
        "status": "fail" if mag_bad else "pass",
        "name": "No magenta / placeholder-coloured surfaces",
        "detail": {"bad": mag_bad, "note": "large saturated magenta/hot-pink components usually mean a WIP or missing material colour"},
    }))
    checks.append(mode_gate({
        "id": "artifact-dark-blocks", "group": "visual",
        "status": "fail" if dark_fail else ("warn" if dark_warn else "pass"),
        "name": "No large opaque black blocks (untextured billboards / broken sprites)",
        "detail": {"fail": dark_fail, "warn": dark_warn, "note": "large near-black rectangles floating over the scene; small dark details (fenders, bollards) are ignored"},
    }))

    # ---- postcard layout (header/footer must not overlap the framed image)
    pc_path = os.path.join(out_dir, "postcard-sample.png")
    if os.path.exists(pc_path):
        try:
            pc = Image.open(pc_path).convert("RGB")
            PW, PH = pc.size
            def ink_fraction(box):
                gray = pc.crop(box).convert("L")
                hist = gray.histogram()
                total = sum(hist)
                return (sum(hist[:120]) / total) if total else 0.0
            top_ink = ink_fraction((0, 0, PW, 170))
            bot_ink = ink_fraction((0, max(0, PH - 150), PW, PH))
            core = pc.crop((180, 220, max(181, PW - 180), max(221, PH - 190))).convert("L")
            core_std = ImageStat.Stat(core).stddev[0] if core.size[0] > 1 else 0
            width_ok = abs(PW - 2960) <= 4
            header_ok = 0.0003 < top_ink < 0.25
            footer_ok = bot_ink > 0.0002
            image_ok = core_std > 8
            checks.append({
                "id": "postcard-layout", "group": "visual",
                "status": "pass" if (width_ok and header_ok and footer_ok and image_ok) else "warn",
                "name": "Postcard: header/footer clear of the framed image",
                "detail": {"file": "shots/qa/postcard-sample.png", "size": [PW, PH], "widthOk": width_ok,
                           "headerInkFrac": round(top_ink, 5), "footerInkFrac": round(bot_ink, 5),
                           "imageCoreStdLum": round(core_std, 2),
                           "note": "expected layout: header block y<170, framed image y170..h-150, footer at h-54; image 2960 wide (2600 render + 180 margins)"},
            })
        except Exception as exc:
            checks.append({"id": "postcard-layout", "group": "visual", "status": "warn",
                           "name": "Postcard: header/footer clear of the framed image", "detail": {"error": str(exc)}})
    else:
        checks.append({"id": "postcard-layout", "group": "visual", "status": "warn",
                       "name": "Postcard: header/footer clear of the framed image", "detail": {"note": "no postcard-sample.png"}})

    # ---- hero framing (bbox of the model on the plinth)
    hero = metrics.get("desktop-day-hero-clean")
    if hero and hero.get("bbox"):
        b = hero["bbox"]
        cropped = b["x"] <= 0.035 or b["y"] <= 0.035 or b["right"] >= 0.985 or b["bottom"] >= 0.995
        framing_ok = (
            (not cropped) and b["w"] >= 0.40 and b["h"] >= 0.30 and b["occupancy"] >= 0.06
            and abs(b["cx"] - 0.5) <= 0.16 and abs(b["cy"] - 0.5) <= 0.24
        )
        checks.append(mode_gate({
            "id": "framing-hero", "group": "visual", "status": "pass" if framing_ok else "fail",
            "name": "Hero view: model framed, centred, not clipped",
            "detail": {"bbox": b, "cropped": cropped, "thresholds": {"w": 0.40, "h": 0.30, "occupancy": 0.06, "centreTol": 0.16}},
        }))
        c = hero.get("colorfulness", 0)
        checks.append(mode_gate({
            "id": "palette-hero", "group": "visual",
            "status": "pass" if c >= 4 else ("warn" if c >= 1.5 else "warn"),
            "name": "Hero palette: colourfulness / hue spread",
            "detail": {"colorfulness": c, "hueSpread": hero.get("hueSpread"), "meanSat": hero.get("meanSat"), "topColors": hero.get("topColors")},
        }))
    else:
        checks.append({"id": "framing-hero", "group": "visual", "status": "warn", "name": "Hero view: model framed, centred, not clipped", "detail": {"note": "no clean hero screenshot / bbox unavailable"}})

    # ---- portrait / mobile framing: the whole model must fit the frame
    mhero = metrics.get("mobile-day-hero-clean")
    if mhero and mhero.get("bbox"):
        b = mhero["bbox"]
        right = b["x"] + b["w"]
        bottom = b["y"] + b["h"]
        # image mask includes plinth shadow / light pool, so only gross clipping
        # (>1.5% of frame missing) counts here; framing-camera-* is the exact gate.
        cropped = b["x"] <= 0.015 or b["y"] <= 0.015 or right >= 0.99 or bottom >= 0.995
        centred = abs(b["cx"] - 0.5) <= 0.14 and abs(b["cy"] - 0.5) <= 0.2
        sized = b["w"] >= 0.55 and b["h"] >= 0.15 and b["occupancy"] >= 0.10
        checks.append(mode_gate({
            "id": "framing-mobile", "group": "visual",
            "status": "pass" if (not cropped) and centred and sized else "fail",
            "name": "Portrait/mobile view fits the whole model",
            "detail": {"bbox": b, "cropped": cropped, "centred": centred, "sized": sized,
                       "note": "portrait fit: the whole plinth must be visible with margins at 430×900"},
        }))
    else:
        checks.append({"id": "framing-mobile", "group": "visual", "status": "warn",
                       "name": "Portrait/mobile view fits the whole model",
                       "detail": {"note": "no clean mobile hero screenshot"}})

    # ---- mobile post-processing quality (post vs post=0)
    mpost = metrics.get("mobile-day-hero-clean")
    mnopost = metrics.get("mobile-nopost-hero-clean")
    if mpost and mnopost:
        def ratio(a, b, eps=1e-6):
            return (a + eps) / (max(b, eps))
        c_ratio = round(ratio(mpost["colorfulness"], mnopost["colorfulness"]), 3)
        s_ratio = round(ratio(mpost["stdLum"], mnopost["stdLum"]), 3)
        ok = c_ratio >= 0.70 and s_ratio >= 0.75
        checks.append(mode_gate({
            "id": "mobile-post-quality", "group": "visual",
            "status": "pass" if ok else "warn",
            "name": "Mobile post-processing keeps contrast (not washed out)",
            "detail": {"post": {"colorfulness": mpost["colorfulness"], "stdLum": mpost["stdLum"], "meanLum": mpost["meanLum"]},
                       "nopost": {"colorfulness": mnopost["colorfulness"], "stdLum": mnopost["stdLum"], "meanLum": mnopost["meanLum"]},
                       "colorfulnessRatio": c_ratio, "contrastRatio": s_ratio,
                       "note": "post-processing pipeline (bloom/tilt/exposure) should not flatten the mobile render vs post=0"},
        }))
    else:
        checks.append({"id": "mobile-post-quality", "group": "visual", "status": "warn",
                       "name": "Mobile post-processing keeps contrast (not washed out)",
                       "detail": {"note": "missing post / post=0 mobile clean captures"}})

    # ---- lighthouse beam must add light, never darken the night scene
    with_id = "desktop-labels-hero-night-clean"
    without_id = "desktop-labels-hero-night-nobeam"
    if with_id in by_id and without_id in by_id:
        try:
            pa = os.path.normpath(os.path.join(root, by_id[with_id]["file"]))
            pb = os.path.normpath(os.path.join(root, by_id[without_id]["file"]))
            ia = Image.open(pa).convert("L")
            ib = Image.open(pb).convert("L")
            Wb, Hb = ib.size
            sw = 480
            sh = max(1, int(sw * Hb / Wb))
            ia = ia.resize((sw, sh), Image.BILINEAR)
            ib = ib.resize((sw, sh), Image.BILINEAR)
            la = list(ia.getdata())
            lb = list(ib.getdata())
            n = sw * sh
            mask = bytearray(n)
            for i in range(n):
                # beam hidden => background brighter => the beam made this pixel darker
                if lb[i] - la[i] > 8:
                    mask[i] = 1
            dark_total = sum(mask)
            bright_total = sum(1 for i in range(n) if la[i] - lb[i] > 8)
            # coherent wedge detection: connected darkening regions, not water/grain noise
            seen = bytearray(n)
            comps = []
            for start in range(n):
                if not mask[start] or seen[start]:
                    continue
                stack = [start]
                seen[start] = 1
                cells = []
                while stack:
                    j = stack.pop()
                    cells.append(j)
                    x, y = j % sw, j // sw
                    for k in (j - 1 if x > 0 else -1, j + 1 if x < sw - 1 else -1,
                              j - sw if y > 0 else -1, j + sw if y < sh - 1 else -1):
                        if k >= 0 and mask[k] and not seen[k]:
                            seen[k] = 1
                            stack.append(k)
                if len(cells) >= 25:
                    xs = [c % sw for c in cells]
                    ys = [c // sw for c in cells]
                    comps.append({"area": len(cells), "frac": round(len(cells) / n, 5),
                                  "bbox": [round(min(xs) / sw, 3), round(min(ys) / sh, 3),
                                           round((max(xs) - min(xs)) / sw, 3), round((max(ys) - min(ys)) / sh, 3)]})
            comps.sort(key=lambda c: -c["area"])
            max_comp = comps[0]["frac"] if comps else 0.0
            dark_frac = dark_total / n
            bright_frac = bright_total / n
            status = "pass"
            if max_comp >= 0.0008 or dark_frac > 0.02:
                status = "fail"
            elif max_comp >= 0.0004 or bright_frac < 0.0005:
                status = "warn"
            checks.append(mode_gate({
                "id": "night-beam-darkening", "group": "visual", "status": status,
                "name": "Lighthouse beam only adds light (no dark wedges at night)",
                "detail": {"darkeningFrac": round(dark_frac, 5), "maxDarkeningComponentFrac": max_comp,
                           "darkeningComponents": comps[:3], "brighteningFrac": round(bright_frac, 5),
                           "beamCandidates": (by_id[without_id].get("beamCandidates") or {}),
                           "note": "diff of clean night render vs same frame with near-lamp transparent/beam objects hidden; only coherent darkening regions (>=25 px at 480 wide) count as dark wedges; scattered water/grain noise is ignored; brightening confirms the beam is visible"},
            }))
        except Exception as exc:
            checks.append({"id": "night-beam-darkening", "group": "visual", "status": "warn",
                           "name": "Lighthouse beam only adds light (no dark wedges at night)", "detail": {"error": str(exc)}})
    else:
        checks.append({"id": "night-beam-darkening", "group": "visual", "status": "warn",
                       "name": "Lighthouse beam only adds light (no dark wedges at night)",
                       "detail": {"note": "missing night / no-beam pair"}})

    # ---- night readability vs day
    day = metrics.get("desktop-day-hero-clean")
    night = metrics.get("desktop-night-hero-clean") or metrics.get("desktop-labels-hero-night-clean")
    if day and night:
        ratio = night["meanLum"] / max(1.0, day["meanLum"])
        night["highlightFrac"] = 1 - night["blackFrac"] - night["blownFrac"]
        bright = night["p90Lum"]
        ok = 0.10 <= ratio <= 0.90 and bright >= 18
        checks.append(mode_gate({
            "id": "night-readability", "group": "visual", "status": "pass" if ok else "warn",
            "name": "Night mode is darker than day but still readable",
            "detail": {"dayMeanLum": day["meanLum"], "nightMeanLum": night["meanLum"], "ratio": round(ratio, 3), "nightP90": bright, "nightColorfulness": night["colorfulness"], "nightMeanSat": night["meanSat"]},
        }))
        report_night = {"ratio": round(ratio, 3), "dayMeanLum": day["meanLum"], "nightMeanLum": night["meanLum"]}
    else:
        report_night = None

    # ---- sheets
    def tag(s):
        m = metrics.get(s["id"])
        if not m:
            return ""
        if s.get("clean"):
            return "clean"
        if s.get("mode", {}).get("night"):
            return "night" if not s.get("mode", {}).get("labels") else "night+labels"
        if s.get("mode", {}).get("labels"):
            return "labels"
        return "day"

    def caption(s):
        base = s["id"]
        return base.replace("desktop-day-", "").replace("desktop-night-", "").replace("desktop-labels-", "").replace("mobile-day-", "mobile ")
        # noqa: E501

    def entry(s, show_session=False):
        cap = caption(s)
        if show_session:
            cap = s["session"] + " · " + caption(s)
        return (cap, os.path.normpath(os.path.join(root, s["file"])), tag(s))

    def pick(pred):
        return [entry(s) for s in scenarios if pred(s)]

    sheets = []
    sh = make_sheet(
        "sheet-day.png",
        pick(lambda s: s.get("session") == "desktop-day" and not s.get("clean")),
        out_dir, root, cell_w=560, cols=4,
        title="PORT AURORA · QA — DAY MATRIX",
        subtitle="hero · east/low · west · back · top · close ship · close cranes · close town  —  1440×900 @1.5x  ·  " + mode.upper(),
    )
    if sh:
        sheets.append(sh)
    sh = make_sheet(
        "sheet-night.png",
        pick(lambda s: s.get("session") == "desktop-night" and not s.get("clean")) +
        pick(lambda s: s.get("id") in ("desktop-labels-hero-night", "mobile-day-hero-labels")),
        out_dir, root, cell_w=560, cols=4,
        title="PORT AURORA · QA — NIGHT / LABELS",
        subtitle="night hero · east · west · town · night+labels · mobile labels  ·  " + mode.upper(),
    )
    if sh:
        sheets.append(sh)
    sh = make_sheet(
        "sheet-details.png",
        pick(lambda s: s.get("clean")),
        out_dir, root, cell_w=560, cols=4,
        title="PORT AURORA · QA — CLEAN DETAILS (UI HIDDEN)",
        subtitle="model-only captures used for framing / palette / artifact review",
    )
    if sh:
        sheets.append(sh)
    sh = make_sheet(
        "sheet-all.png",
        [entry(s, show_session=True) for s in scenarios if not s.get("clean") and not s.get("private")],
        out_dir, root, cell_w=460, cols=4,
        title="PORT AURORA · QA — EVERY SCENARIO",
        subtitle="%d scenarios · %s" % (len(scenarios), meta.get("generatedAt", "")),
    )
    if sh:
        sheets.append(sh)

    crops = make_crops(scenarios, out_dir, root)
    # label-detail crops for leader-line / collision review (from stored UI snapshots)
    label_crops = make_label_crops(scenarios, out_dir, root)
    crops.extend(label_crops)

    # side-by-side mobile post vs post=0 comparison crop (evidence)
    if mpost and mnopost:
        try:
            def crop_model(sid, bbox):
                p = os.path.normpath(os.path.join(root, by_id[sid]["file"]))
                im = Image.open(p).convert("RGB")
                W, H = im.size
                x0 = int(W * max(0.0, bbox["x"] - 0.05))
                x1 = int(W * min(1.0, bbox["right"] + 0.05))
                y0 = int(H * max(0.0, bbox["y"] - 0.06))
                y1 = int(H * min(1.0, bbox["bottom"] + 0.06))
                crop = im.crop((x0, y0, x1, y1))
                if crop.width > 900:
                    crop = crop.resize((900, max(1, int(crop.height * 900 / crop.width))), Image.LANCZOS)
                return crop
            bc = mpost.get("bbox"), mnopost.get("bbox")
            if bc[0] and bc[1]:
                a = crop_model("mobile-day-hero-clean", bc[0])
                b = crop_model("mobile-nopost-hero-clean", bc[1])
                w = max(a.width, b.width)
                h = a.height + b.height
                comp = Image.new("RGB", (w, h + 34), PAPER)
                comp.paste(a, (0, 18))
                comp.paste(b, (0, a.height + 30))
                dr = ImageDraw.Draw(comp)
                dr.text((4, 3), "mobile post-processing ON — watch for haze / loss of contrast", font=load_font(12), fill=INK)
                dr.text((4, a.height + 19), "mobile post=0 (reference)", font=load_font(12), fill=INK_SOFT)
                comp_path = os.path.join(out_dir, "mobile-post-compare.png")
                comp.save(comp_path, "PNG", optimize=True)
                crops.append({"file": "shots/qa/mobile-post-compare.png", "w": comp.width, "h": comp.height, "note": "post vs post=0"})
        except Exception:
            pass

    print(json.dumps({
        "sheets": sheets,
        "crops": crops,
        "checks": checks,
        "night": report_night,
        "metrics": metrics,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
