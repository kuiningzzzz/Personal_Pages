import './load-env.js';
import express from 'express';
import cors from 'cors';
import contentRoutes from './content-routes.js';
import contentAdminRoutes from './content-admin-routes.js';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.SERVER_PORT || 3002;

// 中间件
app.use(cors()); // 允许跨域请求
app.use(express.json({ limit: '2mb' })); // 解析 JSON 请求体
app.use(express.urlencoded({ extended: true })); // 解析 URL 编码的请求体

// 请求日志
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// API 路由
app.use('/api/content', contentRoutes);
app.use('/api/admin', contentAdminRoutes);

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
            resourceTypes: 'GET /api/content/resource-types',
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
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        message: '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`\n🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`📝 API 文档: http://localhost:${PORT}\n`);
});
