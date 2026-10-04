import './load-env.js';
import express from 'express';
import cors from 'cors';
import contentRoutes from './content-routes.js';
import contentAdminRoutes from './content-admin-routes.js';
import { startTasks, stopTasks, pauseTasksForBackup, resumeTasksAfterBackup } from './ai/tasks.js';
import { configureMaintenance, maintenanceMiddleware } from './maintenance.js';
import { randomBytes } from 'node:crypto';
import { cardDb } from './db.js';
import { createUserRoutes } from './auth/routes.js';
import { createRegistrationMailer } from './auth/mail.js';
import { createSubscriptionRoutes } from './subscriptions/routes.js';
import { createSubscriptionService, siteOrigin } from './subscriptions/service.js';
import { createCommentRoutes } from './comments/routes.js';
import { createDiscussionMailService } from './comments/mail-service.js';
import { createFeedbackRoutes } from './feedback/routes.js';
import { createFeedbackMailService } from './feedback/mail-service.js';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.SERVER_PORT || 3002;
const userMailer = createRegistrationMailer();
const subscriptions = createSubscriptionService({ db: cardDb, mailer: userMailer, origin: siteOrigin() });
const discussionMail = createDiscussionMailService({ db: cardDb, mailer: userMailer, origin: siteOrigin() });
const feedbackMail = createFeedbackMailService({ db: cardDb, mailer: userMailer, origin: siteOrigin() });
configureMaintenance({
    async pause() { pauseTasksForBackup(); await Promise.all([subscriptions.stop(), discussionMail.stop(), feedbackMail.stop()]); },
    resume() { subscriptions.start(); discussionMail.start(); feedbackMail.start(); resumeTasksAfterBackup(); }
});

// 中间件
app.use(cors()); // 允许跨域请求
app.use(maintenanceMiddleware);
app.use(express.json({ limit: '2mb' })); // 解析 JSON 请求体
app.use(express.urlencoded({ extended: true })); // 解析 URL 编码的请求体

// 请求日志
app.use((req, res, next) => {
    const userPaths = ['/api/auth/config', '/api/auth/session', '/api/auth/code', '/api/auth/register', '/api/auth/login', '/api/auth/reset-password', '/api/auth/settings', '/api/auth/logout'];
    const loggedPath = req.path.startsWith('/api/auth') ? (userPaths.includes(req.path) ? req.path : '/api/auth') : req.path.startsWith('/api/subscriptions') ? '/api/subscriptions' : req.url;
    console.log(`${new Date().toISOString()} - ${req.method} ${loggedPath}`);
    next();
});

// API 路由
app.use('/api/content', contentRoutes);
app.use('/api/admin', contentAdminRoutes);
app.use('/api/auth', createUserRoutes({ db: cardDb, mailer: userMailer, secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex') }));
app.use('/api/subscriptions', createSubscriptionRoutes({ db: cardDb }));
app.use('/api/comments', createCommentRoutes({ db: cardDb }));
app.use('/api/feedback', createFeedbackRoutes({ db: cardDb }));

// 根路径
app.get('/', (req, res) => {
    res.json({
        message: 'Personal Pages API Server',
        version: '2.0.0',
        endpoints: {
            profile: 'GET /api/content/profile',
            settings: 'GET /api/content/settings',
            entries: 'GET /api/content/entries',
            entry: 'GET /api/content/entries/:id',
            galleryArchive: 'POST /api/content/entries/:id/gallery-archive, GET /api/content/entries/:id/gallery-archive/:token',
            resourceTypes: 'GET /api/content/resource-types',
            subscriptions: 'GET, POST /api/subscriptions',
            comments: 'GET, POST /api/comments/:entryId',
            feedback: 'POST /api/feedback',
            users: { session: 'GET /api/auth/session', code: 'POST /api/auth/code', register: 'POST /api/auth/register', login: 'POST /api/auth/login', resetPassword: 'POST /api/auth/reset-password', logout: 'POST /api/auth/logout' },
            admin: {
                login: 'POST /api/admin/login',
                entries: 'GET, POST /api/admin/entries',
                profile: 'GET, PUT /api/admin/profile',
                upload: 'POST /api/admin/upload'
            }
        }
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '接口不存在'
    });
});

// 错误处理
app.use((err, req, res, next) => {
    if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/subscriptions') || req.path.startsWith('/api/comments') || req.path.startsWith('/api/admin/moderation') || req.path.startsWith('/api/feedback') || req.path.startsWith('/api/admin/feedback')) {
        // JSON parser errors may carry the submitted body. Do not print the
        // error object or parser message for authentication requests.
        console.error('用户接口错误:', err.type === 'entity.parse.failed' ? 'INVALID_JSON' : err.type === 'entity.too.large' ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR');
        const status = [400, 413].includes(err.status) ? err.status : 500;
        return res.status(status).json({ success: false, message: status === 400 ? '请求数据格式无效' : status === 413 ? '请求数据过大' : '服务器内部错误' });
    }
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        message: '服务器内部错误'
    });
});

// 启动服务器
const server = app.listen(PORT, () => {
    console.log(`\n🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`📝 API 文档: http://localhost:${PORT}\n`);
    startTasks();
    subscriptions.start();
    discussionMail.start();
    feedbackMail.start();
});
let closing = false;
async function shutdown() {
    if (closing) return;
    closing = true;
    server.close();
    await subscriptions.stop();
    await discussionMail.stop();
    await feedbackMail.stop();
    await stopTasks();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
