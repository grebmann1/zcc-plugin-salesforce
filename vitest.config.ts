import { defineConfig } from 'vitest/config';
export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { include: ['src/**/*.test.{ts,tsx}', 'playground/src/**/*.test.ts', 'scripts/**/*.test.ts'], setupFiles: ['./vitest.setup.ts'], maxWorkers: 4, testTimeout: 20000, hookTimeout: 20000 } });
