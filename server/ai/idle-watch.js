import { expandAssistantStream } from '@deepseek-ai/dsh-llm';

export const IDLE_REMINDER = '你已经连续 3 次迭代没有输出任何内容，也没有调用任何工具。请立即检查本任务的报告：如果已完成，调用 submit_document 提交任务；尚未保存时先调用原生 write/edit 保存当前任务的 Markdown 报告，再提交。不要继续空转，也不要将上一任务的报告重复提交。确有未完成的学习工作时，请调用资料工具继续。';

// Count completed steps, not failed attempts or individual stream chunks.
export function createIdleWatch() {
    let streak = 0, output = false, tool = false, pending = false;
    return {
        observe(event) {
            if (event.type === 'step/start') { output = false; tool = false; }
            if (event.type === 'tool/call') tool = true;
            if (event.type === 'assistant/message') {
                for (const { chunk } of expandAssistantStream(event.data.stream || [])) {
                    if (['text-delta', 'reasoning-delta'].includes(chunk.type) && chunk.text.trim()) output = true;
                    if (chunk.type === 'tool-call-delta') tool = true;
                }
                if (event.data.message?.content?.some(block => ['text', 'reasoning'].includes(block.type) ? String(block.text || '').trim() : true)) output = true;
            }
            if (event.type === 'step/end') {
                streak = output || tool ? 0 : streak + 1;
                if (streak === 3) { pending = true; streak = 0; }
            }
        },
        takeReminder() { if (!pending) return ''; pending = false; return IDLE_REMINDER; }
    };
}
