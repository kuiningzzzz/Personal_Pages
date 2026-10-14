import { Marked, Tokenizer } from 'marked'

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u
const punctuation = /\p{P}/u
const markdown = new Marked({
  gfm: true,
  breaks: true,
  tokenizer: {
    emStrong(source, maskedSource, previousCharacter) {
      const token = Tokenizer.prototype.emStrong.call(this, source, maskedSource, previousCharacter)
      if (token || !source.startsWith('**') || source[2] === '*' || /^[\r\n]/.test(source[2] || '')) return token

      // Marked masks escaped characters, code and link destinations before
      // looking for delimiters. Use that same mask rather than rewriting HTML
      // or replacing ** globally, which would also alter literal code.
      const masked = maskedSource.slice(-source.length)
      for (let end = masked.indexOf('**', 2); end !== -1; end = masked.indexOf('**', end + 2)) {
        if (masked[end - 1] === '*' || masked[end + 2] === '*') continue
        const content = source.slice(2, end)
        // Tolerate accidental horizontal padding from pasted/generated text,
        // including non-breaking spaces, without accepting empty emphasis.
        const text = content.replace(/^[^\S\r\n]+|[^\S\r\n]+$/g, '')
        if (!text) return
        if (/^\s|\s$/.test(text)) continue
        // Without padding, relax punctuation boundaries only for CJK writing;
        // other delimiter rules continue to use the original tokenizer.
        if (text === content) {
          if (!cjk.test((previousCharacter || '') + text + source.slice(end + 2, end + 3))) return
          if (!punctuation.test(text[0]) && !punctuation.test(text.at(-1))) return
        }
        return { type: 'strong', raw: source.slice(0, end + 2), text, tokens: this.lexer.inlineTokens(text) }
      }
    }
  }
})

export const parseMarkdownHtml = source => markdown.parse(source)

const allowed = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'STRONG', 'EM', 'DEL', 'U', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG'])
const safeUrl = (value, image = false) => {
  try {
    const url = new URL(value, window.location.origin)
    if (url.protocol === 'https:' || url.protocol === 'http:' || (!image && url.protocol === 'mailto:')) return value
  } catch { /* invalid URL */ }
  return ''
}

export function renderMarkdownDocument(source, { headingPrefix = '' } = {}) {
  const text = String(source || '').replace(/\+\+([^+\n]+)\+\+/g, '<u>$1</u>')
  const doc = new DOMParser().parseFromString(parseMarkdownHtml(text), 'text/html')
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
  // Add scroll containers after sanitizing, so authored HTML cannot inject
  // arbitrary classes or attributes. Keep the table's native layout intact.
  doc.body.querySelectorAll('table').forEach(table => {
    const container = doc.createElement('div')
    container.className = 'markdown-table-scroll'
    container.tabIndex = 0
    container.setAttribute('role', 'region')
    container.setAttribute('aria-label', '表格，可横向滚动')
    table.before(container)
    container.append(table)
  })
  const outline = []
  if (headingPrefix) {
    const prefix = headingPrefix.replace(/[^a-zA-Z0-9_-]/g, '-')
    doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading, index) => {
      const id = `${prefix}${index + 1}`
      heading.id = id
      outline.push({ id, text: heading.textContent.trim() || '未命名章节', level: Number(heading.tagName.slice(1)) })
    })
  }
  return { html: doc.body.innerHTML, outline }
}
export const renderMarkdown = source => renderMarkdownDocument(source).html
