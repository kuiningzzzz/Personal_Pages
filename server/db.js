import Database from './sqlite.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { migrateHomeContent } from './migrations/home-content.js';
import { migrateEntertainmentCards } from './migrations/entertainment-cards.js';
import { migrateContentV2 } from './migrations/content-v2.js';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 数据目录路径
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');

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

        migrateHomeContent(cardDb);
        migrateEntertainmentCards(cardDb);
        if (!cardDb.prepare('SELECT key FROM site_configs WHERE key = ?').get('page_settings')) {
            cardDb.prepare('INSERT INTO site_configs (key, data) VALUES (?, ?)').run('page_settings', JSON.stringify({
                momentsDescription: '记录技术、日常、教程、游戏和偶尔冒出来的想法。',
                resourceDescription: '把值得收藏的工具、项目和素材放在一起，方便随时找到。',
                activitiesMessage: '这个角落正在慢慢搭建，之后再来看看吧。',
                icpNumber: '鲁ICP备2025203944号-1'
            }));
        }

        // 新版站点内容。保留旧表，首次启动时只导入首页资料。
        cardDb.exec(`
            CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK (id = 1), avatar TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS home_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS resource_types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, display_order INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL CHECK (kind IN ('moment', 'resource')),
                format TEXT NOT NULL DEFAULT 'article' CHECK (format IN ('article', 'short')),
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                cover_image TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                resource_type_id INTEGER REFERENCES resource_types(id) ON DELETE SET NULL,
                actions TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
                published_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_entries_kind_status_date ON entries(kind, status, published_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_entries_resource_type ON entries(resource_type_id);
        `);
        if (!cardDb.pragma('table_info(entries)').some(column => column.name === 'format')) {
            cardDb.exec("ALTER TABLE entries ADD COLUMN format TEXT NOT NULL DEFAULT 'article' CHECK (format IN ('article', 'short'))");
        }
        if (!cardDb.pragma('table_info(entries)').some(column => column.name === 'cover_image')) {
            cardDb.exec("ALTER TABLE entries ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''");
        }
        if (!cardDb.prepare('SELECT id FROM profile WHERE id = 1').get()) {
            const legacy = JSON.parse(cardDb.prepare('SELECT data FROM site_configs WHERE key = ?').get('home_content').data);
            const description = Array.isArray(legacy.profile.bio) ? legacy.profile.bio.join('\n') : String(legacy.profile.bio || '');
            cardDb.prepare('INSERT INTO profile (id, avatar, name, description) VALUES (1, ?, ?, ?)').run(legacy.profile.avatar || '', legacy.profile.name || '', description);
            const insertCard = cardDb.prepare('INSERT INTO home_cards (title, content, display_order) VALUES (?, ?, ?)');
            legacy.sections.forEach((section, index) => {
                const content = (section.rows || []).map(row => {
                    if (row.type === 'link') return `${row.label}：[${row.value}](${row.href})`;
                    if (row.type === 'tags') return `${row.label}：${(row.items || []).join(' · ')}`;
                    return `${row.label}：${row.value || ''}`;
                }).join('\n\n');
                insertCard.run(section.title, content, index);
            });
        }
        if (!cardDb.prepare('SELECT id FROM resource_types LIMIT 1').get()) {
            const insertType = cardDb.prepare('INSERT INTO resource_types (name, slug, display_order) VALUES (?, ?, ?)');
            [['工具', 'tools'], ['开源项目', 'open-source'], ['学习资源', 'learning'], ['游戏资源', 'games'], ['图片资源', 'images']].forEach(([name, slug], index) => insertType.run(name, slug, index));
        }
        migrateContentV2(cardDb);

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

// 导出两个数据库实例
export { commentDb, cardDb };

// 默认导出（为了向后兼容）
export default {
    comment: commentDb,
    card: cardDb
};
