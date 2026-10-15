DSH Token Optima — 交接文档
============================

版本：0.3.1
文档生成时间：2026-10-15
当前 commit：（本次改动未提交）

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

**与官方 `dsh-token-meter` 的分工**：
- 官方给数：总量 / surface / 节点数 → 回答「花了多少」
- 本插件给构成：14 类来源归因 + 64 块缓存建模 + 推理生命周期 + 缓存风险 → 回答「花在哪、为什么、能不能压、压了会不会破缓存」

### 它能做什么（当前）

✅ 14 类 Token 归因（坐标模型投影）
✅ 64 token 块级缓存建模与命中判定
✅ 缓存失效事件识别（前缀断裂 / 压缩 / 中间替换）
✅ 推理 Token 生命周期追踪
✅ 预算跟踪（会话 / 日 / 月）
✅ 面板 UI（圆环 + 趋势 + 明细 + 缓存风险 + 推理强度）
✅ CSV 导出
✅ 自动跟随 DSH 当前会话（通过 `agent/request` hook，非 fetch hook）
✅ 面板拖动 + 位置记忆
✅ reasoning_effort 动态调整（仅当模型 adapter 允许）
✅ DSH 接口版本探针（4 项探测，失败时面板红字 + health.json）
✅ 数据可信度指示器（估算偏差 / 未归因 / fold 失败）
✅ tool/call 精确计数（从 `session/event` 流的 `tool/call` 事件累计）
✅ adapter 能力探测（`ctx.get('llm').resolveModelInfo` 探测 reasoning 支持；
   不支持时显式标 unsupported，支持时自动注入 reasoningEffort）

### 它不能做什么

❌ 上下文压缩（官方 `dsh-compaction-basic` 已覆盖）
❌ 真实 DeepSeek tokenizer（用字符加权估算，精度 51-79%）
❌ 费率计算（`pricing/` 目录已删）
❌ 遥测上报（OTel 未接入）
❌ 多用户/多设备同步
❌ 反检测（不隐藏自己的存在，也不防 DSH 结构变化）
❌ 强制 adapter 支持 reasoningEffort（只探测，不篡改 adapter 声明）

### 能跑吗

能。已经稳定运行，面板正常，数据准确。
**DSH 升级时能显式报错**（§7.1 探针），不再静默失效。
但**依赖的 DSH 内部 API 没有任何契约**，DSH 升级后仍可能失效。

---

§2 快速上手
-----------

### 构建

    cd D:\ai_hands_on\projects\ai-workflow\blocks\07-dsh-token-optima
    pnpm install
    pnpm typecheck     # 应 0 错误
    pnpm build         # 生成 lib/index.mjs 和 lib/client.js
    pnpm test          # 15 个测试全绿

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

### 调试

默认 `config.debug = false`，`window.__tokenOptimaDebug` 不挂。
调试前在插件 config 里设 `debug: true`，重启 DSH，Console 里才有全局变量。

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
| tool/call 计数 | `host/session-fold.ts` 的 `foldEvent` 里累计 `tool/call` 事件 |
| adapter reasoning 能力探测 | `host/effort-policy.ts` 的 `resolveModelEfforts` |

### 清单 B — 已实现但不符合方案 / 妥协

| 方案要求 | 实际做法 | 差距 |
|---|---|---|
| 精确 DeepSeek tokenizer（WASM） | 字符加权估算 | 精度 51-79%，方案要求"优先 WASM" |
| 归因偏差对齐阈值 3% | 实现了，但用字符估算偏差常超 3%，实际走 `unattributed` 兜底 | 方案要求"若超阈值优先信任 API 真值"，做了，但大部分轮次都在兜底 |
| reasoning_effort 动态调整 | 代码完整，探测 adapter 能力后注入；不支持时显式 unsupported | 当前 amd-radeon adapter 不支持，功能就绪但环境不通 |
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

- ⚠️ 优雅降级：tokenizer 三层降级链已实现（WASM → BPE → 字符估算），但 WASM 层未接入
- ❌ 看门狗（初始化超时自动禁用）—— 部分由 §7.1 探针替代
- ❌ 熔断（压缩算法连续 3 次异常切换监控模式）
- ❌ 幂等性（重复安装/卸载不残留）
- ❌ 原子配置写

**可观测性（方案第九章）**

- ❌ OTel trace/log/metric 导出
- ❌ 高基数治理
- ❌ 预算告警触发降级（有 advise 但未触发，受 adapter 限制，见 §7.15）
- ✅ `foldFailures` / 估算偏差 / 未归因 已上界面（v0.3.1）

**上下文优化（方案第五章）**

- ❌ 压缩三层语义
- ❌ 压缩触发条件
- ❌ DAG 裁剪三遍法（`compressor.ts` 已删，明确不做）
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
- ✅ docs/PLAYBOOK.md
- ✅ HANDOVER.md（本文件）
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

**不要加 `@deepseek-ai/dsh-session` / `@deepseek-ai/dsh-agent`**：
它们在 npm 上有，但依赖链里含不在 npm 的包（`dsh-type-meta`），
会导致 `pnpm install` 报 `ERR_PNPM_FETCH_404`。详见 §7.9。

