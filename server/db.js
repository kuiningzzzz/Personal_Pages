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
const COMMENT_DB_PATH = join(DATA_DIR, 'comment.sqlite');
const CARD_DB_PATH = join(DATA_DIR, 'card.sqlite');

console.log(`评论数据库路径: ${COMMENT_DB_PATH}`);
console.log(`卡片数据库路径: ${CARD_DB_PATH}`);

// 创建或打开数据库
const commentDb = new Database(COMMENT_DB_PATH);
const cardDb = new Database(CARD_DB_PATH);

// 启用外键约束
commentDb.pragma('foreign_keys = ON');
cardDb.pragma('foreign_keys = ON');

// 初始化数据库表
function initializeDatabase() {
    try {
        // 初始化评论数据库
        commentDb.exec(`
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_id TEXT NOT NULL DEFAULT 'home',
                username TEXT NOT NULL,
                email TEXT,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        commentDb.exec(`
            CREATE INDEX IF NOT EXISTS idx_page_created ON comments(page_id, created_at DESC)
        `);

        console.log('✓ 评论数据库表已初始化');

        // 初始化卡片配置数据库
        cardDb.exec(`
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

        cardDb.exec(`
            CREATE INDEX IF NOT EXISTS idx_card_type_order ON card_configs(type, display_order)
        `);

        console.log('✓ 卡片数据库表已初始化');

        // 检查评论数据库是否有数据
        const commentCount = commentDb.prepare('SELECT COUNT(*) as count FROM comments').get();
        console.log(`✓ 评论数据库已就绪（${commentCount.count} 条评论）`);

        // 检查卡片数据库是否有数据
        const cardCount = cardDb.prepare('SELECT COUNT(*) as count FROM card_configs').get();
        console.log(`✓ 卡片数据库已就绪（${cardCount.count} 个卡片配置）`);

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

// 延迟加载初始数据，确保数据库已完全初始化
setTimeout(() => {
    loadInitialData();
}, 100);

// 导出两个数据库实例
export { commentDb, cardDb };

// 默认导出（为了向后兼容）
export default {
    comment: commentDb,
    card: cardDb
};
