// Host / Client 通信协议：版本化 + 能力协商

export const PROTOCOL_VERSION = '1.0.0';

export interface Capabilities {
  /** Host 支持的消息类型 */
  messages: string[];
  /** Host 支持的推送通道 */
  transport: Array<'sse' | 'websocket'>;
  /** 是否支持导出 CSV */
  exportCsv: boolean;
}

export const HOST_CAPABILITIES: Capabilities = {
  messages: [
    'hello',
    'welcome',
    'turn.attribution',
    'composition.updated',
    'cache.event',
    'compression.event',
    'budget.warning',
    'error',
  ],
  transport: ['sse', 'websocket'],
  exportCsv: true,
};

export interface Envelope<T = unknown> {
  v: string;
  type: string;
  ts: number;
  payload: T;
}

export interface HelloMessage {
  clientVersion: string;
  supportedProtocol: string;
}

export interface WelcomeMessage {
  hostVersion: string;
  protocol: string;
  capabilities: Capabilities;
}

export interface TurnAttributionMessage {
  sessionId: string;
  turnId: string;
  composition: Array<{
    id: number;
    key: string;
    label: string;
    group: string;
    value: number;
    precision: string;
  }>;
  groups: Array<{ group: string; label: string; value: number }>;
  cacheBlocks: {
    blockSize: number;
    totalBlocks: number;
    hitBlocks: number;
    missBlocks: number;
    writeCandidateBlocks: number;
  };
  reasoning: {
    producedThisTurn: number;
    replayedInInput: number;
  };
  budget: {
    overBudget: boolean;
    usage: { session: number; daily: number; monthly: number };
    limits: { session?: number; daily?: number; monthly?: number };
  };
}

export interface CacheEventMessage {
  sessionId: string;
  kind: string;
  atChunkIndex: number;
  detail?: string;
}

export interface CompressionEventMessage {
  sessionId: string;
  kind: string;
  source: string;
  beforeTokens: number;
  afterTokens: number;
}

export interface BudgetWarningMessage {
  sessionId: string;
  usage: { session: number; daily: number; monthly: number };
  limits: { session?: number; daily?: number; monthly?: number };
}

export function envelope<T>(type: string, payload: T): Envelope<T> {
  return { v: PROTOCOL_VERSION, type, ts: Date.now(), payload };
}

/**
 * 协议版本兼容性检查：主版本必须一致，次版本向下兼容。
 */
export function isCompatible(clientProtocol: string): boolean {
  const [chMaj] = clientProtocol.split('.');
  const [srvMaj] = PROTOCOL_VERSION.split('.');
  return chMaj === srvMaj;
}