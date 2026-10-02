import test from 'node:test';
import assert from 'node:assert/strict';
import { adminListing } from '../../src/lib/admin-list.js';
import { paginationItems } from '../../src/lib/pagination.js';

const row = (id, parent_id = null, extra = {}) => ({ id, parent_id, title: `内容 ${id}`, body: '', tags: [],
    resource_kind: 'document', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', ...extra });

test('后台分页只计根项目，各层默认三个直接成员，展开操作互不影响', () => {
    const roots = Array.from({ length: 16 }, (_, i) => row(i + 1));
    roots[0] = row(1, null, { resource_kind: 'collection', updated_at: '2025-01-01T00:00:00Z' });
    const children = [101, 102, 103, 104].map(id => row(id, 1, { resource_kind: 'collection' }));
    const grandchildren = [201, 202, 203, 204].map(id => row(id, 104));
    const entries = [...roots, ...children, ...grandchildren];
    const options = { kind: 'resource' };
    const initial = adminListing(entries, options);
    assert.equal(initial.total, 16);
    assert.equal(initial.totalPages, 2);
    assert.equal(initial.rows.filter(r => !r.fold && r.depth === 0).length, 15);
    assert.deepEqual(initial.rows.filter(r => !r.fold && r.depth === 1).map(r => r.id), [104, 103, 102]);
    assert.deepEqual(initial.rows.filter(r => !r.fold && r.depth === 2).map(r => r.id), [204, 203, 202]);
    assert.deepEqual(initial.rows.filter(r => r.fold).map(r => [r.id, r.hidden]), [[104, 1], [1, 1]]);
    const expanded = adminListing(entries, { ...options, expanded: new Set([1]) });
    assert.equal(expanded.rows.filter(r => !r.fold && r.depth === 1).length, 4);
    assert.equal(expanded.rows.filter(r => !r.fold && r.depth === 2).length, 3);
    const page2 = adminListing(entries, { ...options, page: 2, expanded: new Set([1, 104]) });
    assert.deepEqual(page2.rows.map(r => r.id), [2]);
});

test('创建／修改排序分别排序根和兄弟，不将子内容提升到根层', () => {
    const entries = [row(1, null, { resource_kind: 'collection', created_at: '2023-01-01', updated_at: '2026-01-01' }),
        row(2, null, { created_at: '2024-01-01', updated_at: '2025-01-01' }),
        row(3, 1, { created_at: '2023-01-01', updated_at: '2027-01-01' }),
        row(4, 1, { created_at: '2024-01-01', updated_at: '2026-01-01' })];
    assert.deepEqual(adminListing(entries, { kind: 'resource', sort: 'updated' }).rows.map(r => r.id), [1, 3, 4, 2]);
    assert.deepEqual(adminListing(entries, { kind: 'resource', sort: 'created' }).rows.map(r => r.id), [2, 1, 4, 3]);
    assert.deepEqual(entries.map(r => r.id), [1, 2, 3, 4], '不改变编辑器的完整数据');
});

test('搜索深层标题、标签和正文，保留祖先并显示原本在折叠范围外的草稿', () => {
    const entries = [row(1, null, { resource_kind: 'collection' }), ...[10, 11, 12, 13].map(id => row(id, 1)),
        row(14, 10, { title: 'PDF 学习', tags: ['课程'], body: '索引结构', status: 'draft' }), row(2)];
    const found = adminListing(entries, { kind: 'resource', query: 'pdf 课程 索引', page: 9 });
    assert.equal(found.total, 1);
    assert.equal(found.page, 1);
    assert.deepEqual(found.rows.map(r => [r.id, r.depth]), [[1, 0], [10, 1], [14, 2]]);
    assert.equal(adminListing(entries, { kind: 'resource', query: '不存在' }).rows.length, 0);
});

test('动态搜索及分页包含长文与短帖，删除末页内容后页数安全回退', () => {
    const entries = Array.from({ length: 16 }, (_, i) => row(i + 1, null, { format: i % 2 ? 'short' : 'article', tags: ['生活'] }));
    assert.equal(adminListing(entries, { kind: 'moment', query: '生活' }).rows.length, 15);
    assert.deepEqual(adminListing(entries, { kind: 'moment', page: 2 }).rows.map(r => r.id), [1]);
    const removed = adminListing(entries.slice(1), { kind: 'moment', page: 2 });
    assert.equal(removed.page, 1);
    assert.equal(removed.rows.length, 15);
});

test('数字分页包含两端、当前页及相邻页，省略大段页码但保留单页间隙', () => {
    assert.deepEqual(paginationItems(1, 1), [1]);
    assert.deepEqual(paginationItems(1, 9), [1, 2, 3, 4, 'gap-4', 9]);
    assert.deepEqual(paginationItems(5, 9), [1, 'gap-1', 4, 5, 6, 'gap-6', 9]);
    assert.deepEqual(paginationItems(9, 9), [1, 'gap-1', 6, 7, 8, 9]);
    assert.deepEqual(paginationItems(3, 6), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(paginationItems(9000, 9), paginationItems(9, 9));
});
