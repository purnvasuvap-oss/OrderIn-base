import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import os from 'node:os'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This project lives under OneDrive, whose background sync locks files
  // mid-write and collides with Vite renaming its dep-cache temp folder
  // (EPERM on node_modules/.vite/deps). Keeping the cache outside the
  // synced tree avoids the race entirely.
  cacheDir: path.join(os.tmpdir(), 'vite-cache', 'orderin_custmer-Maroon-poscloud'),
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.(js|jsx)$/,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('react')) return 'react';
            if (id.includes('lucide-react')) return 'lucide';
            if (id.match(/(jspdf|html2pdf)/)) return 'pdf';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
