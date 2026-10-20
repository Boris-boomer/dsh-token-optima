# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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