<script setup>
import { ref, onMounted } from 'vue'
import CommentArea from '../components/comment_area.vue'
import EmojiCard from '../components/emoji_card.vue'

const loading = ref(true)
const emojiCategories = ref([])

// 从API加载表情包分类
const loadEmojiCategories = async () => {
    loading.value = true
    try {
        const response = await fetch('/api/admin/emoji/categories')
        const data = await response.json()
        if (data.success) {
            emojiCategories.value = data.data.map(cat => ({
                title: cat.title,
                desc: cat.desc,
                category: cat.id,
                previewImage: cat.images[0] || '/picture/default-emoji.png',
                count: cat.count
            }))
        }
    } catch (error) {
        console.error('加载表情包分类失败:', error)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadEmojiCategories()
})
</script>

<template>
    <div class="resource-container">
        <div class="resource-header">
            <h1>Resources Collection</h1>
            <p>这里收集了一些有趣实用的资源，包括表情包、图片素材等</p>
            <p>欢迎浏览和使用，持续更新中...</p>
        </div>
        
        <div v-if="loading" class="loading">加载中...</div>
        <template v-else>
            <div class="section-wrapper">
                <div class="section-title">
                    <h2>表情包收集</h2>
                </div>
                <div class="cards-grid">
                    <EmojiCard 
                        v-for="emoji in emojiCategories"
                        :key="emoji.category"
                        :title="emoji.title"
                        :desc="emoji.desc"
                        :category="emoji.category"
                        :previewImage="emoji.previewImage"
                        :count="emoji.count" />
                </div>
            </div>
        </template>
        
        <CommentArea pageId="resource" />
    </div>
</template>

<style scoped>
.resource-container {
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

.resource-header {
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

/* 两列网格布局 */
.cards-grid {
    width: 95%;
    max-width: 1200px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
}

/* 响应式：平板 */
@media (max-width: 1024px) {
    .resource-header {
        width: 90%;
    }

    .section-title {
        width: 90%;
    }

    .cards-grid {
        width: 90%;
        grid-template-columns: repeat(2, 1fr);
    }
}

/* 响应式：小屏幕 */
@media (max-width: 768px) {
    .resource-container {
        gap: 30px;
        padding: 15px;
    }

    .resource-header {
        width: 95%;
    }

    .section-title {
        width: 95%;
    }

    .cards-grid {
        width: 95%;
        grid-template-columns: 1fr;
        gap: 20px;
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
    .resource-container {
        gap: 24px;
        padding: 10px 5px;
    }

    .resource-header {
        width: 100%;
    }

    .section-title {
        width: 100%;
    }

    .cards-grid {
        width: 100%;
        gap: 15px;
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
