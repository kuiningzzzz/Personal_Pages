import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { 
    readdir, 
    readFile, 
    writeFile, 
    unlink, 
    stat, 
    mkdir 
} from 'fs/promises';
import { existsSync } from 'fs';
import multer from 'multer';
import db from './db.js';

const router = express.Router();

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 使用绝对路径，因为在Docker容器中 public 目录挂载在 /app/public
const PUBLIC_DIR = process.env.NODE_ENV === 'production' 
    ? '/app/public' 
    : join(__dirname, '..', 'public');

// 配置文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const category = req.body.category || 'other';
        let uploadPath = join(PUBLIC_DIR, 'picture');
        
        if (category === 'tutorials') {
            uploadPath = join(uploadPath, 'tutorials');
        } else if (category === 'friend_avatar') {
            uploadPath = join(PUBLIC_DIR, 'friend_avatar');
        }
        
        // 确保目录存在
        if (!existsSync(uploadPath)) {
            mkdir(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // 保持原文件名，使用 UTF-8 编码
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, originalName);
    }
});

const upload = multer({ storage });

// ==================== 文章管理 API ====================

// 获取所有文章列表
router.get('/articles', async (req, res) => {
    try {
        console.log('📁 PUBLIC_DIR:', PUBLIC_DIR);
        const articlesDir = join(PUBLIC_DIR, 'articles');
        console.log('📁 articlesDir:', articlesDir);
        console.log('📁 articlesDir exists:', existsSync(articlesDir));
        
        const categories = ['tutorials', 'projects', 'note'];
        const articles = [];

        for (const category of categories) {
            const categoryPath = join(articlesDir, category);
            console.log(`📂 Checking ${category}:`, categoryPath);
            if (!existsSync(categoryPath)) {
                console.log(`❌ ${category} does not exist`);
                continue;
            }

            const files = await readdir(categoryPath);
            console.log(`📄 Files in ${category}:`, files);
            
            for (const file of files) {
                if (!file.endsWith('.md')) continue;

                const filePath = join(categoryPath, file);
                const stats = await stat(filePath);
                const relativePath = `/articles/${category}/${file}`;

                articles.push({
                    name: file,
                    path: relativePath,
                    category,
                    size: stats.size,
                    modified: stats.mtime
                });
            }
        }

        console.log('✅ Total articles found:', articles.length);
        res.json({
            success: true,
            data: articles
        });
    } catch (error) {
        console.error('❌ 获取文章列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取文章列表失败: ' + error.message
        });
    }
});

// 获取文章内容
router.get('/articles/content', async (req, res) => {
    try {
        const { path } = req.query;
        if (!path) {
            return res.status(400).json({
                success: false,
                message: '缺少文章路径'
            });
        }

        const filePath = join(PUBLIC_DIR, path);
        const content = await readFile(filePath, 'utf-8');

        res.json({
            success: true,
            data: content
        });
    } catch (error) {
        console.error('读取文章内容失败:', error);
        res.status(500).json({
            success: false,
            message: '读取文章内容失败'
        });
    }
});

// 创建新文章
router.post('/articles', async (req, res) => {
    try {
        const { category, filename, content } = req.body;

        if (!category || !filename || !content) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        const categoryPath = join(PUBLIC_DIR, 'articles', category);
        if (!existsSync(categoryPath)) {
            await mkdir(categoryPath, { recursive: true });
        }

        const filePath = join(categoryPath, filename);
        
        // 检查文件是否已存在
        if (existsSync(filePath)) {
            return res.status(400).json({
                success: false,
                message: '文件已存在'
            });
        }

        await writeFile(filePath, content, 'utf-8');

        res.json({
            success: true,
            message: '文章创建成功'
        });
    } catch (error) {
        console.error('创建文章失败:', error);
        res.status(500).json({
            success: false,
            message: '创建文章失败'
        });
    }
});

// 更新文章
router.put('/articles', async (req, res) => {
    try {
        const { category, filename, content, oldPath } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                message: '缺少文章内容'
            });
        }

        const filePath = oldPath ? join(PUBLIC_DIR, oldPath) : join(PUBLIC_DIR, 'articles', category, filename);
        await writeFile(filePath, content, 'utf-8');

        res.json({
            success: true,
            message: '文章更新成功'
        });
    } catch (error) {
        console.error('更新文章失败:', error);
        res.status(500).json({
            success: false,
            message: '更新文章失败'
        });
    }
});

