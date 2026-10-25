import { cn, Avatar } from '@inlark/ui'
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'
import type { Address } from '@inlark/core'
import { useContactMatches } from './contacts'
import { mentionLabel, mentionQuery, type MentionQuery } from './mentions'

const width = 300

/**
 * Suggests people while "@name" is typed in the message, like Outlook and Gmail. Choosing one
 * writes "@Name" into the message and calls `onPick`, which adds them as a recipient.
 * The editor forwards its key presses through `keys`, so arrows and Enter pick while it's open.
 */
export function MentionMenu({
  editor,
  suggestions,
  keys,
  onPick,
}: {
  editor: Editor | null
  suggestions: Address[]
  keys: RefObject<(event: KeyboardEvent) => boolean>
  onPick: (address: Address) => void
}) {
  const [mention, setMention] = useState<MentionQuery>()
  const [active, setActive] = useState(0)
  // Escape closes the menu for this "@" only; typing another one opens it again.
  const [dismissed, setDismissed] = useState<number>()
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number }>()
  const origin = useRef<HTMLDivElement>(null)
  const listId = useId()
  useEffect(() => {
    if (!editor) return
    const read = () => {
      const next = editor.isEditable && editor.isFocused ? mentionQuery(editor.state) : undefined
      setMention((current) =>
        current?.from === next?.from && current?.query === next?.query ? current : next,
      )
    }
    const close = () => setMention(undefined)
    editor.on('transaction', read)
    editor.on('focus', read)
    editor.on('blur', close)
    return () => {
      editor.off('transaction', read)
      editor.off('focus', read)
      editor.off('blur', close)
    }
  }, [editor])
  useEffect(() => setActive(0), [mention?.query])
  const found = useContactMatches(suggestions, mention?.query || '')
  const matches = mention ? found : []
  const showing = !!editor && !!mention && matches.length > 0 && dismissed !== mention.from
  const highlighted = Math.min(active, matches.length - 1)
  useLayoutEffect(() => {
    if (!showing || !editor || !mention || !origin.current) return setPlace(undefined)
    // Measured against a fixed anchor, so a transformed dialog can't shift the menu.
    const base = origin.current.getBoundingClientRect()
    const at = editor.view.coordsAtPos(mention.from)
    const viewport = window.visualViewport?.height || window.innerHeight
    const left = Math.max(8, Math.min(at.left, window.innerWidth - width - 8)) - base.left
    // Above the line when the keyboard or the window's edge leaves no room below.
    setPlace(
      at.bottom + 240 > viewport && at.top > 240
        ? { left, bottom: base.top - at.top + 4 }
        : { left, top: at.bottom + 4 - base.top },
    )
  }, [showing, mention?.from, mention?.query, editor])
  const pick = (address: Address) => {
    if (!editor || !mention) return
    editor
      .chain()
      .focus()
      .insertContentAt({ from: mention.from, to: mention.to }, [
        { type: 'mention', attrs: { email: address.email, label: mentionLabel(address) } },
        { type: 'text', text: ' ' },
      ])
      .run()
    onPick(address)
  }
  keys.current = (event) => {
    if (!showing || event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((highlighted + step + matches.length) % matches.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') pick(matches[highlighted])
    else if (event.key === 'Escape') setDismissed(mention!.from)
    else return false
    // The composer's own Escape and Enter shortcuts must not see this key.
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  if (!showing) return null
  return (
    <div ref={origin} className="mention-menu-origin fixed left-0 top-0 w-0 h-0 z-120">
      {place && (
        <div
          className={cn(
            'mention-menu [&_button]:flex [&_button]:items-center [&_button]:gap-2.5 [&_button]:w-full',
            '[&_button]:py-1.5 [&_button]:px-2 [&_button]:text-left [&_button]:border-0 [&_button]:rounded-sm',
            '[&_button]:bg-none [&_button]:bg-transparent [&_button.active]:bg-hover [&_span:not(.avatar)]:min-w-0',
            '[&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap',
            '[&_small]:block [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap',
            '[&_strong]:text-[12px] [&_strong]:font-medium [&_small]:text-[11px] [&_small]:text-muted absolute',
            'p-1 bg-raised border border-solid border-border-strong rounded-lg shadow-popup',
          )}
          style={{ ...place, width: 'min(' + width + 'px, calc(100vw - 16px))' }}
          role="listbox"
          id={listId}
          aria-label="Mention someone"
        >
          {matches.map((match, i) => (
            <button
              type="button"
              key={match.email}
              id={listId + '-' + i}
              role="option"
              aria-selected={i === highlighted}
              className={cn(i === highlighted && 'active')}
              tabIndex={-1}
              // Keeps the editor focused, so the menu isn't closed before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => pick(match)}
            >
              <Avatar name={match.name || match.email} size={24} />
              <span>
                <strong>{match.name || match.email}</strong>
                {match.name && <small>{match.email}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
