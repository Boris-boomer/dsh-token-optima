dsh-token-optima
================

DeepSeek API 的 Token 归因与上下文优化插件，运行于 DSH Cordis 插件框架。


核心设计原则
------------

1. 服务端真值优先
   API usage 能直接返回的字段，一律作为精确值使用。

2. 维度分离
   底层是 (source, cache_status, direction, is_reasoning) 坐标模型，
   14 类是坐标空间上的投影视图，不是底层模型。

3. 费率外挂
   核心只解析 Token，费率是独立可插拔模块。

4. 显式标注
   每个数据点标注为「实测」「推断」或「估算」。

5. 隐私默认本地
   遥测 opt-in，不记录 prompt 原文。


快速开始
--------

    git clone <repo>
    cd dsh-token-optima
    pnpm install
    pnpm build
    pnpm test

跑 Demo（不需要 API Key）：

    pnpm demo

用真实 API 验证 usage 字段：

    export DEEPSEEK_API_KEY=sk-xxx
    pnpm verify


14 类 Token 分类
----------------

编号   类别                 数据来源
----   ----------------     ----------------------------------
  1    系统提示词           客户端编码
  2    工具 Schema          客户端编码
  3    AGENTS.md 链         客户端编码
  4    技能目录             客户端编码
  5    MCP 工具面           客户端编码
  6    用户消息             客户端编码
  7    助手回复（历史）     客户端编码
  8    工具结果             客户端编码
  9    注入的上下文         客户端编码
 10    缓存命中输入         API 真值
 11    缓存写入候选         推断（不参与计费）
 12    缓存未命中输入       API 真值
 13    模型输出             API 真值
 14    推理 Token           API 真值（部分模型）


集成方式
--------

插件加载后，引擎挂载在 ctx.tokenOptima，宿主在请求生命周期中调用。

请求组装前，登记来源片段：

    ctx.tokenOptima.beginTurn({
      sessionId: 'sess-1',
      request: {
        model: 'deepseek-chat',
        systemPrompt: '...',
        tools: [...],
        messages: [...],
      },
    });

响应返回后，用 usage 真值做归因对齐：

    await ctx.tokenOptima.endTurn('sess-1', response.usage, reasoningContent);


两个只读工具
------------

token_report
    返回当前会话的 14 类 Token 归因数据，支持 json / csv。
    每项数据标注精度：exact / inferred / estimated。

context_audit
    展开指定消息的原始内容，用于验证压缩可回溯性。
    本插件默认不持有 prompt 原文，需宿主提供消息存储访问器。


性能预算
--------

    P95 拦截开销        < 5ms
    CPU 增量            < 1%
    内存上限            可配置，默认 256MB
    归因计算            异步队列，不阻塞请求路径
    WASM 加载           超时自动降级


文档清单
--------

    docs/ARCHITECTURE.md    架构图、模块职责、数据流、坐标模型
    docs/ALGORITHMS.md      前缀哈希、64 token 块切分、坐标归因、DAG 裁剪
    docs/API.md             context_audit / token_report 工具 I/O schema
    docs/PERFORMANCE.md     性能预算与基准数据
    docs/MIGRATION.md       版本迁移指南
    PRIVACY.md              数据处理策略、遥测 opt-in 说明
    SECURITY.md             安全约束、威胁模型
    CHANGELOG.md            Keep a Changelog 格式


License
-------

MIT