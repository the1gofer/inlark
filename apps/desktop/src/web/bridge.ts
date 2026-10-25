// Gives the interface the same `window.mail` API the desktop preload provides, backed by the
// inlark server over a WebSocket instead of Electron IPC.
import type { AppEvent, DesktopMailAPI } from '@inlark/core'
import { decode, encode, type ClientMessage, type ServerMessage } from '../server/protocol'

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }
const listeners = new Set<(event: AppEvent) => void>()
const pending = new Map<number, Pending>()
const queue: string[] = []
let socket: WebSocket | undefined
let nextId = 1
let retry = 0
let connectedOnce = false

function connect() {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'
  const ws = new WebSocket(url)
  socket = ws
  ws.onopen = () => {
    retry = 0
    for (const message of queue.splice(0)) ws.send(message)
    // Account state may have moved on while this tab was away.
    if (connectedOnce) dispatch({ type: 'changed' })
    connectedOnce = true
    hideBanner()
  }
  ws.onmessage = (event) => void receive(decode<ServerMessage>(String(event.data)))
  ws.onclose = () => {
    if (socket !== ws) return
    socket = undefined
    for (const [id, call] of pending) {
      pending.delete(id)
      call.reject(new Error('The connection to the inlark server was interrupted. Try again.'))
    }
    if (connectedOnce) showBanner('Reconnecting to the inlark server…')
    setTimeout(
      () => void signedIn().then((yes) => yes && connect()),
      Math.min(30_000, 500 * 2 ** retry++),
    )
  }
}
/** Sends the tab to the sign-in page when its session has ended. */
async function signedIn() {
  try {
    const response = await fetch('/index.html', { redirect: 'manual', cache: 'no-store' })
    if (response.type === 'opaqueredirect' || response.status === 401) {
      location.assign('/login')
      return false
    }
  } catch {
    /* The server is unreachable; keep retrying. */
  }
  return true
}
function post(message: ClientMessage) {
  const text = encode(message)
  if (socket?.readyState === WebSocket.OPEN) socket.send(text)
  else queue.push(text)
}
function dispatch(event: AppEvent) {
  for (const listener of listeners) listener(event)
}
function call(method: string, args: unknown[], files?: string[]): Promise<unknown> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    post({ t: 'call', id, method, args, files })
  })
}

async function receive(message: ServerMessage) {
  if (message.t === 'result') {
    const call = pending.get(message.id)
    pending.delete(message.id)
    if (message.ok) call?.resolve(message.value)
    else call?.reject(new Error(message.error))
  } else if (message.t === 'event') dispatch(message.event)
  else if (message.t === 'download') {
    const link = document.createElement('a')
    link.href = message.url
    link.download = message.name
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
  } else if (message.t === 'open') openLink(message.url)
  else if (message.t === 'reload') location.reload()
  else if (message.t === 'notify') notify(message.id, message.title, message.body)
  else if (message.t === 'request') {
    if (message.kind === 'clipboard') {
      let ok = false
      if (document.hasFocus())
        ok = await navigator.clipboard?.writeText(message.text).then(
          () => true,
          () => false,
        )
      post({ t: 'reply', id: message.id, ok })
    } else if (message.kind === 'pick') {
      // The picker needs a fresh click, so ask for one.
      const files = await promptForFiles(message.title, message.multiple)
      const ids = files.length ? await uploadAll(files).catch(() => []) : []
      post({ t: 'reply', id: message.id, ok: ids.length > 0, value: ids })
    }
  }
}

function openLink(url: string) {
  if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
}
function notify(id: string, title: string, body: string) {
  // Only notify from one tab, and only when no tab is already in front of the user.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  const notification = new Notification(title, { body, tag: id })
  notification.onclick = () => {
    window.focus()
    post({ t: 'notification-click', id })
    notification.close()
  }
}
// Ask once, from a click, since browsers ignore permission requests made without one.
document.addEventListener(
  'pointerdown',
  () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default')
      void Notification.requestPermission().catch(() => {})
  },
  { once: true },
)
for (const name of ['focus', 'pointerdown', 'keydown'])
  window.addEventListener(
    name,
    () => socket?.readyState === WebSocket.OPEN && post({ t: 'active' }),
    {
      passive: true,
    },
  )

