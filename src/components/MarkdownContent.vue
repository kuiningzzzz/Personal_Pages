<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown'
const props = defineProps({ source: { type: String, default: '' } })
const html = computed(() => renderMarkdown(props.source))
</script>
<template><div class="markdown" v-html="html"></div></template>
<style>
.markdown { color: var(--muted); line-height: 1.85; overflow-wrap: anywhere; }
.markdown > :first-child { margin-top: 0; }
.markdown > :last-child { margin-bottom: 0; }
.markdown h1, .markdown h2, .markdown h3, .markdown h4 { color: var(--ink); font-family: var(--heading-font); font-weight: 900; line-height: 1.35; }
.markdown a { color: #456d7a; text-decoration-thickness: 2px; text-underline-offset: 3px; }
.markdown strong { color: var(--ink); }
.markdown pre { overflow-x: auto; padding: 18px 20px; border-radius: 6px; color: var(--paper); background: var(--ink); box-shadow: 6px 6px 0 var(--denim); }
.markdown code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }
.markdown :not(pre) > code { padding: 2px 5px; border-radius: 3px; background: var(--sky); color: var(--ink); }
.markdown blockquote { margin: 1.5em 0; padding: 12px 16px; border-radius: 5px; background: var(--sky); box-shadow: inset 5px 0 0 var(--accent); }
.markdown img { max-width: 100%; border-radius: 5px; box-shadow: 6px 6px 0 var(--accent-soft); }
.markdown table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.markdown th, .markdown td { padding: 8px 12px; border-bottom: 1px solid var(--paper-deep); }
</style>
