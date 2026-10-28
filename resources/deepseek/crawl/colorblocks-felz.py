import sys, json
import os; _MODELS_DIR = os.environ.get("WORKFLOW_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "models"))
sys.path.insert(0, os.environ.get("WORKFLOW_PYTHONPATH", os.path.join(_MODELS_DIR, "pylibs39")))
import numpy as np, cv2
from skimage.segmentation import felzenszwalb

IMG = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative/Creative_Dream_Garden.webp"
COLS = ROWS = 10

img = cv2.imread(IMG)
H, W = img.shape[:2]
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# Felzenszwalb 空间分割
segments = felzenszwalb(rgb, scale=300, sigma=0.9, min_size=400)
n = int(segments.max()) + 1
print(f"=== {IMG.split('/')[-1]} {W}x{H} | 初始区域 {n} 个 ===")

def grid(x1, y1, x2, y2, W, H):
    c0 = max(0, min(COLS-1, int(x1/W*COLS))); c1 = max(0, min(COLS-1, int(max(0,x2-1)/W*COLS)))
    r0 = max(0, min(ROWS-1, int(y1/H*ROWS))); r1 = max(0, min(ROWS-1, int(max(0,y2-1)/H*ROWS)))
    return [r*COLS+c for r in range(r0,r1+1) for c in range(c0,c1+1)]

blocks = []
for sid in range(n):
    mask = (segments == sid)
    area_px = int(mask.sum())
    if area_px < W * H * 0.008:  # 太小的忽略
        continue
    ys, xs = np.where(mask)
    x1, y1, x2, y2 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    mean = rgb[mask].mean(axis=0).astype(int)
    b, g, r = int(mean[2]), int(mean[1]), int(mean[0])
    # 中心区域判定
    cx, cy = (x1+x2)/2/W, (y1+y2)/2/H
    is_center = 0.25 < cx < 0.75 and 0.25 < cy < 0.75
    blocks.append({
        "id": f"s{sid}",
        "color": f"#{r:02X}{g:02X}{b:02X}",
        "areaPct": round(area_px / (W*H) * 100, 1),
        "bbox": [x1, y1, x2, y2],
        "centerXY": [round(cx,2), round(cy,2)],
        "isCenter": is_center,
        "region": grid(x1, y1, x2, y2, W, H),
    })

blocks.sort(key=lambda b: -b["areaPct"])
print(f"有效色块: {len(blocks)} 个")
for b in blocks:
    tag = "中心" if b["isCenter"] else "边缘"
    print(f"  {b['id']} {b['color']} 占 {b['areaPct']:5.1f}%  {tag}  bbox={b['bbox']}  区域{len(b['region'])}格")

# 可视化：每块随机色 + 标号
vis = img.copy()
rng = np.random.default_rng(42)
for b in blocks:
    sid = int(b["id"][1:])
    color = tuple(int(v) for v in rng.integers(60, 255, 3))
    vis[segments == sid] = (0.45 * vis[segments == sid] + 0.55 * np.array(color)).astype(np.uint8)
    x1, y1, x2, y2 = b["bbox"]
    cv2.rectangle(vis, (x1, y1), (x2, y2), (255, 255, 255), 2)
    cv2.putText(vis, f"{b['id']} {b['areaPct']}%", (x1+8, max(28, y1+28)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2)
cv2.imwrite("/tmp/garden-felz.png", vis)
print("saved /tmp/garden-felz.png")

json.dump({"image_id": "Creative_Dream_Garden", "blocks": blocks, "algo": "felzenszwalb"},
          open("/tmp/garden-felz.json", "w"), ensure_ascii=False, indent=2)
