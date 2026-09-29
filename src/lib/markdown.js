import { marked } from 'marked'

const allowed = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'STRONG', 'EM', 'DEL', 'U', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG'])
const safeUrl = (value, image = false) => {
  try {
    const url = new URL(value, window.location.origin)
    if (url.protocol === 'https:' || url.protocol === 'http:' || (!image && url.protocol === 'mailto:')) return value
  } catch { /* invalid URL */ }
  return ''
}

export function renderMarkdown(source) {
  const text = String(source || '').replace(/\+\+([^+\n]+)\+\+/g, '<u>$1</u>')
  const doc = new DOMParser().parseFromString(marked.parse(text, { gfm: true, breaks: true }), 'text/html')
  const walk = node => {
    for (const child of [...node.children]) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'SVG', 'OBJECT', 'FORM'].includes(child.tagName)) { child.remove(); continue }
      if (!allowed.has(child.tagName)) { walk(child); child.replaceWith(...child.childNodes); continue }
      const href = child.getAttribute('href')
      const src = child.getAttribute('src')
      const alt = child.getAttribute('alt')
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name)
      if (child.tagName === 'A' && href && safeUrl(href)) {
        child.setAttribute('href', href)
        child.setAttribute('target', '_blank')
        child.setAttribute('rel', 'noopener noreferrer')
      }
      if (child.tagName === 'IMG' && src && safeUrl(src, true)) {
        child.setAttribute('src', src)
        child.setAttribute('alt', alt || '')
        child.setAttribute('loading', 'lazy')
      }
      walk(child)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}
