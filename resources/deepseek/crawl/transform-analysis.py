import json, glob, os

ROOTS = [
    "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/magazine",
    "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/motionsites",
]

def bbox_from_region(region, cols, rows):
    if not region:
        return None
    cells = []
    for idx in region:
        r, c = divmod(int(idx), cols)
        cells.append((r, c))
    r0 = min(r for r, _ in cells); r1 = max(r for r, _ in cells)
    c0 = min(c for _, c in cells); c1 = max(c for _, c in cells)
    x = c0 / cols
    y = r0 / rows
    w = (c1 - c0 + 1) / cols
    h = (r1 - r0 + 1) / rows
    return {
        "x": round(x, 3), "y": round(y, 3), "w": round(w, 3), "h": round(h, 3),
        "margins": {
            "top": round(y, 3), "bottom": round(1 - (y + h), 3),
            "left": round(x, 3), "right": round(1 - (x + w), 3),
        },
    }

def transform(d):
    grid = d.get("grid") or {"cols": 4, "rows": 4}
    cols, rows = grid.get("cols", 4), grid.get("rows", 4)

    subjects = []
    for i, s in enumerate(d.get("subjects", [])):
        bb = bbox_from_region(s.get("region"), cols, rows)
        subjects.append({
            "id": f"s{i}",
            "category": s.get("category"),
            "region": s.get("region"),
            "areaRatio": s.get("areaRatio"),
            "importance": s.get("importance"),
            "mainColor": s.get("mainColor"),
            "bgColor": s.get("bgColor"),
            "bbox": {k: bb[k] for k in ("x", "y", "w", "h")} if bb else None,
            "margins": bb["margins"] if bb else None,
        })

    texts = []
    for i, t in enumerate(d.get("textBlocks", [])):
        bb = bbox_from_region(t.get("region"), cols, rows)
        texts.append({
            "id": f"t{i}",
            "level": t.get("level"),
            "content": t.get("content"),
            "region": t.get("region"),
            "areaRatio": round((bb["w"] * bb["h"]), 3) if bb else None,
            "bbox": {k: bb[k] for k in ("x", "y", "w", "h")} if bb else None,
            "margins": bb["margins"] if bb else None,
            "occlusion": t.get("occlusion"),
            "orientation": t.get("orientation"),
            "fontStyle": t.get("fontStyle"),
            "color": t.get("color"),
        })

    # relations 初版：主标题 ↔ 主主体
    relations = []
    primary = next((s for s in subjects if s["importance"] and s["importance"] >= 0.6), subjects[0] if subjects else None)
    title = next((t for t in texts if t["level"] == "主标题"), texts[0] if texts else None)
    if primary and title and d.get("titleRelation"):
        relations.append({
            "textId": title["id"], "subjectId": primary["id"],
            "type": "描述", "detail": d.get("titleRelation"),
        })

    style = {
        "textStyles": [
            {"textId": t["id"], "fontStyle": t.get("fontStyle"), "color": t.get("color")}
            for t in texts
        ],
        "palette": d.get("palette"),
        "composition": d.get("composition", {}).get("type") if isinstance(d.get("composition"), dict) else d.get("composition"),
        "whitespace": d.get("composition", {}).get("whitespace") if isinstance(d.get("composition"), dict) else None,
        "mainColorCount": d.get("composition", {}).get("mainColorCount") if isinstance(d.get("composition"), dict) else None,
        "complexity": d.get("composition", {}).get("complexity") if isinstance(d.get("composition"), dict) else None,
        "colorTone": (d.get("style") or {}).get("colorTone"),
        "styleTags": (d.get("style") or {}).get("styleTags"),
        "texture": (d.get("style") or {}).get("texture"),
    }

    scene = {
        "sceneTags": d.get("sceneTags"),
        "emotionTags": d.get("emotionTags"),
        "purpose": (d.get("metadata") or {}).get("purpose"),
        "intent": (d.get("metadata") or {}).get("intent"),
        "series": (d.get("metadata") or {}).get("series"),
    }

    # embeddingText：把三层压成一句供向量检索
    def fmt_sub(s):
        if not s.get("bbox"):
            return f"{s['id']}[无位置]"
        b = s["bbox"]
        return f"{s['id']}区{s.get('region')}占{s.get('areaRatio')} bbox({b['x']},{b['y']},{b['w']},{b['h']})"
    def fmt_txt(t):
        if not t.get("bbox"):
            return f"{t['id']}" + (t.get("content") or "")
        return f"{t['id']}[{t.get('level')}]区{t.get('region')}「{t.get('content') or ''}」"

    emb = "；".join(filter(None, [
        "主体:" + "，".join(fmt_sub(s) for s in subjects) if subjects else "",
        "文字:" + "，".join(fmt_txt(t) for t in texts) if texts else "",
        "风格:" + "，".join(filter(None, [
            str(style.get("composition") or ""),
            "/".join(style.get("colorTone") or []),
            "/".join(style.get("styleTags") or []),
        ])) if any([style.get("composition"), style.get("colorTone"), style.get("styleTags")]) else "",
        "场景:" + str(scene.get("purpose") or "") + "；" + "/".join(scene.get("sceneTags") or []),
    ]))

    return {
        "image_id": d.get("image_id"),
        "meta": d.get("meta"),
        "grid": grid,
        "geometry": {"subjects": subjects, "texts": texts, "relations": relations},
        "style": style,
        "scene": scene,
        "semanticSummary": d.get("semanticSummary"),
        "embeddingText": emb,
        "confidence": d.get("confidence"),
    }

count = 0
for root in ROOTS:
    for f in glob.glob(os.path.join(root, "**", "*.analysis.json"), recursive=True):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if "geometry" in d:  # 已转换
            continue
        out = transform(d)
        json.dump(out, open(f, "w"), ensure_ascii=False, indent=2)
        count += 1
print(f"转换完成: {count} 个")
