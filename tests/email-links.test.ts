import { describe, expect, it } from 'vitest'
import { webLinkTarget } from '../apps/desktop/src/renderer/src/email-html'

describe('links in mail', () => {
  it('keeps web links and completes ones mail often leaves partial', () => {
    expect(webLinkTarget('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&c=2')
    expect(webLinkTarget('  HTTP://Example.com ')).toBe('http://example.com/')
    expect(webLinkTarget('//example.com/x')).toBe('https://example.com/x')
    expect(webLinkTarget('www.example.com/y')).toBe('https://www.example.com/y')
  })

  it('leaves other links to the reader', () => {
    for (const href of [
      '',
      '#top',
      'mailto:jane@example.com',
      'javascript:alert(1)',
      'relative/path',
      'https://user:secret@example.com/',
    ])
      expect(webLinkTarget(href)).toBeUndefined()
  })
})
