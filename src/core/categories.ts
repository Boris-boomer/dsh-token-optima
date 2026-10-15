// 14 类 Token 投影视图定义

import type { Precision, TokenCoordinate } from './types.js';

export interface CategoryDef {
  id: number;
  key: string;
  label: string;
  group: 'input' | 'cache' | 'output' | 'reasoning';
  match: (c: TokenCoordinate) => boolean;
  origin: string;
  basePrecision: Precision;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 1, key: 'system_prompt', label: '系统提示词', group: 'input', match: (c) => c.source === 'system' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 2, key: 'tools_schema', label: '工具 Schema', group: 'input', match: (c) => c.source === 'tools_schema' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 3, key: 'agents_md', label: 'AGENTS.md 链', group: 'input', match: (c) => c.source === 'agents_md' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 4, key: 'skills', label: '技能目录', group: 'input', match: (c) => c.source === 'skills' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 5, key: 'mcp_tools', label: 'MCP 工具面', group: 'input', match: (c) => c.source === 'mcp_tools' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 6, key: 'user_msg', label: '用户消息', group: 'input', match: (c) => c.source === 'user_msg' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 7, key: 'assistant_msg', label: '助手回复（历史）', group: 'input', match: (c) => c.source === 'assistant_msg' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 8, key: 'tool_result', label: '工具结果', group: 'input', match: (c) => c.source === 'tool_result' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 9, key: 'injected_ctx', label: '注入的上下文', group: 'input', match: (c) => c.source === 'injected_ctx' && c.direction === 'input', origin: '客户端编码', basePrecision: 'exact' },
  { id: 10, key: 'cache_hit', label: '缓存命中输入', group: 'cache', match: (c) => c.cache_status === 'hit' && c.direction === 'input', origin: 'API 真值 prompt_cache_hit_tokens', basePrecision: 'exact' },
  { id: 11, key: 'cache_write', label: '缓存写入候选', group: 'cache', match: (c) => c.cache_status === 'write_candidate', origin: '推断（API 无对应字段，不参与计费）', basePrecision: 'inferred' },
  { id: 12, key: 'cache_miss', label: '缓存未命中输入', group: 'cache', match: (c) => c.cache_status === 'miss' && c.direction === 'input', origin: 'API 真值 prompt_cache_miss_tokens', basePrecision: 'exact' },
  { id: 13, key: 'model_output', label: '模型输出', group: 'output', match: (c) => c.direction === 'output' && !c.is_reasoning, origin: 'API 真值 completion_tokens - reasoning_tokens', basePrecision: 'exact' },
  { id: 14, key: 'reasoning', label: '推理 Token', group: 'reasoning', match: (c) => c.direction === 'output' && c.is_reasoning, origin: 'API 真值 reasoning_tokens（部分模型）', basePrecision: 'exact' },
];

export const CATEGORY_BY_ID = new Map<number, CategoryDef>(CATEGORIES.map((c) => [c.id, c]));

export const CATEGORY_GROUPS: Array<{
  group: CategoryDef['group'];
  label: string;
  ids: number[];
}> = [
  { group: 'input', label: '输入', ids: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { group: 'cache', label: '缓存', ids: [10, 11, 12] },
  { group: 'output', label: '输出', ids: [13] },
  { group: 'reasoning', label: '推理', ids: [14] },
];