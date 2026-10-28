import sys
import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import numpy as np, cv2, json
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator

path = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/3d/3D_Kernel_Code.webp"
img = cv2.imread(path)
H, W = img.shape[:2]
print(f"图片 {W}x{H}")

sam = sam_model_registry["vit_b"](checkpoint=os.environ.get("SAM_CHECKPOINT", os.path.join(_MODELS_DIR, "sam_vit_b.pth")))
gen = SamAutomaticMaskGenerator(sam, points_per_side=16, pred_iou_thresh=0.8)
masks = gen.generate(img)
print("自动分割出:", len(masks), "个区域")
masks.sort(key=lambda m: m["area"], reverse=True)
for m in masks[:6]:
    print(f"  面积={m['area']/(W*H)*100:.1f}% bbox={m['bbox']}")

mask = None
for m in masks:
    if m["area"] / (W * H) < 0.6:
        mask = m["segmentation"]
        print(f"选中区域: {m['area']/(W*H)*100:.1f}% bbox={m['bbox']}")
        break

if mask is not None:
    ch, cw = H/10, W/10
    hg = []
    for r in range(10):
        for c in range(10):
            cell = mask[int(r*ch):int((r+1)*ch), int(c*cw):int((c+1)*cw)]
            hg.append(int(round(cell.mean()*100)))
    det_path = path.rsplit(".", 1)[0] + ".detect.json"
    det = json.load(open(det_path))
    det["maskHeatGrid"] = hg
    det["maskCoverage"] = round(float(mask.mean())*100, 1)
    json.dump(det, open(det_path, "w"), ensure_ascii=False, indent=2)
    print("mask 覆盖率:", det["maskCoverage"], "%")
    print("热区:")
    for r in range(10):
        print("  ", " ".join(f"{hg[r*10+c]:3d}" for c in range(10)))
