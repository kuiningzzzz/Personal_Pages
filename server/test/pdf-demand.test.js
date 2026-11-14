import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { rangedPdfTask } from '../../src/lib/pdf-range.js';

test('800 MB、7001 页 PDF：仅分段读取，跨分片跳页后不后台下载全书', async t => {
    // A virtual sparse PDF: real page tree/xref at the tail, a large unused gap.
    // No 800 MB allocation, disk file, external network or pre-processing.
    const size = 800 * 1024 * 1024;
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Count 7001 /Kids [${Array.from({ length: 7001 }, (_, i) => `${i + 3} 0 R`).join(' ')}] >>`,
        ...Array.from({ length: 7001 }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> >>')];
    let offset = size - 2 * 1024 * 1024;
    const pieces = [{ offset: 0, data: Buffer.from('%PDF-1.7\n7004 0 obj\n<< >>\nendobj\n7005 0 obj\n<< >>\nendobj\n') }], offsets = [0];
    objects.forEach((body, i) => { const data = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`); offsets.push(offset); pieces.push({ offset, data }); offset += data.length; });
    const xref = offset;
    const tail = Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    pieces.push({ offset, data: tail });
    const length = offset + tail.length;
    let transferred = 0, requests = 0;
    t.mock.method(globalThis, 'fetch', async (_url, options = {}) => {
        const headers = { 'Accept-Ranges': 'bytes', 'Content-Length': String(length) };
        if (options.method === 'HEAD') return new Response(null, { headers });
        const requested = options.headers?.Range;
        assert.ok(requested, '不允许整文件 GET');
        const [, first, last] = requested.match(/^bytes=(\d+)-(\d+)$/);
        const begin = Number(first), end = Number(last) + 1;
        assert.ok(end - begin <= 2 * 1024 * 1024, '单次请求有界');
        const bytes = Buffer.alloc(end - begin);
        for (const piece of pieces) {
            const lo = Math.max(begin, piece.offset), hi = Math.min(end, piece.offset + piece.data.length);
            if (hi > lo) piece.data.copy(bytes, lo - begin, lo - piece.offset, hi - piece.offset);
        }
        transferred += bytes.length; requests++;
        return new Response(bytes, { status: 206, headers: { ...headers, 'Content-Length': String(bytes.length), 'Content-Range': `bytes ${begin}-${end - 1}/${length}` } });
    });
    const controller = new AbortController(); let task;
    t.after(async () => { controller.abort(); await task?.destroy();  });
    task = await rangedPdfTask(pdfjs, 'https://test.invalid/large.pdf', { signal: controller.signal, onRangeError: cause => assert.fail(cause.message) });
    const document = await task.promise;
    assert.equal(document.numPages, 7001);
    for (const page of [1, 10, 31, 35, 40, 7001]) {
        const proxy = await document.getPage(page); await proxy.getOperatorList(); proxy.cleanup();
    }
    assert.ok(transferred < 4 * 1024 * 1024, `按需请求应远小于文件，实际 ${transferred}`);
    const previous = requests;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(requests, previous, '阅读暂停后不预取其余页面');
    t.diagnostic(`虚拟文件 ${length} 字节，7001 页；跳读后传输 ${transferred} 字节，${requests} 次分段请求`);
});

test('拒绝把 Range 请求错误响应成 200 的服务器，不读取整文件响应体', async t => {
    let cancelled = false;
    t.mock.method(globalThis, 'fetch', async (_url, options = {}) => {
        const headers = { 'Content-Length': String(800 * 1024 * 1024), 'Accept-Ranges': 'bytes' };
        return new Response(options.method === 'HEAD' ? null : new ReadableStream({ cancel() { cancelled = true; } }), { headers });
    });
    await assert.rejects(rangedPdfTask(pdfjs, 'https://test.invalid/bad.pdf'), /停止预览/);
    assert.equal(cancelled, true);
});
