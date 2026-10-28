import sys
import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import torch
from PIL import Image, ImageDraw, ImageFont
from transformers import AutoProcessor, AutoModelForCausalLM

local = os.environ.get("FLORENCE2_MODEL_DIR", os.path.join(_MODELS_DIR, "florence2-base"))
print("加载模型...")
model = AutoModelForCausalLM.from_pretrained(local, trust_remote_code=True, torch_dtype=torch.float32)
processor = AutoProcessor.from_pretrained(local, trust_remote_code=True)

IMGS = [
    ("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative/Creative_Orange_Horse.webp", "orange_horse"),
    ("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative/Creative_Avant_Studio.webp", "avant_studio"),
    ("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/3d/3D_3D_Character_Studio.webp", "3d_character"),
]

def run(img, task):
    inputs = processor(text=task, images=img, return_tensors="pt")
    out = model.generate(input_ids=inputs["input_ids"], pixel_values=inputs["pixel_values"],
                         max_new_tokens=1024, num_beams=3, do_sample=False)
    gen = processor.batch_decode(out, skip_special_tokens=False)[0]
    return processor.post_process_generation(gen, task=task, image_size=img.size)

for path, name in IMGS:
    img = Image.open(path).convert("RGB")
    W, H = img.size
    print(f"\n=== {name} ({W}x{H}) ===")

    od = run(img, "<OD>")
    objs = list(zip(od["<OD>"]["bboxes"], od["<OD>"]["labels"]))
    for b, l in objs:
        print(f"  [物体] {l}: [{int(b[0])},{int(b[1])},{int(b[2])},{int(b[3])}]")

    ocr = run(img, "<OCR_WITH_REGION>")
    d = ocr["<OCR_WITH_REGION>"]
    texts = []
    for i, text in enumerate(d["labels"]):
        box = d["quad_boxes"][i]
        xs = box[0::2]; ys = box[1::2]
        texts.append(([min(xs), min(ys), max(xs), max(ys)], text))
    print(f"  [文字] {len(texts)} 块")

    out = img.copy()
    draw = ImageDraw.Draw(out)
    for b, l in objs:
        draw.rectangle([b[0], b[1], b[2], b[3]], outline=(255, 0, 0), width=5)
        draw.rectangle([b[0], b[1], b[0] + 8 * len(l) + 10, b[1] + 22], fill=(255, 0, 0))
        draw.text((b[0] + 5, b[1] + 4), l, fill=(255, 255, 255))
    for b, text in texts:
        draw.rectangle(b, outline=(0, 255, 0), width=3)

    out.save(f"/tmp/florence-{name}.jpg", quality=85)
    print(f"  -> /tmp/florence-{name}.jpg")
