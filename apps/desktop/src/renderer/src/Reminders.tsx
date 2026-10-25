import { useEffect, useState } from 'react'
import { Button, IconButton, Modal } from '@inlark/ui'
import { AlarmClock, Clock, X } from '@inlark/ui/icons'
import type { Account, Reminder } from '@inlark/core'
import { laterChoices, laterLabel, localInputValue } from './later'

export const reminderTitles = {
  snooze: 'Snooze until…',
  followup: 'Remind me if no reply…',
} as const

/**
 * Picks when to snooze a conversation or be reminded about it. Number keys pick a suggestion,
 * which keeps it as quick as a keyboard shortcut.
 */
export function RemindDialog({
  kind,
  onClose,
  onPick,
}: {
  kind?: Reminder['kind']
  onClose: () => void
  onPick: (at: Date) => void
}) {
  const [now, setNow] = useState(() => new Date())
  const [custom, setCustom] = useState('')
  useEffect(() => {
    if (!kind) return
    setNow(new Date())
    setCustom(localInputValue(new Date(Date.now() + 2 * 60 * 60_000)))
  }, [kind])
  const choices = laterChoices(now)
  const picked = custom ? new Date(custom) : undefined
  const valid = !!picked && !Number.isNaN(picked.getTime()) && picked.getTime() > Date.now()
  return (
    <Modal
      open={!!kind}
      onOpenChange={(open) => !open && onClose()}
      title={kind ? reminderTitles[kind] : ''}
      description={
        kind === 'followup'
          ? 'If nobody else has replied by then, the conversation comes back to your inbox.'
          : 'The conversation leaves your inbox and comes back, unread, at this time.'
      }
      className="remind-dialog w-[min(440px,_calc(100vw_-_32px))]"
    >
      <div
        className="flex flex-col gap-1"
        onKeyDown={(e) => {
          const index = Number(e.key) - 1
          if (e.target instanceof HTMLInputElement || !choices[index]) return
          e.preventDefault()
          onPick(choices[index].at)
        }}
      >
        {choices.map((choice, index) => (
          <button
            key={choice.id}
            type="button"
            autoFocus={index === 0}
            className="flex items-center gap-3 w-full py-2 px-2.5 rounded-md bg-transparent border-0 text-left text-[13px] text-foreground hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            onClick={() => onPick(choice.at)}
          >
            <kbd className="w-5 text-center">{index + 1}</kbd>
            <span className="flex-1">{choice.label}</span>
            <span className="text-[11px] text-muted">{laterLabel(choice.at, now)}</span>
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-solid border-t-border"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onPick(picked!)
        }}
      >
        <input
          type="datetime-local"
          className="h-8 py-0 px-2.5 text-[12px] flex-1 min-w-0"
          aria-label="Pick date and time"
          value={custom}
          min={localInputValue(now)}
          onChange={(e) => setCustom(e.target.value)}
        />
        <Button type="submit" disabled={!valid}>
          Set
        </Button>
      </form>
    </Modal>
  )
}

/** Every snoozed conversation and pending follow-up, with a way to open or cancel each. */
export function RemindersDialog({
  open,
  reminders,
  accounts,
  onOpenChange,
  onOpen,
  onCancel,
}: {
  open: boolean
  reminders: Reminder[]
  accounts: Account[]
  onOpenChange: (open: boolean) => void
  onOpen: (reminder: Reminder) => void
  onCancel: (reminder: Reminder) => void
}) {
  const sorted = [...reminders].sort((a, b) => a.at.localeCompare(b.at))
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Snoozed and reminders"
      className="reminders-dialog w-[min(520px,_calc(100vw_-_32px))]"
    >
      {sorted.length ? (
        <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
          {sorted.map((reminder) => {
            const account = accounts.find((a) => a.id === reminder.accountId)
            return (
              <li key={reminder.id} className="flex items-center gap-2 rounded-md hover:bg-hover">
                <button
                  type="button"
                  className="flex items-center gap-3 flex-1 min-w-0 py-2 px-2.5 bg-transparent border-0 text-left"
                  onClick={() => onOpen(reminder)}
                >
                  {reminder.kind === 'snooze' ? (
                    <Clock size={15} className="text-muted shrink-0" />
                  ) : (
                    <AlarmClock size={15} className="text-muted shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[13px] text-foreground">
                      {reminder.subject || '(no subject)'}
                    </span>
                    <span className="block text-[11px] text-muted truncate">
                      {(reminder.kind === 'snooze' ? 'Back ' : 'If no reply by ') +
                        laterLabel(reminder.at) +
                        (accounts.length > 1 && account ? ' · ' + account.name : '')}
                    </span>
                  </span>
                </button>
                <IconButton
                  label={reminder.kind === 'snooze' ? 'Unsnooze' : 'Cancel reminder'}
                  onClick={() => onCancel(reminder)}
                >
                  <X size={14} />
                </IconButton>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-secondary leading-[1.6] m-0">
          Nothing is snoozed. Press H on a conversation to snooze it, or Shift+H to be reminded if
          nobody replies.
        </p>
      )}
    </Modal>
  )
}
