export const DEFAULT_ENTERTAINMENT_CARDS = [
    {
        title: '关于音乐',
        items: [
            '虽然考了业余的钢琴十级但是由于考的时候还小+中学专注文化课，水平相当烂了（）只能说懂一点乐理，稍微会弹点低难度小曲儿',
            '平时听歌主要是日系，常听YOASOBI、夜鹿，以及BangDream企划的乐队歌曲',
            '没学过声乐，唱歌没有技巧全是感情但好在不怎么跑调，欢迎来约K！'
        ]
    },
    {
        title: '关于游戏',
        items: [
            '几乎涉猎除了乙女、gal、MOBA、FPS类以外的所有类型游戏（后两者是因为自己玩太菜了不喜欢玩doge）',
            '尤其偏好SLG（文明六）、rogue（死亡细胞）、沙盒生存（泰拉瑞亚）、开放世界探索（原神）、模拟经营（星露谷）',
            '游戏制作方面，有在考虑搓一个2D的RPG游戏，敬请期待'
        ]
    },
    {
        title: '关于动漫和漫画',
        items: [
            '新番随缘追，主要看有没有时间够不够闲',
            '其实更喜欢看漫画原作'
        ]
    },
    {
        title: '关于网名',
        items: [
            '绝大多数社交平台上的网名都是"奎宁"或"Quinine"，考虑到昵称重复问题，有时加上"zzzz"或者".exe未响应"等后缀，欢迎来找我玩！',
            '没错，奎宁就是你想的那个治疗疟疾的药物，随便看到的觉得好听就一直当网名用下去了（）',
            '但还请不要去网上开盒我）'
        ]
    }
];

export function migrateEntertainmentCards(cardDb) {
    const existing = cardDb.prepare('SELECT COUNT(*) as count FROM card_configs WHERE type = ?').get('entertainment');

    if (existing.count > 0) {
        console.log('✓ 娱乐卡片配置已存在，跳过迁移');
        return false;
    }

    const insert = cardDb.prepare('INSERT INTO card_configs (type, data, display_order) VALUES (?, ?, ?)');
    const transaction = cardDb.transaction(() => {
        DEFAULT_ENTERTAINMENT_CARDS.forEach((card, index) => {
            insert.run('entertainment', JSON.stringify(card), index);
        });
    });

    transaction();
    console.log('✓ 已迁移默认娱乐卡片配置');
    return true;
}
