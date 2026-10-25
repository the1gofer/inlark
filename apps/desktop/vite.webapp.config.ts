// Builds the browser side of the self-hosted web version: the normal interface plus the
// WebSocket bridge that stands in for the desktop preload.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/web',
  publicDir: fileURLToPath(new URL('./src/renderer/public', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  build: { outDir: '../../out/web', emptyOutDir: true, minify: 'esbuild' },
})
