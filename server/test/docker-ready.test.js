import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { reachable } from '../activities/docker.js';
test('活动端口代理已打开但上游未启动时，不误报就绪', async t => {
    let ready = false;
    const server = createServer(socket => { if (!ready) socket.end(); });
    server.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => server.close());
    const port = server.address().port;
    assert.equal(await reachable('127.0.0.1', port), false);
    ready = true;
    assert.equal(await reachable('127.0.0.1', port), true);
});
