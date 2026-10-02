import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
const { createTask, getTask, dispatch, failTask, taskView, retryTask, event } = await import('../ai/tasks.js');
const { directory, storeAsset, readSource, pdfPage, downloadPublic } = await import('../ai/sources.js');
const { auditAndCleanupUploads } = await import('../upload-cleanup.js');
const { runPdf } = await import('../ai/pdf-process.js');
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
    if (tool) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `call-${requestNumber}`, name: tool.name, input: {} } });
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.args || {}) } });
    } else {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '完成' } });
    }
    send('content_block_stop', { type: 'content_block_stop', index: 0 });
    send('message_delta', { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } });
    send('message_stop', { type: 'message_stop' }); res.end();
}

async function harnessScenario(selectTool, { job = task() } = {}) {
    let calls = 0;
    const mock = createServer(async (req, res) => {
        for await (const _chunk of req) { /* Drain request; never record credentials or full prompts. */ }
        if (!req.url.endsWith('/messages')) { res.writeHead(404); res.end(); return; }
        calls++; sse(res, selectTool(calls), calls);
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
        else if (message.type === 'event' && message.kind === 'session') event(job.id,message.kind,message.message,message.data);
    });
    const workspace = join(folder,'ai',job.id); mkdirSync(workspace,{recursive:true});
    child.send({ type:'start',task:{...job,links:[],settings:{maxOutputTokens:4096},draft:JSON.parse(job.draft)},workspace,directory:directory(job.collection_id),files:cardDb.prepare("SELECT url,name,kind FROM ai_task_files WHERE task_id=? AND role='input'").all(job.id) });
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { child.kill(); reject(new Error('Harness test timed out: '+diagnostics)); },60000);
            child.once('error',reject);
            child.once('exit',() => { clearTimeout(timer); if (getTask(job.id).status === 'running') failTask(job.id,'运行结束但没有提交：'+diagnostics); resolve(); });
        });
        return { task:getTask(job.id),calls,view:taskView(getTask(job.id),true),diagnostics };
    } finally { mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); }
}

test('真实 Harness 普通文本不会结束循环：64 次未提交产出错误文件', async () => {
    const result = await harnessScenario(() => null);
    assert.equal(result.task.status,'failed',result.task.error + result.diagnostics);
    assert.equal(result.calls,64);
    assert.equal(result.task.iterations,64);
    assert.match(readFileSync(join(folder,'ai',result.task.id,'error.md'),'utf8'),/迭代次数用尽/);
});

test('真实 Harness 可扩展预算、修正失败提交，成功后不再请求模型', async () => {
    const result = await harnessScenario(count => count === 64 ? { name:'extend_budget' } : count === 65 ? { name:'submit_document' } : count === 66 ? { name:'write_document',args:{ title:'学习报告',body:'## 详细讲解\n测试说明\n\n## 内容总结\n总结' } } : count === 67 ? { name:'submit_document' } : null);
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

test('同一任务连续重试使用不同持久会话，保留资料和草稿，最终能发布', async () => {
    const job = task();
    const pdf = await storeAsset(job, samplePdf(), '.pdf', '重试课件.pdf', 'input');
    const body = '## 详细讲解\n保留这段学习草稿。\n\n## 内容总结\n总结。';
    const first = await harnessScenario(count => count === 1 ? { name:'write_document',args:{title:'重试报告',body} } : null, {job});
    assert.equal(first.task.status,'failed',first.task.error);
    for (let attempt = 0; attempt < 2; attempt++) {
        retryTask(job.id);
        assert.equal(getTask(job.id).status,'queued');
        assert.equal(getTask(job.id).iterations,0);
        assert.equal(getTask(job.id).budget,64);
        assert.equal(JSON.parse(getTask(job.id).draft).body,body);
        assert.ok(existsSync(join(process.env.PUBLIC_DIR,pdf.slice(1))));
        // Claim the retry synchronously, so this test drives the real worker with
        // the mock API rather than starting the production queue.
        cardDb.prepare("UPDATE ai_tasks SET status='running' WHERE id=?").run(job.id);
        const result = await harnessScenario(count => attempt === 0 ? null : count === 1 ? {name:'read_document'} : {name:'submit_document'}, {job:getTask(job.id)});
        assert.equal(result.task.status,attempt === 0 ? 'failed' : 'published',result.task.error);
        assert.equal(result.calls,attempt === 0 ? 64 : 2,result.task.error);
    }
    const sessions = taskView(getTask(job.id),true).events.filter(item => item.kind === 'session').map(item => item.data.sessionId);
    assert.equal(sessions.length,3);
    assert.equal(new Set(sessions).size,3);
    const report = cardDb.prepare('SELECT body FROM entries WHERE id=?').get(getTask(job.id).result_entry_id);
    assert.ok(report.body.includes(pdf));
    assert.ok(report.body.includes(body));
});
