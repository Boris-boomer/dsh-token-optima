# Algorithms

## 前缀哈希

对序列化后的 token ID 序列计算累积哈希：

    hash_i = SHA256(hash_{i-1} || block_i_text)
    hash_0 = SHA256(model_id || api_version || tokenizer_id
                    || tools_schema_hash || system_prompt_hash)

性质：
- 中间任意位置变更后，其后续所有块哈希全部失效
- 相同前缀 + 相同上下文元信息 → 相同哈希
- 复杂度：O(n) 时间，O(n) 空间

## 64 token 块切分

DeepSeek 缓存系统以 64 tokens 为一个存储单元。

算法：
1. 用 tokenizer 得到 token 序列
2. 按 64 个 token 为单位切分
3. 每块的字符偏移区间用于后续来源分配
4. 不足 64 token 的尾块标记为 incomplete，不参与缓存

复杂度：O(n) 时间。

## 命中判定

对每个当前块：
- incomplete → miss
- 未断裂且哈希 ∈ 上一轮哈希集合 → hit
- 已断裂或哈希不在集合 → write_candidate 或 miss

前缀断裂后，所有后续块不再可能 hit。

## 归因对齐

    客户端估算总量 E = Σ segments.tokens
    真值总量     T = usage.prompt_tokens
    偏差         d = |E - T| / T

- d ≤ 阈值（默认 3%）→ 按比例缩放使 Σ = T
- d > 阈值 → 保留原始估算，残差归入 unattributed

命中/未命中同样按比例缩放至 API 真值：
- 命中总量 = usage.prompt_cache_hit_tokens
- 未命中总量 = usage.prompt_cache_miss_tokens

## DAG 三遍法

### 第 1 遍：剥离机械膨胀
- 去除连续重复行（用 `... [重复行省略 N 行] ...` 替代）
- 超长内容首尾保留，中段标记截断
- 复杂度：O(n)

### 第 2 遍：摘要低密度段
- 保留标题行与首末各 3 行
- 用于工具结果、日志类内容
- 复杂度：O(n)

### 第 3 遍：聚合高层节点
- 相同 source 的连续 summary 合并
- 供后续可选的二次压缩

## 思维链剪枝

对历史轮次 reasoning_content 按段落切分，只保留含决策/结论关键词的段落，
删除失败路径。

关键词集：因为 / 所以 / 结论 / 决定 / 关键 / therefore / because /
decision / conclusion / key finding

若全删则回退到首段，避免完全丢失。

## 预算降级

    ratio = max(usage.session/limits.session,
                usage.daily/limits.daily,
                usage.monthly/limits.monthly)

- ratio ≥ 1        → 降级：lower_effort + increase_compression
- ratio ≥ warnAt   → increase_compression
- 否则             → none