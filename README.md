dsh-token-optima
================

DeepSeek Harness 的深度 Token 监测插件。挂在 DSH 的 Cordis 插件框架上，
通过 64 token 块级缓存模型 + 14 类归因，让你看清每一轮请求的 token
去向、缓存命中情况、推理 token 生命周期。

它不是计费工具，也不是压缩器。它只回答一个问题：**这轮请求的 token
到底花在哪了，有多少被缓存救回来了。**


核心能力
--------

1. 14 类 Token 归因
   底层是坐标模型 (source, cache_status, direction, is_reasoning)，
   14 类是它的投影视图。数据来源分三档：
     - 实测（API usage 真值）
     - 推断（由 64 token 块模型导出）
     - 估算（字符加权 tokenizer）

   注意：第 1–9 类来源归因的绝对值**不可信**——客户端估算与 API 真值
   的偏差通常 50–80%。它们可用于看**比例和趋势**，不能用于判断
   "system prompt 精确花了多少 token"。第 10/12/13/14 类走 API 真值，
   精确可信。

2. 64 token 块级缓存建模
   按 DeepSeek 官方的 64 token 存储单元切分前缀，追踪哪些块命中、
   哪些未命中、哪些是新增写入候选。能识别：
     - 前缀断裂（prefix_broken）
     - 上下文被压缩（compaction）
     - surface 中间被替换（replace）

3. 推理 Token 生命周期
   追踪 reasoning_content 从「输出侧」迁移到「输入侧」的过程，
   区分「本轮新产生」与「历史回传」。

4. 缓存风险识别
   检测会破坏已缓存前缀的事件：官方压缩、中间消息替换、
   surface 大幅缩短。

5. 预算跟踪
   会话 / 日 / 月三级预算。

6. CSV 导出
   面板右上角按钮，导出当前会话的逐轮归因数据。


面板
----

点右下角图标网格里的 `◎` 打开。

- 标题栏：显示当前会话标题 + session 后 8 位。**自动跟随 DSH 当前
  打开的会话**，无需手动输入 id
- 圆环图：输入 / 缓存 / 输出 / 推理 四类占比
- 14 类明细：展开看每一类的来源与精度
- 推理强度：当前 effort 及最近一次调整原因（见下方限制）
- 缓存块：命中 / 未命中 / 写入候选
- 推理 Token：本轮新产生 / 历史回传
- 缓存风险：最近 5 条会破坏缓存的事件
- 本轮缓存事件：prefix_broken 等
- 趋势：最近 30 轮的堆叠条，⚡ 标记缓存失效
- 预算：会话 / 日 / 月
- CSV 按钮：右上角，导出当前会话数据

拖动标题栏可移动位置，位置会被记住。字号跟随 DSH 全局设置。


安装
----

在 DSH profile 的 package.json 里加：

    "dependencies": {
      "dsh-token-optima": "link:<插件绝对路径>"
    },
    "dsh": {
      "profile": {
        "bundles": [
          ...,
          "dsh-token-optima"
        ]
      }
    }

然后：

    cd <profile 目录>
    pnpm install

**完全退出 DSH**（托盘也要退）再启动。

卸载：从 profile package.json 删掉两处引用，`pnpm install`，重启。


开发
----

    pnpm install
    pnpm typecheck   # 应 0 错误
    pnpm build       # 生成 lib/index.mjs 和 lib/client.js
    pnpm test        # 24 个测试
    pnpm demo        # 本地跑归因流程，不需要 API key

架构与其他文档见 `docs/HANDOVER.md`。DSH 内部机制与协作方法见
`docs/PLAYBOOK.md`。


