// Client 半的 Remote descriptors：与 host 端 @Remote 方法一一对应。
//
// DSH 的 client runtime 不向第三方插件暴露 zod，所以 codec 用手写的
// passthrough schema。gateway 只检查 codec.mode === 'strict'，不做深层验证。

interface MinimalSchema {
  parse(value: unknown): unknown
  safeParse(value: unknown): { success: true; data: unknown }
}

function passthrough(): MinimalSchema {
  return {
    parse: (v) => v,
    safeParse: (v) => ({ success: true, data: v }),
  }
}

export const TYPERT_REMOTE = {
  package: 'dsh-token-optima',
  descriptors: [
    {
      id: 'dsh-token-optima#tokenOptima/report',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'report',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#report:sessionId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#report:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/composition',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'composition',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#composition:sessionId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#composition:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/groups',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'groups',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#groups:sessionId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#groups:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/listSessions',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'listSessions',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#listSessions:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/exportCsv',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'exportCsv',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#exportCsv:sessionId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#exportCsv:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/audit',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'audit',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#audit:sessionId',
            create: passthrough,
          },
        },
        {
          name: 'messageId',
          wire: 'messageId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#audit:messageId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#audit:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/tokenizerInfo',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'tokenizerInfo',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#tokenizerInfo:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/getEffortDecisions',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'getEffortDecisions',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#getEffortDecisions:sessionId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#getEffortDecisions:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/getCacheRisks',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'getCacheRisks',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#getCacheRisks:sessionId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#getCacheRisks:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/ensureSession',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'ensureSession',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#ensureSession:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/debugEventCount',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'debugEventCount',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#debugEventCount:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/debugLastEvents',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'debugLastEvents',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#debugLastEvents:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/debugSeenEventTypes',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'debugSeenEventTypes',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#debugSeenEventTypes:result',
        create: passthrough,
      },
    },
    {
      id: 'dsh-token-optima#tokenOptima/debugToolCallCount',
      service: 'tokenOptima',
      namespace: 'tokenOptima',
      method: 'debugToolCallCount',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-token-optima#debugToolCallCount:sessionId',
            create: passthrough,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-token-optima#debugToolCallCount:result',
        create: passthrough,
      },
    },
  ],
}

export default TYPERT_REMOTE