import { cardDb } from './db.js';

export const imagesFor = id => cardDb.prepare('SELECT id, url, caption, width, height FROM gallery_images WHERE entry_id = ? ORDER BY display_order, id').all(id);

// A published child is only public while every collection above it is published.
export function publicAncestors(row) {
    const ancestors = [];
    const visited = new Set([row.id]);
    let parentId = row.parent_id;
    while (parentId) {
        if (visited.has(parentId)) return null;
        visited.add(parentId);
        const parent = cardDb.prepare("SELECT id, title, parent_id, kind, resource_kind, status FROM entries WHERE id = ?").get(parentId);
        if (!parent || parent.kind !== 'resource' || parent.resource_kind !== 'collection' || parent.status !== 'published') return null;
        ancestors.unshift({ id: parent.id, title: parent.title });
        parentId = parent.parent_id;
    }
    return ancestors;
}

export function validateStructure(input, id = null) {
    const kind = input.kind === 'resource' ? 'resource' : 'moment';
    const resourceKind = kind === 'resource' && ['collection', 'gallery'].includes(input.resource_kind) ? input.resource_kind : 'document';
    const rows = cardDb.prepare('SELECT id, kind, resource_kind, parent_id FROM entries').all();
    if (resourceKind !== 'collection' && rows.some(row => row.parent_id === id && id !== null)) {
        return { error: '合集还有成员，请先移出成员，再修改资源形态' };
    }
    const parentId = kind === 'resource' && input.parent_id !== null && input.parent_id !== undefined && input.parent_id !== '' ? Number(input.parent_id) : null;
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) return { error: '所属合集无效' };
    if (parentId !== null && parentId === id) return { error: '合集不能作为自身的成员' };
    const nodes = new Map(rows.map(row => [row.id, { ...row }]));
    const targetId = id ?? -1;
    nodes.set(targetId, { id: targetId, kind, resource_kind: resourceKind, parent_id: parentId });
    let memberIds = null;
    if (resourceKind === 'collection' && input.member_ids !== undefined) {
        if (!Array.isArray(input.member_ids) || input.member_ids.length > 5000) return { error: '合集成员列表无效' };
        memberIds = [...new Set(input.member_ids.map(Number))];
        for (const memberId of memberIds) {
            if (!Number.isSafeInteger(memberId) || memberId <= 0 || memberId === targetId || nodes.get(memberId)?.kind !== 'resource') {
                return { error: '合集成员必须是其他资源、图集或合集' };
            }
        }
        for (const node of nodes.values()) if (node.parent_id === targetId) node.parent_id = null;
        for (const memberId of memberIds) nodes.get(memberId).parent_id = targetId;
    }
    // Validate the prospective tree, including member moves, before writing anything.
    for (const node of nodes.values()) {
        const visited = new Set([node.id]);
        let next = node.parent_id;
        while (next !== null && next !== undefined) {
            if (visited.has(next)) return { error: '合集不能包含自身或形成循环嵌套' };
            visited.add(next);
            const parent = nodes.get(next);
            if (!parent || parent.kind !== 'resource' || parent.resource_kind !== 'collection') return { error: '所属合集不存在或不是合集' };
            next = parent.parent_id;
        }
    }
    return { resourceKind, parentId, memberIds };
}

export function saveResourceExtras(id, data) {
    cardDb.prepare('DELETE FROM gallery_images WHERE entry_id = ?').run(id);
    const insert = cardDb.prepare('INSERT INTO gallery_images (entry_id, url, caption, width, height, display_order) VALUES (?, ?, ?, ?, ?, ?)');
    data.images.forEach((image, index) => insert.run(id, image.url, image.caption, image.width, image.height, index));
    if (data.memberIds !== null) {
        const now = new Date().toISOString();
        cardDb.prepare('UPDATE entries SET parent_id = NULL, updated_at = ? WHERE parent_id = ?').run(now, id);
        const move = cardDb.prepare('UPDATE entries SET parent_id = ?, updated_at = ? WHERE id = ?');
        for (const memberId of data.memberIds) move.run(id, now, memberId);
    }
}
