import type {
  EffectTimeline,
  MotionEffectSample,
  SubjectMaskRegion,
  TextRole
} from "@/features/motion-effects/model/effect.types";
import type {
  CanvasBackingSize,
  CanvasContentRect,
  CanvasMediaSize
} from "../model/canvas.types";

/** 把 #RRGGBB 转成带透明度的 rgba；非十六进制时退回白色。 */
function glowColor(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match?.[1]) return `rgba(255, 255, 255, ${alpha})`;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** 确定性伪随机：同一 index 永远得到同一个 0–1 值，避免光斑每帧乱跳。 */
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function calculateCanvasBackingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): CanvasBackingSize {
  const pixelRatio = Math.max(1, Math.min(devicePixelRatio, 3));
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * pixelRatio)),
    pixelHeight: Math.max(1, Math.round(cssHeight * pixelRatio)),
    pixelRatio
  };
}

export function calculateContainedContentRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
): CanvasContentRect {
  if (containerWidth <= 0 || containerHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height
  };
}

interface RoleStyle {
  size: number;
  weight: number;
  tracking: number;
  align: "left" | "center" | "right";
}

const ROLE_STYLES: Record<TextRole, RoleStyle> = {
  headline: { size: 0.105, weight: 800, tracking: -0.03, align: "left" },
  subline: { size: 0.042, weight: 400, tracking: 0, align: "left" },
  paragraph: { size: 0.032, weight: 400, tracking: 0.01, align: "left" },
  meta: { size: 0.03, weight: 500, tracking: 0.12, align: "left" },
  kicker: { size: 0.026, weight: 600, tracking: 0.2, align: "left" }
};

/** 字体族：L2 只给语义名，具体 stack 在这里定。 */
const FONT_STACKS: Record<string, string> = {
  sans: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
  serif: '"Songti SC", "Noto Serif CJK SC", Georgia, serif',
  display: '"PingFang SC", "Helvetica Neue", Impact, system-ui, sans-serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
};

/** 贴图图标：用 emoji 当低成本的矢量贴图。 */
const GLYPHS: Record<string, string> = { finger: "👆", bulb: "💡", arrow: "➤" };

