"""
v3.2 代码回填：模型只给语义，数值全部由本模块算。
输入：图片(PIL) + <base>.deepseek.json + 模型语义结果
输出：v3.1 兼容的完整结构（color / texts / subjects / composition / style.palette ...）
"""
import colorsys
import re
import numpy as np

# ---------------- 颜色基础 ----------------

def hex2rgb(h):
    h = str(h).lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:
        h = h[:6]
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb2hex(rgb):
    r, g, b = [int(max(0, min(255, round(v)))) for v in rgb]
    return "#%02X%02X%02X" % (r, g, b)


def rgb2hsv(rgb):
    r, g, b = [v / 255.0 for v in rgb]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    return h * 360, s, v


def luminance(rgb):
    def ch(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


# ---------------- 调色板 ----------------

def _kmeans(px, k=5, iters=8):
    idx = np.linspace(0, len(px) - 1, k).astype(int)
    centers = px[idx].copy()
    lab = np.zeros(len(px), dtype=int)
    for _ in range(iters):
        d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(2)
        lab = d.argmin(1)
        for i in range(k):
            m = lab == i
            if m.any():
                centers[i] = px[m].mean(0)
    counts = np.bincount(lab, minlength=k).astype(float)
    order = np.argsort(-counts)
    return centers[order], counts[order] / max(1, len(px))


def palette_from_image(img, k=5):
    small = img.copy()
    small.thumbnail((180, 180))
    a = np.asarray(small.convert("RGB")).reshape(-1, 3).astype(np.float32)
    if len(a) > 9000:
        a = a[:: max(1, len(a) // 9000)]
    centers, shares = _kmeans(a, k)
    hexes = [rgb2hex(c) for c in centers]
    lums = [luminance(tuple(c)) for c in centers]
    bright = int(np.argmax(lums))
    dark = int(np.argmin(lums))
    text_colors = []
    for i in (bright, dark):
        if hexes[i] not in text_colors:
            text_colors.append(hexes[i])
    return {
        "maincolor": hexes[0],
        "vicecolor": hexes[1:3],
        "accentColors": hexes[3:5],
        "textColors": text_colors,
    }, centers, shares


def color_tone(pal):
    """14 色相：由 maincolor 的 HSV 决定"""
    h, s, v = rgb2hsv(hex2rgb(pal["maincolor"]))
    if s < 0.12:
        return ["白"] if v > 0.90 else (["黑"] if v < 0.12 else ["灰"])
    if v < 0.14:
        return ["黑"]
    if 15 <= h < 45 and v < 0.42:
        return ["棕"]
    if 15 <= h < 70 and s < 0.30 and v > 0.80:
        return ["米"]
    if h < 15 or h >= 345:
        return ["红"]
    if h < 40:
        return ["橙"]
    if h < 65:
        return ["黄"]
    if h < 90:
        return ["黄绿"]
    if h < 150:
        return ["绿"]
    if h < 190:
        return ["青"]
    if h < 250:
        return ["蓝"]
    if h < 320:
        return ["紫"]
    return ["粉"]


def color_mood(centers, shares):
    lums = [luminance(tuple(c)) for c in centers]
    sats = [rgb2hsv(tuple(c))[1] for c in centers]
    hues = [rgb2hsv(tuple(c))[0] for c in centers]
    w_l = float(np.average(lums, weights=shares))
    w_s = float(np.average(sats, weights=shares))
    main_h = hues[0]
    moods = []
    if w_s < 0.10:
        moods.append("黑白色调")
    if 15 <= main_h <= 75 or main_h >= 330:
        moods.append("暖色")
    elif 170 <= main_h <= 280:
        moods.append("冷色")
    if w_l < 0.38:
        moods.append("暗色调")
    if w_l > 0.62 and w_s < 0.45:
        moods.append("清新感")
    if 15 <= main_h <= 45 and w_s < 0.55 and w_l < 0.55:
        moods.append("复古色调")
    if max(lums) > 0.80 and min(lums) < 0.15 and w_s > 0.35:
        moods.append("炫光色调")
    return moods[:3] or ["中性"]


def color_metrics(centers, shares, pal):
    lums = [luminance(tuple(c)) for c in centers]
    ratio = (max(lums) + 0.05) / (min(lums) + 0.05)
    contrast = "高" if ratio >= 7 else ("中" if ratio >= 3 else "低")
    h, s, v = rgb2hsv(hex2rgb(pal["maincolor"]))
    temperature = "暖" if (15 <= h <= 75 or h >= 330) else ("冷" if 170 <= h <= 280 else "中性")
    w_s = float(np.average([rgb2hsv(tuple(c))[1] for c in centers], weights=shares))
    if w_s < 0.10:
        saturation = "黑白"
    elif w_s >= 0.60:
        saturation = "高饱和"
    elif w_s >= 0.30:
        saturation = "中饱和"
    else:
        saturation = "低饱和"
    top = shares[0]
    if top > 0.60:
        dominance = "单色主导"
    elif sum(shares[:2]) > 0.72:
        dominance = "双色对比"
    elif w_s < 0.10:
        dominance = "黑白灰"
    else:
        dominance = "多色并置"
    return {"contrast": contrast, "temperature": temperature,
            "saturation": saturation, "dominance": dominance}


# ---------------- 文字 ----------------

def text_color(img, bbox, W, H):
    x1, y1, x2, y2 = [int(round(v)) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(W, x2), min(H, y2)
    if x2 - x1 < 2 or y2 - y1 < 2:
        return None
    crop = np.asarray(img.crop((x1, y1, x2, y2)).convert("RGB")).reshape(-1, 3).astype(np.float32)
    if len(crop) < 4:
        return None
    border = np.concatenate([
        crop[: max(1, (y2 - y1)) * 1][:0] if False else crop[:1],
        crop[-1:],
    ])
    base = np.median(border, 0)
    d = np.abs(crop - base).sum(1)
    sel = crop[d >= np.percentile(d, 75)]
    if len(sel) == 0:
        sel = crop
    return rgb2hex(np.median(sel, 0))


def text_align(bbox, W):
    cx = (bbox[0] + bbox[2]) / 2.0
    r = cx / max(1, W)
    if r < 0.40:
        return "左对齐"
    if r > 0.60:
        return "右对齐"
    return "居中"


def _size_score(t):
    b = t.get("bbox") or [0, 0, 0, 0]
    return abs(b[3] - b[1]) * 0.75 + abs(b[2] - b[0]) * 0.25


def _size_sc(t):
    b = t.get("bbox") or [0, 0, 0, 0]
    return abs(b[3] - b[1]) * 0.75 + abs(b[2] - b[0]) * 0.25


def infer_levels(texts):
    """模型漏填 level 时的兜底：按视觉重量补成「主标题/副标题/小字」。
    规则与提示词一致——一张图只有一个主标题。"""
    missing = [t for t in texts if not t.get("level")]
    if not missing or not texts:
        return texts
    has_main = any(t.get("level") == "主标题" for t in texts)
    has_sub = any(t.get("level") == "副标题" for t in texts)
    for i, t in enumerate(sorted(missing, key=_size_sc, reverse=True)):
        if not has_main:
            t["level"] = "主标题"
            has_main = True
        elif not has_sub:
            t["level"] = "副标题"
            has_sub = True
        else:
            t["level"] = "小字"
    return texts


def assign_emphasis(texts):
    """层级优先信模型的 level；模型没给才退回按尺寸排"""
    if not texts:
        return texts
    heads = [t for t in texts if t.get("level") == "主标题"]
    if heads:
        biggest = max(heads, key=_size_score)
        for t in texts:
            if t is biggest:
                t["emphasis"] = "最强"
            elif t.get("level") == "主标题":
                t["emphasis"] = "次强"
            elif t.get("level") == "副标题":
                t["emphasis"] = "次强"
            else:
                t["emphasis"] = "弱"
        return texts
    ranked = sorted(texts, key=_size_score, reverse=True)
    for i, t in enumerate(ranked):
        t["emphasis"] = "最强" if i == 0 else ("次强" if i == 1 else "弱")
    return texts


# ---------------- 主体 ----------------

def subject_main_color(img, bbox_n, W, H, heat=None, thr=40):
    """主色取样：优先用 maskHeatGrid 里「主体覆盖高」的格子当 mask（比 bbox 稳得多），
    没有热区数据才退回 bbox 取样。"""
    if heat:
        a = np.asarray(img.convert("RGB")).astype(np.float32)
        hh, ww = a.shape[:2]
        mask = np.zeros((hh, ww), dtype=bool)
        x, y, w, h = bbox_n
        for i, v in enumerate(heat):
            if v < thr:
                continue
            r, c = divmod(i, 10)
            y0, y1 = int(r * hh / 10), int((r + 1) * hh / 10)
            x0, x1 = int(c * ww / 10), int((c + 1) * ww / 10)
            # 只取落在该主体 bbox 内的格子，避免多主体互相污染
            if (x0 + x1) / 2 / ww < x or (x0 + x1) / 2 / ww > x + w:
                continue
            if (y0 + y1) / 2 / hh < y or (y0 + y1) / 2 / hh > y + h:
                continue
            mask[y0:y1, x0:x1] = True
        if mask.sum() >= 50:
            return rgb2hex(np.median(a[mask], 0))
    x, y, w, h = bbox_n
    return text_color(img, [x * W, y * H, (x + w) * W, (y + h) * H], W, H) or "#888888"


def grid_cells_of_bbox(bbox_px, W, H, cols=10, rows=10):
    x1, y1, x2, y2 = bbox_px
    c1 = int(max(0, min(cols - 1, x1 / (W / cols))))
    c2 = int(max(0, min(cols - 1, (x2 - 1e-6) / (W / cols))))
    r1 = int(max(0, min(rows - 1, y1 / (H / rows))))
    r2 = int(max(0, min(rows - 1, (y2 - 1e-6) / (H / rows))))
    return [(r, c) for r in range(r1, r2 + 1) for c in range(c1, c2 + 1)]


def overlaps_subject(text_bbox, heat, W, H):
    cells = grid_cells_of_bbox(text_bbox, W, H)
    return any(heat[r * 10 + c] >= 25 for r, c in cells)


def subject_importance(bbox_n, mask_coverage, W, H):
    x, y, w, h = bbox_n
    cx, cy = x + w / 2, y + h / 2
    center = 1.0 - min(1.0, ((cx - 0.5) ** 2 + (cy - 0.5) ** 2) ** 0.5 / 0.7071)
    area = float(mask_coverage or 0) / 100.0
    return round(min(1.0, 0.35 + area * 1.2 + center * 0.25), 2)


def occlusion_of(bbox_n, texts, W, H):
    x, y, w, h = bbox_n
    box = [x * W, y * H, (x + w) * W, (y + h) * H]
    hits = []
    for t in texts:
        b = t.get("bbox")
        if not b:
            continue
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        if box[0] <= cx <= box[2] and box[1] <= cy <= box[3]:
            hits.append(t)
    if not hits:
        return False, "无", []
    return True, "文字", [t.get("color") for t in hits if t.get("color")][:3]


# ---------------- 构图 ----------------

def focal_point(heat):
    if not heat or sum(heat) == 0:
        return "画面中心"
    w = np.array(heat, dtype=float).reshape(10, 10)
    ys, xs = np.mgrid[0:10, 0:10]
    cy = float((ys * w).sum() / w.sum()) / 9.0
    cx = float((xs * w).sum() / w.sum()) / 9.0
    vert = "顶部" if cy < 0.34 else ("底部" if cy > 0.66 else "中部")
    horz = "偏左" if cx < 0.34 else ("偏右" if cx > 0.66 else "")
    return (vert + horz) if horz else (vert + "居中")


def whitespace_ratio(img):
    g = np.asarray(img.convert("L").resize((96, 96)), dtype=np.float32)
    gx = np.abs(np.diff(g, axis=1)); gy = np.abs(np.diff(g, axis=0))
    e = np.zeros((96, 96), dtype=np.float32)
    e[:, :-1] += gx; e[:-1, :] += gy
    blocks = e.reshape(8, 12, 8, 12).mean(axis=(1, 3))
    return round(float((blocks < 14).mean()), 2)


def subject_text_relation(texts, W, H, heat):
    if not texts:
        return "无文字"
    inside = [t for t in texts if t.get("inSubject")]
    if not inside:
        return "文字在主体外"
    if len(inside) / len(texts) >= 0.5:
        return "文字压主体"
    return "文字环绕主体"


# ---------------- 汇总 ----------------

def enrich(analysis, ds, img):
    """把模型语义 + 本地计算合成 v3.1 兼容结构"""
    W = int(ds.get("width") or img.width)
    H = int(ds.get("height") or img.height)
    heat = ds.get("maskHeatGrid") or []
    ocr_texts = ds.get("texts") or []
    subj_boxes = [(s.get("bbox") or [0, 0, 1, 1]) for s in (ds.get("subjects") or [])]

    pal, centers, shares = palette_from_image(img)
    analysis["color"] = {
        "palette": pal,
        "tone": color_tone(pal),
        "mood": color_mood(centers, shares),
        **color_metrics(centers, shares, pal),
    }

    # 文案：模型语义 tX ↔ OCR bbox
    texts = []
    for t in (analysis.get("texts") or []):
        tid = str(t.get("id") or "")
        m = re.fullmatch(r"t(\d+)", tid)          # 只有 tN 才对应 OCR 序号
        idx = int(m.group(1)) if m else None
        bbox = t.get("bbox")
        # 已有像素框（幂等重算）就沿用，不再按 id 重映射
        if not (isinstance(bbox, list) and len(bbox) == 4 and max(abs(float(v)) for v in bbox) > 1.5):
            bbox = None
        if bbox is None and idx is not None and idx < len(ocr_texts):
            bbox = ocr_texts[idx].get("bbox")
            if not t.get("content"):
                t["content"] = ocr_texts[idx].get("content")
        if not bbox:
            continue
        texts.append({
            "id": tid, "level": t.get("level"), "content": t.get("content"),
            "fontStyle": t.get("fontStyle"), "relation": t.get("relation"),
            "bbox": [float(v) for v in bbox],
            "color": text_color(img, bbox, W, H),
            "align": text_align(bbox, W),
            "inSubject": overlaps_subject(bbox, heat, W, H) if heat else False,
            "source": "ocr",
        })
    for i, cb in enumerate(analysis.get("copyBackfill") or []):
        b = cb.get("bbox")
        if not isinstance(b, list) or len(b) != 4:
            continue
        bbox = [b[0] * W, b[1] * H, (b[0] + b[2]) * W, (b[1] + b[3]) * H]
        texts.append({
            "id": "v%d" % i, "level": None, "content": cb.get("content"),
            "fontStyle": None, "relation": None, "bbox": bbox,
            "color": text_color(img, bbox, W, H),
            "align": text_align(bbox, W),
            "inSubject": overlaps_subject(bbox, heat, W, H) if heat else False,
            "source": "vlm",
        })
    # 补漏已并进 texts，清掉原始清单，避免重复回填
    analysis.pop("copyBackfill", None)
    texts = assign_emphasis(infer_levels(texts))
    texts.sort(key=lambda t: (t["bbox"][1], t["bbox"][0]))
    analysis["texts"] = texts

    # 主体
    cov = ds.get("maskCoverage")
    for i, s in enumerate(analysis.get("subjects") or []):
        box = subj_boxes[i] if i < len(subj_boxes) else [0, 0, 1, 1]
        s["bbox"] = box
        s["mainColor"] = subject_main_color(img, box, W, H, heat)
        s["importance"] = subject_importance(box, cov, W, H)
        occ, by, cols = occlusion_of(box, texts, W, H)
        s["isOccluded"], s["occlusionBy"], s["occlusionColors"] = occ, by, cols

    comp = analysis.setdefault("composition", {})
    comp["focal"] = focal_point(heat)
    comp["whitespace"] = whitespace_ratio(img)
    comp["subjectTextRelation"] = subject_text_relation(texts, W, H, heat)

    st = analysis.setdefault("style", {})
    st["palette"] = pal
    st["colorTone"] = analysis["color"]["tone"]
    st["colorMood"] = analysis["color"]["mood"]

    analysis["meta"] = {"width": W, "height": H, "ratio": f"{W}:{H}", "source": "v3.2"}
    subs = analysis.get("subjects") or []
    analysis["embeddingText"] = "主体:%s；文字:%s；风格:%s/%s/%s；场景:%s" % (
        ",".join("%s[%s]占%.0f%%" % (s.get("id"), (s.get("label") or "")[:10],
                                     float(s.get("importance") or 0) * 100) for s in subs) or "无",
        ",".join("%s%s" % (t.get("id"), t.get("level") or "") for t in texts[:4]) or "无",
        comp.get("pattern") or "-",
        "/".join(analysis["color"]["tone"]),
        st.get("texture") or "-",
        ",".join((analysis.get("scene") or {}).get("sceneTags") or []) or "-",
    )
    analysis["confidence"] = 0.85 if subs or texts else 0.6
    return analysis
