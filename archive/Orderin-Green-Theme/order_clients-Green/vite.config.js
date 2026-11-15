import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// cacheDir is moved outside the OneDrive-synced project folder: OneDrive's
// file locking during sync intermittently breaks Vite's deps-cache rename,
// leaving the optimizer stuck re-bundling on every request (perpetual 404s
// for hashed dep URLs like react-dom_client.js).
//
// `npm run dev:https` serves over HTTPS on the LAN with a self-signed cert:
// phones only allow camera + geolocation (QR attendance) on secure origins.
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
  },
  cacheDir: 'C:/Users/HP/AppData/Local/Temp/vite-cache/order_clients-Maroon',
}))
