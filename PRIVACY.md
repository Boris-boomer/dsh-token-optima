# Privacy

## 默认本地处理

所有 Token 归因计算在本地完成。插件不主动向任何外部服务器发送数据。

## 遥测默认关闭

OTLP 遥测默认关闭（`telemetry: 'off'`）。启用需要用户显式传入
`telemetry: 'otlp'` 和一个 `TelemetrySink`。

启用后导出的属性遵循高基数治理：
- 不放会话 ID、工具名、turn ID 作为 metric label
- 只放低基数、可聚合的属性（如模型名）

## 不记录 prompt 原文

本插件不存储 prompt 原文、reasoning_content 原文或工具结果原文。
推理内容只保留加盐 SHA-256 哈希与 token 数，用于生命周期校验。

## 哈希加盐

所有用于归因和缓存比对的哈希都经过用户可配置的 `hashSalt` 加盐，
防止字典攻击。

## 数据保留

- 会话状态默认保留在内存中
- 通过 `retentionDays` 控制持久化保留期限
- 支持 `ctx.tokenOptima.engine` 直接访问并清除

## 路径安全

所有缓存数据写入 DSH profile 目录内的专用子目录，
通过 `AtomicConfigWriter` 做路径遍历与符号链接防护。

## 权限最小化

插件只注册两个只读工具，不修改沙箱、审批或凭证配置。