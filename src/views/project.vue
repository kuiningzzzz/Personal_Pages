<script setup>
import { ref, onMounted, computed } from 'vue'
import CommentArea from '../components/comment_area.vue'
import ProjectCard from '../components/project_card.vue'

const cards = ref([])
const loading = ref(true)

// 按分类分组
const myProjects = computed(() => cards.value.filter(card => card.category === '我的项目'))
const recommendedSoftware = computed(() => cards.value.filter(card => card.category === '推荐软件'))

// 从API加载卡片数据
const loadCards = async () => {
    try {
        const response = await fetch('/api/admin/cards/projects')
        const data = await response.json()
        if (data.success) {
            cards.value = data.data
        }
    } catch (error) {
        console.error('加载项目卡片失败:', error)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadCards()
})
</script>

<template>
    <div class="project-container">
        <div class="project-header">
            <h1>Projects Showcase</h1>
            <p>这里展示我主建或参与的一些项目和作品，以及很推荐一用的优质软件和程序</p>
            <p>包括开源项目、小工具、应用程序等，欢迎下载使用和交流</p>
        </div>
        
        <div v-if="loading" class="loading">加载中...</div>
        <template v-else>
            <div v-if="myProjects.length > 0" class="section-wrapper">
                <div class="section-title">
                    <h2>我的项目</h2>
                </div>
                <div class="cards-grid">
                    <ProjectCard 
                        v-for="card in myProjects"
                        :key="card.title"
                        :title="card.title" 
                        :desc="card.desc"
                        :date="card.date"
                        :link="card.link"
                        :repoUrl="card.repoUrl"
                        :downloadUrl="card.downloadUrl" />
                </div>
            </div>
            
            <div v-if="recommendedSoftware.length > 0" class="section-wrapper">
                <div class="section-title">
                    <h2>推荐软件</h2>
                </div>
                <div class="cards-grid">
                    <ProjectCard 
                        v-for="card in recommendedSoftware"
                        :key="card.title"
                        :title="card.title" 
                        :desc="card.desc"
                        :date="card.date"
                        :link="card.link"
                        :repoUrl="card.repoUrl"
                        :downloadUrl="card.downloadUrl" />
                </div>
            </div>
        </template>
        
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

.loading {
    text-align: center;
    padding: 60px;
    color: #7a8a9e;
    font-size: 16px;
}

.project-header {
    width: 90%;
    max-width: 1200px;
    text-align: center;
}

.section-wrapper {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
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
