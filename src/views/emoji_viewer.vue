<template>
    <div class="viewer-container">
        <div class="viewer-header">
            <button class="back-btn" @click="goBack">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>返回</span>
            </button>
            <h1>{{ categoryTitle }}</h1>
            <p class="image-count">共 {{ images.length }} 张表情包</p>
        </div>

        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="images.length === 0" class="empty">暂无表情包</div>
        <div v-else class="emoji-grid">
            <div v-for="col in columns" :key="col.index" class="emoji-column">
                <div v-for="image in col.images" :key="image.index" class="emoji-item" @click="viewImage(image.src)">
                    <img :src="image.src" :alt="`表情包 ${image.index + 1}`" @error="handleImageError" loading="lazy" />
                    <div class="emoji-overlay">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </div>
                </div>
            </div>
        </div>

        <!-- 图片预览模态框 -->
        <div v-if="previewImage" class="modal" @click="closePreview">
            <div class="modal-content">
                <button class="close-btn" @click="closePreview">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <img :src="previewImage" @click.stop alt="预览" />
                <div class="modal-actions">
                    <button @click="downloadImage" class="download-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>下载</span>
                    </button>
                </div>
            </div>
        </div>

        <CommentArea :pageId="`emoji-${category}`" />
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CommentArea from '../components/comment_area.vue'

const route = useRoute()
const router = useRouter()

const category = computed(() => route.query.category || 'type1')
const categoryTitle = ref('表情包集合')
const categoryDesc = ref('')

const images = ref([])
const loading = ref(true)
const previewImage = ref(null)
const columnCount = ref(4) // 默认4列

// 计算分列数据，按顺序分配到各列
const columns = computed(() => {
    const cols = []
    for (let i = 0; i < columnCount.value; i++) {
        cols.push({ index: i, images: [] })
    }
    
    // 按顺序循环分配图片到各列
    images.value.forEach((src, index) => {
        const colIndex = index % columnCount.value
        cols[colIndex].images.push({ src, index })
    })
    
    return cols
})

// 响应式调整列数
const updateColumnCount = () => {
    const width = window.innerWidth
    if (width <= 480) {
        columnCount.value = 2
    } else if (width <= 768) {
        columnCount.value = 2
    } else if (width <= 1200) {
        columnCount.value = 3
    } else {
        columnCount.value = 4
    }
}

// 加载分类配置信息
const loadCategoryInfo = async () => {
    try {
        const response = await fetch('/api/admin/emoji/categories')
        if (response.ok) {
            const data = await response.json()
            if (data.success) {
                const categoryInfo = data.data.find(cat => cat.id === category.value)
                if (categoryInfo) {
                    categoryTitle.value = categoryInfo.title
                    categoryDesc.value = categoryInfo.desc
                }
            }
        }
    } catch (error) {
        console.error('加载分类信息失败:', error)
    }
}

// 加载指定分类的所有图片
const loadImages = async () => {
    loading.value = true
    try {
        // 从服务器获取图片列表
        const response = await fetch(`/api/emoji/${category.value}`)
        if (response.ok) {
            const data = await response.json()
            if (data.success) {
                images.value = data.images
            } else {
                // 如果API不存在，使用前端扫描方式（开发环境）
                await loadImagesFromDirectory()
            }
        } else {
            await loadImagesFromDirectory()
        }
    } catch (error) {
        console.error('加载表情包失败:', error)
        // 降级方案：直接加载已知的图片
        await loadImagesFromDirectory()
    } finally {
        loading.value = false
    }
}

// 从目录加载图片（降级方案）
const loadImagesFromDirectory = () => {
    const knownImages = {
        'type1': [
            '/emoji/type1/959E4E909D5437E26DC980105EBD9DB6.jpg'
        ],
        'type2': [
            '/emoji/type2/yui.png',
            '/emoji/type2/微信图片_20250222221129.jpg'
        ]
    }
    images.value = knownImages[category.value] || []
}

const goBack = () => {
    router.push('/resource')
}

const viewImage = (imageSrc) => {
    previewImage.value = imageSrc
}

const closePreview = () => {
    previewImage.value = null
}

const downloadImage = () => {
    if (previewImage.value) {
        const link = document.createElement('a')
        link.href = previewImage.value
        link.download = previewImage.value.split('/').pop() || 'emoji.jpg'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }
}

const handleImageError = (e) => {
    e.target.style.display = 'none'
}

onMounted(() => {
    updateColumnCount()
    window.addEventListener('resize', updateColumnCount)
    loadCategoryInfo()
    loadImages()
})
</script>

<style scoped>
.viewer-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    min-height: calc(100vh - 200px);
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    gap: 60px;
}

.viewer-header {
    width: 100%;
    text-align: center;
    margin-bottom: 40px;
    position: relative;
}

.back-btn {
    position: absolute;
    left: 0;
    top: 0;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #e8edf5;
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
}

.back-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateX(-2px);
}

.viewer-header h1 {
    color: #ffffff;
    font-size: 32px;
    font-weight: 500;
    margin: 0 0 12px 0;
}

.image-count {
    color: #7a8a9e;
    font-size: 14px;
    margin: 0;
}

.loading,
.empty {
    text-align: center;
    padding: 60px;
    color: #7a8a9e;
    font-size: 16px;
}

/* 瀑布流布局 - 使用flexbox手动分列 */
.emoji-grid {
    width: 100%;
    display: flex;
    gap: 20px;
    align-items: flex-start;
}

.emoji-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.emoji-item {
    position: relative;
    cursor: pointer;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: all 0.3s ease;
}

.emoji-item:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    border-color: rgba(255, 255, 255, 0.15);
}

.emoji-item img {
    width: 100%;
    height: auto;
    display: block;
    transition: transform 0.3s ease;
}

.emoji-item:hover img {
    transform: scale(1.05);
}

.emoji-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.emoji-item:hover .emoji-overlay {
    opacity: 1;
}

.emoji-overlay svg {
    color: #ffffff;
}

/* 模态框 */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
    animation: fadeIn 0.2s ease;
}

.modal-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
}

.modal-content img {
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 8px;
}

.close-btn {
    position: absolute;
    top: -50px;
    right: 0;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #ffffff;
    padding: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
}

.modal-actions {
    display: flex;
    gap: 12px;
}

.download-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #ffffff;
    padding: 10px 20px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 8px;
}

.download-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

/* 响应式设计 */
@media (max-width: 1200px) {
    .emoji-grid {
        gap: 15px;
    }
    
    .emoji-column {
        gap: 15px;
    }
}

@media (max-width: 768px) {
    .viewer-container {
        padding: 15px;
    }

    .viewer-header {
        margin-bottom: 30px;
    }

    .viewer-header h1 {
        font-size: 24px;
        margin-top: 50px;
    }

    .back-btn {
        position: static;
        margin-bottom: 20px;
    }

    .emoji-grid {
        gap: 15px;
    }
    
    .emoji-column {
        gap: 15px;
    }
}

@media (max-width: 480px) {
    .viewer-container {
        padding: 10px;
    }

    .viewer-header h1 {
        font-size: 20px;
    }

    .image-count {
        font-size: 12px;
    }

    .emoji-grid {
        gap: 10px;
    }
    
    .emoji-column {
        gap: 10px;
    }

    .modal {
        padding: 10px;
    }

    .close-btn {
        top: -45px;
    }
}
</style>
