import { decodeHTML } from 'entities';
import { parseMarkdownHtml } from './shared/markdown.js';

// Count visible Unicode characters in the body, including code, excluding whitespace.
// Sharing the renderer's parser keeps CJK emphasis and the ++underline++ extension consistent.
export function countMarkdownCharacters(source) {
    const html = parseMarkdownHtml(String(source || '').replace(/\+\+([^+\n]+)\+\+/g, '<u>$1</u>'));
    const text = html
        .replace(/<!--[^]*?-->/g, '')
        .replace(/<(script|style|iframe|svg|object|form)\b[^>]*>[^]*?<\/\1\s*>/gi, '')
        .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '');
    return [...decodeHTML(text).replace(/\s/gu, '')].length;
}

export function documentWordCount(entry) {
    return entry.kind === 'resource' && entry.resource_kind === 'document'
        ? { word_count: countMarkdownCharacters(entry.body) } : {};
}

export function articleWordCount(entry) {
    return entry.kind === 'moment' && entry.format === 'article'
        ? { word_count: countMarkdownCharacters(entry.body) } : documentWordCount(entry);
}
