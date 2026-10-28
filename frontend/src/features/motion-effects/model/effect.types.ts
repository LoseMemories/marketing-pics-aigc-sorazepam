export type MotionEffectKind = "text" | "pulse";

export type MotionEffectAnimation =
  | "fade"
  | "slide-up"
  | "slide-left"
  | "slide-right"
  | "breathe"
  | "drift"
  | "sweep"
  | "dot"
  | "outline"
  | "marker"
  | "laser"
  | "glow"
  | "soft"
  | "strobe";

export type TextRole = "headline" | "subline" | "paragraph" | "meta" | "kicker";

export type EnterType =
  | "fade"
  | "fade-in-place"
  | "slide-up"
  | "slide-left"
  | "slide-right"
  | "mask-reveal"
  | "rise"
  | "stand-up-3d"
  | "through";

export type EnterEase = "linear" | "outCubic" | "outQuint" | "inOutSine";

export type IdleType = "float-y" | "breathe" | "glow-pulse";

export type TextFont = "sans" | "serif" | "display" | "mono";

export type Text3D = "none" | "cylinder" | "cube";

export interface TextTransform {
  scaleX: number;
  scaleY: number;
  rotateDeg: number;
  skewDeg: number;
}

export interface EnterSpec {
  type: EnterType;
  startMs: number;
  durationMs: number;
  ease?: EnterEase;
  /** 起点相对终点的位移（画幅比例）与缩放。 */
  from?: { dx: number; dy: number; scale: number };
  toScale?: number;
  /** stand-up-3d 的透视角度。 */
  perspectiveDeg?: number;
}

export interface IdleSpec {
  type: IdleType;
  amplitude?: number;
  periodMs?: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface MotionEffectDefinition {
  id: string;
  kind: MotionEffectKind;
  animation?: MotionEffectAnimation;
  /** 排版层级，决定字号/字重/对齐。 */
  role?: TextRole;
  /** 字号，相对画幅短边。 */
  size?: number;
  weight?: number;
  tracking?: number;
  align?: "left" | "center" | "right";
  /** 文字被主体遮挡（从人物后方出现）。 */
  occlude?: boolean;
  font?: TextFont;
  text3d?: Text3D;
  transform?: TextTransform;
  /** 脉冲/图形层参数（呼吸点、描边、图标、镭射）。 */
  params?: Record<string, number>;
  /** outline：solid / dashed */
  style?: string;
  /** outline：draw-on / blink */
  mode?: string;
  /** marker：finger / bulb / arrow */
  glyph?: string;
  /** glow-mask：dapple / bokeh / beam */
  pattern?: string;
  enter?: EnterSpec;
  idle?: IdleSpec;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  color: string;
  text?: string;
}

export interface MotionEffectSample extends MotionEffectDefinition {
  progress: number;
  elapsedMs: number;
  /** 入场进度 0–1。 */
  enterProgress: number;
  /** 静态封面（未播放）：所有效果画成「最终形态」。 */
  staticFrame?: boolean;
}

export interface EffectTimeline {
  readonly durationMs: number;
  sample(timeMs: number): readonly MotionEffectSample[];
  snapshot(): readonly MotionEffectSample[];
}

export interface SubjectMaskRegion {
  points?: readonly NormalizedPoint[];
}
