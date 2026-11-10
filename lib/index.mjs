import { Remote, TypertRemoteService, remoteMethods } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
//#region .build/host/config.js
const NS = "token-optima";
const Config = z.object({
	enabled: z.boolean().default(true),
	blockSize: z.number().default(64),
	driftThreshold: z.number().default(.03),
	hashSalt: z.string().default(""),
	budgetSession: z.number().default(0),
	budgetDaily: z.number().default(0),
	budgetMonthly: z.number().default(0),
	reasoningEffort: z.string().default("high"),
	inlineTools: z.boolean().default(true),
	dynamicEffort: z.boolean().default(true),
	debug: z.boolean().default(false)
});
//#endregion
//#region .build/host/core/types.js
const SOURCES = [
	"system",
	"tools_schema",
	"agents_md",
	"skills",
	"mcp_tools",
	"user_msg",
	"assistant_msg",
	"tool_result",
	"injected_ctx",
	"unattributed"
];
const measured = (value, precision) => ({
	value,
	precision
});
//#endregion
//#region .build/host/core/cache-model.js
const CACHE_BLOCK_SIZE = 64;
function sha256(input) {
	return createHash("sha256").update(input, "utf8").digest("hex");
}
function buildSeed(ctx) {
	return [
		ctx.modelId,
		ctx.apiVersion ?? "",
		ctx.tokenizerId,
		ctx.toolsSchemaHash ?? "",
		ctx.systemPromptHash ?? ""
	].join("");
}
function buildChunks(text, tokenizer, ctx, blockSize = 64) {
	const boundaries = tokenizer.chunkBoundaries(text, blockSize);
	const seed = buildSeed(ctx);
	const chunks = [];
	let prev = seed;
	for (let i = 0; i < boundaries.length; i++) {
		const b = boundaries[i];
		const slice = text.slice(b.start, b.end);
		const hash = sha256(`${prev}\u0000${slice}`);
		prev = hash;
		chunks.push({
			index: i,
			start: b.start,
			end: b.end,
			text: slice,
			tokens: b.tokens,
			hash,
			complete: b.tokens >= blockSize
		});
	}
	return chunks;
}
function compareChunks(current, previous, contextChanged) {
	const events = [];
	if (contextChanged.systemPrompt) events.push({
		kind: "system_prompt_changed",
		atChunkIndex: 0
	});
	if (contextChanged.toolsSchema) events.push({
		kind: "tools_schema_changed",
		atChunkIndex: 0
	});
	if (contextChanged.model) events.push({
		kind: "model_switched",
		atChunkIndex: 0
	});
	if (contextChanged.systemPrompt || contextChanged.toolsSchema || contextChanged.model || !previous || previous.length === 0) return {
		verdicts: current.map((c) => c.complete ? "write_candidate" : "miss"),
		events
	};
	const prevHashes = new Set(previous.map((c) => c.hash));
	const verdicts = [];
	let broken = false;
	let breakReported = false;
	for (const chunk of current) {
		if (!chunk.complete) {
			verdicts.push("miss");
			continue;
		}
		if (!broken && prevHashes.has(chunk.hash)) {
			verdicts.push("hit");
			continue;
		}
		if (!broken) {
			broken = true;
			if (!breakReported && chunk.index > 0) {
				events.push({
					kind: "prefix_broken",
					atChunkIndex: chunk.index,
					detail: "prefix hash mismatch; subsequent chunks invalidated"
				});
				breakReported = true;
			}
		}
		verdicts.push(prevHashes.has(chunk.hash) ? "miss" : "write_candidate");
	}
	return {
		verdicts,
		events
	};
}
function distributeChunksBySource(chunks, verdicts, layout) {
	const tally = new Map();
	const touch = (source) => {
		let t = tally.get(source);
		if (!t) {
			t = {
				source,
				hit: 0,
				miss: 0,
				writeCandidate: 0
			};
			tally.set(source, t);
		}
		return t;
	};
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const verdict = verdicts[i] ?? "miss";
		const chunkLen = chunk.end - chunk.start;
		if (chunkLen <= 0) continue;
		for (const seg of layout) {
			const lo = Math.max(chunk.start, seg.start);
			const hi = Math.min(chunk.end, seg.end);
			if (hi <= lo) continue;
			const share = (hi - lo) / chunkLen;
			const tokens = chunk.tokens * share;
			const t = touch(seg.source);
			if (verdict === "hit") t.hit += tokens;
			else if (verdict === "miss") t.miss += tokens;
			else {
				t.miss += tokens;
				t.writeCandidate += tokens;
			}
		}
	}
	return [...tally.values()];
}
function summarizeBlocks(chunks, verdicts, blockSize) {
	let hit = 0;
	let miss = 0;
	let write = 0;
	for (const v of verdicts) if (v === "hit") hit++;
	else if (v === "miss") miss++;
	else write++;
	return {
		blockSize,
		totalBlocks: chunks.length,
		hitBlocks: hit,
		missBlocks: miss,
		writeCandidateBlocks: write,
		invalidatedBlocks: miss + write
	};
}
//#endregion
//#region .build/host/core/pricing.js
const PRICING_TABLE = {
	"deepseek-flash": {
		peak: {
			hit: .006,
			miss: .3,
			output: 1.2
		},
		offPeak: {
			hit: .003,
			miss: .15,
			output: .6
		}
	},
	"deepseek-v4-pro": {
		peak: {
			hit: .044,
			miss: 1.32,
			output: 3.96
		},
		offPeak: {
			hit: .022,
			miss: .66,
			output: 1.98
		}
	},
	"deepseek-chat": {
		peak: {
			hit: .006,
			miss: .3,
			output: 1.2
		},
		offPeak: {
			hit: .003,
			miss: .15,
			output: .6
		}
	},
	"deepseek-reasoner": {
		peak: {
			hit: .044,
			miss: 1.32,
			output: 3.96
		},
		offPeak: {
			hit: .022,
			miss: .66,
			output: 1.98
		}
	}
};
const PRICING_VERSION = "deepseek-2026-10-21";
function getPricing(model) {
	const key = Object.keys(PRICING_TABLE).find((k) => model.startsWith(k));
	return PRICING_TABLE[key ?? "deepseek-chat"];
}
function isPeakHour(timestamp, options = {}) {
	const beijing = new Date(timestamp + 288e5);
	const day = beijing.getUTCDay();
	if (day === 0 || day === 6) return false;
	const dateKey = beijing.toISOString().slice(0, 10);
	if (options.extraOffPeakDates?.has(dateKey)) return false;
	const h = beijing.getUTCHours();
	return h >= 9 && h < 12 || h >= 14 && h < 18;
}
function calculateCost(model, hitTokens, missTokens, outputTokens, options = {}) {
	const pricing = getPricing(model);
	const isPeak = isPeakHour(options.timestamp ?? Date.now(), { extraOffPeakDates: options.extraOffPeakDates });
	const p = isPeak ? pricing.peak : pricing.offPeak;
	const h = hitTokens / 1e6;
	const m = missTokens / 1e6;
	const o = outputTokens / 1e6;
	const hitCost = h * p.hit;
	const missCost = m * p.miss;
	const outputCost = o * p.output;
	return {
		total: hitCost + missCost + outputCost,
		savedByCache: h * (p.miss - p.hit),
		details: {
			hitCost,
			missCost,
			outputCost
		},
		isPeak,
		pricingVersion: PRICING_VERSION
	};
}
//#endregion
//#region .build/host/core/attribution.js
function attributeTurn(turnId, model, segments, usage, tokenizer, options = {}) {
	const blockSize = options.blockSize ?? 64;
	const driftThreshold = options.driftThreshold ?? .03;
	const salt = options.hashSalt ?? "";
	const layout = [];
	const parts = [];
	let offset = 0;
	for (const seg of segments) {
		const tokens = seg.tokenCount ?? tokenizer.count(seg.text);
		layout.push({
			source: seg.source,
			start: offset,
			end: offset + seg.text.length,
			tokens,
			isReasoning: seg.isReasoning === true
		});
		parts.push(seg.text);
		offset += seg.text.length;
	}
	const fullText = parts.join("");
	const systemText = segments.find((s) => s.source === "system")?.text ?? "";
	const toolsText = segments.filter((s) => s.source === "tools_schema" || s.source === "mcp_tools").map((s) => s.text).join("\0");
	const chunks = buildChunks(fullText, tokenizer, {
		modelId: model,
		tokenizerId: tokenizer.id,
		systemPromptHash: hashOf(systemText, salt),
		toolsSchemaHash: hashOf(toolsText, salt)
	}, blockSize);
	const { verdicts, events } = compareChunks(chunks, options.previousChunks ?? null, options.contextChanged ?? {
		systemPrompt: false,
		toolsSchema: false,
		model: false
	});
	const tally = distributeChunksBySource(chunks, verdicts, layout);
	const promptTokens = usage.prompt_tokens ?? 0;
	const hitTruth = usage.prompt_cache_hit_tokens ?? 0;
	const missTruth = usage.prompt_cache_miss_tokens ?? Math.max(0, promptTokens - hitTruth);
	const estimatedBySource = new Map();
	for (const seg of layout) estimatedBySource.set(seg.source, (estimatedBySource.get(seg.source) ?? 0) + seg.tokens);
	const estimatedTotal = sumValues(estimatedBySource);
	const alignmentDrift = promptTokens > 0 && estimatedTotal > 0 ? Math.abs(estimatedTotal - promptTokens) / promptTokens : 0;
	const hitBySource = new Map();
	const missBySource = new Map();
	for (const t of tally) {
		if (t.hit > 0) hitBySource.set(t.source, t.hit);
		if (t.miss > 0) missBySource.set(t.source, t.miss);
	}
	let alignedBySource;
	let alignedHit;
	let alignedMiss;
	let unattributedValue = 0;
	const inThreshold = estimatedTotal > 0 && alignmentDrift <= driftThreshold;
	if (estimatedTotal <= 0) {
		alignedBySource = new Map();
		alignedHit = new Map();
		alignedMiss = new Map();
		unattributedValue = promptTokens;
		if (unattributedValue > 0) {
			alignedBySource.set("unattributed", unattributedValue);
			alignedMiss.set("unattributed", unattributedValue);
		}
	} else if (inThreshold) {
		alignedBySource = scaleToTarget(estimatedBySource, promptTokens);
		alignedHit = scaleToTarget(hitBySource, hitTruth);
		alignedMiss = scaleToTarget(missBySource, missTruth);
	} else {
		alignedBySource = new Map(estimatedBySource);
		alignedHit = new Map(hitBySource);
		alignedMiss = new Map(missBySource);
		const residual = promptTokens - estimatedTotal;
		if (residual > 0) {
			unattributedValue = residual;
			alignedBySource.set("unattributed", residual);
			alignedMiss.set("unattributed", residual);
		} else {
			alignedBySource = scaleToTarget(estimatedBySource, promptTokens);
			alignedMiss = scaleToTarget(missBySource, missTruth);
		}
	}
	const writeCandidateTotal = tally.reduce((a, t) => a + t.writeCandidate, 0);
	const hasReasoningTruth = typeof usage.completion_tokens_details?.reasoning_tokens === "number";
	const reasoningValue = hasReasoningTruth ? usage.completion_tokens_details.reasoning_tokens : options.reasoningContent ? tokenizer.count(options.reasoningContent) : 0;
	const completionTokens = usage.completion_tokens ?? 0;
	const outputValue = Math.max(0, completionTokens - reasoningValue);
	const reasoningSnapshot = {
		producedThisTurn: reasoningValue,
		replayedInInput: options.replayedReasoningTokens ?? layout.filter((s) => s.source === "assistant_msg" && s.isReasoning).reduce((a, s) => a + s.tokens, 0),
		requiresReplay: options.hasTools === true,
		contentHash: options.reasoningContent && options.reasoningContent.length > 0 ? hashOf(options.reasoningContent, salt) : null
	};
	const sourcePrecision = tokenizer.precision !== "exact" ? "estimated" : alignmentDrift <= driftThreshold ? "exact" : "inferred";
	const categories = {};
	for (const [source, catId] of [
		["system", 1],
		["tools_schema", 2],
		["agents_md", 3],
		["skills", 4],
		["mcp_tools", 5],
		["user_msg", 6],
		["assistant_msg", 7],
		["tool_result", 8],
		["injected_ctx", 9]
	]) categories[catId] = measured(alignedBySource.get(source) ?? 0, sourcePrecision);
	categories[10] = measured(hitTruth, "exact");
	categories[12] = measured(missTruth, "exact");
	categories[11] = measured(Math.round(writeCandidateTotal), "inferred");
	categories[13] = measured(outputValue, hasReasoningTruth ? "exact" : "inferred");
	categories[14] = measured(reasoningValue, hasReasoningTruth ? "exact" : "inferred");
	const matrix = buildMatrix(alignedBySource, alignedHit, alignedMiss, tally);
	const cacheBlocks = summarizeBlocks(chunks, verdicts, blockSize);
	const timestamp = options.timestamp ?? Date.now();
	const cost = calculateCost(model, hitTruth, missTruth, completionTokens, {
		timestamp,
		extraOffPeakDates: options.extraOffPeakDates
	});
	const otelAttributes = {
		"gen_ai.system": "deepseek",
		"gen_ai.request.model": model,
		"gen_ai.usage.input_tokens": promptTokens,
		"gen_ai.usage.cache_read.input_tokens": hitTruth,
		"gen_ai.usage.cache_creation.input_tokens": Math.round(writeCandidateTotal),
		"gen_ai.usage.output_tokens": completionTokens,
		"gen_ai.usage.output_tokens.reasoning": reasoningValue
	};
	return {
		attribution: {
			turnId,
			timestamp,
			model,
			categories,
			matrix,
			unattributed: measured(unattributedValue, unattributedValue > 0 ? "inferred" : "exact"),
			alignmentDrift,
			cacheBlocks,
			cacheEvents: events,
			reasoning: reasoningSnapshot,
			usage,
			cost,
			otelAttributes
		},
		chunks
	};
}
function hashOf(text, salt) {
	if (!text) return "";
	return createHash("sha256").update(salt).update("\0").update(text).digest("hex");
}
function sumValues(map) {
	let s = 0;
	for (const v of map.values()) s += v;
	return s;
}
function scaleToTarget(values, target) {
	const out = new Map();
	if (target <= 0) return out;
	const entries = [...values.entries()].filter(([, v]) => v > 0);
	const total = entries.reduce((a, [, v]) => a + v, 0);
	if (total <= 0) return out;
	const scale = target / total;
	const scaled = entries.map(([k, v]) => {
		const exact = v * scale;
		const floor = Math.floor(exact);
		return {
			k,
			floor,
			frac: exact - floor
		};
	});
	let remaining = target - scaled.reduce((a, e) => a + e.floor, 0);
	scaled.sort((a, b) => b.frac - a.frac);
	for (const e of scaled) {
		if (remaining <= 0) break;
		e.floor += 1;
		remaining -= 1;
	}
	for (const e of scaled) out.set(e.k, e.floor);
	return out;
}
function buildMatrix(alignedBySource, alignedHit, alignedMiss, tally) {
	const sources = new Set([
		...alignedBySource.keys(),
		...alignedHit.keys(),
		...alignedMiss.keys()
	]);
	const tallyMap = new Map(tally.map((t) => [t.source, t]));
	const rows = [];
	for (const source of sources) {
		const hit = Math.round(alignedHit.get(source) ?? 0);
		const miss = Math.round(alignedMiss.get(source) ?? 0);
		const writeCandidate = Math.round(tallyMap.get(source)?.writeCandidate ?? 0);
		rows.push({
			source,
			hit,
			miss,
			writeCandidate,
			total: hit + miss
		});
	}
	rows.sort((a, b) => b.total - a.total);
	return rows;
}
//#endregion
//#region .build/host/core/tokenizer.js
const W_CJK = .6;
const W_LATIN = .25;
const W_DIGIT = .3;
const W_SPACE = .12;
const W_PUNCT = .5;
function charWeight(code) {
	if (code === 32 || code === 9 || code === 10 || code === 13) return W_SPACE;
	if (code >= 48 && code <= 57) return W_DIGIT;
	if (code >= 65 && code <= 90 || code >= 97 && code <= 122) return W_LATIN;
	if (code >= 192 && code <= 591) return W_LATIN;
	if (code >= 13312 && code <= 19903 || code >= 19968 && code <= 40959 || code >= 63744 && code <= 64255 || code >= 12352 && code <= 12543 || code >= 44032 && code <= 55215) return W_CJK;
	return W_PUNCT;
}
var EstimatedTokenizer = class {
	id = "estimated-char-weighted";
	precision = "estimated";
	count(text) {
		if (!text) return 0;
		let acc = 0;
		for (let i = 0; i < text.length; i++) acc += charWeight(text.charCodeAt(i));
		return Math.max(1, Math.round(acc));
	}
	chunkBoundaries(text, blockSize) {
		const out = [];
		if (!text) return out;
		let start = 0;
		let acc = 0;
		for (let i = 0; i < text.length; i++) {
			acc += charWeight(text.charCodeAt(i));
			if (acc >= blockSize) {
				out.push({
					start,
					end: i + 1,
					tokens: Math.round(acc)
				});
				start = i + 1;
				acc = 0;
			}
		}
		if (start < text.length) out.push({
			start,
			end: text.length,
			tokens: Math.max(1, Math.floor(acc))
		});
		return out;
	}
};
var NativeTokenizer = class {
	enc;
	id;
	precision = "exact";
	constructor(enc) {
		this.enc = enc;
		this.id = enc.id;
	}
	count(text) {
		return this.enc.encode(text).length;
	}
	chunkBoundaries(text, blockSize) {
		if (this.enc.encodeWithOffsets) {
			const { ids, offsets } = this.enc.encodeWithOffsets(text);
			const out = [];
			for (let i = 0; i < ids.length; i += blockSize) {
				const last = Math.min(i + blockSize, ids.length) - 1;
				const prevOffset = i === 0 ? 0 : offsets[i - 1] ?? 0;
				const lastOffset = offsets[last] ?? text.length;
				out.push({
					start: prevOffset,
					end: lastOffset,
					tokens: last - i + 1
				});
			}
			if (out.length > 0) {
				out[0].start = 0;
				out[out.length - 1].end = text.length;
			}
			return out;
		}
		const ids = this.enc.encode(text);
		if (ids.length === 0) return [];
		const ratio = text.length / ids.length;
		const out = [];
		for (let i = 0; i < ids.length; i += blockSize) {
			const end = Math.min(i + blockSize, ids.length);
			out.push({
				start: Math.floor(i * ratio),
				end: Math.min(text.length, Math.ceil(end * ratio)),
				tokens: end - i
			});
		}
		if (out.length > 0) {
			out[0].start = 0;
			out[out.length - 1].end = text.length;
		}
		return out;
	}
};
function createBpeEncoder(vocab, id = "bpe-ts") {
	const { encoder, decoder, ranks } = vocab;
	const byteEncode = (text) => {
		const bytes = new TextEncoder().encode(text);
		const out = [];
		for (const b of bytes) if (b >= 33 && b <= 126 || b >= 161 && b <= 172 || b >= 174 && b <= 255) out.push(String.fromCharCode(b));
		else out.push(String.fromCharCode(256 + b));
		return out;
	};
	const mergePair = (tokens, a, b, merged) => {
		const out = [];
		let i = 0;
		while (i < tokens.length) if (i < tokens.length - 1 && tokens[i] === a && tokens[i + 1] === b) {
			out.push(merged);
			i += 2;
		} else {
			out.push(tokens[i]);
			i += 1;
		}
		return out;
	};
	const applyBpe = (chars) => {
		let tokens = chars;
		while (tokens.length > 1) {
			let bestRank = Infinity;
			let bestIdx = -1;
			for (let i = 0; i < tokens.length - 1; i++) {
				const key = `${tokens[i]}\u0000${tokens[i + 1]}`;
				const rank = ranks.get(key);
				if (rank !== void 0 && rank < bestRank) {
					bestRank = rank;
					bestIdx = i;
				}
			}
			if (bestIdx < 0) break;
			const a = tokens[bestIdx];
			const b = tokens[bestIdx + 1];
			tokens = mergePair(tokens, a, b, a + b);
		}
		return tokens;
	};
	const encode = (text) => {
		if (!text) return [];
		const chars = byteEncode(text);
		const tokens = applyBpe(chars);
		const ids = [];
		for (const t of tokens) {
			const id = encoder.get(t);
			if (id !== void 0) ids.push(id);
			else for (const ch of t) {
				const cid = encoder.get(ch);
				if (cid !== void 0) ids.push(cid);
				else ids.push(decoder.length - 1);
			}
		}
		return ids;
	};
	return {
		id,
		encode
	};
}
async function loadHfTokenizer(tokenizerJsonPath, tokenizerConfigPath) {
	const { readFile } = await import("node:fs/promises");
	const mod = await import("@huggingface/tokenizers");
	if (typeof mod?.Tokenizer !== "function") throw new Error("@huggingface/tokenizers: Tokenizer 构造函数不可用");
	const tokenizerJson = JSON.parse(await readFile(tokenizerJsonPath, "utf8"));
	let tokenizerConfig = void 0;
	if (tokenizerConfigPath) try {
		tokenizerConfig = JSON.parse(await readFile(tokenizerConfigPath, "utf8"));
	} catch {}
	const tokenizer = new mod.Tokenizer(tokenizerJson, tokenizerConfig);
	return {
		id: `hf:${tokenizerJsonPath}`,
		encode(text) {
			const encoded = tokenizer.encode(text);
			if (Array.isArray(encoded.ids)) return encoded.ids;
			return encoded.ids ? Array.from(encoded.ids) : [];
		}
	};
}
async function resolveTokenizer(options = {}) {
	const timeoutMs = options.timeoutMs ?? 3e3;
	const withTimeout = async (p) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs))]);
	if (options.hfLoader) try {
		const enc = await withTimeout(options.hfLoader());
		if (enc) return {
			tokenizer: new NativeTokenizer(enc),
			warning: null
		};
	} catch (err) {
		const msg = err.message;
		if (options.wasmLoader) try {
			const enc = await withTimeout(options.wasmLoader());
			if (enc) return {
				tokenizer: new NativeTokenizer(enc),
				warning: `HF tokenizer failed (${msg}); using WASM fallback.`
			};
		} catch {}
		if (options.bpeLoader) try {
			const enc = await withTimeout(options.bpeLoader());
			if (enc) return {
				tokenizer: new NativeTokenizer(enc),
				warning: `HF tokenizer failed (${msg}); using BPE fallback.`
			};
		} catch {}
		return {
			tokenizer: new EstimatedTokenizer(),
			warning: `HF tokenizer failed (${msg}); using character estimation (~80-90%).`
		};
	}
	if (options.wasmLoader) try {
		const enc = await withTimeout(options.wasmLoader());
		if (enc) return {
			tokenizer: new NativeTokenizer(enc),
			warning: null
		};
	} catch (err) {
		const msg = err.message;
		if (options.bpeLoader) try {
			const enc = await withTimeout(options.bpeLoader());
			if (enc) return {
				tokenizer: new NativeTokenizer(enc),
				warning: `WASM tokenizer failed (${msg}); using BPE fallback.`
			};
		} catch (err2) {
			return {
				tokenizer: new EstimatedTokenizer(),
				warning: `WASM failed (${msg}); BPE failed (${err2.message}); using character estimation (~80-90%).`
			};
		}
		return {
			tokenizer: new EstimatedTokenizer(),
			warning: `WASM failed (${msg}); using character estimation (~80-90%).`
		};
	}
	if (options.bpeLoader) try {
		const enc = await withTimeout(options.bpeLoader());
		if (enc) return {
			tokenizer: new NativeTokenizer(enc),
			warning: null
		};
	} catch (err) {
		return {
			tokenizer: new EstimatedTokenizer(),
			warning: `BPE failed (${err.message}); using character estimation.`
		};
	}
	return {
		tokenizer: new EstimatedTokenizer(),
		warning: "Using character estimation (~80-90% accuracy). Provide hfLoader for exact counts."
	};
}
//#endregion
//#region .build/host/core/reasoning.js
var ReasoningTracker = class {
	salt;
	last = null;
	constructor(salt = "") {
		this.salt = salt;
	}
	record(turnId, content, tokens, hasTools) {
		if (!content) {
			this.last = null;
			return;
		}
		this.last = {
			turnId,
			contentHash: createHash("sha256").update(this.salt).update("\0").update(content).digest("hex"),
			tokens,
			mustReplay: hasTools
		};
	}
	pending() {
		return this.last?.mustReplay ? this.last : null;
	}
	matchesPending(contentHash) {
		const p = this.pending();
		if (!p) return true;
		return contentHash === p.contentHash;
	}
	reset() {
		this.last = null;
	}
};
//#endregion
//#region .build/host/core/categories.js
const CATEGORIES = [
	{
		id: 1,
		key: "system_prompt",
		label: "系统提示词",
		group: "input",
		match: (c) => c.source === "system" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 2,
		key: "tools_schema",
		label: "工具 Schema",
		group: "input",
		match: (c) => c.source === "tools_schema" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 3,
		key: "agents_md",
		label: "AGENTS.md 链",
		group: "input",
		match: (c) => c.source === "agents_md" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 4,
		key: "skills",
		label: "技能目录",
		group: "input",
		match: (c) => c.source === "skills" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 5,
		key: "mcp_tools",
		label: "MCP 工具面",
		group: "input",
		match: (c) => c.source === "mcp_tools" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 6,
		key: "user_msg",
		label: "用户消息",
		group: "input",
		match: (c) => c.source === "user_msg" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 7,
		key: "assistant_msg",
		label: "助手回复（历史）",
		group: "input",
		match: (c) => c.source === "assistant_msg" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 8,
		key: "tool_result",
		label: "工具结果",
		group: "input",
		match: (c) => c.source === "tool_result" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 9,
		key: "injected_ctx",
		label: "注入的上下文",
		group: "input",
		match: (c) => c.source === "injected_ctx" && c.direction === "input",
		origin: "客户端编码",
		basePrecision: "exact"
	},
	{
		id: 10,
		key: "cache_hit",
		label: "缓存命中输入",
		group: "cache",
		match: (c) => c.cache_status === "hit" && c.direction === "input",
		origin: "API 真值 prompt_cache_hit_tokens",
		basePrecision: "exact"
	},
	{
		id: 11,
		key: "cache_write",
		label: "缓存写入候选",
		group: "cache",
		match: (c) => c.cache_status === "write_candidate",
		origin: "推断（API 无对应字段，不参与计费）",
		basePrecision: "inferred"
	},
	{
		id: 12,
		key: "cache_miss",
		label: "缓存未命中输入",
		group: "cache",
		match: (c) => c.cache_status === "miss" && c.direction === "input",
		origin: "API 真值 prompt_cache_miss_tokens",
		basePrecision: "exact"
	},
	{
		id: 13,
		key: "model_output",
		label: "模型输出",
		group: "output",
		match: (c) => c.direction === "output" && !c.is_reasoning,
		origin: "API 真值 completion_tokens - reasoning_tokens",
		basePrecision: "exact"
	},
	{
		id: 14,
		key: "reasoning",
		label: "推理 Token",
		group: "reasoning",
		match: (c) => c.direction === "output" && c.is_reasoning,
		origin: "API 真值 reasoning_tokens（部分模型）",
		basePrecision: "exact"
	}
];
const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const CATEGORY_GROUPS = [
	{
		group: "input",
		label: "输入",
		ids: [
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9
		]
	},
	{
		group: "cache",
		label: "缓存",
		ids: [
			10,
			11,
			12
		]
	},
	{
		group: "output",
		label: "输出",
		ids: [13]
	},
	{
		group: "reasoning",
		label: "推理",
		ids: [14]
	}
];
//#endregion
//#region .build/host/host/store-csv.js
function sanitizeCell(cell) {
	const s = String(cell);
	if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
	return s;
}
function toCsv(rows) {
	const lines = [[
		"turnId",
		"timestamp",
		"model",
		...Array.from({ length: 14 }, (_, i) => `c${i + 1}`),
		"unattributed",
		"alignmentDrift",
		"hitBlocks",
		"missBlocks",
		"writeBlocks",
		"reasoningProduced",
		"reasoningReplayed",
		"costTotal",
		"costSavedByCache"
	].join(",")];
	for (const r of rows) {
		const rawCells = [
			r.turnId,
			r.timestamp,
			r.model,
			...Array.from({ length: 14 }, (_, i) => r.categories[i + 1]?.value ?? 0),
			r.unattributed.value,
			r.alignmentDrift.toFixed(4),
			r.cacheBlocks.hitBlocks,
			r.cacheBlocks.missBlocks,
			r.cacheBlocks.writeCandidateBlocks,
			r.reasoning.producedThisTurn,
			r.reasoning.replayedInInput,
			r.cost?.total ?? 0,
			r.cost?.savedByCache ?? 0
		];
		lines.push(rawCells.map(sanitizeCell).join(","));
	}
	return lines.join("\n");
}
//#endregion
//#region .build/host/core/budget.js
const DAY_MS = 864e5;
const MONTH_MS = 30 * DAY_MS;
var BudgetTracker = class {
	sessionTokens = new Map();
	day = {
		startedAt: Date.now(),
		tokens: 0
	};
	month = {
		startedAt: Date.now(),
		tokens: 0
	};
	limits;
	warnAt;
	constructor(limits = {}, warnAt = .8) {
		this.limits = limits;
		this.warnAt = warnAt;
	}
	rollover(now) {
		if (now - this.day.startedAt > DAY_MS) this.day = {
			startedAt: now,
			tokens: 0
		};
		if (now - this.month.startedAt > MONTH_MS) this.month = {
			startedAt: now,
			tokens: 0
		};
	}
	record(sessionId, tokens, now = Date.now()) {
		this.rollover(now);
		const s = (this.sessionTokens.get(sessionId) ?? 0) + tokens;
		this.sessionTokens.set(sessionId, s);
		this.day.tokens += tokens;
		this.month.tokens += tokens;
	}
	getUsage(sessionId, now = Date.now()) {
		this.rollover(now);
		return {
			session: this.sessionTokens.get(sessionId) ?? 0,
			daily: this.day.tokens,
			monthly: this.month.tokens
		};
	}
	getState(sessionId, now = Date.now()) {
		const usage = this.getUsage(sessionId, now);
		const ratio = this.worstRatio(usage);
		return {
			limits: this.limits,
			usage,
			overBudget: ratio >= 1,
			warnAt: this.warnAt
		};
	}
	worstRatio(usage) {
		let worst = 0;
		if (this.limits.session && this.limits.session > 0) worst = Math.max(worst, usage.session / this.limits.session);
		if (this.limits.daily && this.limits.daily > 0) worst = Math.max(worst, usage.daily / this.limits.daily);
		if (this.limits.monthly && this.limits.monthly > 0) worst = Math.max(worst, usage.monthly / this.limits.monthly);
		return worst;
	}
	advise(sessionId, now = Date.now()) {
		const state = this.getState(sessionId, now);
		const ratio = this.worstRatio(state.usage);
		if (ratio >= 1) return {
			downgrade: true,
			action: "both",
			reason: `budget exceeded (${(ratio * 100).toFixed(0)}%)`
		};
		if (ratio >= this.warnAt) return {
			downgrade: true,
			action: "increase_compression",
			reason: `budget warning threshold reached (${(ratio * 100).toFixed(0)}%)`
		};
		return {
			downgrade: false,
			action: "none",
			reason: "budget healthy"
		};
	}
	reset(sessionId) {
		if (sessionId) this.sessionTokens.delete(sessionId);
		else this.sessionTokens.clear();
	}
	export() {
		return {
			limits: this.limits,
			usage: {
				sessions: Object.fromEntries(this.sessionTokens),
				day: this.day,
				month: this.month
			}
		};
	}
};
//#endregion
//#region .build/host/host/surface-parsers.js
function extractText(event) {
	const data = event["data"] ?? {};
	const content = (data["message"] ?? data)["content"];
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts = [];
		for (const block of content) {
			if (typeof block === "string") {
				parts.push(block);
				continue;
			}
			if (block && typeof block === "object") {
				const t = block["text"];
				if (typeof t === "string") parts.push(t);
			}
		}
		return parts.join("");
	}
	return "";
}
function extractReasoningText(event) {
	const stream = (event["data"] ?? {})["stream"];
	if (!Array.isArray(stream)) return "";
	const parts = [];
	for (const chunk of stream) {
		if (!chunk || typeof chunk !== "object") continue;
		const c = chunk;
		if (c["type"] === "reasoning" && typeof c["text"] === "string") parts.push(c["text"]);
	}
	return parts.join("");
}
const SURFACE_MARKERS_AGENTS = /AGENTS\.md/i;
const SURFACE_MARKERS_SKILL = /(?:^|\n)\s*(?:#+\s*)?skills?[:\s]/i;
function classifySource(type, text) {
	if (type === "system/message") {
		if (SURFACE_MARKERS_AGENTS.test(text)) return "agents_md";
		if (SURFACE_MARKERS_SKILL.test(text)) return "skills";
		return "system";
	}
	if (type === "user/message") return "user_msg";
	if (type === "assistant/message") return "assistant_msg";
	if (type === "tool/message" || type === "tool/result") return "tool_result";
	return "injected_ctx";
}
function normalizeUsage(usage) {
	const input = numberOr(usage?.["inputTokens"], 0);
	const cacheRead = numberOr(usage?.["cacheReadTokens"], 0);
	const cacheWrite = numberOr(usage?.["cacheWriteTokens"], 0);
	const output = numberOr(usage?.["outputTokens"], 0);
	const prompt = input + cacheRead + cacheWrite;
	const miss = input + cacheWrite;
	const details = usage?.["completion_tokens_details"];
	return {
		prompt_tokens: prompt,
		prompt_cache_hit_tokens: cacheRead,
		prompt_cache_miss_tokens: miss,
		completion_tokens: output,
		completion_tokens_details: { reasoning_tokens: numberOr(details?.["reasoning_tokens"], 0) || numberOr(usage?.["reasoningTokens"], 0) }
	};
}
function signatureOf(seqs) {
	return createHash("sha1").update(seqs.join(",")).digest("hex").slice(0, 16);
}
function numberOr(v, fallback) {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
//#endregion
//#region .build/host/host/session-fold.js
const MAX_SESSIONS = 100;
const MAX_TURNS_PER_SESSION = 200;
const MAX_RISKS = 100;
const MAX_EFFORT_DECISIONS = 100;
var SessionFold = class {
	ctx;
	config;
	health;
	byWeak = new WeakMap();
	byId = new Map();
	tokenizer;
	reasoning;
	budget;
	maxTurns;
	observedEventCount = 0;
	recentEventTypes = [];
	loggedShapes = new Set();
	foldFailures = 0;
	effortDecisions = [];
	cacheRisks = [];
	currentSessionId = "";
	constructor(ctx, config, health, tokenizer) {
		this.ctx = ctx;
		this.config = config;
		this.health = health;
		this.tokenizer = tokenizer ?? new EstimatedTokenizer();
		this.reasoning = new ReasoningTracker(config.hashSalt);
		this.budget = new BudgetTracker({
			session: config.budgetSession || void 0,
			daily: config.budgetDaily || void 0,
			monthly: config.budgetMonthly || void 0
		});
		this.maxTurns = MAX_TURNS_PER_SESSION;
	}
	getTokenizer() {
		return this.tokenizer;
	}
	setTokenizer(tokenizer) {
		if (tokenizer.precision === "exact" && this.tokenizer.precision !== "exact") {
			const prevId = this.tokenizer.id;
			this.tokenizer = tokenizer;
			this.noteEvent(`TOKENIZER: upgraded ${prevId} → ${tokenizer.id} (exact)`);
		}
	}
	isDebug() {
		return this.config.debug;
	}
	noteEvent(line) {
		this.observedEventCount++;
		this.recentEventTypes.push(line);
		if (this.recentEventTypes.length > 500) this.recentEventTypes.splice(0, this.recentEventTypes.length - 500);
	}
	getObservedEventCount() {
		return this.observedEventCount;
	}
	getRecentEventTypes() {
		return [...this.recentEventTypes];
	}
	getFoldFailures() {
		return this.foldFailures;
	}
	getBudgetTracker() {
		return this.budget;
	}
	getCacheRisks(sessionId) {
		if (sessionId) return this.cacheRisks.filter((r) => r.sessionId === sessionId).slice(-20);
		return this.cacheRisks.slice(-20);
	}
	recordEffortDecision(d) {
		this.effortDecisions.push({
			...d,
			at: Date.now()
		});
		if (this.effortDecisions.length > MAX_EFFORT_DECISIONS) this.effortDecisions.splice(0, this.effortDecisions.length - MAX_EFFORT_DECISIONS);
	}
	getEffortDecisions(sessionId) {
		if (sessionId) return this.effortDecisions.filter((e) => e.sessionId === sessionId).slice(-20);
		return this.effortDecisions.slice(-20);
	}
	setCurrentSession(sessionId) {
		if (sessionId) this.currentSessionId = sessionId;
	}
	getCurrentSession() {
		return this.currentSessionId;
	}
	getToolCallCount(sessionId) {
		const state = this.byId.get(sessionId);
		if (!state) return 0;
		if (state.toolCallCount > 0) return state.toolCallCount;
		let surfaceCount = 0;
		for (const n of state.surface) if (n.source === "tool_result") surfaceCount++;
		return surfaceCount;
	}
	observe(session) {
		if (!session || typeof session !== "object") return;
		const s = session;
		if (typeof s["id"] === "string" && typeof s["seq"] === "number") this.health.checkSession(session);
		const seq = typeof s["seq"] === "number" ? s["seq"] : 0;
		const eventAt = s["eventAt"];
		const state = this.stateOf(s);
		if (!this.loggedShapes.has(session)) {
			this.loggedShapes.add(session);
			this.noteEvent(`OBSERVE: id=${state.sessionId} seq=${seq} hasEventAt=${typeof eventAt === "function"}`);
		}
		if (typeof eventAt !== "function") return;
		if (seq <= state.consumed) return;
		let failures = 0;
		while (state.consumed < seq) {
			const cursor = state.consumed;
			let event;
			try {
				event = eventAt.call(s, cursor);
			} catch {
				failures++;
				this.foldFailures++;
				state.consumed = cursor + 1;
				continue;
			}
			if (event) try {
				this.foldEvent(state, event);
			} catch {
				failures++;
				this.foldFailures++;
			}
			state.consumed = cursor + 1;
		}
		if (state.turns.length > 0) this.noteEvent(`OBSERVE: done id=${state.sessionId} turns=${state.turns.length} failures=${failures}`);
	}
	stateOf(session) {
		const cached = this.byWeak.get(session);
		if (cached) {
			cached.lastAccessedAt = Date.now();
			return cached;
		}
		const id = this.idOf(session);
		const existing = this.byId.get(id);
		if (existing) {
			this.byWeak.set(session, existing);
			existing.lastAccessedAt = Date.now();
			return existing;
		}
		this.evictIfNeeded();
		const s = {
			sessionId: id,
			consumed: 0,
			surface: [],
			header: null,
			chunks: null,
			turns: [],
			lastReasoningHash: null,
			surfaceSignature: null,
			surfaceLength: 0,
			toolCallCount: 0,
			prevSources: [],
			lastAccessedAt: Date.now()
		};
		this.byWeak.set(session, s);
		this.byId.set(id, s);
		return s;
	}
	evictIfNeeded() {
		if (this.byId.size < MAX_SESSIONS) return;
		let oldestKey = null;
		let oldestTs = Infinity;
		for (const [k, v] of this.byId) if (v.lastAccessedAt < oldestTs) {
			oldestTs = v.lastAccessedAt;
			oldestKey = k;
		}
		if (oldestKey) this.byId.delete(oldestKey);
	}
	idOf(session) {
		const s = session;
		return String(s["id"] ?? s["sessionId"] ?? s["key"] ?? "unknown");
	}
	foldEvent(state, event) {
		const type = typeof event["type"] === "string" ? event["type"] : "";
		const data = event["data"] ?? {};
		switch (type) {
			case "request/header":
				state.header = data["header"] ?? null;
				return;
			case "tool/call":
				state.toolCallCount++;
				return;
			case "system/message":
			case "user/message":
			case "assistant/message":
			case "tool/message":
			case "tool/result": {
				this.applySurfaceOp(state, event);
				const node = this.buildSurfaceNode(event);
				if (node) state.surface.push(node);
				this.checkSurfaceChange(state);
				if (type === "assistant/message") this.settleTurn(state, event);
				return;
			}
			case "compaction/summary":
			case "compaction/prune": {
				const prevLen = state.surface.length;
				this.recordCacheRisk({
					sessionId: state.sessionId,
					kind: "compaction",
					at: Date.now(),
					prevLen,
					nextLen: 0,
					detail: type === "compaction/summary" ? "上下文被摘要替换" : "上下文被裁剪"
				});
				state.chunks = null;
				state.prevSources = [];
				return;
			}
			case "llm/retry-started": {
				const turn = data["turn"];
				const step = data["step"];
				if (state.surface[state.surface.length - 1] && turn !== void 0 && step !== void 0) {
					state.surface.pop();
					this.checkSurfaceChange(state);
				}
				return;
			}
			default: return;
		}
	}
	checkSurfaceChange(state) {
		const seqs = state.surface.map((n) => n.seq);
		const nextSig = signatureOf(seqs);
		const nextLen = seqs.length;
		const currentSources = state.surface.map((n) => n.source);
		if (state.surfaceSignature === null) {
			state.surfaceSignature = nextSig;
			state.surfaceLength = nextLen;
			state.prevSources = currentSources;
			return;
		}
		if (nextSig === state.surfaceSignature) return;
		const prevLen = state.surfaceLength;
		state.surfaceSignature = nextSig;
		state.surfaceLength = nextLen;
		if (nextLen > prevLen) {
			state.prevSources = currentSources;
			return;
		}
		const changedSet = new Set();
		if (nextLen < prevLen) {
			if (prevLen - nextLen >= 2) {
				state.prevSources.slice(nextLen, prevLen).forEach((s) => changedSet.add(s));
				this.recordCacheRisk({
					sessionId: state.sessionId,
					kind: "shrink",
					at: Date.now(),
					prevLen,
					nextLen,
					detail: `surface 从 ${prevLen} 条缩短到 ${nextLen} 条，下一轮缓存将部分失效`,
					changedSources: Array.from(changedSet)
				});
			}
			state.prevSources = currentSources;
			return;
		}
		let firstDiffIdx = -1;
		for (let i = 0; i < nextLen; i++) if (state.prevSources[i] !== currentSources[i]) {
			firstDiffIdx = i;
			break;
		}
		if (firstDiffIdx !== -1) {
			changedSet.add(currentSources[firstDiffIdx] ?? "unknown");
			for (let i = firstDiffIdx; i < nextLen; i++) changedSet.add(currentSources[i] ?? "unknown");
		}
		this.recordCacheRisk({
			sessionId: state.sessionId,
			kind: "replace",
			at: Date.now(),
			prevLen,
			nextLen,
			detail: "surface 中间被替换，从其位置起的缓存前缀失效",
			changedSources: Array.from(changedSet)
		});
		state.prevSources = currentSources;
	}
	recordCacheRisk(r) {
		this.cacheRisks.push(r);
		if (this.cacheRisks.length > MAX_RISKS) this.cacheRisks.splice(0, this.cacheRisks.length - MAX_RISKS);
		this.emitUpdate(r.sessionId);
	}
	applySurfaceOp(state, event) {
		const op = event["surfaceOp"];
		if (!op || typeof op !== "object") return;
		const o = op;
		if (o["startSeq"] === void 0 || o["endSeq"] === void 0) return;
		const start = Number(o["startSeq"]);
		const end = Number(o["endSeq"]);
		const startIdx = state.surface.findIndex((n) => n.seq === start);
		const endIdx = state.surface.findIndex((n) => n.seq === end);
		if (startIdx >= 0 && endIdx >= startIdx) state.surface.splice(startIdx, endIdx - startIdx + 1);
	}
	buildSurfaceNode(event) {
		const type = String(event["type"] ?? "");
		const seq = typeof event["seq"] === "number" ? event["seq"] : -1;
		if (seq < 0) return null;
		const text = extractText(event);
		return {
			seq,
			source: classifySource(type, text),
			text,
			isReasoning: type === "assistant/message" && extractReasoningText(event).length > 0,
			tokens: text ? this.tokenizer.count(text) : 0
		};
	}
	settleTurn(state, event) {
		const usage = (event["data"] ?? {})["usage"];
		const segments = state.surface.filter((n) => !n.isReasoning).map((n) => ({
			source: n.source,
			text: n.text,
			tokenCount: n.tokens
		}));
		const reasoningText = extractReasoningText(event);
		if (reasoningText) segments.push({
			source: "assistant_msg",
			text: reasoningText,
			isReasoning: true
		});
		const normalized = normalizeUsage(usage);
		const hasTools = !!(state.header && typeof state.header === "object" && Array.isArray(state.header["tools"]) && state.header["tools"].length > 0);
		const model = this.modelOf(state);
		const { attribution, chunks } = attributeTurn(`${state.sessionId}#${state.turns.length + 1}`, model, segments, normalized, this.tokenizer, {
			blockSize: this.config.blockSize,
			driftThreshold: this.config.driftThreshold,
			hashSalt: this.config.hashSalt,
			previousChunks: state.chunks,
			contextChanged: {
				systemPrompt: false,
				toolsSchema: false,
				model: false
			},
			hasTools,
			reasoningContent: reasoningText || null
		});
		state.turns.push(attribution);
		if (state.turns.length > this.maxTurns) state.turns.splice(0, state.turns.length - this.maxTurns);
		state.chunks = chunks;
		this.reasoning.record(attribution.turnId, reasoningText, attribution.reasoning.producedThisTurn, hasTools);
		state.lastReasoningHash = attribution.reasoning.contentHash;
		const total = normalized.prompt_tokens + normalized.completion_tokens;
		this.budget.record(state.sessionId, total);
		this.emitUpdate(state.sessionId);
	}
	emitUpdate(sessionId) {
		try {
			this.ctx.emit?.("tokenOptima/updated", sessionId);
		} catch {}
	}
	modelOf(state) {
		const h = state.header;
		if (h && typeof h === "object") {
			const config = h["config"];
			if (config && typeof config === "object") {
				const model = config["model"];
				if (typeof model === "string" && model) return model;
			}
		}
		return "deepseek-chat";
	}
	report(sessionId) {
		const turns = this.byId.get(sessionId)?.turns ?? [];
		return {
			sessionId,
			turns: turns.length,
			latest: turns[turns.length - 1] ?? null,
			history: turns,
			budget: this.budget.getState(sessionId),
			tokenizer: {
				id: this.tokenizer.id,
				precision: this.tokenizer.precision
			},
			effort: this.getEffortDecisions(sessionId),
			cacheRisks: this.getCacheRisks(sessionId),
			foldFailures: this.foldFailures,
			debug: this.config.debug,
			health: this.health.snapshot(),
			currentSessionId: this.currentSessionId,
			toolCallCount: this.getToolCallCount(sessionId)
		};
	}
	composition(sessionId) {
		const state = this.byId.get(sessionId);
		const latest = state?.turns[state.turns.length - 1];
		if (!latest) return [];
		return CATEGORIES.map((c) => {
			const m = latest.categories[c.id];
			return {
				id: c.id,
				key: c.key,
				label: c.label,
				group: c.group,
				value: m?.value ?? 0,
				precision: m?.precision ?? "inferred"
			};
		});
	}
	groups(sessionId) {
		const comp = this.composition(sessionId);
		return CATEGORY_GROUPS.map((g) => ({
			group: g.group,
			label: g.label,
			value: g.ids.reduce((a, id) => a + (comp.find((c) => c.id === id)?.value ?? 0), 0)
		}));
	}
	listSessions() {
		const out = [];
		for (const [id, state] of this.byId) {
			let totalCost = 0;
			let totalSaved = 0;
			let totalTokens = 0;
			for (const t of state.turns) {
				totalCost += t.cost?.total ?? 0;
				totalSaved += t.cost?.savedByCache ?? 0;
				totalTokens += (t.usage.prompt_tokens ?? 0) + (t.usage.completion_tokens ?? 0);
			}
			out.push({
				sessionId: id,
				turns: state.turns.length,
				lastTs: state.turns[state.turns.length - 1]?.timestamp ?? 0,
				model: this.modelOf(state),
				totalTokens,
				totalCost,
				totalSaved
			});
		}
		out.sort((a, b) => b.lastTs - a.lastTs);
		return out;
	}
	exportCsv(sessionId) {
		return toCsv(this.byId.get(sessionId)?.turns ?? []);
	}
	tokenizerInfo() {
		return {
			id: this.tokenizer.id,
			precision: this.tokenizer.precision
		};
	}
	audit(sessionId, messageId) {
		const state = this.byId.get(sessionId);
		if (!state) return {
			sessionId,
			messageId,
			content: null,
			note: "session not tracked"
		};
		const node = state.surface.find((n) => String(n.seq) === messageId);
		if (!node) return {
			sessionId,
			messageId,
			content: null,
			note: "message not found in current retained surface (may have been compacted)"
		};
		return {
			sessionId,
			messageId,
			content: node.text,
			note: `source=${node.source} tokens=${node.tokens}`
		};
	}
	dispose() {
		this.byId.clear();
		this.reasoning.reset();
		this.loggedShapes.clear();
		this.effortDecisions.length = 0;
		this.cacheRisks.length = 0;
		this.currentSessionId = "";
	}
};
//#endregion
//#region .build/host/host/health-probe.js
const HEALTH_FILE = join(homedir(), ".dsh", "token-optima", "health.json");
var HealthProbe = class {
	failures = new Map();
	flushPending = false;
	flushTimer = null;
	fail(item, detail) {
		if (this.failures.get(item) === detail) return;
		this.failures.set(item, detail);
		console.error(`[dsh-token-optima] interface drift: ${item} (${detail})`);
		this.scheduleFlush();
	}
	pass(item) {
		if (!this.failures.has(item)) return;
		this.failures.delete(item);
		this.scheduleFlush();
	}
	checkSession(session) {
		if (!session || typeof session !== "object") return;
		const s = session;
		if (typeof s["eventAt"] !== "function") this.fail("session.eventAt", "不是函数，历史重放不可用");
		else this.pass("session.eventAt");
		const surface = s["surface"];
		if (!surface || !Array.isArray(surface["nodes"])) this.fail("session.surface.nodes", "不是数组，surface 追踪不可用");
		else this.pass("session.surface.nodes");
	}
	checkSessionsService(svc) {
		if (!svc || typeof svc !== "object") {
			this.fail("sessions 服务", "不存在");
			return;
		}
		if (![
			"list",
			"all",
			"entries",
			"values"
		].some((m) => typeof svc[m] === "function")) this.fail("sessions 服务", "无可调方法（list/all/entries/values）");
		else this.pass("sessions 服务");
	}
	checkEffortPolicy(ok, detail) {
		if (ok) this.pass("agent/request");
		else this.fail("agent/request", detail ?? "挂载失败");
	}
	snapshot() {
		return {
			at: Date.now(),
			ok: this.failures.size === 0,
			failures: [...this.failures.entries()].map(([item, detail]) => ({
				item,
				detail
			}))
		};
	}
	scheduleFlush() {
		if (this.flushPending) return;
		this.flushPending = true;
		this.flushTimer = setTimeout(() => {
			this.flushPending = false;
			this.flushTimer = null;
			this.flush();
		}, 200);
		this.flushTimer.unref?.();
	}
	async flush() {
		try {
			await mkdir(dirname(HEALTH_FILE), { recursive: true });
			await writeFile(HEALTH_FILE, JSON.stringify(this.snapshot(), null, 2), "utf8");
		} catch {}
	}
	dispose() {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.flushPending = false;
	}
};
//#endregion
//#region .build/host/host/tools.js
function registerTools(ctx, fold) {
	let tools;
	try {
		const getFn = ctx?.get;
		if (typeof getFn === "function") tools = getFn.call(ctx, "tools", false);
	} catch {
		tools = void 0;
	}
	if (!tools?.register) {
		console.warn("[dsh-token-optima] ctx.tools unavailable; token_report / context_audit not registered");
		return;
	}
	tools.register({
		name: "token_report",
		description: "返回当前会话的 14 类 Token 归因数据（只读）。每项标注精度：exact（API 真值）/ inferred（推断）/ estimated（估算）。",
		parameters: {
			type: "object",
			properties: {
				sessionId: {
					type: "string",
					description: "会话 ID"
				},
				format: {
					type: "string",
					enum: ["json", "csv"],
					description: "返回格式，默认 json"
				}
			},
			required: ["sessionId"]
		},
		output: {
			schema: { type: "object" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args) {
			const sessionId = String(args["sessionId"] ?? "");
			if ((args["format"] === "csv" ? "csv" : "json") === "csv") return {
				format: "csv",
				content: fold.exportCsv(sessionId)
			};
			return {
				format: "json",
				report: fold.report(sessionId),
				composition: fold.composition(sessionId),
				groups: fold.groups(sessionId)
			};
		}
	});
	tools.register({
		name: "context_audit",
		description: "展开当前保留 surface 中指定消息的原始文本（只读）。已被压缩替换的消息不再可见。",
		parameters: {
			type: "object",
			properties: {
				sessionId: { type: "string" },
				messageId: {
					type: "string",
					description: "surface 节点的 seq"
				}
			},
			required: ["sessionId", "messageId"]
		},
		output: {
			schema: { type: "object" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args) {
			return fold.audit(String(args["sessionId"] ?? ""), String(args["messageId"] ?? ""));
		}
	});
}
//#endregion
//#region .build/host/core/effort.js
const CODE_RE = /```[\s\S]*```|function\s+\w+|class\s+\w+|def\s+\w+/;
const MATH_RE = /证明|推导|计算|求|分析|比较|推导|prove|derive|analyze|compare|calculate/i;
function extractSignals(segments, toolCalls, hint = null) {
	let userTokens = 0;
	let hasCode = false;
	let hasMath = false;
	for (const seg of segments) {
		if (seg.source !== "user_msg") continue;
		userTokens += seg.tokenCount ?? seg.text.length;
		if (CODE_RE.test(seg.text)) hasCode = true;
		if (MATH_RE.test(seg.text)) hasMath = true;
	}
	return {
		userTokens,
		hasCode,
		hasMath,
		toolCalls,
		hint
	};
}
function classifyComplexity(signal) {
	if (signal.hint) return signal.hint;
	let score = 0;
	if (signal.userTokens > 800) score += 2;
	else if (signal.userTokens > 300) score += 1;
	if (signal.hasCode) score += 2;
	if (signal.hasMath) score += 2;
	if (signal.toolCalls > 5) score += 1;
	if (score >= 5) return "max";
	if (score >= 3) return "high";
	if (score >= 1) return "high";
	return "low";
}
function decideEffort(signal, budgetPressure) {
	const base = classifyComplexity(signal);
	if (budgetPressure && base === "high" && signal.userTokens < 200 && !signal.hasMath && !signal.hasCode) return {
		level: "low",
		reason: "budget pressure + low complexity heuristic"
	};
	return {
		level: base,
		reason: "complexity heuristic"
	};
}
//#endregion
//#region .build/host/host/effort-policy.js
const VALID_LEVELS = new Set([
	"low",
	"high",
	"max"
]);
function isLevel(s) {
	return typeof s === "string" && VALID_LEVELS.has(s);
}
function downgradeOne(level) {
	if (level === "max") return "high";
	if (level === "high") return "low";
	return "low";
}
function extractLatestUserText(session) {
	if (!session || typeof session !== "object") return "";
	const s = session;
	const nodes = s["surface"]?.["nodes"];
	if (!Array.isArray(nodes)) return "";
	const eventAt = s["eventAt"];
	if (typeof eventAt !== "function") return "";
	for (let i = nodes.length - 1; i >= 0; i--) {
		const seq = nodes[i];
		if (typeof seq !== "number") continue;
		let ev;
		try {
			ev = eventAt.call(s, seq);
		} catch {
			continue;
		}
		if (!ev || typeof ev !== "object") continue;
		const e = ev;
		if (e["type"] !== "user/message") continue;
		const data = e["data"] ?? {};
		const content = (data["message"] ?? data)["content"];
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			const parts = [];
			for (const b of content) if (typeof b === "string") parts.push(b);
			else if (b && typeof b === "object") {
				const t = b["text"];
				if (typeof t === "string") parts.push(t);
			}
			return parts.join("");
		}
		return "";
	}
	return "";
}
function decideEffort$1(fold, config, sessionId, currentEffort, session, toolCalls) {
	const advice = fold.getBudgetTracker().advise(sessionId);
	if (advice.downgrade) {
		const target = downgradeOne(currentEffort);
		if (target !== currentEffort) return {
			level: target,
			reason: advice.reason
		};
		return {
			level: currentEffort,
			reason: "budget no-op"
		};
	}
	if (!config.dynamicEffort) return {
		level: currentEffort,
		reason: "dynamic-effort disabled"
	};
	const userText = extractLatestUserText(session);
	if (!userText) return {
		level: currentEffort,
		reason: "no user text"
	};
	const signals = extractSignals([{
		source: "user_msg",
		text: userText
	}], toolCalls, null);
	const decided = classifyComplexity(signals);
	if (isLevel(decided) && decided !== currentEffort) return {
		level: decided,
		reason: `complexity heuristic (userTokens=${signals.userTokens} toolCalls=${toolCalls})`
	};
	return {
		level: currentEffort,
		reason: `keep (heuristic=${decided} userTokens=${signals.userTokens} toolCalls=${toolCalls})`
	};
}
const effortProbeCache = new Map();
function safeGetLlm(rootCtx, ctx) {
	const tryGet = (c) => {
		if (!c || typeof c !== "object") return void 0;
		try {
			const getFn = c.get;
			if (typeof getFn === "function") {
				const r = getFn.call(c, "llm");
				if (r !== void 0) return r;
			}
		} catch {}
	};
	return tryGet(rootCtx) ?? tryGet(ctx) ?? void 0;
}
async function resolveModelEfforts(llm, provider, model, signal) {
	if (!llm || typeof llm !== "object") return null;
	const fn = llm["resolveModelInfo"];
	if (typeof fn !== "function") return null;
	try {
		const info = await fn.call(llm, provider, model, signal);
		if (!info || typeof info !== "object") return null;
		const r = info["reasoning"];
		if (!r || typeof r !== "object") return null;
		const ro = r;
		const raw = ro["efforts"];
		if (!Array.isArray(raw)) return null;
		const efforts = [];
		for (const e of raw) if (typeof e === "string") efforts.push(e);
		else if (e && typeof e === "object") {
			const id = e["id"];
			if (typeof id === "string") efforts.push(id);
		}
		if (efforts.length === 0) return null;
		const defRaw = ro["defaultEffort"];
		return {
			efforts,
			defaultEffort: typeof defRaw === "string" && efforts.includes(defRaw) ? defRaw : efforts[0]
		};
	} catch {
		return null;
	}
}
function installEffortPolicy(ctx, config, fold, health) {
	const rootCtx = ctx.root ?? ctx;
	const llmService = safeGetLlm(rootCtx, ctx);
	fold.noteEvent(llmService ? "EFFORT-POLICY: llm service available, probe enabled" : "EFFORT-POLICY: llm service not found, probe disabled");
	const makeHandler = () => {
		return async (payload, next) => {
			const seed = await next();
			try {
				if (!seed || typeof seed !== "object") return seed;
				const p = payload ?? {};
				const signal = p["signal"];
				if (signal?.aborted) return seed;
				const session = p["agent"]?.["session"];
				const sessionId = session && typeof session === "object" ? String(session["id"] ?? "") : "";
				if (!sessionId) return seed;
				fold.setCurrentSession(sessionId);
				const toolCalls = fold.getToolCallCount(sessionId);
				const seedObj = seed;
				if (typeof seedObj["reasoningEffort"] === "string") {
					const currentEffort = seedObj["reasoningEffort"];
					const decision = decideEffort$1(fold, config, sessionId, currentEffort, session, toolCalls);
					fold.recordEffortDecision({
						sessionId,
						previous: currentEffort,
						decided: decision.level,
						reason: decision.reason
					});
					if (decision.level !== currentEffort) return {
						...seedObj,
						reasoningEffort: decision.level
					};
					return seed;
				}
				const provider = typeof seedObj["provider"] === "string" ? seedObj["provider"] : "";
				const model = typeof seedObj["model"] === "string" ? seedObj["model"] : "";
				if (llmService && provider && model) {
					const cacheKey = `${provider}#${model}`;
					let probe = effortProbeCache.get(cacheKey);
					if (probe === void 0) {
						probe = await resolveModelEfforts(llmService, provider, model, signal);
						effortProbeCache.set(cacheKey, probe);
					}
					if (probe) {
						const decided = classifyComplexity(extractSignals([{
							source: "user_msg",
							text: extractLatestUserText(session)
						}], toolCalls, null));
						const target = probe.efforts.includes(decided) ? decided : probe.defaultEffort;
						fold.recordEffortDecision({
							sessionId,
							previous: "n/a",
							decided: target,
							reason: `injected reasoningEffort=${target} (supported=[${probe.efforts.join(",")}])`
						});
						return {
							...seedObj,
							reasoningEffort: target
						};
					}
				}
				fold.recordEffortDecision({
					sessionId,
					previous: "n/a",
					decided: "unsupported",
					reason: "当前模型未启用 reasoningEffort 控制"
				});
				return seed;
			} catch (err) {
				fold.noteEvent(`EFFORT-POLICY: error ${err.message}`);
			}
			return seed;
		};
	};
	const handlerCtx = makeHandler();
	const handlerRoot = makeHandler();
	try {
		ctx.on("agent/request", handlerCtx);
		fold.noteEvent("EFFORT-POLICY: attached on ctx");
	} catch (err) {
		fold.noteEvent(`EFFORT-POLICY: ctx attach failed: ${err.message}`);
	}
	if (rootCtx !== ctx) try {
		rootCtx.on("agent/request", handlerRoot);
		fold.noteEvent("EFFORT-POLICY: attached on root (2nd)");
	} catch (err) {
		fold.noteEvent(`EFFORT-POLICY: root attach failed: ${err.message}`);
	}
	health.checkEffortPolicy(true);
}
//#endregion
//#region .build/host/index.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const name = "dsh-token-optima";
const inject = ["tools"];
let TokenOptimaController = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _report_decorators;
	let _composition_decorators;
	let _groups_decorators;
	let _listSessions_decorators;
	let _exportCsv_decorators;
	let _audit_decorators;
	let _tokenizerInfo_decorators;
	let _getEffortDecisions_decorators;
	let _getCacheRisks_decorators;
	let _ensureSession_decorators;
	let _debugEventCount_decorators;
	let _debugLastEvents_decorators;
	return class TokenOptimaController extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_report_decorators = [Remote];
			_composition_decorators = [Remote];
			_groups_decorators = [Remote];
			_listSessions_decorators = [Remote];
			_exportCsv_decorators = [Remote];
			_audit_decorators = [Remote];
			_tokenizerInfo_decorators = [Remote];
			_getEffortDecisions_decorators = [Remote];
			_getCacheRisks_decorators = [Remote];
			_ensureSession_decorators = [Remote];
			_debugEventCount_decorators = [Remote];
			_debugLastEvents_decorators = [Remote];
			__esDecorate(this, null, _report_decorators, {
				kind: "method",
				name: "report",
				static: false,
				private: false,
				access: {
					has: (obj) => "report" in obj,
					get: (obj) => obj.report
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _composition_decorators, {
				kind: "method",
				name: "composition",
				static: false,
				private: false,
				access: {
					has: (obj) => "composition" in obj,
					get: (obj) => obj.composition
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _groups_decorators, {
				kind: "method",
				name: "groups",
				static: false,
				private: false,
				access: {
					has: (obj) => "groups" in obj,
					get: (obj) => obj.groups
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listSessions_decorators, {
				kind: "method",
				name: "listSessions",
				static: false,
				private: false,
				access: {
					has: (obj) => "listSessions" in obj,
					get: (obj) => obj.listSessions
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _exportCsv_decorators, {
				kind: "method",
				name: "exportCsv",
				static: false,
				private: false,
				access: {
					has: (obj) => "exportCsv" in obj,
					get: (obj) => obj.exportCsv
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _audit_decorators, {
				kind: "method",
				name: "audit",
				static: false,
				private: false,
				access: {
					has: (obj) => "audit" in obj,
					get: (obj) => obj.audit
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _tokenizerInfo_decorators, {
				kind: "method",
				name: "tokenizerInfo",
				static: false,
				private: false,
				access: {
					has: (obj) => "tokenizerInfo" in obj,
					get: (obj) => obj.tokenizerInfo
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _getEffortDecisions_decorators, {
				kind: "method",
				name: "getEffortDecisions",
				static: false,
				private: false,
				access: {
					has: (obj) => "getEffortDecisions" in obj,
					get: (obj) => obj.getEffortDecisions
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _getCacheRisks_decorators, {
				kind: "method",
				name: "getCacheRisks",
				static: false,
				private: false,
				access: {
					has: (obj) => "getCacheRisks" in obj,
					get: (obj) => obj.getCacheRisks
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _ensureSession_decorators, {
				kind: "method",
				name: "ensureSession",
				static: false,
				private: false,
				access: {
					has: (obj) => "ensureSession" in obj,
					get: (obj) => obj.ensureSession
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _debugEventCount_decorators, {
				kind: "method",
				name: "debugEventCount",
				static: false,
				private: false,
				access: {
					has: (obj) => "debugEventCount" in obj,
					get: (obj) => obj.debugEventCount
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _debugLastEvents_decorators, {
				kind: "method",
				name: "debugLastEvents",
				static: false,
				private: false,
				access: {
					has: (obj) => "debugLastEvents" in obj,
					get: (obj) => obj.debugLastEvents
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		fold = __runInitializers(this, _instanceExtraInitializers);
		replayFn;
		constructor(ctx, fold, replayFn) {
			super(ctx, "tokenOptima", { namespace: "tokenOptima" });
			this.fold = fold;
			this.replayFn = replayFn;
		}
		async report(sessionId) {
			return this.fold.report(sessionId);
		}
		async composition(sessionId) {
			return this.fold.composition(sessionId);
		}
		async groups(sessionId) {
			return this.fold.groups(sessionId);
		}
		async listSessions() {
			return this.fold.listSessions();
		}
		async exportCsv(sessionId) {
			return this.fold.exportCsv(sessionId);
		}
		async audit(sessionId, messageId) {
			return this.fold.audit(sessionId, messageId);
		}
		async tokenizerInfo() {
			return this.fold.tokenizerInfo();
		}
		async getEffortDecisions(sessionId) {
			return this.fold.getEffortDecisions(sessionId);
		}
		async getCacheRisks(sessionId) {
			return this.fold.getCacheRisks(sessionId);
		}
		async ensureSession() {
			const before = this.fold.listSessions().length;
			this.replayFn();
			return this.fold.listSessions().length - before;
		}
		async debugEventCount() {
			if (!this.fold.isDebug()) return -1;
			return this.fold.getObservedEventCount();
		}
		async debugLastEvents() {
			if (!this.fold.isDebug()) return [];
			return this.fold.getRecentEventTypes();
		}
	};
})();
function safeGet(obj, key) {
	if (obj == null || typeof obj !== "object") return void 0;
	try {
		return Reflect.get(obj, key);
	} catch {
		return;
	}
}
function getServiceSafe(c, key) {
	try {
		const getFn = c?.get;
		if (typeof getFn === "function") return getFn.call(c, key, false);
	} catch {}
}
async function resolveHostTokenizer() {
	const jsonPath = process.env.DSH_TOKENIZER_JSON;
	if (!jsonPath) {
		const resolved = await resolveTokenizer();
		if (resolved.warning) console.warn(`[dsh-token-optima] tokenizer: ${resolved.warning}`);
		return resolved.tokenizer;
	}
	const configPath = process.env.DSH_TOKENIZER_CONFIG;
	try {
		const enc = await loadHfTokenizer(jsonPath, configPath);
		const resolved = await resolveTokenizer({ hfLoader: async () => enc });
		if (resolved.warning) console.warn(`[dsh-token-optima] ${resolved.warning}`);
		return resolved.tokenizer;
	} catch (err) {
		const resolved = await resolveTokenizer();
		if (resolved.warning) console.warn(`[dsh-token-optima] HF tokenizer load failed (${err.message}); falling back to estimation.`);
		return resolved.tokenizer;
	}
}
function apply(ctx, config) {
	const health = new HealthProbe();
	const fold = new SessionFold(ctx, config, health);
	let disposed = false;
	fold.noteEvent("APPLY: entered");
	resolveHostTokenizer().then((tokenizer) => {
		if (disposed) return;
		if (tokenizer.precision === "exact") {
			fold.setTokenizer(tokenizer);
			fold.noteEvent(`APPLY: exact tokenizer ready (${tokenizer.id})`);
		} else fold.noteEvent(`APPLY: tokenizer fallback (${tokenizer.id})`);
	}).catch((err) => {
		fold.noteEvent(`APPLY: tokenizer init error ${err.message}`);
	});
	if (!config.enabled) {
		fold.noteEvent("APPLY: disabled by config");
		return;
	}
	const rootCtx = safeGet(ctx, "root") ?? ctx;
	fold.noteEvent(`APPLY: rootCtx same as ctx = ${rootCtx === ctx}`);
	const checkSessionsSvc = () => {
		try {
			const svc = getServiceSafe(rootCtx, "sessions") ?? getServiceSafe(ctx, "sessions");
			health.checkSessionsService(svc);
		} catch (err) {
			health.fail("sessions 服务", `探测抛错：${err.message}`);
		}
	};
	const replay = () => {
		try {
			const sessionsSvc = getServiceSafe(rootCtx, "sessions") ?? getServiceSafe(ctx, "sessions");
			health.checkSessionsService(sessionsSvc);
			if (!sessionsSvc || typeof sessionsSvc !== "object") {
				fold.noteEvent("REPLAY: sessions service not found");
				return;
			}
			const svc = sessionsSvc;
			const lists = [];
			for (const method of [
				"list",
				"all",
				"entries",
				"values"
			]) try {
				const fn = svc[method];
				if (typeof fn === "function") {
					const r = fn.call(sessionsSvc);
					if (Array.isArray(r)) lists.push(r);
					else if (r instanceof Map) lists.push([...r.values()]);
					else if (r && typeof r === "object" && Symbol.iterator in r) lists.push([...r]);
				}
			} catch {}
			for (const prop of [
				"sessions",
				"map",
				"items",
				"store",
				"registry"
			]) try {
				const v = svc[prop];
				if (v instanceof Map) lists.push([...v.values()]);
				else if (Array.isArray(v)) lists.push(v);
			} catch {}
			let observed = 0;
			const seen = new Set();
			for (const list of lists) for (const s of list) {
				if (!s || typeof s !== "object" || seen.has(s)) continue;
				seen.add(s);
				try {
					fold.observe(s);
					observed++;
				} catch {}
			}
			if (observed > 0) fold.noteEvent(`REPLAY: observed=${observed} lists=${lists.length}`);
		} catch (err) {
			fold.noteEvent(`REPLAY: error ${err.message}`);
		}
	};
	if (!getServiceSafe(ctx, "tokenOptima")) {
		const controller = new TokenOptimaController(ctx, fold, replay);
		try {
			const methods = remoteMethods(controller);
			console.log(`[dsh-token-optima] loaded (${methods.length} remote methods)`);
		} catch {
			console.log("[dsh-token-optima] loaded");
		}
	} else {
		fold.noteEvent("APPLY: tokenOptima already registered, skipping controller");
		console.log("[dsh-token-optima] tokenOptima service already exists, skipping duplicate registration.");
	}
	installEffortPolicy(ctx, config, fold, health);
	const loose = ctx;
	const kick = () => {
		try {
			loose.emit("internal/service");
		} catch {}
		try {
			const gw = getServiceSafe(ctx, "typertGateway");
			if (gw) gw["srcClaims"] = void 0;
		} catch {}
	};
	const effect = loose.effect;
	if (typeof effect === "function") {
		effect(() => {
			const timers = [];
			timers.push(setTimeout(kick, 100));
			timers.push(setTimeout(kick, 1e3));
			timers.push(setTimeout(kick, 5e3));
			timers.push(setTimeout(replay, 500));
			timers.push(setTimeout(replay, 2e3));
			timers.push(setTimeout(replay, 6e3));
			timers.push(setInterval(replay, 5e3));
			timers.push(setInterval(checkSessionsSvc, 3e4));
			return () => {
				for (const t of timers) {
					clearTimeout(t);
					clearInterval(t);
				}
			};
		}, "token-optima/timers");
		effect(() => {
			const handler = (s) => {
				try {
					fold.observe(s);
				} catch (err) {
					fold.noteEvent(`EVENT: plugin-ctx error ${err.message}`);
				}
			};
			loose.on("session/event", handler);
			const rootHandler = (s) => {
				try {
					fold.observe(s);
				} catch (err) {
					fold.noteEvent(`EVENT: root-ctx error ${err.message}`);
				}
			};
			if (rootCtx !== ctx) rootCtx.on("session/event", rootHandler);
			return () => {};
		}, "token-optima/session-event");
		effect(() => {
			return () => {
				disposed = true;
				health.dispose();
				fold.dispose();
			};
		}, "token-optima/dispose");
	} else {
		setTimeout(kick, 100);
		setTimeout(kick, 1e3);
		setTimeout(kick, 5e3);
		setTimeout(replay, 500);
		setTimeout(replay, 2e3);
		setTimeout(replay, 6e3);
		const replayTimer = setInterval(replay, 5e3);
		const healthTimer = setInterval(checkSessionsSvc, 3e4);
		loose.on("session/event", (s) => {
			try {
				fold.observe(s);
			} catch (err) {
				fold.noteEvent(`EVENT: plugin-ctx error ${err.message}`);
			}
		});
		if (rootCtx !== ctx) rootCtx.on("session/event", (s) => {
			try {
				fold.observe(s);
			} catch (err) {
				fold.noteEvent(`EVENT: root-ctx error ${err.message}`);
			}
		});
		loose.on("dispose", () => {
			disposed = true;
			clearInterval(replayTimer);
			clearInterval(healthTimer);
			health.dispose();
			fold.dispose();
		});
	}
	if (config.inlineTools) registerTools(ctx, fold);
}
//#endregion
export { BudgetTracker, CACHE_BLOCK_SIZE, CATEGORIES, CATEGORY_BY_ID, CATEGORY_GROUPS, Config, EstimatedTokenizer, HealthProbe, NS, NativeTokenizer, ReasoningTracker, SOURCES, SessionFold, apply, attributeTurn, buildChunks, classifyComplexity, compareChunks, createBpeEncoder, decideEffort, distributeChunksBySource, extractSignals, inject, loadHfTokenizer, measured, name, resolveTokenizer, sha256, summarizeBlocks };
