<script setup>
import { ref, onMounted } from 'vue'
import Card2to8 from '../components/card_2to8.vue'
import WordBlock from '../components/wordblock.vue'
import CommentArea from '../components/comment_area.vue'

const homeContent = ref(null)
const loading = ref(true)
const error = ref('')

const loadHomeContent = async () => {
    loading.value = true
    error.value = ''
    try {
        const response = await fetch('/api/home-content')
        const data = await response.json()
        if (data.success) {
            homeContent.value = data.data
        } else {
            error.value = data.message || '信息获取失败，请刷新重试'
        }
    } catch (error) {
        console.error('加载首页内容失败:', error)
        homeContent.value = null
        error.value = '信息获取失败，请刷新重试'
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadHomeContent()
})
</script>

<template>
    <div class="home-container">
        <div v-if="loading" class="state-card">加载中...</div>
        <div v-else-if="error" class="state-card error">{{ error }}</div>
        <template v-else-if="homeContent">
        <div class="profile-card">
            <div class="avatar">
                <img :src="homeContent.profile.avatar" alt="头像" />
            </div>
            <div class="info">
                <h2 class="name">{{ homeContent.profile.name }}</h2>
                <div class="about">
                    <p v-for="line in homeContent.profile.bio" :key="line">{{ line }}</p>
                </div>
            </div>
        </div>
        
        <Card2to8 v-for="section in homeContent.sections" :key="section.title" :title="section.title">
            <p v-for="(row, index) in section.rows" :key="`${section.title}-${index}`">
                <template v-if="row.type === 'link'">
                    {{ row.label }}：<a :href="row.href">{{ row.value }}</a>
                </template>
                <template v-else-if="row.type === 'tags'">
                    {{ row.label }}：
                    <WordBlock v-for="item in row.items" :key="item">{{ item }}</WordBlock>
                </template>
                <template v-else>
                    {{ row.label }}：{{ row.value }}
                </template>
            </p>
        </Card2to8>
        </template>

        <CommentArea pageId="home" />

    </div>
</template>

<style scoped>
.home-container {
    display: flex;
    justify-content: center;
    padding: 20px 0;
    flex-direction: column;
    gap: 15px;
    align-items: center;
    width: 100%;
}

.profile-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 32px;
    width: 90%;
    max-width: 1200px;
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

.state-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    color: #b8c5d6;
    font-size: 16px;
    padding: 40px;
    text-align: center;
    width: 90%;
    max-width: 1200px;
}

.state-card.error {
    color: #ff9b9b;
}

/* 平板和手机响应式 */
@media (max-width: 768px) {
    .home-container {
        padding: 15px 0;
        gap: 12px;
    }

    .profile-card {
        padding: 24px;
        gap: 15px;
        width: 95%;
    }

    .avatar img {
        width: 120px;
        height: 120px;
    }

    .name {
        font-size: 24px;
        margin: 0 0 15px 0;
    }

    .about p {
        font-size: 14px;
    }

    p {
        font-size: 14px;
    }
}

@media (max-width: 480px) {
    .home-container {
        padding: 10px 0;
        gap: 10px;
    }

    .profile-card {
        padding: 16px;
        gap: 12px;
        width: 100%;
        border-radius: 8px;
        margin: 0 5px;
    }

    .avatar img {
        width: 100px;
        height: 100px;
    }

    .name {
        font-size: 20px;
        margin: 0 0 12px 0;
    }

    .about p,
    p {
        font-size: 13px;
        line-height: 1.6;
    }
}
</style>
