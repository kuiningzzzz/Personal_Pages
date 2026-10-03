import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FEEDBACK_CATEGORIES = { experience: '体验优化', bug: 'bug反馈', music: '音乐推荐', rights: '侵权通知', other: '其他内容' };
export const FEEDBACK_WINDOW = 30 * 60000;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_IMAGE_TOTAL = 10 * 1024 * 1024;
export const feedbackRoot = join(process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'feedback', 'images');

export function feedbackQuota(db, userId, now) {
    const rows = db.prepare('SELECT created_at FROM visitor_feedback WHERE user_id=? AND created_at>? ORDER BY created_at ASC,id ASC').all(userId, now - FEEDBACK_WINDOW);
    return rows.length >= 3 ? rows[0].created_at + FEEDBACK_WINDOW : 0;
}
export function imageFormat(bytes) {
    if (bytes.length >= 20 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.subarray(12, 16).toString() === 'IHDR') return { extension: '.png', mime: 'image/png' };
    if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return { extension: '.jpg', mime: 'image/jpeg' };
    if (bytes.length >= 14 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()) && bytes.at(-1) === 59) return { extension: '.gif', mime: 'image/gif' };
    if (bytes.length >= 20 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.subarray(12, 16).toString())) return { extension: '.webp', mime: 'image/webp' };
    return null;
}
export function feedbackImagePath(root, filename) {
    if (!/^[a-f\d]{32}\.(png|jpg|gif|webp)$/.test(filename)) throw new Error('图片路径无效');
    const path = resolve(root, filename);
    if (!path.startsWith(resolve(root) + sep)) throw new Error('图片路径无效');
    return path;
}
export function feedbackView(db, row) {
    return { id: row.id, user_id: row.user_id, username: row.username, email: row.email, category: row.category,
        body: row.body, song: row.song, artist: row.artist, notes: row.notes, is_read: Boolean(row.is_read), created_at: row.created_at, read_at: row.read_at,
        images: db.prepare('SELECT id,name,size FROM feedback_images WHERE feedback_id=? ORDER BY id').all(row.id).map(image => ({ ...image, url: `/api/admin/feedback/images/${image.id}` })) };
}
