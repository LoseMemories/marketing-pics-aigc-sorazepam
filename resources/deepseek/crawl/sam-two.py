import sys
import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import numpy as np, cv2, json
from segment_anything import sam_model_registry, SamPredictor, SamAutomaticMaskGenerator

IMGS = [
    ("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/ecommerce/Ecommerce_Halo_Sound.webp", "ecommerce"),
    ("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/3d/3D_3D_Character_Studio.webp", "3d"),
]

sam = sam_model_registry["vit_b"](checkpoint=os.environ.get("SAM_CHECKPOINT", os.path.join(_MODELS_DIR, "sam_vit_b.pth")))
predictor = SamPredictor(sam)
gen = SamAutomaticMaskGenerator(sam, points_per_side=16, pred_iou_thresh=0.8)

def heat_from_mask(mask, cols=10, rows=10):
    H, W = mask.shape
    ch, cw = H / rows, W / cols
    out = []
    for r in range(rows):
        for c in range(cols):
            cell = mask[int(r*ch):int((r+1)*ch), int(c*cw):int((c+1)*cw)]
            out.append(int(round(cell.mean() * 100)))
    return out

for path, cat in IMGS:
    img = cv2.imread(path)
    H, W = img.shape[:2]
    base = path.split("/")[-1].rsplit(".", 1)[0]
    print(f"\n=== {base} ({W}x{H}) ===")

    # 读 detect.json 找主体框
    det_path = path.rsplit(".", 1)[0] + ".detect.json"
    det = json.load(open(det_path))
    subjects = [o for o in det["objects"] if o["class"] in ("person", "woman", "man", "statue", "sculpture", "product", "3d character")]
    subject = max(subjects, key=lambda o: o.get("areaRatio", 0)) if subjects else None

    if subject:
        predictor.set_image(img)
        box = np.array(subject["bbox"])
        masks, _, _ = predictor.predict(box=box, multimask_output=False)
        mask = masks[0]
        print(f"bbox 提示 ({subject['class']}): mask 覆盖率 {mask.mean()*100:.1f}%")
    else:
        # YOLO 没检出 → SAM 自动分割取最大非背景区域
        masks = gen.generate(img)
        masks.sort(key=lambda m: m["area"], reverse=True)
        mask = None
        for m in masks:
            if m["area"] / (W * H) < 0.6:
                mask = m["segmentation"]
                print(f"自动分割: 取区域 {m['area']/(W*H)*100:.1f}% bbox={m['bbox']}")
                break
        if mask is None:
            print("未找到合适区域")
            continue
        print(f"mask 覆盖率 {mask.mean()*100:.1f}%")

    det["maskHeatGrid"] = heat_from_mask(mask)
    det["maskCoverage"] = round(float(mask.mean()) * 100, 1)
    json.dump(det, open(det_path, "w"), ensure_ascii=False, indent=2)
    print("已写入 maskHeatGrid")
