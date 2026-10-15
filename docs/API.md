# API

## 工具：token_report

### 输入

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| sessionId | string | 是 | 会话 ID |
| format | "json" \| "csv" | 否 | 默认 "json" |

### 输出（format = json）

    {
      "format": "json",
      "report": {
        "sessionId": string,
        "turns": number,
        "latest": TurnAttribution | null,
        "history": TurnAttribution[],
        "budget": BudgetState
      },
      "composition": CompositionEntry[],
      "groups": GroupEntry[],
      "tokenizer": { "id": string, "precision": string, "warning": string | null }
    }

### 输出（format = csv）

    { "format": "csv", "content": string }

## 工具：context_audit

### 输入

| 字段 | 类型 | 必填 |
|---|---|---|
| sessionId | string | 是 |
| messageId | string | 是 |

### 输出

    {
      "sessionId": string,
      "messageId": string,
      "content": string | null,
      "note": string
    }

说明：本插件默认不持有 prompt 原文。若宿主提供 resolver，
可通过 `engine.auditContext(sessionId, messageId, resolver)` 展开原始内容。

## Host 生命周期接口

    ctx.tokenOptima.beginTurn({
      sessionId: string,
      request: RawRequest,
      contextChanged?: { systemPrompt, toolsSchema, model },
      effortHint?: "low" | "high" | "max" | null
    }) → { effort, compressed }

    await ctx.tokenOptima.endTurn(sessionId, usage, reasoningContent)
      → TurnAttribution | null

    ctx.tokenOptima.assertReplayable(reasoningContent) → boolean

    ctx.tokenOptima.getReport(sessionId)
    ctx.tokenOptima.getComposition(sessionId)
    ctx.tokenOptima.getGroups(sessionId)
    ctx.tokenOptima.exportCsv(sessionId)
    ctx.tokenOptima.getTokenizerInfo()
    ctx.tokenOptima.dispose()