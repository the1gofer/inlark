import { useMemo, useState } from 'react'
import { cn, Modal } from '@inlark/ui'
import type { Address, Snippet } from '@inlark/core'

/** Fills in a snippet's `{first_name}` from the first recipient, or leaves a blank to type into. */
export function fillSnippet(text: string, to: Address[]): string {
  const first = to[0]
  const name = (first?.name || '').trim().split(/\s+/)[0] || ''
  return text.replace(/\{\s*first_name\s*\}/gi, name)
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain snippet text as editor paragraphs, keeping blank lines and line breaks. */
export function snippetHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => '<p>' + escape(paragraph).replace(/\n/g, '<br>') + '</p>')
    .join('')
}

/** A quick, searchable list of snippets. Type to filter, arrows to move, Enter to insert. */
export function SnippetPicker({
  open,
  snippets,
  onOpenChange,
  onPick,
  onManage,
}: {
  open: boolean
  snippets: Snippet[]
  onOpenChange: (open: boolean) => void
  onPick: (snippet: Snippet) => void
  onManage: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return snippets.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.text.toLowerCase().includes(q),
    )
  }, [snippets, query])
  const choose = (snippet?: Snippet) => {
    if (!snippet) return
    onOpenChange(false)
    setQuery('')
    onPick(snippet)
  }
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('')
        onOpenChange(next)
      }}
      title="Insert a snippet"
      className="snippet-picker w-[min(480px,_calc(100vw_-_32px))]"
    >
      {snippets.length ? (
        <>
          <input
            className="h-9 w-full py-0 px-2.5 text-[13px]"
            aria-label="Search snippets"
            placeholder="Search snippets"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, matches.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(matches[active])
              }
            }}
          />
          <ul className="mt-3 max-h-[50vh] overflow-y-auto list-none p-0 m-0" role="listbox">
            {matches.map((snippet, index) => (
              <li
                key={snippet.id}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'rounded-md py-2 px-2.5 cursor-pointer',
                  index === active && 'bg-hover',
                )}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(snippet)}
              >
                <span className="block text-[13px] text-foreground">{snippet.name}</span>
                <span className="block text-[11px] text-muted truncate">
                  {snippet.text.split('\n')[0]}
                </span>
              </li>
            ))}
            {!matches.length && (
              <li className="py-2 px-2.5 text-[12px] text-muted">No snippets match.</li>
            )}
          </ul>
        </>
      ) : (
        <p className="text-[12px] text-secondary leading-[1.6] m-0">
          Snippets are text you write often, saved so you can drop it into any message.{' '}
          <button
            type="button"
            className="text-primary bg-transparent border-0 p-0 cursor-pointer"
            onClick={() => {
              onOpenChange(false)
              onManage()
            }}
          >
            Create one in Settings
          </button>
          .
        </p>
      )}
    </Modal>
  )
}
