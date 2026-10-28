import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
man = json.load(open(os.path.join(ROOT, 'tools', 'design-vocab', 'data', '_analysis_manifest.json'), encoding='utf-8'))
# group by source but keep order; batch size 3
B = 3
batches = [man[i:i+B] for i in range(0, len(man), B)]
out = []
for i, b in enumerate(batches):
    out.append({'id': f'b{i:03d}', 'items': [{
        'path': e['path'], 'out': e['out'], 'basename': e['basename'],
        'width': e['width'], 'height': e['height'], 'ratio': e['ratio'],
        'source': e['source']} for e in b]})
json.dump(out, open(os.path.join(ROOT, 'tools', 'design-vocab', 'data', '_analysis_batches.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(batches), 'batches')
