import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
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
        configure: (proxy) => {
          // EPIPE and ECONNRESET are normal: the browser closed the WebSocket
          // before the proxy finished forwarding. Suppress to reduce noise.
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
              console.error('[proxy error]', err.message)
            }
          })
        },
      },
    },
  },
})