**不要给 peerDependencies 写显式版本号（`^x.y.z`）**：会触发 lockfile 重算，
进而暴露 §7.9 的断链。保持 `*`。编译期用 `devDependencies` 里的
具体版本（如 `@deepseek-ai/dsh-typert-protocol@0.2.0-rc.2`），
运行时由 DSH 提供。见 §7.10。

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

**关键坑 1**：Cordis 按函数引用去重。如果同一个函数引用挂到两个 ctx，
第二次被忽略。所以：

    // 错误
    ctx.on('session/event', onEvent)
    rootCtx.on('session/event', onEvent)   // 被忽略

    // 正确
    ctx.on('session/event', (s) => { ... })
    rootCtx.on('session/event', (s) => { ... })  // 不同函数

**关键坑 2**：`agent/request` 的派发位置不确定。在 `ctx` 侧和 `root` 侧
都要挂（不同函数引用），只有一边会真正触发。实测：
- 挂 `ctx` 侧：日志显示 `attached on ctx`，但 entry 从来没打印过
- 挂 `root` 侧：entry 正常触发
- 但 **不能只挂 root**，可能某些 DSH 版本派发到 ctx

**关键坑 3**：`ctx.llm` 是 getter，读它会触发 Cordis 服务解析。
在 `apply()` 顶层直接 `(ctx as any).llm` 读，如果服务未就绪会**抛错**，
导致整个 `apply()` 挂掉，插件加载失败，client 端图标不挂。
正确做法：

    // 错误：顶层属性读，可能抛错
    const llm = (ctx as any).llm

    // 正确：用 .get() 并包 try/catch
    let llm: unknown = undefined
    try {
      llm = (ctx as any).get?.('llm')
    } catch {
      llm = undefined
    }

`ctx.get()` 是 Cordis 标准 API，读不出来返回 `undefined` 而不抛错。

**关键坑 4**：插件 `apply()` 抛错**不产生崩溃日志**。DSH 进程没崩，
但 client 端 boot 会卡在 `pending (waiting for service: remote.tokenOptima)`，
图标不挂。这时 `~/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/`
里**没有新的 crash 文件**。排查见 §9。

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
  `next()` 返回请求 config seed。实测 seed 的 keys 是 `provider, model`
  （**可能没有 `reasoningEffort`**，取决于 adapter）。返回新对象可改请求。
  - `agent` 对象有：`loopCtx,id,options,session,inbox,phase,activityDone,
    scope,ctx,dispatch,requestHeaderLogged,requestSurfaceGeneration,
    runtimeContext,assistantStreamRevision,assistantAttemptCounter,
    systemPrompt,frozenMessages`
  - `agent.session.id` 是当前会话 id
- `agent/pre-step` — payload: `{ messages, turn, step, signal, agent }`。
  返回 `{ kind: 'enter' | 'reject', messages }`。

**普通事件**：

- `session/event` — payload: `(session)`。每次会话产生新事件时触发。
- `dispose` — 插件销毁。

### 4.9.1 `tool/call` 事件（v0.3.1 确认）

`tool/call` **确实在 `session/event` 流里**。事件结构：

    {
      type: 'tool/call',
      seq: 19,
      time: 1792067989399,
      data: {
        turn: 1,
        step: 1,
        callId: 'call_...',
        name: 'pwsh',
        arguments: '{"command":"..."}'
      }
    }

对应的 assistant 消息里也有 `{ type: 'tool-call' }` 内容块，但**只统计
`tool/call` 事件即可**，两个来源同时统计会翻倍。

**之前误判 tool/call 不在事件流的原因**：测试会话没触发 tool 调用
（消息太短，模型直接回答）。**验证 tool 相关功能必须明确让 agent 调工具**，
比如「列出 D:\ai_hands_on\projects 下的目录」。

### 4.10 session 对象结构

**真 Session 对象**（标志：`id` 是字符串 **且** `seq` 是数字）：

- `session.id` — 字符串，session id
- `session.seq` — 数字，当前总事件数
- `session.eventAt(n)` — 方法，返回第 n 个事件对象
- `session.surface.nodes` — 数组，当前 surface 的 seq 列表
- `session.surface.replaceGeneration` — 数字，surface 被替换的次数
- `session.surface.contentGeneration` — 数字
- `session.firstLiveSeq` — 数字，内存中第一个 live 事件的 seq
- `session.toolHistoryProjection` / `toolHistorySeq` — 工具历史投影（**不是方法**，是字段）
- `session.log` / `surfaceManager` / `header` / `headerFold` / `contextFold` /
  `derived` / `derivedNodes` / `derivedGeneration` 等

**包装器对象**（`ctx.sessions.list()` 混入的）：

- 缺完整 `id + seq` 组合
- 没有 `eventAt` 方法
- 没有 `surface.nodes`

**判断真 Session 的方法**：

    typeof s.id === 'string' && typeof s.seq === 'number'

用 id 做 Map 键去重，不要用对象引用。

### 4.10.1 同一个逻辑会话的三层包装

一个逻辑会话至少对应三种不同的 JS 对象：

1. **fold 收到的对象**（真 Session）：有 `id`（字符串）+ `seq`（数字）+
   `eventAt` 方法 + `surface.nodes`。这是唯一能 fold 的对象
