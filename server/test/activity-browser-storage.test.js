import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { activityBrowserStorage } from '../../src/lib/activity-browser-storage.js';
function storage() {
  const map = new Map(); return { get length() { return map.size; }, key: index => [...map.keys()][index], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}
test('SDK 保留存储冲突状态码，前端可按 409 重新读取并重试', async () => {
  let listener;
  const parent = { postMessage() {} }, port = { start() {}, postMessage(data) { queueMicrotask(() => port.onmessage({ data: { id: data.id, error: '版本冲突', status: 409 } })); } };
  const window = { parent, addEventListener(type, fn) { if (type === 'message') listener = fn; } };
  vm.runInNewContext(await readFile(new URL('../activities/sdk.js', import.meta.url), 'utf8'), { window, setTimeout, clearTimeout, console, Headers, Response, Blob, FormData, URLSearchParams });
  listener({ source: parent, data: { type: 'PP_ACTIVITY_CONNECT', runtime: {}, theme: 'light' }, ports: [port] });
  await assert.rejects(window.ActivitySDK.sharedStorage.set('score', { wins: 1 }, null), { status: 409, message: '版本冲突' });
});
test('浏览器活动存档按活动隔离，不覆盖主站键，验证键名与容量', () => {
  const data = storage(); data.setItem('theme', 'dark');
  const write = (id, key, value) => activityBrowserStorage(data, id, 'set', key, value);
  write(1, 'progress', { attempts: 3 }); write(2, 'progress', { attempts: 7 });
  assert.deepEqual(activityBrowserStorage(data, 1, 'get', 'progress'), { attempts: 3 });
  assert.equal(data.getItem('theme'), 'dark'); assert.equal(activityBrowserStorage(data, 3, 'get', 'progress'), null);
  for (const key of ['../theme', '', 'x:y', 'a'.repeat(81)]) assert.throws(() => write(1, key, {}), /标识/);
  assert.throws(() => write('1', 'progress', {}), /标识/); assert.throws(() => write(1, 'large', 'a'.repeat(512 * 1024)), /512KB/);
  for (let i = 0; i < 31; i++) write(1, `key-${i}`, {});
  assert.throws(() => write(1, 'too-many', {}), /32/); write(1, 'progress', { attempts: 9 });
  activityBrowserStorage(data, 1, 'remove', 'progress'); assert.equal(activityBrowserStorage(data, 1, 'get', 'progress'), null);
});
test('SDK browserStorage 通过已有 MessageChannel 请求，不调用服务端存储接口；重复握手可去重', async () => {
  let listener, load; const hellos = [], messages = [], port = { start() {}, postMessage(data) { messages.push(data); queueMicrotask(() => port.onmessage({ data: { id: data.id, data: data.method.endsWith('get') ? { attempts: 4 } : true } })); } };
  const parent = { postMessage(data) { hellos.push(data); } }, window = { parent, addEventListener(type, fn) { if (type === 'message') listener = fn; if (type === 'load') load = fn; } };
  vm.runInNewContext(await readFile(new URL('../activities/sdk.js', import.meta.url), 'utf8'), { window, setTimeout, clearTimeout, console, Headers, Response, Blob, FormData, URLSearchParams });
  load(); assert.equal(hellos.length, 2); assert.ok(hellos[0].connectionId); assert.equal(hellos[0].connectionId, hellos[1].connectionId);
  listener({ source: parent, data: { type: 'PP_ACTIVITY_CONNECT', runtime: {}, theme: 'light' }, ports: [port] });
  await window.ActivitySDK.ready;
  load(); assert.equal(hellos.length, 2, '连接完成后不再发起握手');
  assert.equal(await window.ActivitySDK.browserStorage.set('progress', { attempts: 4 }), true);
  assert.equal((await window.ActivitySDK.browserStorage.get('progress')).attempts, 4);
  await window.ActivitySDK.browserStorage.remove('progress');
  assert.deepEqual(messages.map(message => message.method), ['browserStorage.set', 'browserStorage.get', 'browserStorage.remove']);
  await window.ActivitySDK.storage.read('progress');
  await window.ActivitySDK.storage.compareAndSet('progress', 'revision-1', { attempts: 5 });
  await window.ActivitySDK.sharedStorage.get('board');
  await window.ActivitySDK.sharedStorage.list({ prefix: 'score-', limit: 30 });
  await window.ActivitySDK.sharedStorage.set('board', { wins: 1 }, null);
  await window.ActivitySDK.sharedStorage.remove('board', 'revision-2');
  assert.deepEqual(messages.slice(3).map(message => message.method), ['storage.read', 'storage.compareAndSet', 'sharedStorage.get', 'sharedStorage.list', 'sharedStorage.set', 'sharedStorage.remove']);
  assert.equal(messages[4].args.revision, 'revision-1'); assert.equal(messages[7].args.revision, null);
});
