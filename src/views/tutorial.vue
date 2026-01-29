<script setup>
import { ref, onMounted, computed } from 'vue'
import CommentArea from '../components/comment_area.vue'
import TutorialCard from '../components/tutorial_card.vue'

const cards = ref([])
const loading = ref(true)

// 按分类分组
const seriousCards = computed(() => cards.value.filter(card => card.category === '正经教程'))
const funCards = computed(() => cards.value.filter(card => card.category === '不正经教程'))

// 从API加载卡片数据
const loadCards = async () => {
    try {
        const response = await fetch('/api/admin/cards/tutorials')
        const data = await response.json()
        if (data.success) {
            cards.value = data.data
        }
    } catch (error) {
        console.error('加载教程卡片失败:', error)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadCards()
})
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
        
        <div v-if="loading" class="loading">加载中...</div>
        <template v-else>
            <div v-if="seriousCards.length > 0" class="section-wrapper">
                <div class="section-title">
                    <h2>正经教程</h2>
                </div>
                <div class="cards-grid">
                    <TutorialCard 
                        v-for="card in seriousCards"
                        :key="card.title"
                        :title="card.title" 
                        :desc="card.desc"
                        :date="card.date"
                        :link="card.link" />
                </div>
            </div>
            
            <div v-if="funCards.length > 0" class="section-wrapper">
                <div class="section-title">
                    <h2>不正经教程</h2>
                </div>
                <div class="cards-grid">
                    <TutorialCard 
                        v-for="card in funCards"
                        :key="card.title"
                        :title="card.title" 
                        :desc="card.desc"
                        :date="card.date"
                        :link="card.link" />
                </div>
            </div>
        </template>
        
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
    width: 100%;
}

.loading {
    text-align: center;
    padding: 60px;
    color: #7a8a9e;
    font-size: 16px;
}

.tutorial-header {
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

/* 两列瀑布流布局 */
.cards-grid {
    width: 95%;
    column-count: 2;
    column-gap: 24px;
    max-width: 1200px;
}

.cards-grid > * {
    break-inside: avoid;
    margin-bottom: 24px;
}

/* 响应式：平板改为单列 */
@media (max-width: 1024px) {
    .cards-grid {
        column-count: 1;
        width: 90%;
    }

    .tutorial-header {
        width: 90%;
    }

    .section-title {
        width: 90%;
    }
}

/* 响应式：小屏幕改为单列 */
@media (max-width: 768px) {
    .tutorial-container {
        gap: 30px;
        padding: 15px;
    }

    .tutorial-header {
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
    .tutorial-container {
        gap: 24px;
        padding: 10px 5px;
    }

    .tutorial-header {
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
