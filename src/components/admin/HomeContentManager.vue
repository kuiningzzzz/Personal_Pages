<template>
    <div class="home-content-manager">
        <div class="manager-header">
            <div>
                <h2>首页内容管理</h2>
                <p class="hint">管理首页头像、名称、简介和信息卡片内容</p>
            </div>
            <button @click="saveHomeContent" :disabled="saving" class="primary-btn">
                {{ saving ? '保存中...' : '保存首页内容' }}
            </button>
        </div>

        <div v-if="loading" class="loading">加载中...</div>
        <div v-else class="editor-layout">
            <section class="editor-section">
                <h3>个人信息</h3>
                <div class="form-grid">
                    <label>
                        <span>头像路径</span>
                        <input v-model="homeContent.profile.avatar" placeholder="/picture/avatar.png" />
                    </label>
                    <label>
                        <span>显示名称</span>
                        <input v-model="homeContent.profile.name" placeholder="站点主人名称" />
                    </label>
                </div>
                <label class="full-field">
                    <span>简介</span>
                    <textarea v-model="bioText" rows="4" placeholder="每行一段，会按段落显示"></textarea>
                </label>
            </section>

            <section class="editor-section">
                <div class="section-toolbar">
                    <h3>首页信息卡片</h3>
                    <button @click="addSection" class="secondary-btn">添加卡片</button>
                </div>

                <div v-if="homeContent.sections.length === 0" class="empty">暂无卡片</div>
                <div v-for="(section, sectionIndex) in homeContent.sections" :key="sectionIndex" class="section-editor">
                    <div class="section-header">
                        <input v-model="section.title" class="section-title-input" placeholder="卡片标题" />
                        <div class="section-actions">
                            <button @click="moveSection(sectionIndex, -1)" :disabled="sectionIndex === 0" class="small-btn">上移</button>
                            <button @click="moveSection(sectionIndex, 1)" :disabled="sectionIndex === homeContent.sections.length - 1" class="small-btn">下移</button>
                            <button @click="removeSection(sectionIndex)" class="small-btn danger">删除</button>
                        </div>
                    </div>

                    <div class="row-list">
                        <div v-for="(row, rowIndex) in section.rows" :key="rowIndex" class="row-editor">
                            <select v-model="row.type">
                                <option value="text">文本</option>
                                <option value="link">链接</option>
                                <option value="tags">标签</option>
                            </select>
                            <input v-model="row.label" placeholder="标签名，如 Language" />
                            <input v-if="row.type !== 'tags'" v-model="row.value" placeholder="显示内容" />
                            <input v-if="row.type === 'link'" v-model="row.href" placeholder="链接地址" />
                            <input
                                v-if="row.type === 'tags'"
                                :value="row.items.join(', ')"
                                @input="updateItems(row, $event.target.value)"
                                placeholder="用英文逗号分隔，如 Vue.js, Node.js"
                            />
                            <button @click="removeRow(sectionIndex, rowIndex)" class="icon-btn danger">删除</button>
                        </div>
                    </div>

                    <button @click="addRow(sectionIndex)" class="secondary-btn row-add-btn">添加一行</button>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

const loading = ref(false)
const saving = ref(false)
const homeContent = ref({
    profile: {
        avatar: '/picture/avatar.png',
        name: '',
        bio: []
    },
    sections: []
})

const bioText = computed({
    get() {
        return homeContent.value.profile.bio.join('\n')
    },
    set(value) {
        homeContent.value.profile.bio = value
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
    }
})

const loadHomeContent = async () => {
    loading.value = true
    try {
        const response = await fetch('/api/admin/home-content')
        const data = await response.json()
        if (data.success) {
            homeContent.value = data.data
        } else {
            alert(data.message || '加载首页内容失败')
        }
    } catch (error) {
        console.error('加载首页内容失败:', error)
        alert('加载首页内容失败')
    } finally {
        loading.value = false
    }
}