2. **`ctx.sessions.list()` 返回的对象**（包装器）：有 `sessionId` 字段
   （**不是 `id`**），可能没有 `eventAt` / `surface.nodes`
3. **`ctx.sessions.manager.sessions.get(id)` 返回的对象**：`ctor: Session`，
   有 `sessionId`（不是 `id`）、`events`（SessionEventStream）、
   `eventSource`（MutableSessionEventSource），**没有** `eventAt` / `surface.nodes`

**判定真 Session 的唯一可靠方法**：

    typeof s.id === 'string' && typeof s.seq === 'number'

不要用 `sessionId` 字段判断（那是包装器的标志）。

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

**关键约束**：**host 端 `@Remote` 方法改了，必须同步改
`src/client/descriptors.ts`**。descriptors 是 client 侧的 Remote 方法注册表，
host 加了新方法但 client 没声明，调 `svc.newMethod()` 会报
`is not a function`。

**另一个约束**：descriptors 改了之后，**client bundle 必须重新构建**。
只重启 DSH 不重 build，client 侧还是旧 bundle，新方法不可见。
症状是 `typeof svc.newMethod === 'undefined'`（不是 `'function'`，
也不是抛 `is not a function`——两个阶段报错形式不同）。

**当前策略（v0.3.1）**：**不轻易加 Remote 方法**。每个新方法都要改两处
（host `@Remote` + client descriptors），且必须重建 client bundle。
非必要不加。v0.3.1 已删除 `debugSeenEventTypes` / `debugToolCallCount`
两个只为诊断存在的方法（见 §7.18）。

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
  - 有 `ctx.toolResultPruner` 服务（`dsh-compaction-tool-result-pruner`）
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
要过滤掉。真 Session 对象的标志是 `id` 是字符串 + `seq` 是数字。

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

**崩溃日志位置**：`~/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/`，
文件名格式 `crash-<ISO时间戳>-<phase>.log`，phase 有 `web-boot` / `host` 两种。
**注意**：崩溃日志只在**真的崩溃**时产生。如果只是插件 `apply()` 抛错
导致图标不挂但进程没崩，**没有崩溃日志**——这时要靠 client 侧 remote
通道超时或面板红字判断。

### 4.19 关键文件位置

- 插件源码：`D:\ai_hands_on\projects\ai-workflow\blocks\07-dsh-token-optima`
- profile 配置：`~/.dsh/profiles/desktop/package.json`
- 已挂插件：`~/.dsh/profiles/desktop/node_modules/dsh-token-optima`
  （软链到源码目录）
- 崩溃日志：`~/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/`
- 健康探针输出：`~/.dsh/token-optima-health.json`

### 4.20 当前会话识别（v0.3.1 逆向）

**不能用 fetch hook 抓会话切换**：
- DSH 走 `dsh-app://` 协议发请求（Electron IPC），不走 JS `window.fetch`
- 用 `window.fetch` hook 抓到的 `api/changes.summary?sessionId=...` 是
  残留请求，不代表当前激活会话
- 切会话（从列表点选）不一定触发带 sessionId 的请求

**`ctx.sessions.manager.engagedSessions` 也不是信号**：
- 是 `Set<sessionId>`，会累积但不反映"当前激活"
- 实测切会话时不变

**唯一可靠信号**：`agent/request` waterfall payload 里的 `agent.session.id`。
每次发消息一定触发，里面的 session id 就是当前会话。

我们的做法：`effort-policy.ts` 的 handler 里调 `fold.setCurrentSession(sessionId)`，
`report()` 返回 `currentSessionId`，client 每 2 秒轮询优先用它。
fetch hook 保留当兜底（初始挂载时可能有用）。

### 4.21 依赖树不可复现

- `pnpm install` 在干净环境下报
  `ERR_PNPM_FETCH_404: @deepseek-ai/dsh-type-meta`
- 原因：DSH 的 peer 依赖链里含不在 npm registry 的包
- 触发条件：任何导致 lockfile 重新解析的操作（改 package.json、清 node_modules、换机器）
- **当前绕过**：不动 package.json、不删 node_modules、不动 lockfile
- **结论（v0.3.1）**：`pnpm overrides` 的方案**不做**。理由：
  - 需要维护本地 stub 目录（要写 package.json + 空的 index.js）
  - stub 需要 .gitignore 或提交进仓库，二者都有维护成本
  - 当前 lockfile 里所有包都有 integrity hash、都能 fetch，**没有断链**
  - 断链只在**往 peerDependencies 加 `dsh-session` / `dsh-agent` 时**发生。
    既然不加（§7.9），就没有触发条件
  - **保持现状**：不改 package.json 的 peerDependencies（保持 `*`），
    不删 node_modules

### 4.22 新增 DSH 事实 — Cordis 事件派发位置

- `agent/request` waterfall **在 root ctx 侧触发**（不是 plugin ctx）
- plugin ctx 侧挂的 handler 会 `attached` 但**从不 entry**
- 必须双注册（不同函数引用，避免 Cordis 引用去重，见 §4.8 关键坑 1）

### 4.23 新增 DSH 事实 — session 对象有三层包装

见 §4.10.1。

### 4.24 新增 DSH 事实 — Remote 方法必须在 client descriptors 声明

