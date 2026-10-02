import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { expandAssistantStream } from '@deepseek-ai/dsh-llm';
import { LEARNING_PROMPT, MODEL } from './prompt.js';

let harness, server;
let sequence = 0;
const pending = new Map();
const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
const toolNames = new Map();
const send = value => { if (process.connected) process.send(value); };
const safeError = error => String(error?.message || error).replaceAll(process.env.DEEPSEEK_API_KEY || '___NO_KEY___', '[redacted]').slice(0, 3000);
const rpc = (method, args) => new Promise((resolve, reject) => {
    const requestId = ++sequence;
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('资料工具响应超时')); }, 120000);
    pending.set(requestId, { resolve, reject, timeout }); send({ type: 'rpc', method, args, requestId });
});

async function close() {
    for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error('任务已取消')); }
    pending.clear();
    await harness?.close();
    server?.closeAllConnections(); server?.close();
}
process.on('message', async message => {
    if (message.type === 'reply') {
        const request = pending.get(message.requestId);
        if (request) { pending.delete(message.requestId); clearTimeout(request.timeout); message.error ? request.reject(new Error(message.error)) : request.resolve(message.value); }
    } else if (message.type === 'cancel') {
        await close().catch(() => {}); process.exit(0);
    } else if (message.type === 'start') {
        try { await run(message); }
        catch (error) { send({ type: 'error', message: safeError(error) }); }
        finally { await close().catch(() => {}); process.exit(0); }
    }
});
process.on('disconnect', async () => { await close().catch(() => {}); process.exit(0); });

async function run({ task, workspace, directory, files }) {
    const token = randomBytes(32).toString('hex');
    server = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403); res.end('{"error":"Forbidden"}'); return; }
        try {
            const chunks = []; let length = 0;
            for await (const chunk of req) { length += chunk.length; if (length > 2 * 1024 * 1024) throw new Error('工具参数过大'); chunks.push(chunk); }
            const { method, args } = JSON.parse(Buffer.concat(chunks).toString());
            const value = await rpc(method, args); res.end(JSON.stringify({ value }));
        } catch (error) { res.end(JSON.stringify({ error: safeError(error) })); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await mkdir(workspace, { recursive: true });
    const patchPath = join(workspace, 'learning.patch.json');
    const patches = [
        ...['session-log-deepseek','session-telemetry-otel','plugin-package-inventory-deepseek','tool-bash','tool-pwsh','tool-fs','tool-fs-search','tool-skill','agent-instructions','skill-filesystem','tool-subagent','tool-subagent-fork','tool-workflow','tool-ralph','tool-goal','goal-round-driver'].map(id => ({ id, disabled: true })),
        { id: 'system-prompt', config: { personaPrefix: '', personaSuffix: '', includeHarnessIdentity: false, includeRuntimeContext: false } },
        { id: 'agent-loop', config: { maxParallelToolCalls: 1, agents: [] } },
        { id: 'tools', config: { mode: 'native' } },
        { id: 'llm-deepseek', config: { apiKeyEnv: 'DEEPSEEK_API_KEY', streamIdleTimeoutMs: 120000 } },
        { id: 'compaction-basic', config: { thresholdRatio: 0.65, summarizationProvider: 'deepseek-official', summarizationModel: MODEL, maxTokens: 4096 } },
        { id: 'web-search-deepseek', config: { apiKeyEnv: 'DEEPSEEK_API_KEY', model: MODEL, maxUses: 3, maxTokens: 4096 } },
        { insert: [{ id: 'learning', name: new URL('./harness-plugin.js', import.meta.url).href }] }
    ];
    await writeFile(patchPath, JSON.stringify(patches));
    const system = LEARNING_PROMPT + (task.settings.reportInstructions ? '\n\n管理员附加的报告要求：\n' + task.settings.reportInstructions : '');
    harness = new DeepSeekHarness({ profile: 'sdk', model: MODEL, provider: 'deepseek-official', maxTokens: task.settings.maxOutputTokens,
        patches: [patchPath], dshHome: join(workspace, 'harness'), processCwd: workspace, cwd: workspace, initializeTimeoutMs: 60000,
        env: { ...process.env, DSH_TELEMETRY_DISABLED: '1', LEARNING_BRIDGE: `http://127.0.0.1:${server.address().port}/`, LEARNING_TOKEN: token, LEARNING_SYSTEM_PROMPT: system } });
    const prompt = `任务：${task.title}\n学习要求：${task.prompt || '学习提供的资料并生成详细学习报告。'}\n资料链接：${JSON.stringify(task.links)}\n本地资料：${JSON.stringify(files)}\n目标合集完整目录（含草稿）：${JSON.stringify(directory)}\n${task.draft.body ? '已有未完成草稿，可用 read_document 读取并继续改进。' : ''}`;
    // run() creates a durable session. The task ID remains stable on retry, so
    // each attempt needs a fresh ID; existing drafts are available via tools.
    const sessionId = `learning-${task.id}-${randomUUID()}`;
    send({ type: 'event', kind: 'session', message: '启动新的学习会话，保留任务资料和草稿', data: { sessionId } });
    const result = await harness.run(prompt, { sessionId, onNotification(notification) {
        const event = notification.params?.event;
        if (notification.method !== 'session.event' || !event) return;
        if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
            let text = '';
            try {
                for (const { chunk } of expandAssistantStream(event.data.stream)) {
                    if (chunk.type === 'text-delta') text += chunk.text;
                    if (chunk.type === 'usage') { usage.calls++; usage.inputTokens += (chunk.usage.inputTokens || 0) + (chunk.usage.cacheReadTokens || 0) + (chunk.usage.cacheWriteTokens || 0); usage.outputTokens += chunk.usage.outputTokens || 0; }
                }
            } catch { /* Partial failed stream: keep other task events. */ }
            if (text) send({ type: 'event', kind: 'assistant', message: text.slice(0, 12000) });
            send({ type: 'usage', usage });
        } else if (event.type === 'tool/call') {
            toolNames.set(event.data.callId, event.data.name);
            if (['web_search','web_fetch'].includes(event.data.name)) send({ type: 'event', kind: 'tool', message: event.data.name, data: { arguments: event.data.arguments } });
        } else if (event.type === 'tool/result') {
            const result = event.data.message || event.data;
            send({ type: 'event', kind: result.isError ? 'tool-error' : 'tool-result', message: `${toolNames.get(result.callId) || '工具'}：${result.isError ? JSON.stringify(result.content).slice(0, 1200) : '执行完成'}` });
        } else if (event.type.startsWith('compaction/')) send({ type: 'event', kind: 'compaction', message: 'Harness 已执行上下文压缩' });
    } });
    const ending = result.events.findLast(event => event.type === 'turn/end');
    if (ending?.data.reason?.kind === 'error') throw new Error(JSON.stringify(ending.data.reason));
}
