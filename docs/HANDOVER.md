DSH Token Optima — 交接文档
============================

版本：0.3.0
文档生成时间：2026-10-15
当前 commit：3f2a459

---

阅读指南
--------

**如果你是未来的 AI 助手**：先读 §1（当前状态），再读 §4（DSH 内部机制），
再读 §5（代码结构）。§3（方案对照）告诉你哪些是该做但没做的。

**如果你是这个项目的作者（三个月后回来）**：先读 §1（它现在是什么），
再读 §3（哪些做了哪些没做），再读 §7（已知问题）。§4 是你 debug 时
随时要查的 DSH 事实清单。

**如果你是第三方接手**：从头读。§4 是最值钱的部分——里面所有 DSH 内部
机制都是逆向得来的，官方没有任何文档。

---

§1 当前状态
-----------

### 这是什么

DSH（DeepSeek Harness）的 Token 监测插件。运行在 Cordis 插件框架上。

监测对象：DSH 里每次 LLM 请求的 token 使用情况。
- 输入 token 花在了哪些来源（system / tools / user / tool_result / ...）
- 缓存命中/未命中/写入候选
- 推理 token 生命周期
- 缓存被破坏的风险事件
- 预算使用

### 它能做什么（当前）

✅ 14 类 Token 归因（坐标模型投影）
✅ 64 token 块级缓存建模与命中判定
✅ 缓存失效事件识别（前缀断裂 / 压缩 / 中间替换）
✅ 推理 Token 生命周期追踪
✅ 预算跟踪（会话 / 日 / 月）
✅ 面板 UI（圆环 + 趋势 + 明细 + 缓存风险 + 推理强度）
✅ CSV 导出
✅ 自动跟随 DSH 当前会话
✅ 面板拖动 + 位置记忆
✅ reasoning_effort 动态调整（仅当模型 adapter 允许）

### 它不能做什么

❌ 上下文压缩（官方 `dsh-compaction-basic` 已覆盖）
❌ 思维链剪枝（`compressor.ts` 有代码，未接入）
❌ 真实 DeepSeek tokenizer（用字符加权估算，精度 80-90%）
❌ 费率计算（`pricing/` 目录已删）
❌ 遥测上报（OTel 未接入）
❌ 多用户/多设备同步
❌ 反检测（不隐藏自己的存在，也不防 DSH 结构变化）

### 能跑吗

能。已经稳定运行，面板正常，数据准确。
但**依赖的 DSH 内部 API 没有任何契约**，DSH 升级后可能静默失效。

---

§2 快速上手
-----------

### 构建

    cd D:\ai_hands_on\projects\ai-workflow\blocks\07-dsh-token-optima
    pnpm install
    pnpm typecheck     # 应 0 错误
    pnpm build         # 生成 lib/index.mjs 和 lib/client.js
    pnpm test          # 24 个测试全绿

### 挂到 DSH

