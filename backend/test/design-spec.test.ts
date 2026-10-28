import { describe, expect, it } from "vitest";
import { composeCanvas } from "../src/modules/design-assistant/domain/compose-canvas.js";
import type { SceneAnalysis } from "../src/modules/design-assistant/domain/design-assistant.schemas.js";
import { designSpecSchema, type DesignSpec } from "../src/modules/design-assistant/domain/design-spec.schemas.js";
import {
  buildDesignContext,
  validateDesignSpec
} from "../src/modules/design-assistant/domain/design-spec.validator.js";
import { clampOptions, clampParams, findRecipe } from "../src/modules/design-assistant/domain/motion-catalog.js";
import { planLayout } from "../src/modules/design-assistant/domain/layout-plan.js";

const FRAME = { width: 1500, height: 2000 };

function analysis(overrides: Partial<SceneAnalysis> = {}): SceneAnalysis {
  return {
    summary: "测试画面",
    subjects: ["人物"],
    subjectRegions: [
      {
        label: "人物",
        x: 0.2,
        y: 0.25,
        width: 0.2,
        height: 0.4,
        confidence: 0.9,
        importance: "primary",
        colors: ["#1B2340"]
      }
    ],
    environment: "室内",
    dominantColors: ["#112233", "#D8B45A"],
    safeZones: [{ x: 0.62, y: 0.2, width: 0.32, height: 0.4, reason: "右侧墙面", colors: ["#2F4A2A"] }],
    marketingTone: ["复古潮流"],
    risks: [],
    ...overrides
  };
}

function design(overrides: Partial<DesignSpec> = {}): DesignSpec {
  return designSpecSchema.parse({
    version: 1,
    concept: "夜色街头，克制大字",
    blocks: [
      {
        id: "kicker",
        role: "kicker",
        text: "NEW DROP",
        anchor: { ref: "textAnchor", dxPct: 0, dyPct: 0 },
        align: "left",
        sizeRatio: 0.03,
        weight: 600,
        tracking: 0.18,
        lineHeight: 1.2,
        occlude: false,
        enter: { id: "fade", params: { durationMs: 300 } }
      },
      {
        id: "headline",
        role: "headline",
        text: "夜行街头",
        anchor: { ref: "textAnchor", dxPct: 0, dyPct: 0 },
        align: "left",
        sizeRatio: 0.12,
        weight: 800,
        tracking: -0.03,
        lineHeight: 1.2,
        occlude: false,
        enter: { id: "mask-reveal", params: { durationMs: 620, softness: 0.2 } },
        idle: { id: "float-y", params: { amplitudePct: 0.4, periodMs: 2600 } }
      }
    ],
    effects: [
      {
        id: "sweep",
        anchor: { ref: "textAnchor", dxPct: 0, dyPct: -18 },
        colorRef: "accent",
        params: { widthPct: 18, opacity: 0.3, angleDeg: 12 }
      }
    ],
    palette: { text: "#FFFFFF", accent: "#D9FF52" },
    beats: { pace: "medium", startMs: 0 },
    ...overrides
  });
}

function context() {
  const plan = planLayout(analysis(), undefined, FRAME);
  return { plan, ctx: buildDesignContext(plan, analysis()), analysis: analysis() };
}

