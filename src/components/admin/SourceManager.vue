<template>
    <div class="source-manager">
        <div class="manager-header">
            <h2>下载资源管理</h2>
            <div class="upload-area">
                <input 
                    type="file" 
                    ref="fileInput" 
                    @change="handleFileSelect"
                    multiple
                    style="display: none"
                />
                <button @click="$refs.fileInput.click()" class="primary-btn">
                    <span>+ 上传资源</span>
                </button>
            </div>
        </div>

        <!-- 资源列表 -->
        <div class="source-list">
            <div v-if="loading" class="loading">加载中...</div>
            <div v-else-if="sources.length === 0" class="empty">暂无资源文件</div>
            <div v-else class="source-items">
                <div 
                    v-for="source in sources" 
                    :key="source.path"
                    class="source-item"
                >
                    <div class="source-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                    </div>
                    <div class="source-info">
                        <h3>{{ source.name }}</h3>
                        <p class="source-path">{{ source.relativePath }}</p>
                        <div class="source-meta">
                            <span class="source-size">{{ formatSize(source.size) }}</span>
                            <span class="source-date">{{ formatDate(source.modified) }}</span>
                        </div>
                    </div>
                    <div class="source-actions">
                        <button @click="downloadSource(source)" class="action-btn download">下载</button>
                        <button @click="copyPath(source.relativePath)" class="action-btn copy">复制路径</button>
                        <button @click="deleteSource(source)" class="action-btn delete">删除</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const loading = ref(false)
const sources = ref([])
const fileInput = ref(null)

// 加载资源列表
const loadSources = async () => {
    loading.value = true
    try {
        const response = await fetch('/api/admin/sources')
        const data = await response.json()
        if (data.success) {
            sources.value = data.data
        }
    } catch (error) {
        console.error('加载资源列表失败:', error)
        alert('加载资源列表失败')
    } finally {
        loading.value = false
    }
}

// 处理文件选择
const handleFileSelect = async (event) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    
    for (let file of files) {
        formData.append('sources', file)
    }

    try {
        const response = await fetch('/api/admin/sources', {
            method: 'POST',
            body: formData
        })
        const data = await response.json()
        if (data.success) {
            alert('上传成功')
            loadSources()
        } else {
            alert(data.message || '上传失败')
        }
    } catch (error) {
        console.error('上传资源失败:', error)
        alert('上传资源失败')
    }

    // 清空文件选择
    event.target.value = ''
}

// 下载资源
const downloadSource = (source) => {
    const link = document.createElement('a')
    link.href = source.relativePath
    link.download = source.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

// 删除资源
const deleteSource = async (source) => {
    if (!confirm(`确定要删除资源 "${source.name}" 吗？`)) return
    
    try {
        const response = await fetch('/api/admin/sources', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: source.path })
        })
        const data = await response.json()
        if (data.success) {
            alert('删除成功')
            loadSources()
        } else {
            alert(data.message || '删除失败')
        }
    } catch (error) {
        console.error('删除资源失败:', error)
        alert('删除资源失败')
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

// 格式化日期
const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
    loadSources()
})
</script>

<style scoped>
.source-manager {
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

.source-list {
    min-height: 300px;
}

.loading, .empty {
    text-align: center;
    padding: 40px;
    color: #7a8a9e;
}

.source-items {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.source-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    transition: all 0.3s;
}

.source-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
}

.source-icon {
    color: #74aaff;
    flex-shrink: 0;
}

.source-info {
    flex: 1;
    min-width: 0;
}

.source-info h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    color: #ffffff;
    word-break: break-all;
}

.source-path {
    margin: 0 0 8px 0;
    font-size: 12px;
    color: #7a8a9e;
    font-family: 'Consolas', 'Monaco', monospace;
    word-break: break-all;
}

.source-meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
}

.source-size {
    color: #b8c5d6;
}

.source-date {
    color: #7a8a9e;
}

.source-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}

.action-btn {
    padding: 6px 16px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.3s;
    white-space: nowrap;
}

.action-btn.download {
    background: rgba(46, 204, 113, 0.2);
    color: #2ecc71;
}

.action-btn.download:hover {
    background: rgba(46, 204, 113, 0.3);
}

.action-btn.copy {
    background: rgba(52, 152, 219, 0.2);
    color: #3498db;
}

.action-btn.copy:hover {
    background: rgba(52, 152, 219, 0.3);
}

.action-btn.delete {
    background: rgba(231, 76, 60, 0.2);
    color: #e74c3c;
}

.action-btn.delete:hover {
    background: rgba(231, 76, 60, 0.3);
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

    .primary-btn {
        width: 100%;
    }

    .source-item {
        flex-direction: column;
        align-items: flex-start;
    }

    .source-actions {
        width: 100%;
        justify-content: space-between;
    }

    .action-btn {
        flex: 1;
        text-align: center;
    }
}

@media (max-width: 480px) {
    .source-info h3 {
        font-size: 14px;
    }

    .source-meta {
        flex-direction: column;
        gap: 4px;
    }

    .action-btn {
        padding: 6px 10px;
        font-size: 12px;
    }
}
</style>
