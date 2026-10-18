import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { expandAssistantStream } from '@deepseek-ai/dsh-llm';
import { LEARNING_PROMPT, MODIFICATION_PROMPT, taskInstructions, MODEL } from './prompt.js';
import { describeSessionEvent, safeDiagnostic } from './diagnostics.js';
import { reportFile } from './workspace.js';

let harness, server;
let sequence = 0;
const pending = new Map();
const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
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

async function run({ task, workspace, directory, files, conversation }) {
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
    await mkdir(conversation.home, { recursive: true });
    const patchPath = join(conversation.home, 'learning.patch.json');
    const outputFile = reportFile(task.id);
    await mkdir(join(workspace, 'reports'), { recursive: true });
    if (typeof task.draft.body === 'string') await writeFile(join(workspace, outputFile), task.draft.body);
    const patches = [
        ...['session-log-deepseek','session-telemetry-otel','plugin-package-inventory-deepseek','tool-bash','tool-pwsh','tool-skill','agent-instructions','skill-filesystem','tool-subagent','tool-subagent-fork','tool-workflow','tool-ralph','tool-goal','goal-round-driver'].map(id => ({ id, disabled: true })),
        { id: 'agent-loop', config: { maxParallelToolCalls: 1, agents: [] } },
        { id: 'tools', config: { mode: 'native' } },
        { id: 'sdk-jsonrpc-server', disabled: true },
        { id: 'llm-deepseek', config: { apiKeyEnv: 'DEEPSEEK_API_KEY', streamIdleTimeoutMs: 120000 } },
        { id: 'compaction-basic', config: { thresholdRatio: 0.65, summarizationProvider: 'deepseek-official', summarizationModel: MODEL } },
        { id: 'web-search-deepseek', config: { apiKeyEnv: 'DEEPSEEK_API_KEY', model: MODEL } },
        { insert: [{ id: 'learning', name: new URL('./harness-plugin.js', import.meta.url).href },
            { id: 'learning-sdk', name: new URL('./learning-sdk.js', import.meta.url).href }] }
    ];
    await writeFile(patchPath, JSON.stringify(patches));
    const system = (task.mode === 'modify' ? MODIFICATION_PROMPT : LEARNING_PROMPT) + (task.settings.reportInstructions ? '\n\n管理员附加的报告要求：\n' + task.settings.reportInstructions : '');
    harness = new DeepSeekHarness({ profile: 'sdk', model: MODEL, provider: 'deepseek-official',
        patches: [patchPath], dshHome: conversation.home, processCwd: workspace, cwd: workspace, initializeTimeoutMs: 60000,
        env: { ...process.env, DSH_TELEMETRY_DISABLED: '1', LEARNING_MODE: task.mode || 'create', LEARNING_BRIDGE: `http://127.0.0.1:${server.address().port}/`, LEARNING_TOKEN: token, LEARNING_SYSTEM_PROMPT: system, LEARNING_SESSION_ID: conversation.sessionId, LEARNING_PREVIOUS_SESSION_ID: conversation.previousSessionId || '', LEARNING_WORKSPACE: workspace, LEARNING_REPORT_FILE: outputFile } });
    const prompt = taskInstructions(task, workspace, files, directory, outputFile);
    const sessionId = conversation.sessionId;
    send({ type: 'event', kind: 'session', message: '打开合集持久会话与共享工作区：接续已有对话和文件', data: { sessionId, collectionId: task.collection_id, workspace, reportFile: outputFile } });
    const result = await harness.run(prompt, { sessionId, onNotification(notification) {
        const event = notification.params?.event;
        if (notification.method !== 'session.event' || !event) return;
        if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
            try {
                for (const { chunk } of expandAssistantStream(event.data.stream)) {
                    if (chunk.type === 'usage') { usage.calls++; usage.inputTokens += (chunk.usage.inputTokens || 0) + (chunk.usage.cacheReadTokens || 0) + (chunk.usage.cacheWriteTokens || 0); usage.outputTokens += chunk.usage.outputTokens || 0; }
                }
            } catch { /* Partial failed stream: keep other task events. */ }
            send({ type: 'usage', usage });
        }
        const described = describeSessionEvent(event);
        if (described) send({ type: 'event', ...safeDiagnostic(described) });
    } });
    const ending = result.events.findLast(event => event.type === 'turn/end');
    if (ending?.data.reason?.kind === 'error') throw new Error(JSON.stringify(ending.data.reason));
}
