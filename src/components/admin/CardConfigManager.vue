<template>
    <div class="config-manager">
        <div class="manager-header">
            <h2>卡片配置管理</h2>
            <p class="hint">管理 Tutorial、Project 等页面中的文章卡片配置</p>
        </div>

        <!-- 卡片类型选择 -->
        <div class="type-tabs">
            <button 
                :class="['type-tab', { active: currentType === 'tutorials' }]"
                @click="loadCardConfig('tutorials')"
            >
                Tutorial 卡片
            </button>
            <button 
                :class="['type-tab', { active: currentType === 'projects' }]"
                @click="loadCardConfig('projects')"
            >
                Project 卡片
            </button>
        </div>

        <!-- 卡片列表 -->
        <div class="card-list">
            <div v-if="loading" class="loading">加载中...</div>
            <div v-else>
                <div class="list-header">
                    <button @click="showAddModal = true" class="primary-btn">
                        + 添加卡片
                    </button>
                </div>
                
                <div v-if="cards.length === 0" class="empty">暂无卡片配置</div>
                <div v-else class="card-items">
                    <div 
                        v-for="(card, index) in cards" 
                        :key="index"
                        class="card-item"
                    >
                        <div class="card-preview">
                            <h3>{{ card.title }}</h3>
                            <p>{{ card.desc }}</p>
                            <div class="card-meta">
                                <span v-if="card.category" class="card-category">{{ card.category }}</span>
                                <span class="card-date">{{ card.date }}</span>
                                <span class="card-link">{{ card.link }}</span>
                            </div>
                        </div>
                        <div class="card-actions">
                            <button @click="editCard(index)" class="action-btn edit">编辑</button>
                            <button @click="deleteCard(index)" class="action-btn delete">删除</button>
                            <button @click="moveCard(index, -1)" class="action-btn move" :disabled="index === 0">↑</button>
                            <button @click="moveCard(index, 1)" class="action-btn move" :disabled="index === cards.length - 1">↓</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 添加/编辑卡片模态框 -->
        <div v-if="showAddModal || editingIndex !== null" class="modal-overlay" @click.self="closeModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>{{ editingIndex !== null ? '编辑卡片' : '添加卡片' }}</h3>
                    <button @click="closeModal" class="close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>卡片标题</label>
                        <input 
                            v-model="cardForm.title" 
                            class="form-input"
                            placeholder="输入卡片标题"
                        />
                    </div>
                    <div class="form-group">
                        <label>卡片描述</label>
                        <textarea 
                            v-model="cardForm.desc" 
                            class="form-textarea"
                            placeholder="输入卡片描述"
                            rows="3"
                        ></textarea>
                    </div>
                    <div class="form-group">
                        <label>日期</label>
                        <input 
                            v-model="cardForm.date" 
                            class="form-input"
                            placeholder="例如: 2025-01-28 或 施工中..."
                        />
                    </div>
                    <div class="form-group">
                        <label>链接</label>
                        <input 
                            v-model="cardForm.link" 
                            class="form-input"
                            placeholder="/article?src=/articles/tutorials/example.md"
                        />
                    </div>
                    <div class="form-group">
                        <label>分类</label>
                        <select 
                            v-model="cardForm.category" 
                            class="form-select"
                        >
                            <option v-if="currentType === 'tutorials'" value="正经教程">正经教程</option>
                            <option v-if="currentType === 'tutorials'" value="不正经教程">不正经教程</option>
                            <option v-if="currentType === 'projects'" value="我的项目">我的项目</option>
                            <option v-if="currentType === 'projects'" value="推荐软件">推荐软件</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button @click="closeModal" class="secondary-btn">取消</button>
                    <button @click="saveCard" class="primary-btn">保存</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const loading = ref(false)
const currentType = ref('tutorials')
const cards = ref([])
const showAddModal = ref(false)
const editingIndex = ref(null)

const cardForm = ref({
    title: '',
    desc: '',
    date: '',
    link: '',
    category: ''
})