describe("动效目录参数夹取", () => {
  it("越界参数被夹到范围内，未知参数被丢弃并上报", () => {
    const recipe = findRecipe("text-enter", "slide-up")!;
    const result = clampParams(recipe, { durationMs: 5000, distancePct: 99, foo: 1 });
    expect(result.params.durationMs).toBe(800);
    expect(result.params.distancePct).toBe(9);
    expect(result.corrected.some((note) => note.includes("durationMs"))).toBe(true);
    expect(result.corrected.some((note) => note.includes("foo"))).toBe(true);
    expect(result.params).not.toHaveProperty("foo");
  });

  it("缺参数时补默认值", () => {
    const recipe = findRecipe("effect", "sweep")!;
    const result = clampParams(recipe, {});
    expect(result.params).toEqual({ widthPct: 18, opacity: 0.3, angleDeg: 12 });
    expect(result.corrected).toEqual([]);
  });

  it("滤镜类动效存在，非法 pattern 回退默认", () => {
    const glow = findRecipe("effect", "glow-mask");
    const soft = findRecipe("effect", "soft-focus");
    const strobe = findRecipe("effect", "strobe");
    expect(glow && soft && strobe).toBeTruthy();
    expect(clampOptions(glow!, { pattern: "光斑" }).options.pattern).toBe("dapple");
    expect(clampOptions(glow!, { pattern: "bokeh" }).options.pattern).toBe("bokeh");
    expect(clampParams(strobe!, { flashes: 9, periodMs: 1000 }).params.flashes).toBe(3);
  });
});

describe("设计说明不能被当成画面文案", () => {
  it("描边/动效类描述会被拦下，headline 保留", () => {
    const { ctx } = context();
    const input = design();
    input.blocks.push({
      ...input.blocks[0]!,
      id: "note",
      role: "subline",
      text: "描一圈线，指个方向"
    });
    const result = validateDesignSpec(input, ctx);
    expect(result.design.blocks.some((block) => block.text.includes("描一圈线"))).toBe(false);
    expect(result.design.blocks.some((block) => block.role === "headline")).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("设计说明"))).toBe(true);
  });

  it("正常文案不会被误判", () => {
    const { ctx } = context();
    const result = validateDesignSpec(design(), ctx);
    expect(result.design.blocks).toHaveLength(2);
  });

  it("图片描述类文案（视角/色调/穿搭罗列）同样被拦下", () => {
    const { ctx } = context();
    const input = design();
    input.blocks.push({
      ...input.blocks[0]!,
      id: "desc",
      role: "subline",
      text: "俯拍视角，黑卫衣配迷彩工装裤，冷灰色调"
    });
    const result = validateDesignSpec(input, ctx);
    expect(result.design.blocks.some((block) => block.text.includes("俯拍"))).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("设计说明"))).toBe(true);
  });

  it("客观 tag（复古潮流 / 深秋）不会被误拦", () => {
    const { ctx } = context();
    const input = design();
    input.blocks[0]!.text = "复古潮流 · 深秋";
    const result = validateDesignSpec(input, ctx);
    expect(result.design.blocks.some((block) => block.text === "复古潮流 · 深秋")).toBe(true);
  });
});

