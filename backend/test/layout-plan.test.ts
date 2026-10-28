import { describe, expect, it } from "vitest";
import {
  decisionGridFor,
  planLayout
} from "../src/modules/design-assistant/domain/layout-plan.js";
import type { SceneAnalysis } from "../src/modules/design-assistant/domain/design-assistant.schemas.js";

/** 默认用 3:4 竖幅，和最常用的手机实况一致。 */
const PORTRAIT = { width: 1500, height: 2000 };

function analysis(overrides: Partial<SceneAnalysis> = {}): SceneAnalysis {
  return {
    summary: "测试画面",
    subjects: ["人物"],
    subjectRegions: [{
      label: "人物",
      x: 0.2, y: 0.25, width: 0.2, height: 0.4, confidence: 0.9, importance: "primary"
    }],
    environment: "室内",
    dominantColors: ["#112233"],
    safeZones: [{ x: 0.62, y: 0.2, width: 0.32, height: 0.4, reason: "右侧墙面" }],
    marketingTone: ["复古潮流"],
    risks: [],
    ...overrides
  };
}

const cellAt = (plan: ReturnType<typeof planLayout>, col: number, row: number) =>
  plan.candidates.find((cell) => cell.col === col && cell.row === row)!;

describe("决策网格按画面比例自适应", () => {
  it("近正方形 / 3:4 / 5:7 仍用 3×3", () => {
    expect(decisionGridFor({ width: 1000, height: 1000 })).toEqual({ cols: 3, rows: 3 });
    expect(decisionGridFor({ width: 1500, height: 2000 })).toEqual({ cols: 3, rows: 3 });
    expect(decisionGridFor({ width: 1000, height: 1400 })).toEqual({ cols: 3, rows: 3 });
    // 4:3 横图也算"不明显的长形"
    expect(decisionGridFor({ width: 2000, height: 1500 })).toEqual({ cols: 3, rows: 3 });
  });

  it("16:9 用 4×3，9:16 用 3×4", () => {
    expect(decisionGridFor({ width: 1920, height: 1080 })).toEqual({ cols: 4, rows: 3 });
    expect(decisionGridFor({ width: 1080, height: 1920 })).toEqual({ cols: 3, rows: 4 });
  });

  it("更长的图继续加密", () => {
    // 21:9
    expect(decisionGridFor({ width: 2560, height: 1080 })).toEqual({ cols: 5, rows: 3 });
    // 超宽屏封顶 6 列
    expect(decisionGridFor({ width: 3840, height: 1080 })).toEqual({ cols: 6, rows: 3 });
    // 竖幅同理
    expect(decisionGridFor({ width: 1080, height: 2560 })).toEqual({ cols: 3, rows: 5 });
  });

  it("planLayout 会带出网格与画幅比例", () => {
    const plan = planLayout(analysis(), undefined, { width: 1920, height: 1080 });
    expect(plan.grid).toEqual({ cols: 4, rows: 3 });
    expect(plan.frameRatio).toBeCloseTo(1.778, 2);
    expect(plan.candidates).toHaveLength(12);
  });
});

