export const CONTENT_PAGE_SIZE = 15

export function paginationItems(page, totalPages) {
  const total = Math.max(1, Math.floor(totalPages))
  const current = Math.min(total, Math.max(1, Math.floor(page)))
  const visible = new Set([1, total, current - 1, current, current + 1])
  if (current <= 3) for (let n = 1; n <= 4; n++) visible.add(n)
  if (current >= total - 2) for (let n = total - 3; n <= total; n++) visible.add(n)
  const pages = [...visible].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)
  const result = []
  for (const n of pages) {
    const previous = result.at(-1)
    if (n - previous === 2) result.push(previous + 1)
    else if (n - previous > 2) result.push(`gap-${previous}`)
    result.push(n)
  }
  return result
}
