<template>
    <div class="social-container">
        <div class="social-header">
            <h1>Social Contact & Entertainment</h1>
            <p>Keep your spirit free</p>
        </div>
        <div class="section-title">
            <h2>Friend Links</h2>
        </div>
        <div class="friends-container">
            <FriendCard 
                title="Qiyu Zhang" 
                desc="我的本科舍友，主页有或有趣或实用或有趣且实用的日志、笔记、随写，但是更新不太频繁，维护不当似乎有点混乱？）"
                avatar="/friend_avatar/friend1.jpg"
                link="https://qiyuzhang-stu.github.io/" />
            <FriendCard 
                title="FunctionHook函钩" 
                desc="我的高中同学，天大计算机本科就读，主页有计算机学习笔记、日记、开源项目，以及东方&舟&母鸡卡神人视频，还有大量耄耋&雪莉等神人表情包，是个暂时没啥流量的b站up"
                avatar="/friend_avatar/friend2.jpg"
                link="https://functionhooktju.github.io/fxHook.io/" />

        </div>
        <div class="section-title">
            <h2>Entertainment</h2>
        </div>
        <div class="entertainment-container">
            <div class="entertainment-section">
                <h3>关于音乐</h3>
                <ul>
                    <li>虽然考了业余的钢琴十级但是由于考的时候还小+中学专注文化课，水平相当烂了（）只能说懂一点乐理，稍微会弹点低难度小曲儿</li>
                    <li>平时听歌主要是日系，常听YOASOBI、夜鹿，以及BangDream企划的乐队歌曲</li>
                    <li>没学过声乐，唱歌没有技巧全是感情但好在不怎么跑调，欢迎来约K！</li>
                </ul>
            </div>

            <div class="entertainment-section">
                <h3>关于游戏</h3>
                <ul>
                    <li>几乎涉猎除了乙女、gal、MOBA、FPS类以外的所有类型游戏（后两者是因为自己玩太菜了不喜欢玩doge）</li>
                    <li>尤其偏好SLG（文明六）、rogue（死亡细胞）、沙盒生存（泰拉瑞亚）、开放世界探索（原神）、模拟经营（星露谷）</li>
                    <li>游戏制作方面，有在考虑搓一个2D的RPG游戏，敬请期待</li>
                </ul>
            </div>

            <div class="entertainment-section">
                <h3>关于动漫和漫画</h3>
                <ul>
                    <li>新番随缘追，主要看有没有时间够不够闲</li>
                    <li>其实更喜欢看漫画原作</li>
                </ul>
            </div>

            <div class="entertainment-section">
                <h3>关于网名</h3>
                <ul>
                    <li>绝大多数社交平台上的网名都是"奎宁"或"Quinine"，考虑到昵称重复问题，有时加上"zzzz"或者".exe未响应"等后缀，欢迎来找我玩！</li>
                    <li>没错，奎宁就是你想的那个治疗疟疾的药物，随便看到的觉得好听就一直当网名用下去了（）</li>
                    <li>但还请不要去网上开盒我）</li>
                </ul>
            </div>
        </div>

    </div>
</template>

<script setup>
import FriendCard from '../components/friend_card.vue'
</script>


<style scoped>
.social-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
}

.social-header {
    width: 90%;
    max-width: 1200px;
    text-align: center;
}

.section-title {
    width: 90%;
    max-width: 1200px;
    text-align: left;
}

.friends-container {
    width: 95%;
    max-width: 1200px;
    column-count: 2;
    column-gap: 24px;
}

.friends-container > * {
    break-inside: avoid;
    margin-bottom: 24px;
}

h1 {
    color: #ffffff;
    font-size: 32px;
    font-weight: 500;
    margin-bottom: 20px;
}

h2 {
    color: #ffffff;
    font-size: 24px;
    font-weight: 500;
    margin: 0;
}

p {
    color: #b8c5d6;
    font-size: 16px;
    line-height: 1.6;
    margin: 10px 0;
}

/* Entertainment Section Styles */
.entertainment-container {
    width: 90%;
    max-width: 1200px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
}

.entertainment-section {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 24px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.entertainment-section:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.entertainment-section h3 {
    color: #ffffff;
    font-size: 20px;
    font-weight: 500;
    margin: 0 0 16px 0;
    padding-bottom: 12px;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
}

.entertainment-section ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.entertainment-section li {
    color: #b8c5d6;
    font-size: 15px;
    line-height: 1.8;
    margin-bottom: 12px;
    padding-left: 20px;
    position: relative;
}

.entertainment-section li:last-child {
    margin-bottom: 0;
}

.entertainment-section li::before {
    content: "•";
    color: #64b5f6;
    font-weight: bold;
    font-size: 18px;
    position: absolute;
    left: 0;
}

/* 响应式：平板改为单列 */
@media (max-width: 1024px) {
    .friends-container {
        column-count: 1;
        width: 90%;
    }

    .social-header {
        width: 90%;
    }

    .section-title {
        width: 90%;
    }

    .entertainment-container {
        grid-template-columns: 1fr;
        width: 90%;
    }
}

/* 响应式：小屏幕改为单列 */
@media (max-width: 768px) {
    .social-container {
        gap: 30px;
        padding: 15px;
    }

    .social-header {
        width: 95%;
    }

    .section-title {
        width: 95%;
    }

    .friends-container {
        width: 95%;
        column-count: 1;
    }

    .entertainment-container {
        width: 95%;
        gap: 20px;
    }

    .entertainment-section {
        padding: 20px;
    }

    .entertainment-section h3 {
        font-size: 18px;
        margin-bottom: 14px;
        padding-bottom: 10px;
    }

    .entertainment-section li {
        font-size: 14px;
        margin-bottom: 10px;
        padding-left: 18px;
    }

    h1 {
        font-size: 24px;
        margin-bottom: 15px;
    }

    h2 {
        font-size: 20px;
    }

    p {
        font-size: 14px;
        margin: 8px 0;
    }
}

@media (max-width: 480px) {
    .social-container {
        gap: 24px;
        padding: 10px 5px;
    }

    .social-header {
        width: 100%;
    }

    .section-title {
        width: 100%;
    }

    .friends-container {
        width: 100%;
        column-gap: 12px;
    }

    .entertainment-container {
        width: 100%;
        gap: 16px;
    }

    .entertainment-section {
        padding: 16px;
    }

    .entertainment-section h3 {
        font-size: 16px;
        margin-bottom: 12px;
        padding-bottom: 8px;
    }

    .entertainment-section li {
        font-size: 13px;
        line-height: 1.7;
        margin-bottom: 8px;
        padding-left: 16px;
    }

    .entertainment-section li::before {
        font-size: 16px;
    }

    h1 {
        font-size: 20px;
        margin-bottom: 12px;
    }

    h2 {
        font-size: 18px;
    }

    p {
        font-size: 13px;
        line-height: 1.5;
    }
}
</style>
