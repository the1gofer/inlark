import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal, Spinner, Switch, cn } from '@inlark/ui'
import { ArrowLeft, Copy, Download, Eye, RefreshCw, Trash2 } from '@inlark/ui/icons'
import {
  friendlyError,
  type Message,
  type Settings,
  type TrackedMessage,
  type TrackingState,
} from '@inlark/core'
import { api } from './api'
import { shortDate } from './mail-date'
import {
  countsAsOpen,
  device,
  evidenceCsv,
  evidenceText,
  likelyOpens,
  openKinds,
  place,
} from './tracking-text'

export function useTracking(enabled = true): TrackingState {
  const query = useQuery({ queryKey: ['tracking'], queryFn: () => api.tracking(), enabled })
  return query.data || { messages: [] }
}

export function trackedFor(state: TrackingState, message: Message) {
  if (!message.messageId?.length) return undefined
  return state.messages.find((m) => message.messageId!.includes(m.messageId))
}

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return minutes + ' min ago'
  if (minutes < 48 * 60) return Math.round(minutes / 60) + ' h ago'
  return shortDate(iso)
}

export function openSummary(message: TrackedMessage): string {
  const opens = likelyOpens(message)
  if (opens.length)
    return 'Opened' + (opens.length > 1 ? ' ' + opens.length + '×' : '') + ' · ' + ago(opens[0].at)
  return message.opens.length ? 'Not opened yet (image loaded)' : 'Not opened yet'
}

/** The open status of one sent message, shown on it in the reader. */
export function OpenBadge({ tracked }: { tracked: TrackedMessage }) {
  const [open, setOpen] = useState(false)
  const opened = tracked.opens.some(countsAsOpen)
  return (
    <>
      <button
        type="button"
        className={cn(
          'open-badge inline-flex items-center gap-1 shrink-0 py-0.5 px-1.75 rounded-full border border-solid text-[11px] whitespace-nowrap bg-transparent',
          opened
            ? 'border-success/40 text-success hover:bg-success/10'
            : 'border-border-strong text-muted hover:bg-hover',
        )}
        title="See every time this message was opened"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <Eye size={12} />
        <span className="@max-[680px]/mail:hidden">{openSummary(tracked)}</span>
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Open tracking"
        className="w-[min(640px,_calc(100vw_-_32px))]"
      >
        <TrackedDetail message={tracked} />
      </Modal>
    </>
  )
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const fileName = (message: TrackedMessage) =>
  'opens-' +
  (message.subject || 'message')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) +
  '-' +
  message.sentAt.slice(0, 10)

