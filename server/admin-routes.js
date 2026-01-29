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
import archiver from 'archiver';
import { cardDb } from './db.js';

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
        
        const stmt = cardDb.prepare('SELECT * FROM card_configs WHERE type = ?');
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
        cardDb.prepare('DELETE FROM card_configs WHERE type = ?').run(type);

        // 插入新配置
        const insert = cardDb.prepare('INSERT INTO card_configs (type, data, display_order) VALUES (?, ?, ?)');
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

// ==================== 表情包管理 API ====================

// 获取表情包分类列表
router.get('/emoji/categories', async (req, res) => {
    try {
        const emojiDir = join(PUBLIC_DIR, 'emoji');
        
        if (!existsSync(emojiDir)) {
            await mkdir(emojiDir, { recursive: true });
        }

        const categories = [];
        const folders = await readdir(emojiDir, { withFileTypes: true });

        for (const folder of folders) {
            if (!folder.isDirectory()) continue;

            const categoryId = folder.name;
            const categoryPath = join(emojiDir, categoryId);
            const configPath = join(categoryPath, 'config.json');
            
            // 读取分类配置
            let config = {
                id: categoryId,
                title: `表情包类型${categoryId}`,
                desc: `${categoryId}类型的表情包收藏`
            };

            if (existsSync(configPath)) {
                const configContent = await readFile(configPath, 'utf-8');
                config = { ...config, ...JSON.parse(configContent) };
            }

            // 获取该分类下的所有图片
            const files = await readdir(categoryPath);
            const images = files
                .filter(file => {
                    // 排除config.json和非图片文件
                    if (file === 'config.json') return false;
                    return /\.(jpg|jpeg|png|gif|webp)$/i.test(file);
                })
                .map(file => `/emoji/${categoryId}/${file}`);

            console.log(`📂 分类 ${categoryId}: 找到 ${images.length} 张图片`);

            categories.push({
                ...config,
                count: images.length,
                images
            });
        }

        // 读取排序配置
        const orderConfigPath = join(emojiDir, 'order.json');
        let orderedCategories = categories;
        
        if (existsSync(orderConfigPath)) {
            const orderContent = await readFile(orderConfigPath, 'utf-8');
            const order = JSON.parse(orderContent);
            
            // 按照配置的顺序排列
            orderedCategories = [];
            for (const id of order) {
                const cat = categories.find(c => c.id === id);
                if (cat) orderedCategories.push(cat);
            }
            // 添加未在配置中的新分类
            for (const cat of categories) {
                if (!order.includes(cat.id)) {
                    orderedCategories.push(cat);
                }
            }
        }

        res.json({
            success: true,
            data: orderedCategories
        });
    } catch (error) {
        console.error('获取表情包分类失败:', error);
        res.status(500).json({
            success: false,
            message: '获取表情包分类失败'
        });
    }
});

// 创建/更新表情包分类
router.post('/emoji/categories', async (req, res) => {
    try {
        const { id, title, desc } = req.body;

        if (!id || !title) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        // 验证ID格式
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: '分类ID只能包含字母、数字、下划线和连字符'
            });
        }

        const emojiDir = join(PUBLIC_DIR, 'emoji');
        const categoryPath = join(emojiDir, id);
        const configPath = join(categoryPath, 'config.json');

        // 创建目录
        if (!existsSync(categoryPath)) {
            await mkdir(categoryPath, { recursive: true });
        }

        // 保存配置
        const config = { id, title, desc };
        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

        res.json({
            success: true,
            message: '分类创建成功'
        });
    } catch (error) {
        console.error('创建分类失败:', error);
        res.status(500).json({
            success: false,
            message: '创建分类失败'
        });
    }
});

// 更新表情包分类
router.put('/emoji/categories', async (req, res) => {
    try {
        const { id, title, desc } = req.body;

        if (!id || !title) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        const categoryPath = join(PUBLIC_DIR, 'emoji', id);
        const configPath = join(categoryPath, 'config.json');

        if (!existsSync(categoryPath)) {
            return res.status(404).json({
                success: false,
                message: '分类不存在'
            });
        }

        // 更新配置
        const config = { id, title, desc };
        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

        res.json({
            success: true,
            message: '分类更新成功'
        });
    } catch (error) {
        console.error('更新分类失败:', error);
        res.status(500).json({
            success: false,
            message: '更新分类失败'
        });
    }
});

// 删除表情包分类
router.delete('/emoji/categories', async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: '缺少分类ID'
            });
        }

        const categoryPath = join(PUBLIC_DIR, 'emoji', id);

        if (!existsSync(categoryPath)) {
            return res.status(404).json({
                success: false,
                message: '分类不存在'
            });
        }

        // 递归删除目录及其内容
        const { rm } = await import('fs/promises');
        await rm(categoryPath, { recursive: true, force: true });

        console.log('✅ 已删除分类目录:', categoryPath);

        res.json({
            success: true,
            message: '分类删除成功'
        });
    } catch (error) {
        console.error('删除分类失败:', error);
        res.status(500).json({
            success: false,
            message: '删除分类失败'
        });
    }
});

