import express from 'express';
import { commentDb } from './db.js';

const router = express.Router();

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

export default router;
