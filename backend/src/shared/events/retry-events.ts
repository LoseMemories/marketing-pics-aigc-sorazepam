/**
 * 重试队列状态事件。
 *
 * 队列状态只在内存里变（入队 / 开跑 / 完成 / 失败 / 采纳），
 * 图库页的「重试中」「需更新」标签需要跟着跳数，但不应触发重新查询列表。
 * 这里做一层进程内订阅：workflow 侧写，WebSocket 与 gallery 侧读。
 *
 * 放在 shared 下是为了避免 gallery ←→ workflow 互相 import 造成循环依赖。
 */
export interface RetryStateChange {
  /** 排队 + 运行中的重分析任务数 */
  retrying: number;
}

type Listener = (change: RetryStateChange) => void;

const listeners = new Set<Listener>();

/** 由 workflow 注册：返回当前排队/运行中的 `${category}/${base}` 列表。 */
let retryKeyProvider: (() => string[]) | null = null;
/** 由 workflow 注册：返回执行失败、仍保留在队列里的 `${category}/${base}` 列表。 */
let failedKeyProvider: (() => string[]) | null = null;

export function setRetryKeyProvider(provider: (() => string[]) | null): void {
  retryKeyProvider = provider;
}

export function setFailedKeyProvider(provider: (() => string[]) | null): void {
  failedKeyProvider = provider;
}

export function currentRetryKeys(): string[] {
  try {
    return retryKeyProvider?.() ?? [];
  } catch {
    return [];
  }
}

export function currentFailedKeys(): string[] {
  try {
    return failedKeyProvider?.() ?? [];
  } catch {
    return [];
  }
}

export function onRetryStateChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyRetryStateChange(change: RetryStateChange): void {
  for (const listener of listeners) {
    try {
      listener(change);
    } catch {
      /* 单个订阅者异常不影响其它订阅者 */
    }
  }
}
