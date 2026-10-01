let locks = 0
let previousOverflow = ''
export function lockPageScroll() {
  if (locks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--locks === 0) document.body.style.overflow = previousOverflow
  }
}
export function trapFocus(event, element) {
  if (event.key !== 'Tab' || !element) return
  const targets = [...element.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length)
  const first = targets[0], last = targets.at(-1)
  if (!first) { event.preventDefault(); element.focus(); return }
  if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