const saveHomeContent = async () => {
    if (!homeContent.value.profile.name.trim()) {
        alert('显示名称不能为空')
        return
    }

    saving.value = true
    try {
        const response = await fetch('/api/admin/home-content', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(homeContent.value)
        })
        const data = await response.json()
        if (data.success) {
            homeContent.value = data.data
            alert('保存成功')
        } else {
            alert(data.message || '保存失败')
        }
    } catch (error) {
        console.error('保存首页内容失败:', error)
        alert('保存首页内容失败')
    } finally {
        saving.value = false
    }
}

const addSection = () => {
    homeContent.value.sections.push({
        title: 'NEW SECTION',
        rows: [{ type: 'text', label: '标题', value: '内容', href: '', items: [] }]
    })
}

const removeSection = (index) => {
    if (confirm('确定要删除这个卡片吗？')) {
        homeContent.value.sections.splice(index, 1)
    }
}

const moveSection = (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= homeContent.value.sections.length) return

    const current = homeContent.value.sections[index]
    homeContent.value.sections[index] = homeContent.value.sections[targetIndex]
    homeContent.value.sections[targetIndex] = current
}

const addRow = (sectionIndex) => {
    homeContent.value.sections[sectionIndex].rows.push({
        type: 'text',
        label: '',
        value: '',
        href: '',
        items: []
    })
}

const removeRow = (sectionIndex, rowIndex) => {
    homeContent.value.sections[sectionIndex].rows.splice(rowIndex, 1)
}

const updateItems = (row, value) => {
    row.items = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
}

onMounted(() => {
    loadHomeContent()
})
</script>

<style scoped>
.home-content-manager {
    color: #ffffff;
}

.manager-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 24px;
}

.manager-header h2,
.editor-section h3 {
    margin: 0;
}

.hint {
    color: #7a8a9e;
    font-size: 13px;
    margin: 8px 0 0 0;
}

.loading,
.empty {
    color: #7a8a9e;
    padding: 24px;
    text-align: center;
}

.editor-layout {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.editor-section,
.section-editor {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 20px;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 18px;
}

.full-field,
label {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.full-field {
    margin-top: 16px;
}

label span {
    color: #b8c5d6;
    font-size: 13px;
}

input,
textarea,
select {
    width: 100%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #e8edf5;
    font-size: 14px;
    padding: 10px 12px;
    outline: none;
}

textarea {
    resize: vertical;
    line-height: 1.6;
}

button {
    cursor: pointer;
}

.primary-btn,
.secondary-btn,
.small-btn,
.icon-btn {
    background: rgba(255, 255, 255, 0.09);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    color: #e8edf5;
    padding: 10px 16px;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.primary-btn {
    background: rgba(116, 170, 255, 0.18);
    border-color: rgba(116, 170, 255, 0.35);
    color: #9cc3ff;
}

.secondary-btn,
.small-btn,
.icon-btn {
    font-size: 13px;
}

.small-btn,
.icon-btn {
    padding: 8px 12px;
}

.danger {
    color: #ff9b9b;
    border-color: rgba(255, 107, 107, 0.28);
}

button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

.section-toolbar,
.section-header,
.section-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.section-toolbar,
.section-header {
    justify-content: space-between;
}

.section-editor {
    margin-top: 16px;
}

.section-title-input {
    max-width: 320px;
    font-weight: 500;
}

.row-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 16px;
}

.row-editor {
    display: grid;
    grid-template-columns: 100px minmax(120px, 0.8fr) minmax(180px, 1.4fr) minmax(180px, 1.2fr) auto;
    gap: 10px;
    align-items: center;
}

.row-add-btn {
    margin-top: 14px;
}

@media (max-width: 900px) {
    .manager-header,
    .section-toolbar,
    .section-header {
        align-items: stretch;
        flex-direction: column;
    }

    .form-grid,
    .row-editor {
        grid-template-columns: 1fr;
    }

    .section-actions {
        flex-wrap: wrap;
    }
}
</style>
