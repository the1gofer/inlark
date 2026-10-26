// Messages exchanged between the browser bridge and the inlark server over one WebSocket.
// Shared by both sides, so it must not import anything that only runs in Node.
import type { AppEvent } from '@inlark/core'

export type ClientMessage =
  /** Calls one DesktopMailAPI method. `files` names uploads that stand in for a native file picker. */
  | { t: 'call'; id: number; method: string; args: unknown[]; files?: string[] }
  /** Answers a server request such as a file pick or a clipboard write. */
  | { t: 'reply'; id: number; ok: boolean; value?: unknown }
  | { t: 'notification-click'; id: string }
  | { t: 'active' }

export type ServerMessage =
  | { t: 'result'; id: number; ok: true; value: unknown }
  | { t: 'result'; id: number; ok: false; error: string }
  | { t: 'event'; event: AppEvent }
  | { t: 'request'; id: number; kind: 'pick'; title: string; multiple: boolean }
  | { t: 'request'; id: number; kind: 'clipboard'; text: string }
  | { t: 'download'; url: string; name: string }
  | { t: 'open'; url: string }
  | { t: 'notify'; id: string; title: string; body: string }
  | { t: 'reload' }

/** Types a browser can show by itself, so opening an attachment shows it in a tab. */
const viewable: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
}
/** The type to show an attachment as, judged by its name when the sender gave a generic type. */
export function viewableType(type: string, name: string): string | undefined {
  const given = type.toLowerCase().split(';')[0].trim()
  if (Object.values(viewable).includes(given)) return given
  if (given && given !== 'application/octet-stream') return undefined
  return viewable[name.toLowerCase().split('.').pop() || '']
}

// Structured clone (Electron IPC) keeps byte arrays and `undefined` arguments; JSON turns
// them into objects and nulls, which the input schemas reject. Tag them instead.
export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message, function (this: unknown, _key, value) {
    if (value instanceof Uint8Array) return { $bytes: toBase64(value) }
    if (value === undefined && Array.isArray(this)) return { $undefined: true }
    return value
  })
}
export function decode<T>(text: string): T {
  return JSON.parse(text, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const keys = Object.keys(value)
    if (keys.length !== 1) return value
    if (keys[0] === '$bytes' && typeof value.$bytes === 'string') return fromBase64(value.$bytes)
    if (keys[0] === '$undefined' && value.$undefined === true) return undefined
    return value
  }) as T
}
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
