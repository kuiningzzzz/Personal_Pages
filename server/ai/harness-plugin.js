import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { BUDGET_INCREMENT, MAX_BUDGET } from './budget.js';
import { createIdleWatch } from './idle-watch.js';

export const name = 'personal-pages-learning';
export const inject = ['tools', 'agents', 'systemPrompt', 'attachments'];
const string = (description, required = true) => ({ type: 'string', description, ...(required ? { required: true } : {}) });
const number = (description, required = false) => ({ type: 'integer', description, ...(required ? { required: true } : {}) });

export function apply(ctx) {
    let finished = false;
    const idleWatch = createIdleWatch();
    const bridge = async (method, args = {}, signal) => {
        const response = await fetch(process.env.LEARNING_BRIDGE, { method: 'POST', signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LEARNING_TOKEN}` }, body: JSON.stringify({ method, args }) });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        return result.value;
    };
    let logTimer, logTail = Promise.resolve();
    const logs = [], attempts = new Map();
    function flushLogs() {
        clearTimeout(logTimer); logTimer = null;
        while (logs.length) {
            const events = logs.splice(0, 100);
            // Diagnostics must never interrupt the learning loop.
            logTail = logTail.then(() => bridge('log_events', { events })).catch(() => {});
        }
        return logTail;
    }
    function log(kind, message, data = {}) {
        const last = logs.at(-1);
        if (last?.kind === kind && last.data.attemptId === data.attemptId && last.message.length + message.length < 16000) last.message += message;
        else logs.push({ kind, message, data });
        logTimer ??= setTimeout(flushLogs, 250);
    }
    ctx.on('agent/assistant-stream', ({ frame }) => {
        if (frame.type === 'start') attempts.set(frame.attemptId, { attemptId: frame.attemptId, turn: frame.turn, step: frame.step });
        else if (frame.type === 'chunk') {
            const chunk = frame.chunk;
            if (['text-delta', 'reasoning-delta'].includes(chunk.type) && chunk.text)
                log(chunk.type === 'text-delta' ? 'assistant' : 'reasoning', chunk.text, attempts.get(frame.attemptId));
            if (chunk.type === 'finish') log('model-finish', `模型请求结束：${typeof chunk.reason === 'string' ? chunk.reason : JSON.stringify(chunk.reason)}`, attempts.get(frame.attemptId));
        } else if (frame.type === 'end') { attempts.delete(frame.attemptId); void flushLogs(); }
    });
    ctx.on('session/event', (_session, event) => idleWatch.observe(event));
    ctx.on('agent/request', async (_request, next) => ({ ...await next(), maxTokens: Number(process.env.LEARNING_MAX_OUTPUT_TOKENS) }));
    ctx.on('agent/request-error', async ({ failure }, next) => {
        log('model-error', '模型请求失败，交由 Harness 判断是否重试', { failure });
        await flushLogs();
        return next();
    });
    const specs = [
        ['list_collection', '列出目标合集、所有子合集和草稿的目录。', {}],
        ['search_collection', '在目标合集及全部子合集中搜索标题、标签与正文，包含草稿。', { query: string('搜索文字') }],
        ['read_resource', '读取目录中指定资源，含正文、按钮和图集图片。长文可指定 offset。', { id: number('目录中的资源 ID', true), offset: number('正文字符偏移') }],
        ['read_source', '读取本地源资料：PDF 返回页数及分页文本，其他支持的文本返回内容。', { url: string('资料的本地 URL'), page: number('PDF 起始页码，从 1 开始'), count: number('PDF 页数，最多 5 页'), offset: number('文本字符偏移') }],
        ['view_image', '直接查看目标合集或任务资料中的图片，返回图片本身。', { url: string('本地图片 URL') }],
        ['view_pdf_page', '将指定 PDF 页渲染为图片直接查看，返回可以插入报告的本地图片 URL。', { url: string('本地 PDF URL'), page: number('页码，从 1 开始', true) }],
        ['import_asset', '下载公网 PDF、图片或纯文本，保存为可引用的本地文件。', { url: string('公网 HTTP(S) URL'), name: string('显示名称', false) }],
        ['write_document', '保存或替换学习报告草稿；不发布。请提供详细讲解和内容总结。', { title: string('报告标题'), body: string('完整 Markdown 正文'), summary: string('简短摘要', false), tags: { type: 'array', items: { type: 'string' } },
            actions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: string('按钮文字'), url: string('按钮链接') } } } }],
        ['read_document', '读取已保存的报告草稿，供检查和修改。', {}],
        ['extend_budget', `增加 ${BUDGET_INCREMENT} 次主模型迭代，总预算最多 ${MAX_BUDGET} 次。`, {}],
        ['submit_document', '提交已保存的学习报告，公开发布到固定目的地；成功后立即结束任务。', {}]
    ];
    for (const [toolName, description, parameters] of specs) {
        ctx.tools.register(defineTool({ name: toolName, description, parameters,
            output: { schema: { type: 'json' }, render: (_args, value) => {
                if (value.image) return [{ type: 'text', text: JSON.stringify({ url: value.url, name: value.name }) }, { type: 'image', attachment: value.image }];
                return [{ type: 'text', text: JSON.stringify(value) }];
            } },
            async execute(args, exec) {
                await flushLogs();
                const result = await bridge(toolName, args, exec.signal);
                if (['view_image', 'view_pdf_page'].includes(toolName)) {
                    const image = await ctx.attachments.saveImage({ data: Buffer.from(result.base64, 'base64'), mediaType: result.mimeType, name: result.name });
                    return { url: result.url, name: result.name, image };
                }
                if (toolName === 'submit_document' && result.submitted) { finished = true; exec.concludeTurn(); }
                return result;
            }
        }));
    }
    const allowed = [...specs.map(spec => spec[0]), 'web_search', 'web_fetch'];
    ctx.on('agent/created', ({ agent }) => {
        agent.ctx.tools.restrict({ allow: allowed });
        agent.ctx.tools.guard(() => finished ? '报告已提交，任务结束' : undefined);
        agent.ctx.systemPrompt.section({ name: 'learning:system', order: 0, complete: true, interpolate: false, text: process.env.LEARNING_SYSTEM_PROMPT });
    });
    ctx.on('agent/pre-step', async ({ signal }, next) => {
        const decision = await next();
        if (finished || decision.kind !== 'enter') return decision;
        const idleReminder = idleWatch.takeReminder();
        if (idleReminder) log('idle-warning', '连续 3 次迭代空输出且没有工具调用，注入提交任务提醒');
        await flushLogs();
        const state = await bridge('step', {}, signal);
        if (state.stop) { finished = true; return { kind: 'reject' }; }
        const reminders = [idleReminder, state.reminder].filter(Boolean);
        if (reminders.length) return { ...decision, messages: [...decision.messages, ...reminders.map(text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: name, form: 'instructions' } }))] };
        return decision;
    });
    ctx.on('agent/turn-stopping', ({ agent }) => {
        if (!finished) agent.steer(createUserMessage({ content: [{ type: 'text', text: '你尚未成功调用 submit_document。继续学习和编写，完成后保存报告并调用提交工具；需要更多迭代时使用 extend_budget。' }], source: { kind: name, form: 'instructions' } }));
    });
}
