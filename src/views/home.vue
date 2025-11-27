<script setup>
import WordBlock from '../components/wordblock.vue'
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
        
        <div class="home-card">
            <div class="card-title">
                <h3>EDUCATION</h3>
            </div>
            <div class="card-content">
                <p>本科（在读）：北京大学信息科学技术学院</p>
                <p>专业：计算机科学与技术</p>
            </div>
        </div>

        <div class="home-card">
            <div class="card-title">
                <h3>CONTACT</h3>
            </div>
            <div class="card-content">
                <p>GitHub：<a href="https://github.com/kuiningzzzz">kuiningzzzz</a></p>
                <p>E-mail：<a href="mailto:quininezzzz@stu.pku.edu.cn">quininezzzz@stu.pku.edu.cn</a></p>
            </div>
        </div>

        <div class="home-card">
            <div class="card-title">
                <h3>TECH STACK</h3>
            </div>
            <div class="card-content">
                <p>Language：
                    <WordBlock>Python</WordBlock>
                    <WordBlock>C/C++</WordBlock>
                    <WordBlock>JavaScript</WordBlock>
                    <WordBlock>HTML/CSS</WordBlock></p>
                <p>Framework：
                    <WordBlock>Vue.js</WordBlock>
                    <WordBlock>Node.js</WordBlock>
                    <WordBlock>Flask</WordBlock>
                    <WordBlock>uni-app</WordBlock></p>
                <p>Tools：<WordBlock>VScode</WordBlock>
                    <WordBlock>Git</WordBlock>
                    <WordBlock>Docker</WordBlock>
                    <WordBlock>HbuilderX</WordBlock>
                    <WordBlock> SQL</WordBlock></p>
            </div>
        </div>

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

.home-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 32px;
    width: 90%;
    display: flex;
    align-items: stretch;
    gap: 24px;
}

.card-title {
    width: 20%;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    padding-right: 20px;
}

.card-title h3 {
    color: #ffffff;
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    writing-mode: horizontal-tb;
    letter-spacing: 0.5px;
}

.card-content {
    width: 80%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 20px;
    gap: 5px;
}

.card-content p {
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