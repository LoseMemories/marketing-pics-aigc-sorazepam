import type { MotionEffectDefinition } from "@/features/motion-effects/model/effect.types";

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface SubjectRegion {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  /** 主体价值分 0–100：低于 60 默认不选。 */
  score?: number;
  /** 沿主体外轮廓采样的归一化点，用于判断文字/动效是否压到主体。 */
  points?: NormalizedPoint[];
  importance?: "primary" | "secondary";
}

export interface SceneBackground {
  description: string;
  complexity: "clean" | "moderate" | "busy";
  textFriendly: boolean;
}

export interface SceneAnalysis {
  summary: string;
  subjects: string[];
  subjectRegions: SubjectRegion[];
  environment: string;
  background?: SceneBackground;
  dominantColors: string[];
  safeZones: NormalizedBox[];
  marketingTone: string[];
  risks: string[];
}

export interface CompositionSpec {
  version: 1;
  durationMs: number;
  layers: MotionEffectDefinition[];
}

export interface PlannedSubject {
  label: string;
  importance?: "primary" | "secondary";
  areaRatio: number;
  center: { x: number; y: number };
  colors?: string[];
}

/** 决策网格：按画面比例自适应 */
export interface DecisionGrid {
  cols: number;
  rows: number;
}

/** 文字承载区：单格，或连续非热格合并出来的一条横带 / 竖带 */
export interface AnchorSpan {
  id: string;
  label: string;
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
  heat: number;
  safe: number;
  score: number;
  /** 覆盖的决策格格数 */
  cells: number;
}

/** 单个决策格的评分明细 */
export interface HeatCell {
  col: number;
  row: number;
  score: number;
  heat: number;
  safe: number;
  counterX: number;
  counterY: number;
}

/** 分析阶段给出的文字安全区 */
export interface SafeZoneHint {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
  colors?: string[];
}

/** 一个配色候选 */
export interface PaletteSwatch {
  hex: string;
  name: string;
  source: "subject" | "image" | "derived" | "universal";
  contrast: number;
  hueGap: number | null;
  use: "headline" | "accent" | "support" | "any";
  note: string;
}

/** 新增特效的配色参考（最终由 L2 决定） */
export interface EffectPalette {
  backdrop: string;
  text: string;
  textContrast: number;
  /** 配色基调：主体色 + 画面前三主色 */
  base: string[];
  options: PaletteSwatch[];
  suggested: { headline: string; accent: string; support: string };
  avoid: string[];
  effectAnchors: string[];
  rationale: string;
}

/** L1 · 构图决策结果 */
export interface LayoutPlan {
  subjectCount: number;
  selection: "all" | "explicit" | "unmatched";
  areaRatio: number;
  scale: "small" | "medium" | "large";
  dominantRegion: string;
  /** 决策网格（按画面比例自适应） */
  grid: DecisionGrid;
  /** 画面宽高比 */
  frameRatio: number;
  /** 主文字承载区 */
  textAnchor: AnchorSpan;
  /** 收尾小字的承载区 */
  secondaryAnchor: AnchorSpan | null;
  textColumn: "left" | "center" | "right";
  freeColumn: { fromY: number; toY: number; freeRatio: number };
  /** 峰值热区 */
  peakHeat: number;
  /** 合并阈值 = 峰值 × 0.3 */
  mergeThreshold: number;
  strategy: "full-bleed" | "full-band" | "side-block" | "column-stack" | "edge-small" | "wrap-subject";
  headlineSizeRange: [number, number];
  rationale: string;
  designerBrief: string;
  subjects: PlannedSubject[];
  /** 与主文字区重叠最大的安全区 */
  safeZone: SafeZoneHint | null;
  /** 分析给出的全部安全区，连同 reason 一起交给 L2 */
  safeZones: SafeZoneHint[];
  /** 决策格评分，按总分从高到低 */
  candidates: HeatCell[];
  /** 新增特效的配色 */
  palette: EffectPalette;
}

/* ---------- L2 设计师：设计语汇层（不含坐标与毫秒） ---------- */

export type DesignBlockRole = "headline" | "subline" | "paragraph" | "meta" | "kicker";

export type DesignFont = "sans" | "serif" | "display" | "mono";

export type DesignText3D = "none" | "cylinder" | "cube";

export interface DesignAnchor {
  /** textAnchor / secondaryAnchor / safeZone:<i> / free */
  ref: string;
  /** 相对画幅短边的偏移百分比（-8 ~ 8） */
  dxPct: number;
  dyPct: number;
}

export interface DesignMotion {
  id: string;
  params: Record<string, number>;
  options: Record<string, string>;
}

export interface DesignBlock {
  id: string;
  role: DesignBlockRole;
  text: string;
  anchor: DesignAnchor;
  align: "left" | "center" | "right";
  sizeRatio: number;
  weight: number;
  tracking: number;
  lineHeight: number;
  font: DesignFont;
  transform: { scaleX: number; scaleY: number; rotateDeg: number; skewDeg: number };
  path: { fromDxPct: number; fromDyPct: number; fromScale: number; toScale: number };
  text3d: DesignText3D;
  occlude: boolean;
  enter: DesignMotion;
  idle?: DesignMotion;
}

export interface DesignEffect {
  id: string;
  anchor: DesignAnchor;
  colorRef: "accent" | "text" | "support" | string;
  params: Record<string, number>;
  options: Record<string, string>;
}

export interface DesignSpec {
  version: 1;
  concept: string;
  blocks: DesignBlock[];
  effects: DesignEffect[];
  palette: { text: string; accent?: string; support?: string };
  beats: { pace: "slow" | "medium" | "fast"; startMs: number };
}

export interface DesignIssue {
  path: string;
  message: string;
}

export interface DesignLayoutResult {
  design: DesignSpec;
  issues: DesignIssue[];
  hasCopySource: boolean;
  promptVersion: number;
}
