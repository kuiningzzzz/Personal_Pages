const secretFields = /^(api.?key|authorization|password|secret|token|access.?token|base64)$/i;
// Keep useful tool payloads, never binary bodies, credentials or signed thinking.
export function safeDiagnostic(value, depth = 0) {
    if (depth > 12) return '[层级过深]';
    if (typeof value === 'string') return value.replaceAll(process.env.DEEPSEEK_API_KEY || '___NO_KEY___', '[redacted]');
    if (Array.isArray(value)) return value.map(item => safeDiagnostic(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretFields.test(key) || key === 'signature' || key === 'replayState' || (key === 'data' && typeof item === 'string' && /^[a-z\d+/=]{100,}$/i.test(item)) ? '[已隐藏]' : safeDiagnostic(item, depth + 1)]));
    return value;
}

export function describeSessionEvent(event) {
    const { type, data } = event;
    const names = {
        'turn/start': '开始对话轮次', 'turn/end': '对话轮次结束',
        'step/start': '开始模型请求', 'step/end': '模型与工具阶段结束',
        'request/context': '模型上下文配置', 'request/header': '模型请求配置',
        'assistant/message': '模型输出完成', 'assistant/attempt': '模型请求未完成',
        'system/message': '更新系统提示词', 'developer/message': '更新开发者指令',
        'user/message': '收到任务或继续执行指令'
    };
    if (type === 'tool/call') return { kind: 'tool-call', message: `调用工具：${data.name}`, data };
    if (type === 'tool/result') return { kind: data.message?.isError ? 'tool-error' : 'tool-result', message: data.message?.isError ? '工具执行失败' : '工具返回结果', data };
    if (type.startsWith('compaction/')) return { kind: 'compaction', message: `上下文压缩：${type}`, data };
    if (type === 'assistant/message' || type === 'assistant/attempt') {
        // Text/reasoning is streamed by the learning plugin; retain settlement facts here.
        return { kind: 'model', message: names[type], data: { turn: data.turn, step: data.step, usage: data.usage, interrupted: data.interrupted } };
    }
    if (type === 'request/header') return { kind: 'phase', message: names[type], data: { reason: data.reason, config: data.header?.config, tools: data.header?.tools?.map(tool => tool.name) } };
    if (type.startsWith('inbox/')) return null;
    return { kind: 'phase', message: names[type] || type, data };
}
