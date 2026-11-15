import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Keep the dep-optimizer cache OUT of the project folder. This repo lives
  // under OneDrive, whose sync/locking makes Vite's atomic rename of
  // node_modules/.vite/deps fail with "EPERM: operation not permitted".
  cacheDir: path.join(os.tmpdir(), 'vite-cache-orderin-olive-green'),
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    loader: 'jsx',
    include: /src\/.*\.(js|jsx)$/,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            // react-pageflip (the React wrapper) and its actual page-turn
            // engine — a separate dependency named "page-flip" — are only
            // imported by the lazily-loaded PublicMenu route
            // (src/publicMenu/BookLayout.jsx). Leaving both out of the eager
            // 'vendor' bucket lets Rollup place them in that route's own
            // async chunk instead of shipping them to every page.
            if (id.includes('react-pageflip') || id.includes('page-flip')) return;
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
}))