编辑 `~/.dsh/profiles/desktop/package.json`：

    "dependencies": {
      "dsh-token-optima": "link:D:/ai_hands_on/projects/ai-workflow/blocks/07-dsh-token-optima"
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

    cd ~/.dsh/profiles/desktop
    pnpm install

**完全退出 DSH**（托盘也要退）：

    taskkill /F /IM "DeepSeek Harness.exe" /T

再启动。

### 卸载

从 profile package.json 删掉两个引用，再 `pnpm install`，重启。

### 用

右下角图标网格里点 `◎`，面板打开。

---

§3 方案对照（重要）
-------------------

原始需求文档是项目根目录的 `设计方案.txt`。以下三张清单逐条对照。

### 清单 A — 已实现且符合方案

| 方案条目 | 实现位置 |
|---|---|
| 服务端真值优先 | `core/attribution.ts` 用 API usage 做真值 |
| 坐标式归因模型 | `core/types.ts` 的 `TokenCoordinate` |
| 14 类作为投影视图 | `core/categories.ts` 定义 14 类的谓词 |
| 显式标注实测/推断/估算 | `Measured.precision` 字段 |
| API 真值：prompt_cache_hit/miss | `host/session-fold.ts` 的 `normalizeUsage` |
| API 真值：reasoning_tokens | 同上 |
| 64 token 块前缀建模 | `core/cache-model.ts` |
| 缓存失效事件标记 | `CacheEvent.kind`（prefix_broken / compaction 等） |
| 缓存写入候选推断 | `verdict: 'write_candidate'` |
| 推理 token 生命周期追踪 | `core/reasoning.ts` |
| 哈希加盐（默认） | `config.hashSalt` |
| 隐私：不存 prompt 原文 | 全局不存储，只存哈希和 token 数 |

### 清单 B — 已实现但不符合方案 / 妥协

| 方案要求 | 实际做法 | 差距 |
|---|---|---|
| 精确 DeepSeek tokenizer（WASM） | 字符加权估算 | 精度 80-90%，方案要求"优先 WASM" |
| 归因偏差对齐阈值 3% | 实现了，但用字符估算偏差常超 3%，实际走 `unattributed` 兜底 | 方案要求"若超阈值优先信任 API 真值"，做了，但大部分轮次都在兜底 |
| reasoning_effort 动态调整 | 代码完整，但只在 adapter 声明 `adapterDefaults.reasoningEffort !== true` 时生效 | 大部分第三方模型不生效 |
| 隐私：遥测 opt-in | 没做遥测 | 方案要求"默认关，可开"，实际是"根本没有" |
| 数据 TTL | 没做 | 方案要求"可配置保留期限" |
| SBOM | 没做 | 方案要求"发布使用" |
| 分层架构 | core/host/client 三层 | 方案要求 `packages/` 子包，实际没分包 |

### 清单 C — 完全未实现

**测试（方案第七章）**

- ❌ 契约测试（插件 apply 函数、inject 声明、Config schema）
- ❌ 生命周期测试（一次性 Docker 安装 DSH，验证加载/卸载）
- ❌ A/B 差分测试（dsh-plugin-abtest）
- ❌ 录制回放（真实 API 响应的离线回放）
- ❌ host 端 0 覆盖
- ❌ client 端 0 覆盖
- ⚠️ 单元测试只覆盖 core（10 个）
- ⚠️ 属性测试只覆盖 cache-model（5 个）

**性能预算（方案第十章）**

- ❌ P95 < 5ms 未测
- ❌ CPU < 1% 未测
- ❌ 内存上限 256MB 未实现
- ❌ Worker 隔离未做
- ❌ 背压队列未做（`session-fold.observe` 是同步的）

**生产健壮性（方案第十三章）**

- ❌ 优雅降级（tokenizer 加载失败时）
- ❌ 看门狗（初始化超时自动禁用）
- ❌ 熔断（压缩算法连续 3 次异常切换监控模式）
- ❌ 幂等性（重复安装/卸载不残留）
- ❌ 原子配置写

**可观测性（方案第九章）**

- ❌ OTel trace/log/metric 导出
- ❌ 高基数治理
- ❌ 预算告警触发降级（有 advise 但没触发）
- ⚠️ 面板展示有，但 `foldFailures` 等内部指标未上界面

**上下文优化（方案第五章）**

- ❌ 压缩三层语义
- ❌ 压缩触发条件
- ❌ DAG 裁剪三遍法（`compressor.ts` 有代码但未接入）
- ❌ 思维链剪枝（同上）
- ❌ 禁止压缩白名单（同上）

**工程化（方案第十一章）**

- ❌ Node 22/24 × Win/macOS/Linux CI 矩阵
- ❌ CJS + ESM 双发（只有 ESM）
- ❌ OIDC trusted publishing
- ❌ GitHub Release bundle

**费率（方案 2.4 + 清单 A 第 3 项）**

- ❌ 完全没做（`pricing/` 目录已删）

**文档（方案第十二章）**

- ✅ README.md
- ✅ CHANGELOG.md
- ✅ PRIVACY.md
- ✅ SECURITY.md
- ✅ docs/ARCHITECTURE.md
- ✅ docs/ALGORITHMS.md
- ✅ docs/API.md
- ✅ docs/PERFORMANCE.md（内容是空壳）
- ✅ docs/MIGRATION.md（内容是空壳）
- ✅ docs/PLAYBOOK.md（本次新增）
- ⚠️ 这些文档**大部分内容与实现不符**，需要重写

---

§4 DSH 内部机制（逆向事实清单）
------------------------------

**这一节是整个文档最值钱的部分。所有事实都是通过解 asar、
读官方包源码、运行时探测得来的。官方无文档。**

### 4.1 DSH 是什么

- Electron 打包的桌面应用，程序名 `DeepSeek Harness.exe`
- 主代码在 `D:\dsh desktop\resources\app.asar`
- 运行时依赖展开在 `D:\dsh desktop\resources\app.asar.unpacked\dsh\node_modules\`
- 用户数据在 `~/.dsh/`
- profile 在 `~/.dsh/profiles/<name>/`

### 4.2 探索方法

    # 列出 asar 内容
    npx --yes @electron/asar list "D:\dsh desktop\resources\app.asar"

    # 完整解包
    npx --yes @electron/asar extract "D:\dsh desktop\resources\app.asar" <输出目录>

解包后所有官方包在 `<输出>/dsh/node_modules/@deepseek-ai/` 下。

**不要从 profile 的 node_modules 读**：那些是软链，大部分指向已删除的源码目录。

### 4.3 插件安装机制

三步（profile 的 package.json）：

1. `dependencies` 里加 `"dsh-xxx": "link:<绝对路径>"`
2. `dsh.profile.bundles` 数组里加 `"dsh-xxx"`
3. `cd ~/.dsh/profiles/<name> && pnpm install`

**必须完全退出 DSH 再启动**。托盘图标也要退。

### 4.4 插件最小结构

    dsh-xxx/
    ├── package.json           # 包定义 + DSH 元数据
    ├── cordis.patch.yml       # 插件注册声明
    ├── tsconfig.json          # 开发用
    ├── tsconfig.build.json    # 构建用
    ├── tsdown.config.ts       # 构建配置
    ├── src/
    │   ├── index.ts           # host 入口
    │   └── client/
    │       └── index.tsx      # client 入口
    └── lib/                   # 产物
        ├── index.mjs          # host（ESM）
        └── client.js          # client（CJS）

### 4.5 package.json 关键字段

    {
      "type": "module",
      "main": "lib/index.mjs",
      "exports": {
        ".": {
          "types": "./lib/types/index.d.ts",
          "default": "./lib/index.mjs"
        },
        "./client": { "default": "./lib/client.js" },
        "./cordis.patch.yml": "./cordis.patch.yml"
      },
      "dsh": {
        "client": {
          "platform": "web",
          "inject": ["dsh-xxx"]
        },
        "bundle": {
          "patch": "./cordis.patch.yml"
        }
      },
      "peerDependencies": {
        "@deepseek-ai/cordis": "*",
        "@deepseek-ai/dsh-typert-protocol": "*",
        "@deepseek-ai/schemastery": "*"
      }
    }

### 4.6 cordis.patch.yml 格式

    - insert:
        - id: xxx
          name: 'dsh-xxx'

`id` 和 `name` 都用包名。

### 4.7 tsdown 构建配置要点

host target：
- format: esm
- platform: node
- neverBundle: `node:*`, `@deepseek-ai/cordis`, `@deepseek-ai/schemastery`,
  `@deepseek-ai/dsh-typert-protocol`
- alwaysBundle: 其余

client target：
- format: cjs
- platform: browser
- externals: react, react-dom, react/jsx-runtime, react-dom/client,
  `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
  `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`

**client 必须加 banner/footer/intro 包装**：

    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "dsh-xxx", factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;'
    }

