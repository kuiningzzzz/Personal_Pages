export const PLAY_MODES = ['single', 'list', 'shuffle']

export function queueIndex(current, length, { direction = 1, mode = 'single', automatic = false, random = Math.random } = {}) {
  if (!length) return -1
  if (automatic && mode === 'single') return Math.max(0, current) % length
  if (mode === 'shuffle' && direction > 0 && length > 1) {
    const offset = 1 + Math.min(length - 2, Math.floor(random() * (length - 1)))
    return (Math.max(0, current) + offset) % length
  }
  return ((Math.max(0, current) + direction) % length + length) % length
}

export function musicTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