// 保存表情包分类排序
router.put('/emoji/order', async (req, res) => {
    try {
        const { order } = req.body;

        if (!Array.isArray(order)) {
            return res.status(400).json({
                success: false,
                message: '排序数据格式错误'
            });
        }

        const emojiDir = join(PUBLIC_DIR, 'emoji');
        if (!existsSync(emojiDir)) {
            await mkdir(emojiDir, { recursive: true });
        }

        const orderConfigPath = join(emojiDir, 'order.json');
        await writeFile(orderConfigPath, JSON.stringify(order, null, 2), 'utf-8');

        res.json({
            success: true,
            message: '排序保存成功'
        });
    } catch (error) {
        console.error('保存排序失败:', error);
        res.status(500).json({
            success: false,
            message: '保存排序失败'
        });
    }
});

// 上传表情包图片 - 通过查询参数接收category
router.post('/emoji/images/:category', async (req, res) => {
    try {
        const { category } = req.params;
        
        if (!category) {
            return res.status(400).json({
                success: false,
                message: '缺少分类参数'
            });
        }
        
        console.log('📁 准备上传表情包到分类:', category);
        
        const uploadPath = join(PUBLIC_DIR, 'emoji', category);
        if (!existsSync(uploadPath)) {
            await mkdir(uploadPath, { recursive: true });
        }
        
        const categoryUpload = multer({
            storage: multer.diskStorage({
                destination: (req, file, cb) => {
                    cb(null, uploadPath);
                },
                filename: (req, file, cb) => {
                    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
                    cb(null, originalName);
                }
            })
        }).array('images', 20);
        
        categoryUpload(req, res, (err) => {
            if (err) {
                console.error('❌ 上传表情包失败:', err);
                return res.status(500).json({
                    success: false,
                    message: '上传表情包失败: ' + err.message
                });
            }
            
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
            
            console.log('✅ 成功上传', uploadedFiles.length, '个文件到', category);

            res.json({
                success: true,
                message: `成功上传 ${uploadedFiles.length} 张图片`,
                data: uploadedFiles
            });
        });
    } catch (error) {
        console.error('❌ 上传表情包失败:', error);
        res.status(500).json({
            success: false,
            message: '上传表情包失败'
        });
    }
});

// 删除表情包图片
router.delete('/emoji/images', async (req, res) => {
    try {
        const { category, path } = req.body;

        if (!category || !path) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        const filePath = join(PUBLIC_DIR, path);
        
        if (!existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: '图片不存在'
            });
        }

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

// ==================== 备份管理 API ====================

// 生成并下载public目录备份（排除favicon.ico）
router.get('/backup', async (req, res) => {
    try {
        console.log('📦 开始创建备份包...');
        
        // 设置响应头
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `public-backup-${timestamp}.zip`;
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // 创建压缩器
        const archive = archiver('zip', {
            zlib: { level: 9 } // 最高压缩级别
        });
        
        // 监听错误
        archive.on('error', (err) => {
            console.error('❌ 压缩失败:', err);
            throw err;
        });
        
        // 监听进度
        archive.on('progress', (progress) => {
            console.log(`📊 压缩进度: ${progress.entries.processed}/${progress.entries.total} 个文件`);
        });
        
        // 将压缩流发送给客户端
        archive.pipe(res);
        
        // 添加public目录内容（排除favicon.ico）
        const publicDir = PUBLIC_DIR;
        
        // 递归添加目录，但排除favicon.ico
        const addDirectory = async (dirPath, archivePath = '') => {
            const files = await readdir(dirPath, { withFileTypes: true });
            
            for (const file of files) {
                const fullPath = join(dirPath, file.name);
                const relativePath = archivePath ? join(archivePath, file.name) : file.name;
                
                // 跳过favicon.ico
                if (file.name === 'favicon.ico' && archivePath === '') {
                    console.log('⏭️  跳过 favicon.ico');
                    continue;
                }
                
                if (file.isDirectory()) {
                    await addDirectory(fullPath, relativePath);
                } else {
                    archive.file(fullPath, { name: relativePath });
                }
            }
        };
        
        await addDirectory(publicDir);
        
        console.log('✅ 备份包创建完成');
        
        // 完成压缩
        await archive.finalize();
        
    } catch (error) {
        console.error('❌ 创建备份失败:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: '创建备份失败: ' + error.message
            });
        }
    }
});

export default router;
