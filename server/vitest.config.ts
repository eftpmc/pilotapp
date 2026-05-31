import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files sequentially — they share a SQLite file on disk
    fileParallelism: false,
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    testTimeout: 10_000,
  },
});
