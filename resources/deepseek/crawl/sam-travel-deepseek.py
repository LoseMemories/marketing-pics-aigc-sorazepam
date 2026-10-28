import sys, os, json, glob

import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import numpy as np, cv2
from segment_anything import sam_model_registry, SamPredictor

DIR = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/travel"
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

ds_files = sorted(glob.glob(os.path.join(DIR, "*.deepseek.json")))
print(f"deepseek.json: {len(ds_files)}")

for i, ds_path in enumerate(ds_files):
    d = json.load(open(ds_path))
    base = d["image_id"]
    bbox = d.get("bbox")
    if not bbox:
        print(f"[{i+1}] {base}: 无主体，跳过")
        continue
    # 找原图
    cands = [p for p in glob.glob(os.path.join(DIR, base + ".*")) if not p.endswith((".json", ".jpg"))]
    if not cands:
        print(f"[{i+1}] {base}: 无原图")
        continue
    img = cv2.imread(cands[0])
    H, W = img.shape[:2]

    # 归一化 bbox -> 像素
    x1, y1, x2, y2 = bbox
    if max(bbox) <= 1.5:
        x1, y1, x2, y2 = x1 * W, y1 * H, x2 * W, y2 * H
    x1 = max(0, min(W - 2, x1)); y1 = max(0, min(H - 2, y1))
    x2 = max(x1 + 2, min(W, x2)); y2 = max(y1 + 2, min(H, y2))

    pred.set_image(img)
    masks, scores, _ = pred.predict(box=np.array([x1, y1, x2, y2]), multimask_output=True)
    best = max(zip(masks, scores), key=lambda x: x[1])[0]
    d["maskHeatGrid"] = heat_from_mask(best)
    d["maskCoverage"] = round(float(best.mean()) * 100, 1)
    d["subjectCount"] = 1
    json.dump(d, open(ds_path, "w"), ensure_ascii=False, indent=2)
    print(f"[{i+1}] {base}: {d.get('subject','')[:20]} | mask 覆盖 {d['maskCoverage']}%")

print("完成")
