import { cn } from '@inlark/ui'
import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Select } from '@inlark/ui'
import {
  newSplitId,
  type Account,
  type Conversation,
  type Split,
  type SplitRule,
} from '@inlark/core'
import { ruleOptions, withRule, type RuleChoice } from './split-drop'

const fields = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To or Cc' },
  { value: 'subject', label: 'Subject has' },
] as const

/** The split choice that starts a new split rather than adding to one. */
export const NEW_SPLIT = '__new__'
const NEW = NEW_SPLIT

/** One choice of what to match, shown as a selectable card. */
function Choice({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail?: string
}) {
  return (
    <label
      className={cn(
        'split-choice flex gap-3 items-center py-2.5 px-3.25 rounded-lg border border-solid cursor-pointer min-w-0',
        'transition-[background,border-color] duration-120 [&+.split-choice]:mt-2',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-primary',
        'has-[:focus-visible]:outline-offset-2',
        checked
          ? 'border-primary-solid/70 bg-primary-tint'
          : 'border-border-strong hover:bg-hover hover:border-foreground/20',
      )}
    >
      <input
        type="radio"
        className="sr-only"
        name="split-rule"
        checked={checked}
        onChange={onSelect}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-strong">{title}</span>
        {detail && (
          <span className="block text-[12px] text-muted mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
            {detail}
          </span>
        )}
      </span>
      <span
        className={cn(
          'w-3.75 h-3.75 shrink-0 rounded-full transition-[box-shadow] duration-120',
          checked
            ? 'shadow-[inset_0_0_0_4.5px_var(--accent-solid)]'
            : 'shadow-[inset_0_0_0_1px_var(--faint)]',
        )}
        aria-hidden="true"
      />
    </label>
  )
}

/** What a rule can be made from: a conversation in the list, or the messages of an open one. */
export type SplitSource = Pick<Conversation, 'subject' | 'from' | 'messages'>

export interface AddToSplitRequest {
  conversation: SplitSource
  /** The split it was dropped on, or `NEW_SPLIT`; none picks the first split. */
  splitId?: string
}

/**
 * Asks what about a conversation a split should match: its sender, the sender's whole domain,
 * or another rule, then adds that rule to the chosen split.
 */
export function AddToSplitDialog({
  request,
  splits,
  accounts,
  onClose,
  onAdd,
}: {
  request?: AddToSplitRequest
  splits: Split[]
  accounts: Account[]
  onClose: () => void
  onAdd: (split: Split, isNew: boolean) => void
}) {
  // Keep the content while the dialog fades out after the request is cleared.
  const [shown, setShown] = useState(request)
  if (request && request !== shown) setShown(request)
  const own = useMemo(() => new Set(accounts.map((a) => a.email.toLowerCase())), [accounts])
  const options = useMemo(() => shown && ruleOptions(shown.conversation, own), [shown, own])
  const [splitId, setSplitId] = useState(NEW),
    [name, setName] = useState(''),
    [choice, setChoice] = useState<RuleChoice>('sender'),
    [field, setField] = useState<SplitRule['field']>('to'),
    [value, setValue] = useState('')
  useEffect(() => {
    if (!request || !options) return
    setSplitId(request.splitId || splits[0]?.id || NEW)
    setName(options.sender?.name || options.domain || '')
    setChoice(options.sender ? 'sender' : 'other')
    const other = options.defaults.to ? 'to' : 'subject'
    setField(other)
    setValue(options.defaults[other])
  }, [request])
  if (!options) return null
  const sender = options.sender
  const rule: SplitRule =
    choice === 'sender'
      ? { field: 'from', value: options.defaults.from }
      : choice === 'domain'
        ? { field: 'from', value: '@' + options.domain }
        : { field, value }
  const target = splits.find((s) => s.id === splitId)
  const ready = !!rule.value.trim() && (target || name.trim())
  const submit = () => {
    if (!ready) return
    if (target) onAdd(withRule(target, rule), false)
    else onAdd(withRule({ id: newSplitId(), name: name.trim(), rules: [] }, rule), true)
  }
  return (
    <Modal
      open={!!request}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Add to split"
      description={
        'Which mail like “' + (shown!.conversation.subject || '(No subject)') + '” should go here?'
      }
    >
      <form
        className="add-to-split mt-4.5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-center gap-2 max-[480px]:flex-col max-[480px]:items-stretch">
          <Select
            aria-label="Split"
            className="flex-1 min-w-0"
            value={splitId}
            options={[
              ...splits.map((s) => ({ value: s.id, label: s.name })),
              { value: NEW, label: 'New split…' },
            ]}
            onValueChange={setSplitId}
          />
          {!target && (
            <input
              className="flex-1 min-w-0 text-[12px]"
              value={name}
              maxLength={60}
              placeholder="Name the new split"
              aria-label="New split name"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </div>
        <div className="mt-4" role="radiogroup" aria-label="What to match">
          {sender && (
            <Choice
              checked={choice === 'sender'}
              onSelect={() => setChoice('sender')}
              title={'This sender' + (sender.name ? ': ' + sender.name : '')}
              detail={options.defaults.from}
            />
          )}
          {options.domain && (
            <Choice
              checked={choice === 'domain'}
              onSelect={() => setChoice('domain')}
              title={'Everyone at ' + options.domain}
              detail={'@' + options.domain}
            />
          )}
          <Choice
            checked={choice === 'other'}
            onSelect={() => setChoice('other')}
            title="Something else"
            detail="An alias it was sent to, or words in the subject"
          />
          {choice === 'other' && (
            <div className="flex items-center gap-2 mt-2.5">
              <Select
                aria-label="Match"
                className="w-32 shrink-0"
                value={field}
                options={fields}
                onValueChange={(next) => {
                  setField(next)
                  setValue(options.defaults[next])
                }}
              />
              <input
                className="flex-1 min-w-0 text-[12px]"
                value={value}
                maxLength={320}
                aria-label={fields.find((f) => f.value === field)!.label}
                spellCheck={false}
                autoCapitalize="off"
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="modal-actions flex justify-end gap-2 mt-6">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!ready}>
            {target ? 'Add to ' + target.name : 'Create split'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