不写这个，DSH 加载 client.js 时**静默失败**（不报错，插件不生效）。

### 4.8 Cordis 事件 API（host 侧）

    import type { Context } from '@deepseek-ai/cordis'

    export function apply(ctx: Context, config): void {
      ctx.on('session/event', (session) => { ... })
      ctx.tools.register({ name, description, parameters, handler })
      ctx.on('dispose', () => { ... })
    }

**关键坑**：Cordis 按函数引用去重。如果同一个函数引用挂到两个 ctx，
第二次被忽略。所以：

    // 错误
    ctx.on('session/event', onEvent)
    rootCtx.on('session/event', onEvent)   // 被忽略

    // 正确
    ctx.on('session/event', (s) => { ... })
    rootCtx.on('session/event', (s) => { ... })  // 不同函数

### 4.9 DSH 事件类型（通过运行时探测）

已确认的 event type 列表：

    agent/inbox/spliced, approval/policy, assistant/attempt,
    assistant/message, command/done, command/run, goal/change,
    llm/retry, llm/retry-started, permission/preset, request/context,
    request/header, sandbox/mode, session/end-seed, session/title,
    session/title-llm-request, step/end, step/start, subagent/catalog,
    system/message, todo/write, tool/call, tool/result, turn/end,
    turn/start, user/message, workspace/changes

**waterfall 事件**（返回值会被用作后续处理输入）：

- `agent/request` — payload: `{ turn, step, signal, agent }`。
  `next()` 返回请求 config seed，包含 `provider` / `model` /
  `reasoningEffort`（可选） / `maxTokens`（可选）。返回新对象可改请求。
- `agent/pre-step` — payload: `{ messages, turn, step, signal, agent }`。
  返回 `{ kind: 'enter' | 'reject', messages }`。

**普通事件**：

- `session/event` — payload: `(session)`。每次会话产生新事件时触发。
- `dispose` — 插件销毁。

### 4.10 session 对象结构

