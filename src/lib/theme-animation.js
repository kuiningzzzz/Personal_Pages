export const revealDuration = 900

// Both transforms follow the same sampled curve. The inner transform cancels
// the circle's scale, keeping the viewport snapshot at its original size.
export function createRevealKeyframes(steps = 240) {
  const expand = []
  const counter = []
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps
    const eased = progress * progress * (3 - 2 * progress)
    const scale = .004 + .996 * eased
    const offset = `${(progress * 100).toFixed(5)}%`
    expand.push(`${offset}{transform:scale(${scale.toFixed(8)})}`)
    counter.push(`${offset}{transform:scale(${(1 / scale).toFixed(8)})}`)
  }
  return `@keyframes theme-disc-expand{${expand.join('')}}@keyframes theme-disc-counter{${counter.join('')}}`
}

let framesPrepared = false
let cachedGeometry

export function prepareReveal(button) {
  if (!framesPrepared) {
    const style = document.createElement('style')
    style.id = 'theme-reveal-keyframes'
    style.textContent = createRevealKeyframes()
    document.head.append(style)
    framesPrepared = true
  }
  const rect = button.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const width = innerWidth
  const height = innerHeight
  const key = `${x}:${y}:${width}:${height}`
  if (cachedGeometry?.key === key) return cachedGeometry

  const radius = Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y))) + 2
  const properties = {
    '--theme-disc-size': `${radius * 2}px`,
    '--theme-disc-left': `${x - radius}px`,
    '--theme-disc-top': `${y - radius}px`,
    '--theme-image-left': `${radius - x}px`,
    '--theme-image-top': `${radius - y}px`,
    '--theme-image-origin': `${x}px ${y}px`,
    '--theme-image-width': `${width}px`,
    '--theme-image-height': `${height}px`,
    '--theme-reveal-duration': `${revealDuration}ms`
  }
  for (const [name, value] of Object.entries(properties)) document.documentElement.style.setProperty(name, value)
  cachedGeometry = { key, x, y, width, height, radius }
  return cachedGeometry
}
