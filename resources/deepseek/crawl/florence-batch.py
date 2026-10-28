import sys, os, json, glob

import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import torch
from PIL import Image, ImageDraw
from transformers import AutoProcessor, AutoModelForCausalLM

ROOT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration"
CATS = ["creative", "travel"]
COLS = ROWS = 10

local = os.environ.get("FLORENCE2_MODEL_DIR", os.path.join(_MODELS_DIR, "florence2-base"))
print("加载 Florence-2...")
model = AutoModelForCausalLM.from_pretrained(local, trust_remote_code=True, torch_dtype=torch.float32)
proc = AutoProcessor.from_pretrained(local, trust_remote_code=True)

def run(img, task):
    inputs = proc(text=task, images=img, return_tensors="pt")
    out = model.generate(input_ids=inputs["input_ids"], pixel_values=inputs["pixel_values"],
                         max_new_tokens=1024, num_beams=3, do_sample=False)
    gen = proc.batch_decode(out, skip_special_tokens=False)[0]
    return proc.post_process_generation(gen, task=task, image_size=img.size)

def grid(x1, y1, x2, y2, W, H):
    c0 = max(0, min(COLS - 1, int(x1 / W * COLS))); c1 = max(0, min(COLS - 1, int(max(0, x2 - 1) / W * COLS)))
    r0 = max(0, min(ROWS - 1, int(y1 / H * ROWS))); r1 = max(0, min(ROWS - 1, int(max(0, y2 - 1) / H * ROWS)))
    return [r * COLS + c for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]

total = 0
for cat in CATS:
    imgs = sorted(glob.glob(os.path.join(ROOT, cat, "*.webp")) + glob.glob(os.path.join(ROOT, cat, "*.jpg")))
    imgs = [p for p in imgs if ".annotated." not in os.path.basename(p)]
    print(f"\n=== {cat}: {len(imgs)} 张 ===")
    for i, path in enumerate(imgs):
        base = os.path.splitext(os.path.basename(path))[0]
        img = Image.open(path).convert("RGB")
        W, H = img.size

        od = run(img, "<OD>")
        objects = []
        for b, l in zip(od["<OD>"]["bboxes"], od["<OD>"]["labels"]):
            x1, y1, x2, y2 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
            objects.append({
                "label": l, "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                "x": round(x1 / W, 3), "y": round(y1 / H, 3),
                "w": round((x2 - x1) / W, 3), "h": round((y2 - y1) / H, 3),
                "areaRatio": round((x2 - x1) * (y2 - y1) / (W * H), 4),
                "center": [round((x1 + x2) / 2 / W, 3), round((y1 + y2) / 2 / H, 3)],
                "region": grid(x1, y1, x2, y2, W, H),
            })

        ocr = run(img, "<OCR_WITH_REGION>")
        d = ocr["<OCR_WITH_REGION>"]
        texts = []
        for j, text in enumerate(d["labels"]):
            box = d["quad_boxes"][j]
            xs = box[0::2]; ys = box[1::2]
            x1, y1, x2, y2 = float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))
            texts.append({
                "content": text, "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                "x": round(x1 / W, 3), "y": round(y1 / H, 3),
                "w": round((x2 - x1) / W, 3), "h": round((y2 - y1) / H, 3),
                "areaRatio": round((x2 - x1) * (y2 - y1) / (W * H), 4),
                "region": grid(x1, y1, x2, y2, W, H),
            })

        rec = {"image_id": base, "category": cat, "width": W, "height": H,
               "grid": {"cols": COLS, "rows": ROWS},
               "objects": objects, "texts": texts, "source": "florence-2"}
        json.dump(rec, open(os.path.join(os.path.dirname(path), f"{base}.florence.json"), "w"), ensure_ascii=False, indent=2)

        # 标注图（物体红框+标签，文字绿框）
        out = img.copy()
        dr = ImageDraw.Draw(out)
        for o in objects:
            b = o["bbox"]
            dr.rectangle(b, outline=(255, 0, 0), width=5)
            dr.rectangle([b[0], b[1], b[0] + 8 * len(o["label"]) + 10, b[1] + 22], fill=(255, 0, 0))
            dr.text((b[0] + 5, b[1] + 4), o["label"], fill=(255, 255, 255))
        for t in texts:
            dr.rectangle(t["bbox"], outline=(0, 255, 0), width=2)
        out.save(os.path.join(os.path.dirname(path), f"{base}.florence.jpg"), quality=85)

        total += 1
        print(f"[{i+1}/{len(imgs)}] {base}: 物体 {len(objects)} | 文字 {len(texts)}")

print(f"\n完成 {total} 张")
