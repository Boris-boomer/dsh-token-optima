# Migration

## 0.1.x → 未来版本

### 破坏性变更政策

- 严格遵守 SemVer
- 破坏性变更在 CHANGELOG 顶部标记 `### Breaking`
- 主版本升级提供迁移指南

### 配置项迁移

| 旧字段 | 新字段 | 说明 |
|---|---|---|
| （无） | telemetry | 默认 off，需要显式 opt-in |
| （无） | hashSalt | 建议自定义，防字典攻击 |
| （无） | budget | session / daily / monthly |
| （无） | compression | maxRatio / keepRecentUserTurns 等 |
| （无） | queue | concurrency / maxSize / taskTimeoutMs |
| （无） | watchdog | initTimeoutMs / failureThreshold / cooldownMs |

### API 迁移

`ctx.tokenOptima.beginTurn` 在 0.1.0 起接受完整的 `RawRequest` 对象。
早期内部版本接受扁平的 `segments` 数组，已移除。

### 数据迁移

归因数据默认不落盘。启用 dataDir 后，数据以 JSON 存储，
新版本会保留旧字段的读取兼容。