见 §4.13 的「关键约束」段。

### 4.25 新增 DSH 事实 — `ctx.llm.resolveModelInfo` 探测 reasoning 能力

`ctx.llm.resolveModelInfo(provider, model, signal)` 返回模型元信息。
若 `info.reasoning` 存在，其结构大致为：

    reasoning: {
      defaultEffort: 'high',
      efforts: ['low', 'high', 'max']  // 或 [{id: 'low'}, ...]
    }

`info.reasoning === undefined` → 该 adapter 不支持 reasoningEffort。

**实测（v0.3.1，amd-radeon / DeepSeek-V4.1-Flash）**：

- `llm=1 fn=1 reas=0 eff=0` → `info.reasoning` 是 undefined → adapter 不支持
- 结论：当前环境走 unsupported 分支，代码路径正确

**如何读 `ctx.llm`**：见 §4.8 关键坑 3，必须 `ctx.get('llm')` + try/catch。

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
    │   └── index.ts                re-export
    ├── host/
    │   ├── session-fold.ts         核心：事件重放 + 状态 + 查询
    │   ├── surface-parsers.ts      纯函数：extractText / classifySource /
    │   │                           normalizeUsage / signatureOf /
    │   │                           extractReasoningText
    │   ├── health-probe.ts         DSH 接口版本探针（v0.3.1 新增）
    │   ├── effort-policy.ts        agent/request hook + 当前会话识别 +
    │   │                           adapter reasoning 能力探测
    │   ├── tools.ts                两个只读工具注册
    │   ├── store-csv.ts            CSV 导出
    │   └── index.ts                re-export
    └── client/
        ├── index.tsx               入口 + fetch hook（兜底）+ 当前会话轮询
        ├── Panel.tsx               主面板组件
        ├── Composition.tsx         圆环图 + 14 类明细
        ├── Trend.tsx               堆叠条趋势
        ├── descriptors.ts          Remote descriptors
        └── styles.ts               主题 + 字体 + 面板样式

**注**：`core/compressor.ts` 已在 v0.3.1 删除。

### 关键类：SessionFold

`src/host/session-fold.ts` 是最核心的文件，约 600 行。

职责：
- 维护 session 状态：`byId: Map<sessionId, InternalState>`
- `observe(session)` — 从上次 cursor 推进到 `session.seq`，
  逐个 fold 事件。同时调 `health.checkSession(session)` 做接口健康检查
- `foldEvent(state, event)` — 事件分发。`tool/call` 事件在这里累计
  `state.toolCallCount`
- `settleTurn` — 处理 `assistant/message`，触发归因
- `checkSurfaceChange` — 检测 surface 变动，记录 cache risk
- 对外查询：`report` / `composition` / `groups` / `listSessions` /
  `exportCsv` / `audit`
- effort 决策记录：`recordEffortDecision` / `getEffortDecisions`
- cache 风险记录：`getCacheRisks`
- 当前会话：`setCurrentSession` / `getCurrentSession`
- tool call 计数：`getToolCallCount(sessionId)`

### 关键类：HealthProbe

`src/host/health-probe.ts`（v0.3.1 新增）。

职责：
- 探测 4 项 DSH 接口：`session.eventAt` / `session.surface.nodes` /
  `sessions 服务` / `agent/request` 挂载
- 失败时：`console.error` + 写 `~/.dsh/token-optima-health.json`
- 跳过包装器 session 对象（用 `id` 是字符串 + `seq` 是数字 判断）
- `snapshot()` 在 `report()` 里被调用，返回给面板显示

### 模块：surface-parsers.ts

`src/host/surface-parsers.ts`（v0.3.1 新增，从 `session-fold.ts` 抽出）。

5 个纯函数，零状态：
- `extractText(event)` — 从事件提取纯文本
- `extractReasoningText(event)` — 从 stream 提取 reasoning 文本
- `classifySource(type, text)` — 事件类型 → 来源分类
- `normalizeUsage(usage)` — DSH usage 结构 → DeepSeekUsage
- `signatureOf(seqs)` — surface seq 列表 → 短签名

这些函数**没有 DSH 依赖**，单元测试可以直接打。

### 数据流

    用户发消息
      ↓
    DSH 内部产生 session/event
      ↓
    ┌─────────────────────────────┐
    │ ctx.on('session/event')     │
    │  → fold.observe(session)    │
    │    → health.checkSession()  │
    │    → foldEvent(state, event)│
    │      → tool/call 累计        │
    │      → 累积 surface 节点     │
    │      → assistant/message 时: │
    │         → attributeTurn()   │
    │           → 14 类归因       │
    └─────────────────────────────┘
      ↓
    ┌─────────────────────────────┐
    │ agent/request waterfall:    │
    │  → fold.setCurrentSession() │
    │  → effort 决策              │
    │    → 探测 adapter 能力       │
    │    → 支持时注入 effort       │
    └─────────────────────────────┘
      ↓
    byId 里存 turns / cacheRisks / effortDecisions
      ↓
    ┌─────────────────────────────┐
    │ client 每 2 秒轮询:          │
    │  svc.report('')             │
    │   → 拿 currentSessionId      │
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

`src/client/index.tsx` 做四件事：

