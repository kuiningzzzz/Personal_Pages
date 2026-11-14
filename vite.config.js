import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'

// PDF.js font/decoder assets stay local and are requested only when needed.
function pdfAssets() {
  const root = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url))
  return {
    name: 'pdf-assets',
    configureServer(server) {
      server.middlewares.use('/pdf-assets', (req, res, next) => {
        const parts = (req.url || '').split('?')[0].split('/').filter(Boolean)
        if (parts.length !== 2 || !['cmaps', 'standard_fonts', 'wasm'].includes(parts[0]) || basename(parts[1]) !== parts[1] || !/^[a-zA-Z0-9_.-]+$/.test(parts[1])) return next()
        const path = resolve(root, ...parts)
        if (!existsSync(path)) return next()
        res.setHeader('Content-Type', parts[1].endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        res.end(readFileSync(path))
      })
    },
    writeBundle(options) {
      for (const directory of ['cmaps', 'standard_fonts', 'wasm']) cpSync(resolve(root, directory), resolve(options.dir, 'pdf-assets', directory), { recursive: true })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), pdfAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3002',
        // Admin writes compare Origin with Host. Preserve the browser-facing host.
        changeOrigin: false,
        ws: true
      }
    }
  }
})
