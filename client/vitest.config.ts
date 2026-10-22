import { defineConfig } from 'vitest/config'

/**
 * `*.test.ts` 跑 node 環境；需要 DOM 的 `.ts` 測試在檔頭標 `// @vitest-environment jsdom`。
 * `*.test.tsx`（元件測試）一律 jsdom。
 */
export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['src/testing/setupRng.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['src/**/*.{test,spec}.ts'] },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.{test,spec}.tsx'] },
      },
    ],
  },
  resolve: {
    alias: {
      '@': '/Users/vanceliu/Documents/Private/Project/GitHub/MayanaIdle/client/src',
    },
  },
})
