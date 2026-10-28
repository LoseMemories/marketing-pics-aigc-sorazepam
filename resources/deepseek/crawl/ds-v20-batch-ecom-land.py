import base64, json, os, re, io, urllib.request, glob
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
COLS = ROWS = 10
sam = sam_model_registry["vit_b"](checkpoint=os.environ.get("SAM_CHECKPOINT", os.path.join(_MODELS_DIR, "sam_vit_b.pth")))
pred = SamPredictor(sam)

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

def process(path, cat):
    base = os.path.splitext(os.path.basename(path))[0]
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
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.load(r)
    content = data["choices"][0]["message"]["content"]
    m = re.search(r'\{[\s\S]*\}', content)
    parsed = json.loads(m.group(0)) if m else {}
    subjects = parsed.get("subjects", [])

    rec = {"image_id": base, "width": W, "height": H, "subjects": subjects,
           "subjectCount": len(subjects), "source": "deepseek-v20"}

    if subjects:
        img_cv = cv2.imread(path)
        pred.set_image(img_cv)
        union = np.zeros((H, W), dtype=bool)
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
        rec["maskHeatGrid"] = heat_from_mask(union)
        rec["maskCoverage"] = round(float(union.mean())*100, 1)
    else:
        img_cv = cv2.imread(path)
        rec["colorGrid"] = color_grid(img_cv)
        rec["colorGridCols"] = COLS
        rec["colorGridRows"] = ROWS

    out_path = os.path.join(os.path.dirname(path), f"{base}.deepseek.json")
    json.dump(rec, open(out_path, "w"), ensure_ascii=False, indent=2)
    return rec

TARGETS = []
for p in sorted(glob.glob(os.path.join(ROOT, "ecommerce", "*"))):
    if p.endswith((".webp", ".jpg")) and ".annotated." not in p and ".florence." not in p and ".deepseek." not in p:
        TARGETS.append((p, "ecommerce"))
landing = sorted([p for p in glob.glob(os.path.join(ROOT, "landingpage", "*"))
                  if p.endswith((".webp", ".jpg")) and ".annotated." not in p and ".florence." not in p and ".deepseek." not in p])
TARGETS += [(p, "landingpage") for p in landing[:20]]

print(f"待处理: {len(TARGETS)} 张")
for i, (path, cat) in enumerate(TARGETS):
    try:
        rec = process(path, cat)
        print(f"[{i+1}/{len(TARGETS)}] {rec['image_id'][:32]}: 主体{rec['subjectCount']} " +
              (f"mask {rec.get('maskCoverage')}%" if rec.get('maskHeatGrid') else "色块"))
    except Exception as e:
        print(f"[{i+1}/{len(TARGETS)}] {os.path.basename(path)}: ERROR {e}")
print("完成")
