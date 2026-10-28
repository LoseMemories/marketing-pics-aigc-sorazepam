# 提示词片段 · 设计语言（`domain/design-language.catalog.ts`）

注意：这份目录是**给旧版一次性出图（`/composition`）**用的；新的 L2 设计师走的是 `motion-catalog.ts` + 本文档的排版纪律摘要。保留是因为它还定义了「设计语言」的共同语汇，可作为知识库的种子内容。

```text

【总原则】
1) 克制优先：叠加层只做"营销信息与氛围"，永不重绘、遮挡或扭曲主体本身。
2) 一个视觉重心：所有文字必须构成一个紧凑的视觉块，不允许散落在画面四角。
3) 留白即呼吸：文字块四周至少保留 8% 画幅边长的空白，宁少勿满。

【A 排版纪律（最重要，违反即视为不合格）】
A1 主标题（role=headline）
   - 短句大字，4–10 个汉字；字号 0.10–0.16 画幅短边；weight 700–900；tracking -0.02 至 -0.04。
   - 全图只允许一个 headline。
A2 副文案（role=subline）
   - 1–2 句、每句 ≤ 18 字；字号为主标题的 0.32–0.45；weight 400–500；行距 1.4。
   - 必须紧贴主标题下方（垂直间距 = 主标题字号的 0.5–0.8 倍），左右与主标题同起点。
A3 信息行（role=meta）
   - 品牌 / 日期 / 价格 / 一句 slogan，≤ 12 字；字号为主标题的 0.26–0.32；可放在文字块底部或画面上/下边缘。
A4 kicker（role=kicker）
   - 2–6 字英文或短词，字号为主标题的 0.24，letterSpacing 0.18，放在主标题上方。
A5 组块规则
   - headline + subline + meta 视为一个整体块，三者共用同一 x 基准与对齐方式，不允许分别散落。
   - 文字块整体放进 safeZones 中面积最大的一块；若 safeZones 不足，选择与主体重叠最小的空白。
A6 禁止
   - 不允许出现 4 个以上彼此不相邻的文字层；不允许把一句话拆成多个相距很远的层。

【B 文字与主体的关系（允许的三种"花哨"）】
B1 后方出现（occlude=true）
   - 文字从主体轮廓之后升起或滑过，被主体挡住一部分。仅对 headline 使用；同时把 occlude 设为 true。
B2 滑过（enter.type=through）
   - 文字沿水平方向穿过画面后停住，位移方向应避开主体重心。
B3 立起（enter.type=rise）
   - 文字从"贴在版面上"变为"立起来"：纵向拉伸 + 轻微上移 + 轻微透视压缩，用于 headline 强调。

【C 入场动效 enter（每题只选 1 种，startMs 与 durationMs 必须给出）】
- fade：淡入，120–400ms，适合 kicker / meta。
- slide-up / slide-left / slide-right：位移入场，位移量 3–6% 画幅，260–520ms。
- mask-reveal：自下而上遮罩揭示，500–800ms，最适合 headline。
- rise：立起，600–900ms，仅 headline。
- through：横向滑过，700–1100ms，仅 headline。

【D 循环动效 idle（每题最多 1 种，幅度必须克制）】
- float-y：纵向漂浮，amplitude 0.003–0.008，period 2200–3600ms。
- breathe：呼吸缩放，amplitude 0.02–0.05，period 1600–2600ms。
- glow-pulse：仅 pulse 层，半径随呼吸变化。

【E 光效层 pulse（0–2 个，绝不抢文字）】
- sweep：一道 16–24% 画幅宽的横向光带，色相从调色板取，opacity ≤ 0.5。
- drift：6–12 个微小粒子沿同一方向缓慢漂移，粒子半径 ≤ 0.6% 画幅短边。
- breathe：柔和光斑，半径 ≤ 25% 画幅短边，blend 建议 screen。
- 光效层的锚点必须避开文字块与主体。

【F 色彩】
- 从 dominantColors 衍生：文字用高对比色（白 / 近黑 / 品牌色），装饰线用强调色，光效与强调色同色相。
- 不超过 3 种颜色出现在叠加层；同一页面内 opacity 梯度统一。

【G 层数预算】
- 总计 3–6 层：1 headline + 1 subline（可选）+ 1 meta（可选）+ 1 kicker（可选）+ 0–2 个 pulse。
- 层数越少越高级；宁可少一层，也不要多加一个无信息量的元素。

【执行词汇表（只能使用这些值）】
kind：text | pulse
role：headline | subline | meta | kicker
enter.type：fade | slide-up | slide-left | slide-right | mask-reveal | rise | through
enter.ease：linear | outCubic | outQuint | inOutSine
idle.type：float-y | breathe | glow-pulse
pulse.animation：sweep | drift | breathe

```