describe("L1 构图决策", () => {
  it("小面积主体 → 文字落在留白一侧", () => {
    const plan = planLayout(analysis(), undefined, PORTRAIT);
    expect(plan.scale).toBe("small");
    expect(plan.textColumn).toBe("right");
    expect(plan.textAnchor.colEnd).toBe(2);
    expect(plan.headlineSizeRange[0]).toBe(0.1);
  });

  it("大面积主体 → 字号收小", () => {
    const plan = planLayout(analysis({
      subjectRegions: [{
        label: "人物",
        x: 0.1, y: 0.1, width: 0.8, height: 0.75, confidence: 0.9, importance: "primary"
      }],
      safeZones: [{ x: 0.05, y: 0.86, width: 0.9, height: 0.1, reason: "底部窄条" }]
    }), undefined, PORTRAIT);
    expect(plan.scale).toBe("large");
    expect(["edge-small", "wrap-subject", "full-band", "column-stack"]).toContain(plan.strategy);
    expect(plan.headlineSizeRange[1]).toBeLessThanOrEqual(0.08);
  });

  it("顶部一行连续无主体 → 各格合并成整条带", () => {
    const plan = planLayout(analysis({
      // 主体压在中下两行，顶部一行全空
      subjectRegions: [{
        label: "主体", x: 0.05, y: 0.36, width: 0.9, height: 0.6,
        confidence: 0.95, importance: "primary"
      }],
      safeZones: []
    }), undefined, PORTRAIT);
    expect(plan.textAnchor.rowStart).toBe(0);
    expect(plan.textAnchor.rowEnd).toBe(0);
    expect(plan.textAnchor.colStart).toBe(0);
    expect(plan.textAnchor.colEnd).toBe(plan.grid.cols - 1);
    expect(plan.textAnchor.cells).toBe(plan.grid.cols);
    expect(plan.textAnchor.label).toBe("上方整条带");
    expect(plan.strategy).toBe("full-band");
    expect(plan.mergeThreshold).toBeCloseTo(plan.peakHeat * 0.3, 4);
  });

  it("半热的行不会被顺手吞进来", () => {
    const plan = planLayout(analysis({
      subjectRegions: [{
        label: "主体", x: 0.05, y: 0.36, width: 0.9, height: 0.6,
        confidence: 0.95, importance: "primary"
      }],
      safeZones: []
    }), undefined, PORTRAIT);
    const middleRow = plan.candidates.filter((cell) => cell.row === 1);
    const middleHeat = middleRow.reduce((total, cell) => total + cell.heat, 0) / middleRow.length;
    expect(middleHeat).toBeGreaterThan(plan.mergeThreshold);
    expect(plan.textAnchor.rowEnd).toBe(0);
  });

  it("整列连续无主体 → 竖向合并", () => {
    const plan = planLayout(analysis({
      subjectRegions: [{
        label: "主体", x: 0, y: 0, width: 0.64, height: 1,
        confidence: 0.95, importance: "primary"
      }],
      safeZones: []
    }), undefined, PORTRAIT);
    expect(plan.textAnchor.colStart).toBe(2);
    expect(plan.textAnchor.colEnd).toBe(2);
    expect(plan.textAnchor.rowStart).toBe(0);
    expect(plan.textAnchor.rowEnd).toBe(plan.grid.rows - 1);
    expect(plan.textColumn).toBe("right");
  });

  it("人物在左 + 木栏压底 → 主文字落在顶部条带、小字在其下方", () => {
    const plan = planLayout(analysis({
      subjectRegions: [
        {
          label: "青年男性",
          x: 0.17, y: 0.385, width: 0.29, height: 0.615, confidence: 0.95, importance: "primary"
        },
        {
          label: "木杆木栏",
          x: 0.04, y: 0.63, width: 0.95, height: 0.37, confidence: 0.9, importance: "secondary"
        }
      ],
      safeZones: [
        { x: 0.02, y: 0.03, width: 0.38, height: 0.31, reason: "左上纯色蓝天" },
        { x: 0.55, y: 0.2, width: 0.42, height: 0.19, reason: "右上干净天区" }
      ]
    }), undefined, PORTRAIT);
    expect(plan.textAnchor.rowStart).toBe(0);
    expect(plan.textAnchor.rowEnd).toBe(0);
    expect(plan.textAnchor.colEnd - plan.textAnchor.colStart + 1).toBe(plan.grid.cols);
    // 底部被木栏压住，不能当主文字区
    const bottomRow = plan.candidates.filter((cell) => cell.row === 2);
    expect(bottomRow.every((cell) => cell.heat > 0.2)).toBe(true);
    expect(plan.secondaryAnchor).not.toBeNull();
    expect(plan.secondaryAnchor!.rowStart).toBeGreaterThan(plan.textAnchor.rowEnd);
  });

  it("占比按像素并集算，重叠主体不重复计数", () => {
    const region = {
      label: "主体", x: 0.2, y: 0.2, width: 0.3, height: 0.4,
      confidence: 0.9, importance: "primary" as const
    };
    const plan = planLayout(analysis({
      subjectRegions: [region, { ...region, label: "陪体", importance: "secondary" }],
      safeZones: []
    }), undefined, PORTRAIT);
    // 两个完全重合的矩形，并集就是 0.12；求和会得到 0.24
    expect(plan.areaRatio).toBeCloseTo(0.12, 2);
  });

  it("按选中主体过滤：未选中的主体不计入占比", () => {
    const base = analysis({
      subjectRegions: [
        { label: "人物", x: 0.1, y: 0.1, width: 0.2, height: 0.3, confidence: 0.9, importance: "primary" },
        { label: "货架", x: 0.5, y: 0.1, width: 0.45, height: 0.8, confidence: 0.8, importance: "secondary" }
      ]
    });
    const all = planLayout(base, undefined, PORTRAIT);
    const onlyShelf = planLayout(base, ["货架"], PORTRAIT);
    expect(all.subjectCount).toBe(2);
    expect(onlyShelf.subjectCount).toBe(1);
    expect(onlyShelf.areaRatio).toBeLessThan(all.areaRatio);
    expect(onlyShelf.subjects[0]?.label).toBe("货架");
  });

  it("显式清空选择：不约束主体，按全画面排版", () => {
    const base = analysis();
    const all = planLayout(base, undefined, PORTRAIT);
    const none = planLayout(base, [], PORTRAIT);
    expect(all.selection).toBe("all");
    expect(all.subjectCount).toBeGreaterThan(0);
    expect(none.selection).toBe("explicit");
    expect(none.subjectCount).toBe(0);
    expect(none.areaRatio).toBe(0);
    expect(none.strategy).toBe("full-bleed");
    expect(none.textAnchor.cells).toBe(none.grid.cols * none.grid.rows);
    expect(none.secondaryAnchor).toBeNull();
  });

  it("选中标签与主体对不上时标记 unmatched，并回退到全部", () => {
    const plan = planLayout(analysis(), ["不存在的标签"], PORTRAIT);
    expect(plan.selection).toBe("unmatched");
    expect(plan.subjectCount).toBe(1);
  });

  it("没有安全区时，依然能靠热区避开主体", () => {
    const plan = planLayout(analysis({ safeZones: [] }), undefined, PORTRAIT);
    expect(plan.safeZone).toBeNull();
    expect(plan.textColumn).toBe("right");
    expect(plan.textAnchor.colEnd).toBe(2);
  });
});

