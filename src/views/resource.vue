<script setup>
import { ref, onMounted } from 'vue'
import CommentArea from '../components/comment_area.vue'

const loading = ref(false)

onMounted(() => {
    // 页面加载逻辑
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
                <div class="content-area">
                    <p>TODO</p>
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

.content-area {
    width: 95%;
    max-width: 1200px;
    padding: 40px;
    color: #b8c5d6;
    font-size: 18px;
    text-align: center;
}

/* 响应式：平板 */
@media (max-width: 1024px) {
    .resource-header {
        width: 90%;
    }

    .section-title {
        width: 90%;
    }

    .content-area {
        width: 90%;
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

    .content-area {
        width: 95%;
        padding: 30px 20px;
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

    .content-area {
        font-size: 16px;
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

    .content-area {
        width: 100%;
        padding: 25px 15px;
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
