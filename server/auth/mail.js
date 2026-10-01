import nodemailer from 'nodemailer';

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
    return {
        enabled,
        async send({ email, code, siteName, purpose }) {
            if (!transport) throw new Error('MAIL_NOT_CONFIGURED');
            const message = verificationMessage({ siteName, code, purpose });
            const result = await transport.sendMail({ from: { name: siteName, address: user }, to: { address: email }, ...message });
            if (!result.accepted?.length) throw new Error('MAIL_NOT_ACCEPTED');
        }
    };
}
