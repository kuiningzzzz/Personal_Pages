<script setup>
import CommentArea from '../components/comment_area.vue'
import ProjectCard from '../components/project_card.vue'
</script>

<template>
    <div class="project-container">
        <div class="project-header">
            <h1>Projects Showcase</h1>
            <p>这里展示我主建或参与的一些项目和作品，以及很推荐一用的优质软件和程序</p>
            <p>包括开源项目、小工具、应用程序等，欢迎下载使用和交流</p>
        </div>
        <div class="section-title">
            <h2>我的项目</h2>
        </div>
        <div class="cards-grid">
            <ProjectCard title="我的个人主页" desc="也就是你现在看到的这个网站啦！基于Vue3和Vite构建，使用了多种现代前端技术和工具，包括组件化开发、响应式设计、路由管理等。
            不过这个项目本质上还是我用来学习和实践前端开发技术的一个练手项目，仅供参考和学习使用，当然不嫌弃的话也可以fork一份当模板使）"
                date="2025-12-18" link="/article?src=/articles/projects/personal_pages.md"
                repoUrl="https://github.com/kuiningzzzz/Personal_Pages" />

            <ProjectCard title="Con-jugamos" desc="一款面向西班牙语学习者的动词变位学习软件，致力于通过科学的练习方法帮助学习者掌握西班牙语动词变位规则。
            本项目是我在北京大学《智能化软件系统与工程》课程的大作业项目，后续将与北京大学外国语学院合作进行持续维护和更新。" date="2025-12-19"
                link="/article?src=/articles/projects/con-jugamos.md"  downloadUrl="/source/Con-jugamos.apk"
                repoUrl="https://github.com/kuiningzzzz/Spanish-Verb-Conjugation-Practicer" />
        </div>

        <div class="section-title">
            <h2>推荐软件</h2>
        </div>
        <div class="cards-grid">
            <ProjectCard title="影梭"
                desc="一款安卓设备的虚拟定位控制软件。
                开发者的初衷是想提供安卓设备软件开发时关于位置信息的虚拟服务，或者在玩类似《宝可梦》的游戏的时候提供娱乐性质的辅助工具，请善用慎用！
                安装之后，请将手机设置为开发者模式（不同手机可能方式不一样，需要自行搜索查找进入方式，比如本人的OPPO手机是在设置中的设备信息里连续按版本号五次。进入开发者模式之后，就可以在手机设置里找到“开发者选项”，在里面找到“模拟位置信息应用”，将其设置为影梭，之后即可正常使用。
                使用时请使用移动数据，关闭WiFi，否则有可能出现定位失效的情况。
                注：除影梭外，常见的安卓虚拟定位软件还有Fake Location，这里不做推荐的原因有二：
                一，虽然它功能比影梭更强大（比如指定行动轨迹之后自动多次循环模拟），但是高级功能的使用门槛更高，要过一份涉及到安卓API基础以及安卓定位服务等知识的测试题，并且还要付费（9元/月）；
                二，目前Fake Location已被“招安”，在使用时需要强制用户设置“检查使用状况环境”，防止用户进行诸如定位签到等不当行为，要绕过这个设置还需要更复杂的操作，在这里我们不再赘述，不如直接用更开放开源的影梭。"
                date="2025-12-18" repoUrl="https://github.com/ZCShou/GoGoGo" />

            <ProjectCard title="Ncm_to_mp3" desc="网易云音乐的歌曲下载后（尤其是会员歌曲），是以后缀名为.ncm的格式进行本地存储的，这是一种网易云音乐的特殊加密方式，目的是防止歌曲泄露引发版权问题。
            但是这对于用户来说显然不方便，用户并不总是使用ncm的播放器（比如网易云本体），更多的情况下一般使用MP3格式的文件，无论是插入到PPT还是转发收藏随身听都更方便，于是这个程序就可以帮助你快捷解码ncm加密并将其转化为mp3。
            请不要使用这种程序进行牟利，引发版权与隐私问题后果自负！
            使用方法是：将.ncm文件拖动到这个.exe文件上即可在原文件目录下生成一个与.ncm文件同名的.mp3文件。" date="2025-12-18"
                downloadUrl="/source/Ncm_to_mp3.exe" />

            <ProjectCard title="Geogebra" desc="从我高中时期开始就一直在用的强大的函数分析软件，对于高中最难的两部分：函数导数与解析几何，这个软件都可以通过绘图计算的方式一目了然的看到规律。
            当然软件功能非常强大不止于此，可以进行几何作图、代数计算、微积分运算、统计分析等多种数学相关的操作，适合各个阶段的数学学习与研究使用。" date="2025-12-18"
                repoUrl="https://www.geogebra.org/" />

            <ProjectCard title="bandizip" desc="缩与解压已经是老生常谈的话题了，但是可能有同学还是在文件解压方面有困难，一个一站式万能解压工具在此时就会非常好用。管你是zip、tar、7z还是什么，一个软件全部搞定。
            免费版基本就可以使用全部功能了，如果想要赞助作者买个付费版的话，优点主要就是没广告（免费版每次使用的时候都会有右下角弹窗广告），这个问题在免费版其实也  完全可以容忍。" date="2025-12-18"
                repoUrl="https://www.bandisoft.com/bandizip/" />
        </div>
        <CommentArea pageId="project" />
    </div>
</template>

<style scoped>
.project-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
}

.project-header {
    width: 90%;
    max-width: 1200px;
    text-align: center;
}

.section-title {
    width: 90%;
    max-width: 1200px;
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
    max-width: 1200px;
}

.cards-grid>* {
    break-inside: avoid;
    margin-bottom: 24px;
}

/* 响应式：平板改为单列 */
@media (max-width: 1024px) {
    .cards-grid {
        column-count: 1;
        width: 90%;
    }

    .project-header {
        width: 90%;
    }

    .section-title {
        width: 90%;
    }
}

/* 响应式：小屏幕改为单列 */
@media (max-width: 768px) {
    .project-container {
        gap: 30px;
        padding: 15px;
    }

    .project-header {
        width: 95%;
    }

    .section-title {
        width: 95%;
    }

    .cards-grid {
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
    .project-container {
        gap: 24px;
        padding: 10px 5px;
    }

    .project-header {
        width: 100%;
    }

    .section-title {
        width: 100%;
    }

    .cards-grid {
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
