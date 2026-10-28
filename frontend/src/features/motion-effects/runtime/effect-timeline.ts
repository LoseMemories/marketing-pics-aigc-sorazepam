import type {
  EffectTimeline,
  EnterEase,
  MotionEffectDefinition,
  MotionEffectSample
} from "../model/effect.types";

const EASING: Record<EnterEase, (value: number) => number> = {
  linear: (value) => value,
  outCubic: (value) => 1 - (1 - value) ** 3,
  outQuint: (value) => 1 - (1 - value) ** 5,
  inOutSine: (value) => -(Math.cos(Math.PI * value) - 1) / 2
};

/** 入场进度：优先用 enter 定义，否则回退到旧的整段 progress 前 25%。 */
function enterProgressOf(effect: MotionEffectDefinition, timeMs: number, progress: number): number {
  if (!effect.enter) return Math.min(1, Math.max(0, progress / 0.25));
  const elapsed = timeMs - effect.enter.startMs;
  const raw = effect.enter.durationMs <= 0 ? 1 : elapsed / effect.enter.durationMs;
  const clamped = Math.min(1, Math.max(0, raw));
  return EASING[effect.enter.ease ?? "outCubic"](clamped);
}

export function createEffectTimeline(
  effects: readonly MotionEffectDefinition[],
  durationMs: number
): EffectTimeline {
  const ordered = [...effects].sort((left, right) => left.startMs - right.startMs);
  return {
    durationMs,
    snapshot(): readonly MotionEffectSample[] {
      // 静态封面 = 所有效果的最终形态：描边画满、文字全部显示、滤镜全部铺开。
      return ordered.map((effect) => ({
        ...effect,
        progress: 0.55,
        elapsedMs: effect.startMs,
        enterProgress: 1,
        staticFrame: true
      }));
    },
    sample(timeMs: number): readonly MotionEffectSample[] {
      const boundedTime = Math.max(0, Math.min(timeMs, durationMs));
      return ordered
        .filter((effect) => boundedTime >= effect.startMs && boundedTime <= effect.endMs)
        .map((effect) => {
          const progress =
            effect.endMs === effect.startMs
              ? 1
              : (boundedTime - effect.startMs) / (effect.endMs - effect.startMs);
          return {
            ...effect,
            progress,
            elapsedMs: boundedTime - effect.startMs,
            enterProgress: enterProgressOf(effect, boundedTime, progress)
          };
        });
    }
  };
}

export const emptyEffectTimeline = createEffectTimeline([], 0);
