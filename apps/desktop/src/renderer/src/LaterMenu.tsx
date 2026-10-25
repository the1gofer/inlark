import { useState, type ReactElement } from 'react'
import { Button, Dropdown, MenuItem, Modal } from '@inlark/ui'
import { Calendar } from '@inlark/ui/icons'
import { laterChoices, laterLabel, localInputValue } from './later'

/**
 * A menu of suggested times plus “Pick date and time…”, used to send later, snooze and set
 * reminders. Works the same with a mouse, the keyboard, or touch.
 */
export function LaterMenu({
  trigger,
  title,
  action,
  onPick,
}: {
  trigger: ReactElement
  /** Heading of the custom time dialog, such as “Send later”. */
  title: string
  /** The confirm button in the custom time dialog, such as “Schedule”. */
  action: string
  onPick: (at: Date) => void
}) {
  const [custom, setCustom] = useState(false)
  const [value, setValue] = useState('')
  const [now, setNow] = useState(() => new Date())
  const picked = value ? new Date(value) : undefined
  const valid = !!picked && !Number.isNaN(picked.getTime()) && picked.getTime() > Date.now()
  return (
    <>
      <span
        className="contents"
        onPointerDown={() => setNow(new Date())}
        onKeyDown={() => setNow(new Date())}
      >
        <Dropdown className="later-menu w-64 [&_.menu-item]:whitespace-nowrap" trigger={trigger}>
          {laterChoices(now).map((choice) => (
            <MenuItem key={choice.id} onClick={() => onPick(choice.at)}>
              <span>{choice.label}</span>
              <span className="ml-auto text-[11px] text-muted">{laterLabel(choice.at, now)}</span>
            </MenuItem>
          ))}
          <div className="h-[1px] m-1.25 bg-border" />
          <MenuItem
            onClick={() => {
              setValue(localInputValue(new Date(Date.now() + 60 * 60_000)))
              setCustom(true)
            }}
          >
            <Calendar size={14} />
            Pick date and time…
          </MenuItem>
        </Dropdown>
      </span>
      <Modal open={custom} onOpenChange={setCustom} title={title}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            setCustom(false)
            onPick(picked!)
          }}
        >
          <input
            type="datetime-local"
            className="h-9 py-0 px-2.5 text-[13px]"
            aria-label="Date and time"
            autoFocus
            value={value}
            min={localInputValue(new Date())}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="text-[11px] text-muted min-h-4">
            {picked && !valid ? 'Choose a time in the future.' : picked ? laterLabel(picked) : ''}
          </span>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCustom(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!valid}>
              {action}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
