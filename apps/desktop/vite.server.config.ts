// Builds the self-hosted web server: the desktop mail service with Electron replaced by
// server stand-ins (src/server/electron-shim.ts), bundled for plain Node.
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/** Matches electron-vite: `import path from './worker?modulePath'` emits a chunk and yields its path. */
function modulePath(): Plugin {
  const prefix = '\0module-path:'
  return {
    name: 'inlark-module-path',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.endsWith('?modulePath')) return null
      const resolved = await this.resolve(source.slice(0, -'?modulePath'.length), importer)
      return resolved && prefix + resolved.id
    },
    load(id) {
      if (!id.startsWith(prefix)) return null
      const reference = this.emitFile({ type: 'chunk', id: id.slice(prefix.length) })
      return `import { fileURLToPath } from 'node:url'
export default fileURLToPath(import.meta.ROLLUP_FILE_URL_${reference})`
    },
  }
}

export default defineConfig({
  define: {
    __INLARK_VERSION__: JSON.stringify(version),
    // ws loads optional native helpers with require(); bundled, those resolve to empty stubs.
    'process.env.WS_NO_BUFFER_UTIL': '"1"',
    'process.env.WS_NO_UTF_8_VALIDATE': '"1"',
  },
  resolve: {
    alias: { electron: fileURLToPath(new URL('./src/server/electron-shim.ts', import.meta.url)) },
  },
  plugins: [modulePath()],
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/server/index.ts',
    outDir: 'out/server',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => 'node:' + m)],
      output: { format: 'es', entryFileNames: 'index.js' },
    },
  },
})
