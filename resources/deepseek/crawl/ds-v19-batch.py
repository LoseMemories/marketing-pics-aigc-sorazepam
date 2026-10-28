import base64, json, glob, os, re, io, urllib.request
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

ROOT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration"
CATS = ["creative", "travel"]
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

for cat in CATS:
    files = sorted([p for p in glob.glob(os.path.join(ROOT, cat, "*.webp")) + glob.glob(os.path.join(ROOT, cat, "*.jpg"))
                    if ".annotated." not in os.path.basename(p) and ".florence." not in os.path.basename(p) and ".deepseek." not in os.path.basename(p)])
    print(f"\n=== {cat}: {len(files)} 张 ===")
    for i, path in enumerate(files):
        base = os.path.splitext(os.path.basename(path))[0]
        img = Image.open(path).convert("RGB")
        W, H = img.size
        small = img.copy(); small.thumbnail((640, 640))
        buf = io.BytesIO(); small.save(buf, format="JPEG", quality=80)
        b64 = base64.b64encode(buf.getvalue()).decode()

        body = {"model": "deepseek-flash", "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
        ]}], "max_tokens": 2000}
        req = urllib.request.Request("https://api.deepseek.com/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            content = data["choices"][0]["message"]["content"]
            m = re.search(r'\{[\s\S]*\}', content)
            parsed = json.loads(m.group(0)) if m else {}
            subj = parsed.get("subject"); bbox = parsed.get("bbox"); category = parsed.get("category")
        except Exception as e:
            print(f"[{i+1}] {base}: DeepSeek ERROR {e}")
            continue

        rec = {"image_id": base, "width": W, "height": H, "subject": subj, "category": category,
               "bbox": bbox, "source": "deepseek-v19"}
        if bbox:
            x1, y1, x2, y2 = [float(v) for v in bbox]
            if max(bbox) <= 1.5:
                x1, y1, x2, y2 = x1 * W, y1 * H, x2 * W, y2 * H
            x1 = max(0, min(W - 2, x1)); y1 = max(0, min(H - 2, y1))
            x2 = max(x1 + 2, min(W, x2)); y2 = max(y1 + 2, min(H, y2))
            img_cv = cv2.imread(path)
            pred.set_image(img_cv)
            masks, scores, _ = pred.predict(box=np.array([x1, y1, x2, y2]), multimask_output=True)
            best = max(zip(masks, scores), key=lambda x: x[1])[0]
            rec["maskHeatGrid"] = heat_from_mask(best)
            rec["maskCoverage"] = round(float(best.mean()) * 100, 1)
            rec["subjectCount"] = 1
            print(f"[{i+1}] {base}: {str(subj)[:24]} | {category} | {rec['maskCoverage']}%")
        else:
            rec["subjectCount"] = 0
            print(f"[{i+1}] {base}: 无主体")

        json.dump(rec, open(os.path.join(os.path.dirname(path), f"{base}.deepseek.json"), "w"), ensure_ascii=False, indent=2)

print("\n完成")
