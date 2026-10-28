<script setup lang="ts">
import { computed, ref } from "vue";
import { SUBJECT_PROMPT, VOCAB_PROMPT } from "./prompts";

interface StackRow { k: string; v: string }
interface ExpRow { name: string; verdict: "adopt" | "drop" | "revise"; note: string }

interface StepDoc {
  key: string;
  n: string;
  title: string;
  tagline: string;
  goal: string;
  done: string[];
  stack: StackRow[];
  experiments: ExpRow[];
  results: StackRow[];
  legacy: string;
  /** 自定义段落（归因型步骤用）：列表 / 键值 / 表格 */
  blocks?: Array<{
    h: string;
    bullets?: string[];
    kv?: StackRow[];
    table?: { cols: string[]; rows: string[][] };
  }>;
}

const steps: StepDoc[] = [
  {
    key: "collect",
    n: "01",
    title: "素材采集",
    tagline: "先把「值得学的图」攒够",
    goal: "建立一批真实商业投放素材作为设计参考语料，要求覆盖多种品类与版式，而不是随机图片堆。",
    done: [
      "从 **Motionsites** 站点按频道采集整站首屏与封面，共 **230 张**",
      "以「**文件夹即分类**」归档：magazine 109 / landingpage 47 / 3d 26 / creative 19 / technology 12 / travel 9 / ecommerce 8",
      "每张图旁挂同名**元数据**（title、来源、付费标记）与 `-prompt.md` 提示词副本",
      "逐张**人工复核**，删除 4 张不合格的 landingpage（Bolt / Email Landing Page / Intelligent Systems / Health Portal）",
      "上传通道并入同一套目录规范，落进 `uploads/`，与采集素材共享同一条**分析管线**"
    ],
    stack: [
      { k: "采集对象", v: "**Motionsites** 商业站点，按频道分文件夹" },
      { k: "存储形态", v: "**文件系统**：目录 = 分类，文件名 = 语义 ID" },
      { k: "元数据", v: "`<base>.json` + `<base>-prompt.md`" },
      { k: "为什么不用数据库", v: "分类会变、素材会增删，目录方案零迁移成本，也方便脚本直接跑" }
    ],
    experiments: [
      { name: "**全站随机抓取**", verdict: "drop", note: "噪声过大，后期清洗成本高于收益" },
      { name: "**按频道定向采集** + 人工复核", verdict: "adopt", note: "保留 230 张，分类边界清晰" }
    ],
    results: [
      { k: "原始语料", v: "230 张" },
      { k: "入库素材", v: "232 条（含 6 条上传）" },
      { k: "分类数", v: "8 类" }
    ],
    legacy: "后续若扩充品类，只需新增目录，前后端与检索无需改动。"
  },
  {
    key: "structure",
    n: "02",
    title: "素材结构化表达",
    tagline: "把「一张图」变成可计算的四元组",
    goal: "按「设计意图 → 主图特征 → 设计内容 → 示例图」四元组拆解素材，让「主体在哪、文字压在哪、配色是什么」都变成可检索的结构化字段。",
    done: [
      "物理层：主体定位 → **像素分割** → **10×10 热区**（每格 = 主体与该格的重合面积占比 0–100）",
      "文字层：**OCR** 取像素级 bbox，映射成 10×10 文案区格，与主体热区叠加后可判「文字压主体」",
      "色块层：无主体素材按格取**中位色**，再用 **HSV** 分成高饱和 / 中间调 / 暗部",
      "风格层：构图、留白、**色调**、**调色板**、风格标签、材质",
      "场景层：用途（11 种交付物）、营销意图、题材标签、情绪标签",
      "设计建议：以「场景 + 主体」为起点，推导**遮挡建议**与文案排布"
    ],
    stack: [
      { k: "主体定位", v: "**DeepSeek 视觉模型**出语义描述 + bbox（归一化 0–1）" },
      { k: "像素分割", v: "**SAM ViT-B**，吃几何提示（点 / 框），不吃文本" },
      { k: "热区", v: "**10×10 网格** × mask 重合占比 ×100，取整" },
      { k: "文字", v: "**EasyOCR** → 像素 bbox → 归一化后落格" },
      { k: "色块", v: "逐格中位色 + **HSV 三层判定**" }
    ],
    experiments: [
      { name: "**YOLO-World** 目标检测", verdict: "drop", note: "剪影、风格化、纯色块主体召回差，橙马只露出马头时完全检不到" },
      { name: "**Florence-2** 开放词表检测", verdict: "drop", note: "召回同样不稳，且 transformers 4.57 触发 `_supports_sdpa` 缺失，需降到 4.46.3" },
      { name: "**SAM 自动全图 mask**", verdict: "drop", note: "能分出发光晶体、但不带语义，分不清「主体」与「背景装饰」" },
      { name: "**DeepSeek 语义 + SAM 几何**（双段式）", verdict: "adopt", note: "语义负责「谁是主体」，SAM 负责「精确到像素」，是目前唯一通吃的组合" },
      { name: "**Felzenszwalb 超像素**色块", verdict: "drop", note: "分割过碎，一张图裂成上百块，视觉上无法阅读" },
      { name: "逐格**中位色 + HSV 分层**", verdict: "adopt", note: "稳定、可解释，10×10 刚好能看出配色结构" },
      { name: "**6×6 粗网格**文案区", verdict: "drop", note: "格子太粗，一张文字密集的图能占到 82/100 格" },
      { name: "**OCR 像素 bbox** 落格", verdict: "adopt", note: "同一张图从 82 格降到 49 格，边界明显更贴合" }
    ],
    results: [
      { k: "语汇覆盖率", v: "232 / 232" },
      { k: "v2.0 物理层", v: "126 / 232" },
      { k: "含 OCR 文字", v: "203 / 232" },
      { k: "热区粒度", v: "10×10（100 格）" }
    ],
    legacy: "magazine 仍有 104 张走旧 YOLO 热区；上传通道未产出 OCR，文字区回退到语汇层坐标。"
  },
  {
    key: "vocabulary",
    n: "03",
    title: "设计语汇识别",
    tagline: "让模型只说「设计话」，不说「代码话」",
    goal: "把画面翻译成一段设计师能直接复用的自然语言，禁止输出任何代码、Tailwind 类名或实现细节，最终作为 RAG 的 few-shot 注入下游生成。",
    done: [
      "提示词从 v1.0 迭代到 **v3.0**，共 12 个版本，每版都由真实错例驱动",
      "v3.0 做**职责拆分**：删掉六条铁律里的几何条款（bbox 贴合、面积自洽、网格编号），改成一条边界——**不输出坐标，只解释给定的 sX / tX**",
      "主体框交由 **SAM**、文字框交由 **OCR**，语汇层不再测量位置，只负责「它是什么、在做什么、为什么这样排",
      "新增「**遮挡偏好**」与「**遮挡分析**」：判断主体是否被压、被什么颜色压，并给出是否建议避让",
      "v1.5 引入 `designGuidance`：场景 + 主体 → 初始遮挡建议 → 实际遮挡 → 文案该怎么写",
      "v2.0 另起**主体检测专用提示词**：输出 `subjects[]` 数组，覆盖景深 / 镶边 / 几何 / 主次 / 对称 / 全景六种构图，用 7 步 CoT 约束判断顺序",
      "色调维度重做：不再让模型自由发挥，改为从调色板 RGB 反算 **14 个色相枚举**，氛围词拆到独立字段"
    ],
    stack: [
      { k: "模型", v: "**DeepSeek 视觉**（推理模型，max_tokens 低于 6000 会拿到空响应）" },
      { k: "输出", v: "单个 JSON：subjects / texts / color / composition / style / scene / designGuidance" },
      { k: "坐标", v: "**不输出**（无 bbox / region / 网格编号），由物理层提供" },
      { k: "色调", v: "**14 色相**（红橙黄黄绿绿青蓝紫粉棕米灰黑白）+ 13 氛围词" }
    ],
    experiments: [
      { name: "v1.0 **扁平 schema**", verdict: "revise", note: "字段平铺，模型容易漏项，后续拆成三层" },
      { name: "v1.3 **三条铁律** + 正反例", verdict: "adopt", note: "「把整屏背景标成主体」类错误基本消失" },
      { name: "v1.4 **遮挡偏好** + 风景图例外", verdict: "adopt", note: "解决风景图整幅即主体的漏判" },
      { name: "v1.7 **网格加密**：4×4 → 10×10", verdict: "revise", note: "定位确实变细了，但 v3.0 起语汇层不再输出网格，10×10 只保留在**物理层热区**" },
      { name: "v1.9 **铁律 5**：bbox 不外扩", verdict: "adopt", note: "修掉「水下人像把整片水域框进人物」的过度保护" },
      { name: "**v2.0 主体提示词**（多主体数组）", verdict: "adopt", note: "支持主次主体、六种特殊构图，热区准确率明显提升" },
      { name: "**v2.0 全面替换旧热区**", verdict: "revise", note: "Halo Sound 一例 v2.0 漏判手臂（42.3%），旧 mask 反而更全（50.2%），最后保留旧热区" },
      { name: "**v3.0 职责拆分**：语汇只做语义", verdict: "adopt", note: "模型不再自造坐标与网格，消除「两份事实」；腾出的输出预算用于 narrative / 文案层级 / 构图读序" }
    ],
    results: [
      { k: "多主体 · Ancient Oath", v: "2 个" },
      { k: "多主体 · Honey Bee", v: "2 个" },
      { k: "覆盖度上限 · 镶边", v: "88.1%" },
      { k: "覆盖度下限 · 景深", v: "3.6%" }
    ],
    legacy: "语汇质量仍受视觉模型单次判断影响，缺人工校正回流通道。"
  },
  {
    key: "library",
    n: "04",
    title: "灵感库与入库工作流",
    tagline: "从「能看」到「能被检索、能被复用」",
    goal: "把结构化结果做成可浏览、可检索、可增量的灵感库，并让新素材能一条流水线走完从上传到入库。",
    done: [
      "后端按目录扫描并聚合三层信息：语汇（analysis）、检测（deepseek / florence / detect 依次回退）、元数据",
      "前端灵感库按分类切页，卡片按**图片宽高比**自适应，行内**两端对齐**",
      "悬浮浮层展示完整设计语汇：语义摘要、主体热区、色块分布、风格层、场景层、设计建议",
      "热区用颜色区分语义：主体（黄绿）、文案区（蓝）、文字重叠主体（青）",
      "上传工作流固化为 7 步：主体探查 → SAM 分割 → 热区计算 → 色块探查 → 文字探查 → 语汇分析 → 写入结果",
      "落库同时写物理层与语汇层，保证新素材和存量素材结构一致"
    ],
    stack: [
      { k: "后端", v: "**Fastify 5**，扫描目录即建索引，无需同步任务" },
      { k: "前端", v: "**Vue 3.5** + ant-design-vue + **webpack 5**" },
      { k: "检索设计", v: "稀疏（分类 / 色调 / 场景标签）+ **稠密向量**（embeddingText）混合召回" },
      { k: "布局", v: "**JS 计算行高**做两端对齐，宽度不足时保持目标高度而不硬拉" }
    ],
    experiments: [
      { name: "**页面自适应排布**：纯 CSS flex → JS 计算行高 + 单张成行占满", verdict: "adopt", note: "纯 flex 会把末行拉伸到失真；改计算行高后行满宽但不夸张，浮层也顺势改为「卡片另一侧 + 视口吸附」" }
    ],
    results: [
      { k: "入库素材", v: "232 条" },
      { k: "上传管线", v: "7 步 · 约 90 秒" },
      { k: "落库产物", v: "2 个 JSON" },
      { k: "下一步", v: "Linux 部署" }
    ],
    legacy: "检索目前是目录扫描 + 前端过滤，向量召回尚未上线；部署方案已定，待执行。"
  },
  {
    key: "deploy",
    n: "05",
    title: "检索与部署",
    tagline: "让 232 条素材真正被「按意思」检索到",
    goal: "把「目录扫描 + 前端过滤」换成「元数据硬过滤 + 向量召回」的混合检索，并把整套服务迁到一台 Linux 单机上。",
    done: [
      "检索分三层：**元数据硬过滤**（分类 / 色调 / 场景 / 构图）→ **向量召回** `embeddingText` → TopK 重排",
      "`embeddingText` 在语汇阶段就已生成（主体 + 文字 + 风格 + 场景的拼接串），建索引时无需二次加工",
      "知识库拆成**独立服务**：只暴露 `/search` 与 `/index`，不暴露公网",
      "项目后端接前端请求 → 调 `/search` 拿 TopK → 把召回案例的「设计结论」拼成 few-shot → 调 DeepSeek",
      "**Nginx** 托管前端静态资源，并反向代理 `/api`；前后端与知识库用 **Docker Compose** 编排",
      "Embedding 走本地 **bge** 或 API，二选一，配置在环境变量里切换"
    ],
    stack: [
      { k: "知识库服务", v: "**FastAPI** + 向量库，容器内网通信" },
      { k: "向量库", v: "先 **LanceDB**（单机零运维），规模上来再换 **Qdrant**" },
      { k: "检索契约", v: "`POST /search` 收 semanticText + 元数据过滤条件，返回 TopK" },
      { k: "部署拓扑", v: "Nginx → 后端(:3000) → 知识库(:8000) → 向量库" }
    ],
    experiments: [
      { name: "**目录扫描 + 前端过滤**（当前实现）", verdict: "revise", note: "232 条时够用，但只能按分类/字段筛，问「适合人像压字的版式」筛不出来" },
      { name: "**纯向量召回**", verdict: "revise", note: "会召回风格相近但场景不对的案例（沙漠日落 vs 家居暖光），必须先做元数据硬过滤" },
      { name: "**元数据硬过滤 + 向量召回**", verdict: "adopt", note: "先用分类/色调/构图缩小候选，再按语义排序，召回质量明显更稳" }
    ],
    results: [
      { k: "待索引素材", v: "232 条" },
      { k: "元数据维度", v: "4 类（分类/色调/场景/构图）" },
      { k: "当前状态", v: "未实施" },
      { k: "部署目标", v: "Linux 单机" }
    ],
    legacy: "向量检索与 Linux 部署均未落地，当前线上仍是目录扫描；这是本项目最后一块拼图。"
  },
  {
    key: "perf",
    n: "06",
    title: "工作流提速：v3.1 → v3.2",
    tagline: "先归因，再动刀；不猜",
    goal: "单张分析要 90 秒上下，用户等不了。要求先定位真正的瓶颈，再决定改哪里——而不是看到慢就换模型。",
    done: [],
    stack: [],
    experiments: [],
    results: [],
    legacy: "v3.1 完整保留（`docs/11-…-v3.1-稳定版.md`），任何时点可回退；下一步是把 64×64 mask 存进 deepseek.json，让主体主色摆脱 bbox 取样的误差。",
    blocks: [
      {
        h: "归因过程",
        bullets: [
          "**先怀疑 OCR 双管道**：实测 8.3s，只占 9% → 排除",
          "**再怀疑 10×10 网格**：v3.1 早就不输出网格，热区是后端按 bbox 现算的毫秒级 → 排除",
          "**拆开实测**：主体探查 21.2s / SAM 5.0s / OCR 8.3s / 语汇 50.3s / 进程冷启动 3.2s",
          "**发现异常**：12 张里有 5 张触发空响应重试，而重试一次等于整轮再跑一遍"
        ]
      },
      {
        h: "明确原因",
        kv: [
          { k: "主因", v: "推理模型的**思考 token** 吃光 `max_tokens`（8000），正文为空 → 重试 → 时长翻倍" },
          { k: "次因", v: "06 输出字段过多：8 个色值 + 4 个色彩属性 + 每条文案的 color/align/emphasis/inSubject + 主体的 mainColor/importance" },
          { k: "非原因", v: "OCR、SAM、网格粒度（都实测排除）" },
          { k: "缺失证据", v: "代码此前**没有记录 `finish_reason`**，无法区分「预算耗尽」和「模型抽风」，只能盲猜" }
        ]
      },
      {
        h: "具体做法",
        bullets: [
          "**v3.1 原样冻结**为稳定版文档，不动一行；v3.2 走独立提示词文件，随时可回退",
          "**v3.2 只让模型说人话**：主体叙述 / 文案层级 / 构图读序 / 场景 / 设计结论，一个数值都不让填",
          "**数值全部下放给代码**：新增 `design_fill.py`，k-means 取调色板、HSV 判色相、WCAG 算对比度、面积排序定重点度、热区质心定焦点",
          "**加链路日志**：新增 `runlog.py`，每次调用落 JSONL，记录 `finish_reason` / `tokens` / `耗时`，供事后归因",
          "**一个例外**：文案颜色交回模型判断——像素取样在复杂背景上会被污染，只有看图才给得准"
        ]
      },
      {
        h: "实验对比",
        table: {
          cols: ["图", "v3.1", "v3.2", "重试次数"],
          rows: [
            ["Augmented Sight", "86.0s", "**30.8s**", "1 → 0"],
            ["Cyber Ronin", "106.3s", "**23.8s**", "1 → 0"],
            ["Geno Trace", "28.7s", "26.4s", "0 → 0"],
            ["Innovation Lab", "85.5s", "**17.5s**", "1 → 0"],
            ["Intelligence Layer", "25.9s", "35.9s", "0 → 0"]
          ]
        }
      },
      {
        h: "数据说明",
        bullets: [
          "**没有重试时两者几乎一样**（28.7s vs 26.4s；25.9s vs 35.9s）——说明单次推理并没有变快",
          "**差距全部来自重试**：v3.1 五张里三张触发，触发即翻倍；v3.2 零触发",
          "**提示词从 6,116 字压到 2,635 字**（−57%），但要清楚：省的不是阅读时间，是模型的输出预算",
          "**technology 全量 12 张**：v3.2 均值约 28s，全程 0 重试",
          "**结论**：这次优化真正修的是「**输出太长 → 撞预算 → 重试**」这条链路，不是推理速度本身"
        ]
      }
    ]
  },
  {
    key: "intake",
    n: "07",
    title: "上传即入库：组、类与生命周期",
    tagline: "素材不是一次定稿，是可以被持续改进的对象",
    goal:
      "单张上传是一条长路径：选图 → 等一分钟 → 落库。一次十几张时它不成立；而且素材进库就「定稿」了——判错了只能手改文件。要让上传不再阻塞等待，让批量素材保持成组可追溯，让每一张都能被重新判断、并留下版本证据。",
    done: [
      "上传拆成两段：先接文件立即返回，后台串行分析；灵感库马上出现这组图，卡片显示「**分析中 n/m**」",
      "批量折成**文件夹**：首图作封面 + 数量角标，分析中显示进度；点进去是独立路由，可面包屑返回",
      "文件夹只活在「**上传**」筛选下；「全部」和具体分类里素材仍然分散展示，浏览不被批次打断",
      "06 直接给 `category`（七选一），落库存成「**上传 + 类别**」二元标签；用户可改，**拿不准就是「未归类」**，不强迫归桶",
      "卡片加**收藏**、**重试**、**对比**三个入口；重分析写候选文件，不覆盖当前版本",
      "删除到只剩一张时文件夹自动解散，最后一张退化为单图——**只提示，不询问**",
      "分类旁加三个状态胶囊「**已收藏 / 重试中 / 需更新**」，把「这张素材现在处于什么状态」变成可筛选的维度"
    ],
    stack: [
      { k: "批次清单", v: "`uploads/.batches/<id>.json`，重启可恢复；串行执行，避免 SAM / OCR 抢内存" },
      { k: "重试队列", v: "最多 **2 并行**，其余排队；等待中 / 分析中 / 可对比三态由后端统一返回，刷新可恢复" },
      { k: "版本不覆盖", v: "候选写 `<base>.rerun.analysis.json`，采纳时整体覆盖，放弃时只删候选" },
      { k: "能力开关", v: "`RETRY_ENABLED` 关闭后，前端隐藏重试按钮与状态胶囊，主路径不受影响" }
    ],
    experiments: [
      { name: "文件夹在「全部」里也显示", verdict: "drop", note: "一次上传就把首屏占满，改成只在「上传」下出现" },
      { name: "退化时弹确认框", verdict: "drop", note: "结果已确定，给选择只是虚假的控制感；改成一次性 toast 通知" },
      { name: "用规则匹配做分类", verdict: "drop", note: "规则判不出「这张算杂志还是科技」，让能读图的 06 直接给" },
      { name: "重分析直接覆盖原结果", verdict: "revise", note: "改成写候选 + 人工对比，保留可回退" }
    ],
    results: [
      { k: "图库规模", v: "224 条素材 · 1 个批量文件夹" },
      { k: "magazine 全量", v: "104 张全部 v3.2，100% 有文案热区" },
      { k: "重试队列", v: "2 并行，3 个任务实测 2 running + 1 queued" },
      { k: "分析耗时", v: "v3.2 单张 20–40s；批量串行，10 张约 5–8 分钟" }
    ],
    legacy:
      "批次清单与候选文件仍停在目录扫描层，还没进统一数据层；收藏只落了 `favorite` 字段，尚未映射成知识库的「**优质素材**」标签。"
  }
];

