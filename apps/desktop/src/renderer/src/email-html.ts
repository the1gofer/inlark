import type { Config } from 'dompurify'
import { plainTextHtml, type Message } from '@inlark/core'

// Cached JMAP bodies can match for either MIME type. Look for a document, paired
// elements, or image markup; a literal <br> or <sender@example.test> is still text.
const htmlMarkup =
  /<(?:!doctype\s+html|html|head|body)(?:\s|>)|<([a-z][a-z\d:-]*)\b[^>]*>[\s\S]*?<\/\1\s*>|<(?:img|hr)\b[^>]*>/i

/** Repair duplicated plain-text bodies without escaping duplicated HTML bodies. */
export function emailBodyHtml(message: Pick<Message, 'html' | 'text' | 'preview'>): string {
  const html = message.html?.trim()
  if (html && (html !== message.text?.trim() || htmlMarkup.test(html))) return message.html!
  return plainTextHtml(
    (message.text?.trim() ? message.text : message.preview) ||
      'No readable message body is available.',
  )
}

/** HTML from mail or a signature keeps its layout, but nothing that runs, submits or restyles the app. */
export const emailSanitizeOptions: Config = {
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'frame',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'meta',
    'base',
    'link',
    'svg',
    'math',
    'video',
    'audio',
    'source',
  ],
  FORBID_ATTR: ['srcset', 'action', 'formaction', 'ping', 'autofocus', 'contenteditable'],
}

/** The web address a link in mail points to, or undefined when it is not a web link. */
export function webLinkTarget(href: string): string | undefined {
  const value = href.trim()
  const candidate = value.startsWith('//')
    ? 'https:' + value
    : /^www\./i.test(value)
      ? 'https://' + value
      : value
  try {
    const url = new URL(candidate)
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password)
      return url.toString()
  } catch {
    /* Not an absolute address. */
  }
  return undefined
}

/**
 * Web links open in a new tab as ordinary links. Phone browsers, Safari on iPhone above all,
 * block a tab opened by script from a tap inside the message frame, but never a real link.
 */
export function openWebLinksInNewTab(root: ParentNode) {
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const target = webLinkTarget(link.getAttribute('href') || '')
    if (!target) {
      link.removeAttribute('target')
      continue
    }
    link.setAttribute('href', target)
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
}