1. **从 host 轮询当前会话**（v0.3.1 主路径）：每 2 秒
   `svc.report('')` 拿 `currentSessionId`
2. **hook fetch + XHR**（兜底）：拦截 HTTP 请求，正则匹配
   `sessionId=xxx`，捕获到就 `setFetchSessionId`
3. **拉会话标题**：每 5 秒调 `session.list({})`，从
   `projections.values.title` 拿标题
4. **渲染 Panel**

`activeSessionId = hostSessionId || fetchSessionId`。

Panel 每 2 秒轮询 `svc.report(sessionId)`，拿数据重渲染。

### effort 决策流程（v0.3.1）

`src/host/effort-policy.ts` 的 `agent/request` handler：

1. `next()` 拿 seed
2. `fold.setCurrentSession(sessionId)` 记录当前会话
3. `toolCalls = fold.getToolCallCount(sessionId)` 拿 tool 计数
4. 若 `seed.reasoningEffort` 是字符串：
   - 走复杂度分类 + 预算降级路径
   - `decideEffort()` 可能改 `seed.reasoningEffort`
5. 若 `seed.reasoningEffort` 不是字符串：
   - 从 seed 取 `provider` / `model`
   - 调 `llm.resolveModelInfo(provider, model, signal)` 探测
   - 探测结果缓存到 `effortProbeCache`（按 `provider#model` 为 key）
   - `reasoning` 存在 → 从 `efforts` 里选目标 level 注入
   - `reasoning` 不存在 → 记 `unsupported`，不改 seed

**`resolveModelEfforts` 的防御性解析**：
- `info.reasoning` 不存在 → 返回 null
- `efforts` 里元素是字符串或 `{ id: string }` 都接受
- `defaultEffort` 不在 `efforts` 里 → 退回 `efforts[0]`
- 任何抛错 → 返回 null

**读 `ctx.llm` 的注意事项**：见 §4.8 关键坑 3，必须
`ctx.get('llm')` + try/catch。在 `installEffortPolicy` 里读**一次**
缓存到闭包变量，handler 里不再读。

---

§6 数据流细节
-------------

### 一次请求的完整链路

1. 用户在 DSH 输入消息
2. DSH 的 agent loop 触发 `turn/start` / `step/start`
3. 组装 system prompt / tools / messages，产生 `system/message`、
   `request/header`、`user/message` 等事件
4. 发起 LLM 请求前，dispatch waterfall `agent/request`
   - 我们的 handler 读 seed，判断 current effort
   - `seed.reasoningEffort` 存在时可能修改
   - 不存在时尝试探测 adapter 能力并注入（v0.3.1）
   - `fold.setCurrentSession(sessionId)` 记录当前会话
5. LLM 返回，产生 `assistant/message`（带 `usage` 和 `stream`）
6. 如果有 tool call，继续 `tool/call` → `tool/result` 事件
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

### 已修（v0.3.1）

**7.1 无 DSH 版本探针** —— ✅ 已修

- 新增 `src/host/health-probe.ts`
- 探测 4 项：`session.eventAt` / `session.surface.nodes` /
  `sessions 服务` / `agent/request` 挂载
- 失败时 `console.error` + 写 `~/.dsh/token-optima-health.json`
- 面板顶部红字显示
- 包装器 session 对象通过 `id 是字符串 + seq 是数字` 过滤，避免误报

**7.2 `foldFailures` 不上界面** —— ✅ 已修

- 面板顶部「数据可信度」区块显示 `foldFailures` / 估算偏差 / 未归因
- 三项全正常时不显示区块

**7.3 `window.__tokenOptimaDebug` 泄露 ctx** —— ✅ 已修

- 改成 `config.debug` 门控，默认 `false`
- `debug: false` 时不挂全局变量，`debug: true` 时才挂
- 调试指南需注明"需先开启 debug"

**7.6 compressor.ts 死代码** —— ✅ 已删

- `src/core/compressor.ts` 删除
- `src/core/index.ts` 的 re-export 删除
- `tests/compressor.test.ts` 删除

**7.7 effort.toolCalls 恒为 0** —— ✅ 已修

- 症状：复杂度分类器第二个参数始终是 0
- 根因（两次）：
  1. 之前测的会话**没触发 tool 调用**，模型直接回答
  2. `unsupported` 分支的门控（`hasReportedUnsupported`）锁死首条记录，
     面板永远显示第一次请求（此时 toolCallCount 还是 0）
- 修法：
  1. `session-fold.ts` 的 `foldEvent` 在 `case 'tool/call'` 里
     `state.toolCallCount++`
  2. `getToolCallCount(sessionId)` 返回 `state.toolCallCount`，
     为 0 时退回 surface 里 `tool_result` 节点数兜底
  3. `effort-policy.ts` 去掉 unsupported 分支的门控，每次 agent/request
     都记录 decision，面板取最后一条
- 验证：用「列出 D:\ai_hands_on\projects 下的目录」触发 pwsh，
  面板 `(toolCalls=1)` ✅
- **陷阱**：不要在 `assistant/message` 里额外统计 `content` 里的
  `type === 'tool-call'` 块——会和 `tool/call` 事件双重计数

**7.8 session-fold.ts 过大** —— ⚠️ 部分修

