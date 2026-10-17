import { Marked, Tokenizer } from 'marked'

// DOM-free parsing shared by the browser renderer and server-side text statistics.

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

