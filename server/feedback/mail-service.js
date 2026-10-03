import { readFileSync } from 'node:fs';
import { feedbackRoot, feedbackImagePath } from './store.js';

export function createFeedbackMailService({ db, mailer, origin, clock = Date.now, root = feedbackRoot }) {
    let active, interval, stopping = false;
    async function drain() {
        if (!mailer.enabled) return;
        db.prepare("UPDATE visitor_feedback SET mail_status='pending' WHERE mail_status='sending' AND lease_until<=?").run(clock());
        const rows = db.prepare("SELECT * FROM visitor_feedback WHERE mail_status='pending' AND retry_at<=? ORDER BY id LIMIT 20").all(clock());
        for (const row of rows) {
            if (stopping) break;
            const claimed = db.prepare("UPDATE visitor_feedback SET mail_status='sending',mail_attempts=mail_attempts+1,lease_until=? WHERE id=? AND mail_status='pending'").run(clock() + 120000, row.id).changes;
            if (!claimed) continue;
            try {
                const images = db.prepare('SELECT * FROM feedback_images WHERE feedback_id=? ORDER BY id').all(row.id);
                const pictures = images.map(image => ({ ...image, content: readFileSync(feedbackImagePath(root, image.filename)) }));
                await mailer.sendFeedbackNotification({ ...row, pictures, siteName: db.prepare('SELECT name FROM profile WHERE id=1').get()?.name || '个人主页',
                    manageUrl: origin ? origin + '/admin?tab=feedback' : '' });
                db.prepare("UPDATE visitor_feedback SET mail_status='sent',lease_until=0 WHERE id=?").run(row.id);
            } catch (cause) {
                db.prepare('UPDATE visitor_feedback SET mail_status=?,retry_at=?,lease_until=0 WHERE id=?')
                    .run(row.mail_attempts + 1 >= 3 ? 'failed' : 'pending', clock() + 60000 * (row.mail_attempts + 1), row.id);
                console.warn('反馈邮件发送失败:', ['EAUTH','EENVELOPE','EMESSAGE','ENOENT','ETIMEDOUT'].includes(cause.code) ? cause.code : 'MAIL_DELIVERY_FAILED');
            }
        }
    }
    const process = () => { if (!active) active = drain().finally(() => { active = null; }); return active; };
    return {
        process,
        start() {
            stopping = false;
            if (interval || !mailer.enabled) return;
            const tick = () => process().catch(() => console.warn('反馈邮件队列处理失败，将稍后重试'));
            interval = setInterval(tick, 3000); interval.unref(); tick();
        },
        async stop() { stopping = true; clearInterval(interval); interval = null; if (active) await active; }
    };
}
