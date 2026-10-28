import json, os, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
IMG_EXT = {'.webp', '.jpg', '.jpeg', '.png', '.gif'}
out = []
for folder in ('motionsites', 'magazine'):
    base = os.path.join(ROOT, 'crawl-raw', folder)
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if not d.startswith('.')]
        for fn in sorted(filenames):
            ext = os.path.splitext(fn)[1].lower()
            if ext not in IMG_EXT:
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, ROOT)
            try:
                with Image.open(p) as im:
                    w, h = im.size
                    fmt = im.format
                    try:
                        nframes = getattr(im, 'n_frames', 1)
                    except Exception:
                        nframes = 1
            except Exception as e:
                print('ERR', rel, e, file=sys.stderr)
                continue
            from math import gcd
            g = gcd(w, h) or 1
            out.append({
                'source': folder,
                'path': rel,
                'basename': os.path.splitext(fn)[0],
                'ext': ext.lstrip('.'),
                'width': w, 'height': h,
                'ratio': f'{w//g}:{h//g}' if gcd(w,h)>1 else f'{w}:{h}',
                'ratio_float': round(w/h, 4),
                'bytes': os.path.getsize(p),
                'frames': nframes,
                'out': rel[:-len(ext)] + '.analysis.json',
            })
out.sort(key=lambda x: x['path'])
with open(os.path.join(ROOT, 'tools', 'design-vocab', 'data', '_analysis_manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(len(out), 'images')
from collections import Counter
print(Counter(x['source'] for x in out))
print(Counter(x['ext'] for x in out))
print(Counter(x['ratio'] for x in out).most_common(8))
print('max px', max(x['width']*x['height'] for x in out))
