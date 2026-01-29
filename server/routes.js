import express from 'express';
import { commentDb } from './db.js';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';

const router = express.Router();

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = process.env.NODE_ENV === 'production' 
    ? '/app/public' 
    : join(__dirname, '..', 'public');

// ==================== 文章内容 API ====================

// 获取 Markdown 文章内容
router.get('/article', async (req, res) => {
    try {
        const { src } = req.query;
        
        if (!src) {
            return res.status(400).json({
                success: false,
                message: '缺少文章路径参数'
            });
        }

        // 安全检查：防止路径遍历攻击
        if (src.includes('..') || !src.startsWith('/articles/')) {
            return res.status(403).json({
                success: false,
                message: '非法的文件路径'
            });
        }

        const filePath = join(PUBLIC_DIR, src);
        const content = await readFile(filePath, 'utf-8');

        // 设置正确的 Content-Type 并允许缓存
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300'); // 缓存5分钟
        res.send(content);
        
    } catch (error) {
        console.error('读取文章失败:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({
                success: false,
                message: '文章不存在'
            });
        } else {
            res.status(500).json({
                success: false,
                message: '读取文章失败'
            });
        }
    }
});

// ==================== 评论 API ====================

// 获取所有评论（支持按页面筛选）
router.get('/comments', (req, res) => {
    try {
        const { page_id } = req.query;
        
        let stmt, rows;
        
        if (page_id) {
            // 获取指定页面的评论
            stmt = commentDb.prepare('SELECT * FROM comments WHERE page_id = ? ORDER BY created_at DESC');
            rows = stmt.all(page_id);
        } else {
            // 获取所有评论
            stmt = commentDb.prepare('SELECT * FROM comments ORDER BY created_at DESC');
            rows = stmt.all();
        }
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取评论失败:', error);
        res.status(500).json({
            success: false,
            message: '获取评论失败'
        });
    }
});

// 发表新评论
router.post('/comments', (req, res) => {
    try {
        const { page_id, username, email, content } = req.body;

        // 验证必填字段
        if (!page_id || !username || !content) {
            return res.status(400).json({
                success: false,
                message: '页面ID、用户名和评论内容不能为空'
            });
        }


        // 验证内容长度
        if (content.length > 500) {
            return res.status(400).json({
                success: false,
                message: '评论内容不能超过500字'
            });
        }

        // 插入评论
        const insert = commentDb.prepare(
            'INSERT INTO comments (page_id, username, email, content) VALUES (?, ?, ?, ?)'
        );
        const result = insert.run(page_id, username, email || null, content);

        // 获取新插入的评论
        const newComment = commentDb.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            data: newComment,
            message: '评论发表成功'
        });
    } catch (error) {
        console.error('发表评论失败:', error);
        res.status(500).json({
            success: false,
            message: '发表评论失败'
        });
    }
});

// 删除评论
router.delete('/comments/:id', (req, res) => {
    try {
        const { id } = req.params;

        const stmt = commentDb.prepare('DELETE FROM comments WHERE id = ?');
        const result = stmt.run(id);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }

        res.json({
            success: true,
            message: '评论删除成功'
        });
    } catch (error) {
        console.error('删除评论失败:', error);
        res.status(500).json({
            success: false,
            message: '删除评论失败'
        });
    }
});

// ==================== 表情包 API ====================

// 获取指定分类的表情包列表
router.get('/emoji/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const categoryPath = join(PUBLIC_DIR, 'emoji', category);

        if (!existsSync(categoryPath)) {
            return res.status(404).json({
                success: false,
                message: '分类不存在'
            });
        }

        // 读取目录中的所有图片文件
        const files = await readdir(categoryPath);
        const images = files
            .filter(file => {
                // 排除config.json和非图片文件
                if (file === 'config.json') return false;
                return /\.(jpg|jpeg|png|gif|webp)$/i.test(file);
            })
            .map(file => `/emoji/${category}/${file}`);

        res.json({
            success: true,
            images
        });
    } catch (error) {
        console.error('获取表情包失败:', error);
        res.status(500).json({
            success: false,
            message: '获取表情包失败'
        });
    }
});

export default router;
