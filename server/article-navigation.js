// The detail route checks that the current article and its ancestors are public.
// Siblings share those ancestors; only direct, published articles join the ring.
export function articleNavigation(db, current) {
    if (current.status !== 'published' || current.format !== 'article' || current.resource_kind !== 'document') return null;
    const rows = db.prepare(`SELECT id,title FROM entries
        WHERE kind=? AND parent_id IS ? AND status='published' AND format='article' AND resource_kind='document'
        ORDER BY julianday(published_at) DESC,id DESC`).all(current.kind, current.parent_id);
    const index = rows.findIndex(row => row.id === current.id);
    if (rows.length < 2 || index < 0) return null;
    return { previous: { ...rows[(index - 1 + rows.length) % rows.length] }, next: { ...rows[(index + 1) % rows.length] } };
}
