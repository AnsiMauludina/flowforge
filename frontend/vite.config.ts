import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Vite logs EPIPE / ECONNRESET as "ws proxy error" when a browser tab closes
// or refreshes while a WebSocket/HMR connection is still open. These are
// completely harmless — suppress them to keep the console clean.
const SUPPRESS_PATTERNS = [/EPIPE/, /ECONNRESET/, /write EPIPE/]

const logger = createLogger()
const originalWarn = logger.warn.bind(logger)
logger.warn = (msg, opts) => {
  if (SUPPRESS_PATTERNS.some((re) => re.test(msg))) return
  originalWarn(msg, opts)
}

export default defineConfig({
  customLogger: logger,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
