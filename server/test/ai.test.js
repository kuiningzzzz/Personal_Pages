import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { samplePdf } from './fixtures.js';

const folder = mkdtempSync(join(tmpdir(), 'learning-tests-'));
process.env.DATA_DIR = folder;
process.env.PUBLIC_DIR = join(folder, 'public');
process.env.DEEPSEEK_API_KEY = '';
mkdirSync(process.env.PUBLIC_DIR);
const { cardDb, commentDb } = await import('../db.js');
const { createTask, getTask, dispatch, failTask, taskView, taskEvents, collectionSession, retryTask, event } = await import('../ai/tasks.js');
const { directory, storeAsset, readSource, pdfPage, downloadPublic } = await import('../ai/sources.js');
const { auditAndCleanupUploads } = await import('../upload-cleanup.js');
const { runPdf } = await import('../ai/pdf-process.js');
const { reportFile } = await import('../ai/workspace.js');
const date = new Date().toISOString();
function entry(title, parent = null, type = 'collection', status = 'published') {
    return Number(cardDb.prepare(`INSERT INTO entries(kind,resource_kind,title,body,tags,actions,parent_id,status,published_at,created_at,updated_at)
        VALUES ('resource',?,?,'用于学习的正文','[]','[]',?,?,?,?,?)`).run(type,title,parent,status,date,date,date).lastInsertRowid);
}
function task(collection = entry('目标合集')) {
    const result = createTask({ collection_id: collection, title: '课程学习', prompt: '学习资料' }, []);
    // Unit driver claims the queued job before the application queue can start it.
    cardDb.prepare("UPDATE ai_tasks SET status='running' WHERE id=?").run(result.id);
    return getTask(result.id);
}
after(() => { cardDb.close(); commentDb.close(); rmSync(folder, { recursive: true, force: true }); });

test('上下文包含全部子合集和草稿，读取权限限制在目标树内', async () => {
    const root = entry('根合集'), child = entry('子合集', root), draft = entry('草稿', child, 'document', 'draft'), other = entry('其他合集');
    const job = task(root);
    assert.deepEqual(new Set(directory(root).map(row => row.id)), new Set([root, child, draft]));
    assert.equal((await dispatch(job.id, 'read_resource', { id: draft })).status, 'draft');
    await assert.rejects(dispatch(job.id, 'read_resource', { id: other }), /不属于目标合集/);
    assert.throws(() => task(entry('草稿目标', null, 'collection', 'draft')), /必须已发布/);
    failTask(job.id, '测试完成');
});

