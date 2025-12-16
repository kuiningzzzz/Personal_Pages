<template>
    <div class="comment-area">
        <div class="comment-card">
            <div class="card-title">
                <h3>COMMENT</h3>
                <h3>&</h3>
                <h3>DISCUSSION</h3>
            </div>
            <!-- 发表评论表单 -->
            <div class="card-content">
                <div class="comment-form">
                    <div class="input-user-info">
                        <input v-model="newComment.username" type="text" placeholder="昵称 *" maxlength="50"
                            class="input-field" />
                        <input v-model="newComment.email" type="email" placeholder="邮箱（可选）" maxlength="100"
                            class="input-field" />
                    </div>
                    <textarea v-model="newComment.content" placeholder="留下你的足迹... *" maxlength="500" rows="4"
                        class="textarea-field"></textarea>
                    <div class="form-footer">
                        <span class="char-count">{{ newComment.content.length }}/500</span>
                        <button @click="submitComment" class="submit-btn" :disabled="isSubmitting">
                            {{ isSubmitting ? '发送中...' : '发表评论' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <!-- 评论列表 -->
        <div class="comment-list">
            <div v-if="loading" class="loading">加载中...</div>
            <div v-else-if="comments.length === 0" class="empty">暂无评论，快来抢沙发吧！</div>
            <div v-else>
                <div v-for="comment in comments" :key="comment.id" class="comment-item">
                    <div class="comment-header">
                        <div class="comment-author">
                            <span class="username">{{ comment.username }}</span>
                            <span class="email" v-if="comment.email">{{ comment.email }}</span>
                        </div>
                        <span class="comment-time">{{ formatTime(comment.created_at) }}</span>
                    </div>
                    <div class="comment-content">{{ comment.content }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 接收 pageId 参数
const props = defineProps({
    pageId: {
        type: String,
        required: true,
        default: 'home'
    }
})

const API_BASE = import.meta.env.VITE_API_BASE_URL

const comments = ref([])
const loading = ref(false)
const isSubmitting = ref(false)
const newComment = ref({
    username: '',
    email: '',
    content: ''
})

// 获取评论列表（按页面ID筛选）
async function fetchComments() {
    loading.value = true
    try {
        const response = await fetch(`${API_BASE}/comments?page_id=${props.pageId}`)
        const result = await response.json()
        if (result.success) {
            comments.value = result.data
        }
    } catch (error) {
        console.error('获取评论失败:', error)
        alert('获取评论失败，请检查后端服务是否启动')
    } finally {
        loading.value = false
    }
}

// 提交评论
async function submitComment() {
    // 验证
    if (!newComment.value.username.trim()) {
        alert('请输入昵称')
        return
    }
    if (!newComment.value.content.trim()) {
        alert('请输入评论内容')
        return
    }

    isSubmitting.value = true
    try {
        const response = await fetch(`${API_BASE}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                page_id: props.pageId,
                ...newComment.value
            })
        })
        const result = await response.json()

        if (result.success) {
            // 清空表单
            newComment.value = { username: '', email: '', content: '' }
            // 刷新评论列表
            await fetchComments()
            alert('评论发表成功！')
        } else {
            alert(result.message || '评论发表失败')
        }
    } catch (error) {
        console.error('发表评论失败:', error)
        alert('发表评论失败，请检查网络连接')
    } finally {
        isSubmitting.value = false
    }
}

// 格式化时间
function formatTime(dateString) {
    // SQLite 返回的是 UTC 时间，需要转换为本地时间
    const date = new Date(dateString + 'Z') // 添加 'Z' 表示这是 UTC 时间
    const now = new Date()
    const diff = now - date

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`

    return date.toLocaleDateString('zh-CN')
}

onMounted(() => {
    fetchComments()
})
</script>

<style scoped>
.comment-area {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 32px;
    width: 90%;
    max-width: 800px;
    margin: 0 auto;
}

.comment-card {
    padding: 0;
    width: 100%;
    display: flex;
    align-items: stretch;
    gap: 20px;
    margin: 0;
}

.card-title {
    width: 20%;
    min-width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    padding-right: 20px;
    flex-direction: column;
}

.card-title h3 {
    color: #ffffff;
    font-size: 18px;
    font-weight: 500;
    margin: 0;
    writing-mode: horizontal-tb;
    letter-spacing: 0.5px;
    text-align: center;
}

.card-content {
    width: 80%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 20px;
    gap: 5px;
}

/* 评论表单 */
.comment-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.input-user-info {
    display: flex;
    gap: 12px;
    justify-content: space-between;
}

.input-field,
.textarea-field {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px 16px;
    color: #e8edf5;
    font-size: 14px;
    font-weight: 300;
    transition: all 0.2s ease;
    flex: 1;
}

.input-field::placeholder,
.textarea-field::placeholder {
    color: #7a8a9e;
}

.input-field:focus,
.textarea-field:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
}

.textarea-field {
    resize: vertical;
    min-height: 100px;
    font-family: inherit;
    line-height: 1.6;
}

.form-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.char-count {
    color: #7a8a9e;
    font-size: 12px;
    white-space: nowrap;
}

.submit-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #e8edf5;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.submit-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
}

.submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* 评论列表 */
.comment-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.loading,
.empty {
    text-align: center;
    color: #7a8a9e;
    padding: 32px;
    font-size: 14px;
}

.comment-item {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s ease;
}

.comment-item:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
}

.comment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
}

.comment-author {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.username {
    color: #ffffff;
    font-weight: 500;
    font-size: 15px;
}

.email {
    color: #7a8a9e;
    font-size: 12px;
}

.comment-time {
    color: #7a8a9e;
    font-size: 12px;
    white-space: nowrap;
}

.comment-content {
    color: #b8c5d6;
    font-size: 14px;
    line-height: 1.7;
    font-weight: 300;
    white-space: pre-wrap;
    word-break: break-word;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .comment-area {
        padding: 24px;
        width: 95%;
    }

    .comment-card {
        flex-direction: column;
        gap: 12px;
    }

    .card-title {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0 0 12px 0;
        justify-content: flex-start;
    }

    .card-title h3 {
        font-size: 16px;
        text-align: left;
    }

    .card-content {
        width: 100%;
        padding-left: 0;
    }

    .input-user-info {
        flex-direction: column;
        gap: 10px;
    }

    .input-field {
        flex: 1;
    }

    .comment-form {
        gap: 10px;
        margin-bottom: 20px;
        padding-bottom: 16px;
    }

    .textarea-field {
        min-height: 80px;
        font-size: 13px;
    }

    .form-footer {
        flex-wrap: wrap;
        justify-content: space-between;
    }

    .submit-btn {
        padding: 8px 16px;
        font-size: 13px;
    }

    .comment-header {
        gap: 6px;
    }

    .comment-author {
        gap: 8px;
    }

    .username {
        font-size: 14px;
    }

    .comment-content {
        font-size: 13px;
    }
}

@media (max-width: 480px) {
    .comment-area {
        padding: 16px;
        width: 100%;
        border-radius: 8px;
        margin: 0 5px;
    }

    .card-title h3 {
        font-size: 14px;
    }

    .input-user-info {
        flex-direction: column;
    }

    .input-field,
    .textarea-field {
        padding: 10px 12px;
        font-size: 12px;
    }

    .textarea-field {
        min-height: 60px;
    }

    .form-footer {
        gap: 8px;
    }

    .submit-btn {
        padding: 6px 12px;
        font-size: 12px;
    }

    .char-count {
        font-size: 11px;
    }

    .comment-item {
        padding: 12px;
    }

    .comment-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }

    .comment-author {
        gap: 6px;
    }

    .username {
        font-size: 13px;
    }

    .email {
        font-size: 11px;
    }

    .comment-time {
        font-size: 11px;
    }

    .comment-content {
        font-size: 12px;
        line-height: 1.6;
    }
}
</style>
