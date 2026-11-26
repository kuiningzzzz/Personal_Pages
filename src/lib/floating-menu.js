// All values use layout-viewport CSS coordinates (including visualViewport's
// offsets when a mobile keyboard or pinch zoom reduces the visible area).
export function positionFloatingMenu(anchor, size, viewport, margin = 12, gap = 8) {
  const leftEdge = viewport.left + margin, topEdge = viewport.top + margin
  const rightEdge = Math.max(leftEdge, viewport.left + viewport.width - margin)
  const bottomEdge = Math.max(topEdge, viewport.top + viewport.height - margin)
  const width = Math.min(size.width, rightEdge - leftEdge)
  const anchorTop = Math.max(topEdge, Math.min(bottomEdge, anchor.top))
  const anchorBottom = Math.max(topEdge, Math.min(bottomEdge, anchor.bottom))
  const below = Math.max(0, bottomEdge - anchorBottom - gap)
  const above = Math.max(0, anchorTop - topEdge - gap)
  const side = below >= size.height || below >= above ? 'bottom' : 'top'
  const maxHeight = side === 'bottom' ? below : above
  const height = Math.min(size.height, maxHeight)
  const top = side === 'bottom' ? anchorBottom + gap : anchorTop - gap - height
  return {
    side, width, maxHeight,
    left: Math.max(leftEdge, Math.min(anchor.right - width, rightEdge - width)),
    top: Math.max(topEdge, Math.min(top, bottomEdge - height))
  }
}
