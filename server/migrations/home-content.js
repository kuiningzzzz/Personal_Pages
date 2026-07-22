export const DEFAULT_HOME_CONTENT = {
    profile: {
        avatar: '/picture/avatar.png',
        name: '奎宁zzzz',
        bio: [
            '你好！这里是奎宁zzzz，是一个热爱开发的计科大学生'
        ]
    },
    sections: [
        {
            title: 'EDUCATION',
            rows: [
                {
                    type: 'text',
                    label: '本科（在读）',
                    value: '北京大学信息科学技术学院'
                },
                {
                    type: 'text',
                    label: '专业',
                    value: '计算机科学与技术'
                }
            ]
        },
        {
            title: 'CONTACT',
            rows: [
                {
                    type: 'link',
                    label: 'GitHub',
                    value: 'kuiningzzzz',
                    href: 'https://github.com/kuiningzzzz'
                },
                {
                    type: 'link',
                    label: 'E-mail',
                    value: 'quininezzzz@stu.pku.edu.cn',
                    href: 'mailto:quininezzzz@stu.pku.edu.cn'
                }
            ]
        },
        {
            title: 'TECH STACK',
            rows: [
                {
                    type: 'tags',
                    label: 'Language',
                    items: ['Python', 'C/C++', 'JavaScript', 'HTML/CSS']
                },
                {
                    type: 'tags',
                    label: 'Framework',
                    items: ['Vue.js', 'Node.js', 'Flask', 'Express', 'uni-app']
                },
                {
                    type: 'tags',
                    label: 'Tools',
                    items: ['VScode', 'Git', 'Docker', 'HbuilderX', 'SQL']
                }
            ]
        }
    ]
};

export function migrateHomeContent(cardDb) {
    cardDb.exec(`
        CREATE TABLE IF NOT EXISTS site_configs (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const existing = cardDb.prepare('SELECT key FROM site_configs WHERE key = ?').get('home_content');

    if (existing) {
        console.log('✓ 首页内容配置已存在，跳过迁移');
        return false;
    }

    cardDb.prepare('INSERT INTO site_configs (key, data) VALUES (?, ?)').run(
        'home_content',
        JSON.stringify(DEFAULT_HOME_CONTENT)
    );
    console.log('✓ 已迁移默认首页内容配置');
    return true;
}