describe("L2 设计校验", () => {
  it("锚点不存在时回退到 textAnchor", () => {
    const { ctx } = context();
    const input = design();
    input.effects[0]!.anchor.ref = "safeZone:9";
    const result = validateDesignSpec(input, ctx);
    expect(result.design.effects[0]?.anchor.ref).toBe("textAnchor");
    expect(result.issues.some((issue) => issue.path.includes("effects"))).toBe(true);
  });

  it("颜色不在 L1 候选里时回退", () => {
    const { ctx } = context();
    const input = design({ palette: { text: "#123456" } });
    const result = validateDesignSpec(input, ctx);
    expect(result.design.palette.text).not.toBe("#123456");
    expect(result.issues.some((issue) => issue.message.includes("配色"))).toBe(true);
  });

  it("偏移超过 ±8% 被夹取", () => {
    const { ctx } = context();
    const input = design();
    input.blocks[1]!.anchor.dxPct = 40;
    const result = validateDesignSpec(input, ctx);
    expect(result.design.blocks.find((block) => block.role === "headline")?.anchor.dxPct).toBe(8);
  });

  it("重复的 headline 降级为 subline", () => {
    const { ctx } = context();
    const input = design();
    input.blocks.push({ ...input.blocks[1]!, id: "headline-2", text: "第二行" });
    const result = validateDesignSpec(input, ctx);
    expect(result.design.blocks.filter((block) => block.role === "headline")).toHaveLength(1);
  });

  it("缺少 headline 时把第一块提升为主标题", () => {
    const { ctx } = context();
    const input = design();
    input.blocks = input.blocks.map((block) => ({ ...block, role: "meta" as const }));
    const result = validateDesignSpec(input, ctx);
    expect(result.design.blocks.some((block) => block.role === "headline")).toBe(true);
  });

  it("光效层超过 2 个被截断", () => {
    const { ctx } = context();
    const input = design();
    const effect = input.effects[0]!;
    input.effects = [effect, effect, effect, effect];
    const result = validateDesignSpec(input, ctx);
    expect(result.design.effects).toHaveLength(3);
  });

  it("段落超过 30 字被截断", () => {
    const { ctx } = context();
    const input = design();
    input.blocks.push({
      ...input.blocks[1]!,
      id: "paragraph",
      role: "paragraph",
      text: "这是一段很长很长的正文段落用来测试三十个字的上限是否真的生效应该会被截断掉后面多余的部分",
      sizeRatio: 0.03
    });
    const result = validateDesignSpec(input, ctx);
    const paragraph = result.design.blocks.find((block) => block.role === "paragraph");
    expect([...(paragraph?.text ?? "")].length).toBeLessThanOrEqual(30);
    expect(result.issues.some((issue) => issue.message.includes("截断"))).toBe(true);
  });

  it("3D 文字只给主标题，副标题会被退回 none", () => {
    const { ctx } = context();
    const input = design();
    const subline = { ...input.blocks[1]!, id: "sub", role: "subline" as const, text: "副标题", text3d: "cylinder" as const };
    input.blocks.push(subline);
    const result = validateDesignSpec(input, ctx);
    expect(result.design.blocks.find((block) => block.role === "subline")?.text3d).toBe("none");
  });
});

