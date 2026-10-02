// Copy the complete plain text, including lines hidden by the preview.
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return }
    catch { /* Older or restricted contexts can use the selection fallback. */ }
  }
  const previous = document.activeElement
  const selection = window.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : []
  const field = document.createElement('textarea')
  field.value = text; field.readOnly = true
  field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px'
  document.body.append(field)
  try {
    field.focus({ preventScroll: true }); field.select(); field.setSelectionRange(0, text.length)
    if (!document.execCommand('copy')) throw new Error('暂时无法复制，请手动选择评论内容复制')
  } finally {
    field.remove()
    if (previous?.isConnected) previous.focus({ preventScroll: true })
    if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)) }
  }
}
