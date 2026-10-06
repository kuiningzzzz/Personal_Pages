import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safeName } from '../backups/archive.js';

// Inspect Docker's tar inventory before asking the daemon to load any image.
// No extraction, subprocess or filesystem paths from the tar are executed.
export async function validateImageArchive(path, versions, nameFor) {
    const handle = await open(path, 'r'), size = (await handle.stat()).size, entries = new Map();
    const field = bytes => bytes.toString().replace(/\0.*$/s, '').trim();
    try {
        let offset = 0;
        while (offset + 512 <= size) {
            const header = Buffer.alloc(512); await handle.read(header, 0, 512, offset);
            if (header.every(byte => byte === 0)) break;
            const checksum = Number.parseInt(field(header.subarray(148, 156)), 8);
            const actual = [...header].reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
            const length = Number.parseInt(field(header.subarray(124, 136)) || '0', 8);
            let name = field(header.subarray(0, 100)); const prefix = field(header.subarray(345, 500)); if (prefix) name = `${prefix}/${name}`;
            safeName(name);
            if (checksum !== actual || !Number.isSafeInteger(length) || length < 0 || offset + 512 + length > size || entries.has(name) || entries.size > 200000) throw new Error('活动镜像归档损坏');
            const type = header[156];
            if (![0, 48, 53].includes(type)) throw new Error('活动镜像归档包含不支持的条目');
            entries.set(name, { offset: offset + 512, length }); offset += 512 + Math.ceil(length / 512) * 512;
        }
        async function json(name) {
            const entry = entries.get(name); if (!entry || entry.length > 16 * 1024 ** 2) throw new Error('活动镜像归档缺少有效清单');
            const bytes = Buffer.alloc(entry.length); await handle.read(bytes, 0, bytes.length, entry.offset); return JSON.parse(bytes.toString());
        }
        const expected = new Map(versions.map(v => [nameFor(v.id), v]));
        const manifest = await json('manifest.json'), found = new Set();
        if (!Array.isArray(manifest) || manifest.length !== expected.size) throw new Error('活动镜像数量与备份记录不一致');
        for (const image of manifest) {
            if (!Array.isArray(image.RepoTags) || image.RepoTags.length !== 1 || !expected.has(image.RepoTags[0]) || found.has(image.RepoTags[0])) throw new Error('活动镜像归档包含未授权镜像');
            const v = expected.get(image.RepoTags[0]), config = await json(image.Config), labels = config.config?.Labels;
            if (labels?.['com.personal-pages.plaza'] !== v.id || labels?.['com.personal-pages.plaza.manifest'] !== createHash('sha256').update(v.manifest).digest('hex')) throw new Error('活动镜像标签与版本记录不一致');
            if (!Array.isArray(image.Layers) || image.Layers.some(layer => !entries.has(layer))) throw new Error('活动镜像层文件缺失');
            found.add(image.RepoTags[0]);
        }
        // Docker Desktop may include an OCI index beside the Docker manifest.
        if (entries.has('index.json')) {
            const index = await json('index.json');
            for (const descriptor of index.manifests || []) {
                const names = descriptor.annotations || {}, tag = names['io.containerd.image.name'];
                if (tag && !expected.has(tag.replace(/^docker\.io\/(?:library\/)?/, ''))) throw new Error('活动镜像索引包含未授权镜像');
            }
        }
    } finally { await handle.close(); }
}
