import sys, os, json, glob

import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
_EASYOCR_DIR = os.environ.get("EASYOCR_MODEL_DIR", os.path.join(_MODELS_DIR, "easyocr-model"))
_EASYOCR_NET = os.environ.get("EASYOCR_NETWORK_DIR", os.path.join(_MODELS_DIR, "easyocr-network"))
os.makedirs(_EASYOCR_DIR, exist_ok=True)
os.makedirs(_EASYOCR_NET, exist_ok=True)

from ultralytics import YOLO
import easyocr
from PIL import Image, ImageDraw

SRC = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative"
OUT_JSON = "/tmp/creative-detect"
OUT_IMG = "/tmp/creative-detect-img"
os.makedirs(OUT_JSON, exist_ok=True)
os.makedirs(OUT_IMG, exist_ok=True)

CLASSES = ["person", "woman", "man", "product", "bottle", "lipstick", "cosmetic product",
           "statue", "sculpture", "animal", "dog", "cat", "car", "phone", "bag", "shoe"]

model = YOLO("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl/yolov8s-world.pt")
model.set_classes(CLASSES)
reader = easyocr.Reader(['ch_sim', 'en'], gpu=False, verbose=False,
                        model_storage_directory=_EASYOCR_DIR,
                        user_network_directory=_EASYOCR_NET)

COLS, ROWS = 6, 6

def grid_cells(x1, y1, x2, y2, W, H):
    c0 = max(0, min(COLS - 1, int(x1 / W * COLS)))
    c1 = max(0, min(COLS - 1, int(max(0, x2 - 1) / W * COLS)))
    r0 = max(0, min(ROWS - 1, int(y1 / H * ROWS)))
    r1 = max(0, min(ROWS - 1, int(max(0, y2 - 1) / H * ROWS)))
    return [r * COLS + c for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]

def norm(x1, y1, x2, y2, W, H):
    x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
    W, H = float(W), float(H)
    return {
        "x": round(x1 / W, 3), "y": round(y1 / H, 3),
        "w": round((x2 - x1) / W, 3), "h": round((y2 - y1) / H, 3),
        "areaRatio": round(((x2 - x1) * (y2 - y1)) / (W * H), 4),
        "center": [round((x1 + x2) / 2 / W, 3), round((y1 + y2) / 2 / H, 3)],
        "region": grid_cells(x1, y1, x2, y2, W, H),
    }

imgs = sorted(glob.glob(os.path.join(SRC, "*.webp")) + glob.glob(os.path.join(SRC, "*.jpg")) + glob.glob(os.path.join(SRC, "*.png")))
print(f"creative 图片: {len(imgs)}")

for i, img_path in enumerate(imgs):
    base = os.path.splitext(os.path.basename(img_path))[0]
    im = Image.open(img_path).convert("RGB")
    W, H = im.size

    r = model(img_path, verbose=False, conf=0.25)[0]
    objects = []
    for b in r.boxes:
        x1, y1, x2, y2 = [float(v) for v in b.xyxy[0]]
        g = norm(x1, y1, x2, y2, W, H)
        objects.append({
            "class": model.names[int(b.cls[0])],
            "conf": round(float(b.conf[0]), 3),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
            **g,
        })

    texts = []
    for box, text, conf in reader.readtext(img_path):
        xs = [p[0] for p in box]; ys = [p[1] for p in box]
        x1, y1, x2, y2 = float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))
        g = norm(x1, y1, x2, y2, W, H)
        texts.append({
            "content": text,
            "conf": round(float(conf), 3),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
            **g,
        })

    rec = {
        "image_id": base,
        "width": W, "height": H,
        "grid": {"cols": COLS, "rows": ROWS},
        "objects": objects,
        "texts": texts,
    }
    json.dump(rec, open(os.path.join(OUT_JSON, f"{base}.detect.json"), "w"), ensure_ascii=False, indent=2)

    # 标注副本：主体红框、文字绿框（原图不动）
    annotated = im.copy()
    draw = ImageDraw.Draw(annotated)
    for o in objects:
        draw.rectangle(o["bbox"], outline=(255, 0, 0), width=4)
    for t in texts:
        draw.rectangle(t["bbox"], outline=(0, 255, 0), width=2)
    annotated.save(os.path.join(OUT_IMG, f"{base}.annotated.jpg"), quality=85)

    print(f"[{i+1}/{len(imgs)}] {base}: 物体{len(objects)} 文字{len(texts)}")

print("完成 ->", OUT_JSON, OUT_IMG)
