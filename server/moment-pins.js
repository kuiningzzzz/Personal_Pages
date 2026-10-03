export function migrateMomentPins(db) {
    if (!db.prepare('PRAGMA table_info(entries)').all().some(column => column.name === 'pinned')) {
        db.exec('ALTER TABLE entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1))');
    }
    db.exec(`CREATE TRIGGER IF NOT EXISTS moment_pin_insert BEFORE INSERT ON entries WHEN NEW.pinned=1 BEGIN
        SELECT CASE WHEN NEW.kind<>'moment' OR NEW.status<>'published' THEN RAISE(ABORT,'仅已发布动态可以置顶') END;
        SELECT CASE WHEN (SELECT count(*) FROM entries WHERE kind='moment' AND pinned=1)>=5 THEN RAISE(ABORT,'最多置顶 5 条动态') END;
    END;
    CREATE TRIGGER IF NOT EXISTS moment_pin_update BEFORE UPDATE OF pinned ON entries WHEN NEW.pinned=1 BEGIN
        SELECT CASE WHEN NEW.kind<>'moment' OR NEW.status<>'published' THEN RAISE(ABORT,'仅已发布动态可以置顶') END;
        SELECT CASE WHEN (SELECT count(*) FROM entries WHERE kind='moment' AND pinned=1 AND id<>NEW.id)>=5 THEN RAISE(ABORT,'最多置顶 5 条动态') END;
    END;
    CREATE TRIGGER IF NOT EXISTS moment_pin_release AFTER UPDATE OF kind,status ON entries
    WHEN NEW.pinned=1 AND (NEW.kind<>'moment' OR NEW.status<>'published') BEGIN
        UPDATE entries SET pinned=0 WHERE id=NEW.id;
    END;`);
}

export function validateMomentPin(db, input, id = null) {
    if (input.pinned !== undefined && typeof input.pinned !== 'boolean') return { error: '置顶设置无效' };
    const requested = input.pinned ?? Boolean(id && db.prepare('SELECT pinned FROM entries WHERE id=?').get(id)?.pinned);
    if (input.kind === 'resource' || input.status === 'draft') return { pinned: 0 };
    if (requested && db.prepare("SELECT count(*) AS n FROM entries WHERE kind='moment' AND pinned=1 AND id<>?").get(id || 0).n >= 5) {
        return { error: '最多置顶 5 条动态，请先取消一条置顶', status: 409 };
    }
    return { pinned: requested ? 1 : 0 };
}

export function setMomentPin(db, id, enabled) {
    return db.transaction(() => {
        const row = db.prepare('SELECT id,kind,status FROM entries WHERE id=?').get(id);
        const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
        if (!row) fail('动态不存在', 404);
        if (row.kind !== 'moment') fail('只有动态支持此置顶设置');
        if (enabled && row.status !== 'published') fail('请先发布动态再置顶');
        const value = validateMomentPin(db, { ...row, pinned: enabled }, id);
        if (value.error) fail(value.error, value.status);
        // Pinning changes list placement, without making the content a new edit
        // or triggering publication notifications.
        db.prepare('UPDATE entries SET pinned=? WHERE id=?').run(value.pinned, id);
        return Boolean(value.pinned);
    })();
}

export function publicEntryComparator({ sort, search = false, pinnedFirst = false }) {
    return (a, b) => {
        if (!search && pinnedFirst && Boolean(a.pinned) !== Boolean(b.pinned)) return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        if (search && sort === 'relevance' && a.score !== b.score) return b.score - a.score;
        const field = sort === 'updated' ? 'updated_at' : 'published_at';
        return Date.parse(b[field]) - Date.parse(a[field]) || b.id - a.id;
    };
}
