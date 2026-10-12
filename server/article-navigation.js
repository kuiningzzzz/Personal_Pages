import { publicEntryComparator } from './moment-pins.js';

// The detail route checks that the current article and its ancestors are public.
// Siblings share those ancestors; only direct, published articles join the ring.
export function articleNavigation(db, current, { sort = 'latest' } = {}) {
    if (current.status !== 'published' || current.format !== 'article' || current.resource_kind !== 'document') return null;
    const rows = db.prepare(`SELECT id,title,published_at,updated_at,pinned FROM entries
        WHERE kind=? AND parent_id IS ? AND status='published' AND format='article' AND resource_kind='document'`).all(current.kind, current.parent_id);
    rows.sort(publicEntryComparator({ sort, pinnedFirst: current.kind === 'moment' }));
    const index = rows.findIndex(row => row.id === current.id);
    if (rows.length < 2 || index < 0) return null;
    const neighbor = offset => {
        const { id, title } = rows[(index + offset + rows.length) % rows.length];
        return { id, title };
    };
    return { previous: neighbor(-1), next: neighbor(1) };
}
