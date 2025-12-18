import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 数据目录路径
const DATA_DIR = join(__dirname, 'data');

// 确保数据目录存在
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log('✓ 数据目录已创建');
}

// 数据库文件路径
const DB_PATH = join(DATA_DIR, 'database.sqlite');

console.log(`数据库路径: ${DB_PATH}`);

// 创建或打开数据库
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 初始化数据库表
function initializeDatabase() {
    try {
        // 创建评论表
        db.exec(`
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_id TEXT NOT NULL DEFAULT 'home',
                username TEXT NOT NULL,
                email TEXT,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建索引
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_page_created ON comments(page_id, created_at DESC)
        `);

        console.log('✓ 数据库表已初始化');

        // 检查是否有数据，如果没有则插入示例数据
        const count = db.prepare('SELECT COUNT(*) as count FROM comments').get();
        
        if (count.count === 0) {
            const insert = db.prepare(`
                INSERT INTO comments (page_id, username, email, content) VALUES (?, ?, ?, ?)
            `);

            insert.run('home', '奎宁zzzz', 'admin@example.com', '欢迎来到我的个人主页！');
            insert.run('home', '访客001', 'visitor@example.com', '网站设计得很不错！');
            insert.run('tutorial', '学习者', 'learner@example.com', '教程很实用！');

            console.log('✓ 示例数据已插入');
        }

        console.log('✓ SQLite 数据库已就绪');
    } catch (error) {
        console.error('✗ 数据库初始化失败:', error.message);
        throw error;
    }
}

// 执行初始化
initializeDatabase();

export default db;