// 加载卡片配置
const loadCardConfig = async (type) => {
    currentType.value = type
    loading.value = true
    try {
        const response = await fetch(`/api/admin/cards/${type}`)
        const data = await response.json()
        if (data.success) {
            cards.value = data.data
        }
    } catch (error) {
        console.error('加载卡片配置失败:', error)
        alert('加载卡片配置失败')
    } finally {
        loading.value = false
    }
}

// 编辑卡片
const editCard = (index) => {
    editingIndex.value = index
    cardForm.value = { ...cards.value[index] }
}

// 删除卡片
const deleteCard = async (index) => {
    if (!confirm('确定要删除这个卡片吗？')) return
    
    cards.value.splice(index, 1)
    await saveAllCards()
}

// 移动卡片
const moveCard = async (index, direction) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= cards.value.length) return
    
    const temp = cards.value[index]
    cards.value[index] = cards.value[newIndex]
    cards.value[newIndex] = temp
    
    await saveAllCards()
}

// 保存卡片
const saveCard = async () => {
    if (!cardForm.value.title || !cardForm.value.desc) {
        alert('请填写标题和描述')
        return
    }
    if (!cardForm.value.category) {
        alert('请选择分类')
        return
    }

    if (editingIndex.value !== null) {
        cards.value[editingIndex.value] = { ...cardForm.value }
    } else {
        cards.value.push({ ...cardForm.value })
    }

    await saveAllCards()
    closeModal()
}

// 保存所有卡片配置
const saveAllCards = async () => {
    try {
        const response = await fetch(`/api/admin/cards/${currentType.value}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards: cards.value })
        })
        const data = await response.json()
        if (data.success) {
            alert('保存成功')
        } else {
            alert(data.message || '保存失败')
        }
    } catch (error) {
        console.error('保存卡片配置失败:', error)
        alert('保存卡片配置失败')
    }
}

// 关闭模态框
const closeModal = () => {
    showAddModal.value = false
    editingIndex.value = null
    cardForm.value = {
        title: '',
        desc: '',
        date: '',
        link: '',
        category: ''
    }
}

onMounted(() => {
    loadCardConfig('tutorials')
})
</script>

<style scoped>
.config-manager {
    color: #ffffff;
}

.manager-header {
    margin-bottom: 24px;
}

.manager-header h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
}

.hint {
    margin: 0;
    color: #7a8a9e;
    font-size: 13px;
}

.type-tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
}

.type-tab {
    padding: 10px 20px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #b8c5d6;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
}

.type-tab:hover {
    background: rgba(255, 255, 255, 0.08);
}

.type-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: transparent;
    color: #ffffff;
}

.list-header {
    margin-bottom: 16px;
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

.card-list {
    min-height: 300px;
}

.loading, .empty {
    text-align: center;
    padding: 40px;
    color: #7a8a9e;
}

.card-items {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.card-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    transition: all 0.3s;
}

.card-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
}

.card-preview {
    flex: 1;
}

.card-preview h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    color: #ffffff;
}

.card-preview p {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: #b8c5d6;
    line-height: 1.5;
}

.card-meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
}

.card-category {
    padding: 2px 8px;
    background: rgba(102, 126, 234, 0.3);
    border-radius: 4px;
    color: #ffffff;
    font-weight: 500;
}

.card-date {
    color: #7a8a9e;
}

.card-link {
    color: #5a9bd5;
    font-family: 'Consolas', 'Monaco', monospace;
}

.card-actions {
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

.action-btn.move {
    background: rgba(149, 165, 166, 0.2);
    color: #95a5a6;
}

.action-btn.move:hover:not(:disabled) {
    background: rgba(149, 165, 166, 0.3);
}

.action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
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
    max-width: 600px;
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
    line-height: 1.6;
}

.form-input:focus, .form-textarea:focus, .form-select:focus {
    border-color: rgba(102, 126, 234, 0.5);
    background: rgba(255, 255, 255, 0.08);
}

.form-select option {
    background: #1a1f2e;
    color: #ffffff;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
