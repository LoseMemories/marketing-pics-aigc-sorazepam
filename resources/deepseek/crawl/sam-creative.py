import sys, os, json, glob

import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import numpy as np, cv2
from segment_anything import sam_model_registry, SamPredictor, SamAutomaticMaskGenerator

SRC = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative"
COLS = ROWS = 10
CONF_MIN = 0.3

sam = sam_model_registry["vit_b"](checkpoint=os.environ.get("SAM_CHECKPOINT", os.path.join(_MODELS_DIR, "sam_vit_b.pth")))
predictor = SamPredictor(sam)
gen = SamAutomaticMaskGenerator(sam, points_per_side=16, pred_iou_thresh=0.8)

def heat_from_mask(mask):
    H, W = mask.shape
    ch, cw = H / ROWS, W / COLS
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            cell = mask[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
            out.append(int(round(cell.mean() * 100)))
    return out

files = sorted(glob.glob(os.path.join(SRC, "*.detect.json")))
print(f"creative detect.json: {len(files)} 个")

for i, det_path in enumerate(files):
    det = json.load(open(det_path))
    base = det["image_id"]
    img_path = os.path.splitext(det_path)[0].rsplit(".detect", 1)[0]
    # 找原图
    cands = [p for p in glob.glob(os.path.join(SRC, base + ".*")) if not p.endswith((".json", ".jpg"))]
    if not cands:
        print(f"[{i+1}] {base}: 无原图，跳过")
        continue
    img = cv2.imread(cands[0])
    if img is None:
        print(f"[{i+1}] {base}: 读图失败")
        continue
    H, W = img.shape[:2]

    objects = [o for o in det.get("objects", []) if o.get("conf", 0) >= CONF_MIN]
    union = np.zeros((H, W), dtype=bool)
    used = 0

    if objects:
        predictor.set_image(img)
        for o in objects:
            box = np.array(o["bbox"], dtype=float)
            if box[2] - box[0] < 5 or box[3] - box[1] < 5:
                continue
            masks, _, _ = predictor.predict(box=box, multimask_output=False)
            union |= masks[0]
            used += 1
        print(f"[{i+1}] {base}: {used} 个框 → mask 覆盖率 {union.mean()*100:.1f}%")
    else:
        masks = gen.generate(img)
        masks.sort(key=lambda m: m["area"], reverse=True)
        for m in masks:
            if m["area"] / (W * H) < 0.6:
                union = m["segmentation"]
                print(f"[{i+1}] {base}: 自动分割 {m['area']/(W*H)*100:.1f}%")
                used = 1
                break
        if used == 0:
            print(f"[{i+1}] {base}: 未找到合适主体")

    if used:
        det["maskHeatGrid"] = heat_from_mask(union)
        det["maskCoverage"] = round(float(union.mean()) * 100, 1)
        det["maskSource"] = "sam"
        json.dump(det, open(det_path, "w"), ensure_ascii=False, indent=2)

print("完成")
