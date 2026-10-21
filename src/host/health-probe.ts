import { writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export interface HealthFailure {
  item: string;
  detail: string;
}

export interface HealthReport {
  at: number;
  ok: boolean;
  failures: HealthFailure[];
}

const HEALTH_FILE = join(homedir(), '.dsh', 'token-optima', 'health.json');

export class HealthProbe {
  private readonly failures = new Map<string, string>();
  private flushPending = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  fail(item: string, detail: string): void {
    if (this.failures.get(item) === detail) return;
    this.failures.set(item, detail);
    console.error(`[dsh-token-optima] interface drift: ${item} (${detail})`);
    this.scheduleFlush();
  }

  pass(item: string): void {
    if (!this.failures.has(item)) return;
    this.failures.delete(item);
    this.scheduleFlush();
  }

  checkSession(session: unknown): void {
    if (!session || typeof session !== 'object') return;
    const s = session as Record<string, unknown>;

    if (typeof s['eventAt'] !== 'function') {
      this.fail('session.eventAt', '不是函数，历史重放不可用');
    } else {
      this.pass('session.eventAt');
    }

    const surface = s['surface'] as Record<string, unknown> | undefined;
    if (!surface || !Array.isArray(surface['nodes'])) {
      this.fail('session.surface.nodes', '不是数组，surface 追踪不可用');
    } else {
      this.pass('session.surface.nodes');
    }
  }

  checkSessionsService(svc: unknown): void {
    if (!svc || typeof svc !== 'object') {
      this.fail('sessions 服务', '不存在');
      return;
    }
    const methods = ['list', 'all', 'entries', 'values'];
    const has = methods.some(
      (m) => typeof (svc as Record<string, unknown>)[m] === 'function',
    );
    if (!has) {
      this.fail('sessions 服务', '无可调方法（list/all/entries/values）');
    } else {
      this.pass('sessions 服务');
    }
  }

  checkEffortPolicy(ok: boolean, detail?: string): void {
    if (ok) this.pass('agent/request');
    else this.fail('agent/request', detail ?? '挂载失败');
  }

  snapshot(): HealthReport {
    return {
      at: Date.now(),
      ok: this.failures.size === 0,
      failures: [...this.failures.entries()].map(([item, detail]) => ({ item, detail })),
    };
  }

  /**
   * 异步 + 防抖写入：失败不阻塞主流程，同步 fail()/pass() 也不会卡事件循环。
   */
  private scheduleFlush(): void {
    if (this.flushPending) return;
    this.flushPending = true;
    this.flushTimer = setTimeout(() => {
      this.flushPending = false;
      this.flushTimer = null;
      void this.flush();
    }, 200);
    // 让 timer 不阻止进程退出
    this.flushTimer.unref?.();
  }

  private async flush(): Promise<void> {
    try {
      await mkdir(dirname(HEALTH_FILE), { recursive: true });
      await writeFile(
        HEALTH_FILE,
        JSON.stringify(this.snapshot(), null, 2),
        'utf8',
      );
    } catch {
      // 诊断文件，写失败不抛
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushPending = false;
  }
}