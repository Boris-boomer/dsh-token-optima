// 预算跟踪与降级建议

export interface BudgetLimits {
  session?: number;
  daily?: number;
  monthly?: number;
}

export interface BudgetUsage {
  session: number;
  daily: number;
  monthly: number;
}

export interface BudgetState {
  limits: BudgetLimits;
  usage: BudgetUsage;
  /** 当前是否处于告警状态 */
  overBudget: boolean;
  /** 触发降级的阈值（使用率达到此比例即告警） */
  warnAt: number;
}

export interface BudgetAdvice {
  /** 是否应触发降级 */
  downgrade: boolean;
  /** 建议动作 */
  action: 'none' | 'lower_effort' | 'increase_compression' | 'both';
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

interface DayBucket {
  startedAt: number;
  tokens: number;
}

interface MonthBucket {
  startedAt: number;
  tokens: number;
}

export class BudgetTracker {
  private sessionTokens = new Map<string, number>();
  private day: DayBucket = { startedAt: Date.now(), tokens: 0 };
  private month: MonthBucket = { startedAt: Date.now(), tokens: 0 };
  private readonly limits: BudgetLimits;
  private readonly warnAt: number;

  constructor(limits: BudgetLimits = {}, warnAt = 0.8) {
    this.limits = limits;
    this.warnAt = warnAt;
  }

  private rollover(now: number): void {
    if (now - this.day.startedAt > DAY_MS) {
      this.day = { startedAt: now, tokens: 0 };
    }
    if (now - this.month.startedAt > MONTH_MS) {
      this.month = { startedAt: now, tokens: 0 };
    }
  }

  record(sessionId: string, tokens: number, now = Date.now()): void {
    this.rollover(now);
    const s = (this.sessionTokens.get(sessionId) ?? 0) + tokens;
    this.sessionTokens.set(sessionId, s);
    this.day.tokens += tokens;
    this.month.tokens += tokens;
  }

  getUsage(sessionId: string, now = Date.now()): BudgetUsage {
    this.rollover(now);
    return {
      session: this.sessionTokens.get(sessionId) ?? 0,
      daily: this.day.tokens,
      monthly: this.month.tokens,
    };
  }

  getState(sessionId: string, now = Date.now()): BudgetState {
    const usage = this.getUsage(sessionId, now);
    const ratio = this.worstRatio(usage);
    return {
      limits: this.limits,
      usage,
      overBudget: ratio >= 1,
      warnAt: this.warnAt,
    };
  }

  private worstRatio(usage: BudgetUsage): number {
    let worst = 0;
    if (this.limits.session && this.limits.session > 0) {
      worst = Math.max(worst, usage.session / this.limits.session);
    }
    if (this.limits.daily && this.limits.daily > 0) {
      worst = Math.max(worst, usage.daily / this.limits.daily);
    }
    if (this.limits.monthly && this.limits.monthly > 0) {
      worst = Math.max(worst, usage.monthly / this.limits.monthly);
    }
    return worst;
  }

  advise(sessionId: string, now = Date.now()): BudgetAdvice {
    const state = this.getState(sessionId, now);
    const ratio = this.worstRatio(state.usage);

    if (ratio >= 1) {
      return {
        downgrade: true,
        action: 'both',
        reason: `budget exceeded (${(ratio * 100).toFixed(0)}%)`,
      };
    }
    if (ratio >= this.warnAt) {
      return {
        downgrade: true,
        action: 'increase_compression',
        reason: `budget warning threshold reached (${(ratio * 100).toFixed(0)}%)`,
      };
    }
    return { downgrade: false, action: 'none', reason: 'budget healthy' };
  }

  reset(sessionId?: string): void {
    if (sessionId) this.sessionTokens.delete(sessionId);
    else this.sessionTokens.clear();
  }

  export(): {
    limits: BudgetLimits;
    usage: { sessions: Record<string, number>; day: DayBucket; month: MonthBucket };
  } {
    return {
      limits: this.limits,
      usage: {
        sessions: Object.fromEntries(this.sessionTokens),
        day: this.day,
        month: this.month,
      },
    };
  }
}