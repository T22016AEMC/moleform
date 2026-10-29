import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { getBuildInfo } from './scripts/build-info.mjs';
import { serveBuiltKetcher } from './scripts/serve-built-ketcher.mjs';

const buildInfo = getBuildInfo();

// GitHub Pages 子路徑：https://t22016aemc.github.io/moleform/
export default defineConfig({
  base: '/moleform/',
  plugins: [react(), serveBuiltKetcher()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildInfo.buildTime),
    __GIT_COMMIT__: JSON.stringify(buildInfo.commit),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 30000,
    reporters: ['dot'],
  },
});