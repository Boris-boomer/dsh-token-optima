# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 坐标式 Token 归因模型（source × cache_status × direction × is_reasoning）
- DeepSeek usage 真值对齐（prompt_cache_hit/miss_tokens）
- 64 token 块前缀缓存建模与缓存失效事件
- 推理 Token 生命周期追踪（本轮产生 / 历史回传）
- DAG 压缩器：三遍法 + 白名单 + 思维链剪枝
- reasoning_effort 动态调整（任务复杂度分类器）
- 预算跟踪与降级建议
- DSH Cordis 插件入口与两个只读工具（token_report / context_audit）
- 背压队列 + 看门狗 + 熔断
- 原子配置写入 + 备份轮转 + 路径防护
- OTel 兼容遥测接口（默认关闭，opt-in）
- Host/Client 协议（版本化 + 能力协商）
- 框架无关 SVG 渲染（圆环面板、趋势图、明细表）
- 独立费率适配器（不硬编码价格）
- 单元测试 + 属性测试（fast-check）
- Demo + 真实 API 验证脚本