/** Opens the browser's file picker. Must run while the user's click is still being handled. */
function pickFiles(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.style.display = 'none'
    let settled = false
    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish([...(input.files || [])]))
    input.addEventListener('cancel', () => finish([]))
    document.body.append(input)
    input.click()
  })
}
async function uploadAll(files: File[]): Promise<string[]> {
  const ids: string[] = []
  for (const file of files) {
    if (file.size > 100_000_000) throw new Error('Files over 100 MB cannot be attached.')
    const response = await fetch('/upload?name=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Inlark': '1' },
      body: file,
    })
    if (!response.ok) throw new Error((await response.text()) || 'The file could not be uploaded.')
    ids.push(((await response.json()) as { id: string }).id)
  }
  return ids
}
/** Calls a method that opens a file picker on the desktop, with the files chosen here first. */
async function withFiles(method: string, args: unknown[], multiple: boolean, empty: unknown) {
  const files = await pickFiles(multiple)
  if (!files.length) return typeof empty === 'function' ? empty() : empty
  return call(method, args, await uploadAll(files))
}

/** A small prompt that gets a fresh click when the server asks for a file on its own. */
function promptForFiles(title: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div')
    backdrop.className = 'web-bridge-prompt'
    backdrop.innerHTML =
      '<div role="dialog" aria-modal="true"><p></p><div><button type="button" data-cancel>Cancel</button><button type="button" data-pick>Choose…</button></div></div>'
    backdrop.querySelector('p')!.textContent = title
    backdrop.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => {
      backdrop.remove()
      resolve([])
    }
    backdrop.querySelector<HTMLButtonElement>('[data-pick]')!.onclick = () => {
      backdrop.remove()
      void pickFiles(multiple).then(resolve)
    }
    document.body.append(backdrop)
  })
}

let banner: HTMLDivElement | undefined
function showBanner(text: string) {
  if (!banner) {
    banner = document.createElement('div')
    banner.className = 'web-bridge-banner'
    banner.setAttribute('role', 'status')
    document.body.append(banner)
  }
  banner.textContent = text
}
function hideBanner() {
  banner?.remove()
  banner = undefined
}

const api = new Proxy({} as Record<string, unknown>, {
  get(_target, name) {
    if (typeof name !== 'string' || name === 'then') return undefined
    return (...args: unknown[]) => call(name, args)
  },
}) as unknown as DesktopMailAPI

const overrides: Partial<DesktopMailAPI> = {
  onEvent(listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  // Open links here, while the click still counts, so the browser does not block the tab.
  async openExternal(value: string) {
    const url = new URL(value)
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password)
      throw new Error('This link type is not supported.')
    if (url.protocol === 'mailto:') dispatch({ type: 'mailto', url: value })
    else openLink(url.toString())
  },
  stageAttachments: (protectedDraft?: boolean) =>
    withFiles('stageAttachments', [protectedDraft], true, []) as never,
  // Dropped files go up like picked ones, then stand in for the server's file picker.
  stageAttachmentFiles: async (files, protectedDraft) =>
    call(
      'stageAttachments',
      [protectedDraft],
      await uploadAll(files.map((file) => new File([file.data as BlobPart], file.name))),
    ) as never,
  setupEncryption: (input) =>
    input.action === 'import' ||
    input.action === 'historical' ||
    (input.action === 'replace' && input.importReplacement)
      ? (withFiles('setupEncryption', [input], false, () => call('encryptionStatus', [])) as never)
      : (call('setupEncryption', [input]) as never),
  transferEncryption: (input) =>
    input.action === 'import'
      ? (withFiles('transferEncryption', [input], false, {}) as never)
      : (call('transferEncryption', [input]) as never),
}

window.mail = new Proxy(api, {
  get: (target, name) =>
    typeof name === 'string' && Object.hasOwn(overrides, name)
      ? overrides[name as keyof DesktopMailAPI]
      : Reflect.get(target, name),
})
// A file dropped anywhere the interface does not take it would replace the app with the file.
for (const name of ['dragover', 'drop'])
  window.addEventListener(name, (event) => {
    const data = (event as DragEvent).dataTransfer
    if (data?.types.includes('Files') && !event.defaultPrevented) {
      event.preventDefault()
      data.dropEffect = 'none'
    }
  })
connect()
