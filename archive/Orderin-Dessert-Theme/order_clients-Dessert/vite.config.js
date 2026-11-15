import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import os from 'node:os'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
  },
  // This project lives under OneDrive, whose background sync locks files
  // mid-write and collides with Vite renaming its dep-cache temp folder
  // (EPERM on node_modules/.vite/deps). Keeping the cache outside the
  // synced tree avoids the race entirely.
  cacheDir: path.join(os.tmpdir(), 'vite-cache', 'order_clients-Dessert'),
}))
