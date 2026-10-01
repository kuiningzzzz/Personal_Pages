import express from 'express';
import { sessionUser } from '../auth/routes.js';
import { SCOPES, setSubscriptions, subscriptionState } from './graph.js';

export function createSubscriptionRoutes({ db, clock = Date.now }) {
    const router = express.Router();
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(req.method)) {
            if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ success: false, message: '请求来源无效' });
            const origin = req.get('origin');
            if (origin) {
                try { if (new URL(origin).origin !== `${req.protocol}://${req.get('host')}`) throw new Error(); }
                catch { return res.status(403).json({ success: false, message: '请求来源无效' }); }
            }
            if (!req.is('application/json')) return res.status(415).json({ success: false, message: '请使用 JSON 请求' });
        }
        const user = sessionUser(db, req, clock());
        if (!user) return res.status(401).json({ success: false, message: '登录/注册后即可使用订阅服务' });
        req.visitorId = user.id;
        next();
    });
    router.get('/', (req, res) => res.json({ success: true, data: subscriptionState(db, req.visitorId) }));
    router.post('/', (req, res) => {
        const batch = Object.hasOwn(req.body || {}, 'changes');
        const input = batch ? req.body.changes : [req.body];
        if (!Array.isArray(input) || !input.length || input.length > 50 || input.some(item => !item || typeof item !== 'object')) {
            return res.status(400).json({ success: false, message: '订阅设置无效' });
        }
        const changes = input.map(item => ({ scope: item.scope, enabled: item.enabled,
            targetId: ['collection', 'resource-type'].includes(item.scope) ? Number(item.targetId) : 0 }));
        if (changes.some(({ scope, targetId, enabled }) => !SCOPES.includes(scope) || typeof enabled !== 'boolean'
            || (['collection', 'resource-type'].includes(scope) && (!Number.isSafeInteger(targetId) || targetId <= 0))
            || (batch && !['resource-type', 'moment-short', 'moment-article'].includes(scope)))
            || new Set(changes.map(change => `${change.scope}:${change.targetId}`)).size !== changes.length
            || (batch && changes.some(change => (change.scope === 'resource-type') !== (changes[0].scope === 'resource-type')))) {
            return res.status(400).json({ success: false, message: '订阅设置无效' });
        }
        // Keep rapid clicks from generating unbounded tree mutations.
        const key = `subscription-change:${req.visitorId}`;
        const state = db.prepare('SELECT count, expires_at FROM user_auth_limits WHERE key = ?').get(key);
        const now = clock();
        if (state?.expires_at > now && state.count >= 60) return res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
        db.prepare(`INSERT INTO user_auth_limits (key, count, expires_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET count = excluded.count, expires_at = excluded.expires_at`)
            .run(key, state?.expires_at > now ? state.count + 1 : 1, state?.expires_at > now ? state.expires_at : now + 60000);
        // Validate targets before entering the transaction; database errors are
        // handled by Express, not disguised as user input errors.
        for (const { scope, targetId } of changes) {
            if (scope === 'resource-type' && !db.prepare('SELECT id FROM resource_types WHERE id = ?').get(targetId)) return res.status(404).json({ success: false, message: '资源分类不存在' });
            if (scope === 'collection' && !Object.hasOwn(subscriptionState(db, req.visitorId).collections, targetId)) return res.status(404).json({ success: false, message: '合集不存在' });
        }
        const data = setSubscriptions(db, req.visitorId, changes);
        res.json({ success: true, message: batch ? '订阅选择已保存' : changes[0].enabled ? '已订阅，新内容会通过邮件提醒你' : '已取消订阅', data });
    });
    return router;
}
