import { defineConfig } from 'vitest/config';

// Firestore rules tests: real Firebase SDK against the local emulator, so no
// jsdom and none of the SDK stubs from src/test/setup.js.
// Run with `npm run test:rules` (wraps this in `firebase emulators:exec`).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['rules-tests/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
