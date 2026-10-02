import test from 'node:test';
import assert from 'node:assert/strict';
import { followActiveOutline } from '../../src/lib/reading-outline.js';

test('目录将当前章节置于自身视窗中央，手动滚偏后同一章节仍可回正', () => {
    const calls = [];
    const nav = { scrollTop: 0, clientHeight: 200, scrollHeight: 1200, clientTop: 0,
        getBoundingClientRect: () => ({ top: 100 }),
        querySelector: () => ({ getBoundingClientRect: () => ({ top: 100 + 700 - nav.scrollTop, height: 30 }) }),
        scrollTo: options => { calls.push(options); nav.scrollTop = options.top; } };
    followActiveOutline(nav);
    assert.equal(nav.scrollTop, 615);
    assert.equal(calls[0].behavior, 'instant');
    followActiveOutline(nav); assert.equal(calls.length, 1, '已居中时不重复触发滚动');
    nav.scrollTop = 100; // A manual directory scroll doesn't run the follower.
    assert.equal(nav.scrollTop, 100);
    followActiveOutline(nav); assert.equal(nav.scrollTop, 615, '正文再次滚动后恢复，章节不必改变');
});

test('目录首尾遵守滚动边界，隐藏或无目录时不移动页面', () => {
    const calls = [];
    let itemTop = 0;
    const nav = { scrollTop: 400, clientHeight: 200, scrollHeight: 1000,
        getBoundingClientRect: () => ({ top: 0 }),
        querySelector: () => ({ getBoundingClientRect: () => ({ top: itemTop - nav.scrollTop, height: 20 }) }),
        scrollTo: options => { calls.push(options); nav.scrollTop = options.top; } };
    followActiveOutline(nav); assert.equal(nav.scrollTop, 0);
    itemTop = 980; followActiveOutline(nav); assert.equal(nav.scrollTop, 800);
    nav.clientHeight = 0; followActiveOutline(nav); assert.equal(calls.length, 2);
    followActiveOutline(null);
    nav.querySelector = () => null; followActiveOutline(nav); assert.equal(calls.length, 2);
});
