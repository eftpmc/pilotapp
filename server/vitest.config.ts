import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files sequentially — they share a SQLite file on disk
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    exclude: ['dist/**', 'data/**', 'node_modules/**'],
    testTimeout: 10_000,
  },
});
