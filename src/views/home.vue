<script setup>
import Card2to8 from '../components/card_2to8.vue'
import WordBlock from '../components/wordblock.vue'
import CommentArea from '../components/comment_area.vue'
</script>

<template>
    <div class="home-container">
        <div class="profile-card">
            <div class="avatar">
                <img src="../../public/avatar.png" alt="头像" />
            </div>
            <div class="info">
                <h2 class="name">奎宁zzzz</h2>
                <div class="about">
                    <p>你好！这里是奎宁zzzz，是一个热爱开发的计科大学生</p>
                </div>
            </div>
        </div>
        
        <Card2to8 title="EDUCATION">
            <p>本科（在读）：北京大学信息科学技术学院</p>
            <p>专业：计算机科学与技术</p>
        </Card2to8>

        <Card2to8 title="CONTACT">
            <p>GitHub：<a href="https://github.com/kuiningzzzz">kuiningzzzz</a></p>
            <p>E-mail：<a href="mailto:quininezzzz@stu.pku.edu.cn">quininezzzz@stu.pku.edu.cn</a></p>
        </Card2to8>

        <Card2to8 title="TECH STACK">
            <p>Language：
                <WordBlock>Python</WordBlock>
                <WordBlock>C/C++</WordBlock>
                <WordBlock>JavaScript</WordBlock>
                <WordBlock>HTML/CSS</WordBlock>
            </p>
            <p>Framework：
                <WordBlock>Vue.js</WordBlock>
                <WordBlock>Node.js</WordBlock>
                <WordBlock>Flask</WordBlock>
                <WordBlock>Express</WordBlock>
                <WordBlock>uni-app</WordBlock>
            </p>
            <p>Tools：
                <WordBlock>VScode</WordBlock>
                <WordBlock>Git</WordBlock>
                <WordBlock>Docker</WordBlock>
                <WordBlock>HbuilderX</WordBlock>
                <WordBlock>SQL</WordBlock>
            </p>
        </Card2to8>

        <CommentArea pageId="home" />

    </div>
</template>

<style scoped>
.home-container {
    display: flex;
    justify-content: center;
    padding: 10px 0;
    flex-direction: column;
    gap: 15px;
    align-items: center;
}

.profile-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 32px;
    width: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
}

.avatar img {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.info {
    text-align: center;
}

.name {
    color: #ffffff;
    font-size: 32px;
    font-weight: 500;
    margin: 0 0 20px 0;
    letter-spacing: 0.5px;
}

.about {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.about p {
    color: #b8c5d6;
    font-size: 16px;
    margin: 0;
    line-height: 1.8;
    font-weight: 300;
}

p {
    color: #b8c5d6;
    font-size: 15px;
    margin: 0;
    line-height: 1.8;
    font-weight: 300;
}

a {
    color: #74aaff;
}
</style>