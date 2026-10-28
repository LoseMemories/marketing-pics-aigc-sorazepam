import OpenAI from "openai";
import { AppError } from "../../../shared/errors/app-error.js";
import type { DesignAssistantGateway } from "../application/design-assistant.ports.js";
import { designLanguageReference } from "../domain/design-language.catalog.js";
import { buildCopyRulesPrompt } from "../domain/copy-rules.catalog.js";
import { buildMotionCatalogPrompt } from "../domain/motion-catalog.js";

export interface DeepSeekOptions {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  imageDetail: "low" | "original";
}

export class DeepSeekDesignAssistant implements DesignAssistantGateway {
  private readonly client?: OpenAI;

  constructor(private readonly options: DeepSeekOptions) {
    if (options.apiKey) {
      this.client = new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        timeout: options.timeoutMs,
        maxRetries: options.maxRetries
      });
    }
  }

  async analyzeScene(imageBase64: string): Promise<unknown> {
    return this.complete([
      {
        role: "system",
        content:
          "你是营销视觉分析器，为后续「文案排版 + Canvas 动效」提供结构化画面信息。只返回 JSON，不要 markdown 或解释。" +
          "坐标以原始主图左上角为原点，宽高归一化到 0–1，不得把网页留白或 letterbox 黑边计入坐标。颜色用 #RRGGBB。" +
          "只描述画面中真实存在的内容；不确定时给最保守的取值，不要编造。"
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "按下面四个维度观察这张主图，返回字段名完全一致的 JSON。",
              "",
              "一、主体（可能多个）",
              "宁少勿滥：只标记会与文字/动效抢视觉的语义主体——人物、商品、动物、主要建筑与家具。",
              "不要把人脸局部、天空、地面、纯色墙面、光影斑块、装饰线条当作主体。",
              "每个主体写入 subjectRegions，按重要性从高到低，最多 6 个；宁可少标也不要凑数：",
              "· label：8–24 个中文字符，含位置与外观线索，例如「左侧真人模特（金色短发+白衬衫黑短裤）」",
              "· x / y / width / height：紧贴该主体的最小外接矩形（归一化）",
              "· points：沿「主体外侧的避让范围」顺时针均匀采样 20 个点，用 [[x,y],…] 数组写法，坐标归一化到 0–1，保留 3 位小数。",
              "  这是「大致范围」而不是抠图：不要贴着主体边缘描，不要描发丝、衣褶、手指、手臂与身体之间的缝隙；",
              "  正确做法是想象一个能把主体整体军住的圆润外形，边界始终落在主体外侧约 2–4% 画幅边长处，",
              "  允许把范围内的背景一起圈进来。宁可略大略圆，也绝不能切进主体；不要只给四个角的矩形。",
              "· confidence：0–1 的置信度",
              "· score：0–100 的「主体价值分」，衡量这个主体值不值得作为营销主体留在画面上。",
              "  评分参考：占画面面积越大、越清晰完整、越靠近中心、越能代表卖点，分越高；",
              "  背景里的路人、模糊陪体、只露出一角的东西、大面积装饰纹样，分要低（低于 40）；",
              "  主人物/主商品通常 70–95。不要全部给高分，要有区分度。",
              "· importance：primary（人物/卖点商品等主要主体）或 secondary（陪体）",
              "· colors：该主体最具代表性的 1–3 个 #RRGGBB 颜色（衣物/主体外表的实际颜色）。",
              "  后续新增的文字与光点特效必须避开这些色相，否则会淹没在主体里。",
              "subjects 是这些 label 按重要性排列的字符串数组。",
              "",
              "二、背景",
              "· environment：一句话说明场景，例如「室内复古服装店，挂满夹克的货架前」",
              "· background：{ description（背景纹理与信息密度的一句话描述）、complexity（clean / moderate / busy）、textFriendly（布尔，背景本身能否直接承载文字） }",
              "",
              "三、文字安全区",
              "safeZones：1–4 个区域，必须与所有主体矩形不重叠，优先留白、纯色墙面、虚化背景；",
              "每项给出 x / y / width / height / reason（一句中文说明为何适合放文字）、",
              "colors：该区域的平均底色 1–2 个 #RRGGBB（用于计算文字与特效的对比度，不能直接用画面全局色代替）。",
              "",
              "四、风格与风险",
              "· marketingTone：3–5 个中文风格标签，2–6 字，描述营销调性，例如「复古潮流」「街头潮流」「趣味对比」",
              "· dominantColors：3–6 个代表性 #RRGGBB 颜色",
              "· risks：0–4 条可能影响排版的隐患（如可用留白过窄、主体贴边、画面过于杂乱）",
              "· summary：一句话概括画面与卖点"
            ].join("\n")
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
              detail: this.options.imageDetail
            }
          }
        ]
      }
    ]);
  }

  async generateComposition(input: {
    brief: string;
    sceneAnalysis: unknown;
    focusSubjects?: readonly string[];
    durationMs: number;
    width: number;
    height: number;
  }): Promise<unknown> {
    return this.complete([
      {
        role: "system",
        content:
          "你是确定性 Canvas 动效编排器。只返回 JSON，不得返回代码、HTML、CSS、URL 或 markdown。所有 x/y 都相对于原始主图内容本身，而不是网页容器或 letterbox 黑边；text 的 x/y 表示文字中心点，pulse 的 x/y 表示圆心。"
      },
      {
        role: "user",
        content: `根据以下信息生成 CompositionSpec：${JSON.stringify(input)}。
${input.focusSubjects && input.focusSubjects.length > 0 ? `本次设计仅围绕以下选定主体展开：${input.focusSubjects.join("；")}。未列出的主体区域一律视为背景，不得为其单独编排文字或标记。\n` : ""}sceneAnalysis.subjectRegions[].points 是每个主体外扩 2–4% 后的「大致范围」（归一化多边形，不是抠图轮廓，内部仍含少量背景）；任何 text 的锚点与 pulse 的圆心都不得落入这些多边形内部，优先放在 safeZones 内。
${designLanguageReference}
【必须遵守的排版要求】
1. 文字必须集中成一个视觉块：headline / subline / meta 共用同一 x 锚点与 align，垂直依次排列，间距按设计语言 A5；禁止把短句分散到画面多个角落。
2. 采用"短句大字 + 段落小字"：headline 短而大，subline 是小字段落，两者字号比 1 : 0.35 左右，形成呼吸感。
3. 每个 text 层都要给出 role、size、weight、align，并给出 enter（type/startMs/durationMs/ease）；可选给 idle。
4. 若使用"从人物后方出现"或"立起"这类强效果，只允许用在 headline 上，并相应设置 occlude / enter.type。
5. pulse 层最多 2 个，且锚点必须远离文字块。

格式必须是 {version:1,durationMs:${input.durationMs},layers:[...]}。layers 只能使用 kind=text 或 pulse；每层必须包含 id,startMs,endMs,x,y,color；text 类型还需 text，并尽量给出 role/size/weight/align/enter；pulse 类型给出 animation（sweep/drift/breathe）。避免所有 pulse 都退化成相同圆点。静态封面会同时展示全部 text，因此文字必须垂直错开、不得互相重叠。id 只能使用小写英文字母、数字和连字符；color 必须是六位 #RRGGBB；startMs/endMs 必须是整数。坐标严格限制在 0 到 1，四周至少保留 0.04 安全边距；durationMs 必须精确等于 ${input.durationMs}，图层时间不得超过 durationMs，最多 6 层。`
      }
    ]);
  }

  /**
   * L2 设计师：只输出「设计语汇」（DesignSpec）。
   * 不写坐标、不写毫秒——那些由 L3 的 compose-canvas 解算，模型不擅长也不该做。
   */
  async designLayout(input: {
    brief: string;
    copySource: string;
    layoutPlan: unknown;
    sceneAnalysis: unknown;
    durationMs: number;
    frameRatio: number;
  }): Promise<unknown> {
    const brief = input.brief.trim() || "突出主体，做一个有品牌感的营销版式";
    const copySource = input.copySource.trim();

    return this.complete([
      {
        role: "system",
        content:
          "你是资深营销视觉设计师（L2）。你只做「设计决策」：文案层级、锚点选择、版式倾向、动效配方、色彩角色。" +
          "你写的 blocks[].text 是印在画面上的文案，必须来自用户给的真实资料；设计思路只能写在 concept 里。" +
          "动效是备选项而不是必选项：只在真正适合这张照片的故事与色调时才用，宁可不用。" +
          "你不写任何坐标或毫秒，也不写代码。只返回 JSON，不要 markdown 或解释。"
      },
      {
        role: "user",
        content: [
          `创作方向（运营给的风格期望）：${brief}`,
          "",
          "【照片的事实背景与想突出的信息（来自摄影者/运营的真实资料，这是你唯一的文案依据）】",
          copySource || "（未提供资料，只能依据创作方向写极克制的短文案，禁止发明品牌/门店/价格/活动/日期）",
          "",
          "如何用这段资料（非常重要）：",
          "· 它常常是「背景 + 想突出什么」，不是成品文案。你要据此写出真正的营销短文案。",
          "· 资料里出现的真实事实（地点、季节、光线、材质、氛围、穿搭特点、想强调的卖点）可以用；",
          "  但只有资料明确要求突出单品/穿搭/摄影时，才允许把衣服、鞋子、镜头这类具体描述写进文案。",
          "· 资料里没出现的品牌名、门店名、价格、折扣、活动日期一律不许编。",
          "· 文案要让消费者一眼看懂这张照片在卖什么感受/什么事实，而不是描述我们看到了什么、做了什么设计。",
          "",
          buildCopyRulesPrompt(),
          "",
          "【画面理解（视觉模型对主图的描述，含主色调、主体颜色、背景复杂度）】",
          JSON.stringify(input.sceneAnalysis),
          "",
          "【L1 构图结论（算法基于像素覆盖率得出，是位置的主要参考）】",
          JSON.stringify(input.layoutPlan),
          "",
          buildMotionCatalogPrompt(),
          "",
          "【输出要求】",
          `1. 画面比例 ${input.frameRatio.toFixed(3)}，实况时长 ${input.durationMs}ms（不需要你输出时间）。`,
          "2. blocks 1–5 个，必须恰好 1 个 role=headline（Hero 大标题）；正文段落用 role=paragraph。",
          "3. 字数上限：headline 4–14 字；paragraph ≤ 30 字（可用 \\n 分成 1–3 行）；subline ≤ 40 字；meta / kicker ≤ 12 字。",
          "4. 文字必须构成一个紧凑视觉块：多数块共用同一个 anchor 与 align，靠 role 决定上下顺序（kicker → headline → subline → paragraph → meta）。",
          "5. anchor.ref 只能从下面这张列表里选：textAnchor（首选）/ secondaryAnchor / safeZone:<i> / free。",
          "6. dxPct / dyPct 是相对短边的偏移百分比，-8 到 8：只做微调，不要拿它替代锚点。",
          "7. sizeRatio（占短边）：headline 0.06–0.16，subline 为 headline 的 0.3–0.45，paragraph 0.022–0.05，meta/kicker 更小。",
          "8. font：headline 优先 display（标题感）或 serif；正文用 sans；等宽只在需要数据感时用。",
          "9. transform（变形 schema）只能给轻微值：scaleX/scaleY 0.85–1.25、rotateDeg -8–8、skewDeg -8–8。",
          "10. path（路线样式变化）：fromDxPct / fromDyPct 是起点相对终点的偏移（%短边，-60–60），fromScale→toScale 是首尾缩放；滑入类动效才需要给。",
          "11. text3d 只能给 headline，取值 none / cylinder（圆柱文字）/ cube（立方体文字），与 stand-up-3d 搭配最自然。",
          "12. palette.text / accent / support 必须从 L1 给出的候选色里挑（原样返回十六进制），不要自创颜色。",
          "",
          "【文案铁律（违反即算错误）】",
          "A. blocks[].text 是「消费者在图上读到的字」，只能是对真实事实的提炼；",
          "   绝对禁止把设计思路、动效说明、构图描述、主体外观描述写进画面文案——这些只留在 concept 字段（concept 不渲染）。",
          "B. 同一段话不要拆成多个 block 反复说；subline / paragraph 必须是补充信息（卖点、地点、季节、调性），不是解释标题。",
          "C. 不要写空话套话（「美到窒息」「绝美」「心动时刻」），宁可具体：地点 + 季节 + 可以验证的事实。",
          "",
          "【动效不是必选项（关键）】",
          "D. 先判断这张照片需要不需要动效：只有「动效讲得通」时才加，通常 0–2 个；宁可少，也不要为了炫技堆效果。",
          "E. 选之前必须同时考虑：故事背景（资料里说的场景与情绪）、画面主色调 dominantColors、主体自身颜色、背景复杂度。",
          "   - 主体颜色与 accent 接近时不加发光类效果；背景已经很乱时只加极克制的描边或什么都不加。",
          "   - 有植物/阳光/窗光的故事 → glow-mask（树影透光）；温情/治愈/唯美 → soft-focus（柔光）；",
          "     街头/夜店/运动这类强节奏 → strobe（一次频闪）或 laser-overlay（潮流滤镜）；",
          "     想让视线聚焦某个对象 → subject-outline / icon-marker / breathing-dot 三选一，不要全上。",
          "F. 整幅滤镜类（glow-mask / soft-focus / laser-overlay / strobe）最多只能有 1 个，且 opacity 必须低到不损失画面信息。",
          "G. 文字与主体重叠：occlude=true 时文字会与主体以饱和度渐变混在一起（字不会消失，主体也不会被盖死），",
          "   这是一手很强的技法，只有想让字「穿过」主体时才用；默认 false。",
          "H. 每个 effect 都要能在 concept 里说清「为什么是这个效果」；说不清就不要用它。",
          "I. enter / idle / effects 的 id、参数、选项必须来自上面的动效目录，参数不得越界。",
          "",
          "【返回 JSON 结构】",
          JSON.stringify({
            version: 1,
            concept: "一句话设计概念（可以写设计思路，但这段不会渲染到画面上）",
            blocks: [
              {
                id: "headline",
                role: "headline",
                text: "主标题文案",
                anchor: { ref: "textAnchor", dxPct: 0, dyPct: 0 },
                align: "left",
                sizeRatio: 0.12,
                weight: 800,
                tracking: -0.02,
                lineHeight: 1.2,
                font: "display",
                transform: { scaleX: 1, scaleY: 1, rotateDeg: 0, skewDeg: 0 },
                path: { fromDxPct: 8, fromDyPct: 0, fromScale: 1.12, toScale: 1 },
                text3d: "cylinder",
                occlude: false,
                enter: { id: "stand-up-3d", params: { durationMs: 860, perspectiveDeg: 28, liftPct: 4 } },
                idle: { id: "float-y", params: { amplitudePct: 0.4, periodMs: 2600 } }
              }
            ],
            effects: [
              { id: "glow-mask", anchor: { ref: "textAnchor", dxPct: 0, dyPct: 0 }, colorRef: "accent", params: { opacity: 0.26, blobCount: 6, sizePct: 13, driftPct: 2, softness: 0.7 }, options: { pattern: "dapple" } },
              { id: "subject-outline", anchor: { ref: "textAnchor", dxPct: 0, dyPct: 0 }, colorRef: "accent", params: { widthPct: 0.5, durationMs: 1400, opacity: 0.75, jitterPct: 0.3 }, options: { style: "spray-dashed", mode: "draw-on" } }
            ],
            palette: { text: "#FFFFFF", accent: "#D9FF52" },
            beats: { pace: "medium", startMs: 0 }
          })
        ].join("\n")
      }
    ]);
  }

  private async complete(messages: unknown[]): Promise<unknown> {
    if (!this.client) {
      throw new AppError("MODEL_GATEWAY_NOT_CONFIGURED", "DeepSeek API 尚未配置。", 503);
    }
    try {
      const completion = await this.client.chat.completions.create({
        model: this.options.model,
        messages: messages as never,
        temperature: 0,
        response_format: { type: "json_object" },
        stream: false
      });
      const content = completion.choices[0]?.message.content;
      if (!content) throw new Error("Empty model response");
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof AppError) throw error;
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        throw new AppError("MODEL_GATEWAY_AUTH_ERROR", "DeepSeek 鉴权失败。", status);
      }
      if (status === 429) {
        throw new AppError("MODEL_GATEWAY_RATE_LIMITED", "DeepSeek 请求受限，请稍后重试。", 429);
      }
      if ((error as { code?: string }).code === "APIConnectionTimeoutError") {
        throw new AppError("MODEL_GATEWAY_TIMEOUT", "DeepSeek 请求超时。", 504);
      }
      throw new AppError("MODEL_GATEWAY_ERROR", "DeepSeek 请求失败。", 502);
    }
  }
}
