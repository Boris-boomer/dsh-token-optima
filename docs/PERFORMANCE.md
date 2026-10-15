# Performance

## 预算

| 指标 | 目标 |
|---|---|
| P95 拦截开销 | < 5ms |
| CPU 增量 | < 1% |
| 内存上限 | 可配置，默认 256MB |
| 归因计算 | 异步队列，不阻塞请求路径 |
| WASM 加载 | 超时自动降级 |

## 关键路径

请求组装前：
- classifyRequest：O(消息数)
- decideEffort：O(1)
- compressContext：O(总字符数)，未达阈值时立即返回

响应返回后（异步队列）：
- buildChunks：O(n)
- compareChunks：O(块数)
- attributeTurn：O(段数 × 块数)
- distributeChunksBySource：O(块数 × 段数)

## 背压

- 队列默认最大 100，并发 2
- 溢出时丢弃最旧任务
- 单任务默认 10s 超时

## 内存

- 单会话默认保留 200 条历史
- 每条历史的 CacheChunk 只在下一轮需要时保留
- 可通过 maxMemoryMB 控制

## 基准测试

建议在启用插件后跑一遍 `pnpm demo`，观察：
- 首轮 / 次轮 / 三轮拦截延迟
- 缓存块命中数变化
- 压缩器事件数量