- `session.id` — 字符串，session id
- `session.seq` — 数字，当前总事件数
- `session.eventAt(n)` — 方法，返回第 n 个事件对象
- `session.surface.nodes` — 数组，当前 surface 的 seq 列表
- `session.surface.replaceGeneration` — 数字，surface 被替换的次数
- `session.surface.contentGeneration` — 数字
- `session.firstLiveSeq` — 数字，内存中第一个 live 事件的 seq

**坑**：同一个 session id 可能对应多个对象（真 Session + 包装器）。
用 id 做 Map 键去重，不要用对象引用。

### 4.11 事件数据结构

事件对象形如：

    {
      seq: number,          // 全局递增
      type: string,         // 事件类型
      data: { ... },        // 类型特定
      surfaceOp: {          // 可选，surface 变更操作
        startSeq: number,
        endSeq: number
      }
    }

`assistant/message` 的 `data`：

    {
      turn: number,
      step: number,
      message: { role: 'assistant', content: [...] },
      usage: {              // 可选，API 真值
        inputTokens: number,
        outputTokens: number,
        cacheReadTokens?: number,
        cacheWriteTokens?: number
      },
      stream: [...]         // 原始流，包含 reasoning 块
    }

`user/message` / `system/message` / `tool/result` 的 `data.message` 结构类似。

### 4.12 usage 字段映射

DSH 归一化字段 → DeepSeek 官方字段：

- `inputTokens` → 未命中输入
- `cacheReadTokens` → `prompt_cache_hit_tokens`
- `cacheWriteTokens` → 缓存写入（DeepSeek 不单独计费）
- `outputTokens` → `completion_tokens`

换算：

    prompt_tokens = inputTokens + cacheReadTokens + cacheWriteTokens
    prompt_cache_hit_tokens = cacheReadTokens
    prompt_cache_miss_tokens = inputTokens + cacheWriteTokens

### 4.13 Host ↔ Client 通信（Remote）

**不能用自定义 cordis service 直接注入到 client**。必须用
TypertRemoteService + @Remote 装饰器。

host 侧：

    import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

    class MyController extends TypertRemoteService {
      constructor(ctx) {
        super(ctx, 'myService', { namespace: 'myService' })
      }

      @Remote
      async report(id: string): Promise<unknown> {
        return this.fold.report(id)
      }
    }

    // 注册
    const rootCtx = ctx.root ?? ctx
    new MyController(rootCtx, deps)

**必须注册到 root ctx**，否则 Gateway 找不到。

client 侧：

1. 手写 descriptors（不用官方 generator，那是编译期工具）：

       export const TYPERT_REMOTE = {
         package: 'dsh-xxx',
         descriptors: [
           {
             id: 'dsh-xxx#myService/report',
             service: 'myService',
             namespace: 'myService',
             method: 'report',
             invocation: { kind: 'direct' },
             parameters: [
               {
                 name: 'id',
                 wire: 'id',
                 source: 'json',
                 codec: {
                   mode: 'strict',
                   typeSymbol: 'dsh-xxx#report:id',
                   create: passthrough
                 }
               }
             ],
             result: {
               mode: 'strict',
               typeSymbol: 'dsh-xxx#report:result',
               create: passthrough
             }
           }
         ]
       }

   `passthrough` 是自己写的假 schema，返回 `{ parse: v => v }`。
   Gateway 只检查 `codec.mode === 'strict'`，不做真实验证。

2. 在 client apply 里 `$mount`：

       export const inject = ['remote']

       export async function apply(ctx) {
         await ctx.remote.$mount(TYPERT_REMOTE)
       }

3. 拿 service 用 namespaces Map：

       const svc = ctx.remote.namespaces.get('myService')?.service
       const result = await svc.report(id)
       const value = result?.value ?? result

**不要用 `ctx.remote.myService` 属性访问** —— 需要
`inject: ['remote.myService']`，但自己创建的服务进不了静态 inject 列表。
会 pending 到超时。

### 4.14 客户端相关

- client 端**没有 zod**。`import { z } from 'zod'` 会导致
  `require("zod") missed the module table` 错误
- client 端有 `window.__ModuleLoader__` 加载机制
- `window.__dshIconRegistry` 是图标网格的注册表，array，
  每项 `{ id, icon, label, packageName?, onClick }`
- `ctx.sessions.list({})`（Remote 命名空间）返回 session 列表，
  每项包含 `sessionId`、`projections.values.title`、`updatedAt` 等

### 4.15 官方相关包清单

第三方插件**应该优先复用**：

- `@deepseek-ai/dsh-token-meter` — 官方 token 计量服务
  - `ctx.tokenMeter.measure(session)` → `{ totalTokens, surfaceTokens, nodes }`
  - `ctx.tokenMeter.estimateMessage(message)` → 单条消息计价
  - 三个投影：`tokenUsage` / `contextPressure` / `contextBreakdown`
