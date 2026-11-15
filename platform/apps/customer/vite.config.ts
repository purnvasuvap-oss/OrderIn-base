import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@orderin/core': fileURLToPath(new URL('../../packages/core/src/index.js', import.meta.url)),
    },
  },
  build: {
    commonjsOptions: {
      include: [/packages\/core\/src\/.+\.js$/, /node_modules/],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
