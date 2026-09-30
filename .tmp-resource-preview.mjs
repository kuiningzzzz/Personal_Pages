import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
const workspace = process.cwd();
const folder = mkdtempSync(join(tmpdir(), 'personal-pages-preview-'));
const port = () => new Promise(resolvePort => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)); }); });
const backendPort = await port(), frontendPort = await port();
const base = `http://127.0.0.1:${backendPort}`;
const backend = spawn(process.execPath, ['server.js'], { cwd: join(workspace, 'server'), env: { ...process.env, DATA_DIR: folder, PUBLIC_DIR: join(folder, 'public'), SERVER_PORT: String(backendPort), ADMIN_PASSWORD: 'preview-password', SESSION_SECRET: 'preview-session-secret' }, stdio: ['ignore', 'ignore', 'pipe'] });
let cookie = '';
const request = async (path, body, method = 'POST') => {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const result = await response.json();
  if (!result.success) throw new Error(JSON.stringify(result));
  return result;
};
for (let i = 0; i < 80; i++) { try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
await request('/api/admin/login', { password: 'preview-password' });
await request('/api/admin/profile', { profile: { avatar: '/picture/avatar.png', name: 'Quinine', description: '预览数据' }, cards: [] }, 'PUT');
const entry = { kind: 'resource', status: 'published', tags: ['日常'], summary: '把散落的图片和文字，慢慢收进来。', body: '' };
const outer = await request('/api/admin/entries', { ...entry, resource_kind: 'collection', title: '生活收藏夹', body: '一些**值得留着**的小东西。' });
const inner = await request('/api/admin/entries', { ...entry, resource_kind: 'collection', title: '画画的日子', parent_id: outer.id });
const images = readdirSync(join(workspace, 'public', 'emoji', 'myownpaintings')).filter(name => /\.(jpg|png|jpeg|webp)$/i.test(name)).slice(0, 9).map((name, index) => ({ url: `/emoji/myownpaintings/${name}`, caption: index % 2 ? '' : `随手画下的片段 ${index + 1}` }));
const gallery = await request('/api/admin/entries', { ...entry, resource_kind: 'gallery', title: '我的画册', parent_id: inner.id, images });
await request('/api/admin/entries', { ...entry, title: '照片整理的小工具', parent_id: outer.id, body: '记录整理资源的方法。', actions: [{ label: '官网', url: 'https://example.com' }] });
await request('/api/admin/entries', { ...entry, title: '独立的资源文档', body: '这里是一份文档。' });
const frontend = spawn(process.execPath, [join(workspace, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort', '--configLoader', 'runner'], { cwd: workspace, env: { ...process.env, VITE_API_TARGET: base }, stdio: ['ignore', 'ignore', 'pipe'] });
console.log(JSON.stringify({ url: `http://127.0.0.1:${frontendPort}`, outer: outer.id, inner: inner.id, gallery: gallery.id }));
process.stdin.resume();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  for (const child of [frontend, backend]) { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } }
  const target = resolve(folder);
  if (target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1).startsWith('personal-pages-preview-')) rmSync(target, { recursive: true, force: true });
  process.exit();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('data', shutdown);