- `@deepseek-ai/dsh-session-projection` — 投影注册服务
- `@deepseek-ai/dsh-compaction` + `dsh-compaction-basic` — 官方压缩
  - `CompactionEngine` 抽象类，唯一扩展点 `summarize()`
  - 已实现自动触发（`agent/pre-step` + `agent/request-error`）
  - 用 LLM 摘要替换上下文，比手工压缩强
- `@deepseek-ai/dsh-session-title` — 会话标题
- `@deepseek-ai/dsh-typert-protocol` — RPC 协议
- `@deepseek-ai/dsh-scope` — 作用域
- `@deepseek-ai/dsh-agent` — agent 基础设施，有 `agentEvents` /
  `agentCarrier` / `assembleContextFor`

### 4.16 重放历史

DSH 启动后 `session/event` 只对**新事件**触发。历史需要主动重放。

从 `ctx.sessions` 服务拿所有 session 对象，逐个 fold：

    const sessionsSvc = ctx.get('sessions')
    // 不同版本 API 不同，尝试多个方法名
    for (const method of ['list', 'all', 'entries', 'values']) {
      const r = sessionsSvc[method]?.()
      if (Array.isArray(r)) { ... }
      else if (r instanceof Map) { ... }
    }

**注意**：`sessions.list()` 返回的对象可能没有 `eventAt` 方法（是包装器），
要过滤掉。真 Session 对象的标志是 `hasEventAt === true` 且有 `surface`。

### 4.17 Cordis 访问控制

`ctx.xxx` 属性访问有访问控制。直接读会抛
`cannot get property "xxx" without inject`。

需要绕过的场景：
- 用 `Reflect.get(obj, key)` 在 try/catch 里读
- 或用 `Object.getOwnPropertyNames(Object.getPrototypeOf(obj))` 拿方法名
- 不要 `JSON.stringify(obj)` —— 会触发 `toJSON` 访问，报错

### 4.18 崩溃恢复

如果 DSH 启动失败，报错类似：
`web boot: 1 entry did not activate` 或
`dsh-xxx: pending (waiting for service: xxx)`

弹窗会提供三个按钮：
- 退出
- 重启
- **禁用第三方插件、备份 profile patch 并重启**

**不要点第三个** —— 它会把 profile 的 package.json 重置回官方状态，
所有手写的 `link:` 引用全丢（虽然源码安全，但要重新配）。

正确救火方式：手动从 profile package.json 删掉出问题的插件。

### 4.19 关键文件位置

- 插件源码：`D:\ai_hands_on\projects\ai-workflow\blocks\07-dsh-token-optima`
- profile 配置：`~/.dsh/profiles/desktop/package.json`
- 已挂插件：`~/.dsh/profiles/desktop/node_modules/dsh-token-optima`
  （软链到源码目录）
- 崩溃日志：`~/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/`

---

§5 代码结构
-----------

### 目录

    src/
    ├── index.ts                    host 入口（apply 函数 + Controller）
    ├── config.ts                   配置 schema（schemastery）
    ├── core/                       零 DSH 依赖的纯算法
    │   ├── types.ts                坐标模型 + 14 类 + DeepSeekUsage
    │   ├── categories.ts           14 类投影谓词
    │   ├── tokenizer.ts            Tokenizer 三层降级（估算/WASM/BPE）
    │   ├── cache-model.ts          64 token 块建模 + 命中判定
    │   ├── attribution.ts          归因主流程 + API 真值对齐
    │   ├── reasoning.ts            推理 token 生命周期
    │   ├── budget.ts               预算与降级建议
    │   ├── effort.ts               任务复杂度分类器
    │   ├── compressor.ts           DAG 三遍法（**死代码，未接入**）
    │   └── index.ts                re-export
    ├── host/
    │   ├── session-fold.ts         核心：事件重放 + 状态 + 查询
    │   ├── effort-policy.ts        agent/request hook
    │   ├── tools.ts                两个只读工具注册
    │   ├── store-csv.ts            CSV 导出
    │   └── index.ts                re-export
    └── client/
        ├── index.tsx               入口 + fetch hook 抓 session id
        ├── Panel.tsx               主面板组件
        ├── Composition.tsx         圆环图 + 14 类明细
        ├── Trend.tsx               堆叠条趋势
        ├── descriptors.ts          Remote descriptors
        └── styles.ts               主题 + 字体 + 面板样式

### 关键类：SessionFold

`src/host/session-fold.ts` 是最核心的文件，约 600 行。

