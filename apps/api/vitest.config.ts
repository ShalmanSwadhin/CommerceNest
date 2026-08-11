import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    globalSetup: ['src/test/globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    poolOptions: {
      threads: { singleThread: true },
    },
    // Embedded Postgres keeps child processes; force exit after tests.
    teardownTimeout: 10_000,
    forceExit: true,
  },
});
