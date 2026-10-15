# Architecture

## 分层

    dsh-token-optima/
    ├── src/core/      核心算法层（零 DSH 依赖，纯 TS）
    ├── src/host/      DSH Host 半（拦截、存储、插件入口）
    ├── src/pricing/   费率适配器（独立可插拔）
    └── src/client/    Web UI 半（框架无关渲染）

## 数据流

    请求组装前
      ├─ RequestInterceptor.classifyRequest   → SourceSegment[]
      ├─ Effort.decideEffort                   → low/high/max
      ├─ Compressor.compressContext            → 压缩后片段
      └─ 宿主发出请求

    响应返回后
      ├─ Attribution.attributeTurn
      │    ├─ 64 token 块前缀哈希
      │    ├─ 缓存命中/未命中判定
      │    ├─ 与 API usage 真值对齐
      │    └─ 14 类投影 + 坐标矩阵
      ├─ ReasoningTracker.record
      ├─ BudgetTracker.record
      └─ Telemetry.recordMetric

## 坐标模型

    token_coordinate = (source, cache_status, direction, is_reasoning)

    14 类是坐标空间上的投影视图，不是底层模型。
    这样可以保证各视图之间不重复计数。

## 模块职责

| 模块 | 职责 |
|---|---|
| core/tokenizer | DeepSeek tokenizer 三层降级链 |
| core/cache-model | 64 token 块前缀哈希与命中判定 |
| core/attribution | 坐标归因 + API 真值对齐 |
| core/compressor | DAG 三遍法 + 白名单 + 思维链剪枝 |
| core/effort | 任务复杂度分类 + reasoning_effort 决策 |
| core/budget | 预算跟踪与降级建议 |
| core/reasoning | 推理 token 生命周期 |
| host/interceptor | 请求分类 + 背压队列 + 看门狗 |
| host/store | 会话级归因结果存储 |
| host/atomic-config | 原子写 + 备份 + 路径防护 |
| host/telemetry | OTel 兼容遥测 |
| pricing | 独立费率适配器 |
| client | 协议 + 框架无关渲染 |