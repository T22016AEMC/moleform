import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages 子路徑：https://t22016aemc.github.io/moleform/
export default defineConfig({
  base: '/moleform/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 30000,
    reporters: ['dot'],
  },
});