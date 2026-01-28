<template>
    <div class="image-manager">
        <div class="manager-header">
            <h2>图片资源管理</h2>
            <div class="upload-area">
                <input 
                    type="file" 
                    ref="fileInput" 
                    @change="handleFileSelect"
                    accept="image/*"
                    multiple
                    style="display: none"
                />
                <button @click="$refs.fileInput.click()" class="primary-btn">
                    <span>+ 上传图片</span>
                </button>
            </div>
        </div>

        <!-- 分类选择 -->
        <div class="category-tabs">
            <button 
                :class="['category-tab', { active: currentCategory === 'tutorials' }]"
                @click="currentCategory = 'tutorials'"
            >
                教程图片
            </button>
            <button 
                :class="['category-tab', { active: currentCategory === 'friend_avatar' }]"
                @click="currentCategory = 'friend_avatar'"
            >
                好友头像
            </button>
            <button 
                :class="['category-tab', { active: currentCategory === 'other' }]"
                @click="currentCategory = 'other'"
            >
                其他图片
            </button>
        </div>

        <!-- 图片列表 -->
        <div class="image-list">
            <div v-if="loading" class="loading">加载中...</div>
            <div v-else-if="filteredImages.length === 0" class="empty">暂无图片</div>
            <div v-else class="image-grid">
                <div 
                    v-for="image in filteredImages" 
                    :key="image.path"
                    class="image-item"
                >
                    <div class="image-preview">
                        <img :src="image.url" :alt="image.name" />
                    </div>
                    <div class="image-info">
                        <p class="image-name">{{ image.name }}</p>
                        <p class="image-size">{{ formatSize(image.size) }}</p>
                        <div class="image-path-group">
                            <input 
                                :value="image.relativePath" 
                                readonly 
                                class="image-path"
                                @click="copyPath(image.relativePath)"
                            />
                            <button @click="copyPath(image.relativePath)" class="copy-btn">复制</button>
                        </div>
                    </div>
                    <div class="image-actions">
                        <button @click="deleteImage(image)" class="action-btn delete">删除</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(false)
const images = ref([])
const currentCategory = ref('tutorials')
const fileInput = ref(null)

// 过滤图片
const filteredImages = computed(() => {
    if (currentCategory.value === 'tutorials') {
        return images.value.filter(img => img.path.includes('/tutorials/'))
    } else if (currentCategory.value === 'friend_avatar') {
        return images.value.filter(img => img.path.includes('/friend_avatar/'))
    } else {
        return images.value.filter(img => 
            !img.path.includes('/tutorials/') && 
            !img.path.includes('/friend_avatar/')
        )
    }
})

// 加载图片列表
const loadImages = async () => {
    loading.value = true
    try {
        const response = await fetch('/api/admin/images')
        const data = await response.json()
        if (data.success) {
            images.value = data.data
        }
    } catch (error) {
        console.error('加载图片列表失败:', error)
        alert('加载图片列表失败')
    } finally {
        loading.value = false
    }
}

// 处理文件选择
const handleFileSelect = async (event) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    
    // 根据当前分类决定上传路径
    let targetPath = 'other'
    if (currentCategory.value === 'tutorials') {
        targetPath = 'tutorials'
    } else if (currentCategory.value === 'friend_avatar') {
        targetPath = 'friend_avatar'
    }
    
    formData.append('category', targetPath)
    
    for (let file of files) {
        formData.append('images', file)
    }

    try {
        const response = await fetch('/api/admin/images', {
            method: 'POST',
            body: formData
        })
        const data = await response.json()
        if (data.success) {
            alert('上传成功')
            loadImages()
        } else {
            alert(data.message || '上传失败')
        }
    } catch (error) {
        console.error('上传图片失败:', error)
        alert('上传图片失败')
    }

    // 清空文件选择
    event.target.value = ''
}

// 删除图片
const deleteImage = async (image) => {
    if (!confirm(`确定要删除图片 "${image.name}" 吗？`)) return
    
    try {
        const response = await fetch('/api/admin/images', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: image.path })
        })
        const data = await response.json()
        if (data.success) {
            alert('删除成功')
            loadImages()
        } else {
            alert(data.message || '删除失败')
        }
    } catch (error) {
        console.error('删除图片失败:', error)
        alert('删除图片失败')
    }
}

// 复制路径
const copyPath = (path) => {
    navigator.clipboard.writeText(path).then(() => {
        alert('路径已复制到剪贴板')
    }).catch(() => {
        alert('复制失败')
    })
}

// 格式化文件大小
const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

onMounted(() => {
    loadImages()
})
</script>

<style scoped>
.image-manager {
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

.category-tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
}

.category-tab {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #b8c5d6;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.3s;
}

.category-tab:hover {
    background: rgba(255, 255, 255, 0.08);
}

.category-tab.active {
    background: rgba(102, 126, 234, 0.3);
    border-color: rgba(102, 126, 234, 0.5);
    color: #ffffff;
}

.image-list {
    min-height: 300px;
}

.loading, .empty {
    text-align: center;
    padding: 40px;
    color: #7a8a9e;
}

.image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
}

.image-item {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 12px;
    transition: all 0.3s;
}

.image-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
}

.image-preview {
    width: 100%;
    height: 180px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.image-preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.image-info {
    margin-bottom: 12px;
}

.image-name {
    margin: 0 0 4px 0;
    font-size: 14px;
    color: #ffffff;
    word-break: break-all;
}

.image-size {
    margin: 0 0 8px 0;
    font-size: 11px;
    color: #7a8a9e;
}

.image-path-group {
    display: flex;
    gap: 4px;
}

.image-path {
    flex: 1;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #7a8a9e;
    font-size: 11px;
    font-family: 'Consolas', 'Monaco', monospace;
    cursor: pointer;
}

.copy-btn {
    padding: 6px 12px;
    background: rgba(52, 152, 219, 0.2);
    border: 1px solid rgba(52, 152, 219, 0.3);
    border-radius: 4px;
    color: #3498db;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.3s;
}

.copy-btn:hover {
    background: rgba(52, 152, 219, 0.3);
}

.image-actions {
    display: flex;
    justify-content: flex-end;
}

.action-btn.delete {
    padding: 6px 16px;
    background: rgba(231, 76, 60, 0.2);
    border: 1px solid rgba(231, 76, 60, 0.3);
    border-radius: 6px;
    color: #e74c3c;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.3s;
}

.action-btn.delete:hover {
    background: rgba(231, 76, 60, 0.3);
}
</style>
