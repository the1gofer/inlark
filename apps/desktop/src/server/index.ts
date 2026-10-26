// Runs inlark's mail service as a web server for one person, for a home server or container.
// The browser loads the normal interface and reaches the service over a WebSocket.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { ipcSchemas, type Settings } from '@inlark/core'
import { openCryptoWorker } from '../main/crypto-open'
import { JsonStore } from '../main/storage'
import { MailService } from '../main/service'
import { imapProviders } from '../main/imap-accounts'
import { discover } from '../main/discovery-transport'
import { configureShim, notificationClicked } from './electron-shim'
import { broadcast, callContext, Client, clients, type Download } from './clients'
import { decode, viewableType, type ClientMessage } from './protocol'
import { Auth } from './auth'
import { loginPage } from './login-page'

declare const __INLARK_VERSION__: string

const here = fileURLToPath(new URL('.', import.meta.url))
const webRoot = resolve(process.env.INLARK_WEB_ROOT || join(here, '../web'))
const dataDirectory = resolve(process.env.INLARK_DATA_DIR || './inlark-data')
const serverDirectory = join(dataDirectory, 'server')
const temporaryDirectory = join(dataDirectory, 'tmp')
const port = Number(process.env.PORT || 8080)
const host = process.env.HOST || '0.0.0.0'
const cookieName = 'inlark_session'
const maxUpload = 100_000_000
const transferLifetime = 15 * 60_000

async function secretKey(): Promise<Buffer> {
  const configured = process.env.INLARK_SECRET_KEY?.trim()
  if (configured) {
    const key = /^[0-9a-f]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64')
    if (key.length !== 32)
      throw new Error('INLARK_SECRET_KEY must be 32 bytes, as 64 hex characters or base64.')
    return key
  }
  const path = join(serverDirectory, 'secret.key')
  try {
    return Buffer.from((await readFile(path, 'utf8')).trim(), 'base64')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const key = randomBytes(32)
  await writeFile(path, key.toString('base64'), { mode: 0o600, flag: 'wx' })
  return key
}

async function passwordFromEnvironment() {
  if (process.env.INLARK_PASSWORD_FILE)
    return (await readFile(process.env.INLARK_PASSWORD_FILE, 'utf8')).trim()
  return process.env.INLARK_PASSWORD || undefined
}

// Uploads stand in for the native file picker. Each lives until its call ends or it expires.
const uploads = new Map<string, { path: string; expires: number }>()
const downloads = new Map<string, Download & { expires: number }>()
function resolveUploads(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return ids.flatMap((id) => {
    const upload = typeof id === 'string' ? uploads.get(id) : undefined
    return upload && upload.expires > Date.now() ? [upload.path] : []
  })
}
async function releaseUploads(paths: string[]) {
  for (const [id, upload] of uploads)
    if (paths.includes(upload.path)) {
      uploads.delete(id)
      await rm(join(upload.path, '..'), { recursive: true, force: true })
    }
}
setInterval(() => {
  const now = Date.now()
  for (const [id, upload] of uploads)
    if (upload.expires < now) {
      uploads.delete(id)
      void rm(join(upload.path, '..'), { recursive: true, force: true })
    }
  for (const [token, download] of downloads)
    if (download.expires < now) {
      downloads.delete(token)
      void rm(join(download.path, '..'), { recursive: true, force: true })
    }
}, 60_000).unref()

function cookies(request: IncomingMessage) {
  const values: Record<string, string> = {}
  for (const part of (request.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0)
      values[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return values
}
const secureRequest = (request: IncomingMessage) =>
  process.env.INLARK_SECURE_COOKIE === 'true' ||
  request.headers['x-forwarded-proto'] === 'https' ||
  (request.socket as { encrypted?: boolean }).encrypted === true
function sameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin
  if (!origin) return false
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}
async function readBody(request: IncomingMessage, limit = 10_000): Promise<string> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('Request too large.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
function send(
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  type = 'text/plain; charset=utf-8',
) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  response.end(body)
}
function redirect(response: ServerResponse, location: string, cookie?: string) {
  response.writeHead(303, {
    Location: location,
    'Cache-Control': 'no-store',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  })
  response.end()
}

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}
async function serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string) {
  let path: string
  try {
    path = resolve(webRoot, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname))
  } catch {
    return send(response, 400, 'Bad request')
  }
  if (!path.startsWith(webRoot + sep)) return send(response, 404, 'Not found')
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return send(response, 404, 'Not found')
  if (path === join(webRoot, 'index.html')) {
    // The page's policy allowed only the desktop's local dev server; allow this server's socket.
    const socketHost = request.headers.host || ''
    const html = (await readFile(path, 'utf8')).replace(
      /connect-src [^;]*/,
      /^[a-z0-9.:[\]-]+$/i.test(socketHost)
        ? `connect-src 'self' ws://${socketHost} wss://${socketHost}`
        : "connect-src 'self'",
    )
    return send(response, 200, html, types['.html'])
  }
  response.writeHead(200, {
    'Content-Type': types[extname(path)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  })
  createReadStream(path).pipe(response)
}

