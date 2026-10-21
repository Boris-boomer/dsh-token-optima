# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-10-21

### Added
- **精确 Tokenizer 支持**：新增通过 `@huggingface/tokenizers` 加载本地 `tokenizer.json`，将 1–9 类输入 Token 归因从 `estimated`（字符估算）升级为 `exact`（API 真值）。未配置时自动降级到字符估算，不阻塞插件。
- **峰谷计价模型**：接入 DeepSeek 最新计费口径，按北京时间工作日 9:00–12:00、14:00–18:00 判定为高峰，其余为空闲（50% 折扣）。面板同步展示当前计费时段。
- **缓存写入计费**：明确将 `write_candidate` 缓存写入按未命中单价计入总花费，与官方账单口径一致。
- **OpenTelemetry GenAI 属性**：`TurnAttribution` 新增 `otelAttributes` 字段（如 `gen_ai.usage.cache_read.input_tokens`），零网络请求，用于标准化本地导出或对接外部可观测系统。
- **全新 UI 设计系统**：重构前端整体视觉，采用深/浅色主题设计 Token（CSS 变量）、线性 SVG 图标集、卡片化布局、环形构成图与带 hover 交互的趋势图。
- **环境变量配置**：支持通过 `DSH_TOKENIZER_JSON` 和 `DSH_TOKENIZER_CONFIG` 指定外部 Tokenizer 配置路径。

### Changed
- **性能优化**：Panel 改为事件驱动（订阅 `tokenOptima/updated`，300ms 防抖）+ 10s 兜底轮询；图标网格检测改用 `MutationObserver`，大幅降低前端常驻开销。
- **生命周期管理**：Host 侧所有定时器和事件监听统一由 Cordis `ctx.effect()` 托管，确保热重载与卸载时自动回收，杜绝内存泄漏。
- **异步诊断**：`HealthProbe` 改为异步 + 200ms 防抖写入，不再阻塞事件循环。
- **内存安全**：`SessionFold` 新增会话 LRU（上限 100），防止长会话/多会话导致的内存无界增长。

### Fixed
- 修复单元测试因系统时间导致的峰谷期望值漂移问题，新增 offPeak 回归用例。
- 修复 DSH 图标注册表传入 SVG 字符串导致 UI 乱码、布局撑爆的问题，改用彩色 Emoji（🔮）。

## [0.4.0] - 2026-10-20

### Added
- **费用核算与缓存 ROI**：内置 DeepSeek 官方费率，实时计算每轮请求花费及缓存省下的金额。
- **多会话与历史账单**：支持在面板内切换会话，并查看所有历史轮次的花费明细。
- **缓存失效来源精准定位**：当发生 `shrink` 或 `replace` 时，能直接指出是哪个 `source` 破坏了缓存。
- **Vitest 测试与 CI**：补充了 17 个单元测试，新增 GitHub Actions 流水线保障。
- **安全声明**：README 中新增无联网/无遥测隐私声明。

### Changed
- `config.debug` 的默认值由 `true` 改为 `false`，修复了生产环境泄露敏感上下文的风险。
- `config.hashSalt` 的默认值改为空字符串，避免用户误解为安全加密。
- `peerDependencies` 收紧版本约束。
- 诊断文件路径从 `~/.dsh/token-optima-health.json` 移至 `~/.dsh/token-optima/health.json`。

### Fixed
- 修复了 Cordis 4 环境下的服务重复注册报错（`registered at <root>`）。
- 修复了 `ctx.tools` 未声明导致的 `cannot get property "tools" without inject` 报错。
- 修复了 `tools.register` 缺少 `output` 声明导致协议不兼容的报错。
- 修复了 React 热更新导致的窗口多开和状态错乱问题。
- 修复了 CSV 导出潜在的注入漏洞（增加了 sanitize 处理）。

## [0.3.1] - 2024-01-01
### Added
- 坐标式 Token 归因模型（source × cache_status × direction × is_reasoning）
- 64 token 块前缀缓存建模与缓存失效事件
- DSH Cordis 插件入口与两个只读工具