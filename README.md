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
   会话 / 日 / 月三级预算，超支时降级 reasoning_effort
   （模型支持时生效）。

6. reasoning_effort 动态调整
   按任务复杂度自动在 low / high / max 之间切换。
   仅在模型 adapter 未声明 `adapterDefaults.reasoningEffort: true`
   时生效——很多第三方模型（如 hermes）会声明它，此时插件不干预。


面板
----

点右下角图标网格里的 `◎` 打开。

- 圆环图：输入 / 缓存 / 输出 / 推理 四类占比
- 14 类明细：展开看每一类的来源与精度
- 推理强度：当前 effort 及最近一次调整原因
- 缓存块：命中 / 未命中 / 写入候选
- 推理 Token：本轮新产生 / 历史回传
- 缓存风险：最近 5 条会破坏缓存的事件
- 趋势：最近 30 轮的堆叠条，⚡ 标记缓存失效
- 预算：会话 / 日 / 月

面板自动跟随 DSH 当前打开的会话，拖动标题栏可移动位置。
字号跟随 DSH 全局设置。


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

完全退出 DSH 再启动。


开发
----

    pnpm install
    pnpm typecheck
    pnpm build
    pnpm test
    pnpm demo      # 本地跑归因流程，不需要 API key


架构
----

    src/
    ├── core/                  核心算法，零 DSH 依赖
    │   ├── types.ts           坐标模型与 14 类定义
    │   ├── tokenizer.ts       DeepSeek tokenizer 三层降级链
    │   ├── cache-model.ts     64 token 块切分与命中判定
    │   ├── attribution.ts     坐标归因 + API 真值对齐
    │   ├── reasoning.ts       推理生命周期追踪
    │   ├── budget.ts          预算与降级建议
    │   ├── effort.ts          任务复杂度分类器
    │   └── compressor.ts      DAG 三遍法（保留，未接入）
    ├── host/
    │   ├── session-fold.ts    会话事件重放与状态维护
    │   ├── effort-policy.ts   reasoning_effort 动态调整
    │   ├── tools.ts           两个只读工具
    │   └── store-csv.ts       CSV 导出
    └── client/
        ├── index.tsx          挂载 + fetch hook 抓当前 session
        ├── Panel.tsx          主面板
        ├── Composition.tsx    圆环图
        ├── Trend.tsx          堆叠条
        ├── descriptors.ts     Remote descriptors
        └── styles.ts          主题与字体


数据来源说明
------------

| 数据 | 来源 | 精度 |
|---|---|---|
| prompt_cache_hit_tokens | DSH usage 事件 | 实测 |
| prompt_cache_miss_tokens | DSH usage 事件 | 实测 |
| completion_tokens | DSH usage 事件 | 实测 |
| reasoning_tokens | DSH usage 事件 | 实测 |
| 第 1–9 类归因 | 客户端字符估算 + API 总量对齐 | 估算 |
| 64 token 块命中/未命中 | 前缀哈希对比 | 推断 |
| 缓存风险事件 | surface 变化检测 | 推断 |

客户端不使用 DeepSeek 原生 tokenizer（WASM 版本未接入），
所有字符级计数都是加权的近似值，精度约 80–90%。
当客户端估算与 API 真值偏差超过 3% 时，残差会归入
`unattributed` 桶，不污染来源归因。


已知限制
--------

- 字符估算 tokenizer 与真实分词偏差较大（尤其 CJK + JSON schema）
- reasoning_effort 控制在 adapter 声明 `reasoningEffort: true` 时失效
- 不支持历史会话的 effort 回填（只能从下次请求开始记录）
- 压缩功能未接入，DSH 官方 `dsh-compaction-basic` 已覆盖


License
-------

MIT