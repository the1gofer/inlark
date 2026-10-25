import { cn } from '@inlark/ui'
import { useEffect, useRef, useState } from 'react'
import { Button, IconButton, Select } from '@inlark/ui'
import { ArrowDown, ArrowUp, Check, Layers, Plus, Trash2, X } from '@inlark/ui/icons'
import { newSplitId, type Account, type Split, type SplitRule } from '@inlark/core'

const fields = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To or Cc' },
  { value: 'subject', label: 'Subject has' },
] as const

const placeholders: Record<SplitRule['field'], string> = {
  from: '@github.com or someone@example.com',
  to: 'alias@example.com',
  subject: 'invoice',
}

/** What a split needs before it can be saved: a name, even when one hasn't been typed yet. */
const saveable = (splits: Split[]): Split[] =>
  splits.map((s) => ({ ...s, name: s.name.trim() || 'Untitled split' }))

/** Split inbox tabs, edited in place and saved shortly after typing stops. */
export function SplitSettings({
  accounts,
  splits,
  draft,
  onSave,
}: {
  accounts: Account[]
  splits: Split[]
  /** A split to add straight away, such as one made from a sender in the reader. */
  draft?: Split
  onSave: (splits: Split[]) => Promise<boolean>
}) {
  const [values, setValues] = useState<Split[]>(() =>
    draft && !splits.some((s) => s.id === draft.id) ? [...splits, draft] : splits,
  )
  const [saved, setSaved] = useState(false)
  const latest = useRef(values)
  const stored = useRef(JSON.stringify(splits))
  latest.current = values
  const save = async (next: Split[]) => {
    const value = saveable(next)
    if (JSON.stringify(value) === stored.current) return
    if (await onSave(value)) {
      stored.current = JSON.stringify(value)
      setSaved(true)
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void save(values), 700)
    return () => clearTimeout(timer)
  }, [values])
  useEffect(() => () => void save(latest.current), [])
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 1800)
    return () => clearTimeout(timer)
  }, [saved])
  // Focus the name of a split made from a sender, so it can be renamed at once.
  useEffect(() => {
    if (draft)
      (document.getElementById('split-name-' + draft.id) as HTMLInputElement | null)?.select()
  }, [])

  const change = (id: string, patch: Partial<Split>) =>
    setValues((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const changeRule = (split: Split, index: number, patch: Partial<SplitRule>) =>
    change(split.id, {
      rules: split.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    })
  const move = (index: number, by: number) =>
    setValues((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(index + by, 0, item!)
      return next
    })
  const add = () => {
    const split: Split = { id: newSplitId(), name: '', rules: [{ field: 'from', value: '' }] }
    setValues((current) => [...current, split])
    requestAnimationFrame(() => document.getElementById('split-name-' + split.id)?.focus())
  }
  const accountOptions = [
    { value: '', label: 'All accounts' },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ]

  return (
    <div className="split-settings">
      {!values.length && (
        <div className="split-empty flex flex-col items-start gap-2 py-5 px-0 border-t border-solid border-t-border text-[12px] text-muted">
          <Layers size={18} className="text-faint" />
          No splits yet. Add one to give a sender, a domain or an alias its own inbox tab.
        </div>
      )}
      {values.map((split, index) => (
        <section
          key={split.id}
          className="split-card py-5 px-0 border-t border-solid border-t-border"
          aria-label={split.name || 'New split'}
        >
          <div className="split-heading flex items-center gap-2 max-[700px]:flex-wrap">
            <input
              id={'split-name-' + split.id}
              className="split-name flex-1 min-w-40 text-[13px] font-medium"
              value={split.name}
              maxLength={60}
              placeholder="Name, such as GitHub or Newsletters"
              aria-label="Split name"
              onChange={(e) => change(split.id, { name: e.target.value })}
              onBlur={() => void save(latest.current)}
            />
            {accounts.length > 1 && (
              <Select
                aria-label={'Accounts for ' + (split.name || 'this split')}
                className="w-auto min-w-36 shrink-0"
                value={split.accountId || ''}
                options={accountOptions}
                onValueChange={(accountId) =>
                  change(split.id, { accountId: accountId || undefined })
                }
              />
            )}
            <span className="split-order inline-flex shrink-0">
              <IconButton label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton
                label="Move down"
                disabled={index === values.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </IconButton>
              <IconButton
                label={'Delete ' + (split.name || 'split')}
                onClick={() => setValues((current) => current.filter((s) => s.id !== split.id))}
              >
                <Trash2 size={14} />
              </IconButton>
            </span>
          </div>
          <p className="split-hint mt-2.5 mb-2 mx-0 text-[11px] text-muted">
            Shows conversations that match any of these:
          </p>
          <div className="split-rules flex flex-col gap-2">
            {split.rules.map((rule, ruleIndex) => (
              <div className="split-rule flex items-center gap-2" key={ruleIndex}>
                <Select
                  aria-label="Match"
                  className="w-32 shrink-0"
                  value={rule.field}
                  options={fields}
                  onValueChange={(field) => changeRule(split, ruleIndex, { field })}
                />
                <input
                  className="flex-1 min-w-0 text-[12px]"
                  value={rule.value}
                  maxLength={320}
                  placeholder={placeholders[rule.field]}
                  aria-label={fields.find((f) => f.value === rule.field)!.label}
                  spellCheck={false}
                  autoCapitalize="off"
                  onChange={(e) => changeRule(split, ruleIndex, { value: e.target.value })}
                  onBlur={() => void save(latest.current)}
                />
                <IconButton
                  label="Remove rule"
                  disabled={split.rules.length === 1}
                  onClick={() =>
                    change(split.id, { rules: split.rules.filter((_, i) => i !== ruleIndex) })
                  }
                >
                  <X size={13} />
                </IconButton>
              </div>
            ))}
          </div>
          <Button
            className="mt-2.5"
            variant="ghost"
            size="small"
            disabled={split.rules.length >= 50}
            onClick={() =>
              change(split.id, {
                rules: [...split.rules, { field: split.rules.at(-1)?.field || 'from', value: '' }],
              })
            }
          >
            <Plus size={12} />
            Add rule
          </Button>
        </section>
      ))}
      <div className="split-footer flex items-center gap-3 pt-4 border-t border-solid border-t-border">
        <Button onClick={add} disabled={values.length >= 20}>
          <Plus size={13} />
          New split
        </Button>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] text-muted opacity-0 transition-[opacity] duration-160',
            saved && 'opacity-100',
          )}
          aria-live="polite"
        >
          {saved && (
            <>
              <Check size={11} /> Saved
            </>
          )}
        </span>
      </div>
    </div>
  )
}
