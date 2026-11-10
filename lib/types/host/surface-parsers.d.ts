import type { AssignableSource, DeepSeekUsage } from '../core/types.js';
/**
 * 从事件对象里提取纯文本。
 *
 * 事件结构：event.data.message.content（也可能直接 event.data.content）。
 */
export declare function extractText(event: Record<string, unknown>): string;
/**
 * 从 stream 里提取 reasoning 文本（用于 reasoning lifecycle 统计）。
 */
export declare function extractReasoningText(event: Record<string, unknown>): string;
/**
 * 把事件类型 + 文本内容映射到来源分类。
 */
export declare function classifySource(type: string, text: string): AssignableSource;
/**
 * 把原始 usage 结构规范化成 DeepSeekUsage。
 */
export declare function normalizeUsage(usage: Record<string, unknown> | undefined): DeepSeekUsage;
/**
 * 对 surface seq 列表生成短签名（用于检测 surface 变化）。
 */
export declare function signatureOf(seqs: number[]): string;
