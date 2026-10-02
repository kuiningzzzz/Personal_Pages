// No database, credentials or application imports in this process. Native canvas
// failures must only terminate this worker, never the HTTP server.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const root = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));

async function processPdf({ operation, path, args }) {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), isEvalSupported: false,
        standardFontDataUrl: join(root, 'standard_fonts').replaceAll('\\', '/') + '/',
        cMapUrl: join(root, 'cmaps').replaceAll('\\', '/') + '/', cMapPacked: true }).promise;
    try {
        const start = Math.trunc(args.page || 1);
        if (start < 1 || start > pdf.numPages) throw new Error(`PDF 页码必须为 1 至 ${pdf.numPages}`);
        if (operation === 'read') {
            const pages = [];
            const count = Math.min(5, Math.max(1, Math.trunc(args.count || 3)));
            for (let number = start; number <= Math.min(pdf.numPages, start + count - 1); number++) {
                const page = await pdf.getPage(number);
                const content = await page.getTextContent();
                const text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('');
                pages.push({ page: number, text: text.slice(0, 40000), truncated: text.length > 40000 });
                page.cleanup();
            }
            return { pageCount: pdf.numPages, pages };
        }
        if (operation !== 'render') throw new Error('未知 PDF 操作');
        const page = await pdf.getPage(start);
        const natural = page.getViewport({ scale: 1 });
        if (!Number.isFinite(natural.width) || !Number.isFinite(natural.height) || natural.width <= 0 || natural.height <= 0) throw new Error('PDF 页面尺寸无效');
        const scale = Math.min(2, 2400 / Math.max(natural.width, natural.height), Math.sqrt(4000000 / (natural.width * natural.height)));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return { bytes: await canvas.encode('png') };
    } finally { await pdf.destroy(); }
}

process.once('message', async request => {
    let response;
    try { response = { value: await processPdf(request) }; }
    catch (error) { response = { error: String(error.message || error).slice(0, 2000) }; }
    if (process.connected) process.send(response, () => process.exit(0));
    else process.exit(0);
});
process.once('disconnect', () => process.exit(0));
