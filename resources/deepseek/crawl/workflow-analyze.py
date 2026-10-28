"""
工作流分析脚本：图片 → 主体(DeepSeek) → SAM mask → 文字(OCR) → 色块(无主体时)
用法: python3 workflow-analyze.py <image_path> [out_json_path]
输出: JSON 到 stdout，同时写 <out_json_path>
"""
import sys, os, json, base64, re, io, glob, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # resources/deepseek
PROJECT_ROOT = os.path.dirname(os.path.dirname(ROOT))  # repository root
MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(PROJECT_ROOT, "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(MODELS_DIR, "pylibs39")))
import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, HERE)
import runlog as _rl
ENV_PATH = os.environ.get("DEEPSEEK_ENV_FILE") or os.path.join(
    PROJECT_ROOT, "backend", ".env.local"
)
PROMPT_PATH = os.path.join(ROOT, "crawl", "ds-subject-prompt.md")
VOCAB_PROMPT_PATH = os.path.join(ROOT, "docs", "12-设计语汇分析提示词-v3.2-代码回填版.md")
COLS = ROWS = 10
CATEGORY_SET = {"3d", "creative", "ecommerce", "landingpage", "magazine", "technology", "travel"}

def normalize_category(value):
    """06 只能给字典内类别；无法判断/不在字典内一律 null（前端显示未归类）。"""
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value if value in CATEGORY_SET else None

def progress(step, status, detail=""):
    print(f"PROGRESS|{step}|{status}|{detail}", file=sys.stderr, flush=True)

def load_env():
    env = {}
    candidates = [ENV_PATH, os.path.join(PROJECT_ROOT, ".env.local")]
    for path in candidates:
        if not os.path.exists(path):
            continue
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
        break
    return env

def deepseek_subjects(img_pil, key):
    import urllib.request
    prompt = open(PROMPT_PATH).read()
    small = img_pil.copy(); small.thumbnail((640, 640))
    buf = io.BytesIO(); small.save(buf, format="JPEG", quality=80)
    b64 = base64.b64encode(buf.getvalue()).decode()
    body = {"model": "deepseek-flash", "messages": [{"role": "user", "content": [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
    ]}], "max_tokens": 6000}
    req = urllib.request.Request("https://api.deepseek.com/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.load(r)
    content = data["choices"][0]["message"]["content"]
    m = re.search(r'\{[\s\S]*\}', content)
    parsed = json.loads(m.group(0)) if m else {}
    return parsed.get("subjects", []), data.get("usage", {})

def sam_union(img_cv, subjects):
    from segment_anything import sam_model_registry, SamPredictor
    H, W = img_cv.shape[:2]
    sam = sam_model_registry["vit_b"](
        checkpoint=os.environ.get("SAM_CHECKPOINT", os.path.join(MODELS_DIR, "sam_vit_b.pth"))
    )
    pred = SamPredictor(sam)
    pred.set_image(img_cv)
    union = np.zeros((H, W), dtype=bool)
    ok = 0
    for s in subjects:
        bbox = s.get("bbox")
        if not bbox: continue
        x1, y1, x2, y2 = [float(v) for v in bbox]
        if max(bbox) <= 1.5:
            x1, y1, x2, y2 = x1*W, y1*H, x2*W, y2*H
        x1 = max(0, min(W-2, x1)); y1 = max(0, min(H-2, y1))
        x2 = max(x1+2, min(W, x2)); y2 = max(y1+2, min(H, y2))
        masks, scores, _ = pred.predict(box=np.array([x1, y1, x2, y2]), multimask_output=True)
        best = max(zip(masks, scores), key=lambda x: x[1])[0]
        union |= best
        ok += 1
    return union, ok

def heat_from_mask(mask):
    H, W = mask.shape
    ch, cw = H/ROWS, W/COLS
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            cell = mask[int(r*ch):int((r+1)*ch), int(c*cw):int((c+1)*cw)]
            out.append(int(round(cell.mean()*100)))
    return out

def color_grid(img_cv):
    H, W = img_cv.shape[:2]
    rgb = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)
    hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    cw, ch = W/COLS, H/ROWS
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            x1, y1 = int(c*cw), int(r*ch)
            x2, y2 = int((c+1)*cw), int((r+1)*ch)
            cell = rgb[y1:y2, x1:x2].reshape(-1, 3)
            med = np.median(cell, axis=0).astype(int)
            hexc = "#{:02X}{:02X}{:02X}".format(int(med[0]), int(med[1]), int(med[2]))
            chh = hsv[y1:y2, x1:x2].reshape(-1, 3)
            sm, vm = float(chh[:,1].mean()), float(chh[:,2].mean())
            layer = "高饱和" if (sm > 100 and vm > 80) else ("暗部" if vm < 60 else "中间调")
            out.append({"region": r*COLS+c, "color": hexc, "layer": layer})
    return out

