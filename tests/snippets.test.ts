import { describe, expect, it } from 'vitest'
import { fillSnippet, snippetHtml } from '../apps/desktop/src/renderer/src/SnippetPicker'

describe('snippets', () => {
  it('fills in the first recipient’s first name', () => {
    const to = [{ name: 'Alice Smith', email: 'alice@example.com' }]
    expect(fillSnippet('Hi {first_name},', to)).toBe('Hi Alice,')
    expect(fillSnippet('Hi { FIRST_NAME },', [])).toBe('Hi ,')
  })
  it('keeps paragraphs and escapes markup', () => {
    expect(snippetHtml('One\nline <b>\n\nTwo')).toBe('<p>One<br>line &lt;b&gt;</p><p>Two</p>')
  })
})