describe("L3 解算", () => {
  it("是纯函数：同输入同输出", () => {
    const { plan, ctx } = context();
    const { design: safe } = validateDesignSpec(design(), ctx);
    const a = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    const b = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    expect(a).toEqual(b);
  });

  it("产出的 CompositionSpec 合法：时间在时长内、坐标在画布内", () => {
    const { plan, ctx } = context();
    const { design: safe } = validateDesignSpec(design(), ctx);
    const spec = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    expect(designSpecSchema.safeParse(safe).success).toBe(true);
    for (const layer of spec.layers) {
      expect(layer.endMs).toBeLessThanOrEqual(3000);
      expect(layer.endMs).toBeGreaterThan(layer.startMs);
      expect(layer.x).toBeGreaterThanOrEqual(0);
      expect(layer.x).toBeLessThanOrEqual(1);
      expect(layer.y).toBeGreaterThanOrEqual(0);
      expect(layer.y).toBeLessThanOrEqual(1);
    }
  });

  it("同一锚点的文字块竖向堆叠，互不重叠", () => {
    const { plan, ctx } = context();
    const { design: safe } = validateDesignSpec(design(), ctx);
    const spec = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    const texts = spec.layers
      .filter((layer) => layer.kind === "text")
      .sort((left, right) => (left.role === "kicker" ? -1 : 1) - (right.role === "kicker" ? -1 : 1));
    expect(texts).toHaveLength(2);
    const kicker = texts[0]!;
    const headline = texts[1]!;
    // kicker 在上、headline 在下，且没有互相压住
    expect(kicker.y).toBeLessThan(headline.y);
    expect(Math.abs(headline.y - kicker.y)).toBeGreaterThan((kicker.size ?? 0) * 0.5);
  });

  it("同一锚点内按角色堆叠，微小 dy 偏移不会打乱顺序", () => {
    const { plan, ctx } = context();
    const input = design();
    // 模型常给每个块加一点 dy 微调，不能因此把眉标挤到标题下面
    input.blocks[0]!.anchor.dyPct = 0;
    input.blocks[1]!.anchor.dyPct = 1.2;
    const { design: safe } = validateDesignSpec(input, ctx);
    const spec = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    const kicker = spec.layers.find((layer) => layer.role === "kicker");
    const headline = spec.layers.find((layer) => layer.role === "headline");
    expect(kicker && headline).toBeTruthy();
    expect(kicker!.y).toBeLessThan(headline!.y);
  });

  it("光效不压在文字块上", () => {
    const { plan, ctx } = context();
    const { design: safe } = validateDesignSpec(design(), ctx);
    const spec = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    const texts = spec.layers.filter((l) => l.kind === "text");
    const effects = spec.layers.filter((l) => l.kind === "pulse");
    expect(effects).toHaveLength(1);
    const effect = effects[0]!;
    const justify = (role: string | undefined) => (role === "kicker" ? -1 : 1);
    texts.sort((left, right) => justify(left.role) - justify(right.role));

    // 文字盒按 role 估一下纵向范围，光效点不能落在里面
    const spans = texts.map((layer) => {
      const height = (layer.size ?? 0.05) * 1.2;
      return { minY: layer.y - height / 2, maxY: layer.y + height / 2 };
    });
    const inside = spans.some((span) => effect.y > span.minY && effect.y < span.maxY);
    expect(inside).toBe(false);
  });

  it("节拍 slow 会拉长入场时长", () => {
    const { plan, ctx } = context();
    const base = validateDesignSpec(design(), ctx).design;
    const slow = validateDesignSpec(design({ beats: { pace: "slow", startMs: 0 } }), ctx).design;
    const fast = validateDesignSpec(design({ beats: { pace: "fast", startMs: 0 } }), ctx).design;
    const durationOf = (spec: DesignSpec) =>
      composeCanvas({ design: spec, plan, analysis: analysis(), durationMs: 4000 }).layers.find(
        (layer) => layer.role === "headline"
      )?.enter?.durationMs ?? 0;
    expect(durationOf(slow)).toBeGreaterThan(durationOf(base));
    expect(durationOf(fast)).toBeLessThan(durationOf(base));
  });

  it("所有文字距边缘至少 10%", () => {
    const { plan, ctx } = context();
    const input = design();
    // 故意把偏移推到极限，看 L3 是否还会把它拉回边距内
    input.blocks = input.blocks.map((block) => ({
      ...block,
      anchor: { ...block.anchor, dxPct: -8, dyPct: -8 }
    }));
    const { design: safe } = validateDesignSpec(input, ctx);
    const spec = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    for (const layer of spec.layers.filter((item) => item.kind === "text")) {
      expect(layer.x).toBeGreaterThanOrEqual(0.099);
      expect(layer.x).toBeLessThanOrEqual(0.901);
      expect(layer.y).toBeGreaterThanOrEqual(0.099);
      expect(layer.y).toBeLessThanOrEqual(0.901);
    }
  });

  it("文字层之间不重叠", () => {
    const { plan, ctx } = context();
    const input = design();
    // 加一段正文，制造拥挤
    input.blocks.push({
      ...input.blocks[1]!,
      id: "paragraph",
      role: "paragraph",
      text: "暖光手作与街头气质对撞",
      sizeRatio: 0.05
    });
    const { design: safe } = validateDesignSpec(input, ctx);
    const spec = composeCanvas({ design: safe, plan, analysis: analysis(), durationMs: 3000 });
    const texts = spec.layers.filter((layer) => layer.kind === "text");
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const a = texts[i]!;
        const b = texts[j]!;
        const gap = Math.abs(a.y - b.y);
        const minGap = ((a.size ?? 0.05) + (b.size ?? 0.05)) * 0.5;
        expect(gap).toBeGreaterThan(minGap * 0.8);
      }
    }
  });
});
