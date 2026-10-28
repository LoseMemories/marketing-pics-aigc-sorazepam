import base64, json, os, re, io, urllib.request
import sys
import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import numpy as np, cv2
from PIL import Image
from segment_anything import sam_model_registry, SamPredictor

env = {}
for line in open("/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc/backend/.env.local"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); env[k.strip()] = v.strip()
key = env["DEEPSEEK_API_KEY"]
PROMPT = open("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl/ds-subject-prompt.md").read()

DIR = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative"
NAMES = ["Ancient_Oath", "Dream_Garden", "Frame_Futures", "Frozen_Cave", "Honey_Bee", "Keel"]
COLS = ROWS = 10
sam = sam_model_registry["vit_b"](checkpoint=os.environ.get("SAM_CHECKPOINT", os.path.join(_MODELS_DIR, "sam_vit_b.pth")))
pred = SamPredictor(sam)

def heat_from_mask(mask):
    H, W = mask.shape
    ch, cw = H / ROWS, W / COLS
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            cell = mask[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
            out.append(int(round(cell.mean() * 100)))
    return out

for name in NAMES:
    base = f"Creative_{name}"
    path = os.path.join(DIR, base + ".webp")
    if not os.path.exists(path):
        path = os.path.join(DIR, base + ".jpg")
    if not os.path.exists(path):
        print(f"{base}: 文件不存在"); continue
    img = Image.open(path).convert("RGB")
    W, H = img.size
    small = img.copy(); small.thumbnail((640, 640))
    buf = io.BytesIO(); small.save(buf, format="JPEG", quality=80)
    b64 = base64.b64encode(buf.getvalue()).decode()

    body = {"model": "deepseek-flash", "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
    ]}], "max_tokens": 6000}
    req = urllib.request.Request("https://api.deepseek.com/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.load(r)
        content = data["choices"][0]["message"]["content"]
        m = re.search(r'\{[\s\S]*\}', content)
        parsed = json.loads(m.group(0)) if m else {}
        subjects = parsed.get("subjects", [])
        print(f"  RAW[{base}]: {content[:160]}")
    except Exception as e:
        print(f"{base}: DeepSeek ERROR {e}"); continue

    print(f"\n=== {base} ({W}x{H}) ===")
    for s in subjects:
        print(f"  [{s.get('role')}] {s.get('subject')} | {s.get('category')} | depth={s.get('depth')} | 遮挡={s.get('occlusionPreference')} | bbox={s.get('bbox')}")

    rec = {"image_id": base, "width": W, "height": H, "subjects": subjects, "source": "deepseek-v20"}
    if subjects:
        img_cv = cv2.imread(path)
        pred.set_image(img_cv)
        union = np.zeros((H, W), dtype=bool)
        for s in subjects:
            bbox = s.get("bbox")
            if not bbox: continue
            x1, y1, x2, y2 = [float(v) for v in bbox]
            if max(bbox) <= 1.5:
                x1, y1, x2, y2 = x1 * W, y1 * H, x2 * W, y2 * H
            x1 = max(0, min(W - 2, x1)); y1 = max(0, min(H - 2, y1))
            x2 = max(x1 + 2, min(W, x2)); y2 = max(y1 + 2, min(H, y2))
            masks, scores, _ = pred.predict(box=np.array([x1, y1, x2, y2]), multimask_output=True)
            best = max(zip(masks, scores), key=lambda x: x[1])[0]
            union |= best
        rec["maskHeatGrid"] = heat_from_mask(union)
        rec["maskCoverage"] = round(float(union.mean()) * 100, 1)
        rec["subjectCount"] = len(subjects)
        print(f"  -> 并集 mask 覆盖 {rec['maskCoverage']}%")
    else:
        rec["subjectCount"] = 0
        print("  -> 无主体")

    json.dump(rec, open(os.path.join(DIR, base + ".deepseek.json"), "w"), ensure_ascii=False, indent=2)

print("\n完成")
