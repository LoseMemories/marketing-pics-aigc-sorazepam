import json, os, re, sys, glob
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MANIFEST = os.path.join(ROOT, 'tools', 'design-vocab', 'data', '_analysis_manifest.json')
HEX = re.compile(r'^#[0-9A-Fa-f]{6}$')
SCENE = set('时尚 美妆 模特 旅游 地点 城市 海洋 商品 广告 营销 亲子 女性 男性 老年人 宠物 猫 狗 其他动物 先锋性 穿搭 衣服 鞋 相机 挂件 公仔 单品 平面 宣传 摄影 户外 演出 展览 聚会 探店 逛街 明星 新闻 法律 电影 影视 艺术家'.split())
EMOTION = set('安稳 恬静 自由 探险 刺激 猎奇 好奇 狂热 友情 亲情 松弛 焦虑 吐槽'.split())
COMP = set('对角线构图 左右构图 上下构图 极简构图 极繁构图 多向构图 对称构图 光影构图'.split())
TONE = set('黑白色调 棕黄灰绿蓝 复古色调 暖色 冷色 暗色调 清新感 炫光色调 霓虹迷幻 赛伯朋克 废土风 像素风'.split())
STYLE = set('写实 动画 3d 虚实混合 中国风 日本昭和 美式 欧洲 历史 漫画'.split())
PURPOSE = set('电商主图 详情页 海报 社媒封面 线下物料 品牌页面'.split())
INTENT = set('促销 种草 品牌形象 情绪共鸣 信息告知'.split())
LEVEL = set('主标题 副标题 小字文案'.split())
OCC = set('无遮挡 文字在主体前 主体压在文字上 看不清'.split())
ORI = set('横排 竖排 倾斜'.split())
FONT = set('衬线 无衬线 手写 书法 未识别'.split())
MEDIA = set('摄影 插画 3D 拼贴 合成'.split())
CAT = set('人类 景物 动物 商品'.split())
ROLE = set('primary secondary'.split())

def err(errs, path, msg):
    errs.append(f'{path}: {msg}')

def chk_hex(errs, path, v):
    if not isinstance(v, str) or not HEX.match(v):
        err(errs, path, f'bad hex {v!r}')

def chk_conf(errs, path, v):
    if not isinstance(v, (int, float)) or not (0 <= v <= 1):
        err(errs, path, f'bad confidence {v!r}')

