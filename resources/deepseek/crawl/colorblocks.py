import sys, json
import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import numpy as np, cv2

IMG = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative/Creative_Dream_Garden.webp"
COLS = ROWS = 10
K = 6

img = cv2.imread(IMG)
H, W = img.shape[:2]
# 缩小加速
scale = 0.25
small = cv2.resize(img, (int(W * scale), int(H * scale)))
data = small.reshape(-1, 3).astype(np.float32)

criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
_, labels, centers = cv2.kmeans(data, K, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
labels = labels.reshape(small.shape[:2])
centers = centers.astype(np.uint8)

def grid(x1, y1, x2, y2, W, H):
    c0 = max(0, min(COLS-1, int(x1/W*COLS))); c1 = max(0, min(COLS-1, int(max(0,x2-1)/W*COLS)))
    r0 = max(0, min(ROWS-1, int(y1/H*ROWS))); r1 = max(0, min(ROWS-1, int(max(0,y2-1)/H*ROWS)))
    return [r*COLS+c for r in range(r0,r1+1) for c in range(c0,c1+1)]

blocks = []
for k in range(K):
    mask = (labels == k).astype(np.uint8)
    area = float(mask.mean()) * 100
    if area < 1: continue
    ys, xs = np.where(mask > 0)
    if len(xs) == 0: continue
    x1, y1, x2, y2 = xs.min()/scale, ys.min()/scale, xs.max()/scale, ys.max()/scale
    b, g, r = [int(v) for v in centers[k]]
    blocks.append({
        "id": f"c{k}", "color": f"#{r:02X}{g:02X}{b:02X}",
        "areaPct": round(area, 1),
        "bbox": [round(float(x1),1), round(float(y1),1), round(float(x2),1), round(float(y2),1)],
        "x": round(float(x1)/W,3), "y": round(float(y1)/H,3),
        "w": round(float(x2-x1)/W,3), "h": round(float(y2-y1)/H,3),
        "region": grid(x1, y1, x2, y2, W, H),
    })

blocks.sort(key=lambda b: -b["areaPct"])
print(f"=== {IMG.split('/')[-1]} {W}x{H} | 色块 {len(blocks)} 个 ===")
for b in blocks:
    print(f"  {b['id']} {b['color']} 占 {b['areaPct']:5.1f}%  bbox={[int(v) for v in b['bbox']]}  区域{b['region'][:6]}{'...' if len(b['region'])>6 else ''}")

# 可视化：色块填充
vis = centers[labels]
vis = cv2.resize(vis, (W, H))
out = cv2.addWeighted(img, 0.4, vis, 0.6, 0)
for b in blocks:
    x1, y1, x2, y2 = [int(v) for v in b["bbox"]]
    cv2.rectangle(out, (x1, y1), (x2, y2), (255, 255, 255), 2)
    cv2.putText(out, f"{b['id']} {b['areaPct']}%", (x1+8, y1+28), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255,255,255), 2)
cv2.imwrite("/tmp/garden-colorblocks.png", out)
print("saved /tmp/garden-colorblocks.png")

json.dump({"image_id": "Creative_Dream_Garden", "blocks": blocks, "k": K},
          open("/tmp/garden-colorblocks.json", "w"), ensure_ascii=False, indent=2)
