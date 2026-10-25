import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  length: number,
) => Promise<Buffer>
const sessionDays = 30
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

interface AuthFile {
  password?: { salt: string; hash: string }
  /** Session tokens are stored hashed, so a copy of this file cannot sign anyone in. */
  sessions: { hash: string; expires: number }[]
}

/** One password for the whole server; inlark keeps a single person's mail. */
export class Auth {
  private data: AuthFile = { sessions: [] }
  private failures: number[] = []
  private path: string
  constructor(
    directory: string,
    private fixedPassword?: string,
  ) {
    this.path = join(directory, 'auth.json')
  }
  async init() {
    try {
      this.data = JSON.parse(await readFile(this.path, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.data.sessions = (this.data.sessions || []).filter((s) => s.expires > Date.now())
  }
  /** True until a password is set by environment or by the first-run page. */
  get needsSetup() {
    return !this.fixedPassword && !this.data.password
  }
  async setup(password: string) {
    if (!this.needsSetup) throw new Error('A password is already set.')
    if (password.length < 10) throw new Error('Use at least 10 characters.')
    const salt = randomBytes(16)
    this.data.password = {
      salt: salt.toString('base64'),
      hash: (await scrypt(password, salt, 64)).toString('base64'),
    }
    await this.save()
  }
  /** Checks a password, slowing down after repeated failures. */
  async login(password: string): Promise<string | null> {
    const now = Date.now()
    this.failures = this.failures.filter((at) => now - at < 15 * 60_000)
    if (this.failures.length >= 10) return null
    if (!(await this.matches(password))) {
      this.failures.push(now)
      await new Promise((resolve) => setTimeout(resolve, 500 + this.failures.length * 250))
      return null
    }
    this.failures = []
    const token = randomBytes(32).toString('base64url')
    this.data.sessions.push({ hash: sha256(token), expires: now + sessionDays * 86_400_000 })
    await this.save()
    return token
  }
  get lockedOut() {
    return this.failures.filter((at) => Date.now() - at < 15 * 60_000).length >= 10
  }
  valid(token: string | undefined): boolean {
    if (!token) return false
    const hash = sha256(token)
    return this.data.sessions.some((s) => s.hash === hash && s.expires > Date.now())
  }
  async logout(token: string | undefined) {
    if (!token) return
    const hash = sha256(token)
    this.data.sessions = this.data.sessions.filter((s) => s.hash !== hash)
    await this.save()
  }
  private async matches(password: string) {
    if (this.fixedPassword) {
      const a = Buffer.from(sha256(password)),
        b = Buffer.from(sha256(this.fixedPassword))
      return timingSafeEqual(a, b)
    }
    if (!this.data.password) return false
    const expected = Buffer.from(this.data.password.hash, 'base64')
    const actual = await scrypt(password, Buffer.from(this.data.password.salt, 'base64'), 64)
    return timingSafeEqual(actual, expected)
  }
  private async save() {
    const temporary = this.path + '.tmp'
    await writeFile(temporary, JSON.stringify(this.data), { mode: 0o600 })
    await rename(temporary, this.path)
  }
}
