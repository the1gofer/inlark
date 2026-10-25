import { describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '../apps/desktop/node_modules/@tiptap/react'
import StarterKit from '../apps/desktop/node_modules/@tiptap/starter-kit'
import type { Address } from '../packages/core/src'
import {
  MentionNode,
  matchAddresses,
  mentionLabel,
  mentionQuery,
} from '../apps/desktop/src/renderer/src/mentions'

const people: Address[] = [
  { name: 'Ann Lee', email: 'ann@example.com' },
  { name: 'Bob Smith', email: 'bob@example.com' },
  { email: 'carol@example.org' },
]

/** The query at the end of `text`, typed into an empty paragraph. */
function typed(text: string) {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, MentionNode],
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  })
  try {
    editor.commands.setTextSelection(text.length + 1)
    return mentionQuery(editor.state)
  } finally {
    editor.destroy()
  }
}

describe('mentions', () => {
  it('finds the name being typed after @', () => {
    expect(typed('Thanks @an')).toEqual({ from: 8, to: 11, query: 'an' })
    expect(typed('@')).toEqual({ from: 1, to: 2, query: '' })
    expect(typed('Hi @Ann L')?.query).toBe('Ann L')
    expect(typed('(@bo')?.query).toBe('bo')
  })

  it('leaves email addresses and finished sentences alone', () => {
    expect(typed('mail ann@example.com')).toBeUndefined()
    expect(typed('@Ann Lee said hi')).toBeUndefined()
    expect(typed('no mention here')).toBeUndefined()
  })

  it('matches contacts by first name, last name, or address', () => {
    expect(matchAddresses(people, 'smi').map((a) => a.email)).toEqual(['bob@example.com'])
    expect(matchAddresses(people, 'car').map((a) => a.email)).toEqual(['carol@example.org'])
    expect(matchAddresses(people, '')).toHaveLength(3)
    expect(matchAddresses(people, '', [people[0]])).toHaveLength(2)
  })

  it('labels a mention with the name, or the mailbox when unnamed', () => {
    expect(mentionLabel(people[0])).toBe('Ann Lee')
    expect(mentionLabel(people[2])).toBe('carol')
  })

  it('is sent as a mailto link reading @Name', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi ' },
            { type: 'mention', attrs: { email: 'ann@example.com', label: 'Ann Lee' } },
          ],
        },
      ],
    }
    const editor = new Editor({ element: null, extensions: [StarterKit, MentionNode], content })
    try {
      expect(editor.getText()).toBe('Hi @Ann Lee')
      const node = editor.state.doc.firstChild!.lastChild!
      // Rendered without a DOM: the tag, its attributes, and its text.
      const [tag, attributes, text] = node.type.spec.toDOM!(node) as [
        string,
        Record<string, string>,
        string,
      ]
      expect(tag).toBe('a')
      expect(attributes).toMatchObject({
        href: 'mailto:ann@example.com',
        'data-mention': 'ann@example.com',
        class: 'mention',
      })
      expect(attributes).not.toHaveProperty('label')
      expect(text).toBe('@Ann Lee')
    } finally {
      editor.destroy()
    }
  })
})
