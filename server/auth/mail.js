import nodemailer from 'nodemailer';
import { FEEDBACK_CATEGORIES } from '../feedback/store.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function verificationMessage({ siteName, code, purpose = 'register' }) {
    const name = escape(siteName);
    const reset = purpose === 'password-reset';
    const action = reset ? '重设密码' : '注册';
    return {
        subject: `【${siteName}】${action}验证码`,
        text: `${siteName}\n\n你的${action}验证码：${code}\n\n验证码在 2 分钟内有效，仅用于本次${action}。获取新验证码后旧码立即失效。请勿向他人透露验证码。${reset ? '\n\n重设后会自动登录，其他设备的登录状态将失效。' : ''}\n\n如果不是你本人发起的${action}，请忽略这封邮件。网站不会索取你的邮箱密码，也不会读取你的邮箱。`,
        html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4efe6;color:#293b4d;font-family:'Microsoft YaHei',Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe6;padding:36px 18px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px"><tr><td style="padding:0 0 24px;font-size:22px;font-weight:800"><span style="color:#d49b4a">▌</span> ${name}</td></tr>
<tr><td style="background:#c8d5d7;border-radius:8px;padding:0 7px 8px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="background:#fffbf4;border-radius:8px;padding:32px 26px">
<span style="display:inline-block;background:#f3ddb8;border-radius:4px;padding:5px 10px;font-size:12px;font-weight:700">${reset ? '找回你的账号' : '欢迎来到我的小站'}</span>
<h1 style="font-size:27px;line-height:1.4;margin:18px 0 12px">${reset ? '重设你的密码' : '验证你的邮箱'}</h1>
<p style="font-size:15px;line-height:1.8;color:#59636b">请将下面的验证码填入${action}页面：</p>
<div style="background:#f4e2c4;border-radius:5px;padding:18px 12px;text-align:center;font-size:34px;font-weight:800;letter-spacing:8px;color:#293b4d">${escape(code)}</div>
<p style="font-size:14px;line-height:1.8;margin:20px 0 0">验证码 <strong>2 分钟内有效</strong>。获取新验证码后旧码立即失效，请勿向他人透露。</p>
${reset ? '<p style="font-size:14px;line-height:1.8">重设后会自动登录，其他设备的登录状态将失效。</p>' : ''}
<p style="font-size:12px;line-height:1.8;color:#59636b;margin:20px 0 0">如果不是你本人发起的${action}，请忽略这封邮件。我们不会索取你的邮箱密码，也不会读取你的邮箱。</p>
</td></tr></table></td></tr><tr><td style="padding:22px 2px;font-size:12px;color:#827f79;line-height:1.8">这是一封${action}验证邮件，不包含广告或订阅内容。</td></tr></table>
</td></tr></table></body></html>`
    };
}

export function subscriptionMessage({ siteName, title, summary, label, url, manageUrl }) {
    return {
        subject: `【${siteName}】新${label}：${title}`.replace(/[\r\n]/g, ' ').slice(0, 240),
        text: `${siteName}\n\n你订阅的内容有更新\n\n${label}：${title}\n${summary || ''}\n\n查看新内容：${url}\n\n管理或取消订阅：${manageUrl}\n\n这封邮件仅因你主动订阅而发送。`,
        html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4efe6;color:#293b4d;font-family:'Microsoft YaHei',Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 18px;background:#f4efe6"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px">
<tr><td style="padding:0 0 24px;font-size:22px;font-weight:800"><span style="color:#d49b4a">▌</span> ${escape(siteName)}</td></tr>
<tr><td style="background:#c8d5d7;border-radius:8px;padding:0 7px 8px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="background:#fffbf4;border-radius:8px;padding:32px 26px">
<span style="display:inline-block;background:#f3ddb8;border-radius:4px;padding:5px 10px;font-size:12px;font-weight:700">你订阅的内容有更新</span>
<p style="margin:22px 0 8px;color:#59636b;font-size:13px">新${escape(label)}</p><h1 style="font-size:25px;line-height:1.5;margin:0 0 16px;overflow-wrap:anywhere">${escape(title)}</h1>
${summary ? `<p style="font-size:15px;line-height:1.8;color:#59636b;white-space:pre-wrap">${escape(summary)}</p>` : ''}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td style="background:#c8d5d7;border-radius:5px;padding:0 4px 5px 0"><a href="${escape(url)}" style="display:inline-block;background:#f3ddb8;padding:13px 20px;border-radius:5px;color:#293b4d;font-size:14px;font-weight:800;text-decoration:none">查看新内容 ↗</a></td></tr></table>
<p style="font-size:12px;line-height:1.8;color:#59636b;margin:24px 0 0">你可以随时在网站上<a href="${escape(manageUrl)}" style="color:#293b4d">管理或取消订阅</a>。</p>
</td></tr></table></td></tr><tr><td style="padding:22px 2px;font-size:12px;color:#827f79;line-height:1.8">这封邮件仅因你主动订阅而发送。不需要回复，也无需提供邮箱权限。</td></tr></table></td></tr></table></body></html>`
    };
}