test('PDF 可读取文本和页面图片，提交自动补源链接，附件按引用清理', async () => {
    const job = task();
    const pdf = await storeAsset(job, samplePdf(), '.pdf', '课程 [课件].pdf', 'input');
    const text = await readSource(job, { url: pdf });
    assert.equal(text.pageCount, 1);
    assert.match(text.pages[0].text, /Gradient Descent/);
    const image = await pdfPage(job, { url: pdf, page: 1 });
    assert.equal(image.mimeType, 'image/png');
    assert.equal(Buffer.from(image.base64, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(existsSync(join(process.env.PUBLIC_DIR, image.url.slice(1))));
    auditAndCleanupUploads();
    assert.ok(existsSync(join(process.env.PUBLIC_DIR, pdf.slice(1))), '运行任务的源文件必须保留');
    await dispatch(job.id, 'write_document', { title: '梯度下降', body: '## 详细讲解\n梯度提供下降方向。\n\n## 内容总结\n选择适当学习率。' });
    const submitted = await dispatch(job.id, 'submit_document');
    const report = cardDb.prepare('SELECT * FROM entries WHERE id=?').get(submitted.entryId);
    assert.equal(report.status, 'published');
    assert.equal(report.parent_id, job.collection_id);
    assert.ok(report.body.startsWith('学习源资料：'));
    assert.ok(report.body.includes(pdf));
    assert.ok(existsSync(join(process.env.PUBLIC_DIR, pdf.slice(1))));
    assert.ok(!existsSync(join(process.env.PUBLIC_DIR, image.url.slice(1))), '未用于正文的派生图片可以清理');
    assert.equal(getTask(job.id).status, 'published');
    await assert.rejects(dispatch(job.id, 'write_document', { title: '覆盖', body: '已结束' }), /任务已结束/);
});

test('PDF 子进程异常、超时、取消不会退出主进程，后续资料仍能读取', async () => {
    const workerPath = join(folder, 'pdf-failure-worker.mjs');
    writeFileSync(workerPath, `process.once('message', ({operation}) => { if(operation==='crash') process.exit(37); else if(operation==='error') process.send({error:'invalid PDF'},()=>process.exit(0)); else setInterval(()=>{},1000); });`);
    const workerUrl = pathToFileURL(workerPath);
    await assert.rejects(runPdf('crash', '', {}, { workerUrl }), /异常退出（37）/);
    await assert.rejects(runPdf('error', '', {}, { workerUrl }), /invalid PDF/);
    await assert.rejects(runPdf('hang', '', {}, { workerUrl, timeoutMs: 100 }), /超过 60 秒/);
    const controller = new AbortController();
    const cancelled = runPdf('hang', '', {}, { workerUrl, signal: controller.signal });
    controller.abort();
    await assert.rejects(cancelled, /已取消/);
    const job = task();
    const pdf = await storeAsset(job, samplePdf(), '.pdf', '恢复验证.pdf', 'input');
    assert.match((await readSource(job, { url: pdf })).pages[0].text, /Gradient Descent/);
    assert.equal((await pdfPage(job, { url: pdf, page: 1 })).mimeType, 'image/png');
    failTask(job.id, '测试完成');
});

test('提交校验缺失文件、空引用；公网下载拒绝私有地址', async () => {
    const job = task();
    await dispatch(job.id, 'write_document', { title: '报告', body: '![空图片]()' });
    await assert.rejects(dispatch(job.id, 'submit_document'), /地址为空/);
    await dispatch(job.id, 'write_document', { title: '报告', body: '[丢失文件](/source/absent.pdf)' });
    await assert.rejects(dispatch(job.id, 'submit_document'), /不属于任务资料/);
    for (const url of ['http://127.0.0.1/','http://[::1]/','http://169.254.169.254/','http://10.0.0.1/']) await assert.rejects(downloadPublic(url), /本机、内网/);
    failTask(job.id, '资料有误');
    assert.ok(existsSync(join(folder,'ai',job.id,'error.md')));
    assert.equal(cardDb.prepare('SELECT status FROM entries WHERE id=?').get(getTask(job.id).result_entry_id).status, 'draft');
});

function sse(res, tool, requestNumber) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('message_start', { type: 'message_start', message: { id: `msg-${requestNumber}`, type: 'message', role: 'assistant', model: 'deepseek-flash', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
    if (tool?.name) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `call-${requestNumber}`, name: tool.name, input: {} } });
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.args || {}) } });
    } else {
        if (tool?.thinking) {
            send('content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: '' } });
            send('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: tool.thinking } });
            send('content_block_stop', { type: 'content_block_stop', index: 1 });
        }
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: tool?.empty ? '' : '完成' } });
    }
    send('content_block_stop', { type: 'content_block_stop', index: 0 });
    send('message_delta', { type: 'message_delta', delta: { stop_reason: tool?.name ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } });
    send('message_stop', { type: 'message_stop' }); res.end();
}

