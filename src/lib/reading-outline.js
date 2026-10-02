// Scroll only the directory's own viewport. Moving the document here would
// compete with reading gestures and with heading-link navigation.
export function followActiveOutline(nav) {
  const active = nav?.querySelector('[aria-current="location"]')
  if (!active || !nav.clientHeight) return
  const bounds = nav.getBoundingClientRect()
  const item = active.getBoundingClientRect()
  const center = bounds.top + (nav.clientTop || 0) + nav.clientHeight / 2
  const top = Math.max(0, Math.min(nav.scrollHeight - nav.clientHeight, nav.scrollTop + item.top + item.height / 2 - center))
  if (Math.abs(top - nav.scrollTop) > .5) nav.scrollTo({ top, behavior: 'instant' })
}
