import { lookup } from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import ipaddr from 'ipaddr.js';

// Resolve and pin each hop, so redirects and DNS changes cannot reach private services.
export async function downloadPublic(url, signal, redirects = 0) {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || redirects > 4) throw new Error('只支持公网 HTTP(S) 地址');
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = await lookup(hostname, { all: true });
    signal?.throwIfAborted();
    if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) throw new Error('不能访问本机、内网或特殊网络地址');
    const pinned = addresses[0];
    const result = await new Promise((resolveRequest, reject) => {
        const request = (parsed.protocol === 'https:' ? https : http).get(parsed, {
            signal, timeout: 60000, headers: { 'User-Agent': 'PersonalPages-Learning/1.0' },
            lookup: (_host, options, cb) => options.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family)
        }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) { response.resume(); resolveRequest({ redirect: new URL(response.headers.location, parsed).href }); return; }
            if (response.statusCode !== 200) { response.resume(); reject(new Error(`下载失败：HTTP ${response.statusCode}`)); return; }
            const chunks = []; let size = 0;
            response.on('data', chunk => { size += chunk.length; if (size > 50 * 1024 * 1024) request.destroy(new Error('下载文件超过 50 MB')); else chunks.push(chunk); });
            response.on('error', reject);
            response.on('end', () => resolveRequest({ bytes: Buffer.concat(chunks), mime: String(response.headers['content-type'] || '').split(';')[0], url: parsed.href }));
        });
        request.on('timeout', () => request.destroy(new Error('下载超时')));
        request.on('error', reject);
    });
    return result.redirect ? downloadPublic(result.redirect, signal, redirects + 1) : result;
}