架构
----

    src/
    ├── index.ts                host 入口（apply + TypertRemoteService 控制器）
    ├── config.ts               配置 schema
    ├── core/                   核心算法，零 DSH 依赖
    │   ├── types.ts            坐标模型 + 14 类 + DeepSeekUsage
    │   ├── categories.ts       14 类投影谓词
    │   ├── tokenizer.ts        Tokenizer 三层降级（估算 / WASM / BPE）
    │   ├── cache-model.ts      64 token 块建模 + 命中判定
    │   ├── attribution.ts      归因主流程 + API 真值对齐
    │   ├── reasoning.ts        推理 token 生命周期
    │   ├── budget.ts           预算与降级建议
    │   ├── effort.ts           任务复杂度分类器
    │   └── compressor.ts       DAG 三遍法（历史存档，未接入任何路径）
    ├── host/
    │   ├── session-fold.ts     核心：事件重放 + 状态 + 查询
    │   ├── effort-policy.ts    agent/request hook
    │   ├── tools.ts            两个只读工具注册
    │   ├── store-csv.ts        CSV 导出
    │   └── index.ts            re-export
    └── client/
        ├── index.tsx           入口 + fetch hook 抓当前 session
        ├── Panel.tsx           主面板
        ├── Composition.tsx     圆环图 + 14 类明细
        ├── Trend.tsx           堆叠条趋势
        ├── descriptors.ts      Remote descriptors
        └── styles.ts           主题 + 字体 + 面板样式


数据来源说明
------------

| 数据 | 来源 | 精度 |
|---|---|---|
| 第 10 类 缓存命中输入 | API usage `prompt_cache_hit_tokens` | 实测 |
| 第 12 类 缓存未命中输入 | API usage `prompt_cache_miss_tokens` | 实测 |
| 第 13 类 模型输出 | API usage `completion_tokens - reasoning_tokens` | 实测 |
| 第 14 类 推理 Token | API usage `reasoning_tokens` | 实测 |
| 第 1–9 类 来源归因 | 客户端字符估算 + 缩放对齐 | 估算 |
| 第 11 类 缓存写入候选 | 64 token 块模型推断 | 推断 |
| 缓存风险事件 | surface 变化检测 | 推断 |

**关于第 1–9 类的精度**：客户端使用字符加权估算（CJK 0.6 / 拉丁 0.25
/ 结构化字符单独处理），与真实 DeepSeek BPE 分词的偏差通常在 50–80%。
对齐机制是：

- 偏差 ≤ 3% → 按比例缩放到 `prompt_tokens`
- 偏差 > 3% → 保留原估算，残差归入 `unattributed` 桶

实际使用中大部分轮次走 `unattributed` 分支。面板上会显示"估算偏差"
作为可信度提示。**看比例和趋势可用，看绝对值不可信。**

要精确需要接入真实 DeepSeek WASM tokenizer，当前未做。


已知限制
--------

- **字符估算 tokenizer 与真实分词偏差大**（尤其 CJK + JSON schema）。
  1–9 类的绝对值不可信，只用来看比例和趋势
- **reasoning_effort 控制几乎总是失效**。原因是 `dsh-llm` 在请求 config
  里没显式带 `reasoningEffort` 时会自动给 `adapterDefaults` 打上
  `reasoningEffort: true` 标记，之后的请求 seed 里不再带该字段。插件的
  hook 拿不到值就无法调整。修复方案已设计（主动探测 adapter 能力 +
  首次注入），未实现
- **不支持历史会话的 effort 回填**（只能从下次请求开始记录）
- **压缩功能未接入**。DSH 官方 `dsh-compaction-basic` 已用 LLM 摘要覆盖，
  第三方的增量空间是"压前判断值不值 + 压后评估净收益"，未实现
- **依赖 DSH 内部 API**（`session.eventAt`、`session.surface.nodes`、
  `agent/request` waterfall、`ctx.sessions`），DSH 升级可能静默失效。
  版本探针已设计，未实现
- **调试全局变量 `window.__tokenOptimaDebug` 默认暴露**，会泄露
  `ctx.remote` / `ctx.session`。`config.debug` 门控已设计，未实现


文档
----

- `docs/HANDOVER.md` —— 完整交接文档（当前状态、方案对照、DSH 内部机制、
  已知问题、调试指南、下一步建议）
- `docs/PLAYBOOK.md` —— DSH 插件开发通用指南 + 与 AI 协作的省 token 方法
- `docs/ARCHITECTURE.md` / `docs/ALGORITHMS.md` —— 部分内容过时，待重写


License
-------

MIT