- 现状：约 600 行，仍承担重放、状态、查询、cache 风险四职责
- v0.3.1 抽出 `src/host/surface-parsers.ts`（5 个纯函数）
- 剩余拆分（`replay.ts` / `state.ts` / `queries.ts` / `risks.ts`）
  未做。风险大于收益，暂缓

**7.10 typert-protocol 版本差异** —— ✅ 已修

- 现象：本地 `devDependencies` 装的是 `@deepseek-ai/dsh-typert-protocol@0.1.0-rc.6`，
  但 DSH 运行时实际加载的是 `0.2.0-rc.2`
- 发现方式：读 asar 里官方包的 `peerDependencies`，全部写 `0.2.0-rc.2`
- 风险：编译期用旧版类型检查，运行时用新版实现。若 `@Remote` 装饰器或
  `TypertRemoteService` 构造签名变化，会编译过但运行时挂载失败
- 修法：`pnpm add -D @deepseek-ai/dsh-typert-protocol@0.2.0-rc.2`
- `peerDependencies` 保持 `*`（运行时由 DSH 提供，编译期用本地，见 §4.5）
- 修复时间：2026-10-15
- 验证：build 通过 + DSH 重启后面板/Remote 通道正常

**7.18 Remote 方法从 host 加到 client 不到** —— ✅ 已修

- 症状：host 侧 `@Remote` 加了新方法，client 侧 `svc.newMethod`
  是 `undefined`（不是 `'function'`），调它报 `is not a function`
- 根因：
  1. client 侧 `descriptors.ts` 没同步加 entry
  2. client bundle 没重建（只重启 DSH 不够）
- 处理：**直接删掉这两个 debug 方法**（`debugSeenEventTypes` /
  `debugToolCallCount`），不再追这条线。理由：
  - 它们当初是给诊断 `tool/call` 用的，那个问题已用 console.log 落盘解决
  - 每次加 Remote 方法都要改 host + client 两处，容易忘
  - 保留 `debugEventCount` / `debugLastEvents`（原本就有 entry，通道是通的）
- 相关死代码一起清：`getSeenEventTypes` / `seenEventTypes` /
  `hasReportedUnsupported` / `markReportedUnsupported` / `reportedUnsupported`
- 修复时间：2026-10-15

### 已修（历史）

**7.16 EstimatedTokenizer 尾块 tokens 误判** —— ✅ 已修

- 位置：`src/core/tokenizer.ts` 的 `chunkBoundaries` 尾块分支
- 症状：尾块 `tokens` 用 `Math.round(acc)`，当 raw acc ∈ [63.5, 64) 时
  round 到 64，`complete` 被误判为 true，破坏「追加内容不破坏已有
  前缀块哈希」性质
- 触发：flaky，fast-check 随机 seed 撞上才暴露，一直存在
- 修法：尾块改 `Math.floor(acc)`
- 修复时间：2026-10-15

**7.14 面板会话跟随** —— ✅ 已修

- 症状：面板显示的会话和用户当前激活的会话不一致
- 根因：`window.fetch` hook 抓不到会话切换。DSH 走 `dsh-app://` 协议
  （Electron IPC），不走 JS fetch；切会话不一定触发带 sessionId 的请求
- 修法：`effort-policy.ts` 的 `agent/request` handler 里调
  `fold.setCurrentSession(sessionId)`，`report()` 返回 `currentSessionId`，
  client 每 2 秒轮询优先用它，fetch hook 兜底
- 修复时间：2026-10-15

### 高优先级（未修）

**7.4 fetch 全局劫持**

- 位置：`src/client/index.tsx`
- 现象：`window.fetch = fetchHandler` 覆盖整个应用的 fetch
- 风险：如果其他插件也 hook fetch，互相覆盖
- 现状：v0.3.1 里 fetch hook 只当兜底，主路径走 host 的 currentSessionId，
  风险降低
- 修法：彻底删掉 fetch hook

**7.5 codec 假 passthrough**

- 位置：`src/client/descriptors.ts`
- 现象：所有 codec 的 `create` 返回 `parse: v => v`，无验证
- 风险：恶意 client 可以传任意数据
- 修法：如果安全重要，手写简易 zod 替换；如果自己用，可接受

### 中优先级

**7.9 隐式依赖未声明** —— 结论：不修

- 现状：代码里实际用了 `dsh-session`、`dsh-agent` 的接口，
  package.json 未声明
- 核实（2026-10-15）：这两个包在 npm 上有（`dsh-session@0.0.1-rc.1` /
  `dsh-agent@0.1.0-rc.6`），但它们依赖链里有 `@deepseek-ai/dsh-type-meta`，
  后者**不在 npm 上**。写进 peerDependencies 会导致 `pnpm install`
  报 `ERR_PNPM_FETCH_404`
- **结论：不修**。DSH 内部包不进 package.json，对它们的引用由 DSH 运行时
  提供，仅靠文档记录
- 影响：`pnpm install` 的依赖检查看不到这两个包。如果未来 DSH 改变它们
  的接口，只能靠运行时版本探针（§7.1）发现

**7.15 预算降级无法验证（adapter 限制）** —— ⚠️ 代码就绪，环境不通