async function main() {
  await mkdir(serverDirectory, { recursive: true, mode: 0o700 })
  await rm(temporaryDirectory, { recursive: true, force: true })
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 })
  configureShim({
    dataDirectory,
    temporaryDirectory,
    version: __INLARK_VERSION__,
    secretKey: await secretKey(),
    resolveUploads,
  })
  const auth = new Auth(serverDirectory, await passwordFromEnvironment())
  await auth.init()

  const service = new MailService(
    new JsonStore(join(dataDirectory, 'mail')),
    (event) => broadcast({ t: 'event', event }),
    { providers: imapProviders, crypto: openCryptoWorker, discover },
  )
  await service.init()

  const overrides: Partial<Record<keyof typeof ipcSchemas, (...args: any[]) => unknown>> = {
    // Each tab gets its own events as soon as it connects, so there is nothing to release.
    ready: async () => {},
    // Updates come from pulling a new container image.
    updateStatus: async () => ({ phase: 'idle' }),
    settings: (settings: Settings) => service.setSettings(settings),
    // Nothing on the server needs a restart; reloading the tabs applies window settings.
    restart: async () => {
      setTimeout(() => broadcast({ t: 'reload' }), 100)
    },
  }
  const invoke = async (method: string, args: unknown[]) => {
    if (!Object.hasOwn(ipcSchemas, method) || !Array.isArray(args))
      throw new Error('Unknown action.')
    // Decoding leaves holes where arguments were undefined; fill them back in.
    args = Array.from(args)
    const name = method as keyof typeof ipcSchemas
    const parsed = ipcSchemas[name].safeParse(args)
    if (!parsed.success) throw new Error('Invalid input. Check the fields and try again.')
    const handler = overrides[name] || ((service as any)[name] as (...args: unknown[]) => unknown)
    return handler(...(parsed.data as unknown[]))
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'same-origin')
    response.setHeader('Content-Security-Policy', "frame-ancestors 'self'")
    try {
      const url = new URL(request.url || '/', 'http://localhost')
      const token = cookies(request)[cookieName]
      const signedIn = auth.valid(token)
      if (url.pathname === '/healthz') return send(response, 200, 'ok')
      if (url.pathname === '/login' && request.method === 'GET') {
        if (signedIn) return redirect(response, '/')
        return send(
          response,
          200,
          loginPage({ setup: auth.needsSetup, error: url.searchParams.get('error') }),
          types['.html'],
        )
      }
      if ((url.pathname === '/login' || url.pathname === '/setup') && request.method === 'POST') {
        if (!sameOrigin(request)) return send(response, 403, 'Forbidden')
        const form = new URLSearchParams(await readBody(request))
        const password = form.get('password') || ''
        if (url.pathname === '/setup') {
          if (!auth.needsSetup) return redirect(response, '/login')
          if (password !== form.get('confirm')) return redirect(response, '/login?error=mismatch')
          try {
            await auth.setup(password)
          } catch {
            return redirect(response, '/login?error=short')
          }
        }
        const session = await auth.login(password)
        if (!session)
          return redirect(response, '/login?error=' + (auth.lockedOut ? 'locked' : 'wrong'))
        return redirect(
          response,
          '/',
          `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 86400}${secureRequest(request) ? '; Secure' : ''}`,
        )
      }
      if (url.pathname === '/logout' && request.method === 'POST') {
        if (!sameOrigin(request)) return send(response, 403, 'Forbidden')
        await auth.logout(token)
        return redirect(
          response,
          '/login',
          `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
        )
      }
      if (!signedIn) {
        if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html'))
          return redirect(response, '/login')
        return send(response, 401, 'Sign in to inlark first.')
      }
      if (url.pathname === '/upload' && request.method === 'POST') {
        if (!sameOrigin(request) || request.headers['x-inlark'] !== '1')
          return send(response, 403, 'Forbidden')
        const length = Number(request.headers['content-length'] || 0)
        if (length > maxUpload) return send(response, 413, 'Files over 100 MB cannot be attached.')
        const name =
          basename(url.searchParams.get('name') || 'file')
            .replace(/[\0-\x1f/\\]/g, '_')
            .slice(0, 200) || 'file'
        const id = randomUUID()
        const directory = join(temporaryDirectory, 'uploads', id)
        await mkdir(directory, { recursive: true, mode: 0o700 })
        const path = join(directory, name)
        let size = 0
        try {
          await pipeline(
            request,
            async function* (source) {
              for await (const chunk of source) {
                size += chunk.length
                if (size > maxUpload) throw new Error('Too large')
                yield chunk
              }
            },
            createWriteStream(path, { mode: 0o600 }),
          )
        } catch {
          await rm(directory, { recursive: true, force: true })
          return send(response, 413, 'Files over 100 MB cannot be attached.')
        }
        uploads.set(id, { path, expires: Date.now() + transferLifetime })
        return send(response, 200, JSON.stringify({ id }), 'application/json')
      }
      // The browser fetches attachments itself, from the click, so nothing blocks the file
      // and the browser shows its own progress. Viewable types can open in a tab.
      if (url.pathname === '/attachment' && request.method === 'GET') {
        const query = url.searchParams
        const accountId = query.get('account') || ''
        const parsed = ipcSchemas.attachment.safeParse([
          accountId,
          {
            blobId: query.get('blob') || '',
            name: query.get('name') || '',
            type: query.get('type') || '',
            size: 0,
          },
          query.get('open') === '1',
        ])
        if (!parsed.success) return send(response, 400, 'This attachment link is not valid.')
        const [, attachment, open] = parsed.data
        let bytes: Uint8Array
        try {
          bytes = await service.attachmentBytes(accountId, attachment)
        } catch (error) {
          return send(
            response,
            502,
            error instanceof Error ? error.message : 'The attachment could not be downloaded.',
          )
        }
        const name =
          basename(attachment.name)
            .replace(/[\0-\x1f/\\]/g, '_')
            .slice(0, 200) || 'attachment'
        const shown = open ? viewableType(attachment.type, name) : undefined
        const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_')
        response.writeHead(200, {
          'Content-Type': shown || 'application/octet-stream',
          'Content-Length': bytes.byteLength,
          'Content-Disposition': `${shown ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`,
          'Cache-Control': 'no-store',
          // Images and text get no scripts or same-origin access. Browsers' PDF viewers refuse
          // to run sandboxed, and do not run a document's scripts with this origin anyway.
          ...(shown && shown !== 'application/pdf'
            ? { 'Content-Security-Policy': "frame-ancestors 'self'; sandbox" }
            : {}),
        })
        return response.end(bytes)
      }
      if (url.pathname.startsWith('/download/') && request.method === 'GET') {
        const download = downloads.get(url.pathname.slice('/download/'.length))
        if (!download || !existsSync(download.path))
          return send(response, 404, 'This download has expired.')
        const info = await stat(download.path)
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': info.size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(download.name)}`,
          'Cache-Control': 'no-store',
        })
        return createReadStream(download.path).pipe(response)
      }
      if (request.method === 'GET') return await serveStatic(request, response, url.pathname)
      return send(response, 405, 'Method not allowed')
    } catch {
      if (!response.headersSent) send(response, 500, 'Something went wrong.')
      else response.destroy()
    }
  })

  const sockets = new WebSocketServer({ noServer: true, maxPayload: 150 * 1024 * 1024 })
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost')
    if (
      url.pathname !== '/ws' ||
      !sameOrigin(request) ||
      !auth.valid(cookies(request)[cookieName])
    ) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      return socket.destroy()
    }
    sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws, request))
  })
  sockets.on('connection', (ws) => {
    const client = new Client(ws)
    clients.add(client)
    ws.on('close', () => {
      clients.delete(client)
      client.close()
    })
    ws.on('message', async (raw) => {
      let message: ClientMessage
      try {
        message = decode<ClientMessage>(raw.toString())
      } catch {
        return
      }
      if (message.t === 'active') client.lastActive = Date.now()
      else if (message.t === 'reply') client.reply(message.id, message)
      else if (message.t === 'notification-click') notificationClicked(message.id)
      else if (message.t === 'call') {
        client.lastActive = Date.now()
        const files = resolveUploads(message.files)
        const context = { client, files, downloads: [] as Download[] }
        try {
          const value = await callContext.run(context, () => invoke(message.method, message.args))
          for (const download of context.downloads) {
            if (!existsSync(download.path)) continue
            await chmod(download.path, 0o600)
            const token = randomBytes(24).toString('base64url')
            downloads.set(token, { ...download, expires: Date.now() + transferLifetime })
            client.send({ t: 'download', url: '/download/' + token, name: download.name })
          }
          client.send({ t: 'result', id: message.id, ok: true, value })
        } catch (error) {
          client.send({
            t: 'result',
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : 'Something went wrong.',
          })
        } finally {
          await releaseUploads(files)
        }
      }
    })
  })

  server.listen(port, host, () => {
    console.log(`inlark web is listening on http://${host}:${port}`)
    if (auth.needsSetup) console.log('Open it in a browser to choose a password.')
  })
  const stop = () => {
    service.dispose()
    for (const client of clients) client.socket.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

main().catch((error) => {
  // Avoid dumping potentially private protocol data into logs.
  console.error('inlark failed to start:', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
})
