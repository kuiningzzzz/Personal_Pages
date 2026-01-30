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
                    :class="['tab-btn', { active: currentTab === 'sources' }]"
                    @click="currentTab = 'sources'"
                >
                    下载资源
                </button>
                <button 
                    :class="['tab-btn', { active: currentTab === 'emoji' }]"
                    @click="currentTab = 'emoji'"
                >
                    表情包管理
                </button>
                <button 
                    :class="['tab-btn', { active: currentTab === 'config' }]"
                    @click="currentTab = 'config'"
                >
                    卡片配置
                </button>
                <button 
                    :class="['tab-btn', { active: currentTab === 'backup' }]"
                    @click="currentTab = 'backup'"
                >
                    备份管理
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

                <!-- 下载资源管理 -->
                <div v-else-if="currentTab === 'sources'" class="tab-content">
                    <SourceManager />
                </div>

                <!-- 表情包管理 -->
                <div v-else-if="currentTab === 'emoji'" class="tab-content">
                    <EmojiManager />
                </div>

                <!-- 卡片配置管理 -->
                <div v-else-if="currentTab === 'config'" class="tab-content">
                    <CardConfigManager />
                </div>

                <!-- 备份管理 -->
                <div v-else-if="currentTab === 'backup'" class="tab-content">
                    <div class="backup-manager">
                        <h2>数据备份</h2>
                        <p class="backup-desc">下载完整备份包（包含资源文件和数据库）</p>
                        <div class="backup-actions">
                            <button @click="downloadBackup" :disabled="isDownloading" class="backup-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                <span v-if="!isDownloading">获取备份包</span>
                                <span v-else>正在生成备份...</span>
                            </button>
                        </div>
                        <div class="backup-info">
                            <h3>备份包内容：</h3>
                            <ul>
                                <li>📄 所有文章（public/articles目录）</li>
                                <li>🖼️ 所有图片（public/picture目录）</li>
                                <li>😊 所有表情包（public/emoji目录）</li>
                                <li>👤 所有头像（public/friend_avatar目录）</li>
                                <li>📦 其他资源（public/source目录等）</li>
                                <li>🗄️ 所有数据库文件（data/*.sqlite）</li>
                            </ul>
                            <p class="backup-note">💡 备份包为zip格式，包含public和data两个文件夹，文件名含时间戳</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ArticleManager from '../components/admin/ArticleManager.vue'
import ImageManager from '../components/admin/ImageManager.vue'
import SourceManager from '../components/admin/SourceManager.vue'
import CardConfigManager from '../components/admin/CardConfigManager.vue'
import EmojiManager from '../components/admin/EmojiManager.vue'

const isAuthenticated = ref(false)
const password = ref('')
const authError = ref('')
const currentTab = ref('articles')
const isDownloading = ref(false)

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

// 下载备份
const downloadBackup = async () => {
    if (isDownloading.value) return
    
    try {
        isDownloading.value = true
        
        // 直接通过window.location触发下载
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `backup-${timestamp}.zip`
        
        // 创建一个临时的a标签触发下载
        const link = document.createElement('a')
        link.href = '/api/admin/backup'
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // 延迟重置状态，给服务器一些处理时间
        setTimeout(() => {
            isDownloading.value = false
        }, 2000)
        
    } catch (error) {
        console.error('下载备份失败:', error)
        alert('下载备份失败，请重试')
        isDownloading.value = false
    }
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
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: white;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s;
}

.auth-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.3);
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
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
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

/* 响应式设计 */
@media (max-width: 768px) {
    .admin-container {
        padding: 10px;
    }

    .admin-header {
        flex-direction: column;
        gap: 16px;
        align-items: flex-start;
    }

    .admin-header h1 {
        font-size: 24px;
    }

    .logout-btn {
        width: 100%;
    }

    .admin-tabs {
        flex-direction: column;
        gap: 8px;
    }

    .tab-btn {
        width: 100%;
        text-align: center;
    }

    .admin-main {
        padding: 16px;
    }

    .auth-box {
        padding: 24px;
        width: 95%;
    }

    .auth-box h2 {
        font-size: 22px;
    }
}

.tab-content {
    color: #ffffff;
}

/* 备份管理样式 */
.backup-manager {
    max-width: 800px;
}

.backup-manager h2 {
    color: #ffffff;
    font-size: 24px;
    margin: 0 0 12px 0;
}

.backup-desc {
    color: #b8c5d6;
    font-size: 14px;
    margin: 0 0 24px 0;
}

.backup-actions {
    margin-bottom: 32px;
}

.backup-btn {
    padding: 14px 28px;
    background: rgba(52, 152, 219, 0.3);
    border: 1px solid rgba(52, 152, 219, 0.5);
    border-radius: 8px;
    color: #ffffff;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s;
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.backup-btn:hover:not(:disabled) {
    background: rgba(52, 152, 219, 0.4);
    border-color: rgba(52, 152, 219, 0.6);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}

.backup-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.backup-info h3 {
    color: #ffffff;
    font-size: 18px;
    margin: 0 0 16px 0;
}

.backup-info ul {
    list-style: none;
    padding: 0;
    margin: 0 0 20px 0;
}

.backup-info li {
    color: #b8c5d6;
    font-size: 14px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.backup-note {
    color: #7a8a9e;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.03);
    padding: 12px;
    border-radius: 6px;
    margin: 0;
}
</style>