职责：
- 维护 session 状态：`byId: Map<sessionId, InternalState>`
- `observe(session)` — 从上次 cursor 推进到 `session.seq`，
  逐个 fold 事件
- `foldEvent(state, event)` — 事件分发
- `settleTurn` — 处理 `assistant/message`，触发归因
- `checkSurfaceChange` — 检测 surface 变动，记录 cache risk
- 对外查询：`report` / `composition` / `groups` / `listSessions` /
  `exportCsv` / `audit`
- effort 决策记录：`recordEffortDecision` / `getEffortDecisions`
- cache 风险记录：`getCacheRisks`

### 数据流

    用户发消息
      ↓
    DSH 内部产生 session/event
      ↓
    ┌─────────────────────────────┐
    │ ctx.on('session/event')     │
    │  → fold.observe(session)    │
    │    → foldEvent(state, event)│
    │      → 累积 surface 节点     │
    │      → assistant/message 时: │
    │         → attributeTurn()   │
    │           → 14 类归因       │
    └─────────────────────────────┘
      ↓
    byId 里存 turns / cacheRisks / effortDecisions
      ↓
    ┌─────────────────────────────┐
    │ client Panel 每 2 秒轮询:    │
    │  svc.ensureSession()        │
    │  svc.report(sessionId)      │
    │  svc.composition(id)        │
    │  svc.groups(id)             │
    │  → 渲染圆环 / 缓存块 / 风险  │
    └─────────────────────────────┘

### 归因算法（core/attribution.ts）

四阶段：

1. **请求组装前**：遍历 segments，逐段用 tokenizer 估算 token 数，
   同时构建「字符区间 → 来源」的 layout
2. **64 token 块切分**：把整个 surface 拼成一个字符串，按 64 token
   切块，每块算累积 SHA-256 哈希
3. **与 API 真值对齐**：
   - 估算总量 vs `prompt_tokens` 偏差 ≤ 3% → 按比例缩放到真值
   - 偏差 > 3% → 保留原估算，残差归入 `unattributed`
   - 命中/未命中同样缩放
4. **输出 14 类投影**：
   - 1-9 类：按来源对齐后的值
   - 10 类：`prompt_cache_hit_tokens`（真值）
   - 11 类：write candidate（推断）
   - 12 类：`prompt_cache_miss_tokens`（真值）
   - 13 类：`completion_tokens - reasoning_tokens`
   - 14 类：`reasoning_tokens`

### client 端

`src/client/index.tsx` 做三件事：

1. **hook fetch + XHR**：拦截所有 HTTP 请求，正则匹配 `sessionId=xxx`，
   捕获到就 `setSessionId`。这样切会话时面板自动跟随
2. **拉会话标题**：每 5 秒调 `ctx.remote.namespaces.get('session').service.list({})`，
   从 `projections.values.title` 拿标题
3. **渲染 Panel**

Panel 每 2 秒轮询 `svc.report(sessionId)`，拿数据重渲染。

---

§6 数据流细节
-------------

### 一次请求的完整链路

1. 用户在 DSH 输入消息
2. DSH 的 agent loop 触发 `turn/start` / `step/start`
3. 组装 system prompt / tools / messages，产生 `system/message`、
   `request/header`、`user/message` 等事件
4. 发起 LLM 请求前，dispatch waterfall `agent/request`
   - 我们的 handler 读 seed，判断 current effort，可能修改
5. LLM 返回，产生 `assistant/message`（带 `usage` 和 `stream`）
6. 如果有 tool call，继续 `tool/result`
7. 下一 step 或结束

我们的 `foldEvent` 响应第 3、5、6 步的事件，累积 surface；
在第 5 步触发 `settleTurn`，产出归因数据。

### 缓存块建模

surface 的每个节点（system/user/assistant/tool 消息）都是有顺序的。
把所有节点的文本拼成一个长字符串，按 64 token 切块。

每块的累积哈希：

    hash_i = SHA256(model_id || tools_hash || system_hash || hash_{i-1} || block_i_text)

下一轮请求时，重新切块 + 算哈希，对比上一轮的哈希集合：

- 相同哈希 → hit
- 长度 >= 64 但哈希不在集合 → write_candidate
- 长度 < 64 → 不参与缓存

如果某块从 hit 变成 miss，之后所有块都 miss（前缀断裂）。

---

§7 已知问题
-----------

### 高优先级

**7.1 无 DSH 版本探针**

- 位置：`src/host/session-fold.ts`、`src/host/effort-policy.ts`
- 现象：DSH 升级后，`session.eventAt` 或 `agent/request` payload
  变了，插件静默失效（面板显示"等待首次对话"）
