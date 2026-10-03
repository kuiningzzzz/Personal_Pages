import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleWatch } from '../ai/idle-watch.js';
import { safeDiagnostic, describeSessionEvent } from '../ai/diagnostics.js';

function step(watch, content = []) {
    watch.observe({ type: 'step/start' });
    watch.observe({ type: 'assistant/message', data: { content, message: { content }, stream: [] } });
    if (content.some(item => item.type === 'tool-call')) watch.observe({ type: 'tool/call' });
    watch.observe({ type: 'step/end' });
}
test('空转只统计完整迭代，有输出或工具调用会重置，提醒只消费一次', () => {
    const watch = createIdleWatch();
    step(watch); step(watch);
    assert.equal(watch.takeReminder(), '');
    step(watch, [{ type: 'text', text: '仍在学习' }]);
    step(watch); step(watch);
    assert.equal(watch.takeReminder(), '');
    step(watch, [{ type: 'tool-call' }]);
    step(watch); step(watch);
    step(watch, [{ type: 'reasoning', text: '检查资料' }]);
    step(watch); step(watch); step(watch);
    assert.match(watch.takeReminder(), /连续 3 次.*submit_document/);
    assert.equal(watch.takeReminder(), '');
    watch.observe({ type: 'assistant/attempt', data: { stream: [] } });
    assert.equal(watch.takeReminder(), '');
});
test('日志保留阶段与工具数据，隐藏密钥、二进制和签名，保留 token 统计', () => {
    const described = describeSessionEvent({ type: 'tool/result', data: { message: { content: [{ type: 'text', text: '资料摘要' }] },
        secret: 'private', base64: 'binary', data: 'A'.repeat(200), signature: 'signed', usage: { inputTokens: 15, outputTokens: 20 } } });
    const safe = safeDiagnostic(described);
    assert.equal(safe.data.message.content[0].text, '资料摘要');
    for (const key of ['secret', 'base64', 'data', 'signature']) assert.equal(safe.data[key], '[已隐藏]');
    assert.deepEqual(safe.data.usage, { inputTokens: 15, outputTokens: 20 });
    assert.equal(describeSessionEvent({ type: 'compaction/end', data: { result: '压缩摘要' } }).data.result, '压缩摘要');
});