# ---------------- 设计语汇（与批量工作流一致） ----------------
MOOD_SET = {'黑白色调', '复古色调', '暖色', '冷色', '暗色调', '清新感',
            '炫光色调', '霓虹迷幻', '赛伯朋克', '废土风', '像素风'}
HEX_RE = re.compile(r'^#?[0-9a-fA-F]{3,8}$')

def _hex2rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    if len(h) == 8: h = h[:6]
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def _color_name(hexc):
    import colorsys
    r, g, b = _hex2rgb(hexc)
    hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    hue = hh * 360
    if ss < 0.12:
        return '白' if vv > 0.90 else ('黑' if vv < 0.12 else '灰')
    if vv < 0.14: return '黑'
    if 15 <= hue < 45 and vv < 0.42: return '棕'
    if 15 <= hue < 70 and ss < 0.30 and vv > 0.80: return '米'
    if hue < 15 or hue >= 345: return '红'
    if hue < 40: return '橙'
    if hue < 65: return '黄'
    if hue < 90: return '黄绿'
    if hue < 150: return '绿'
    if hue < 190: return '青'
    if hue < 250: return '蓝'
    if hue < 320: return '紫'
    return '粉'

def _tones_from_palette(pal):
    w = {}
    def add(c, k):
        if not isinstance(c, str) or not HEX_RE.match(c.strip()): return
        n = _color_name(c.strip()); w[n] = w.get(n, 0) + k
    add(pal.get('maincolor'), 3)
    v = pal.get('vicecolor')
    if isinstance(v, str): add(v, 2)
    elif isinstance(v, list):
        for x in v: add(x, 2 / max(1, len(v)))
    for x in (pal.get('accentColors') or [])[:6]: add(x, 1)
    if not w: return []
    mx = max(w.values())
    return [k for k, val in sorted(w.items(), key=lambda kv: -kv[1]) if val >= mx * 0.34][:3]

def normalize_style(style):
    """colorTone 一律由 palette 的真实 RGB 换算，禁止复合词"""
    pal = style.get('palette') or {}
    colors = _tones_from_palette(pal)
    old = style.get('colorTone') or []
    if not isinstance(old, list): old = [old]
    mood = style.get('colorMood')
    if not isinstance(mood, list):
        mood = [t for t in old if t in MOOD_SET]
    if not colors:
        colors = [t for t in old if t not in MOOD_SET]
    if colors and set(colors) <= {'黑', '白', '灰'} and '黑白色调' not in mood:
        mood.append('黑白色调')
    style['colorTone'] = colors
    style['colorMood'] = mood
    return style

