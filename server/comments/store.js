import { resourceGraph } from '../subscriptions/graph.js';
import { notificationPath } from '../subscriptions/service.js';

export const REPORT_REASONS = ['广告营销', '色情低俗', '引战暴力', '政治敏感', '侵犯权益', '其他描述'];
export function commentableEntry(db, id) {
    const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!entry || entry.status !== 'published' || entry.resource_kind === 'collection') return null;
    if (entry.kind === 'resource' && !resourceGraph(db).publicEntry(entry)) return null;
    return entry;
}
export const commentPath = (entry, id) => {
    const path = notificationPath(entry);
    return `${path}${path.includes('?') ? '&' : '?'}comment=${id}`;
};
export const maskedEmail = email => {
    const [name, domain] = email.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
};
const selectComment = `SELECT c.*, u.username, u.email, u.is_owner,
    (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id) AS likes,
    EXISTS(SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) AS liked,
    (SELECT COUNT(*) FROM entry_comments r WHERE r.root_id = c.id) AS reply_count
    FROM entry_comments c JOIN users u ON u.id = c.user_id`;
export function publicComment(row, viewerId) {
    return { id: row.id, entry_id: row.entry_id, root_id: row.root_id, reply_to_id: row.reply_to_id, reply_to_name: row.reply_to_name,
        username: row.username, email: maskedEmail(row.email), body: row.body, created_at: row.created_at,
        likes: row.likes, liked: Boolean(row.liked), owned: row.user_id === viewerId, is_owner: Boolean(row.is_owner), reply_count: row.reply_count };
}
export function findComment(db, id, viewerId = null) {
    return db.prepare(`${selectComment} WHERE c.id = ?`).get(viewerId, id);
}
export function commentReplies(db, rootId, viewerId = null, limit = 3, offset = 0) {
    return db.prepare(`${selectComment} WHERE c.root_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT ? OFFSET ?`)
        .all(viewerId, rootId, limit, offset).map(row => publicComment(row, viewerId));
}
export function commentList(db, entryId, viewerId = null, { sort = 'likes', page = 1, focus = null } = {}) {
    const order = sort === 'latest' ? 'c.created_at DESC, c.id DESC' : 'likes DESC, c.created_at DESC, c.id DESC';
    const roots = db.prepare(`${selectComment} WHERE c.entry_id = ? AND c.root_id IS NULL ORDER BY ${order} LIMIT 10 OFFSET ?`)
        .all(viewerId, entryId, (page - 1) * 10);
    const target = focus ? findComment(db, focus, viewerId) : null;
    const focused = target?.entry_id === entryId ? target : null;
    if (focused && page === 1 && !roots.some(row => row.id === (focused.root_id || focused.id))) {
        const root = focused.root_id ? findComment(db, focused.root_id, viewerId) : focused;
        if (root) roots.unshift(root);
    }
    return {
        data: roots.map(row => ({ ...publicComment(row, viewerId), replies: commentReplies(db, row.id, viewerId) })),
        total: db.prepare('SELECT COUNT(*) AS n FROM entry_comments WHERE entry_id = ? AND root_id IS NULL').get(entryId).n,
        focusedComment: focused ? publicComment(focused, viewerId) : null, page
    };
}
export function removeComment(db, id, action, clock = Date.now) {
    db.prepare(`UPDATE comment_reports SET status = 'resolved', action = ?, resolved_at = ?
        WHERE status = 'pending' AND comment_id IN (SELECT id FROM entry_comments WHERE id = ? OR root_id = ?)`)
        .run(action, new Date(clock()).toISOString(), id, id);
    return db.prepare('DELETE FROM entry_comments WHERE id = ?').run(id);
}