def check(entry):
    errs = []
    out = os.path.join(ROOT, entry['out'])
    p = entry['basename'] + '.analysis.json'
    if not os.path.exists(out):
        return [f'{p}: MISSING']
    try:
        with open(out, encoding='utf-8') as f:
            d = json.load(f)
    except Exception as e:
        return [f'{p}: invalid JSON ({e})']
    if not isinstance(d, dict):
        return [f'{p}: root not object']
    req = ['image_id','meta','grid','subjects','textBlocks','titleRelation','sceneTags','emotionTags','composition','palette','style','metadata','semanticSummary','designRecipe','confidence']
    for k in req:
        if k not in d:
            err(errs, p, f'missing key {k}')
    if errs:
        return errs
    if d['image_id'] != entry['basename']:
        err(errs, p, f"image_id {d['image_id']!r} != basename")
    m = d['meta']
    for k in ['width','height','ratio','language','media_type']:
        if k not in m: err(errs, p, f'meta missing {k}')
    if m.get('width') != entry['width'] or m.get('height') != entry['height']:
        err(errs, p, f"meta size {m.get('width')}x{m.get('height')} != {entry['width']}x{entry['height']}")
    if not isinstance(m.get('ratio'), str): err(errs, p, 'meta.ratio not str')
    if m.get('language') not in ('zh','en','mixed',None): err(errs, p, f"language {m.get('language')!r}")
    if m.get('media_type') not in MEDIA | {None}: err(errs, p, f"media_type {m.get('media_type')!r}")
    g = d['grid']
    if not (isinstance(g.get('cols'), int) and isinstance(g.get('rows'), int) and g['cols']>0 and g['rows']>0):
        err(errs, p, f'bad grid {g}')
        return errs
    n = g['cols']*g['rows']
    if g['cols'] not in (3,4,5) or g['rows'] not in (3,4,5):
        err(errs, p, f'grid size unusual {g}')
    if not isinstance(d['subjects'], list) or not d['subjects']:
        err(errs, p, 'subjects empty/not list')
    else:
        for i,s in enumerate(d['subjects']):
            sp = f'{p} subjects[{i}]'
            for k in ['category','label','importance','role','areaRatio','region','positionDesc','mainColor','bgColor','attributes','confidence']:
                if k not in s: err(errs, sp, f'missing {k}')
            if s.get('category') not in CAT: err(errs, sp, f"category {s.get('category')!r}")
            if s.get('role') not in ROLE: err(errs, sp, f"role {s.get('role')!r}")
            if not isinstance(s.get('importance'), (int,float)) or not 0<=s['importance']<=1: err(errs, sp, 'bad importance')
            if not isinstance(s.get('areaRatio'), (int,float)) or not 0<=s['areaRatio']<=1: err(errs, sp, 'bad areaRatio')
            r = s.get('region')
            if not isinstance(r, list) or not r or any(not isinstance(x,int) or x<0 or x>=n for x in r):
                err(errs, sp, f'region out of bounds {r!r} (n={n})')
            chk_hex(errs, sp, s.get('mainColor')); chk_hex(errs, sp, s.get('bgColor'))
            chk_conf(errs, sp, s.get('confidence'))
            if not isinstance(s.get('attributes'), dict): err(errs, sp, 'attributes not dict')
    if not isinstance(d['textBlocks'], list):
        err(errs, p, 'textBlocks not list')
    else:
        for i,t in enumerate(d['textBlocks']):
            tp = f'{p} textBlocks[{i}]'
            for k in ['level','content','region','positionDesc','occlusion','orientation','fontStyle','color','confidence']:
                if k not in t: err(errs, tp, f'missing {k}')
            if t.get('level') not in LEVEL: err(errs, tp, f"level {t.get('level')!r}")
            if t.get('occlusion') not in OCC: err(errs, tp, f"occlusion {t.get('occlusion')!r}")
            if t.get('orientation') not in ORI | {None}: err(errs, tp, f"orientation {t.get('orientation')!r}")
            if t.get('fontStyle') not in FONT: err(errs, tp, f"fontStyle {t.get('fontStyle')!r}")
            r = t.get('region')
            if not isinstance(r, list) or not r or any(not isinstance(x,int) or x<0 or x>=n for x in r):
                err(errs, tp, f'region out of bounds {r!r} (n={n})')
            chk_hex(errs, tp, t.get('color')); chk_conf(errs, tp, t.get('confidence'))
            if t.get('content') is not None and not isinstance(t.get('content'), str): err(errs, tp, 'content not str/null')
    if not isinstance(d['titleRelation'], str): err(errs, p, 'titleRelation not str')
    for key, allowed in (('sceneTags', SCENE), ('emotionTags', EMOTION)):
        v = d[key]
        if not isinstance(v, list): err(errs, p, f'{key} not list')
        else:
            bad = [x for x in v if x not in allowed]
            if bad: err(errs, p, f'{key} illegal {bad}')
    c = d['composition']
    for k in ['type','whitespace','mainColorCount','complexity']:
        if k not in c: err(errs, p, f'composition missing {k}')
    if c.get('type') not in COMP: err(errs, p, f"composition.type {c.get('type')!r}")
    if not isinstance(c.get('whitespace'), (int,float)) or not 0<=c['whitespace']<=1: err(errs, p, 'bad whitespace')
    if not isinstance(c.get('mainColorCount'), int): err(errs, p, 'bad mainColorCount')
    if c.get('complexity') not in ('极简','适中','极繁'): err(errs, p, f"complexity {c.get('complexity')!r}")
    pal = d['palette']
    for k in ['maincolor','vicecolor','accentColors','textColors','contrast']:
        if k not in pal: err(errs, p, f'palette missing {k}')
    chk_hex(errs, p, pal.get('maincolor')); chk_hex(errs, p, pal.get('vicecolor'))
    for k in ['accentColors','textColors']:
        v = pal.get(k)
        if not isinstance(v, list) or not v: err(errs, p, f'palette.{k} bad')
        else:
            for h in v: chk_hex(errs, p, h)
    if pal.get('contrast') not in ('高','中','低'): err(errs, p, f"contrast {pal.get('contrast')!r}")
    st = d['style']
    for k in ['colorTone','styleTags','texture']:
        if k not in st: err(errs, p, f'style missing {k}')
    for k, allowed in (('colorTone', TONE), ('styleTags', STYLE)):
        v = st.get(k)
        if not isinstance(v, list): err(errs, p, f'style.{k} not list')
        else:
            bad = [x for x in v if x not in allowed | {'未识别'}]
            if bad: err(errs, p, f'style.{k} illegal {bad}')
    if st.get('texture') not in MEDIA | {None}: err(errs, p, f"texture {st.get('texture')!r}")
    md = d['metadata']
    for k in ['purpose','intent','series','version']:
        if k not in md: err(errs, p, f'metadata missing {k}')
    if md.get('purpose') not in PURPOSE | {None}: err(errs, p, f"purpose {md.get('purpose')!r}")
    if md.get('intent') not in INTENT | {None}: err(errs, p, f"intent {md.get('intent')!r}")
    if not isinstance(d['semanticSummary'], str) or not d['semanticSummary'].strip(): err(errs, p, 'semanticSummary bad')
    if not isinstance(d['designRecipe'], str) or not d['designRecipe'].strip(): err(errs, p, 'designRecipe bad')
    chk_conf(errs, p, d['confidence'])
    # advisory: per-block confidence
    for k in ('composition','palette','style'):
        if 'confidence' not in d[k]: err(errs, p, f'advisory: {k}.confidence missing')
    return errs

def main():
    sel = sys.argv[1:]
    with open(MANIFEST, encoding='utf-8') as f:
        man = json.load(f)
    if sel:
        man = [e for e in man if e['basename'] in sel or e['path'] in sel]
    all_errs, ok = [], 0
    for e in man:
        es = check(e)
        if es: all_errs.extend(es)
        else: ok += 1
    print(f'{ok}/{len(man)} valid')
    for e in all_errs[:200]: print(e)
    if len(all_errs) > 200: print(f'... {len(all_errs)-200} more')
    return 1 if all_errs else 0

if __name__ == '__main__':
    sys.exit(main())
