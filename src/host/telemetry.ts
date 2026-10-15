// 遥测：OTel 兼容接口，无外部 SDK 依赖，通过 sink 注入

export interface Span {
  name: string;
  attributes: Record<string, string | number | boolean>;
  end(): void;
}

export interface TelemetrySink {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
  recordMetric(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, attributes?: Record<string, string | number | boolean>): void;
}

export class NoopSink implements TelemetrySink {
  startSpan(name: string): Span {
    return { name, attributes: {}, end: () => undefined };
  }
  recordMetric(): void {}
  log(): void {}
}

export interface TelemetryOptions {
  /** 用户是否显式 opt-in */
  enabled: boolean;
  /** 默认关闭；启用时注入的 sink */
  sink?: TelemetrySink;
}

export class Telemetry {
  private readonly enabled: boolean;
  private readonly sink: TelemetrySink;

  constructor(options: TelemetryOptions) {
    this.enabled = options.enabled;
    this.sink = options.sink ?? new NoopSink();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    if (!this.enabled) return { name, attributes: {}, end: () => undefined };
    return this.sink.startSpan(name, attributes);
  }

  /**
   * 高基数治理：工具名、会话 ID 不放 metric label。
   * 只允许低基数、可聚合的属性。
   */
  recordMetric(name: string, value: number, attributes?: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;
    const safe = attributes ? filterLowCardinality(attributes) : undefined;
    this.sink.recordMetric(name, value, safe);
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, attributes?: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;
    this.sink.log(level, message, attributes);
  }
}

const HIGH_CARDINALITY_KEYS = new Set(['session_id', 'sessionId', 'tool', 'tool_name', 'turn_id', 'turnId']);

function filterLowCardinality(
  attrs: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (HIGH_CARDINALITY_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}