export interface RenderOptions {
  /** 主体避让多边形，用于"文字从人物后方出现"的遮挡。 */
  subjectRegions?: readonly SubjectMaskRegion[];
}

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private size: CanvasBackingSize = calculateCanvasBackingSize(1, 1, 1);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D Canvas is unavailable");
    this.context = context;
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    this.size = calculateCanvasBackingSize(cssWidth, cssHeight, devicePixelRatio);
    this.canvas.width = this.size.pixelWidth;
    this.canvas.height = this.size.pixelHeight;
    this.canvas.style.width = `${this.size.cssWidth}px`;
    this.canvas.style.height = `${this.size.cssHeight}px`;
  }

  render(
    timeMs: number,
    timeline: EffectTimeline,
    media: CanvasMediaSize,
    mode: "snapshot" | "timeline",
    options: RenderOptions = {}
  ): void {
    const { cssWidth, cssHeight, pixelRatio } = this.size;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.context.clearRect(0, 0, cssWidth, cssHeight);
    const content = calculateContainedContentRect(cssWidth, cssHeight, media.width, media.height);
    if (content.width === 0 || content.height === 0) return;

    this.context.save();
    this.context.beginPath();
    this.context.rect(content.x, content.y, content.width, content.height);
    this.context.clip();
    this.context.translate(content.x, content.y);
    const effects = mode === "snapshot" ? timeline.snapshot() : timeline.sample(timeMs);
    for (const effect of effects) {
      this.drawEffect(effect, content.width, content.height, options);
    }
    this.context.restore();
  }

  destroy(): void {
    this.context.clearRect(0, 0, this.size.cssWidth, this.size.cssHeight);
  }

  private drawEffect(
    effect: MotionEffectSample,
    width: number,
    height: number,
    options: RenderOptions
  ): void {
    const x = effect.x * width;
    const y = effect.y * height;
    if (effect.kind === "pulse") {
      this.context.save();
      this.context.globalAlpha = Math.max(0, Math.min(1, effect.progress / 0.2, (1 - effect.progress) / 0.2));
      this.drawPulseEffect(effect, x, y, width, height, options);
      this.context.restore();
      return;
    }
    this.drawTextEffect(effect, x, y, width, height, options);
  }

  private drawTextEffect(
    effect: MotionEffectSample,
    x: number,
    y: number,
    width: number,
    height: number,
    options: RenderOptions
  ): void {
    const text = effect.text ?? "";
    if (!text) return;

    const unit = Math.min(width, height);
    const role = effect.role ?? "headline";
    const style = ROLE_STYLES[role];
    const fontSize = Math.max(10, (effect.size ?? style.size) * unit);
    const weight = effect.weight ?? style.weight;
    const tracking = effect.tracking ?? style.tracking;
    const align = effect.align ?? style.align;
    const enter = effect.enterProgress;
    const elapsed = effect.elapsedMs;

    const idle = effect.idle;
    const idleOffsetY = idle?.type === "float-y"
      ? Math.sin(((elapsed % (idle.periodMs ?? 2600)) / (idle.periodMs ?? 2600)) * Math.PI * 2) *
        (idle.amplitude ?? 0.005) * height
      : 0;
    const idleScale = idle?.type === "breathe"
      ? 1 + Math.sin(((elapsed % (idle.periodMs ?? 2000)) / (idle.periodMs ?? 2000)) * Math.PI * 2) *
        (idle.amplitude ?? 0.03)
      : 1;

    this.context.save();
    const fontStack = FONT_STACKS[effect.font ?? (role === "headline" ? "display" : "sans")] ?? FONT_STACKS.sans;
    this.context.font = `${weight} ${fontSize}px ${fontStack}`;
    this.context.textBaseline = "middle";
    this.context.textAlign = align;
    this.context.fillStyle = effect.color;
    this.context.shadowColor = "rgba(0, 0, 0, 0.42)";
    this.context.shadowBlur = Math.max(4, fontSize * 0.18);

    const letterSpacing = tracking * fontSize;
    if ("letterSpacing" in this.context) {
      (this.context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${letterSpacing}px`;
    }

    // 入场变换
    const enterType = effect.enter?.type ?? (effect.animation === "slide-up" ? "slide-up" : "fade");
    let translateX = 0;
    let translateY = 0;
    let scaleY = 1;
    let scaleX = 1;
    let alpha = 1;
    let revealRatio: number | null = null;
    const travel = unit * 0.06;

    // 路线样式：起点偏移与缩放（L3 已把百分比换成画幅比例）
    const from = effect.enter?.from;
    if (from) {
      translateX += (1 - enter) * from.dx * width;
      translateY += (1 - enter) * from.dy * height;
      const fromScale = from.scale + (1 - from.scale) * enter;
      scaleX *= fromScale;
      scaleY *= fromScale;
    }
    if (typeof effect.enter?.toScale === "number" && effect.enter.toScale !== 1) {
      const toScale = effect.enter.toScale;
      scaleX *= toScale;
      scaleY *= toScale;
    }

    switch (enterType) {
      case "slide-up":
        translateY += (1 - enter) * travel;
        break;
      case "slide-left":
        translateX += (1 - enter) * travel;
        break;
      case "slide-right":
        translateX -= (1 - enter) * travel;
        break;
      case "mask-reveal":
        revealRatio = enter;
        break;
      case "rise":
        scaleY *= 0.24 + 0.76 * enter;
        translateY += (1 - enter) * unit * 0.035;
        break;
      case "stand-up-3d": {
        // 2D→3D：纵向立起 + 横向透视压缩，收尾时轻微回弹
        const perspective = ((effect.enter?.perspectiveDeg ?? 28) * Math.PI) / 180;
        const ease = 1 - Math.pow(1 - enter, 3);
        scaleY *= 0.12 + 0.88 * ease;
        scaleX *= 1 - 0.35 * Math.sin(perspective) * (1 - ease);
        translateY += (1 - ease) * unit * 0.045;
        break;
      }
      case "through":
        translateX -= (1 - enter) * width * 0.7;
        break;
      case "fade-in-place":
        break;
      default:
        break;
    }

    // fade / fade-in-place / 其余过渡都用透明度收尾
    if (enterType === "fade" || enterType === "fade-in-place") {
      alpha = enter;
    } else if (enterType !== "mask-reveal") {
      alpha = Math.min(1, enter * 1.8);
    }

    this.context.globalAlpha = Math.max(0, Math.min(1, alpha * idleScale));
    this.context.translate(x + translateX, y + translateY + idleOffsetY);

    // 变形 schema：缩放 / 旋转 / 斜切
    const transform = effect.transform;
    if (transform) {
      if (transform.rotateDeg) this.context.rotate((transform.rotateDeg * Math.PI) / 180);
      if (transform.skewDeg) this.context.transform(1, 0, Math.tan((transform.skewDeg * Math.PI) / 180), 1, 0, 0);
      this.context.scale(transform.scaleX, transform.scaleY);
    }

    if (scaleX !== 1 || scaleY !== 1) {
      this.context.scale(scaleX, scaleY);
    }
    if (revealRatio !== null) {
      // 自下而上揭示
      const clipHeight = fontSize * 1.5 * revealRatio;
      this.context.beginPath();
      this.context.rect(-width, fontSize * 0.75 - clipHeight, width * 2, clipHeight);
      this.context.clip();
    }

    if (effect.text3d === "cube" || effect.text3d === "cylinder") {
      this.drawText3D(text, role, fontSize, weight, effect.text3d);
    } else {
      this.drawWrappedText(text, role, fontSize, weight);
    }

    this.context.restore();

    if (effect.occlude && options.subjectRegions?.length) {
      this.blendTextIntoSubjects(options.subjectRegions, width, height);
    }
  }

  /** subline / paragraph 允许多行；其余角色单行。 */
  private drawWrappedText(text: string, role: TextRole, fontSize: number, weight: number): void {
    const multiline = role === "subline" || role === "paragraph";
    const lines = multiline ? text.split(/\n/) : [text];
    const lineHeight = fontSize * (multiline ? 1.5 : 1.08);
    const startY = -((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      this.context.fillText(
        line,
        0,
        startY + index * lineHeight
      );
    });
    this.context.font = `${weight} ${fontSize}px "PingFang SC", system-ui, sans-serif`;
  }

  /**
   * 文字与主体重叠：不是把字整块挖掉（会缺角、掉字），而是在重叠区用「饱和度渐变」
   * 把字稀释（destination-out 从 6% 渐变到 52% 再回到 6%），于是：
   * 未重叠→重叠→未重叠的文字从实到半透再到实，主体保留颜色与结构，字也完整可读。
   */
  private blendTextIntoSubjects(
    regions: readonly SubjectMaskRegion[],
    width: number,
    height: number
  ): void {
    const context = this.context;
    for (const region of regions) {
      const points = region.points;
      if (!points || points.length < 3) continue;

      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;
      for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
      if (maxX <= minX || maxY <= minY) continue;

      context.save();
      context.beginPath();
      points.forEach((point, index) => {
        const px = point.x * width;
        const py = point.y * height;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.closePath();
      context.clip();

      context.globalCompositeOperation = "destination-out";
      // 渐变向两侧各外扩 8%，保证进入/离开重叠区时是平滑的，不会出现硬边
      const padX = (maxX - minX) * 0.08 * width;
      const padY = (maxY - minY) * 0.08 * height;
      const gradient = context.createLinearGradient(
        minX * width - padX,
        minY * height - padY,
        maxX * width + padX,
        maxY * height + padY
      );
      gradient.addColorStop(0, "rgba(0, 0, 0, 0.06)");
      gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.52)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0.06)");
      context.fillStyle = gradient;
      context.fillRect(minX * width - padX, minY * height - padY, (maxX - minX) * width + padX * 2, (maxY - minY) * height + padY * 2);
      context.restore();
    }
  }

  /** 3D 文字质感：cube = 错位阴影挤出；cylinder = 弧面明暗渐变。 */
  private drawText3D(
    text: string,
    role: TextRole,
    fontSize: number,
    weight: number,
    mode: "cube" | "cylinder"
  ): void {
    const context = this.context;
    const multiline = role === "subline" || role === "paragraph";
    const lines = multiline ? text.split(/\n/) : [text];
    const lineHeight = fontSize * (multiline ? 1.5 : 1.08);
    const startY = -((lines.length - 1) * lineHeight) / 2;
    const baseColor = String(context.fillStyle);

    if (mode === "cube") {
      for (let depth = 4; depth >= 1; depth -= 1) {
        context.save();
        context.globalAlpha *= 0.16;
        context.fillStyle = "#05070a";
        context.translate(depth * fontSize * 0.022, depth * fontSize * 0.022);
        lines.forEach((line, index) => context.fillText(line, 0, startY + index * lineHeight));
        context.restore();
      }
      context.fillStyle = baseColor;
      context.font = `${weight} ${fontSize}px ${context.font.split("px ")[1] ?? "sans-serif"}`;
      lines.forEach((line, index) => context.fillText(line, 0, startY + index * lineHeight));
      return;
    }

    lines.forEach((line, index) => context.fillText(line, 0, startY + index * lineHeight));
    const measured = context.measureText(text).width || fontSize * [...text].length;
    const originX =
      context.textAlign === "center" ? -measured / 2 : context.textAlign === "right" ? -measured : 0;
    context.save();
    context.globalCompositeOperation = "source-atop";
    const gradient = context.createLinearGradient(originX, 0, originX + measured, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0.5)");
    gradient.addColorStop(0.32, "rgba(255,255,255,0.28)");
    gradient.addColorStop(0.58, "rgba(0,0,0,0.06)");
    gradient.addColorStop(1, "rgba(0,0,0,0.55)");
    context.fillStyle = gradient;
    context.fillRect(originX, -fontSize, measured, fontSize * 2);
    context.restore();
  }

  private drawPulseEffect(
    effect: MotionEffectSample,
    x: number,
    y: number,
    width: number,
    height: number,
    options: RenderOptions = {}
  ): void {
    const context = this.context;
    const unit = Math.min(width, height);
    const animation = effect.animation ?? "breathe";
    const params = effect.params ?? {};
    const elapsed = effect.elapsedMs;
    // 静态封面：所有效果画成「最终形态」，只有长按播放才动。
    const isStatic = effect.staticFrame === true;
    if (animation === "sweep") {
      const sweepWidth = width * 0.32;
      const gradient = this.context.createLinearGradient(x - sweepWidth / 2, y, x + sweepWidth / 2, y);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.5, effect.color);
      gradient.addColorStop(1, "transparent");
      this.context.fillStyle = gradient;
      this.context.fillRect(x - sweepWidth / 2, y - unit * 0.008, sweepWidth, unit * 0.016);
      return;
    }
    if (animation === "drift") {
      const seed = [...effect.id].reduce((total, character) => total + character.charCodeAt(0), 0);
      for (let index = 0; index < 9; index += 1) {
        const angle = ((seed + index * 47) % 360) * Math.PI / 180;
        const distance = unit * (0.025 + ((seed + index * 23) % 70) / 1000);
        const drift = unit * effect.progress * 0.04;
        const radius = unit * (0.004 + ((seed + index * 11) % 10) / 1800);
        this.context.beginPath();
        this.context.arc(
          x + Math.cos(angle) * distance + drift,
          y + Math.sin(angle) * distance - drift,
          radius,
          0,
          Math.PI * 2
        );
        this.context.fill();
      }
      return;
    }
    // ---- 呼吸圆点：大小 / 颜色 / 周期 / 呼吸范围全由参数控制 ----
    if (animation === "dot") {
      const base = unit * ((params.sizePct ?? 2.4) / 100);
      const minScale = params.minScale ?? 0.7;
      const maxScale = params.maxScale ?? 1.5;
      const period = Math.max(200, params.periodMs ?? 2000);
      const wave = Math.sin(((elapsed % period) / period) * Math.PI * 2);
      const phase = isStatic ? 1 : (wave + 1) / 2;
      const radius = Math.max(0.6, base * (minScale + (maxScale - minScale) * phase));
      context.globalAlpha *= params.opacity ?? 0.55;
      context.fillStyle = effect.color;
      context.shadowColor = effect.color;
      context.shadowBlur = radius * 1.8;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha *= 0.35;
      context.strokeStyle = effect.color;
      context.lineWidth = Math.max(1, base * 0.16);
      context.beginPath();
      context.arc(x, y, radius * 1.9, 0, Math.PI * 2);
      context.stroke();
      return;
    }

    // ---- 主体描边：涂鸦实线/虚线，逐步划线 / 闪烁 ----
    if (animation === "outline") {
      const regions = options.subjectRegions ?? [];
      if (regions.length === 0) return;
      const lineWidth = Math.max(1.2, unit * ((params.widthPct ?? 0.5) / 100));
      const jitter = unit * ((params.jitterPct ?? 0.3) / 100);
      const period = Math.max(200, params.durationMs ?? 1400);
      const cycle = (elapsed % period) / period;
      const blink = effect.mode === "blink";
      context.globalAlpha *=
        (params.opacity ?? 0.75) * (blink && !isStatic ? 0.35 + 0.65 * Math.abs(Math.sin(cycle * Math.PI)) : 1);
      context.strokeStyle = effect.color;
      context.lineWidth = lineWidth;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.setLineDash(effect.style === "spray-dashed" ? [lineWidth * 3, lineWidth * 2.4] : []);
      for (const region of regions) {
        const points = region.points;
        if (!points || points.length < 3) continue;
        const total = points.length;
        const drawn = isStatic || blink ? total : Math.max(2, Math.ceil(total * Math.min(1, cycle * 1.2)));
        context.beginPath();
        for (let index = 0; index < drawn; index += 1) {
          const point = points[index % total];
          if (!point) continue;
          const noise = Math.sin(index * 12.9898) * 43758.5453;
          const nx = noise - Math.floor(noise) - 0.5;
          const ny = noise * 1.7 - Math.floor(noise * 1.7) - 0.5;
          const px = point.x * width + nx * jitter;
          const py = point.y * height + ny * jitter;
          if (index === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        if (blink) context.closePath();
        context.stroke();
      }
      context.setLineDash([]);
      return;
    }

    // ---- 贴图图标：小范围摆动指向对象 ----
    if (animation === "marker") {
      const size = unit * ((params.sizePct ?? 4.5) / 100);
      const orbit = unit * ((params.orbitPct ?? 1.4) / 100);
      const period = Math.max(400, params.periodMs ?? 1800);
      const phase = isStatic ? 0 : Math.sin(((elapsed % period) / period) * Math.PI * 2);
      context.globalAlpha *= params.opacity ?? 0.9;
      context.font = `${Math.max(10, size)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = effect.color;
      context.fillText(GLYPHS[effect.glyph ?? "finger"] ?? "👆", x + phase * orbit, y + Math.abs(phase) * orbit * 0.45);
      return;
    }

    // ---- 镭射蒙层：整幅彩虹渐变缓慢流动 ----
    if (animation === "laser") {
      const spread = params.hueSpreadDeg ?? 140;
      const period = Math.max(600, params.periodMs ?? 4200);
      const hue = isStatic ? 210 : (((elapsed % period) / period) * 360) % 360;
      const gradient = context.createLinearGradient(0, 0, width, height);
      for (let index = 0; index <= 4; index += 1) {
        gradient.addColorStop(index / 4, `hsl(${(hue + (spread * index) / 4) % 360} 100% 62%)`);
      }
      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha *= params.opacity ?? 0.14;
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.restore();
      return;
    }

    // ---- 光斑蒙层：阳光透过树叶 / 散景光斑 / 斜射光束 ----
    if (animation === "glow") {
      const pattern = effect.pattern ?? "dapple";
      const count = Math.max(1, Math.round(params.blobCount ?? 6));
      const base = unit * ((params.sizePct ?? 13) / 100);
      const drift = (unit * (params.driftPct ?? 2)) / 100;
      const softness = Math.min(0.95, Math.max(0.25, params.softness ?? 0.7));
      const period = 7200;
      const phase = isStatic ? 0 : ((elapsed % period) / period) * Math.PI * 2;

      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha *= params.opacity ?? 0.3;

      if (pattern === "beam") {
        // 斜射光束：3 道倾斜的线性高光
        for (let index = 0; index < 3; index += 1) {
          const offset = (index - 1) * width * 0.24 + Math.sin(phase + index) * drift;
          const beamWidth = unit * 0.16;
          const gradient = context.createLinearGradient(
            offset - beamWidth,
            0,
            offset + beamWidth,
            height
          );
          gradient.addColorStop(0, "transparent");
          gradient.addColorStop(0.5, glowColor(effect.color, 0.9));
          gradient.addColorStop(1, "transparent");
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
        }
        context.restore();
        return;
      }

      for (let index = 0; index < count; index += 1) {
        const seed = pseudoRandom(index * 7 + 1);
        const seed2 = pseudoRandom(index * 13 + 5);
        const radius = base * (0.55 + seed2 * 0.9);
        const centerX = width * (0.08 + seed * 0.84) + Math.sin(phase + seed * 6.28) * drift;
        const centerY = height * (0.08 + seed2 * 0.84) + Math.cos(phase + seed2 * 6.28) * drift;
        const gradient = context.createRadialGradient(centerX, centerY, radius * 0.06, centerX, centerY, radius);
        gradient.addColorStop(0, glowColor(effect.color, 0.85));
        gradient.addColorStop(softness, glowColor(effect.color, 0.34));
        gradient.addColorStop(1, "transparent");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        if (pattern === "bokeh") {
          context.arc(centerX, centerY, radius * 0.86, 0, Math.PI * 2, true);
        }
        context.fill();
      }
      context.restore();
      return;
    }

    // ---- 柔光变换：整幅被一层柔和光晕包住 ----
    if (animation === "soft") {
      const radius = unit * Math.max(0.2, (params.radiusPct ?? 60) / 100);
      const warmth = (params.warmthPct ?? 60) / 100;
      const tint = warmth > 0.5 ? "255, 226, 186" : "206, 228, 255";
      const gradient = context.createRadialGradient(
        width / 2,
        height * 0.45,
        radius * 0.12,
        width / 2,
        height * 0.45,
        radius
      );
      gradient.addColorStop(0, `rgba(${tint}, 0.85)`);
      gradient.addColorStop(0.55, `rgba(${tint}, 0.38)`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha *= params.opacity ?? 0.26;
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.restore();
      return;
    }

    // ---- 一次频闪：极短的亮闪，把注意力拉回画面 ----
    if (animation === "strobe") {
      const period = Math.max(400, params.periodMs ?? 1600);
      const flashes = Math.max(1, Math.round(params.flashes ?? 2));
      const duty = Math.min(0.4, Math.max(0.03, (params.dutyPct ?? 12) / 100));
      const slot = ((elapsed % period) / period) * flashes;
      const fraction = slot - Math.floor(slot);
      const intensity = isStatic ? 0.7 : fraction < duty ? Math.sin((fraction / duty) * Math.PI) : 0;
      if (intensity > 0.001) {
        context.save();
        context.globalAlpha *= (params.opacity ?? 0.42) * intensity;
        context.fillStyle = effect.color;
        context.fillRect(0, 0, width, height);
        context.restore();
      }
      return;
    }

    const radius = unit * (0.025 + effect.progress * 0.045);
    context.globalAlpha *= params.opacity ?? 0.6;
    context.shadowColor = effect.color;
    context.shadowBlur = radius * 1.3;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}
