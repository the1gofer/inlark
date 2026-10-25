import { forwardRef, useMemo, useRef, type Ref } from 'react'
import { parseSearch } from '@inlark/core'

/**
 * The search field. Operators such as `from:karla` are shown as highlighted chips while typing:
 * the input's own text is transparent and a copy behind it draws the styled pieces.
 */
export const SearchInput = forwardRef(function SearchInput(
  { value, onChange }: { value: string; onChange: (value: string) => void },
  ref: Ref<HTMLInputElement>,
) {
  const mirror = useRef<HTMLDivElement>(null)
  const pieces = useMemo(() => {
    const out: { text: string; key?: string }[] = []
    let at = 0
    for (const token of parseSearch(value).tokens) {
      if (!token.operator) continue
      if (token.start > at) out.push({ text: value.slice(at, token.start) })
      out.push({ text: value.slice(token.start, token.end), key: token.operator })
      at = token.end
    }
    if (at < value.length) out.push({ text: value.slice(at) })
    return out
  }, [value])
  const follow = (input: HTMLInputElement) => {
    if (mirror.current) mirror.current.scrollLeft = input.scrollLeft
  }
  return (
    <div className="relative flex min-w-0 flex-1">
      <div
        ref={mirror}
        aria-hidden
        className="search-mirror pointer-events-none absolute inset-0 overflow-hidden whitespace-pre py-1.75 text-[13px] text-foreground"
      >
        {pieces.map((piece, i) =>
          piece.key ? (
            <span
              key={i}
              className="search-chip rounded-[3px] bg-[color-mix(in_oklab,var(--color-primary)_20%,transparent)] shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-primary)_20%,transparent)]"
            >
              <span className="text-primary">{piece.text.slice(0, piece.key.length + 1)}</span>
              {piece.text.slice(piece.key.length + 1)}
            </span>
          ) : (
            <span key={i}>{piece.text}</span>
          ),
        )}
      </div>
      <input
        ref={ref}
        className="relative w-full text-transparent caret-foreground placeholder:text-muted selection:bg-[color-mix(in_oklab,var(--color-primary)_35%,transparent)]"
        placeholder="Search mail, or try from: subject: has:attachment"
        aria-label="Search email"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          follow(e.target)
        }}
        onScroll={(e) => follow(e.currentTarget)}
        onKeyUp={(e) => follow(e.currentTarget)}
        onSelect={(e) => follow(e.currentTarget)}
      />
    </div>
  )
})
