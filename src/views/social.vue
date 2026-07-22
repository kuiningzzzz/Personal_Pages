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
            <div v-if="loading" class="loading">加载中...</div>
            <template v-else>
                <FriendCard 
                    v-for="friend in friends"
                    :key="friend.title"
                    :title="friend.title" 
                    :desc="friend.desc"
                    :avatar="friend.avatar"
                    :link="friend.link" />
            </template>
        </div>
        <div class="section-title">
            <h2>Entertainment</h2>
        </div>
        <div class="entertainment-container">
            <div v-if="entertainmentLoading" class="loading">加载中...</div>
            <div v-else-if="entertainmentError" class="loading error">{{ entertainmentError }}</div>
            <template v-else>
                <div
                    v-for="card in entertainmentCards"
                    :key="card.title"
                    class="entertainment-section"
                >
                    <h3>{{ card.title }}</h3>
                    <ul>
                        <li v-for="item in card.items" :key="item">{{ item }}</li>
                    </ul>
                </div>
            </template>
        </div>

    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import FriendCard from '../components/friend_card.vue'

const friends = ref([])
const loading = ref(true)
const entertainmentCards = ref([])
const entertainmentLoading = ref(true)
const entertainmentError = ref('')

// 从 API 加载友链数据
const loadFriends = async () => {
    try {
        const response = await fetch('/api/admin/cards/friends')
        const data = await response.json()
        if (data.success) {
            friends.value = data.data
        }
    } catch (error) {
        console.error('加载友链失败:', error)
    } finally {
        loading.value = false
    }
}

// 从 API 加载娱乐卡片数据
const loadEntertainmentCards = async () => {
    entertainmentLoading.value = true
    entertainmentError.value = ''
    try {
        const response = await fetch('/api/admin/cards/entertainment')
        const data = await response.json()
        if (data.success) {
            entertainmentCards.value = data.data
        } else {
            entertainmentError.value = data.message || '娱乐内容加载失败'
        }
    } catch (error) {
        console.error('加载娱乐卡片失败:', error)
        entertainmentError.value = '娱乐内容加载失败'
    } finally {
        entertainmentLoading.value = false
    }
}

onMounted(() => {
    loadFriends()
    loadEntertainmentCards()
})
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
    max-width: 1200px;
    text-align: center;
}

.section-title {
    width: 90%;
    max-width: 1200px;
    text-align: left;
}

.friends-container {
    width: 95%;
    max-width: 1200px;
    column-count: 2;
    column-gap: 24px;
}

.friends-container > * {
    break-inside: avoid;
    margin-bottom: 24px;
}

.loading {
    text-align: center;
    padding: 40px;
    color: #7a8a9e;
    font-size: 16px;
    width: 100%;
}

.loading.error {
    color: #ff9b9b;
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

/* Entertainment Section Styles */
.entertainment-container {
    width: 90%;
    max-width: 1200px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
}

.entertainment-section {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 24px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.entertainment-section:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.entertainment-section h3 {
    color: #ffffff;
    font-size: 20px;
    font-weight: 500;
    margin: 0 0 16px 0;
    padding-bottom: 12px;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
}

.entertainment-section ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.entertainment-section li {
    color: #b8c5d6;
    font-size: 15px;
    line-height: 1.8;
    margin-bottom: 12px;
    padding-left: 20px;
    position: relative;
}

.entertainment-section li:last-child {
    margin-bottom: 0;
}

.entertainment-section li::before {
    content: "•";
    color: #64b5f6;
    font-weight: bold;
    font-size: 18px;
    position: absolute;
    left: 0;
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

    .entertainment-container {
        grid-template-columns: 1fr;
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

    .entertainment-container {
        width: 95%;
        gap: 20px;
    }

    .entertainment-section {
        padding: 20px;
    }

    .entertainment-section h3 {
        font-size: 18px;
        margin-bottom: 14px;
        padding-bottom: 10px;
    }

    .entertainment-section li {
        font-size: 14px;
        margin-bottom: 10px;
        padding-left: 18px;
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

    .entertainment-container {
        width: 100%;
        gap: 16px;
    }

    .entertainment-section {
        padding: 16px;
    }

    .entertainment-section h3 {
        font-size: 16px;
        margin-bottom: 12px;
        padding-bottom: 8px;
    }

    .entertainment-section li {
        font-size: 13px;
        line-height: 1.7;
        margin-bottom: 8px;
        padding-left: 16px;
    }

    .entertainment-section li::before {
        font-size: 16px;
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
