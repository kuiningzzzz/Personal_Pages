import { CONTENT_PAGE_SIZE } from './pagination.js'

// Count and paginate roots before flattening their visible branches. Each
// collection's child limit is independent of the descendants of those children.
export function adminListing(entries, { kind, query = '', sort = 'updated', page = 1, expanded = new Set(), pageSize = CONTENT_PAGE_SIZE }) {
  const field = sort === 'created' ? 'created_at' : 'updated_at'
  const ordered = [...entries].sort((a, b) => (Date.parse(b[field]) || 0) - (Date.parse(a[field]) || 0) || b.id - a.id)
  const nodes = new Map(ordered.map(row => [row.id, row]))
  const children = new Map()
  for (const row of ordered) {
    const parent = kind === 'resource' && nodes.has(row.parent_id) ? row.parent_id : null
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(row)
  }
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  let included = null
  if (terms.length) {
    included = new Set()
    for (const row of ordered) {
      const text = [row.title, row.summary, row.body, ...(row.tags || []), ...(row.images || []).map(image => image.caption)].join(' ').toLocaleLowerCase()
      if (!terms.every(term => text.includes(term))) continue
      included.add(row.id)
      // Preserve the location of every match, including matches in drafts.
      let parent = kind === 'resource' ? row.parent_id : null
      const seen = new Set([row.id])
      while (nodes.has(parent) && !seen.has(parent)) {
        seen.add(parent); included.add(parent); parent = nodes.get(parent).parent_id
      }
    }
  }
  const matchingChildren = parent => (children.get(parent) || []).filter(row => !included || included.has(row.id))
  const roots = matchingChildren(null)
  const totalPages = Math.max(1, Math.ceil(roots.length / pageSize))
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const rows = [], seen = new Set()
  function visit(row, depth) {
    if (seen.has(row.id)) return
    seen.add(row.id)
    rows.push({ ...row, depth, rowKey: `entry-${row.id}` })
    if (kind !== 'resource') return
    const branch = matchingChildren(row.id)
    const showAll = terms.length > 0 || expanded.has(row.id)
    for (const child of showAll ? branch : branch.slice(0, 3)) visit(child, depth + 1)
    if (!terms.length && branch.length > 3) rows.push({
      rowKey: `fold-${row.id}`, fold: true, id: row.id, depth: depth + 1,
      expanded: showAll, hidden: branch.length - 3, title: row.title,
    })
  }
  for (const root of roots.slice((currentPage - 1) * pageSize, currentPage * pageSize)) visit(root, 0)
  return { rows, total: roots.length, totalPages, page: currentPage }
}