const active = ref(0);
const cur = computed(() => steps[active.value]);

const verdictLabel: Record<ExpRow["verdict"], string> = {
  adopt: "采用",
  drop: "放弃",
  revise: "修正"
};

/* 技术名词高亮：**词** → 主体色 */
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function rich(s: string) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b class="hl">$1</b>');
}

/* 提示词查看 */
const promptOpen = ref(false);
const promptTab = ref<"vocab" | "subject">("vocab");
const promptText = computed(() => (promptTab.value === "vocab" ? VOCAB_PROMPT : SUBJECT_PROMPT));
</script>

<template>
  <section class="docs">
    <header class="doc-head">
      <p class="eyebrow">PRODUCT · DOCS</p>
      <h1>产品文档</h1>
      <p class="sub">
        从爬素材到素材库的七段建设：做了什么、用了什么、试错了几轮、为什么长成现在这样。
      </p>
    </header>

    <div class="doc-body">
      <nav class="stepline">
        <button
          v-for="(s, i) in steps"
          :key="s.key"
          class="node"
          :class="{ active: i === active, passed: i < active }"
          @click="active = i"
        >
          <span class="dot">{{ s.n }}</span>
          <span class="node-text">
            <b>{{ s.title }}</b>
            <small>{{ s.tagline }}</small>
          </span>
        </button>
      </nav>

      <article class="panel">
        <div class="panel-top">
          <div>
            <p class="p-eyebrow">STEP {{ cur.n }}</p>
            <h2>{{ cur.title }}</h2>
            <p class="tagline">{{ cur.tagline }}</p>
          </div>
          <button v-if="cur.key === 'vocabulary'" class="ghost-btn" @click="promptOpen = true">
            查看提示词 v2.0
          </button>
        </div>

        <blockquote class="goal" v-html="rich(cur.goal)"></blockquote>

        <template v-if="!cur.blocks">
        <section class="blk">
          <h3>做了什么</h3>
          <ul class="bullets">
            <li v-for="(d, i) in cur.done" :key="i" v-html="rich(d)"></li>
          </ul>
        </section>

        <section class="blk">
          <h3>技术方案</h3>
          <dl class="kv">
            <template v-for="(r, i) in cur.stack" :key="i">
              <dt>{{ r.k }}</dt>
              <dd v-html="rich(r.v)"></dd>
            </template>
          </dl>
        </section>

        <section class="blk">
          <h3>实验与取舍</h3>
          <ul class="exps">
            <li v-for="(e, i) in cur.experiments" :key="i" :class="e.verdict">
              <span class="badge">{{ verdictLabel[e.verdict] }}</span>
              <span class="exp-name" v-html="rich(e.name)"></span>
              <span class="exp-note" v-html="rich(e.note)"></span>
            </li>
          </ul>
        </section>

        <section class="blk">
          <h3>实验数据示例</h3>
          <div class="results">
            <div v-for="(r, i) in cur.results" :key="i" class="res">
              <b>{{ r.v }}</b>
              <span>{{ r.k }}</span>
            </div>
          </div>
        </section>

        </template>
        <template v-else>
          <section class="blk" v-for="(b, bi) in cur.blocks" :key="bi">
            <h3>{{ b.h }}</h3>
            <ul class="bullets" v-if="b.bullets">
              <li v-for="(x, i) in b.bullets" :key="i" v-html="rich(x)"></li>
            </ul>
            <dl class="kv" v-if="b.kv">
              <template v-for="(r, i) in b.kv" :key="i">
                <dt>{{ r.k }}</dt>
                <dd v-html="rich(r.v)"></dd>
              </template>
            </dl>
            <table class="tbl" v-if="b.table">
              <thead>
                <tr><th v-for="(c, i) in b.table.cols" :key="i">{{ c }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in b.table.rows" :key="i">
                  <td v-for="(cell, j) in row" :key="j" v-html="rich(cell)"></td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>

        <p class="legacy"><b>现状与遗留</b><span v-html="rich(cur.legacy)"></span></p>
      </article>
    </div>

    <div v-if="promptOpen" class="modal" @click.self="promptOpen = false">
      <div class="modal-box">
        <header class="modal-head">
          <div class="tabs">
            <button :class="{ on: promptTab === 'vocab' }" @click="promptTab = 'vocab'">设计语汇提示词</button>
            <button :class="{ on: promptTab === 'subject' }" @click="promptTab = 'subject'">主体检测提示词</button>
          </div>
          <button class="close" @click="promptOpen = false">✕</button>
        </header>
        <pre class="prompt-body">{{ promptText }}</pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
.docs {
  max-width: 1240px;
  margin: 0 auto;
  padding: 44px 24px 120px;
  color: #e9ece6;
}
.eyebrow,
.p-eyebrow {
  margin: 0 0 12px;
  color: #6d6d66;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.22em;
}
h1 {
  margin: 0 0 10px;
  font-size: 38px;
  letter-spacing: -0.02em;
}
.sub {
  max-width: 620px;
  margin: 0 0 42px;
  color: #8a8a80;
  font-size: 13px;
  line-height: 1.7;
}

.doc-body {
  display: grid;
  grid-template-columns: 268px 1fr;
  gap: 40px;
  align-items: start;
}

.stepline {
  position: sticky;
  top: 92px;
  display: flex;
  flex-direction: column;
}
.stepline::before {
  position: absolute;
  top: 22px;
  bottom: 22px;
  left: 17px;
  width: 1px;
  background: #2a3138;
  content: "";
}
.node {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 12px 12px 12px 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.node .dot {
  z-index: 1;
  display: grid;
  width: 35px;
  height: 35px;
  flex: 0 0 35px;
  place-items: center;
  border: 1px solid #333b44;
  border-radius: 50%;
  color: #767d86;
  background: #0b0d10;
  font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: all 160ms ease;
}
.node.passed .dot {
  border-color: #4c5a3a;
  color: #9fbf6a;
}
.node.active .dot {
  border-color: #d9ff52;
  color: #11140c;
  background: #d9ff52;
  box-shadow: 0 0 0 5px rgb(217 255 82 / 10%);
}
.node-text b {
  display: block;
  margin-bottom: 3px;
  color: #c8d0d8;
  font-size: 13px;
  font-weight: 600;
}
.node.active .node-text b {
  color: #fff;
}
.node-text small {
  display: block;
  color: #6f777f;
  font-size: 11px;
  line-height: 1.5;
}

.panel {
  padding: 26px 30px 30px;
  border: 1px solid #242a31;
  border-radius: 14px;
  background: #0f1216;
}
.panel-top {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}
.panel h2 {
  margin: 0 0 6px;
  font-size: 24px;
  letter-spacing: -0.01em;
}
.tagline {
  margin: 0 0 18px;
  color: #d9ff52;
  font-size: 12px;
}
.ghost-btn {
  flex: 0 0 auto;
  padding: 7px 13px;
  border: 1px solid #3d4650;
  border-radius: 8px;
  color: #c8d0d8;
  background: #14181d;
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  transition: all 140ms ease;
}
.ghost-btn:hover {
  border-color: #d9ff52;
  color: #d9ff52;
}

.goal {
  margin: 0 0 26px;
  padding: 12px 16px;
  border-left: 2px solid #d9ff52;
  border-radius: 0 8px 8px 0;
  color: #a9b1b9;
  background: rgb(217 255 82 / 5%);
  font-size: 12.5px;
  line-height: 1.75;
}

.blk {
  margin-bottom: 26px;
}
.blk h3 {
  margin: 0 0 12px;
  color: #7b838c;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.16em;
}

:deep(.hl) {
  color: #d9ff52;
  font-weight: 600;
}

.bullets {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bullets li {
  position: relative;
  margin-bottom: 9px;
  padding-left: 16px;
  color: #b3bbc3;
  font-size: 12.5px;
  line-height: 1.75;
}
.bullets li::before {
  position: absolute;
  top: 8px;
  left: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #4e5560;
  content: "";
}

.kv {
  display: grid;
  grid-template-columns: 128px 1fr;
  gap: 1px;
  margin: 0;
  border: 1px solid #232a31;
  border-radius: 10px;
  overflow: hidden;
  background: #232a31;
}
.kv dt {
  padding: 10px 12px;
  color: #8b949d;
  background: #12161a;
  font-size: 11.5px;
}
.kv dd {
  margin: 0;
  padding: 10px 12px;
  color: #ccd3da;
  background: #0f1216;
  font-size: 11.5px;
  line-height: 1.6;
}

.tbl {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #232a31;
  border-radius: 10px;
  overflow: hidden;
  font-size: 11.5px;
}
.tbl th {
  padding: 8px 10px;
  color: #8b949d;
  background: #12161a;
  font-weight: 600;
  text-align: left;
}
.tbl td {
  padding: 8px 10px;
  border-top: 1px solid #1e242a;
  color: #ccd3da;
}
.tbl tr:hover td {
  background: #12161a;
}

.exps {
  margin: 0;
  padding: 0;
  list-style: none;
}
.exps li {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 4px 12px;
  padding: 10px 0;
  border-top: 1px solid #1e242a;
}
.exps li:first-child {
  border-top: 0;
}
.badge {
  grid-row: span 2;
  align-self: start;
  padding: 3px 0;
  border-radius: 4px;
  text-align: center;
  font: 700 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.exps li.adopt .badge {
  color: #10140b;
  background: #d9ff52;
}
.exps li.drop .badge {
  color: #ff9d9d;
  background: rgb(255 90 90 / 14%);
}
.exps li.revise .badge {
  color: #ffd479;
  background: rgb(255 190 60 / 14%);
}
.exp-name {
  color: #dfe5ea;
  font-size: 12.5px;
  font-weight: 600;
}
.exp-note {
  color: #8b949d;
  font-size: 11.5px;
  line-height: 1.65;
}

.results {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.res {
  padding: 12px;
  border: 1px solid #232a31;
  border-radius: 10px;
  background: #12161a;
}
.res b {
  display: block;
  margin-bottom: 4px;
  color: #d9ff52;
  font: 700 15px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.res span {
  color: #7b838c;
  font-size: 10.5px;
}

.legacy {
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid #232a31;
  color: #8b949d;
  font-size: 11.5px;
  line-height: 1.7;
}
.legacy b {
  margin-right: 8px;
  color: #c8d0d8;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  padding: 5vh 4vw;
  place-items: center;
  background: rgb(4 6 8 / 72%);
}
.modal-box {
  display: flex;
  width: min(980px, 100%);
  max-height: 90vh;
  flex-direction: column;
  border: 1px solid #2c343c;
  border-radius: 14px;
  overflow: hidden;
  background: #0d1013;
  box-shadow: 0 24px 60px rgb(0 0 0 / 60%);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #222a31;
}
.tabs {
  display: flex;
  gap: 6px;
}
.tabs button {
  padding: 6px 12px;
  border: 1px solid #333b44;
  border-radius: 7px;
  color: #9aa3ad;
  background: transparent;
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.tabs button.on {
  border-color: #d9ff52;
  color: #11140c;
  background: #d9ff52;
}
.close {
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  color: #9aa3ad;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}
.close:hover {
  color: #fff;
  background: #1b2229;
}
.prompt-body {
  margin: 0;
  padding: 20px 22px 28px;
  overflow: auto;
  color: #b7c0c8;
  font: 400 11.5px/1.75 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 980px) {
  .doc-body {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .stepline {
    position: static;
    flex-direction: row;
    overflow-x: auto;
  }
  .stepline::before {
    display: none;
  }
  .node {
    padding: 8px 10px 8px 0;
  }
  .node-text {
    display: none;
  }
  .results {
    grid-template-columns: repeat(2, 1fr);
  }
  .kv {
    grid-template-columns: 96px 1fr;
  }
}
</style>
