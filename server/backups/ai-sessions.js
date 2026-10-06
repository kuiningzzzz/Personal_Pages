import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { zstdDecompressSync, zstdCompressSync, constants } from 'node:zlib';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';

// This key is the on-disk project grouping used by the installed DSH JSONL
// persistence backend. Its header cwd and physical directory must agree.
export function sessionProjectKey(cwd) {
    let readable = '', separator = false;
    for (let i = 0; i < cwd.length; i++) {
        const character = cwd[i];
        if ('/\\:'.includes(character)) { if (!separator) readable += '-'; separator = true; }
        else { readable += character !== '~' && /^[A-Za-z0-9._-]$/.test(character) ? character : '~' + cwd.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'); separator = false; }
    }
    return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`;
}
function frameLength(buffer) {
    if (buffer.length < 5) return null;
    if (buffer.readUInt32LE(0) !== 0xfd2fb528 || buffer[4] & 24) throw new Error('AI 对话 Zstandard 帧损坏');
    const descriptor = buffer[4], single = !!(descriptor & 32), dictionary = descriptor & 3, content = descriptor >>> 6;
    let offset = 5 + (single ? 0 : 1) + (dictionary === 3 ? 4 : dictionary) + (content === 0 ? single ? 1 : 0 : 1 << content);
    if (offset > buffer.length) return null;
    while (true) {
        if (offset + 3 > buffer.length) return null;
        const block = buffer.readUIntLE(offset, 3), type = block >>> 1 & 3; if (type === 3) throw new Error('AI 对话 Zstandard 块损坏');
        offset += 3 + (type === 1 ? 1 : block >>> 3); if (offset > buffer.length) return null;
        if (block & 1) break;
    }
    offset += descriptor & 4 ? 4 : 0; return offset <= buffer.length ? offset : null;
}
export async function* decodedSessionFrames(source) {
    let pending = Buffer.alloc(0), decoded = 0;
    // Node's public Zstd decoder reads only the first concatenated frame.
    // DSH persists one independent frame per append, so decode each frame.
    for await (const bytes of createReadStream(source)) {
        pending = pending.length ? Buffer.concat([pending, bytes]) : bytes;
        if (pending.length > 512 * 1024 ** 2) throw new Error('单份 AI 对话帧超过迁移容量限制');
        let length;
        while ((length = frameLength(pending)) !== null) {
            const output = zstdDecompressSync(pending.subarray(0, length), { maxOutputLength: 512 * 1024 ** 2 - decoded });
            decoded += output.length; pending = pending.subarray(length); yield output;
        }
    }
    if (pending.length) throw new Error('AI 对话压缩日志被截断，无法完整迁移');
}
export async function migrateSession(source, destination, compressed, rewrite) {
    const input = compressed ? Readable.from(decodedSessionFrames(source)) : createReadStream(source);
    const output = createWriteStream(destination, { flags: 'wx' }), completion = finished(output); completion.catch(() => {});
    const lines = createInterface({ input, crlfDelay: Infinity }); let header, nextHeader, decoded = 0;
    input.on('data', bytes => { decoded += bytes.length; if (decoded > 512 * 1024 ** 2) input.destroy(new Error('单份 AI 对话展开后超过 512MB，无法安全迁移')); });
    input.on('error', error => { output.destroy(error); lines.close(); });
    try {
        for await (const line of lines) {
            const migrated = rewrite(line);
            if (!header && line.trim()) { try { const value = JSON.parse(line); if (value.type === 'session') { header = value; nextHeader = JSON.parse(migrated); } } catch { /* Non-session scratch JSONL. */ } }
            const bytes = Buffer.from(migrated + '\n');
            if (!output.write(compressed ? zstdCompressSync(bytes, { params: { [constants.ZSTD_c_checksumFlag]: 1 } }) : bytes)) await once(output, 'drain');
        }
        output.end(); await completion; return { header, nextHeader };
    } catch (error) { output.destroy(); await completion.catch(() => {}); throw error; }
    finally { lines.close(); input.destroy(); }
}
