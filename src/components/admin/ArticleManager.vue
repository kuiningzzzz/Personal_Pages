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
                    <!-- 编辑器部分 -->
                    <div class="editor-section">
                        <div class="form-group">
                            <label>文章分类</label>
                            <select v-model="articleForm.category" class="form-select">
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
                                rows="20"
                            ></textarea>
                        </div>
                    </div>
                    
                    <!-- 预览部分 -->
                    <div class="preview-section">
                        <div class="preview-header">
                            <label>实时预览</label>
                        </div>
                        <div class="preview-content" v-html="renderedPreview"></div>
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
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'

// 配置 marked
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value
            } catch (e) {
                console.error(e)
            }
        }
        return hljs.highlightAuto(code).value
    },
    breaks: true,
    gfm: true
})

const loading = ref(false)
const articles = ref([])
const showNewArticleModal = ref(false)
const editingArticle = ref(null)

const articleForm = ref({
    category: 'tutorials',
    filename: '',
    content: ''
})

// 实时预览
const renderedPreview = computed(() => {
    if (!articleForm.value.content) {
        return '<div class="preview-empty">开始输入内容以查看预览...</div>'
    }
    try {
        return marked(articleForm.value.content)
    } catch (e) {
        return '<div class="preview-error">预览出错</div>'
    }
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
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: white;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
    white-space: nowrap;
}

.primary-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.3);
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
    max-width: 1400px;
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
    display: flex;
    gap: 24px;
}

.editor-section {
    flex: 1;
    min-width: 0;
}

.preview-section {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    padding-left: 24px;
}

.preview-header {
    margin-bottom: 12px;
}

.preview-header label {
    color: #b8c5d6;
    font-size: 14px;
    font-weight: 500;
}

.preview-content {
    flex: 1;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 20px;
    overflow-y: auto;
    color: #e8edf5;
    font-size: 15px;
    line-height: 1.8;
    min-height: 400px;
}

.preview-empty,
.preview-error {
    color: #7a8a9e;
    text-align: center;
    padding: 40px;
    font-style: italic;
}

.preview-error {
    color: #ff6b6b;
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

.form-input, .form-textarea, .form-select {
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

.form-select {
    cursor: pointer;
}

.form-select option {
    background: #1a1f2e;
    color: #ffffff;
    padding: 8px;
}

.form-input:focus, .form-textarea:focus, .form-select:focus {
    border-color: rgba(255, 255, 255, 0.3);
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

/* 响应式设计 */
@media (max-width: 768px) {
    .manager-header {
        flex-direction: column;
        gap: 16px;
        align-items: flex-start;
    }

    .manager-header h2 {
        font-size: 20px;
    }

    .primary-btn, .secondary-btn {
        width: 100%;
        justify-content: center;
    }

    .article-item {
        flex-direction: column;
        gap: 12px;
        align-items: flex-start;
    }

    .article-actions {
        width: 100%;
        justify-content: space-between;
    }

    .action-btn {
        flex: 1;
        text-align: center;
    }

    .modal-content {
        width: 95%;
        max-height: 95vh;
    }

    .modal-header {
        padding: 16px;
    }

    .modal-header h3 {
        font-size: 18px;
    }

    .modal-body {
        padding: 16px;
    }

    .modal-footer {
        padding: 16px;
        flex-direction: column-reverse;
    }

    .modal-footer button {
        width: 100%;
    }

    .form-textarea {
        font-size: 13px;
    }

    .modal-body {
        flex-direction: column;
    }

    .preview-section {
        border-left: none;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-left: 0;
        padding-top: 24px;
        max-height: 300px;
    }

    .preview-content {
        min-height: 200px;
    }
}

@media (max-width: 480px) {
    .article-info h3 {
        font-size: 14px;
    }

    .action-btn {
        padding: 6px 10px;
        font-size: 12px;
    }

    .preview-section {
        max-height: 250px;
    }
}

/* 预览内容的 Markdown 样式 */
.preview-content :deep(h1) {
    color: #ffffff;
    font-size: 28px;
    font-weight: 500;
    margin: 24px 0 16px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-content :deep(h1:first-child) {
    margin-top: 0;
}

.preview-content :deep(h2) {
    color: #ffffff;
    font-size: 22px;
    font-weight: 500;
    margin: 20px 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-content :deep(h3) {
    color: #ffffff;
    font-size: 18px;
    font-weight: 500;
    margin: 16px 0 10px 0;
}

.preview-content :deep(h4),
.preview-content :deep(h5),
.preview-content :deep(h6) {
    color: #e8edf5;
    font-weight: 500;
    margin: 12px 0 8px 0;
}

.preview-content :deep(p) {
    color: #b8c5d6;
    margin: 10px 0;
    line-height: 1.8;
}

.preview-content :deep(strong) {
    color: #ffffff;
    font-weight: 500;
}

.preview-content :deep(em) {
    color: #d4dde8;
    font-style: italic;
}

.preview-content :deep(a) {
    color: #74aaff;
    text-decoration: none;
    word-break: break-word;
}

.preview-content :deep(a:hover) {
    color: #9cc3ff;
    text-decoration: underline;
}

.preview-content :deep(ul),
.preview-content :deep(ol) {
    color: #b8c5d6;
    margin: 12px 0;
    padding-left: 24px;
}

.preview-content :deep(li) {
    margin: 6px 0;
    line-height: 1.7;
}

.preview-content :deep(blockquote) {
    background: rgba(255, 255, 255, 0.03);
    border-left: 4px solid rgba(116, 170, 255, 0.5);
    margin: 16px 0;
    padding: 12px 16px;
    border-radius: 4px;
    color: #c5d0dd;
    font-style: italic;
}

.preview-content :deep(code) {
    background: rgba(255, 255, 255, 0.08);
    color: #ff9d76;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    word-break: break-word;
}

.preview-content :deep(pre) {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 16px;
    margin: 16px 0;
    overflow-x: auto;
}

.preview-content :deep(pre code) {
    background: transparent;
    color: #e8edf5;
    padding: 0;
    font-size: 13px;
    line-height: 1.6;
}

.preview-content :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    overflow: hidden;
    font-size: 13px;
}

.preview-content :deep(th) {
    color: #ffffff;
    font-weight: 500;
    padding: 10px 12px;
    text-align: left;
    border-bottom: 2px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
}

.preview-content :deep(td) {
    color: #b8c5d6;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.preview-content :deep(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 24px 0;
}

.preview-content :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin: 12px 0;
}
</style>

<style>
/* 代码高亮主题 */
@import 'highlight.js/styles/atom-one-dark.css';
</style>