// 删除文章
router.delete('/articles', async (req, res) => {
    try {
        const { path } = req.body;

        if (!path) {
            return res.status(400).json({
                success: false,
                message: '缺少文章路径'
            });
        }

        const filePath = join(PUBLIC_DIR, path);
        await unlink(filePath);

        res.json({
            success: true,
            message: '文章删除成功'
        });
    } catch (error) {
        console.error('删除文章失败:', error);
        res.status(500).json({
            success: false,
            message: '删除文章失败'
        });
    }
});

// ==================== 图片管理 API ====================

// 获取所有图片列表
router.get('/images', async (req, res) => {
    try {
        const pictureDir = join(PUBLIC_DIR, 'picture');
        const friendAvatarDir = join(PUBLIC_DIR, 'friend_avatar');
        const images = [];

        // 递归读取图片
        const readImagesRecursive = async (dir, baseDir = 'picture') => {
            if (!existsSync(dir)) return;

            const files = await readdir(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = join(dir, file.name);
                
                if (file.isDirectory()) {
                    await readImagesRecursive(fullPath, baseDir);
                } else if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(file.name)) {
                    const stats = await stat(fullPath);
                    const relativePath = fullPath.replace(PUBLIC_DIR, '').replace(/\\/g, '/');
                    
                    images.push({
                        name: file.name,
                        path: relativePath,
                        relativePath: relativePath,
                        url: relativePath,
                        size: stats.size,
                        modified: stats.mtime
                    });
                }
            }
        };

        await readImagesRecursive(pictureDir, 'picture');
        await readImagesRecursive(friendAvatarDir, 'friend_avatar');

        res.json({
            success: true,
            data: images
        });
    } catch (error) {
        console.error('获取图片列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取图片列表失败'
        });
    }
});

// 上传图片
router.post('/images', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: '没有上传文件'
            });
        }

        const uploadedFiles = req.files.map(file => ({
            name: file.originalname,
            path: file.path,
            size: file.size
        }));

        res.json({
            success: true,
            message: '图片上传成功',
            data: uploadedFiles
        });
    } catch (error) {
        console.error('上传图片失败:', error);
        res.status(500).json({
            success: false,
            message: '上传图片失败'
        });
    }
});

// 删除图片
router.delete('/images', async (req, res) => {
    try {
        const { path } = req.body;

        if (!path) {
            return res.status(400).json({
                success: false,
                message: '缺少图片路径'
            });
        }

        const filePath = join(PUBLIC_DIR, path);
        await unlink(filePath);

        res.json({
            success: true,
            message: '图片删除成功'
        });
    } catch (error) {
        console.error('删除图片失败:', error);
        res.status(500).json({
            success: false,
            message: '删除图片失败'
        });
    }
});

// ==================== 卡片配置管理 API ====================

// 获取卡片配置
router.get('/cards/:type', async (req, res) => {
    try {
        const { type } = req.params;
        
        const stmt = db.prepare('SELECT * FROM card_configs WHERE type = ?');
        const rows = stmt.all(type);
        
        const cards = rows.map(row => JSON.parse(row.data));

        res.json({
            success: true,
            data: cards
        });
    } catch (error) {
        console.error('获取卡片配置失败:', error);
        res.status(500).json({
            success: false,
            message: '获取卡片配置失败'
        });
    }
});

// 更新卡片配置
router.put('/cards/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { cards } = req.body;

        if (!Array.isArray(cards)) {
            return res.status(400).json({
                success: false,
                message: '卡片数据格式错误'
            });
        }

        // 删除旧配置
        db.prepare('DELETE FROM card_configs WHERE type = ?').run(type);

        // 插入新配置
        const insert = db.prepare('INSERT INTO card_configs (type, data, display_order) VALUES (?, ?, ?)');
        cards.forEach((card, index) => {
            insert.run(type, JSON.stringify(card), index);
        });

        res.json({
            success: true,
            message: '卡片配置更新成功'
        });
    } catch (error) {
        console.error('更新卡片配置失败:', error);
        res.status(500).json({
            success: false,
            message: '更新卡片配置失败'
        });
    }
});

export default router;
