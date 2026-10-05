import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    // Every browser that runs this app supports modulepreload natively.
    modulePreload: { polyfill: false },
    cssCodeSplit: true,
    reportCompressedSize: false,
  },
  test: {
    include: ['tests/core/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      // PLAN.md M2: the core is fully covered, and stays that way.
      thresholds: { 100: true },
      reporter: ['text-summary'],
    },
  },
});
