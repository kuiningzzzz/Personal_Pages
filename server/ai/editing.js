export function targetDocument(db, id) {
    const row = db.prepare("SELECT * FROM entries WHERE id=? AND kind='resource' AND resource_kind='document'").get(Number(id) || 0);
    if (!row) throw new Error('待修改文档不存在、已删除或不再是文档类型');
    return row;
}

export const documentDraft = row => ({ title: row.title, summary: row.summary, body: row.body,
    tags: JSON.parse(row.tags), actions: JSON.parse(row.actions), cover_image: row.cover_image });

// Ignore unrelated activity such as comments; compare the editable document and its location.
export const documentSnapshot = row => JSON.stringify(Object.fromEntries([
    'title', 'summary', 'body', 'tags', 'actions', 'cover_image', 'parent_id', 'resource_type_id',
    'status', 'published_at', 'created_at',
].map(key => [key, row[key]])));

export function captureModification(db, task) {
    const row = targetDocument(db, task.target_entry_id);
    if ((row.parent_id || 0) !== task.collection_id) throw new Error('待修改文档已移动，请重新选择文档创建任务');
    db.prepare('UPDATE ai_tasks SET draft=?,target_snapshot=? WHERE id=?').run(JSON.stringify(documentDraft(row)), documentSnapshot(row), task.id);
}

export function assertUnchanged(db, task) {
    const row = targetDocument(db, task.target_entry_id);
    if (documentSnapshot(row) !== task.target_snapshot) throw new Error('原文档在任务运行期间已被修改，未覆盖原文。请检查已保存的结果，再重新发起修改任务');
    return row;
}

export function updateDocument(db, task, draft, body) {
    assertUnchanged(db, task);
    db.prepare(`UPDATE entries SET title=?,summary=?,body=?,tags=?,actions=?,cover_image=?,updated_at=? WHERE id=?`)
        .run(draft.title, draft.summary || '', body, JSON.stringify(draft.tags || []), JSON.stringify(draft.actions || []),
            draft.cover_image || '', new Date().toISOString(), task.target_entry_id);
    return task.target_entry_id;
}
