import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/testing/setupRng.ts'],
  },
  resolve: {
    alias: {
      '@': '/Users/vanceliu/Documents/Private/Project/GitHub/MayanaIdle/client/src',
    },
  },
})
