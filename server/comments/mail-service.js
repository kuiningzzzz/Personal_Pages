import { createHash } from 'node:crypto';
import { isBlacklisted } from '../auth/routes.js';
import { commentableEntry, commentPath } from './store.js';

export const REPORT_MAIL_COOLDOWN = 30 * 60000;
export function createDiscussionMailService({ db, mailer, origin, clock = Date.now }) {
    let active; let interval; let stopping = false;
    async function drain() {
        if (!mailer.enabled || !origin) return;
        db.prepare("UPDATE discussion_mail_queue SET status='pending' WHERE status='sending' AND lease_until<=?").run(clock());
        const queue = db.prepare("SELECT * FROM discussion_mail_queue WHERE status='pending' AND retry_at<=? ORDER BY id LIMIT 20").all(clock());
        for (const item of queue) {
            if (stopping) break;
            const mark = status => db.prepare('UPDATE discussion_mail_queue SET status=? WHERE id=?').run(status, item.id);
            let fields; let stateKey;
            if (item.kind === 'report') {
                const report = db.prepare('SELECT * FROM comment_reports WHERE id=?').get(item.report_id);
                const comment = report?.comment_id ? db.prepare('SELECT reports_muted FROM entry_comments WHERE id=?').get(report.comment_id) : null;
                if (!report || report.status !== 'pending' || !comment || comment.reports_muted) { mark('skipped'); continue; }
                stateKey = createHash('sha256').update(`reports:${mailer.ownerEmail}`).digest('hex');
                fields = { kind: 'report', title: report.entry_title, name: report.author_name, body: report.body,
                    details: `${JSON.parse(report.reasons).join('、')}${report.description ? '\n' + report.description : ''}`,
                    url: origin + report.entry_path, manageUrl: origin + '/admin?tab=feedback&section=reports' };
            } else {
                const comment = db.prepare('SELECT c.*,u.username FROM entry_comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(item.comment_id);
                const user = db.prepare('SELECT * FROM users WHERE id=?').get(item.user_id);
                const entry = comment ? commentableEntry(db, comment.entry_id) : null;
                // A reply addressed to a withdrawn target no longer has a recipient.
                if (!comment?.reply_to_id || !user || !entry || !user.reply_notifications || isBlacklisted(db, user.email)) { mark('skipped'); continue; }
                fields = { kind: 'reply', email: user.email, title: entry.title, name: comment.username, body: comment.body,
                    details: `回复 @${comment.reply_to_name}：`, url: origin + commentPath(entry, comment.id), manageUrl: origin + '/account' };
            }
            const lease = item.kind === 'report' ? REPORT_MAIL_COOLDOWN + 60000 : 120000;
            const claimed = db.transaction(() => {
                if (db.prepare('SELECT status FROM discussion_mail_queue WHERE id=?').get(item.id)?.status !== 'pending') return false;
                if (stateKey) {
                    const state = db.prepare('SELECT * FROM discussion_mail_state WHERE key=?').get(stateKey);
                    if (state?.reserved_until > clock() || (state?.last_sent_at > 0 && state.last_sent_at + REPORT_MAIL_COOLDOWN > clock())) { mark('skipped'); return false; }
                    db.prepare(`INSERT INTO discussion_mail_state (key,reserved_until) VALUES (?,?)
                        ON CONFLICT(key) DO UPDATE SET reserved_until=excluded.reserved_until`).run(stateKey, clock() + lease);
                }
                db.prepare("UPDATE discussion_mail_queue SET status='sending',attempts=attempts+1,lease_until=? WHERE id=?").run(clock() + lease, item.id);
                return true;
            })();
            if (!claimed) continue;
            let accepted = false;
            try {
                fields.siteName = db.prepare('SELECT name FROM profile WHERE id=1').get()?.name || '个人主页';
                if (item.kind === 'report') await mailer.sendReportNotification(fields);
                else await mailer.sendReplyNotification(fields);
                accepted = true;
                db.transaction(() => {
                    if (stateKey) db.prepare('UPDATE discussion_mail_state SET last_sent_at=?,reserved_until=0 WHERE key=?').run(clock(), stateKey);
                    mark('sent');
                })();
            } catch (cause) {
                if (accepted) throw cause;
                const rejected = ['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(cause.code) || Number(cause.responseCode) >= 400;
                db.transaction(() => {
                    if (stateKey && rejected) db.prepare('UPDATE discussion_mail_state SET reserved_until=0 WHERE key=?').run(stateKey);
                    db.prepare('UPDATE discussion_mail_queue SET status=?,retry_at=? WHERE id=?')
                        .run(item.attempts + 1 >= 3 ? 'failed' : 'pending', clock() + (rejected ? 60000 * (item.attempts + 1) : lease), item.id);
                })();
                console.warn('评论通知邮件发送失败:', String(cause.code || 'MAIL_DELIVERY_FAILED'));
            }
        }
    }
    const process = () => {
        if (!active) active = drain().finally(() => { active = null; });
        return active;
    };
    return {
        process,
        start() {
            stopping = false;
            if (interval || !mailer.enabled || !origin) return;
            const tick = () => process().catch(() => console.warn('评论通知队列处理失败，将稍后重试'));
            interval = setInterval(tick, 3000); interval.unref(); tick();
        },
        async stop() { stopping = true; clearInterval(interval); interval = null; if (active) await active; }
    };
}
