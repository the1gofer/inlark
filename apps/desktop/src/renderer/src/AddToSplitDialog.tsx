import { cn } from '@inlark/ui'
import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Select } from '@inlark/ui'
import {
  newSplitId,
  type Account,
  type Address,
  type Conversation,
  type Split,
  type SplitRule,
} from '@inlark/core'
import { X } from '@inlark/ui/icons'
import { ruleOptionsFor, withRules } from './split-drop'

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
  children,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail?: string
  children?: React.ReactNode
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
        {children}
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
  /** One conversation, or several dragged or selected together. */
  conversations: SplitSource[]
  /** The split it was dropped on, or `NEW_SPLIT`; none picks the first split. */
  splitId?: string
}

/**
 * Asks what about some conversations a split should match, then adds those rules to the chosen
 * split. Their senders (one rule each) and a shared subject are one click; the rule fields below
 * take anything else, such as a domain or an alias they were sent to.
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
  const options = useMemo(() => shown && ruleOptionsFor(shown.conversations, own), [shown, own])
  const [splitId, setSplitId] = useState(NEW),
    [name, setName] = useState(''),
    [mode, setMode] = useState<'senders' | 'rule'>('senders'),
    [senders, setSenders] = useState<Address[]>([]),
    [field, setField] = useState<SplitRule['field']>('from'),
    [value, setValue] = useState('')
  const pickSenders = (list = senders) => {
    setMode('senders')
    setField('from')
    setValue(list.length === 1 ? list[0]!.email.toLowerCase() : '')
  }
  const pick = (next: SplitRule['field']) => {
    setMode('rule')
    setField(next)
    setValue(options?.defaults[next] || '')
  }
  useEffect(() => {
    if (!request || !options) return
    setSplitId(request.splitId || splits[0]?.id || NEW)
    setName(options.senders[0]?.name || options.domain || '')
    setSenders(options.senders)
    if (options.senders.length) pickSenders(options.senders)
    else pick('subject')
  }, [request])
  if (!options) return null
  const rules: SplitRule[] =
    mode === 'senders'
      ? senders.map((a) => ({ field: 'from', value: a.email.toLowerCase() }))
      : value.trim()
        ? [{ field, value }]
        : []
  const count = shown!.conversations.length
  const target = splits.find((s) => s.id === splitId)
  const ready = !!rules.length && (target || name.trim())
  const submit = () => {
    if (!ready) return
    if (target) onAdd(withRules(target, rules), false)
    else onAdd(withRules({ id: newSplitId(), name: name.trim(), rules: [] }, rules), true)
  }
  return (
    <Modal
      open={!!request}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Add to split"
      description={
        count > 1
          ? 'Which mail like these ' + count + ' conversations should go here?'
          : 'Which mail like “' +
            (shown!.conversations[0]!.subject || '(No subject)') +
            '” should go here?'
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
          {senders.length === 1 && (
            <Choice
              checked={mode === 'senders'}
              onSelect={() => pickSenders()}
              title={'This sender' + (senders[0]!.name ? ': ' + senders[0]!.name : '')}
              detail={senders[0]!.email.toLowerCase()}
            />
          )}
          {senders.length > 1 && (
            <Choice
              checked={mode === 'senders'}
              onSelect={() => pickSenders()}
              title={'These ' + senders.length + ' senders'}
            >
              <span className="flex flex-wrap gap-1.5 mt-2">
                {senders.map((a) => (
                  <span
                    key={a.email}
                    className="sender-chip inline-flex items-center gap-1 max-w-full h-6 pl-2 pr-0.5 rounded-md bg-hover text-[12px] text-secondary"
                    title={a.email}
                  >
                    <span className="truncate">{a.email.toLowerCase()}</span>
                    <button
                      type="button"
                      className="grid place-items-center w-5 h-5 rounded text-muted hover:text-foreground hover:bg-selected"
                      aria-label={'Leave out ' + a.email}
                      onClick={(e) => {
                        e.preventDefault()
                        const rest = senders.filter((s) => s !== a)
                        setSenders(rest)
                        pickSenders(rest)
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </span>
            </Choice>
          )}
          {options.defaults.subject && (
            <Choice
              checked={
                mode === 'rule' && field === 'subject' && value.trim() === options.defaults.subject
              }
              onSelect={() => pick('subject')}
              title={count > 1 ? 'Their subject' : 'This subject'}
              detail={options.defaults.subject}
            />
          )}
          <div className="flex items-center gap-2 mt-3">
            <Select
              aria-label="Match"
              className="w-32 shrink-0"
              value={field}
              options={fields}
              onValueChange={pick}
            />
            <input
              className="flex-1 min-w-0 text-[12px]"
              value={value}
              maxLength={320}
              aria-label={fields.find((f) => f.value === field)!.label}
              placeholder={field === 'subject' ? 'Words in the subject' : 'Address or @domain'}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => {
                setMode('rule')
                setValue(e.target.value)
              }}
            />
          </div>
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
