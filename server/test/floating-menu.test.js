import test from 'node:test';
import assert from 'node:assert/strict';
import { positionFloatingMenu } from '../../src/lib/floating-menu.js';

const viewport = { left: 0, top: 0, width: 1200, height: 800 };
const size = { width: 260, height: 320 };
test('页首向下展开，页底向上展开，完整面板留在视口内', () => {
    const top = positionFloatingMenu({ top: 100, bottom: 130, right: 900 }, size, viewport);
    assert.equal(top.side, 'bottom'); assert.equal(top.top, 138);
    const bottom = positionFloatingMenu({ top: 740, bottom: 770, right: 900 }, size, viewport);
    assert.equal(bottom.side, 'top'); assert.equal(bottom.top, 412);
    assert.ok(bottom.top + size.height <= 740);
});
test('两侧均放不下时选择空间更大的一侧并限制高度', () => {
    const position = positionFloatingMenu({ top: 140, bottom: 170, right: 200 }, size, { left: 0, top: 0, width: 375, height: 300 });
    assert.equal(position.side, 'top'); assert.equal(position.maxHeight, 120);
    assert.equal(position.top, 12);
});
test('窄屏与靠左/靠右按钮不会让浮窗越过屏幕边界', () => {
    const narrow = { left: 0, top: 0, width: 240, height: 640 };
    for (const right of [35, 240]) {
        const position = positionFloatingMenu({ top: 400, bottom: 430, right }, size, narrow);
        assert.equal(position.width, 216); assert.equal(position.left, 12);
    }
});
test('手机键盘或缩放带来的可视视口偏移也参与边界计算', () => {
    const visual = { left: 25, top: 180, width: 360, height: 260 };
    const position = positionFloatingMenu({ top: 470, bottom: 500, right: 390 }, size, visual);
    assert.ok(position.left >= 37 && position.left + position.width <= 373);
    assert.ok(position.top >= 192 && position.top + Math.min(size.height, position.maxHeight) <= 428);
});