async function harnessScenario(selectTool, { job = task(), inspectRequest, legacySession = false } = {}) {
    let calls = 0;
    const mock = createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const request = JSON.parse(Buffer.concat(chunks).toString());
        if (!req.url.endsWith('/messages')) { res.writeHead(404); res.end(); return; }
        calls++; inspectRequest?.(request, calls);
        const tool = selectTool(calls, request);
        if (tool?.args?.file_path === '$REPORT') tool.args.file_path = reportFile(job.id);
        sse(res, tool, calls);
    });
    await new Promise(resolve => mock.listen(0,'127.0.0.1',resolve));
    const child = fork(fileURLToPath(new URL('../ai/worker.js', import.meta.url)), [], { env: { ...process.env, DEEPSEEK_API_KEY: 'test-fake-key', DEEPSEEK_BASE_URL: `http://127.0.0.1:${mock.address().port}/anthropic/v1` }, stdio: ['ignore','ignore','pipe','ipc'] });
    let diagnostics = '';
    child.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-3000); });
    child.on('message', async message => {
        if (message.type === 'rpc') {
            try { const value = await dispatch(job.id,message.method,message.args); if (child.connected) child.send({ type:'reply',requestId:message.requestId,value }); }
            catch (error) { if (child.connected) child.send({ type:'reply',requestId:message.requestId,error:error.message }); }
        } else if (message.type === 'error') failTask(job.id,message.message);
        else if (message.type === 'event') event(job.id,message.kind,message.message,message.data);
    });
    const conversation = collectionSession(job.collection_id);
    if (legacySession) conversation.sessionId = `learning-legacy-${job.id}`;
    const workspace = conversation.workspace;
    child.send({ type:'start',task:{...job,links:[],settings:{maxOutputTokens:4096},draft:JSON.parse(job.draft)},workspace,conversation,directory:directory(job.collection_id),files:cardDb.prepare("SELECT url,name,kind FROM ai_task_files WHERE task_id=? AND role='input'").all(job.id) });
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { child.kill(); reject(new Error('Harness test timed out: '+diagnostics)); },60000);
            child.once('error',reject);
            child.once('exit',() => { clearTimeout(timer); if (getTask(job.id).status === 'running') failTask(job.id,'运行结束但没有提交：'+diagnostics); resolve(); });
        });
        return { task:getTask(job.id),calls,view:taskView(getTask(job.id),true),diagnostics };
    } finally { mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); }
}

const writeReport = (title, body) => ({ name: 'write', args: { file_path: '$REPORT', content: `# ${title}\n\n${body}` } });

test('原生文件工具及指引保留，旧输出配置不生效，可分段编辑长报告并提交元数据', async () => {
    const body = '深入讲解。'.repeat(22000);
    const result = await harnessScenario(count => count === 1 ? writeReport('原生长报告', '## 详细讲解\n' + body + '\n## 内容总结\n待补充') : count === 2 ? {
        name: 'edit', args: { file_path: '$REPORT', old_string: '待补充', new_string: '已完成总结' }
    } : { name: 'submit_document', args: { summary: '原生编辑结果', tags: ['课程'] } }, {
        inspectRequest(request, count) {
            if (count !== 1) return;
            const names = request.tools.map(tool => tool.name);
            for (const name of ['read','write','edit','read_image','glob','grep','submit_document']) assert.ok(names.includes(name), name);
            assert.ok(!names.includes('write_document'));
            assert.ok(!names.includes('read_document'));
            assert.ok(request.max_tokens > 32768, '使用 dsh 原生输出预算，不再沿用旧的 4096/16384/32768 限制');
            assert.match(JSON.stringify(request.system), /Read an existing file before overwriting/);
        }
    });
    assert.equal(result.task.status, 'published', result.task.error + result.diagnostics);
    const report = cardDb.prepare('SELECT title,body,summary,tags FROM entries WHERE id=?').get(result.task.result_entry_id);
    assert.equal(report.title, '原生长报告');
    assert.ok(report.body.length > 100000);
    assert.ok(report.body.includes('已完成总结'));
    assert.equal(report.summary, '原生编辑结果');
    assert.deepEqual(JSON.parse(report.tags), ['课程']);
});

test('同一合集跨任务共享原生文件，搜索和读取可复用笔记，不同合集隔离', async () => {
    const root = entry('工作区共享测试');
    const first = await harnessScenario(count => count === 1 ? { name: 'write', args: { file_path: 'notes/reference.md', content: '共享笔记 F7N2' } } : count === 2 ? writeReport('第一份', '讲解和总结') : { name: 'submit_document' }, { job: task(root) });
    assert.equal(first.task.status, 'published', first.task.error + first.diagnostics);
    const workspace = collectionSession(root).workspace;
    const second = await harnessScenario(count => count === 1 ? { name: 'glob', args: { pattern: '**/*.md' } } : count === 2 ? { name: 'read', args: { file_path: 'notes/reference.md' } } : count === 3 ? writeReport('第二份', '复用笔记和总结') : { name: 'submit_document' }, { job: task(root) });
    assert.equal(second.task.status, 'published', second.task.error + second.diagnostics);
    assert.equal(collectionSession(root).workspace, workspace);
    assert.ok(taskEvents(second.task.id, { limit: 1000 }).events.some(item => item.kind === 'tool-result' && JSON.stringify(item.data).includes('共享笔记 F7N2')));
    const other = collectionSession(entry('独立工作区'));
    assert.notEqual(other.workspace, workspace);
    assert.ok(!existsSync(join(other.workspace, 'notes/reference.md')));
});

