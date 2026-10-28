# 提示词导出 · L2 设计师（DESIGN_PROMPT_VERSION = 4）

来源：`backend/src/modules/design-assistant/infrastructure/deepseek-design-assistant.ts` 的 `designLayout()`。
其中【动效目录】由 `domain/motion-catalog.ts` 生成，【文案正反例】由 `domain/copy-rules.catalog.ts` 生成，示例数据为导出时临时构造。

## role: system

```text
你是资深营销视觉设计师（L2）。你只做「设计决策」：文案层级、锚点选择、版式倾向、动效配方、色彩角色。你写的 blocks[].text 是印在画面上的文案，必须来自用户给的真实资料；设计思路只能写在 concept 里。动效是备选项而不是必选项：只在真正适合这张照片的故事与色调时才用，宁可不用。你不写任何坐标或毫秒，也不写代码。只返回 JSON，不要 markdown 或解释。
```

## role: user

```text
创作方向（运营给的风格期望）：突出人物主体，做一个有品牌感的营销版式

【照片的事实背景与想突出的信息（来自摄影者/运营的真实资料，这是你唯一的文案依据）】
这是我在北京南锣鼓巷拍摄的照片，深秋时节，透过房间的暖色灯光，和周围傍晚灰色的墙面形成强烈对比。突出地点、秋季感受、潮流、穿搭。

如何用这段资料（非常重要）：
· 它常常是「背景 + 想突出什么」，不是成品文案。你要据此写出真正的营销短文案。
· 资料里出现的真实事实（地点、季节、光线、材质、氛围、穿搭特点、想强调的卖点）可以用；
  但只有资料明确要求突出单品/穿搭/摄影时，才允许把衣服、鞋子、镜头这类具体描述写进文案。
· 资料里没出现的品牌名、门店名、价格、折扣、活动日期一律不许编。
· 文案要让消费者一眼看懂这张照片在卖什么感受/什么事实，而不是描述我们看到了什么、做了什么设计。

【文案能写什么 / 不能写什么（正反例，务必逐条对照）】
三条禁令：
① 禁止描述图片本身：视角、构图、光线方向、色调、材质反光、器材、景别，一律不写。
② 禁止写设计心思与手法：反差、层次、留白、呼吸感、视觉重心、描边、压字，这些只写进 concept。
③ 禁止描写主体与画面的基础特征：衣服颜色/款式、裤子、鞋、发型、镜头的距离与角度、整体色调；
   只有资料里明确写「突出单品」「突出穿搭」「突出摄影」时，才允许写这几项，而且必须挑资料提到的单品；
   资料只是顺带提一句「我很满意那天的穿搭」而没说「要突出」，也算不允许。

反例（看到这种写法就重写）✗：
- 内场仰视 · 空山基金色立像，金属光泽压着整片蓝天
- 俯拍视角，人物占据画面左侧三分之一
- 逆光勾边，暖橙与冷灰撞出强烈对比
- 低角度特写，背景大面积虚化
- 冷灰色调里的一抹暖光，构图留白在右侧
- 金属质感的反光落在肩线，色调偏青
- 中景平视，背景是爬满藤蔓的砖墙
- 大面积留白 + 主体居中，典型的杂志封面构图
- 趣味反差，让暖光与冷墙互相咬合
- 用描边圈住主体，视线自然被拉过去
- 文字压在人物后方，制造前后层次
- 视觉重心放在右下角，节奏有呼吸感
- 字距拉开，做出高级的留白感
- 加一层柔光，让画面更有电影感
- 冷暖对冲的层次，把情绪推上去
- 黑卫衣 × 迷彩工装裤 × 棕色工装靴
- 金色短发配墨镜，黑色上衣搭迷彩裤
- 用 50mm 定焦拍的，皮肤质感很干净

正例（这才是画面文案）✓：
- 南锣鼓巷 · 深秋傍晚
- 傍晚的灰墙很冷，窗里的光很暖
- 深秋的光，穿在身上
- 从灯光里讨一点温暖
- 秋天的最后一个逛街日
- 老街的窗还亮着
- 冷风吹过来，先躲在光里
- 手作陶器 · 今日新出窑
- 等一壶水开的时间
- 把下午留给这间小店
- 复古潮流 · 今秋限定
- 街头感刚好，不必用力
- 旧东西有旧东西的脾气
- 手缝的边，比机器多一道线
- 三十年的手艺，只做这一种碗
- 周末来坐坐，茶是热的
- 限时三日 · 到店试穿
- 山野民宿 · 十月的第一场雾

可以放心使用的信息类型：
- 地点 / 街区 / 城市（资料里出现过的真实地名）
- 季节、节气、时间感（深秋、傍晚、开春、凌晨）
- 客观风格 tag（复古潮流、街头感、侘寂、户外机能）
- 资料里明确提到的商品类别、材质、工艺、尺寸、产地
- 资料里明确提到的卖点：限量、手工、当季、可试穿、可预约等
- 情绪与场景结论（把喧嚣留在门外、从灯光里讨一点温暖）
- 行动号召（到店试穿、周末来坐坐、限时三日）

改写示范（左边是错的，右边才是该写的）：
- ✗ 内场仰视 · 空山基金色立像，金属光泽压着整片蓝天
  ✓ 山门口的金像，今天落成了（删掉视角与材质描述，只说发生了什么）
- ✗ 俯拍视角，黑卫衣配迷彩工装裤，冷灰色调
  ✓ 深秋傍晚 · 街头感刚好（穿搭与色调是画面特征；除非资料要求突出单品，否则改写成季节与调性）
- ✗ 趣味反差，暖光与冷墙互相咬合
  ✓ 墙是冷的，窗里的光是暖的（设计心思不能上画面；把它还原成用户能读到的感受）
- ✗ 文字压在人物后方，制造前后层次
  ✓ 把秋天穿在身上（动效与版式属于 concept，不属于画面文案）
- ✗ 暖橙色调里，藤蔓爬满了整面砖墙
  ✓ 十月，藤蔓还没褪色（去掉色调与构图，只保留可以被拍成故事的事实）
- ✗ 手作陶碗 · 复古文艺 · 柔和暖光
  ✓ 手作陶碗 · 今日出窑（客观 tag 可以留（手作陶碗），画面光线描述要删）
- ✗ 逆光拍摄，皮肤通透，发丝有光
  ✓ 傍晚的光，刚好落在发梢（摄影技巧只在资料要求突出摄影时才写，否则换成情绪）
- ✗ 大片留白，主体靠左，构图稳定
  ✓ 把喧嚣留在画面之外（构图描述不是文案；留白的感受可以是）

【画面理解（视觉模型对主图的描述，含主色调、主体颜色、背景复杂度）】
{"summary":"傍晚老街，暖光透过百叶窗落到灰墙上","subjects":["坐着的男生"],"subjectRegions":[{"label":"画面下方坐姿男生（金色短发 + 墨镜 + 黑卫衣）","x":0.2,"y":0.42,"width":0.45,"height":0.5,"confidence":0.96,"score":92,"importance":"primary","colors":["#14161A","#5A5F52"]}],"environment":"城市老街","background":{"description":"灰色水泥墙与百叶窗","complexity":"moderate","textFriendly":false},"dominantColors":["#0F1211","#D0841A","#8E8B80"],"safeZones":[{"x":0.04,"y":0.08,"width":0.9,"height":0.26,"reason":"上方灰墙留白","colors":["#3A3B38"]}],"marketingTone":["街头潮流","暗调质感"],"risks":["主体贴边"]}

【L1 构图结论（算法基于像素覆盖率得出，是位置的主要参考）】
{"frameRatio":0.75,"selection":"top-band","areaRatio":0.235,"scale":"medium","subjectCount":1,"grid":{"cols":3,"rows":3,"cells":[]},"textAnchor":{"id":"c0-2_r0-0","label":"上方整条带","colStart":0,"colEnd":2,"rowStart":0,"rowEnd":0,"heat":0,"cells":3},"secondaryAnchor":null,"palette":{"suggested":{"headline":"#F6F8F9","support":"#D8B45A"},"backdrop":"#101412","options":[{"hex":"#FFFFFF","source":"universal"}]}}

【文字入场 enter（每个文字块选 1 种）】
- fade：原地淡入，最克制，适合 kicker / meta。参数：durationMs 120–600ms（默认 320，淡入时长）
- fade-in-place：在终点位置原地渐显，不走位，最不打扰主体。参数：durationMs 200–900ms（默认 460，渐显时长）
- slide-up：自下而上位移入场，最通用。参数：durationMs 200–800ms（默认 420，入场时长）；distancePct 1.5–9%（默认 4，位移量（占画幅短边））
- slide-left：自右向左滑入（起点在右侧），适合主体在右、文字在左。参数：durationMs 220–900ms（默认 460，入场时长）；distancePct 2–14%（默认 6，位移量（占画幅短边））
- slide-right：自左向右滑入（起点在左侧），适合主体在左、文字在右。参数：durationMs 220–900ms（默认 460，入场时长）；distancePct 2–14%（默认 6，位移量（占画幅短边））
- mask-reveal：遮罩自下而上揭示，最有版式感，首选给 Hero。参数：durationMs 350–1000ms（默认 620，揭示时长）；softness 0–1（默认 0.2，遮罩边缘柔和度）
- rise：纵向拉伸 + 上移，模拟「立起来」，只给 Hero。参数：durationMs 450–1100ms（默认 720，立起时长）；liftPct 1–7%（默认 3，上移量（占画幅短边））
- stand-up-3d：2D→3D 立体模拟：透视压缩 + 立起 + 光影扫过，Hero 专用的强强调。参数：durationMs 550–1400ms（默认 860，立起时长）；perspectiveDeg 8–60deg（默认 28，透视角度）；liftPct 1–9%（默认 4，上移量）
- through：横向滑过画面后停住，位移方向要避开主体重心，只给 Hero。参数：durationMs 550–1300ms（默认 820，滑过时长）；travelPct 12–50%（默认 28，水平行程（占画幅宽））

【文字循环 idle（可选，最多 1 种，幅度必须克制）】
- float-y：纵向缓慢漂浮，最不易察觉的呼吸感。参数：amplitudePct 0.2–1.2%（默认 0.4，振幅（占画幅短边））；periodMs 1800–4000ms（默认 2600，周期）
- breathe：整体极缓缩放呼吸，适合大标题。参数：scalePct 1–5%（默认 2.5，缩放幅度）；periodMs 1500–3200ms（默认 2200，周期）

【光效 / 图形层 effects（从里面挑 0–3 个，绝不抢文字）】
- sweep：一道横向光带扫过，商业感强，适合开场或收尾。参数：widthPct 10–32%（默认 18，光带宽度（占画幅宽））；opacity 0.1–0.5（默认 0.3，不透明度）；angleDeg -30–30deg（默认 12，倾斜角）
- drift：微小粒子缓慢漂移，氛围感强，适合夜景/暖光。参数：particleCount 5–16count（默认 10，粒子数量）；radiusPct 0.2–0.9%（默认 0.5，粒子半径（占画幅短边））；opacity 0.1–0.5（默认 0.35，不透明度）
- breathing-dot：呼吸圆点：持续放大缩小的光点，用于指向卖点或点缀留白。参数：sizePct 0.8–8%（默认 2.4，基准半径（占画幅短边））；minScale 0.3–1（默认 0.7，呼吸最小倍率）；maxScale 1–2.4（默认 1.5，呼吸最大倍率）；periodMs 800–4000ms（默认 2000，一个呼吸来回的时长）；opacity 0.15–0.9（默认 0.55，不透明度）
- subject-outline：沿主体轮廓描一圈线，可选涂鸦实线/虚线，逐步划线或描边闪烁。参数：widthPct 0.15–2%（默认 0.5，线宽（占画幅短边））；durationMs 400–3000ms（默认 1400，划线/循环时长）；opacity 0.2–1（默认 0.75，不透明度）；jitterPct 0–1.2%（默认 0.3，涂鸦抖动幅度（0 = 光滑线））；选项：style ∈ {spray-solid | spray-dashed}（默认 spray-solid，涂鸦实线 / 涂鸦虚线）；mode ∈ {draw-on | blink}（默认 draw-on，逐步划线 / 描边闪烁）
- icon-marker：小范围移动的贴图图标（手指/灯泡），指向画面里的某个对象。参数：sizePct 2–9%（默认 4.5，图标高度（占画幅短边））；orbitPct 0.4–3.5%（默认 1.4，来回摆动幅度）；periodMs 900–4000ms（默认 1800，摆动周期）；opacity 0.3–1（默认 0.9，不透明度）；选项：glyph ∈ {finger | bulb | arrow}（默认 finger，图标类型）
- laser-overlay：潮流滤镜蒙层：整幅彩虹渐变缓慢流动，制造 Y2K/科技质感，必须低透明度。参数：opacity 0.04–0.3（默认 0.14，不透明度）；hueSpreadDeg 40–320deg（默认 140，色相跨度）；periodMs 1600–8000ms（默认 4200，色相流动周期）；bandPct 8–60%（默认 26，光带宽度）
- glow-mask：画面滤镜：树影透光/光斑蒙层——光斑缓慢飘移，像阳光透过树叶洒在画面上；适合户外、傍晚、有植物或窗光的故事。参数：opacity 0.08–0.6（默认 0.3，整体不透明度）；blobCount 3–12count（默认 6，光斑数量）；sizePct 4–30%（默认 13，单个光斑直径（占画幅短边））；driftPct 0–6%（默认 2，缓慢飘移幅度）；softness 0.2–1（默认 0.7，光斑边缘柔化程度）；选项：pattern ∈ {dapple | bokeh | beam}（默认 dapple，树叶碎光 / 圆形散景光斑 / 斜射光束）
- soft-focus：画面滤镜：柔光变换——画面被一层扩散的柔和光线包住，轻微发亮发梦，适合温情、治愈、唯美调性。参数：opacity 0.06–0.5（默认 0.26，柔光强度）；radiusPct 20–100%（默认 60，光晕扩散半径（占画幅短边））；warmthPct 0–100%（默认 60，暖色程度（0=冷，100=暖））
- strobe：画面滤镜：一次/两次频闪——极短的亮闪把注意力瞬间拉回画面，适合街头、夜店、运动等强节奏题材。参数：opacity 0.1–0.7（默认 0.42，闪光强度）；periodMs 600–4000ms（默认 1600，两次闪光的间隔）；flashes 1–3count（默认 2，一个循环内闪几次）；dutyPct 4–30%（默认 12，单次闪光占周期比例）

【输出要求】
1. 画面比例 0.750，实况时长 3000ms（不需要你输出时间）。
2. blocks 1–5 个，必须恰好 1 个 role=headline（Hero 大标题）；正文段落用 role=paragraph。
3. 字数上限：headline 4–14 字；paragraph ≤ 30 字（可用 \n 分成 1–3 行）；subline ≤ 40 字；meta / kicker ≤ 12 字。
4. 文字必须构成一个紧凑视觉块：多数块共用同一个 anchor 与 align，靠 role 决定上下顺序（kicker → headline → subline → paragraph → meta）。
5. anchor.ref 只能从下面这张列表里选：textAnchor（首选）/ secondaryAnchor / safeZone:<i> / free。
6. dxPct / dyPct 是相对短边的偏移百分比，-8 到 8：只做微调，不要拿它替代锚点。
7. sizeRatio（占短边）：headline 0.06–0.16，subline 为 headline 的 0.3–0.45，paragraph 0.022–0.05，meta/kicker 更小。
8. font：headline 优先 display（标题感）或 serif；正文用 sans；等宽只在需要数据感时用。
9. transform（变形 schema）只能给轻微值：scaleX/scaleY 0.85–1.25、rotateDeg -8–8、skewDeg -8–8。
10. path（路线样式变化）：fromDxPct / fromDyPct 是起点相对终点的偏移（%短边，-60–60），fromScale→toScale 是首尾缩放；滑入类动效才需要给。
11. text3d 只能给 headline，取值 none / cylinder（圆柱文字）/ cube（立方体文字），与 stand-up-3d 搭配最自然。
12. palette.text / accent / support 必须从 L1 给出的候选色里挑（原样返回十六进制），不要自创颜色。

【文案铁律（违反即算错误）】
A. blocks[].text 是「消费者在图上读到的字」，只能是对真实事实的提炼；
   绝对禁止把设计思路、动效说明、构图描述、主体外观描述写进画面文案——这些只留在 concept 字段（concept 不渲染）。
B. 同一段话不要拆成多个 block 反复说；subline / paragraph 必须是补充信息（卖点、地点、季节、调性），不是解释标题。
C. 不要写空话套话（「美到窒息」「绝美」「心动时刻」），宁可具体：地点 + 季节 + 可以验证的事实。

【动效不是必选项（关键）】
D. 先判断这张照片需要不需要动效：只有「动效讲得通」时才加，通常 0–2 个；宁可少，也不要为了炫技堆效果。
E. 选之前必须同时考虑：故事背景（资料里说的场景与情绪）、画面主色调 dominantColors、主体自身颜色、背景复杂度。
   - 主体颜色与 accent 接近时不加发光类效果；背景已经很乱时只加极克制的描边或什么都不加。
   - 有植物/阳光/窗光的故事 → glow-mask（树影透光）；温情/治愈/唯美 → soft-focus（柔光）；
     街头/夜店/运动这类强节奏 → strobe（一次频闪）或 laser-overlay（潮流滤镜）；
     想让视线聚焦某个对象 → subject-outline / icon-marker / breathing-dot 三选一，不要全上。
F. 整幅滤镜类（glow-mask / soft-focus / laser-overlay / strobe）最多只能有 1 个，且 opacity 必须低到不损失画面信息。
G. 文字与主体重叠：occlude=true 时文字会与主体以饱和度渐变混在一起（字不会消失，主体也不会被盖死），
   这是一手很强的技法，只有想让字「穿过」主体时才用；默认 false。
H. 每个 effect 都要能在 concept 里说清「为什么是这个效果」；说不清就不要用它。
I. enter / idle / effects 的 id、参数、选项必须来自上面的动效目录，参数不得越界。

【返回 JSON 结构】
{"version":1,"concept":"一句话设计概念（可以写设计思路，但这段不会渲染到画面上）","blocks":[{"id":"headline","role":"headline","text":"主标题文案","anchor":{"ref":"textAnchor","dxPct":0,"dyPct":0},"align":"left","sizeRatio":0.12,"weight":800,"tracking":-0.02,"lineHeight":1.2,"font":"display","transform":{"scaleX":1,"scaleY":1,"rotateDeg":0,"skewDeg":0},"path":{"fromDxPct":8,"fromDyPct":0,"fromScale":1.12,"toScale":1},"text3d":"cylinder","occlude":false,"enter":{"id":"stand-up-3d","params":{"durationMs":860,"perspectiveDeg":28,"liftPct":4}},"idle":{"id":"float-y","params":{"amplitudePct":0.4,"periodMs":2600}}}],"effects":[{"id":"glow-mask","anchor":{"ref":"textAnchor","dxPct":0,"dyPct":0},"colorRef":"accent","params":{"opacity":0.26,"blobCount":6,"sizePct":13,"driftPct":2,"softness":0.7},"options":{"pattern":"dapple"}},{"id":"subject-outline","anchor":{"ref":"textAnchor","dxPct":0,"dyPct":0},"colorRef":"accent","params":{"widthPct":0.5,"durationMs":1400,"opacity":0.75,"jitterPct":0.3},"options":{"style":"spray-dashed","mode":"draw-on"}}],"palette":{"text":"#FFFFFF","accent":"#D9FF52"},"beats":{"pace":"medium","startMs":0}}
```
