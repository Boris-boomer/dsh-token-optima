import type { UserConfig } from 'tsdown'

const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

const isRequested = (specifier: string): boolean => PLATFORM_EXTERNALS.includes(specifier)

const host: UserConfig = {
  name: 'dsh-token-optima',
  entry: { index: './.build/host/index.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: false,
  deps: {
    neverBundle: (specifier: string) =>
      specifier.startsWith('node:') ||
      specifier === '@deepseek-ai/cordis' ||
      specifier === '@deepseek-ai/schemastery' ||
      specifier === '@deepseek-ai/dsh-typert-protocol' ||
      // 精确 tokenizer 是 optionalDependency，体积约 8 MB（含 WASM 词表），
      // 绝不能打包进 lib/index.mjs，否则插件主包直接爆炸。
      // 运行期由宿主环境按需 resolve；未安装时 loadHfTokenizer 动态导入失败并降级。
      specifier === '@huggingface/tokenizers',
    alwaysBundle: (specifier: string) =>
      !specifier.startsWith('node:') &&
      specifier !== '@deepseek-ai/cordis' &&
      specifier !== '@deepseek-ai/schemastery' &&
      specifier !== '@deepseek-ai/dsh-typert-protocol' &&
      specifier !== '@huggingface/tokenizers',
  },
  outputOptions: { comments: false },
}

const client: UserConfig = {
  name: 'dsh-token-optima/client',
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  clean: false,
  sourcemap: true,
  deps: {
    neverBundle: isRequested,
    alwaysBundle: (specifier: string) => !isRequested(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapExcludeSources: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify('dsh-token-optima')}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [host, client]