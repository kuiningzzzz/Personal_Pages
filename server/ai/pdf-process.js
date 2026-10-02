import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function runPdf(operation, path, args, { signal, timeoutMs = 60000, workerUrl = new URL('./pdf-worker.js', import.meta.url) } = {}) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        const env = Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','FONTCONFIG_PATH'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
        const child = fork(fileURLToPath(workerUrl), [], { env, execArgv: ['--max-old-space-size=512'],
            serialization: 'advanced', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        let response, failure, diagnostics = '', settled = false;
        const finish = (error, value) => {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            error ? reject(error) : resolve(value);
        };
        const abort = () => { failure = new Error('PDF 处理已取消'); child.kill(); };
        const timer = setTimeout(() => { failure = new Error('PDF 处理超过 60 秒，请减少单次读取页数或跳过复杂页面'); child.kill(); }, timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        const log = chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-3000); };
        child.stdout.on('data', log); child.stderr.on('data', log);
        child.once('message', message => { response = message; });
        child.once('error', error => { child.kill(); finish(failure || error); });
        child.once('exit', (code, exitSignal) => {
            if (failure) return finish(failure);
            if (code !== 0) return finish(new Error(`PDF 独立处理进程异常退出（${exitSignal || code}），后端服务继续运行。可改用文本读取或跳过此页。${diagnostics ? '\n' + diagnostics : ''}`));
            if (response?.error) return finish(new Error(`PDF 处理失败：${response.error}`));
            if (!response || !Object.hasOwn(response, 'value')) return finish(new Error('PDF 处理进程没有返回结果'));
            finish(null, response.value);
        });
        if (signal?.aborted) abort();
        if (child.connected) child.send({ operation, path, args });
    });
}
