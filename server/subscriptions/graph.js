export const SCOPES = ['resource-all', 'resource-type', 'collection', 'moment-all', 'moment-short', 'moment-article'];

export function resourceGraph(db) {
    const rows = db.prepare("SELECT id, kind, resource_kind, parent_id, resource_type_id, status, title FROM entries WHERE kind = 'resource'").all();
    const nodes = new Map(rows.map(row => [row.id, row]));
    const children = new Map();
    for (const row of rows) {
        if (!children.has(row.parent_id)) children.set(row.parent_id, []);
        children.get(row.parent_id).push(row);
    }
    const branch = roots => {
        const seen = new Set();
        const visit = id => {
            if (seen.has(id)) return;
            seen.add(id);
            for (const child of children.get(id) || []) visit(child.id);
        };
        roots.forEach(visit);
        return [...seen].map(id => nodes.get(id)).filter(Boolean);
    };
    const path = row => {
        const result = []; const seen = new Set();
        for (let node = row; node && !seen.has(node.id); node = nodes.get(node.parent_id)) {
            seen.add(node.id); result.push(node);
        }
        return result;
    };
    const publicEntry = row => row?.status === 'published' && path(row).every(node => node.status === 'published')
        && (!row.parent_id || path(row).at(-1)?.parent_id == null)
        && path(row).slice(1).every(node => node.resource_kind === 'collection');
    return { rows, nodes, branch, path, publicEntry };
}

export const subscriptionKey = (scope, target = 0) => `${scope}:${target}`;
export const subscriptionMap = rows => new Map(rows.map(row => [subscriptionKey(row.scope, row.target_id), row]));
const eligible = (row, eventId) => Boolean(row?.enabled && (eventId === undefined || row.event_cursor < eventId));

// The closest collection override wins. Broader subscriptions supply defaults
// for newly created descendants; explicit cancellations stop that branch.
export function subscribedToEntry(entry, graph, records, eventId) {
    if (entry.kind === 'moment') {
        const specific = records.get(subscriptionKey(entry.format === 'short' ? 'moment-short' : 'moment-article'));
        return eligible(specific || records.get(subscriptionKey('moment-all')), eventId);
    }
    const path = graph.path(entry);
    for (const node of path) {
        if (node.resource_kind !== 'collection') continue;
        const specific = records.get(subscriptionKey('collection', node.id));
        if (specific) return eligible(specific, eventId);
    }
    const rootCategory = records.get(subscriptionKey('resource-type', path.at(-1)?.resource_type_id));
    if (rootCategory) return eligible(rootCategory, eventId);
    return eligible(records.get(subscriptionKey('resource-all')), eventId);
}

export function subscriptionState(db, userId) {
    const graph = resourceGraph(db);
    const records = subscriptionMap(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId));
    const root = scope => eligible(records.get(subscriptionKey(scope)));
    return {
        resourceAll: root('resource-all'),
        resourceTypes: Object.fromEntries(db.prepare('SELECT id FROM resource_types').all().map(row => [row.id,
            eligible(records.get(subscriptionKey('resource-type', row.id)) || records.get(subscriptionKey('resource-all')))])),
        collections: Object.fromEntries(graph.rows.filter(row => row.resource_kind === 'collection' && graph.publicEntry(row))
            .map(row => [row.id, subscribedToEntry(row, graph, records)])),
        moments: { all: root('moment-all'), short: eligible(records.get(subscriptionKey('moment-short')) || records.get(subscriptionKey('moment-all'))),
            article: eligible(records.get(subscriptionKey('moment-article')) || records.get(subscriptionKey('moment-all'))) }
    };
}

function validateSubscription(db, graph, scope, targetId, enabled) {
    if (!SCOPES.includes(scope) || typeof enabled !== 'boolean') throw new Error('订阅设置无效');
    if (scope === 'resource-type' && !db.prepare('SELECT id FROM resource_types WHERE id = ?').get(targetId)) throw new Error('资源分类不存在');
    if (scope === 'collection') {
        const row = graph.nodes.get(targetId);
        if (row?.resource_kind !== 'collection' || !graph.publicEntry(row)) throw new Error('合集不存在');
    }
}

function writeSubscription(db, graph, cursor, userId, scope, targetId, enabled) {
    const write = (key, id = 0) => db.prepare(`INSERT INTO subscriptions (user_id, scope, target_id, enabled, event_cursor) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, scope, target_id) DO UPDATE SET enabled = excluded.enabled, event_cursor = excluded.event_cursor`)
        .run(userId, key, id, enabled ? 1 : 0, cursor);
    if (scope === 'resource-all') {
        db.prepare("DELETE FROM subscriptions WHERE user_id = ? AND scope IN ('resource-all', 'resource-type', 'collection')").run(userId);
        write(scope);
    } else if (scope === 'resource-type' || scope === 'collection') {
        const roots = scope === 'collection' ? [targetId] : graph.rows.filter(row => row.parent_id === null && row.resource_type_id === targetId).map(row => row.id);
        // Recursive inheritance supplies the default to every descendant.
        // Reset branch overrides when the user subscribes/cancels the whole
        // category or collection, including drafts and nested collections.
        const remove = db.prepare("DELETE FROM subscriptions WHERE user_id=? AND scope='collection' AND target_id=?");
        graph.branch(roots).filter(row => row.resource_kind === 'collection').forEach(row => remove.run(userId, row.id));
        write(scope, targetId);
    } else if (scope === 'moment-all') {
        db.prepare("DELETE FROM subscriptions WHERE user_id = ? AND scope IN ('moment-all', 'moment-short', 'moment-article')").run(userId);
        write(scope);
        if (enabled) { write('moment-short'); write('moment-article'); }
    } else write(scope);
}

export function setSubscriptions(db, userId, changes) {
    const graph = resourceGraph(db);
    changes.forEach(({ scope, targetId, enabled }) => validateSubscription(db, graph, scope, targetId, enabled));
    db.transaction(() => {
        const cursor = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM subscription_events').get().id;
        changes.forEach(({ scope, targetId, enabled }) => writeSubscription(db, graph, cursor, userId, scope, targetId, enabled));
    })();
    return subscriptionState(db, userId);
}

export function setSubscription(db, userId, scope, targetId, enabled) {
    return setSubscriptions(db, userId, [{ scope, targetId, enabled }]);
}