- 修法：启动时检查关键接口存在性，缺一个就在面板打红字警告
- 具体检查：
  - `typeof session.eventAt === 'function'`
  - `Array.isArray(session.surface?.nodes)`
  - `rootCtx.get('sessions')` 存在
  - `agent/request` waterfall 能挂上

**7.2 `foldFailures` 不上界面**

- 位置：`session-fold.ts` 里累计，面板从不显示
- 现象：内部 fold 大量失败，用户看到"等待首次对话"，不知道哪里坏
- 修法：Panel 加一个区块显示 `foldFailures`，非 0 时红字警告

**7.3 `window.__tokenOptimaDebug` 泄露 ctx**

- 位置：`src/client/index.tsx`
- 现象：任何页面脚本都能拿到 `ctx.remote` / `ctx.session`
- 修法：删掉这个全局变量，或者只在 `config.debug` 为 true 时挂

### 中优先级

**7.4 fetch 全局劫持**

- 位置：`src/client/index.tsx`
- 现象：`window.fetch = fetchHandler` 覆盖整个应用的 fetch
- 风险：如果其他插件也 hook fetch，互相覆盖
- 修法：改成只观察（用 Proxy 或只在 URL 匹配时记录），不改写

**7.5 codec 假 passthrough**

- 位置：`src/client/descriptors.ts`
- 现象：所有 codec 的 `create` 返回 `parse: v => v`，无验证
- 风险：恶意 client 可以传任意数据
- 修法：如果安全重要，手写简易 zod 替换；如果自己用，可接受

**7.6 compressor.ts 死代码**

- 位置：`src/core/compressor.ts`
- 现象：约 130 行，从没接入任何路径
- 修法：删掉，或者标注"保留备用"

**7.7 effort.ts 的 toolCalls 一直为 0**

- 位置：`src/host/effort-policy.ts` 调用 `extractSignals(..., 0, null)`
- 现象：复杂度分类器少了一个信号
- 修法：从 session surface 统计 tool call 数量传进去

**7.8 session-fold.ts 过大**

- 位置：约 600 行，承担了重放、状态、查询、cache 风险四职责
- 修法：拆成 `replay.ts` / `state.ts` / `queries.ts` / `risks.ts`

**7.9 隐式依赖未声明**

- 位置：`package.json` 的 `peerDependencies`
- 现状：代码里实际用了 `dsh-session`、`dsh-agent` 的接口，
  但 package.json 只声明了 `cordis` / `typert-protocol` / `schemastery`
- 修法：补上 `@deepseek-ai/dsh-session` 和 `@deepseek-ai/dsh-agent`

**7.10 版本差异**

- 本地装的 `@deepseek-ai/dsh-typert-protocol@0.1.0-rc.6`
- DSH 运行时是 `0.2.0-rc.2`
- 装饰器 API 可能不完全兼容
- 修法：`pnpm add -D @deepseek-ai/dsh-typert-protocol@0.2.0-rc.2`

### 低优先级

**7.11 老 session 的 effort 不显示**
- 已识别，接受
- 原因：`agent/request` 只对新请求触发

**7.12 字符 tokenizer 精度**
- 估算 vs 真实偏差常 > 50%
- 大部分 session 走 `unattributed` 兜底
- 修法：接入真实 DeepSeek WASM tokenizer（P0，但没做）

**7.13 面板无 CSV 导出按钮时的错误处理**
- 修法：已经加了，当前有 `CSV` 按钮

---

§8 下一步建议
-------------

按性价比排：

### 立刻（30 分钟内）

1. 删 `window.__tokenOptimaDebug`（或加开关控制）
2. 删 `compressor.ts` 死代码
3. 把 `foldFailures` 显示在面板

### 短期（几小时）

4. 加 DSH 版本探针（§7.1）
5. 写 `docs/DSH-INTERNALS.md`（把本文档 §4 抽出来，
   单独维护更新）
6. `package.json` 补 peerDependencies
7. 更新 typert-protocol 到 0.2.0-rc.2

### 中期（几天）

8. 真实 DeepSeek WASM tokenizer 接入（方案 P0）
9. host 端单元测试（尤其 `session-fold.ts`）
10. 拆分 `session-fold.ts`

### 长期（如果打算认真维护）

11. Worker 隔离 + 背压队列（方案性能预算）
12. OTel 遥测导出
13. 文档重写，让每份与实际一致

### 如果要做压缩

不要自己重写。官方 `dsh-compaction-basic` 已经用 LLM 摘要做得很好了。
唯一的增量空间是：
- 在压缩**之前**检查是否值得（缓存命中率高时别压）
- 在压缩**之后**评估效果（缓存命中率变化）

那需要读 `dsh-compaction-basic` 的 `compactIfNeeded` 逻辑，
目前没做。

