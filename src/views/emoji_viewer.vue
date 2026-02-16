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
            <p class="image-count">共 {{ imageInfos.length }} 张表情包</p>
        </div>

        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="imageInfos.length === 0" class="empty">暂无表情包</div>
        <div v-else class="emoji-grid-row-ordered">
            <!-- 按行优先顺序渲染，但用CSS控制每张图片的列位置 -->
            <div 
                v-for="image in rowOrderedImages" 
                :key="image.src" 
                class="emoji-item" 
                :style="{ gridColumn: image.columnIndex + 1 }"
                @click="viewImage(image.src)"
            >
                <img 
                    :src="image.src" 
                    :alt="`表情包 ${image.index + 1}`" 
                    @error="handleImageError" 
                    @load="onImageLoad($event, image.index)"
                />
                <div class="emoji-overlay">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CommentArea from '../components/comment_area.vue'

const route = useRoute()
const router = useRouter()

const category = computed(() => route.query.category || 'type1')
const categoryTitle = ref('表情包集合')
const categoryDesc = ref('')

const images = ref([])  // 原始图片路径列表
const imageInfos = ref([])  // 包含尺寸信息的图片数据
const loading = ref(true)
const previewImage = ref(null)
const columnCount = ref(4) // 默认4列

// 智能分列算法：将图片分配到当前高度最小的列
const columns = computed(() => {
    const cols = []
    const colHeights = []  // 记录每列的累计高度
    
    for (let i = 0; i < columnCount.value; i++) {
        cols.push({ index: i, images: [] })
        colHeights.push(0)
    }
    
    // 间距权重：假设列宽约300px，间距20px，比例约为 20/300 ≈ 0.067
    const gapRatio = 0.07
    
    // 遍历所有图片，每次分配到高度最小的列，并记录每张图片在列中的位置
    imageInfos.value.forEach((img) => {
        // 找到当前高度最小的列
        let minHeight = colHeights[0]
        let minIndex = 0
        for (let i = 1; i < columnCount.value; i++) {
            if (colHeights[i] < minHeight) {
                minHeight = colHeights[i]
                minIndex = i
            }
        }
        
        // 记录图片在列中的位置（用于计算加载优先级）
        const positionInColumn = cols[minIndex].images.length
        
        // 将图片分配到该列，并添加位置信息
        cols[minIndex].images.push({
            ...img,
            columnIndex: minIndex,
            positionInColumn: positionInColumn
        })
        
        // 更新该列的高度：图片宽高比 + 间距权重
        // 使用默认比例1:1，如果有真实尺寸则使用真实的
        const aspectRatio = img.height && img.width ? img.height / img.width : 1
        colHeights[minIndex] += aspectRatio + gapRatio
    })
    
    return cols
})

// 按行优先顺序排列的图片列表（用于优化加载顺序）
const rowOrderedImages = computed(() => {
    const cols = columns.value
    const result = []
    
    // 找出最长列的长度
    const maxLength = Math.max(...cols.map(col => col.images.length))
    
    // 按行交叉取图片：第1行的所有列，第2行的所有列...
    for (let row = 0; row < maxLength; row++) {
        for (let colIndex = 0; colIndex < cols.length; colIndex++) {
            if (cols[colIndex].images[row]) {
                result.push({
                    ...cols[colIndex].images[row],
                    loadOrder: result.length  // 记录加载顺序
                })
            }
        }
    }
    
    return result
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

// 快速初始化图片列表（使用默认尺寸）
const initializeImages = (imagePaths) => {
    return imagePaths.map((src, index) => ({
        src,
        index,
        width: 1,  // 默认宽度
        height: 1, // 默认高度（1:1比例）
        loaded: false
    }))
}

// 图片加载完成后更新尺寸（渐进式）
const updateImageSize = (index, width, height) => {
    if (imageInfos.value[index]) {
        imageInfos.value[index].width = width
        imageInfos.value[index].height = height
        imageInfos.value[index].loaded = true
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
    console.log('[Emoji] 开始加载图片列表...')
    const startTime = performance.now()
    loading.value = true
    try {
        // 从服务器获取图片列表
        const response = await fetch(`/api/emoji/${category.value}`)
        if (response.ok) {
            const data = await response.json()
            if (data.success) {
                images.value = data.images
                console.log(`[Emoji] API返回 ${data.images.length} 张图片，耗时: ${(performance.now() - startTime).toFixed(2)}ms`)
                // 快速初始化显示（使用默认尺寸）
                imageInfos.value = initializeImages(data.images)
                loading.value = false  // 立即显示图片
                console.log(`[Emoji] 图片列表已显示，总耗时: ${(performance.now() - startTime).toFixed(2)}ms`)
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
const loadImagesFromDirectory = async () => {
    const knownImages = {
        'type1': [
            '/emoji/type1/959E4E909D5437E26DC980105EBD9DB6.jpg'
        ],
        'type2': [
            '/emoji/type2/yui.png',
            '/emoji/type2/微信图片_20250222221129.jpg'
        ]
    }
    const imagePaths = knownImages[category.value] || []
    images.value = imagePaths
    imageInfos.value = initializeImages(imagePaths)
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

// 图片加载完成时更新真实尺寸
const onImageLoad = (event, index) => {
    const img = event.target
    if (img.naturalWidth && img.naturalHeight) {
        updateImageSize(index, img.naturalWidth, img.naturalHeight)
    }
    // 调试：记录首批图片加载完成
    const loadedCount = imageInfos.value.filter(img => img.loaded).length
    if (loadedCount <= 10) {
        console.log(`[Emoji] 第 ${loadedCount} 张图片加载完成`)
    }
}

onMounted(() => {
    updateColumnCount()
    window.addEventListener('resize', updateColumnCount)
    loadCategoryInfo()
    loadImages()
})

onUnmounted(() => {
    window.removeEventListener('resize', updateColumnCount)
})

// 监听分类变化，重新加载图片
watch(category, () => {
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

/* 新的行优先布局 - 使用CSS Grid，按行渲染但保持列布局 */
.emoji-grid-row-ordered {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    grid-auto-flow: dense; /* 自动填充空隙 */
}

/* 响应式列数调整 */
@media (max-width: 1200px) {
    .emoji-grid-row-ordered {
        grid-template-columns: repeat(3, 1fr);
    }
}

@media (max-width: 768px) {
    .emoji-grid-row-ordered {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 480px) {
    .emoji-grid-row-ordered {
        grid-template-columns: repeat(2, 1fr);
    }
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
