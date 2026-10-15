// 推理 Token 生命周期追踪

import { createHash } from 'node:crypto';

export interface ReasoningState {
  turnId: string;
  contentHash: string;
  tokens: number;
  mustReplay: boolean;
}

export class ReasoningTracker {
  private readonly salt: string;
  private last: ReasoningState | null = null;

  constructor(salt = '') {
    this.salt = salt;
  }

  record(turnId: string, content: string, tokens: number, hasTools: boolean): void {
    if (!content) {
      this.last = null;
      return;
    }
    this.last = {
      turnId,
      contentHash: createHash('sha256')
        .update(this.salt)
        .update('\u0000')
        .update(content)
        .digest('hex'),
      tokens,
      mustReplay: hasTools,
    };
  }

  pending(): ReasoningState | null {
    return this.last?.mustReplay ? this.last : null;
  }

  matchesPending(contentHash: string | null): boolean {
    const p = this.pending();
    if (!p) return true;
    return contentHash === p.contentHash;
  }

  reset(): void {
    this.last = null;
  }
}