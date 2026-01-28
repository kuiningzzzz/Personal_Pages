<template>
    <div class="admin-container">
        <!-- 密码认证遮罩 -->
        <div v-if="!isAuthenticated" class="auth-overlay">
            <div class="auth-box">
                <h2>Admin 登录</h2>
                <p class="auth-hint">请输入管理员密码</p>
                <input 
                    type="password" 
                    v-model="password" 
                    @keyup.enter="authenticate"
                    placeholder="输入密码"
                    class="password-input"
                    autocomplete="off"
                />
                <p v-if="authError" class="error-msg">{{ authError }}</p>
                <button @click="authenticate" class="auth-btn">登录</button>
            </div>
        </div>

        <!-- Admin 主界面 -->
        <div v-else class="admin-content">
            <div class="admin-header">
                <h1>内容管理系统</h1>
                <button @click="logout" class="logout-btn">退出登录</button>
            </div>

            <!-- 功能标签页 -->
            <div class="admin-tabs">
                <button 
                    :class="['tab-btn', { active: currentTab === 'articles' }]"
                    @click="currentTab = 'articles'"
                >
                    文章管理
                </button>
                <button 
                    :class="['tab-btn', { active: currentTab === 'images' }]"
                    @click="currentTab = 'images'"
                >
                    图片管理
                </button>
                <button 
                    :class="['tab-btn', { active: currentTab === 'config' }]"
                    @click="currentTab = 'config'"
                >
                    卡片配置
                </button>
            </div>

            <!-- 内容区域 -->
            <div class="admin-main">
                <!-- 文章管理 -->
                <div v-if="currentTab === 'articles'" class="tab-content">
                    <ArticleManager />
                </div>

                <!-- 图片管理 -->
                <div v-else-if="currentTab === 'images'" class="tab-content">
                    <ImageManager />
                </div>

                <!-- 卡片配置管理 -->
                <div v-else-if="currentTab === 'config'" class="tab-content">
                    <CardConfigManager />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ArticleManager from '../components/admin/ArticleManager.vue'
import ImageManager from '../components/admin/ImageManager.vue'
import CardConfigManager from '../components/admin/CardConfigManager.vue'

const isAuthenticated = ref(false)
const password = ref('')
const authError = ref('')
const currentTab = ref('articles')

const ADMIN_PASSWORD = 'zjy051104' // 管理员密码

// 检查本地存储的认证状态
onMounted(() => {
    const authToken = sessionStorage.getItem('admin_auth')
    if (authToken === ADMIN_PASSWORD) {
        isAuthenticated.value = true
    }
})

// 密码认证
const authenticate = () => {
    if (password.value === ADMIN_PASSWORD) {
        isAuthenticated.value = true
        authError.value = ''
        sessionStorage.setItem('admin_auth', ADMIN_PASSWORD)
        password.value = ''
    } else {
        authError.value = '密码错误，请重试'
    }
}

// 退出登录
const logout = () => {
    isAuthenticated.value = false
    sessionStorage.removeItem('admin_auth')
    currentTab.value = 'articles'
}
</script>

<style scoped>
.admin-container {
    min-height: 100vh;
    padding: 20px;
}

/* 认证遮罩 */
.auth-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.auth-box {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 40px;
    width: 90%;
    max-width: 400px;
    text-align: center;
}

.auth-box h2 {
    color: #ffffff;
    margin: 0 0 12px 0;
    font-size: 28px;
}

.auth-hint {
    color: #b8c5d6;
    margin: 0 0 24px 0;
    font-size: 14px;
}

.password-input {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: #ffffff;
    font-size: 16px;
    outline: none;
    transition: all 0.3s;
    box-sizing: border-box;
}

.password-input:focus {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.08);
}

.error-msg {
    color: #ff6b6b;
    margin: 12px 0 0 0;
    font-size: 14px;
}

.auth-btn {
    width: 100%;
    padding: 12px;
    margin-top: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s;
}

.auth-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* Admin 主界面 */
.admin-content {
    max-width: 1400px;
    margin: 0 auto;
}

.admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.admin-header h1 {
    color: #ffffff;
    font-size: 32px;
    margin: 0;
}

.logout-btn {
    padding: 10px 24px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: #ffffff;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
}

.logout-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
}

/* 标签页 */
.admin-tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
}

.tab-btn {
    padding: 12px 24px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #b8c5d6;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
}

.tab-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
}

.tab-btn.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: transparent;
    color: #ffffff;
}

/* 内容区域 */
.admin-main {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 24px;
    min-height: 500px;
}

.tab-content {
    color: #ffffff;
}
</style>