describe("把分析结论一并交给 L2", () => {
  it("safeZones 与 reason 原样带出", () => {
    const plan = planLayout(analysis({
      safeZones: [
        { x: 0.02, y: 0.03, width: 0.38, height: 0.31, reason: "左上纯色蓝天", colors: ["#2F72B4"] },
        { x: 0.55, y: 0.2, width: 0.42, height: 0.19, reason: "右上干净天区", colors: ["#4A8CC4"] }
      ]
    }), undefined, PORTRAIT);
    expect(plan.safeZones).toHaveLength(2);
    expect(plan.safeZones[1]?.reason).toBe("右上干净天区");
    expect(plan.safeZones[1]?.colors).toEqual(["#4A8CC4"]);
    // 两组数据都要出现在给 L2 的说明里
    expect(plan.designerBrief).toContain("主图分析的文字安全区");
    expect(plan.designerBrief).toContain("右上干净天区");
    expect(plan.designerBrief).toContain("L1 主体热区与承载区");
    expect(plan.designerBrief).toContain(plan.textAnchor.label);
  });

  it("背景杂乱与风险项不再拼成告警，也不进 designerBrief", () => {
    const plan = planLayout(analysis({
      background: { description: "碎石坡地", complexity: "busy", textFriendly: false },
      risks: ["可用留白过窄"]
    }), undefined, PORTRAIT);
    expect(plan.designerBrief).not.toContain("【需要注意】");
    expect(plan.designerBrief).not.toContain("可用留白过窄");
  });

  it("配色参考以画面基调为准，并给出通用安全色", () => {
    const plan = planLayout(analysis({
      dominantColors: ["#2F6FB0", "#1D5C96", "#C0915F"],
      subjectRegions: [{
        label: "人物", x: 0.2, y: 0.25, width: 0.2, height: 0.4,
        confidence: 0.9, importance: "primary", colors: ["#1D232B", "#C8A17F"]
      }]
    }), undefined, PORTRAIT);
    expect(plan.palette.base).toContain("#2F6FB0");
    const names = plan.palette.options.map((option) => option.name);
    expect(names).toEqual(expect.arrayContaining(["纯白", "近黑"]));
  });
});
