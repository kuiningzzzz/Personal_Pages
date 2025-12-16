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
    max-width: 800px;
    text-align: center;
}

.section-title {
    width: 90%;
    max-width: 1300px;
    text-align: left;
}

.friends-container {
    width: 95%;
    max-width: 1300px;
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