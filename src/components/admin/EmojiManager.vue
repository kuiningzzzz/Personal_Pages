<template>
    <div class="emoji-manager">
        <div class="manager-header">
            <h2>表情包管理</h2>
            <div class="header-actions">
                <button @click="showAddCategory = true" class="action-btn primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    新建分类
                </button>
                <button @click="loadCategories" class="action-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    刷新
                </button>
            </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading">加载中...</div>

        <!-- 分类列表 -->
        <div v-else class="categories-list">
            <div v-for="category in categories" :key="category.id" class="category-card">
                <div class="category-header">
                    <div class="category-info">
                        <h3>{{ category.title }}</h3>
                        <p>{{ category.desc }}</p>
                        <span class="category-id">ID: {{ category.id }}</span>
                        <span class="image-count">{{ category.count }} 张图片</span>
                    </div>
                    <div class="category-actions">
                        <button @click="editCategory(category)" class="icon-btn" title="编辑分类">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button @click="deleteCategory(category)" class="icon-btn danger" title="删除分类">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- 图片预览 -->
                <div class="category-images">
                    <div v-for="(image, index) in category.images" :key="index" class="image-item">
                        <img :src="image" :alt="`表情包 ${index + 1}`" />
                        <button @click="deleteImage(category.id, image)" class="delete-image-btn" title="删除图片">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="upload-box" @click="triggerUpload(category.id)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>上传图片</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 新建/编辑分类对话框 -->
        <div v-if="showAddCategory || editingCategory" class="modal" @click.self="closeModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>{{ editingCategory ? '编辑分类' : '新建分类' }}</h3>
                    <button @click="closeModal" class="close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>分类ID (用于URL)</label>
                        <input v-model="categoryForm.id" type="text" placeholder="例如: type1, cat_funny"
                            :disabled="!!editingCategory" />
                        <small>只能包含字母、数字、下划线和连字符</small>
                    </div>
                    <div class="form-group">
                        <label>分类标题</label>
                        <input v-model="categoryForm.title" type="text" placeholder="例如: 搞笑表情包" />
                    </div>
                    <div class="form-group">
                        <label>分类描述</label>
                        <textarea v-model="categoryForm.desc" placeholder="简单描述这个分类的内容"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button @click="closeModal" class="action-btn">取消</button>
                    <button @click="saveCategory" class="action-btn primary">保存</button>
                </div>
            </div>
        </div>

        <!-- 隐藏的文件上传input -->
        <input ref="fileInput" type="file" accept="image/*" multiple style="display: none"
            @change="handleFileUpload" />

        <!-- 消息提示 -->
        <div v-if="message" :class="['message', message.type]">
            {{ message.text }}
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const loading = ref(false)
const categories = ref([])
const showAddCategory = ref(false)
const editingCategory = ref(null)
const currentUploadCategory = ref(null)
const fileInput = ref(null)
const message = ref(null)

const categoryForm = ref({
    id: '',
    title: '',
    desc: ''
})

// 加载分类列表
const loadCategories = async () => {
    loading.value = true
    try {
        const response = await fetch('/api/admin/emoji/categories')
        const data = await response.json()
        if (data.success) {
            console.log('📦 加载的分类数据:', data.data)
            categories.value = data.data
            console.log('✅ categories.value:', categories.value)
        } else {
            showMessage('加载失败: ' + data.message, 'error')
        }
    } catch (error) {
        console.error('加载分类失败:', error)
        showMessage('加载分类失败', 'error')
    } finally {
        loading.value = false
    }
}

// 编辑分类
const editCategory = (category) => {
    editingCategory.value = category
    categoryForm.value = {
        id: category.id,
        title: category.title,
        desc: category.desc
    }
}

// 保存分类
const saveCategory = async () => {
    if (!categoryForm.value.id || !categoryForm.value.title) {
        showMessage('请填写必填项', 'error')
        return
    }

    // 验证ID格式
    if (!/^[a-zA-Z0-9_-]+$/.test(categoryForm.value.id)) {
        showMessage('分类ID只能包含字母、数字、下划线和连字符', 'error')
        return
    }

    try {
        const url = editingCategory.value
            ? '/api/admin/emoji/categories'
            : '/api/admin/emoji/categories'
        const method = editingCategory.value ? 'PUT' : 'POST'

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(categoryForm.value)
        })

        const data = await response.json()
        if (data.success) {
            showMessage(editingCategory.value ? '更新成功' : '创建成功', 'success')
            closeModal()
            loadCategories()
        } else {
            showMessage(data.message, 'error')
        }
    } catch (error) {
        console.error('保存分类失败:', error)
        showMessage('保存失败', 'error')
    }
}

// 删除分类
const deleteCategory = async (category) => {
    if (!confirm(`确定要删除分类"${category.title}"吗？这将删除该分类下的所有图片！`)) {
        return
    }

    try {
        const response = await fetch('/api/admin/emoji/categories', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: category.id })
        })

        const data = await response.json()
        if (data.success) {
            showMessage('删除成功', 'success')
            loadCategories()
        } else {
            showMessage(data.message, 'error')
        }
    } catch (error) {
        console.error('删除分类失败:', error)
        showMessage('删除失败', 'error')
    }
}

