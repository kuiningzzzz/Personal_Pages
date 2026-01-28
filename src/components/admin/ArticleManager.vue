<template>
    <div class="article-manager">
        <div class="manager-header">
            <h2>Markdown 文章管理</h2>
            <button @click="showNewArticleModal = true" class="primary-btn">
                <span>+ 新建文章</span>
            </button>
        </div>

        <!-- 文章列表 -->
        <div class="article-list">
            <div v-if="loading" class="loading">加载中...</div>
            <div v-else-if="articles.length === 0" class="empty">暂无文章</div>
            <div v-else class="article-items">
                <div 
                    v-for="article in articles" 
                    :key="article.path"
                    class="article-item"
                >
                    <div class="article-info">
                        <h3>{{ article.name }}</h3>
                        <p>{{ article.path }}</p>
                        <span class="article-size">{{ formatSize(article.size) }}</span>
                    </div>
                    <div class="article-actions">
                        <button @click="editArticle(article)" class="action-btn edit">编辑</button>
                        <button @click="deleteArticle(article)" class="action-btn delete">删除</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 新建/编辑文章模态框 -->
        <div v-if="showNewArticleModal || editingArticle" class="modal-overlay" @click.self="closeModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>{{ editingArticle ? '编辑文章' : '新建文章' }}</h3>
                    <button @click="closeModal" class="close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>文章分类</label>
                        <select v-model="articleForm.category" class="form-input">
                            <option value="tutorials">教程 (tutorials)</option>
                            <option value="projects">项目 (projects)</option>
                            <option value="note">笔记 (note)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>文件名</label>
                        <input 
                            v-model="articleForm.filename" 
                            class="form-input"
                            placeholder="example.md"
                            :disabled="!!editingArticle"
                        />
                    </div>
                    <div class="form-group">
                        <label>文章内容</label>
                        <textarea 
                            v-model="articleForm.content" 
                            class="form-textarea"
                            placeholder="# 文章标题

在这里输入 Markdown 内容..."
                            rows="15"
                        ></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button @click="closeModal" class="secondary-btn">取消</button>
                    <button @click="saveArticle" class="primary-btn">保存</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const loading = ref(false)
const articles = ref([])
const showNewArticleModal = ref(false)
const editingArticle = ref(null)

const articleForm = ref({
    category: 'tutorials',
    filename: '',
    content: ''
})

// 加载文章列表
const loadArticles = async () => {
    loading.value = true
    try {
        const response = await fetch('/api/admin/articles')
        const data = await response.json()
        if (data.success) {
            articles.value = data.data
        }
    } catch (error) {
        console.error('加载文章列表失败:', error)
        alert('加载文章列表失败')
    } finally {
        loading.value = false
    }
}

// 编辑文章
const editArticle = async (article) => {
    try {
        const response = await fetch(`/api/admin/articles/content?path=${encodeURIComponent(article.path)}`)
        const data = await response.json()
        if (data.success) {
            editingArticle.value = article
            articleForm.value = {
                category: article.category,
                filename: article.name,
                content: data.data
            }
        }
    } catch (error) {
        console.error('加载文章内容失败:', error)
        alert('加载文章内容失败')
    }
}

// 删除文章
const deleteArticle = async (article) => {
    if (!confirm(`确定要删除文章 "${article.name}" 吗？`)) return
    
    try {
        const response = await fetch('/api/admin/articles', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: article.path })
        })
        const data = await response.json()
        if (data.success) {
            alert('删除成功')
            loadArticles()
        } else {
            alert(data.message || '删除失败')
        }
    } catch (error) {
        console.error('删除文章失败:', error)
        alert('删除文章失败')
    }
}

// 保存文章
const saveArticle = async () => {
    if (!articleForm.value.filename || !articleForm.value.content) {
        alert('请填写完整信息')
        return
    }

    try {
        const response = await fetch('/api/admin/articles', {
            method: editingArticle.value ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: articleForm.value.category,
                filename: articleForm.value.filename,
                content: articleForm.value.content,
                oldPath: editingArticle.value?.path
            })
        })
        const data = await response.json()
        if (data.success) {
            alert(editingArticle.value ? '保存成功' : '创建成功')
            closeModal()
            loadArticles()
        } else {
            alert(data.message || '保存失败')
        }
    } catch (error) {
        console.error('保存文章失败:', error)
        alert('保存文章失败')
    }
}

// 关闭模态框
const closeModal = () => {
    showNewArticleModal.value = false
    editingArticle.value = null
    articleForm.value = {
        category: 'tutorials',
        filename: '',
        content: ''
    }
}

// 格式化文件大小
const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

onMounted(() => {
    loadArticles()
})
</script>

<style scoped>
.article-manager {
    color: #ffffff;
}

.manager-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}

.manager-header h2 {
    margin: 0;
    font-size: 24px;
}

.primary-btn {
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
}

.primary-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.secondary-btn {
    padding: 10px 20px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: white;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
}

.secondary-btn:hover {
    background: rgba(255, 255, 255, 0.12);
}

.article-list {
    min-height: 300px;
}

.loading, .empty {
    text-align: center;
    padding: 40px;
    color: #7a8a9e;
}

.article-items {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.article-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    transition: all 0.3s;
}

.article-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
}

.article-info h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    color: #ffffff;
}

.article-info p {
    margin: 0 0 4px 0;
    font-size: 12px;
    color: #7a8a9e;
}

.article-size {
    font-size: 11px;
    color: #5a6a7e;
}

.article-actions {
    display: flex;
    gap: 8px;
}

.action-btn {
    padding: 6px 16px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.3s;
}

.action-btn.edit {
    background: rgba(52, 152, 219, 0.2);
    color: #3498db;
}

.action-btn.edit:hover {
    background: rgba(52, 152, 219, 0.3);
}

.action-btn.delete {
    background: rgba(231, 76, 60, 0.2);
    color: #e74c3c;
}

.action-btn.delete:hover {
    background: rgba(231, 76, 60, 0.3);
}

/* 模态框 */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.modal-content {
    background: rgba(20, 25, 35, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
    margin: 0;
    font-size: 20px;
}

.close-btn {
    background: none;
    border: none;
    color: #ffffff;
    font-size: 32px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
}

.close-btn:hover {
    color: #e74c3c;
}

.modal-body {
    padding: 24px;
    overflow-y: auto;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    color: #b8c5d6;
    font-size: 14px;
}

.form-input, .form-textarea {
    width: 100%;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #ffffff;
    font-size: 14px;
    outline: none;
    transition: all 0.3s;
    box-sizing: border-box;
    font-family: inherit;
}

.form-textarea {
    resize: vertical;
    font-family: 'Consolas', 'Monaco', monospace;
    line-height: 1.6;
}

.form-input:focus, .form-textarea:focus {
    border-color: rgba(102, 126, 234, 0.5);
    background: rgba(255, 255, 255, 0.08);
}

.form-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
