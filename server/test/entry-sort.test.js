import test from 'node:test';
import assert from 'node:assert/strict';
import { directorySort, rememberDirectorySort, normalizeEntrySort, sortedEntryLocation } from '../../src/lib/entry-sort.js';

test('每个目录记住自己的排序，合集首次继承入口排序，搜索不覆盖时间排序', t => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const stored = new Map();
    globalThis.window = { sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } };
    t.after(() => { if (original) Object.defineProperty(globalThis, 'window', original); else delete globalThis.window; });
    assert.equal(directorySort('resource', 100), 'latest');
    assert.equal(directorySort('resource', 100, 'oldest'), 'oldest');
    rememberDirectorySort('resource', 100, 'updated');
    assert.equal(directorySort('resource', '100', 'oldest'), 'updated');
    assert.equal(directorySort('resource', 101), 'latest');
    assert.equal(directorySort('moment'), 'latest');
    rememberDirectorySort('resource', 100, 'relevance');
    assert.equal(directorySort('resource', 100), 'updated');
    assert.equal(normalizeEntrySort('relevance', directorySort('resource', 100)), 'updated');
    window.sessionStorage.getItem = () => { throw new Error('storage disabled'); };
    assert.equal(directorySort('resource', 100), 'updated');
});

test('文章与合集链接携带排序，连续翻篇、刷新使用同一排序，非法参数回退最新发布', () => {
    const article = { id: 10, kind: 'resource', resource_kind: 'document' };
    assert.deepEqual(sortedEntryLocation(article, 'oldest'), { path: '/entry/10', query: { sort: 'oldest' } });
    assert.deepEqual(sortedEntryLocation({ ...article, id: 11 }, 'updated'), { path: '/entry/11', query: { sort: 'updated' } });
    assert.deepEqual(sortedEntryLocation({ ...article, resource_kind: 'collection' }, 'oldest'), { path: '/resource/collection/10', query: { sort: 'oldest' } });
    assert.equal(normalizeEntrySort('oldest'), 'oldest');
    assert.equal(normalizeEntrySort(['oldest']), 'latest');
    assert.equal(sortedEntryLocation(article, 'invalid').query.sort, 'latest');
});
