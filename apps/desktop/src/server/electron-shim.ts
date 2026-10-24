// Stands in for the `electron` module when the mail service runs in the web server build.
// Each native surface maps to the browser tab that made the call, or to the most recent tab.
import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto'
import { activeClient, broadcast, callContext } from './clients'

interface ShimConfig {
  dataDirectory: string
  temporaryDirectory: string
  version: string
  secretKey: Buffer
  resolveUploads: (ids: unknown) => string[]
}
let config: ShimConfig | undefined
export function configureShim(value: ShimConfig) {
  if (value.secretKey.length !== 32) throw new Error('The secret key must be 32 bytes.')
  config = value
}
function required() {
  if (!config) throw new Error('The server has not finished starting.')
  return config
}

export const app = {
  getVersion: () => required().version,
  getPath: (name: string) =>
    name === 'temp' ? required().temporaryDirectory : required().dataDirectory,
  getName: () => 'inlark',
}

// Saved passwords are sealed with AES-256-GCM under a key that lives outside the mail data.
const magic = Buffer.from('ik1:')
export const safeStorage = {
  isEncryptionAvailable: () => !!config,
  getSelectedStorageBackend: () => 'inlark_server_key',
  encryptString(value: string): Buffer {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', required().secretKey, iv)
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([magic, iv, cipher.getAuthTag(), body])
  },
  decryptString(value: Buffer): string {
    if (!value.subarray(0, magic.length).equals(magic)) throw new Error('Unknown secret format.')
    const iv = value.subarray(4, 16),
      tag = value.subarray(16, 32),
      body = value.subarray(32)
    const decipher = createDecipheriv('aes-256-gcm', required().secretKey, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  },
}

interface OpenDialogOptions {
  title?: string
  properties?: string[]
}
interface SaveDialogOptions {
  title?: string
  defaultPath?: string
}
export const dialog = {
  /** Uses files the tab uploaded with the call, or asks the tab to pick some now. */
  async showOpenDialog(options: OpenDialogOptions) {
    const multiple = !!options.properties?.includes('multiSelections')
    const context = callContext.getStore()
    let paths = context?.files.length ? context.files : []
    if (!paths.length) {
      const client = context?.client || activeClient()
      if (!client) return { canceled: true, filePaths: [] }
      const reply = await client.request({
        kind: 'pick',
        title: options.title || 'Choose a file',
        multiple,
      })
      if (!reply.ok) return { canceled: true, filePaths: [] }
      paths = required().resolveUploads(reply.value)
    }
    if (!multiple) paths = paths.slice(0, 1)
    return { canceled: !paths.length, filePaths: paths }
  },
  /** Gives the service a private path; the server offers the file as a download when the call ends. */
  async showSaveDialog(options: SaveDialogOptions) {
    const context = callContext.getStore()
    if (!context) return { canceled: true, filePath: undefined }
    const name =
      basename(options.defaultPath || 'download').replace(/[\0-\x1f/\\]/g, '_') || 'download'
    const directory = join(required().temporaryDirectory, 'downloads', randomUUID())
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, name)
    context.downloads.push({ path, name })
    return { canceled: false, filePath: path }
  },
}

export const shell = {
  async openExternal(url: string) {
    const client = callContext.getStore()?.client || activeClient()
    client?.send({ t: 'open', url })
  },
  // The file already reaches the browser as a download, which the user opens from there.
  async openPath(_path: string) {
    return ''
  },
}

let copied: string | undefined
export const clipboard = {
  /** Browsers allow clipboard writes only in a focused tab, so this fails when none accepts it. */
  async writeText(text: string) {
    copied = undefined
    const client = activeClient()
    const reply = client ? await client.request({ kind: 'clipboard', text }, 5000) : { ok: false }
    if (!reply.ok) throw new Error('No open inlark tab could use the clipboard.')
    copied = text
  },
  async readText() {
    return copied ?? ''
  },
}

const notifications = new Map<string, Notification>()
export class Notification extends EventEmitter {
  static isSupported() {
    return true
  }
  readonly id = randomUUID()
  constructor(private options: { title: string; body?: string; silent?: boolean }) {
    super()
  }
  show() {
    notifications.set(this.id, this)
    // Keep recent notifications clickable without holding on to every one.
    if (notifications.size > 50) notifications.delete(notifications.keys().next().value!)
    broadcast({
      t: 'notify',
      id: this.id,
      title: this.options.title,
      body: this.options.body || '',
    })
  }
}
export function notificationClicked(id: string) {
  notifications.get(id)?.emit('click')
}

export default { app, safeStorage, dialog, shell, clipboard, Notification }
