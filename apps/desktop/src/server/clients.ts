import { AsyncLocalStorage } from 'node:async_hooks'
import type { WebSocket } from 'ws'
import { encode, type ServerMessage } from './protocol'

type Request = Extract<ServerMessage, { t: 'request' }>
type RequestInput = Request extends infer R
  ? R extends Request
    ? Omit<R, 'id' | 't'>
    : never
  : never

/** One open browser tab. */
export class Client {
  lastActive = Date.now()
  private nextRequest = 1
  private pending = new Map<number, (reply: { ok: boolean; value?: unknown }) => void>()
  constructor(readonly socket: WebSocket) {}
  send(message: ServerMessage) {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(encode(message))
  }
  /** Asks the tab to do something only a browser can, such as pick a file. */
  request(input: RequestInput, timeout = 10 * 60_000): Promise<{ ok: boolean; value?: unknown }> {
    const id = this.nextRequest++
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish({ ok: false }), timeout)
      const finish = (reply: { ok: boolean; value?: unknown }) => {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(reply)
      }
      this.pending.set(id, finish)
      this.send({ t: 'request', id, ...input } as Request)
    })
  }
  reply(id: number, reply: { ok: boolean; value?: unknown }) {
    this.pending.get(id)?.(reply)
  }
  close() {
    for (const finish of [...this.pending.values()]) finish({ ok: false })
  }
}

export const clients = new Set<Client>()

export function broadcast(message: ServerMessage) {
  for (const client of clients) client.send(message)
}

/** The tab the user most recently used, for work that has no calling tab. */
export function activeClient(): Client | undefined {
  let best: Client | undefined
  for (const client of clients) if (!best || client.lastActive > best.lastActive) best = client
  return best
}

export interface Download {
  path: string
  name: string
}
/** What one API call carries: the tab that made it, files it uploaded, and files to hand back. */
export interface CallContext {
  client: Client
  files: string[]
  downloads: Download[]
}
export const callContext = new AsyncLocalStorage<CallContext>()
