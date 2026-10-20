dsh-token-optima
================

DeepSeek Harness 的深度 Token 监测插件。挂在 DSH 的 Cordis 插件框架上，
通过 64 token 块级缓存模型 + 14 类归因，让你看清每一轮请求的 token
去向、缓存命中情况、以及**真实花费**。

它不是计费工具，也不是压缩器。它只回答一个问题：**这轮请求的 token
到底花在哪了，缓存帮你省了多少钱。**

核心能力
--------

1. 14 类 Token 归因
   底层是坐标模型 (source, cache_status, direction, is_reasoning)。
   数据来源分三档：实测（API 真值）、推断、估算。

2. 真实费用核算与缓存 ROI
   接入 DeepSeek 官方费率，实时计算每轮对话的**总花费**以及**缓存为你省下的金额**。
   支持历史累计统计，直观感受缓存带来的成本收益。

3. 64 token 块级缓存建模
   按官方 64 token 存储单元切分前缀，追踪命中与未命中。
   支持识别：前缀断裂、上下文被压缩、surface 中间被替换。

4. 智能失效归因
   当缓存被破坏时，自动定位导致破坏的来源（如：tool_result、assistant_msg），
   直接告诉你“是谁弄废了缓存”。

5. 多会话与历史分析
   支持在面板内切换不同会话，查看全盘的历史轮次明细（每轮花费/省下金额/命中率）。

6. CSV 导出
   面板右上角按钮，导出当前会话的逐轮归因与费用数据。

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

开发
----

    pnpm install
    pnpm typecheck   # 类型检查
    pnpm build       # 生成 lib/index.mjs 和 lib/client.js
    pnpm test        # 运行 Vitest 测试

架构
----

    src/
    ├── index.ts                host 入口
    ├── config.ts               配置 schema
    ├── core/                   核心算法，零 DSH 依赖
    │   ├── pricing.ts          费率表与费用核算
    │   ├── cache-model.ts      64 token 块建模
    │   └── ...                 (其余算法)
    ├── host/
    │   ├── session-fold.ts     事件重放 + 状态 + 查询 + 费用聚合
    │   └── ...                 
    └── client/
        ├── Panel.tsx           主面板（含费用 ROI 与失效归因）
        └── ...                 

License
-------

MIT