def deepseek_vocabulary(img_pil, key, subjects, texts, mask_cov, W, H):
    import urllib.request
    raw = open(VOCAB_PROMPT_PATH, encoding="utf-8").read()
    _st, _en = "<!--PROMPT_START-->", "<!--PROMPT_END-->"
    _i, _j = raw.find(_st), raw.find(_en)
    if _i < 0 or _j <= _i:
        raise RuntimeError("提示词哨兵未找到")
    doc = raw[_i + len(_st):_j].strip()
    if len(doc) < 2000:
        raise RuntimeError(f"提示词过短 {len(doc)}")
    facts = {
        "size": f"{W}x{H}",
        "maskCoverage": mask_cov,
        "subjects": [{"id": f"s{i}", "subject": s.get("subject"),
                      "category": s.get("category"), "role": s.get("role"),
                      "bbox": s.get("bbox")} for i, s in enumerate(subjects or [])],
        "ocrTexts": [{"content": t.get("content"), "bbox": t.get("bbox")} for t in (texts or [])][:40]
    }
    ask = (doc + "\n\n---\n【本次图片的已知物理事实（必须一致，勿改动 bbox）】\n"
           + json.dumps(facts, ensure_ascii=False)
           + "\n\n【输出】只输出 1 个 JSON 对象，不要 markdown 代码块、不要解释。字段："
             "semanticSummary, category(3d|creative|ecommerce|landingpage|magazine|technology|travel，无法判断填 null), "
             "subjects[{id,label,category,role,narrative,depth,surface,occlusionPreference}], "
             "texts[{id,level,content,fontStyle,color,relation}], "
             "copyBackfill[{content,bbox:[x,y,w,h],confidence}], "
             "background{description,busyness}, composition{pattern,readingOrder[]}, "
             "style{styleTags[],texture,complexity,era}, "
             "scene{sceneTags[],emotionTags[],purpose,intent,series}, "
             "designGuidance{sceneSubject,initialOcclusion,actualOcclusion,copyDesign}")
    small = img_pil.copy(); small.thumbnail((896, 896))
    buf = io.BytesIO(); small.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    last_usage = {}
    # 推理模型偶尔会把预算耗尽、content 为空；逐步抬高 max_tokens 重试
    for attempt, mt in enumerate((8000, 16000, 16000)):
        _t_attempt = time.time()
        body = {"model": "deepseek-flash", "messages": [{"role": "user", "content": [
            {"type": "text", "text": ask},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
        ]}], "max_tokens": mt}
        req = urllib.request.Request("https://api.deepseek.com/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.load(r)
        last_usage = data.get("usage", {})
        content = (data["choices"][0]["message"].get("content") or "").strip()
        _rl.log_stage("vocabulary", attempt=attempt + 1, max_tokens=mt,
                      tokens=last_usage.get("total_tokens"),
                      finish_reason=data["choices"][0].get("finish_reason"),
                      empty=(content == ""), duration_ms=int((time.time() - _t_attempt) * 1000))
        if content:
            m = re.search(r'\{[\s\S]*\}', content)
            if m:
                try:
                    return json.loads(m.group(0)), last_usage
                except json.JSONDecodeError:
                    pass
        progress("语汇分析", "running", f"第 {attempt + 1} 次重试（响应为空）")
    return {}, last_usage


def ocr_best(img_path, W, H):
    """多尺度 OCR：小图自动补一次 2× 放大，按 (段数, 置信度和) 选更优的一路。
    返回 (texts, scale, detail)。"""
    import easyocr
    easyocr_model_dir = os.environ.get("EASYOCR_MODEL_DIR", os.path.join(MODELS_DIR, "easyocr-model"))
    easyocr_network_dir = os.environ.get("EASYOCR_NETWORK_DIR", os.path.join(MODELS_DIR, "easyocr-network"))
    os.makedirs(easyocr_model_dir, exist_ok=True)
    os.makedirs(easyocr_network_dir, exist_ok=True)
    reader = easyocr.Reader(['ch_sim','en'], gpu=False, verbose=False,
                            model_storage_directory=easyocr_model_dir,
                            user_network_directory=easyocr_network_dir)

    long_side = max(W, H)
    scales = [1.0, 2.0] if long_side < 900 else [1.0]

    best = ([], 1.0, 0.0)
    for sc in scales:
        src = img_path
        if sc != 1.0:
            from PIL import Image as _I
            im = _I.open(img_path).convert('RGB')
            im = im.resize((int(W * sc), int(H * sc)), _I.LANCZOS)
            src = f'/tmp/_ocr_{sc}x.png'
            im.save(src)
        out = []
        for box, text, conf in reader.readtext(src):
            c = float(conf)
            if c < 0.3 or len(str(text).strip()) < 1:
                continue
            xs = [p[0] / sc for p in box]; ys = [p[1] / sc for p in box]
            out.append({"content": str(text), "conf": round(c, 3),
                        "bbox": [round(min(xs), 1), round(min(ys), 1),
                                 round(max(xs), 1), round(max(ys), 1)]})
        score = sum(len(t["content"]) * t["conf"] for t in out)
        progress("文字探查", "running", f"{sc:g}× → {len(out)} 段 (score {score:.0f})")
        if (len(out), score) > (len(best[0]), best[2]):
            best = (out, sc, score)
    return best[0], best[1], f'best {best[1]:g}×'


def _iou(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def merge_texts(ocr_texts, vlm_texts, W, H, thr=0.45):
    """OCR 精确框 + 视觉模型补漏框：IoU 去重，并集保留。
    返回 (merged, added)。merged 的 bbox 一律像素 x1,y1,x2,y2。"""
    merged = []
    for t in (ocr_texts or []):
        b = t.get("bbox")
        if not isinstance(b, list) or len(b) != 4:
            continue
        merged.append({"content": t.get("content"), "conf": t.get("conf", 0.5),
                       "bbox": [float(v) for v in b], "source": "ocr"})
    added = 0
    for v in (vlm_texts or []):
        bb = v.get("bbox")
        if not isinstance(bb, list) or len(bb) != 4:
            continue
        try:
            x, y, w, h = [float(k) for k in bb]
        except (TypeError, ValueError):
            continue
        if w <= 0 or h <= 0:
            continue
        # 归一化 x,y,w,h（若误给成 0-1 以外的绝对值则跳过）
        if max(abs(x), abs(y), abs(w), abs(h)) > 1.5:
            continue
        if w * h < 0.002:          # 太小：噪点
            continue
        if not (v.get("content") or "").strip():   # 只给了个框、没读出字 → 不算文案
            continue
        box = [x * W, y * H, (x + w) * W, (y + h) * H]
        if any(_iou(box, m["bbox"]) > thr for m in merged):
            continue
        merged.append({"content": v.get("content"),
                       "conf": float(v.get("confidence") or 0.6),
                       "bbox": [round(box[0], 1), round(box[1], 1), round(box[2], 1), round(box[3], 1)],
                       "source": "vlm", "level": v.get("level")})
        added += 1
    merged.sort(key=lambda m: (m["bbox"][1], m["bbox"][0]))
    return merged, added

def main():
    if len(sys.argv) < 2:
        print("usage: workflow-analyze.py <image>", file=sys.stderr); sys.exit(1)
    img_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else None
    base = os.path.splitext(os.path.basename(img_path))[0]

    env = load_env()
    key = env.get("DEEPSEEK_API_KEY")
    img_pil = Image.open(img_path).convert("RGB")
    W, H = img_pil.size

    steps = []
    progress("主体探查", "running", "DeepSeek 视觉定位中")
    subjects, usage = deepseek_subjects(img_pil, key)
    _rl.log_stage("subjects", tokens=usage.get("total_tokens"), count=len(subjects))
    steps.append({"step": "主体探查 (DeepSeek)", "ok": True, "count": len(subjects),
                  "detail": f"{usage.get('total_tokens', '?')} tokens"})
    progress("主体探查", "done", f"{len(subjects)} 个主体 · {usage.get('total_tokens','?')} tokens")

    rec = {"image_id": base, "width": W, "height": H, "source": "workflow",
           "subjects": subjects, "subjectCount": len(subjects), "steps": steps}

    if subjects:
        progress("SAM 分割", "running", f"{len(subjects)} 个主体")
        img_cv = cv2.imread(img_path)
        union, ok = sam_union(img_cv, subjects)
        rec["maskHeatGrid"] = heat_from_mask(union)
        rec["maskCoverage"] = round(float(union.mean())*100, 1)
        steps.append({"step": "SAM 分割", "ok": True, "count": ok, "detail": f"mask 覆盖 {rec['maskCoverage']}%"})
        progress("SAM 分割", "done", f"mask 覆盖 {rec['maskCoverage']}%")
        progress("热区计算", "done", "10×10 已完成")
    else:
        progress("色块探查", "running", "逐格中位色 + HSV")
        img_cv = cv2.imread(img_path)
        rec["colorGrid"] = color_grid(img_cv)
        rec["colorGridCols"] = COLS
        rec["colorGridRows"] = ROWS
        layers = {}
        for g in rec["colorGrid"]:
            layers[g["layer"]] = layers.get(g["layer"], 0) + 1
        steps.append({"step": "色块探查 (算法)", "ok": True, "count": len(rec["colorGrid"]), "detail": str(layers)})
        progress("色块探查", "done", str(layers))

    # OCR
    progress("文字探查", "running", "EasyOCR 多尺度")
    try:
        texts, used_scale, how = ocr_best(img_path, W, H)
        rec["texts"] = texts
        rec["ocrScale"] = used_scale
        _rl.log_stage("ocr", scale=used_scale, texts=len(texts))
        steps.append({"step": "文字探查 (OCR)", "ok": True, "count": len(texts), "detail": f"EasyOCR {how}"})
        progress("文字探查", "done", f"{len(texts)} 段文字 · {how}")
    except Exception as e:
        steps.append({"step": "文字探查 (OCR)", "ok": False, "count": 0, "detail": str(e)[:80]})
        progress("文字探查", "done", f"失败: {str(e)[:50]}")

    # 设计语汇（与批量图片工作流一致）
    progress("语汇分析", "running", "DeepSeek 设计语汇")
    analysis = None
    try:
        analysis, vusage = deepseek_vocabulary(img_pil, key, subjects, rec.get("texts") or [],
                                               rec.get("maskCoverage"), W, H)
        # 色相/调色板由 design_fill.enrich 统一投影，这里不再处理
        analysis["category"] = normalize_category(analysis.get("category"))
        analysis["image_id"] = base
        analysis["width"] = W
        analysis["height"] = H
        analysis.setdefault("meta", {})["source"] = "workflow"
        steps.append({"step": "语汇分析 (DeepSeek)", "ok": True, "count": 1,
                      "detail": f"{vusage.get('total_tokens', '?')} tokens"})
        progress("语汇分析", "done",
                 f"{len(analysis.get('semanticSummary') or '')} 字 · "
                 f"色调 {(analysis.get('style') or {}).get('colorTone')}")
    except Exception as e:
        steps.append({"step": "语汇分析 (DeepSeek)", "ok": False, "count": 0, "detail": str(e)[:120]})
        progress("语汇分析", "done", f"失败: {str(e)[:60]}")

    # v3.2：数值由 design_fill 本地回填（palette/对比/重点度/构图焦点…）
    if analysis is not None:
        try:
            import design_fill as _df
            analysis = _df.enrich(analysis, rec, img_pil)
            # 同一内容可能同时被标注成“主标题/logo”，按内容去重，保留先出现的层级
            if analysis.get("texts"):
                seen = set()
                deduped = []
                for t in analysis["texts"]:
                    key = str(t.get("content") or "").strip().lower()
                    if key and key in seen:
                        continue
                    if key:
                        seen.add(key)
                    deduped.append(t)
                analysis["texts"] = deduped
            if analysis.get("texts"):
                rec["texts"] = [
                    {"content": t.get("content"), "conf": t.get("conf", 0.6),
                     "bbox": t.get("bbox"), "source": t.get("source", "ocr"),
                     "level": t.get("level")}
                    for t in analysis["texts"]
                ]
            steps.append({"step": "代码回填", "ok": True, "count": len(analysis.get("texts") or []),
                          "detail": "palette / 对比 / 重点度 / 构图焦点"})
            progress("代码回填", "done", f"{len(analysis.get('texts') or [])} 段文案已回填")
        except Exception as e:
            steps.append({"step": "代码回填", "ok": False, "count": 0, "detail": str(e)[:100]})
            progress("代码回填", "done", f"失败: {str(e)[:50]}")

    progress("写入结果", "running", "生成 JSON")
    rec_file = json.dumps(rec, ensure_ascii=False, indent=2)
    if out_path:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        open(out_path, "w").write(rec_file)
        if analysis is not None:
            ap = re.sub(r'\.deepseek\.json$', '.analysis.json', out_path)
            if ap == out_path:
                ap = os.path.splitext(out_path)[0] + ".analysis.json"
            open(ap, "w").write(json.dumps(analysis, ensure_ascii=False, indent=2))
    progress("写入结果", "done", "待落库")
    # stdout 回传给前端展示（文件里不重复存语汇层）
    if analysis is not None:
        rec["analysis"] = analysis
    print(json.dumps(rec, ensure_ascii=False))

if __name__ == "__main__":
    main()
