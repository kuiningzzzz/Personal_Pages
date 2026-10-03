import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, createMemoryHistory } from 'vue-router';
import { computed, watch, nextTick } from 'vue';
import { navigationPath, readingNavigation } from '../../src/lib/navigation.js';

test('文章按实际栏目选中导航，合集与图集保留资源库选中，管理及账号不选中主导航', () => {
    assert.equal(navigationPath('/entry/12', { id: 12, kind: 'moment' }), '/moments');
    assert.equal(navigationPath('/entry/12', { id: 12, kind: 'resource' }), '/resource');
    assert.equal(navigationPath('/entry/13', { id: 12, kind: 'resource' }), null);
    assert.equal(navigationPath('/resource/collection/12'), '/resource');
    assert.equal(navigationPath('/resource/gallery/12'), '/resource');
    assert.equal(navigationPath('/moments'), '/moments');
    assert.equal(navigationPath('/activities'), '/activities');
    assert.equal(navigationPath('/'), '/');
    for (const path of ['/admin', '/account', '/login', '/register', '/entry/12', '/resource-other']) assert.equal(navigationPath(path, null), null);
});

test('列表到阅读器保持选中，直接访问及跨文章跳转根据异步数据更新，不沿用错误的文章身份', async () => {
    const component = {};
    const router = createRouter({ history: createMemoryHistory(), routes: ['/moments', '/resource', '/entry/:id', '/admin'].map(path => ({ path, component })) });
    const route = router.currentRoute;
    let pendingSection = null;
    const stop = watch(() => route.value.path, (_next, previous) => { pendingSection = navigationPath(previous, readingNavigation.value); }, { flush: 'sync' });
    const active = computed(() => navigationPath(route.value.path, readingNavigation.value) || (route.value.path.startsWith('/entry/') ? pendingSection : null));
    try {
        readingNavigation.value = null;
        await router.push('/moments');
        await router.push('/entry/1');
        assert.equal(active.value, '/moments', '等待正文时保留列表选中');
        readingNavigation.value = { id: 1, kind: 'moment' }; await nextTick();
        assert.equal(active.value, '/moments');
        await router.push('/entry/2');
        readingNavigation.value = { id: 2, kind: 'resource' }; await nextTick();
        assert.equal(active.value, '/resource', '异步类型改变会更新高亮与滑块');
        await router.push('/admin');
        assert.equal(active.value, null);
        await router.push('/entry/3');
        assert.equal(active.value, null, '未加载的新文章不能使用旧文章类型');
        readingNavigation.value = { id: 3, kind: 'moment' }; await nextTick();
        assert.equal(active.value, '/moments', '直接访问无需先打开列表页');
    } finally { stop(); readingNavigation.value = null; }
});