function TrackedDetail({ message, onForget }: { message: TrackedMessage; onForget?: () => void }) {
  const [copied, setCopied] = useState(false)
  const opens = [...message.opens].sort((a, b) => b.at.localeCompare(a.at))
  const to = [...message.to, ...message.cc].map((a) => a.name || a.email).join(', ')
  return (
    <div className="tracked-detail flex flex-col gap-4 text-[12px]">
      <div>
        <div className="text-[14px] font-[550] text-strong">
          {message.subject || '(no subject)'}
        </div>
        <div className="text-muted mt-1">
          To {to || 'nobody'} · sent {new Date(message.sentAt).toLocaleString()}
        </div>
        <div className="mt-2 text-[13px]">{openSummary(message)}</div>
      </div>
      {opens.length ? (
        <ol className="m-0 p-0 list-none flex flex-col border border-solid border-border rounded-lg overflow-hidden">
          {opens.map((open) => (
            <li
              key={open.hit}
              className={cn(
                'py-2.5 px-3 [&+li]:border-t [&+li]:border-solid [&+li]:border-t-border',
                !countsAsOpen(open) && 'opacity-70',
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <strong className="font-[550]">{openKinds[open.kind].label}</strong>
                <time dateTime={open.at} className="text-muted">
                  {new Date(open.at).toLocaleString()}
                </time>
              </div>
              <div className="text-secondary mt-0.5">
                {[device(open.userAgent), place(open), open.network, open.ip]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="text-muted mt-0.5 text-[11px]">{openKinds[open.kind].note}</div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-muted">
          No opens yet. Recipients who block images are never recorded, so this doesn’t prove the
          message is unread.
        </p>
      )}
      <p className="m-0 text-muted text-[11px] leading-[1.6]">
        Each entry is a request for the message’s hidden image, logged with time, IP and app. It’s
        evidence the message was displayed, not proof someone read it: Gmail hides the reader’s IP,
        and Apple Mail can load images on arrival.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            void navigator.clipboard.writeText(evidenceText(message)).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }
        >
          <Copy size={13} /> {copied ? 'Copied' : 'Copy record'}
        </Button>
        <Button
          onClick={() => download(fileName(message) + '.txt', evidenceText(message), 'text/plain')}
        >
          <Download size={13} /> Record (.txt)
        </Button>
        <Button
          onClick={() => download(fileName(message) + '.csv', evidenceCsv(message), 'text/csv')}
        >
          <Download size={13} /> Log (.csv)
        </Button>
        {onForget && (
          <Button variant="ghost" className="ml-auto" onClick={onForget}>
            <Trash2 size={13} /> Forget
          </Button>
        )}
      </div>
    </div>
  )
}

/** Every tracked message, newest first, with its opens. */
export function TrackingDialog({
  open,
  onOpenChange,
  configured,
  onSetup,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  configured: boolean
  onSetup: () => void
}) {
  const state = useTracking(open)
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string>()
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    if (!open) setSelected(undefined)
  }, [open])
  const message = state.messages.find((m) => m.token === selected)
  const check = async () => {
    setChecking(true)
    try {
      queryClient.setQueryData(['tracking'], await api.checkTracking())
    } finally {
      setChecking(false)
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Tracked messages"
      description={
        configured
          ? 'Sent messages with open tracking. Opens are checked every two minutes.'
          : undefined
      }
      className="tracking-dialog w-[min(640px,_calc(100vw_-_32px))]"
    >
      {!configured ? (
        <div className="flex flex-col gap-3 items-start text-[12px] text-secondary">
          <p className="m-0">Open tracking isn’t set up yet.</p>
          <Button variant="primary" onClick={onSetup}>
            Set up open tracking
          </Button>
        </div>
      ) : message ? (
        <div className="flex flex-col gap-3">
          <Button variant="ghost" className="self-start" onClick={() => setSelected(undefined)}>
            <ArrowLeft size={13} /> All tracked messages
          </Button>
          <TrackedDetail
            message={message}
            onForget={() =>
              void api.forgetTracked(message.token).then((next) => {
                queryClient.setQueryData(['tracking'], next)
                setSelected(undefined)
              })
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="flex-1">
              {state.error
                ? state.error
                : state.checkedAt
                  ? 'Checked ' + ago(state.checkedAt)
                  : 'Not checked yet'}
            </span>
            <Button size="small" onClick={() => void check()} disabled={checking}>
              {checking ? <Spinner size={12} /> : <RefreshCw size={12} />} Check now
            </Button>
          </div>
          {state.messages.length ? (
            <ul className="m-0 p-0 list-none flex flex-col border border-solid border-border rounded-lg overflow-hidden">
              {state.messages.map((m) => {
                const opened = m.opens.some(countsAsOpen)
                return (
                  <li
                    key={m.token}
                    className="[&+li]:border-t [&+li]:border-solid [&+li]:border-t-border"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 py-2.5 px-3 text-left bg-transparent border-0 hover:bg-hover"
                      onClick={() => setSelected(m.token)}
                    >
                      <Eye size={14} className={opened ? 'text-success' : 'text-muted'} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] truncate">
                          {m.subject || '(no subject)'}
                        </span>
                        <span className="block text-[11px] text-muted truncate">
                          {[...m.to, ...m.cc].map((a) => a.name || a.email).join(', ')}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'text-[11px] shrink-0',
                          opened ? 'text-success' : 'text-muted',
                        )}
                      >
                        {openSummary(m)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="m-0 text-[12px] text-muted">
              Nothing tracked yet. Messages you send from now on show up here.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

/** Settings → Open tracking. */
export function TrackingSettings({
  settings,
  onSave,
}: {
  settings: Settings
  onSave: (patch: Partial<Settings>) => Promise<boolean>
}) {
  const saved = settings.tracking
  const [url, setUrl] = useState(saved?.url || '')
  const [secret, setSecret] = useState(saved?.secret || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean }>()
  const state = useTracking()
  const queryClient = useQueryClient()
  const dirty = url.trim() !== (saved?.url || '') || secret.trim() !== (saved?.secret || '')
  const urlValid = !url.trim() || /^https:\/\/[^/\s]+/.test(url.trim())
  const secretValid = !secret.trim() || secret.trim().length >= 32
  const save = async () => {
    setSaving(true)
    setStatus(undefined)
    try {
      const ok = await onSave({
        tracking: {
          url: url.trim().replace(/\/+$/, ''),
          secret: secret.trim(),
          byDefault: saved?.byDefault ?? true,
        },
      })
      if (ok && url.trim() && secret.trim()) {
        const result = await api.checkTracking()
        queryClient.setQueryData(['tracking'], result)
        setStatus(
          result.error
            ? { text: result.error, error: true }
            : { text: 'Connected. New messages will be tracked.' },
        )
      }
    } catch (e) {
      setStatus({ text: friendlyError(e), error: true })
    } finally {
      setSaving(false)
    }
  }
  const row = cn(
    'setting-row flex items-center justify-between my-3.5 mx-0 gap-6 [&_strong]:font-normal [&_p]:text-muted',
    '[&_p]:my-[3px] [&_p]:mx-0 [&_input]:shrink-0 [&>.button]:shrink-0 [&_p]:text-[12px] [&_p]:leading-[1.6]',
    '[&_strong]:text-[13px] max-[700px]:gap-3.5',
  )
  return (
    <form
      className="flex flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        if (urlValid && secretValid) void save()
      }}
    >
      <label className="form-field mt-0 [&_input]:mt-1.5 [&_input]:w-full text-[12px]">
        Tracker address
        <input
          value={url}
          placeholder="https://inlark-tracker.example.workers.dev"
          aria-invalid={!urlValid}
          onChange={(e) => setUrl(e.target.value)}
        />
        {!urlValid && (
          <span className="block mt-1.25 text-[11px] text-danger">Use the https:// address.</span>
        )}
      </label>
      <label className="form-field mt-3.75 [&_input]:mt-1.5 [&_input]:w-full text-[12px]">
        Tracker secret
        <input
          type="password"
          autoComplete="off"
          value={secret}
          aria-invalid={!secretValid}
          onChange={(e) => setSecret(e.target.value)}
        />
        {!secretValid && (
          <span className="block mt-1.25 text-[11px] text-danger">
            Use the same secret as the tracker, at least 32 characters.
          </span>
        )}
      </label>
      <div className="flex items-center gap-3 mt-4">
        <Button
          variant="primary"
          type="submit"
          disabled={saving || !dirty || !urlValid || !secretValid}
        >
          {saving && <Spinner size={12} />} Save
        </Button>
        {(status || state.error || state.checkedAt) && (
          <span
            className={cn(
              'text-[12px]',
              (status ? status.error : state.error) ? 'text-danger' : 'text-muted',
            )}
          >
            {status?.text ||
              state.error ||
              (state.checkedAt && 'Connected. Last checked ' + ago(state.checkedAt) + '.')}
          </span>
        )}
      </div>
      <div className={cn(row, 'mt-6')}>
        <div>
          <strong>Track new messages</strong>
          <p>Turn tracking on or off for one message with the eye button in the composer.</p>
        </div>
        <Switch
          aria-label="Track new messages"
          checked={saved?.byDefault ?? true}
          disabled={!saved?.url}
          onCheckedChange={(byDefault) =>
            void onSave({
              tracking: { url: saved?.url || '', secret: saved?.secret || '', byDefault },
            })
          }
        />
      </div>
    </form>
  )
}