export function discussionMessage({ kind, siteName, title, name, body, details, url, manageUrl }) {
    const report = kind === 'report';
    const heading = report ? '有一条新的评论举报' : '有人回复了你的评论';
    const footer = report ? '请在管理后台查看举报记录并处理。' : '如果您不愿接收回复提醒邮件，可以通过“个人账号 → 账号设置 → 接收回复提醒邮件”关闭。';
    return {
        subject: `【${siteName}】${heading}：${title}`.replace(/[\r\n]/g, ' ').slice(0, 240),
        text: `${siteName}\n\n${heading}\n${title}\n\n${name}\n${details}\n${body}\n\n查看内容：${url}\n${report ? '举报内容处理' : '账号设置'}：${manageUrl}\n\n${footer}`,
        html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="color-scheme" content="light only"></head><body style="margin:0;background:#f4efe6;color:#293b4d;font-family:'Microsoft YaHei',Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:30px 18px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:520px"><tr><td style="padding:0 0 20px;font-size:22px;font-weight:800">${escape(siteName)}</td></tr><tr><td style="padding:0 6px 7px 0;background:#c8d5d7;border-radius:6px"><div style="padding:28px;background:#fffbf4;border-radius:6px"><span style="padding:5px 10px;background:#f3ddb8;font-size:12px">${heading}</span><h1 style="font-size:24px;line-height:1.5;margin:20px 0">${escape(title)}</h1><p style="font-weight:700">${escape(name)}</p><p style="white-space:pre-wrap;font-size:14px;line-height:1.8">${escape(details)}</p><div style="padding:16px;background:#f4e2c4;white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.8">${escape(body)}</div><p style="margin-top:24px"><a href="${escape(url)}" style="color:#293b4d;font-weight:700">查看内容 ↗</a></p><p style="font-size:12px;color:#59636b;line-height:1.8">${footer}<br><a href="${escape(manageUrl)}" style="color:#293b4d">${report ? '前往举报内容处理' : '前往账号设置'}</a></p></div></td></tr></table></td></tr></table></body></html>`
    };
}

export function feedbackMessage({ id, siteName, category, username, email, user_id, body, song, artist, notes, created_at, manageUrl, pictures = [] }) {
    const label = FEEDBACK_CATEGORIES[category];
    const content = category === 'music' ? `歌名：${song}\n歌手名：${artist}\n其他备注：${notes || '无'}` : body;
    const author = `用户名：${username}\n邮箱：${email}\n用户 ID：${user_id ?? '已注销'}\n提交时间：${new Date(created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
    const cid = image => `feedback-${id}-${image.id}@personal-pages`;
    return {
        subject: `【${siteName}】${label} · ${username}`.replace(/[\r\n]/g, ' ').slice(0, 240),
        text: `${siteName}\n\n新反馈 #${id} · ${label}\n\n${author}\n\n${content}\n\n${pictures.length ? '辅助图片：' + pictures.map(image => image.name).join('、') + '（随邮件附上）\n\n' : ''}${manageUrl ? '反馈管理：' + manageUrl : '请登录网站管理端的“反馈管理”处理。'}`,
        html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="color-scheme" content="light only"></head><body style="margin:0;background:#f4efe6;color:#293b4d;font-family:'Microsoft YaHei',Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:30px 18px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:520px"><tr><td style="padding:0 0 20px;font-size:22px;font-weight:800">${escape(siteName)}</td></tr><tr><td style="padding:0 6px 7px 0;background:#c8d5d7;border-radius:6px"><div style="padding:28px;background:#fffbf4;border-radius:6px"><span style="padding:5px 10px;background:#f3ddb8;font-size:12px">新反馈 #${id} · ${escape(label)}</span><h1 style="font-size:24px;margin:20px 0">${escape(username)}</h1><p style="white-space:pre-wrap;font-size:13px;line-height:1.8">${escape(author)}</p><div style="padding:16px;background:#f4e2c4;white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.8">${escape(content)}</div>${pictures.map(image => `<p style="font-size:12px">${escape(image.name)}</p><img src="cid:${cid(image)}" alt="${escape(image.name)}" style="display:block;width:100%;height:auto;margin-bottom:16px" />`).join('')}<p style="margin-top:24px;font-size:13px">${manageUrl ? `<a href="${escape(manageUrl)}" style="color:#293b4d;font-weight:700">前往反馈管理 ↗</a>` : '请登录网站管理端的“反馈管理”处理。'}</p></div></td></tr></table></td></tr></table></body></html>`,
        attachments: pictures.map(image => ({ filename: image.name, content: image.content, contentType: image.mime_type, cid: cid(image) }))
    };
}

export function createRegistrationMailer(env = process.env) {
    const user = String(env.QQ_SMTP_USER || '').trim();
    const pass = String(env.QQ_SMTP_AUTH_CODE || '').replace(/\s/g, '');
    const enabled = /^[^\s@]+@qq\.com$/i.test(user) && /^[a-z0-9]{16}$/i.test(pass);
    // No connection is attempted until an actual verification request arrives.
    const transport = enabled ? nodemailer.createTransport({
        host: 'smtp.qq.com', port: 465, secure: true,
        auth: { user, pass },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        disableFileAccess: true, disableUrlAccess: true,
        logger: false, debug: false
    }) : null;
    const deliver = async (email, siteName, message) => {
        if (!transport) throw new Error('MAIL_NOT_CONFIGURED');
        const result = await transport.sendMail({ from: { name: siteName, address: user }, to: { address: email }, ...message });
        if (!result.accepted?.length) throw new Error('MAIL_NOT_ACCEPTED');
    };
    return {
        enabled,
        ownerEmail: user,
        async send({ email, code, siteName, purpose }) {
            await deliver(email, siteName, verificationMessage({ siteName, code, purpose }));
        },
        async sendNotification({ email, ...fields }) {
            await deliver(email, fields.siteName, subscriptionMessage(fields));
        },
        async sendReplyNotification({ email, ...fields }) {
            await deliver(email, fields.siteName, discussionMessage({ ...fields, kind: 'reply' }));
        },
        async sendReportNotification(fields) {
            await deliver(user, fields.siteName, discussionMessage({ ...fields, kind: 'report' }));
        },
        async sendFeedbackNotification(fields) {
            await deliver(user, fields.siteName, { ...feedbackMessage(fields), replyTo: { name: fields.username, address: fields.email } });
        }
    };
}
