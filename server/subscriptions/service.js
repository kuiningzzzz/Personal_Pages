import { resourceGraph, subscribedToEntry, subscriptionMap } from './graph.js';

export const NOTIFICATION_COOLDOWN = 30 * 60 * 1000;
export function siteOrigin(env = process.env) {
    const value = env.PUBLIC_SITE_URL || (env.NODE_ENV === 'production' ? '' : 'http://localhost:5174');
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
        return url.origin;
    } catch { return null; }
}
export function notificationPath(entry) {
    if (entry.kind === 'moment' && entry.format === 'short') return `/moments?post=${entry.id}`;
    if (entry.kind === 'resource' && entry.resource_kind === 'collection') return `/resource/collection/${entry.id}`;
    if (entry.kind === 'resource' && entry.resource_kind === 'gallery') return `/resource/gallery/${entry.id}`;
    return `/entry/${entry.id}`;
}

export function createSubscriptionService({ db, mailer, origin, clock = Date.now }) {
    let interval; let active; let stopping = false;
    const records = userId => subscriptionMap(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId));
    const canNotify = (entry, graph) => entry?.status === 'published' && (entry.kind === 'moment' || graph.publicEntry(entry));
    function prepare() {
        const events = db.prepare('SELECT * FROM subscription_events WHERE prepared = 0 ORDER BY id LIMIT 100').all();
        if (!events.length) return;
        const graph = resourceGraph(db);
        const users = db.prepare('SELECT DISTINCT user_id FROM subscriptions WHERE enabled = 1').all();
        const userRecords = new Map(users.map(user => [user.user_id, records(user.user_id)]));
        db.transaction(() => {
            for (const event of events) {
                const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(event.entry_id);
                if (canNotify(entry, graph)) for (const user of users) {
                    if (subscribedToEntry(entry, graph, userRecords.get(user.user_id), event.id)) {
                        db.prepare('INSERT OR IGNORE INTO subscription_deliveries (event_id, user_id) VALUES (?, ?)').run(event.id, user.user_id);
                    }
                }
                db.prepare('UPDATE subscription_events SET prepared = 1 WHERE id = ?').run(event.id);
            }
        })();
    }
    async function drain() {
        if (!mailer.enabled || !origin) return;
        prepare();
        // After a crash, an uncertain in-flight SMTP operation is held for a
        // full cooldown before retrying, so restarting cannot cause a burst.
        db.prepare(`UPDATE subscription_deliveries SET status = 'pending' WHERE status = 'sending' AND NOT EXISTS (
            SELECT 1 FROM users u JOIN subscription_mail_state s ON s.email = u.email
            WHERE u.id = subscription_deliveries.user_id AND s.reserved_until > ?)`)
            .run(clock());
        const queue = db.prepare(`SELECT d.*, e.entry_id FROM subscription_deliveries d JOIN subscription_events e ON e.id = d.event_id
            WHERE d.status = 'pending' AND d.retry_at <= ? ORDER BY d.event_id, d.user_id LIMIT 20`).all(clock());
        for (const item of queue) {
            if (stopping) break;
            const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(item.entry_id);
            const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(item.user_id);
            const graph = resourceGraph(db);
            const finish = status => db.prepare('UPDATE subscription_deliveries SET status = ? WHERE event_id = ? AND user_id = ?').run(status, item.event_id, item.user_id);
            if (!user || db.prepare('SELECT email FROM user_blacklist WHERE email=?').get(user.email) || !canNotify(entry, graph) || !subscribedToEntry(entry, graph, records(user.id), item.event_id)) { finish('skipped'); continue; }
            const claimed = db.transaction(() => {
                const delivery = db.prepare('SELECT status FROM subscription_deliveries WHERE event_id = ? AND user_id = ?').get(item.event_id, item.user_id);
                if (delivery?.status !== 'pending') return false;
                const state = db.prepare('SELECT * FROM subscription_mail_state WHERE email = ?').get(user.email);
                if (state?.reserved_until > clock() || (state?.last_sent_at > 0 && state.last_sent_at + NOTIFICATION_COOLDOWN > clock())) { finish('skipped'); return false; }
                db.prepare(`INSERT INTO subscription_mail_state (email, reserved_until) VALUES (?, ?)
                    ON CONFLICT(email) DO UPDATE SET reserved_until = excluded.reserved_until`).run(user.email, clock() + NOTIFICATION_COOLDOWN + 60000);
                db.prepare("UPDATE subscription_deliveries SET status = 'sending', attempts = attempts + 1 WHERE event_id = ? AND user_id = ?").run(item.event_id, user.id);
                return true;
            })();
            if (!claimed) continue;
            let accepted = false;
            try {
                const siteName = db.prepare('SELECT name FROM profile WHERE id = 1').get()?.name || '个人主页';
                const title = entry.title || '一条新的短帖';
                const label = entry.kind === 'moment' ? (entry.format === 'short' ? '短帖' : '长文') : ({ collection: '合集', gallery: '图集', document: '资源' }[entry.resource_kind] || '资源');
                const summary = (entry.summary || (entry.format === 'short' ? entry.body : '')).slice(0, 400);
                await mailer.sendNotification({ email: user.email, siteName, title, summary, label, url: origin + notificationPath(entry), manageUrl: origin + (entry.kind === 'moment' ? '/moments' : '/resource') });
                accepted = true;
                db.transaction(() => {
                    db.prepare('UPDATE subscription_mail_state SET last_sent_at = ?, reserved_until = 0 WHERE email = ?').run(clock(), user.email);
                    finish('sent');
                })();
            } catch (cause) {
                // If SMTP succeeded but recording the result failed, retain the
                // reservation rather than risk sending the same mailbox again.
                if (accepted) throw cause;
                db.transaction(() => {
                    // A timeout may occur after the SMTP server accepted DATA.
                    // Only an explicit rejection can safely release the lease.
                    const rejected = ['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(cause.code) || Number(cause.responseCode) >= 400;
                    const reservation = db.prepare('SELECT reserved_until FROM subscription_mail_state WHERE email = ?').get(user.email)?.reserved_until || 0;
                    if (rejected) db.prepare('UPDATE subscription_mail_state SET reserved_until = 0 WHERE email = ?').run(user.email);
                    const retryAt = Math.max(clock() + 60000 * (item.attempts + 1), rejected ? 0 : reservation);
                    db.prepare('UPDATE subscription_deliveries SET status = ?, retry_at = ? WHERE event_id = ? AND user_id = ?')
                        .run(item.attempts + 1 >= 3 ? 'failed' : 'pending', retryAt, item.event_id, user.id);
                })();
                console.warn('订阅邮件发送失败:', String(cause.code || 'MAIL_DELIVERY_FAILED'));
            }
        }
    }
    const process = () => {
        if (active) return active;
        active = drain().finally(() => { active = null; });
        return active;
    };
    return {
        process,
        start() {
            if (interval) return;
            stopping = false;
            if (!mailer.enabled || !origin) { console.warn('订阅邮件未启用：请检查 QQ 邮箱与 PUBLIC_SITE_URL 配置'); return; }
            const tick = () => process().catch(() => console.warn('订阅队列处理失败，将稍后重试'));
            interval = setInterval(tick, 3000); interval.unref(); tick();
        },
        async stop() { stopping = true; clearInterval(interval); interval = null; if (active) await active; }
    };
}
