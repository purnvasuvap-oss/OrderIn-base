import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// cacheDir is moved outside the OneDrive-synced project folder: OneDrive's
// file locking during sync intermittently breaks Vite's deps-cache rename,
// leaving the optimizer stuck re-bundling on every request (perpetual 504s).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  cacheDir: 'C:/Users/HP/AppData/Local/Temp/vite-cache/pos-system',
}))
