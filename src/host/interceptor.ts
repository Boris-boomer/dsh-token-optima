// 请求拦截 + 来源标记 + 背压队列 + 可选 Worker 隔离 + 看门狗

import type { ClassifiedRequest, SourceSegment } from '../core/types.js';

/* ---------------- 请求分类 ---------------- */

export interface RawChatMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  /** 是否为历史回传的 reasoning_content */
  reasoning_content?: string | null;
}

export interface RawTool {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

export interface RawRequest {
  model: string;
  messages: RawChatMessage[];
  tools?: RawTool[];
  /** 宿主已将 system prompt 分离出来 */
  systemPrompt?: string;
  /** AGENTS.md 链（按层级顺序） */
  agentsMd?: string[];
  /** 技能目录 */
  skills?: string[];
  /** MCP 工具描述 */
  mcpTools?: RawTool[];
  /** 额外注入的上下文 */
  injectedContext?: string[];
}

export function classifyRequest(req: RawRequest, hashOf: (s: string) => string): ClassifiedRequest {
  const segments: SourceSegment[] = [];

  if (req.systemPrompt) {
    segments.push({ source: 'system', text: req.systemPrompt });
  }
  if (req.tools && req.tools.length > 0) {
    segments.push({
      source: 'tools_schema',
      text: JSON.stringify(req.tools),
    });
  }
  if (req.mcpTools && req.mcpTools.length > 0) {
    segments.push({
      source: 'mcp_tools',
      text: JSON.stringify(req.mcpTools),
    });
  }
  if (req.agentsMd && req.agentsMd.length > 0) {
    segments.push({ source: 'agents_md', text: req.agentsMd.join('\n\n') });
  }
  if (req.skills && req.skills.length > 0) {
    segments.push({ source: 'skills', text: req.skills.join('\n\n') });
  }
  if (req.injectedContext && req.injectedContext.length > 0) {
    segments.push({
      source: 'injected_ctx',
      text: req.injectedContext.join('\n\n'),
    });
  }

  for (const msg of req.messages) {
    const content = msg.content ?? '';
    if (msg.role === 'user') {
      segments.push({ source: 'user_msg', text: content });
    } else if (msg.role === 'assistant') {
      if (msg.reasoning_content) {
        segments.push({
          source: 'assistant_msg',
          text: msg.reasoning_content,
          isReasoning: true,
        });
      }
      if (content) {
        segments.push({ source: 'assistant_msg', text: content });
      }
    } else if (msg.role === 'tool') {
      segments.push({ source: 'tool_result', text: content });
    } else if (msg.role === 'system' && content) {
      segments.push({ source: 'system', text: content });
    }
  }

  const hasTools = Boolean((req.tools && req.tools.length > 0) || (req.mcpTools && req.mcpTools.length > 0));
  const systemPromptHash = hashOf(req.systemPrompt ?? '');
  const toolsSchemaHash = hashOf(JSON.stringify(req.tools ?? []));

  return {
    model: req.model,
    segments,
    hasTools,
    systemPromptHash,
    toolsSchemaHash,
  };
}

/* ---------------- 背压队列 ---------------- */

export interface QueueOptions {
  /** 最大并发任务数 */
  concurrency?: number;
  /** 队列上限，超过则丢弃最旧任务（保证请求路径不阻塞） */
  maxSize?: number;
  /** 单任务超时（毫秒），超时视为失败 */
  taskTimeoutMs?: number;
  onError?: (err: Error, task: unknown) => void;
}

interface QueueItem<T> {
  task: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  enqueuedAt: number;
}

export class BackpressureQueue {
  private readonly concurrency: number;
  private readonly maxSize: number;
  private readonly taskTimeoutMs: number;
  private readonly onError: ((err: Error, task: unknown) => void) | null;
  private readonly items: QueueItem<unknown>[] = [];
  private running = 0;
  private stopped = false;

  constructor(options: QueueOptions = {}) {
    this.concurrency = options.concurrency ?? 2;
    this.maxSize = options.maxSize ?? 100;
    this.taskTimeoutMs = options.taskTimeoutMs ?? 10_000;
    this.onError = options.onError ?? null;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    if (this.stopped) {
      return Promise.reject(new Error('queue stopped'));
    }
    if (this.items.length >= this.maxSize) {
      // 背压：丢弃最旧
      const dropped = this.items.shift();
      if (dropped) dropped.reject(new Error('queue overflow'));
    }
    return new Promise<T>((resolve, reject) => {
      this.items.push({
        task,
        resolve: resolve as (v: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    while (!this.stopped && this.running < this.concurrency && this.items.length > 0) {
      const item = this.items.shift();
      if (!item) return;
      this.running++;
      void this.execute(item).finally(() => {
        this.running--;
        void this.drain();
      });
    }
  }

  private async execute(item: QueueItem<unknown>): Promise<void> {
    try {
      const result = await Promise.race([
        item.task(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`task timeout after ${this.taskTimeoutMs}ms`)),
            this.taskTimeoutMs,
          ),
        ),
      ]);
      item.resolve(result);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.onError?.(e, item.task);
      item.reject(e);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const it of this.items) it.reject(new Error('queue stopped'));
    this.items.length = 0;
  }

  size(): number {
    return this.items.length;
  }
}

/* ---------------- 看门狗 + 熔断 ---------------- */

export interface WatchdogOptions {
  /** 初始化超时（毫秒） */
  initTimeoutMs?: number;
  /** 连续失败多少次触发熔断 */
  failureThreshold?: number;
  /** 熔断持续时长（毫秒） */
  cooldownMs?: number;
}

export type WatchdogState = 'ok' | 'tripped' | 'cooldown';

export class Watchdog {
  private failures = 0;
  private state: WatchdogState = 'ok';
  private trippedAt = 0;
  private readonly opts: Required<WatchdogOptions>;
  private readonly onTrip: ((reason: string) => void) | null;

  constructor(options: WatchdogOptions = {}, onTrip?: (reason: string) => void) {
    this.opts = {
      initTimeoutMs: options.initTimeoutMs ?? 5000,
      failureThreshold: options.failureThreshold ?? 3,
      cooldownMs: options.cooldownMs ?? 60_000,
    };
    this.onTrip = onTrip ?? null;
  }

  recordSuccess(): void {
    this.failures = 0;
    if (this.state === 'cooldown') this.state = 'ok';
  }

  recordFailure(reason: string): void {
    this.failures++;
    if (this.failures >= this.opts.failureThreshold && this.state !== 'tripped') {
      this.state = 'tripped';
      this.trippedAt = Date.now();
      this.onTrip?.(reason);
    }
  }

  canRun(): boolean {
    if (this.state === 'ok') return true;
    if (this.state === 'tripped') {
      if (Date.now() - this.trippedAt > this.opts.cooldownMs) {
        this.state = 'cooldown';
        return true;
      }
      return false;
    }
    // cooldown：允许试探性运行
    return true;
  }

  getState(): WatchdogState {
    return this.state;
  }

  /** 初始化守卫：超时视为失败 */
  async guardInit<T>(init: () => Promise<T>): Promise<T | null> {
    try {
      return await Promise.race([
        init(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`init timeout after ${this.opts.initTimeoutMs}ms`)),
            this.opts.initTimeoutMs,
          ),
        ),
      ]);
    } catch (err) {
      this.recordFailure(`init failed: ${(err as Error).message}`);
      return null;
    }
  }
}