- 现象：config 设 `budgetSession: 10` 后降级不生效
- 原因：`agent/request` waterfall 的 seed 里没有 `reasoningEffort`
  字段（当前 adapter amd-radeon 不暴露）
- v0.3.1 加了 adapter 探测：`resolveModelInfo` 返回
  `reas=0 err=reasoning-undef`，证实 adapter 确实不支持
- 结论：代码正确，受 adapter 限制。切到 DeepSeek 官方 API 时才能验证
- 验证时间：2026-10-15

**7.17 依赖树不可复现** —— ✅ 结论：不修

- 见 §4.21
- 现状：`pnpm install` 在干净环境下失败（`ERR_PNPM_FETCH_404`）
- 绕过：不动 package.json（保持 peerDependencies 为 `*`）、不删 node_modules
- `pnpm overrides` 方案不做，理由见 §4.21

### 低优先级

**7.11 老 session 的 effort 不显示**

- 已识别，接受
- 原因：`agent/request` 只对新请求触发；effort 决策是内存状态，
  DSH 重启清空

**7.12 字符 tokenizer 精度**

- 实测偏差 51%–79%（受会话内容影响）
- 大部分 session 走 `unattributed` 兜底
- **已评估不做 WASM**：只影响分摊比例和兜底，不影响趋势判断，
  成本 1-2 天 + 长期维护
- 若未来要做精确成本归因或跨模型对比，再考虑

**7.13 面板无 CSV 导出按钮时的错误处理**

- 修法：已经加了，当前有 `CSV` 按钮

---

§8 下一步建议
-------------

### 已完成（v0.3.1）

- ✅ debug 门控（`window.__tokenOptimaDebug` 默认不挂）
- ✅ 删 `compressor.ts` 死代码
- ✅ `foldFailures` / 估算偏差 / 未归因 显示在面板
- ✅ DSH 版本探针（§7.1）
- ✅ 修 `effort.toolCalls` 恒为 0（§7.7）
- ✅ 拆 `session-fold.ts`（§7.8 部分）：抽出 `surface-parsers.ts`
- ✅ 升级 typert-protocol 到 `0.2.0-rc.2`（§7.10）
- ✅ 清理 `hasReportedUnsupported` 死代码
- ✅ 决定 `debugSeenEventTypes` / `debugToolCallCount` 去留：删（§7.18）

### 中期（几天）

1. host 端单元测试（尤其 `session-fold.ts` 和 `surface-parsers.ts`）
2. 真删 fetch hook（§7.4）
3. 把 §4 抽成 `docs/DSH-INTERNALS.md`，每条加版本标注
4. 完全拆分 `session-fold.ts`（§7.8 剩余：replay / state / queries / risks）

### 长期（如果打算认真维护）

5. Worker 隔离 + 背压队列（方案性能预算）
6. OTel 遥测导出
7. 文档重写，让每份与实际一致

### G1 三条路径现状

| 路径 | 状态 |
|---|---|
| 1. 预算降级 | 代码就绪，adapter 限制（amd-radeon 不支持 reasoningEffort） |
| 2. reasoning 非零 | 代码就绪，adapter 限制 |
| 3. 多块前缀断裂 | 无构造方法，转 D1（假 session 对象直接 fold 事件测） |

切到 DeepSeek 官方 API 后，路径 1、2 会自动走 `injected` 分支，代码无需改动。

### 如果要做压缩

不要自己重写。官方 `dsh-compaction-basic` 已经用 LLM 摘要做得很好了。
唯一增量空间：
- 压缩**前**检查是否值得（缓存命中率高时别压）
- 压缩**后**评估效果（缓存命中率变化）

需要读 `dsh-compaction-basic` 的 `compactIfNeeded` 逻辑，目前没做。

---

§9 调试指南
-----------

**前置**：默认 `config.debug = false`，`window.__tokenOptimaDebug` 不挂。
调试前在 profile 的插件 config 里设 `debug: true`，重启 DSH。

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

### 面板显示"选择上方会话以查看数据"

含义：`activeSessionId` 空（`currentSessionId` 和 `fetchSessionId` 都空）。

排查：

1. **发一条消息**（`agent/request` 只在发消息时触发）
2. 再跑：

       const r = await __tokenOptimaDebug.service.report('')
       const v = r?.value ?? r
       console.log('currentSessionId:', v?.currentSessionId)

3. 如果还是空 → `agent/request` handler 没触发。
   看内部日志里有没有 `EFFORT-POLICY[root]: entry`

### 面板显示"等待 host 端 remote 通道就绪"

含义：`ctx.remote.namespaces.get('tokenOptima')` 是 undefined。

排查：

1. F12 → Console:

       __tokenOptimaDebug.remote.namespaces.get('tokenOptima')

2. 如果是 undefined → `$mount` 失败或没执行。
   看 Console 有没有 `[dsh-token-optima/client] $mount failed: ...`。

3. 如果有值但 `service` 是 undefined → host 端没注册成功。
   看启动时有没有 `[dsh-token-optima] loaded (N remote methods)`。

### 面板顶部红字"DSH 接口变更：xxx"

含义：`HealthProbe` 探测到某接口缺失。

排查：

