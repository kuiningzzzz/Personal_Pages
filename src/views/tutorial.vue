<script setup>
import CommentArea from '../components/comment_area.vue'
import TutorialCard from '../components/tutorial_card.vue'
</script>

<template>
    <div class="tutorial-container">
        <div class="tutorial-header">
            <h1>Tutorials about Coding, Computer, and Tools</h1>
            <p>并没有做详细的课程笔记的习惯，
                自己的笔记有时只有自己能看懂，
                况且北大的同学里有课程笔记主页的同学还不少，
                优质的课程笔记很多，
                我就不分享自己的一团糊涂了</p>
            <p>但是还是想分享一些经验让来时人少走一点弯路
                （说不定跟着我走又是另一条弯路呢doge），
                所以在这个界面分享一些我在敲代码、做项目、配环境等遇到的各种问题以及解决方法</p>
        </div>
        <div class="section-title">
            <h2>正经教程</h2>
        </div>
        <div class="cards-grid">
            <TutorialCard 
                title="vscode中的c/c++环境配置" 
                desc="针对Windows端的C/C++环境配置以及Cmake工具的使用"
                date="2025-09-07"
                link="/article?src=/articles/tutorials/vscode-cpp-setup.md" />
            
            <TutorialCard 
                title="GitHub Pages的构建方法" 
                desc="fork一个现成的主页模板？或者自己从零开始写一份主页文件？总之建个repo先！"
                date="2025-09-07"
                link="/article?src=/articles/tutorials/github-pages.md" />
            
            <TutorialCard 
                title="vscode中的python环境配置" 
                desc="针对Windows端的python环境配置以及虚拟环境、anaconda工具的入门使用"
                date="2025-09-08"
                link="/article?src=/articles/vscode-python-setup.md" />
            
            <TutorialCard 
                title="在已有Windows系统的机器上安装Ubuntu双系统" 
                desc="涉及磁盘手动分区，启动U盘的制作和使用等，并涵盖可能遇到的诸多特殊情况"
                date="2024-09-20"
                link="/article?src=/articles/ubuntu-dual-boot.md" />
            
            <TutorialCard 
                title="使用uni-app框架进行安卓端应用开发和apk封装" 
                desc="内容包括：uni-app简单结构、开发工具HbuilderX、简单的内网穿透工具Cpolar、apk封装、手机开发者模式与本机调试等"
                date="施工中..."
                link="/article?src=/articles/uni-app-dev.md" />

        </div>
        <div class="section-title">
            <h2>不正经教程</h2>
        </div>
        <div class="cards-grid">
            <TutorialCard 
                title="文明六mod编写" 
                desc="目前更新完的内容有：更改游戏文本、自定义游戏单位。正在准备写自定义文明的攻略，但是工程量有点大，可能鸽一阵子..."
                date="施工中..."
                link="/article?src=/articles/civ6-mod.md" />

        </div>
        <CommentArea pageId="tutorial" />
    </div>
</template>

<style scoped>
.tutorial-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
}

.tutorial-header {
    width: 90%;
    text-align: center;
}

.section-title {
    width: 90%;
    text-align: left;
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

/* 两列瀑布流布局 */
.cards-grid {
    width: 95%;
    column-count: 2;
    column-gap: 24px;
}

.cards-grid > * {
    break-inside: avoid;
    margin-bottom: 24px;
}

/* 响应式：小屏幕改为单列 */
@media (max-width: 768px) {
    .cards-grid {
        column-count: 1;
    }
}
</style>