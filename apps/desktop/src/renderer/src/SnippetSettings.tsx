import { useState } from 'react'
import { Button, EmptyState, IconButton, Modal } from '@inlark/ui'
import { Plus, SquarePen, Trash2, Zap } from '@inlark/ui/icons'
import type { Snippet } from '@inlark/core'

const MAX_SNIPPETS = 500
const MAX_NAME = 100
const MAX_TEXT = 20000

const firstLine = (text: string) =>
  text
    .split('\n')
    .find((line) => line.trim())
    ?.trim() || ''

/** Saved pieces of text to insert while writing, edited in a dialog and saved right away. */
export function SnippetSettings({
  snippets,
  onSave,
}: {
  snippets: Snippet[]
  onSave: (patch: { snippets: Snippet[] }) => Promise<boolean>
}) {
  // `id` is empty while a new snippet is being written.
  const [draft, setDraft] = useState<{ id: string; name: string; text: string }>()
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<Snippet>()
  const atLimit = snippets.length >= MAX_SNIPPETS
  const name = draft?.name.trim() ?? ''

  const open = (snippet?: Snippet) => {
    setTouched(false)
    setDraft(snippet ? { ...snippet } : { id: '', name: '', text: '' })
  }
  const save = async () => {
    if (!draft) return
    setTouched(true)
    if (!name) return
    setSaving(true)
    try {
      const next: Snippet = { id: draft.id || crypto.randomUUID(), name, text: draft.text }
      const list = draft.id
        ? snippets.map((s) => (s.id === draft.id ? next : s))
        : [...snippets, next]
      if (await onSave({ snippets: list })) setDraft(undefined)
    } finally {
      setSaving(false)
    }
  }
  const confirmRemove = async () => {
    if (!removing) return
    setSaving(true)
    try {
      if (await onSave({ snippets: snippets.filter((s) => s.id !== removing.id) })) {
        setRemoving(undefined)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {snippets.length ? (
        <>
          <div className="snippet-toolbar flex flex-wrap items-center justify-between gap-2.5 mb-2">
            <span className="text-[12px] text-muted">
              {snippets.length} {snippets.length === 1 ? 'snippet' : 'snippets'}
            </span>
            <Button size="small" disabled={atLimit} onClick={() => open()}>
              <Plus size={13} />
              New snippet
            </Button>
          </div>
          <ul className="snippet-list m-0 p-0 list-none">
            {snippets.map((snippet) => (
              <li
                key={snippet.id}
                className="snippet-row flex items-center gap-2.5 py-3 px-0 border-t border-solid border-t-border min-w-0"
              >
                <button
                  type="button"
                  className="snippet-main flex-1 min-w-0 bg-transparent border-0 p-0 text-left"
                  onClick={() => open(snippet)}
                >
                  <strong className="block text-[13px] font-medium text-strong overflow-hidden text-ellipsis whitespace-nowrap">
                    {snippet.name}
                  </strong>
                  <span className="block mt-0.5 text-[12px] text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                    {firstLine(snippet.text) || 'Empty snippet'}
                  </span>
                </button>
                <div className="snippet-actions flex shrink-0 gap-1">
                  <IconButton label={'Edit ' + snippet.name} onClick={() => open(snippet)}>
                    <SquarePen size={14} />
                  </IconButton>
                  <IconButton label={'Delete ' + snippet.name} onClick={() => setRemoving(snippet)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
          {atLimit && (
            <p className="text-faint text-[12px] leading-[1.6]">
              You’ve reached the limit of {MAX_SNIPPETS} snippets. Delete one to add another.
            </p>
          )}
        </>
      ) : (
        <div className="no-accounts [&_.empty-state]:pb-12 flex min-h-90">
          <EmptyState
            icon={Zap}
            title="No snippets yet"
            description="Snippets are pieces of text you reuse, like a standard reply or a meeting link. While writing, insert one with the ⚡ button or Ctrl/Cmd+;"
          >
            <Button variant="primary" onClick={() => open()}>
              <Plus size={13} />
              New snippet
            </Button>
          </EmptyState>
        </div>
      )}
      <Modal
        open={!!draft}
        onOpenChange={(value) => {
          if (!value && !saving) setDraft(undefined)
        }}
        title={draft?.id ? 'Edit snippet' : 'New snippet'}
        description="Plain text. Use {first_name} to insert the first recipient’s first name."
      >
        {draft && (
          <form
            className="snippet-form"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <label className="form-field mt-0 [&_input]:mt-1.5 [&_input[aria-invalid='true']]:border-danger/70">
              Name
              <input
                autoFocus
                value={draft.name}
                maxLength={MAX_NAME}
                placeholder="Meeting follow-up"
                aria-invalid={touched && !name}
                aria-describedby={touched && !name ? 'snippet-name-error' : undefined}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              {touched && !name && (
                <span id="snippet-name-error" className="block mt-1.25 text-[11px] text-danger">
                  Give this snippet a name.
                </span>
              )}
            </label>
            <label className="form-field mt-3.75 [&_textarea]:mt-1.5 [&_textarea]:block [&_textarea]:min-h-40 [&_textarea]:resize-y [&_textarea]:text-[12px] [&_textarea]:leading-[1.6]">
              Text
              <textarea
                rows={8}
                value={draft.text}
                maxLength={MAX_TEXT}
                placeholder={'Hi {first_name},\n\nThanks for your time today…'}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </label>
            <div className="modal-actions flex flex-wrap justify-end gap-2 mt-6">
              <Button disabled={saving} onClick={() => setDraft(undefined)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!removing}
        onOpenChange={(value) => {
          if (!value && !saving) setRemoving(undefined)
        }}
        title="Delete this snippet?"
        description={
          removing ? '“' + removing.name + '” will be removed. This can’t be undone.' : ''
        }
      >
        <div className="modal-actions flex flex-wrap justify-end gap-2 mt-6">
          <Button disabled={saving} onClick={() => setRemoving(undefined)}>
            Keep snippet
          </Button>
          <Button variant="danger" disabled={saving} onClick={() => void confirmRemove()}>
            Delete snippet
          </Button>
        </div>
      </Modal>
    </>
  )
}
