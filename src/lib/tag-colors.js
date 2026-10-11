export const DEFAULT_TAG_COLOR = '#d8e5e8'

export function tagColorStyle(color) {
  const background = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_TAG_COLOR
  const channels = [1, 3, 5].map(start => {
    const value = Number.parseInt(background.slice(start, start + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return { backgroundColor: background, color: luminance > 0.179 ? '#161616' : '#ffffff' }
}