test('原生文件工具和提交均拒绝工作区之外的路径与符号链接', async () => {
    const job = task(), workspace = collectionSession(job.collection_id).workspace;
    const secret = join(folder, 'outside.md'); writeFileSync(secret, '不可读取 SECRET');
    symlinkSync(folder, join(workspace, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await harnessScenario(count => count === 1 ? { name: 'read', args: { file_path: secret } } : count === 2 ? { name: 'write', args: { file_path: '../outside-write.md', content: '不可写入' } } : count === 3 ? { name: 'grep', args: { pattern: 'SECRET', path: folder } } : count === 4 ? { name: 'submit_document', args: { file_path: secret } } : count === 5 ? { name: 'read', args: { file_path: 'escape/outside.md' } } : count === 6 ? { name: 'submit_document', args: { file_path: 'escape/outside.md' } } : count === 7 ? writeReport('合规报告','详细讲解与总结') : { name: 'submit_document' }, { job, inspectRequest(request, count) {
        if (count >= 2 && count <= 7) assert.match(JSON.stringify(request.messages.at(-1)), /工作区|越界/);
    } });
    assert.equal(result.task.status, 'published', result.task.error + result.diagnostics);
    assert.ok(!existsSync(join(workspace, '../outside-write.md')));
});

test('旧会话通过原生持久化接口迁移历史到共享工作区的新会话', async () => {
    const root = entry('旧会话迁移测试'), firstJob = task(root);
    const first = await harnessScenario(count => count === 1 ? writeReport('旧任务', '历史标记 OLD8K2') : { name: 'submit_document' }, { job: firstJob, legacySession: true });
    assert.equal(first.task.status, 'published', first.task.error);
    const oldId = `learning-legacy-${firstJob.id}`;
    cardDb.prepare('UPDATE ai_collection_sessions SET session_id=? WHERE collection_id=?').run(oldId, root);
    let inherited = false;
    const second = await harnessScenario(count => count === 1 ? writeReport('新任务', '详细讲解和总结') : { name: 'submit_document' }, { job: task(root), inspectRequest(request, count) { if (count === 1) inherited = JSON.stringify(request.messages).includes('OLD8K2'); } });
    assert.equal(second.task.status, 'published', second.task.error + second.diagnostics);
    assert.ok(inherited);
    assert.notEqual(collectionSession(root).sessionId, oldId);
});

test('真实 Harness 普通文本不会结束循环：64 次未提交产出错误文件', async () => {
    const result = await harnessScenario(() => null);
    assert.equal(result.task.status,'failed',result.task.error + result.diagnostics);
    assert.equal(result.calls,64);
    assert.equal(result.task.iterations,64);
    assert.match(readFileSync(join(folder,'ai',result.task.id,'error.md'),'utf8'),/迭代次数用尽/);
});

test('真实 Harness 可扩展预算、修正失败提交，成功后不再请求模型', async () => {
    const result = await harnessScenario(count => count === 64 ? { name:'extend_budget' } : count === 65 ? { name:'submit_document' } : count === 66 ? writeReport('学习报告','## 详细讲解\n测试说明\n\n## 内容总结\n总结') : count === 67 ? { name:'submit_document' } : null);
    assert.equal(result.task.status,'published',result.task.error + result.diagnostics);
    assert.equal(result.task.budget,128);
    assert.equal(result.task.iterations,67);
    assert.equal(result.calls,67);
});

test('真实 Harness 总上限为 320，最后一次仍未提交就结束', async () => {
    const result = await harnessScenario(count => [64,128,192,256].includes(count) ? { name:'extend_budget' } : null);
    assert.equal(result.task.status,'failed',result.task.error + result.diagnostics);
    assert.equal(result.calls,320);
    assert.equal(result.task.iterations,320);
    assert.equal(result.task.budget,320);
});

test('真实 Harness 连续三次空输出后注入提交提醒，并显示思考、工具参数和结果', async () => {
    let reminder = false;
    const result = await harnessScenario((count, request) => {
        if (count === 1) return writeReport('空转测试', '## 详细讲解\n资料说明\n## 内容总结\n总结');
        if (count <= 4) return { empty: true };
        reminder = JSON.stringify(request.messages).includes('连续 3 次迭代没有输出');
        if (count === 5) return { thinking: '检查草稿已保存，准备提交。' };
        return { name: 'submit_document' };
    });
    assert.equal(result.task.status, 'published', result.task.error + result.diagnostics);
    assert.equal(result.calls, 6);
    assert.ok(reminder);
    const events = taskEvents(result.task.id, { limit: 1000 }).events;
    assert.equal(events.filter(item => item.kind === 'idle-warning').length, 1);
    assert.ok(events.some(item => item.kind === 'reasoning' && item.message.includes('准备提交')));
    assert.ok(events.some(item => item.kind === 'tool-call' && item.data.arguments.includes('资料说明')));
    assert.ok(events.some(item => item.kind === 'tool-result' && JSON.stringify(item.data).includes('Created file')));
});

test('新任务跨进程接续同一合集的对话，不同合集互相隔离', async () => {
    const root = entry('连续课程合集');
    const first = await harnessScenario(count => count === 1 ? writeReport('第一课', '## 详细讲解\n上下文标记 A9Y1\n## 内容总结\n第一课') : { name: 'submit_document' }, { job: task(root) });
    assert.equal(first.task.status, 'published', first.task.error);
    const sharedHome = collectionSession(root).home;
    // Simulate a legacy per-task home, then recover its real dsh conversation.
    const legacyHome = join(folder, 'ai', first.task.id, 'harness');
    cpSync(sharedHome, legacyHome, { recursive: true });
    assert.ok(sharedHome.startsWith(join(folder, 'ai') + (process.platform === 'win32' ? '\\' : '/')));
    rmSync(sharedHome, { recursive: true, force: true });
    cardDb.prepare('DELETE FROM ai_collection_sessions WHERE collection_id=?').run(root);
    assert.equal(collectionSession(root).sessionId, first.view.events.find(item => item.kind === 'session').data.sessionId);
    // Removing an individual task must not remove the collection conversation.
    cardDb.prepare('DELETE FROM ai_tasks WHERE id=?').run(first.task.id);
    const firstWorkspace = join(folder, 'ai', first.task.id);
    assert.ok(firstWorkspace.startsWith(join(folder, 'ai') + (process.platform === 'win32' ? '\\' : '/')));
    rmSync(firstWorkspace, { recursive: true, force: true });
    assert.ok(existsSync(sharedHome));
    let sameHistory = false, independent = false;
    const second = await harnessScenario(count => count === 1 ? writeReport('第二课', '## 详细讲解\n第二课\n## 内容总结\n总结') : { name: 'submit_document' }, {
        job: task(root), inspectRequest(request, count) {
            if (count === 1) sameHistory = request.messages.some(message => message.role === 'assistant' && JSON.stringify(message).includes('上下文标记 A9Y1'));
        }
    });
    assert.equal(second.task.status, 'published', second.task.error);
    assert.ok(sameHistory, '上一任务的模型消息必须出现在新任务首个请求内');
    assert.equal(collectionSession(root).sessionId, first.view.events.find(item => item.kind === 'session').data.sessionId);
    const third = await harnessScenario(count => count === 1 ? writeReport('独立课', '## 详细讲解\n独立课\n## 内容总结\n总结') : { name: 'submit_document' }, {
        inspectRequest(request, count) { if (count === 1) independent = !JSON.stringify(request.messages).includes('上下文标记 A9Y1'); }
    });
    assert.equal(third.task.status, 'published', third.task.error);
    assert.ok(independent);
    // Each job still starts its own accounting despite resumed turn/step IDs.
    assert.equal(second.task.iterations, 2);
});

test('长日志可以前后分页且不丢失内容，旧合集会话采用独立存储', async () => {
    const job = task();
    const legacyId = 'learning-legacy-test';
    const legacyHome = join(folder, 'ai', job.id, 'harness');
    mkdirSync(join(legacyHome, 'sessions'), { recursive: true });
    writeFileSync(join(legacyHome, 'migration-marker'), 'legacy attachment');
    event(job.id, 'session', '旧会话', { sessionId: legacyId });
    const restored = collectionSession(job.collection_id);
    assert.equal(restored.previousSessionId, legacyId);
    assert.equal(readFileSync(join(restored.home, 'migration-marker'), 'utf8'), 'legacy attachment');
    const longOutput = '正文'.repeat(18000);
    event(job.id, 'assistant', longOutput);
    for (let index = 0; index < 620; index++) event(job.id, 'phase', `阶段 ${index}`);
    const tail = taskEvents(job.id);
    assert.equal(tail.events.length, 300);
    assert.ok(tail.hasMore);
    const older = taskEvents(job.id, { before: tail.events[0].id });
    assert.equal(older.events.at(-1).id + 1, tail.events[0].id);
    let cursor = 0, all = [], more = true;
    // after=0 means latest page, so the first ascending page uses the queue event.
    const start = cardDb.prepare('SELECT min(id) AS id FROM ai_task_events WHERE task_id=?').get(job.id).id;
    cursor = start;
    all = taskEvents(job.id, { before: start + 1 }).events;
    while (more) { const page = taskEvents(job.id, { after: cursor }); all.push(...page.events); cursor = all.at(-1).id; more = page.hasMore; }
    assert.equal(new Set(all.map(item => item.id)).size, all.length);
    assert.equal(all.filter(item => item.kind === 'assistant').map(item => item.message).join(''), longOutput);
    failTask(job.id, '测试完成');
    await new Promise(resolve => setImmediate(resolve));
});

test('同一任务连续重试恢复合集持久会话，保留资料和草稿，最终能发布', async () => {
    const job = task();
    const pdf = await storeAsset(job, samplePdf(), '.pdf', '重试课件.pdf', 'input');
    const body = '## 详细讲解\n保留这段学习草稿。\n\n## 内容总结\n总结。';
    const first = await harnessScenario(count => count === 1 ? writeReport('重试报告', body) : null, {job});
    assert.equal(first.task.status,'failed',first.task.error);
    for (let attempt = 0; attempt < 2; attempt++) {
        retryTask(job.id);
        assert.equal(getTask(job.id).status,'queued');
        assert.equal(getTask(job.id).iterations,0);
        assert.equal(getTask(job.id).budget,64);
        assert.equal(JSON.parse(getTask(job.id).draft).body,'# 重试报告\n\n' + body);
        assert.ok(existsSync(join(process.env.PUBLIC_DIR,pdf.slice(1))));
        // Claim the retry synchronously, so this test drives the real worker with
        // the mock API rather than starting the production queue.
        cardDb.prepare("UPDATE ai_tasks SET status='running' WHERE id=?").run(job.id);
        const result = await harnessScenario(count => attempt === 0 ? null : count === 1 ? {name:'read',args:{file_path:'$REPORT'}} : {name:'submit_document'}, {job:getTask(job.id)});
        assert.equal(result.task.status,attempt === 0 ? 'failed' : 'published',result.task.error);
        assert.equal(result.calls,attempt === 0 ? 64 : 2,result.task.error);
    }
    const sessions = taskEvents(job.id, { limit: 5000 }).events.filter(item => item.kind === 'session').map(item => item.data.sessionId);
    assert.equal(sessions.length,3);
    assert.equal(new Set(sessions).size,1);
    const report = cardDb.prepare('SELECT body FROM entries WHERE id=?').get(getTask(job.id).result_entry_id);
    assert.ok(report.body.includes(pdf));
    assert.ok(report.body.includes(body));
});
