import { describe, expect, it } from 'vitest';
import { BackpressureQueue, Watchdog, classifyRequest } from '../src/host/interceptor.js';
import { BudgetTracker } from '../src/core/budget.js';
import { decideEffort, extractSignals } from '../src/core/effort.js';
import { ReasoningTracker } from '../src/core/reasoning.js';

describe('背压队列', () => {
  it('并发限制生效', async () => {
    const q = new BackpressureQueue({ concurrency: 2 });
    let running = 0;
    let maxRunning = 0;
    const tasks = Array.from({ length: 6 }, (_, i) =>
      q.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return i;
      }),
    );
    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('超时任务被拒绝', async () => {
    const q = new BackpressureQueue({ concurrency: 1, taskTimeoutMs: 10 });
    await expect(
      q.run(() => new Promise((r) => setTimeout(r, 100))),
    ).rejects.toThrow(/timeout/);
  });

  it('溢出时丢弃最旧任务', async () => {
    const q = new BackpressureQueue({ concurrency: 1, maxSize: 2, taskTimeoutMs: 500 });
    const blocking = q.run(() => new Promise((r) => setTimeout(r, 100)));
    const t1 = q.run(async () => 1);
    const t2 = q.run(async () => 2);
    const t3 = q.run(async () => 3); // 触发溢出，丢弃 t1
    await expect(t1).rejects.toThrow(/overflow/);
    await expect(t2).resolves.toBe(2);
    await expect(t3).resolves.toBe(3);
    await blocking;
  });
});

describe('看门狗', () => {
  it('连续失败达阈值触发熔断', () => {
    const w = new Watchdog({ failureThreshold: 2, cooldownMs: 100 });
    expect(w.canRun()).toBe(true);
    w.recordFailure('a');
    expect(w.canRun()).toBe(true);
    w.recordFailure('b');
    expect(w.canRun()).toBe(false);
    expect(w.getState()).toBe('tripped');
  });

  it('冷却后允许试探', async () => {
    const w = new Watchdog({ failureThreshold: 1, cooldownMs: 5 });
    w.recordFailure('x');
    expect(w.canRun()).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(w.canRun()).toBe(true);
  });
});

describe('请求分类', () => {
  const hashOf = (s: string) => `h:${s.length}`;

  it('切分 system / tools / messages', () => {
    const c = classifyRequest(
      {
        model: 'deepseek-chat',
        systemPrompt: 'you are helpful',
        tools: [{ type: 'function', function: { name: 'read_file' } }],
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello', reasoning_content: 'thinking' },
          { role: 'tool', content: 'file content', tool_call_id: 'tc1' },
        ],
      },
      hashOf,
    );
    expect(c.segments.map((s) => s.source)).toEqual([
      'system', 'tools_schema', 'user_msg', 'assistant_msg', 'assistant_msg', 'tool_result',
    ]);
    expect(c.hasTools).toBe(true);
  });
});

describe('推理追踪', () => {
  it('携带 tools 时必须回传', () => {
    const t = new ReasoningTracker('salt');
    t.record('turn1', 'thinking...', 10, true);
    expect(t.pending()).not.toBeNull();
  });

  it('未携带 tools 时无需回传', () => {
    const t = new ReasoningTracker('salt');
    t.record('turn1', 'thinking...', 10, false);
    expect(t.pending()).toBeNull();
  });
});

describe('预算', () => {
  it('达到告警阈值返回降级建议', () => {
    const b = new BudgetTracker({ session: 100 }, 0.5);
    b.record('s1', 60);
    const advice = b.advise('s1');
    expect(advice.downgrade).toBe(true);
  });

  it('未超预算时返回 none', () => {
    const b = new BudgetTracker({ session: 100 }, 0.8);
    b.record('s1', 10);
    expect(b.advise('s1').action).toBe('none');
  });
});

describe('任务复杂度', () => {
  it('含代码 → high 或 max', () => {
    const signal = extractSignals(
      [{ source: 'user_msg', text: '请分析这段代码：\n```ts\nconst a = 1;\n```' }],
      0,
    );
    const level = decideEffort(signal, false).level;
    expect(['high', 'max']).toContain(level);
  });

  it('短文本无代码 → low', () => {
    const signal = extractSignals([{ source: 'user_msg', text: '好的' }], 0);
    expect(decideEffort(signal, false).level).toBe('low');
  });
});