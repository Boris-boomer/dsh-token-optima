// 用真实 DeepSeek API 验证 usage 字段
//
//   export DEEPSEEK_API_KEY=sk-xxx
//   pnpm verify

const API_URL = process.env.DEEPSEEK_API_URL ?? 'https://api.deepseek.com/v1/chat/completions';
const API_KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

if (!API_KEY) {
  console.error('请先设置 DEEPSEEK_API_KEY=sk-xxx');
  process.exit(1);
}

interface UsageSample {
  prompt_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number; [k: string]: unknown };
  [k: string]: unknown;
}

interface ChatResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string | null; reasoning_content?: string | null };
    finish_reason: string;
  }>;
  usage?: UsageSample;
  [k: string]: unknown;
}

async function call(messages: unknown[], tools?: unknown[]): Promise<ChatResponse> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, tools, temperature: 0 }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<ChatResponse>;
}

async function main(): Promise<void> {
  console.log(`--- 模型 ${MODEL} ---\n`);

  const r1 = await call([
    { role: 'system', content: 'You are a helpful assistant. Reply concisely.' },
    { role: 'user', content: 'Say hi in one word.' },
  ]);
  console.log('请求 1 usage:', JSON.stringify(r1.usage, null, 2));

  const messages2 = [
    { role: 'system', content: 'You are a helpful assistant. Reply concisely.' },
    { role: 'user', content: 'Say hi in one word.' },
    { role: 'assistant', content: r1.choices[0]?.message.content ?? 'Hi' },
    { role: 'user', content: 'Now say bye in one word.' },
  ];
  const r2 = await call(messages2);
  console.log('\n请求 2 usage:', JSON.stringify(r2.usage, null, 2));

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_time',
        description: 'Get current time',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
  const r3 = await call(
    [
      { role: 'user', content: 'What time is it?' },
      { role: 'assistant', content: '', reasoning_content: 'I should call get_time.' },
    ],
    tools,
  );
  console.log('\n请求 3 usage:', JSON.stringify(r3.usage, null, 2));
  console.log('请求 3 reasoning_content:', r3.choices[0]?.message.reasoning_content);

  console.log('\n--- 字段核验 ---');
  const checks: Array<[string, boolean]> = [
    ['usage.prompt_tokens 存在', typeof r1.usage?.prompt_tokens === 'number'],
    ['usage.prompt_cache_hit_tokens 存在', typeof r1.usage?.prompt_cache_hit_tokens === 'number'],
    ['usage.prompt_cache_miss_tokens 存在', typeof r1.usage?.prompt_cache_miss_tokens === 'number'],
    ['usage.completion_tokens 存在', typeof r1.usage?.completion_tokens === 'number'],
    ['usage.completion_tokens_details.reasoning_tokens 存在', typeof r1.usage?.completion_tokens_details?.reasoning_tokens === 'number'],
    ['第 2 轮 cache_hit 出现', (r2.usage?.prompt_cache_hit_tokens ?? 0) > 0],
  ];
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }
}

main().catch((err) => {
  console.error('失败:', err);
  process.exit(1);
});