/**
 * 友链数据迁移脚本
 * 将现有的友链卡片信息添加到 card.sqlite 数据库中
 * 
 * 运行方式: node server/migrate-friends.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 数据库路径
const DATA_DIR = join(__dirname, 'data');
const DB_PATH = join(DATA_DIR, 'card.sqlite');

// 确保 data 目录存在
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log('✅ 创建 data 目录');
}

// 连接数据库
const db = new Database(DB_PATH);
console.log('✅ 连接到数据库:', DB_PATH);

// 现有的友链数据（从 social.vue 中提取）
const friendsData = [
    {
        title: "Qiyu Zhang",
        desc: "我的本科舍友，主页有或有趣或实用或有趣且实用的日志、笔记、随写，但是更新不太频繁，维护不当似乎有点混乱？）",
        avatar: "/friend_avatar/friend1.jpg",
        link: "https://qiyuzhang-stu.github.io/"
    },
    {
        title: "FunctionHook函钩",
        desc: "我的高中同学，天大计算机本科就读，主页有计算机学习笔记、日记、开源项目，以及东方&舟&母鸡卡神人视频，还有大量耄耋&雪莉等神人表情包，是个暂时没啥流量的b站up",
        avatar: "/friend_avatar/friend2.jpg",
        link: "https://functionhooktju.github.io/fxHook.io/"
    }
];

// 检查是否已有友链数据
const existingCount = db.prepare('SELECT COUNT(*) as count FROM card_configs WHERE type = ?').get('friends');
console.log(`📊 当前友链数据数量: ${existingCount.count}`);

if (existingCount.count > 0) {
    console.log('⚠️  数据库中已存在友链数据，是否覆盖？');
    console.log('   如需覆盖，请先删除现有数据：');
    console.log('   DELETE FROM card_configs WHERE type = "friends";');
    
    // 询问是否继续
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
        rl.question('是否覆盖现有数据? (y/n): ', resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
        console.log('❌ 已取消迁移');
        process.exit(0);
    }
    
    // 删除现有友链数据
    db.prepare('DELETE FROM card_configs WHERE type = ?').run('friends');
    console.log('🗑️  已删除现有友链数据');
}

// 插入友链数据
console.log('\n📝 开始插入友链数据...');
const insert = db.prepare('INSERT INTO card_configs (type, data, display_order) VALUES (?, ?, ?)');

friendsData.forEach((friend, index) => {
    insert.run('friends', JSON.stringify(friend), index);
    console.log(`   ✅ ${index + 1}. ${friend.title}`);
});

console.log(`\n🎉 迁移完成！共插入 ${friendsData.length} 条友链数据`);

// 验证数据
const verifyData = db.prepare('SELECT * FROM card_configs WHERE type = ?').all('friends');
console.log('\n📋 验证数据:');
verifyData.forEach((row, index) => {
    const data = JSON.parse(row.data);
    console.log(`   ${index + 1}. ${data.title} -> ${data.link}`);
});

db.close();
console.log('\n✅ 数据库连接已关闭');
