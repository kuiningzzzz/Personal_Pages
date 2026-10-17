// Let focused controls keep their native Space action, and editors keep typing spaces.
const interactive = 'input, textarea, select, button, a, summary, audio, video, iframe, [role="button"], [role="textbox"], [role="slider"], [role="combobox"]'
export function handleMusicSpace(event, toggle) {
  if ((event.code !== 'Space' && event.key !== ' ') || event.defaultPrevented || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const path = event.composedPath?.() || [event.target]
  if (path.some(element => element?.isContentEditable || element?.closest?.(interactive))) return
  event.preventDefault()
  if (!event.repeat) toggle()
}
