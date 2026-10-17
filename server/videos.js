import express from 'express';
import { realpath, stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

export const VIDEO_UPLOAD_LIMIT = 1024 * 1024 * 1024;
export function validVideoUrl(value) {
    try {
        const url = new URL(value, 'https://local.invalid');
        if (!/\.mp4$/i.test(url.pathname) || url.username || url.password) return false;
        if (value.startsWith('/') && !value.startsWith('//')) {
            const path = decodeURIComponent(url.pathname);
            return /^\/source\/[^/\\]+\.mp4$/i.test(path) && !path.includes('..');
        }
        return /^https?:\/\//i.test(value) && ['http:', 'https:'].includes(url.protocol);
    } catch { return false; }
}

export function videoPlaybackUrl(row) {
    if (row.resource_kind !== 'video' || !row.video_url) return '';
    if (!row.video_url.startsWith('/')) return row.video_url;
    const name = new URL(row.video_url, 'https://local.invalid').pathname.split('/').at(-1);
    return `/api/content/entries/${row.id}/video/${name}`;
}

export function createVideoRoutes({ db, publicRoot, publicAncestors }) {
    const router = express.Router();
    router.get('/entries/:id/video/:filename', async (req, res, next) => {
        // Errors must not cache: replacing a file yields a different URL, and
        // a missing/draft resource must never be cached as a media response.
        res.set('Cache-Control', 'no-store');
        const row = db.prepare("SELECT * FROM entries WHERE id=? AND kind='resource' AND resource_kind='video' AND status='published'").get(req.params.id);
        if (!row || publicAncestors(row) === null || !row.video_url.startsWith('/') || !validVideoUrl(row.video_url)) return res.sendStatus(404);
        const expected = decodeURIComponent(new URL(row.video_url, 'https://local.invalid').pathname.split('/').at(-1));
        if (req.params.filename !== expected || basename(expected) !== expected || expected.includes('\\')) return res.sendStatus(404);
        try {
            const root = await realpath(join(publicRoot, 'source'));
            const file = await realpath(join(root, expected));
            if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) return res.sendStatus(404);
            res.type('video/mp4');
            res.set('X-Content-Type-Options', 'nosniff');
            // The generated upload filename is immutable. Custom manual paths
            // revalidate instead, since their bytes may be replaced in place.
            const immutable = /^\d{13}-[a-f0-9]{16}\.mp4$/i.test(expected);
            res.set('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
            // sendFile streams from disk and implements HEAD, Range/If-Range,
            // Content-Length, ETag/Last-Modified and conditional requests.
            res.sendFile(file, { acceptRanges: true, cacheControl: false }, error => {
                if (!error) return;
                if (error.code === 'ECONNABORTED' || req.destroyed) return;
                if (res.headersSent) { res.destroy(error); return; }
                res.set('Cache-Control', 'no-store');
                if (error.status === 416) return res.status(416).end();
                next(error);
            });
        } catch (error) {
            if (['ENOENT', 'ENOTDIR'].includes(error.code)) return res.sendStatus(404);
            next(error);
        }
    });
    return router;
}
