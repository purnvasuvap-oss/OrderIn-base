import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: [
        "src/**/*.test.{js,jsx,ts,tsx}",
        "src/**/__tests__/**",
        "src/test/**",
        "src/main.{jsx,tsx}",
        "src/**/*.d.ts",
      ],
    },
  },
});