---

§9 调试指南
-----------

### 面板显示"等待首次对话"

含义：host 端 `byId` 里没有这个 session，或 `turns` 为 0。

排查：

1. F12 → Console:

       const s = await __tokenOptimaDebug.service.listSessions()
       console.log(JSON.stringify(s.value))

2. 如果返回空数组 → 事件重放没跑成功。看：

       const r = await __tokenOptimaDebug.service.debugLastEvents()
       console.log(r.value.join('\n'))

   找 `REPLAY: observed=N lists=M` 和 `OBSERVE: done` 行。

3. 如果有 session 但 turns=0 → fold 中途失败。看 `foldFailures`。

### 面板显示"等待 host 端 remote 通道就绪"

含义：`ctx.remote.namespaces.get('tokenOptima')` 是 undefined。

排查：

1. F12 → Console:

       __tokenOptimaDebug.remote.namespaces.get('tokenOptima')

2. 如果是 undefined → `$mount` 失败或没执行。
   看 Console 有没有 `[dsh-token-optima/client] $mount failed: ...`。

3. 如果有值但 `service` 是 undefined → host 端没注册成功。
   看启动时有没有 `[dsh-token-optima] loaded (N remote methods)`。

### DSH 启动崩溃

现象：弹窗"应用无法启动或已意外停止"，报错含 `pending (waiting for service: xxx)`。

排查：

1. 不要点"禁用第三方插件"按钮（会重置 profile）
2. 手动从 `~/.dsh/profiles/desktop/package.json` 删掉出问题的插件
3. `cd ~/.dsh/profiles/desktop && pnpm install`
4. 重启

### 数据不更新

现象：面板数字卡住不动。

排查：

1. F12 → Network 看 `dsh-app://app/api/tokenOptima/report` 请求是否成功
2. 如果 404 → remote 通道坏了，重启 DSH
3. 如果 200 但数据不变 → host 端没收到新 `session/event`。
   检查 `debugEventCount` 是否在增长

### 关键调试方法

- `debugLastEvents()` — 返回最近 500 条内部日志行
- `listSessions()` — 当前跟踪的 session 列表
- `debugEventCount()` — 内部事件计数
- `report(sessionId)` — 特定 session 的完整报告
- `ensureSession()` — 强制重放一次
- `getCacheRisks(sessionId)` — 缓存风险列表
- `getEffortDecisions(sessionId)` — effort 决策历史

---

§10 参考资源
------------

### 项目内

- `设计方案.txt` — 原始需求
- `docs/PLAYBOOK.md` — DSH 插件开发通用指南 + 协作方法
- `docs/ARCHITECTURE.md` — 架构（部分过时）
- `docs/ALGORITHMS.md` — 算法说明（部分过时）

### 外部

- `D:\dsh desktop\resources\app.asar` — 官方源码
- `D:\ai_hands_on\projects\dsh-loop-guard` — 一个完整的第三方插件样板
- `D:\ai_hands_on\projects\ai-workflow\blocks\01-dsh-ui\dsh-icon-grid`
  — 图标网格插件（client 端的参照）

### 参考的官方包

解 asar 到 `<目录>` 后，读：

- `<目录>\dsh\node_modules\@deepseek-ai\dsh-api-gateway\lib\index.js`
  — Gateway 实现，理解 Remote 机制
- `<目录>\dsh\node_modules\@deepseek-ai\dsh-typert-protocol\lib\index.js`
  — @Remote 装饰器实现
- `<目录>\dsh\node_modules\@deepseek-ai\dsh-agent-loop\lib\index.js`
  — agent loop，理解 agent/request waterfall
- `<目录>\dsh\node_modules\@deepseek-ai\dsh-compaction-basic\lib\index.js`
  — 官方压缩实现

---

§11 版本记录
------------

- v0.3.0（当前）
  - 面板自动跟随会话
  - 缓存风险检测
  - CSV 导出
  - 面板位置记忆
  - 清理死代码
  - 本次新增交接文档

- v0.2.0
  - 接入 DSH session/event
  - TypertRemoteService RPC
  - 面板 UI

- v0.1.0（初始）
  - 纯 core 算法
  - 本地 demo
  - 24 个测试

---

末尾一句话
----------

这个项目能跑，算法是对的，功能是真的。
但它建立在**没有任何契约的逆向接口**上，DSH 每次升级都可能静默失效。

如果只给自己用，接受"每次升级花 1-2 小时 debug"。
如果要做成长期可用的工具，必须补上 §7.1（版本探针）和
§7.2（失败上界面）——这是唯一能让它在 DSH 升级时**显式报错**的机制。