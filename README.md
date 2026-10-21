dsh-token-optima
================

> **隐私与安全声明**
> - **无网络请求**：本插件不主动向任何外部服务器发送数据。所有计算与统计完全在本地完成。
> - **无遥测**：不包含任何埋点或遥测代码。
> - **数据最小化**：不存储 prompt 原文、reasoning 原文或工具结果原文，仅在内存中保留哈希用于对比。
> - **调试隔离**：全局调试对象 `window.__tokenOptimaDebug` 默认关闭，需显式修改配置开启。
> - **文件写入**：仅在 `~/.dsh/token-optima/` 目录下写入接口健康诊断文件，且失败时不阻塞主流程。

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

2. 真实费用核算与缓存 ROI（支持峰谷计价）
   接入 DeepSeek 官方费率，实时计算每轮对话的**总花费**以及**缓存为你省下的金额**。
   自动识别高峰/空闲时段（北京时间工作日 9-12、14-18 为高峰），并支持历史累计统计。

3. 64 token 块级缓存建模
   按官方 64 token 存储单元切分前缀，追踪命中与未命中。
   支持识别：前缀断裂、上下文被压缩、surface 中间被替换。

4. 智能失效归因
   当缓存被破坏时，自动定位导致破坏的来源（如：tool_result、assistant_msg），
   直接告诉你“是谁弄废了缓存”。

5. 多会话与历史分析
   支持在面板内切换不同会话，查看全盘的历史轮次明细（每轮花费/省下金额/命中率）。

6. 现代化 UI 与图表
   采用全新的深/浅色主题设计，内置带交互的环形构成图与趋势图，数据细节尽收眼底。

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

启用精确 Tokenizer（可选）
------------------------

插件默认使用字符加权算法（~80-90% 准确率）估算 Token 数量。如果想让 Token 归因达到 100% 精确（标记为 `exact`），可以手动加载 DeepSeek 的词表文件：

**第一步：下载词表文件**

从 HuggingFace 下载两个配置文件（总计约 7.8 MB），放入 `~/.dsh/` 目录：
- https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer.json
- https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer_config.json

**第二步：设置环境变量**

需要让 DSH 进程能读取到这两个文件的绝对路径。请根据你的操作系统设置：

*Windows (PowerShell)*：
> 注意：如果你通过托盘或快捷方式启动 DSH，请使用下面的命令将变量写入“用户环境变量”，设置后需**完全重启 DSH**。

    [Environment]::SetEnvironmentVariable('DSH_TOKENIZER_JSON', "$env:USERPROFILE\.dsh\tokenizer.json", 'User')
    [Environment]::SetEnvironmentVariable('DSH_TOKENIZER_CONFIG', "$env:USERPROFILE\.dsh\tokenizer_config.json", 'User')

*macOS / Linux*：
将以下内容添加到 `~/.bashrc` 或 `~/.zshrc` 中：

    export DSH_TOKENIZER_JSON="$HOME/.dsh/tokenizer.json"
    export DSH_TOKENIZER_CONFIG="$HOME/.dsh/tokenizer_config.json"

**第三步：验证**

重启 DSH 并打开面板。如果面板底部的状态栏显示 `tokenizer: hf:... (exact)`，即代表加载成功。

开发
----

    pnpm install
    pnpm typecheck   # 类型检查
    pnpm test        # 运行 Vitest 测试
    pnpm build       # 生成 lib/index.mjs、lib/client.js 和 d.ts 声明文件

License
-------

MIT