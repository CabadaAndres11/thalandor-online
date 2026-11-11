import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: { globals: true, include: ['src/**/*.test.ts', 'tools/**/*.test.ts'] },
  }),
);
