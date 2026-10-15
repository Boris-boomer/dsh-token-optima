# Security

## 报告漏洞

请通过私有渠道报告安全问题，不要开 public issue。

## 威胁模型

### 威胁 1：本地数据泄露

**场景**：攻击者获得本地文件系统读取权限，读取归因数据。

**缓解**：
- 不存储 prompt 原文
- 推理内容只存哈希
- 哈希加盐
- 支持 TTL 与显式删除

### 威胁 2：路径遍历

**场景**：恶意配置注入 `dataDir` 之外的相对路径。

**缓解**：
- `AtomicConfigWriter.safePath` 检查 `path.relative` 是否逃逸
- 拒绝符号链接

### 威胁 3：遥测高基数

**场景**：启用 OTLP 后误传会话 ID 到 metric label，导致后端爆炸。

**缓解**：
- `Telemetry.recordMetric` 自动过滤 `session_id` / `tool` / `turn_id`
- 只允许低基数属性

### 威胁 4：供应链

**场景**：npm 包被篡改。

**缓解**：
- 核心算法层零运行时依赖
- 发布使用 OIDC trusted publishing + provenance
- 建议附带 SBOM

### 威胁 5：配置损坏

**场景**：进程崩溃导致配置写入中断，文件损坏。

**缓解**：
- 原子写：临时文件 + rename
- 文件锁 + 超时
- 备份轮转（默认 3 份）

## 安全约束

- 只注册两个只读工具
- 不修改沙箱、审批或凭证配置
- 不主动发起网络请求（除用户显式配置的遥测 sink 外）
- Tokenizer WASM 加载支持超时降级，不阻塞插件运行