// 触发文件上传
const triggerUpload = (categoryId) => {
    currentUploadCategory.value = categoryId
    fileInput.value.click()
}

// 处理文件上传
const handleFileUpload = async (event) => {
    const files = event.target.files
    if (!files.length) return

    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i])
    }

    try {
        // 通过URL参数传递category，避免multer解析顺序问题
        const response = await fetch(`/api/admin/emoji/images/${currentUploadCategory.value}`, {
            method: 'POST',
            body: formData
        })

        const data = await response.json()
        if (data.success) {
            showMessage(`成功上传 ${files.length} 张图片`, 'success')
            loadCategories()
        } else {
            showMessage(data.message, 'error')
        }
    } catch (error) {
        console.error('上传失败:', error)
        showMessage('上传失败', 'error')
    }

    // 重置input
    event.target.value = ''
}

// 删除图片
const deleteImage = async (categoryId, imagePath) => {
    if (!confirm('确定要删除这张图片吗？')) {
        return
    }

    try {
        const response = await fetch('/api/admin/emoji/images', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: categoryId, path: imagePath })
        })

        const data = await response.json()
        if (data.success) {
            showMessage('删除成功', 'success')
            loadCategories()
        } else {
            showMessage(data.message, 'error')
        }
    } catch (error) {
        console.error('删除图片失败:', error)
        showMessage('删除失败', 'error')
    }
}

// 关闭模态框
const closeModal = () => {
    showAddCategory.value = false
    editingCategory.value = null
    categoryForm.value = { id: '', title: '', desc: '' }
}

// 显示消息
const showMessage = (text, type = 'info') => {
    message.value = { text, type }
    setTimeout(() => {
        message.value = null
    }, 3000)
}

onMounted(() => {
    loadCategories()
})
</script>

<style scoped>
.emoji-manager {
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
    color: #ffffff;
}

.header-actions {
    display: flex;
    gap: 12px;
}

.action-btn {
    padding: 10px 16px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #ffffff;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
}

.action-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
}

.action-btn.primary {
    background: rgba(52, 152, 219, 0.3);
    border-color: rgba(52, 152, 219, 0.5);
}

.action-btn.primary:hover {
    background: rgba(52, 152, 219, 0.4);
    border-color: rgba(52, 152, 219, 0.6);
}

.loading {
    text-align: center;
    padding: 60px;
    color: #7a8a9e;
}

.categories-list {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.category-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 20px;
    transition: all 0.3s;
}

.category-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
}

.category-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
}

.category-info h3 {
    margin: 0 0 8px 0;
    font-size: 20px;
    color: #ffffff;
}

.category-info p {
    margin: 0 0 8px 0;
    color: #b8c5d6;
    font-size: 14px;
}

.category-id,
.image-count {
    display: inline-block;
    padding: 4px 12px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    font-size: 12px;
    color: #7a8a9e;
    margin-right: 8px;
}

.category-actions {
    display: flex;
    gap: 8px;
}

.icon-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #ffffff;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.icon-btn:hover {
    background: rgba(255, 255, 255, 0.12);
}

.icon-btn.danger:hover {
    background: rgba(231, 76, 60, 0.3);
    border-color: rgba(231, 76, 60, 0.5);
}

.category-images {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
}

.image-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
}

.image-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.delete-image-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    padding: 0;
    background: rgba(231, 76, 60, 0.8);
    border: none;
    border-radius: 4px;
    color: #ffffff;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.image-item:hover .delete-image-btn {
    opacity: 1;
}

.delete-image-btn:hover {
    background: rgba(231, 76, 60, 1);
}

.upload-box {
    aspect-ratio: 1;
    border: 2px dashed rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    color: #7a8a9e;
}

.upload-box:hover {
    border-color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.04);
    color: #b8c5d6;
}

.upload-box span {
    font-size: 12px;
    margin-top: 8px;
}

/* 模态框 */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
}

.modal-content {
    background: rgba(30, 30, 40, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
    margin: 0;
    color: #ffffff;
    font-size: 20px;
}

.close-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: none;
    border: none;
    color: #ffffff;
    font-size: 32px;
    cursor: pointer;
    line-height: 1;
}

.close-btn:hover {
    color: #7a8a9e;
}

.modal-body {
    padding: 20px;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
}

.form-group input,
.form-group textarea {
    width: 100%;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #ffffff;
    font-size: 14px;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.08);
}

.form-group textarea {
    min-height: 80px;
    resize: vertical;
}

.form-group small {
    display: block;
    margin-top: 4px;
    color: #7a8a9e;
    font-size: 12px;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* 消息提示 */
.message {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
}

.message.success {
    background: rgba(46, 204, 113, 0.9);
    color: #ffffff;
}

.message.error {
    background: rgba(231, 76, 60, 0.9);
    color: #ffffff;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

/* 响应式 */
@media (max-width: 768px) {
    .manager-header {
        flex-direction: column;
        gap: 16px;
        align-items: stretch;
    }

    .header-actions {
        flex-direction: column;
    }

    .category-header {
        flex-direction: column;
        gap: 12px;
    }

    .category-actions {
        align-self: flex-end;
    }

    .category-images {
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 8px;
    }
}
</style>
