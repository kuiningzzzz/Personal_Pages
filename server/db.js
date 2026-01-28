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

        // 创建卡片配置表
        db.exec(`
            CREATE TABLE IF NOT EXISTS card_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                category TEXT,
                data TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建索引
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_card_type_order ON card_configs(type, display_order)
        `);

        console.log('✓ 数据库表已初始化');

        // 检查是否有数据，如果没有则插入示例数据
        const count = db.prepare('SELECT COUNT(*) as count FROM comments').get();
        
        if (count.count === 0) {
            const insert = db.prepare(`
                INSERT INTO comments (page_id, username, email, content) VALUES (?, ?, ?, ?)
            `);

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

// 初始化卡片配置数据（在数据库表创建后）
async function loadInitialData() {
    try {
        // 动态导入初始化数据脚本
        const { default: initializeCardConfigs } = await import('./init-data.js');
        // initializeCardConfigs 在导入时会自动执行
    } catch (error) {
        console.error('加载初始数据失败:', error);
    }
}

// 延迟执行，确保数据库表已创建
setTimeout(() => {
    loadInitialData();
}, 100);

export default db;