1. 看 `~/.dsh/token-optima-health.json` 里 `failures` 数组
2. 检查 DSH 是否升级了
3. 手动验证：F12 跑 `__tokenOptimaDebug.service.report('')`，
   看返回的 `health` 字段

### 面板显示"当前模型未启用 reasoningEffort 控制"

含义：`seed.reasoningEffort` 不是字符串，且 adapter 探测返回 null。

排查：

1. 这是**当前 amd-radeon adapter 的预期行为**，不是 bug
2. 若要验证探测逻辑：切到 DeepSeek 官方模型，面板应显示
   `injected reasoningEffort=high (supported=[low,high,max])`
3. 若怀疑探测本身有问题：临时在 `effort-policy.ts` 的
   `unsupported` 分支 `reason` 里加诊断字符串，比如
   `[probe llm=X fn=X reas=X eff=X err=...]`，验证完删除

### DSH 启动崩溃

现象：弹窗"应用无法启动或已意外停止"，报错含 `pending (waiting for service: xxx)`。

排查：

1. 不要点"禁用第三方插件"按钮（会重置 profile）
2. 手动从 `~/.dsh/profiles/desktop/package.json` 删掉出问题的插件
3. `cd ~/.dsh/profiles/desktop && pnpm install`
4. 重启

### 图标不挂，但 DSH 进程没崩

现象：右下角图标网格里没有 `◎`，DSH 正常启动。

排查：

1. 检查 `~/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/` 有无
   `crash-*.log`。**没有**说明 host 侧 `apply()` 抛错导致插件加载失败，
   但不是进程崩溃
2. 检查 client 侧 console 有无 `pending (waiting for service: remote.tokenOptima)`
3. **最常见原因**：`apply()` 顶层读了 `ctx.xxx` 触发 Cordis 服务解析抛错。
   见 §4.8 关键坑 3
4. 救火：`node -e "import('file:///<绝对路径>/lib/index.mjs').then(m => console.log('LOADED', Object.keys(m)))"`
   确认模块本身能加载；再逐个回退最近改的 host 文件，定位是哪个文件

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
- `report(sessionId)` — 特定 session 的完整报告。
  `report('')` 返回 `currentSessionId` 和 `health`
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
- `<目录>\dsh\node_modules\@deepseek-ai\dsh-token-meter\lib\index.js`
  — 官方 token 计量，看它的 tokenizer 实现
- `<目录>\dsh\node_modules\@deepseek-ai\dsh-llm\lib\index.js`
  — LLM 层，`resolveModelInfo` / `resolveCallWithInfo` /
  `adapterDefaults` 逻辑都在这里（v0.3.1 探测 reasoning 能力时读过）

---

§11 版本记录
------------

- v0.3.1（当前）
  - DSH 接口版本探针（health-probe.ts）
  - 数据可信度指示器（foldFailures / 估算偏差 / 未归因上界面）
  - debug 门控（默认 false，不再泄露 ctx）
  - 面板会话跟随修复（走 agent/request，不靠 fetch hook）
  - EstimatedTokenizer 尾块 round bug 修复
  - compressor.ts 死代码删除
  - 测试数量从 24 → 15（删了 compressor 测试）
  - tool/call 精确计数（`foldEvent` 累计 + `getToolCallCount`）
  - session-fold.ts 抽出 `surface-parsers.ts`（5 个纯函数）
  - effort-policy.ts 加 adapter 能力探测（`ctx.get('llm').resolveModelInfo`）
  - effort unsupported 分支去门控，每次请求都记录 decision
  - 修 `ctx.llm` 属性读取导致的 apply() 崩溃（改 `ctx.get('llm')`）
  - typert-protocol 升级到 0.2.0-rc.2（与 DSH 运行时对齐）
  - 删除 `debugSeenEventTypes` / `debugToolCallCount` 两个 Remote 方法及死代码
  - version bump 到 0.3.1
  - 本次更新交接文档

- v0.3.0
  - 面板自动跟随会话
  - 缓存风险检测
  - CSV 导出
  - 面板位置记忆
  - 清理死代码
  - 新增交接文档

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

v0.3.1 之后，它从「随时可能静默死」变成「坏了会告诉你哪坏了」——
DSH 接口探针、数据可信度指示器、debug 门控三项补齐，让它在 DSH 升级时
能**显式报错**，而不是面板空白让你猜。

v0.3.1 还补了两项逆向得来的关键能力：
- **tool/call 精确计数**（之前一直为 0，因为测试会话没触发 tool，
  且 unsupported 门控锁死了首条记录）
- **adapter reasoning 能力探测**（`ctx.llm.resolveModelInfo` 探测
  effort 支持列表，不支持时显式 unsupported，支持时自动注入）

同时把 typert-protocol 从 `0.1.0-rc.6` 升级到 `0.2.0-rc.2`，
与 DSH 运行时对齐——编译期和运行时的装饰器版本一致，消除了一类
隐蔽的运行时风险。

剩下的短板集中在两处：
1. **tokenizer 精度**（51-79%）—— 已评估不做 WASM，接受兜底
2. **测试覆盖**（host/client 0 覆盖）—— 中期活，先拆再测

依赖的 DSH 内部 API 仍无任何契约，DSH 每次升级都要重跑一次探针确认。