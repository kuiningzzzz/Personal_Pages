import { HarnessSdkJsonRpcServer } from '@deepseek-ai/dsh-sdk-jsonrpc-server';
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

export const name = 'learning-sdk';
export const inject = ['agents', 'sessionPersistence', 'sdkAppStartup'];

// The standard SDK only creates sessions across process restarts. Adapt its
// public prompt/shutdown boundaries to the native persistence/resume API;
// notification transport and request validation remain owned by dsh.
export class LearningSdkServer extends HarnessSdkJsonRpcServer {
    constructor(ctx, transport) { super(ctx, transport); this.learningContext = ctx; }
    async initialize(params) {
        const result = await super.initialize(params);
        this.route = { provider: params.provider, model: params.model, reasoningEffort: params.reasoningEffort };
        this.cwdForLearning = params.cwd;
        return result;
    }
    async prompt(params) {
        if (!this.route || this.closing) throw new Error('学习会话尚未初始化或已经关闭');
        if (params.sessionId !== process.env.LEARNING_SESSION_ID) throw new Error('学习会话 ID 不匹配');
        if (!Array.isArray(params.contentBlocks) || params.contentBlocks.some(block => block.type !== 'text' || typeof block.text !== 'string')) throw new Error('学习任务指令必须是文本');
        this.creation ??= (async () => {
            const ctx = this.learningContext, id = params.sessionId;
            const stored = await ctx.sessionPersistence.stat(id);
            // Clear pending steering before publication starts the driver.
            // Completed messages and compression remain on the same session.
            const setup = (_agentCtx, agent) => { agent.inbox.clear(); };
            let seed;
            const previousId = process.env.LEARNING_PREVIOUS_SESSION_ID;
            if (!stored && previousId && await ctx.sessionPersistence.stat(previousId)) {
                const previous = await ctx.sessionPersistence.open(previousId, 'read');
                try { seed = (await previous.read()).events; }
                finally { await previous.close(); }
            }
            const handle = stored
                ? await ctx.agents.resume({ resumeSessionId: id, agentOptions: this.route, setup })
                : await ctx.agents.create({ sessionId: id, meta: { cwd: this.cwdForLearning }, seed, agentOptions: this.route, setup });
            return handle;
        })();
        const handle = await this.creation;
        if (this.closing) throw new Error('学习会话已关闭');
        const message = createUserMessage({ content: params.contentBlocks, source: { kind: 'user' } });
        handle.agent.followup(message);
        return { messageId: message.id };
    }
    shutdown() {
        this.closeLearning ??= (async () => {
            this.closing = true;
            try { if (this.creation) await (await this.creation).dispose(); }
            finally { await super.shutdown(); }
            return {};
        })();
        return this.closeLearning;
    }
}

export function apply(ctx) {
    const transport = new JsonRpcLineTransport(process.stdin, process.stdout);
    const server = new LearningSdkServer(ctx, transport);
    let exitTask;
    transport.onRequest(async (method, params) => {
        if (method === 'initialize') await ctx.get('loader')?.await();
        const result = await server.handleRequest(method, params);
        if (method === 'shutdown') setImmediate(() => {
            exitTask ??= (async () => {
                await transport.flush();
                await ctx.root.fiber.dispose();
                process.exit(0);
            })().catch(() => process.exit(1));
        });
        return result;
    });
    ctx.effect(() => {
        transport.start();
        return async () => { await server.shutdown(); transport.close(); };
    }, 'learning-sdk.serve');
}
