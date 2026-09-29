<script setup>
import { ref, computed, onMounted } from 'vue'
import MarkdownContent from '../components/MarkdownContent.vue'

const authenticated = ref(false)
const checking = ref(true)
const password = ref('')
const message = ref('')
const busy = ref(false)
const tab = ref('profile')
const profile = ref({ avatar: '', name: '', description: '' })
const cards = ref([])
const types = ref([])
const settings = ref({ momentsDescription: '', resourceDescription: '', activitiesMessage: '', icpNumber: '' })
const entries = ref([])
const kind = ref('moment')
const editingId = ref(null)
const blank = () => ({ kind: kind.value, format: 'article', title: '', summary: '', cover_image: '', body: '', tags: [], resource_type_id: null, actions: [], status: 'published', published_at: new Date().toISOString() })
const form = ref(blank())
const tagsText = computed({ get: () => form.value.tags.join(', '), set: value => { form.value.tags = value.split(/[,，\n]/).map(x => x.trim()).filter(Boolean) } })
const dateInput = computed({ get: () => { const date = new Date(form.value.published_at || Date.now()); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }, set: value => { form.value.published_at = value ? new Date(value).toISOString() : new Date().toISOString() } })
const api = async (path, options = {}) => { const response = await fetch(`/api/admin${path}`, { credentials: 'same-origin', ...options }); const data = await response.json(); if (!data.success) throw new Error(data.message || '操作失败'); return data }
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const report = (text, error = false) => { message.value = text; if (!error) setTimeout(() => { if (message.value === text) message.value = '' }, 4000) }

async function login() { busy.value = true; try { await api('/login', json('POST', { password: password.value })); password.value = ''; authenticated.value = true; await loadAll(); report('已登录') } catch (e) { report(e.message, true) } finally { busy.value = false } }
async function logout() { await api('/logout', { method: 'POST' }); authenticated.value = false; entries.value = []; report('已退出') }
async function loadAll() { await Promise.all([loadProfile(), loadTypes(), loadEntries(), loadSettings()]) }
async function loadProfile() { const j = await api('/profile'); profile.value = j.data.profile; cards.value = j.data.cards }
async function loadSettings() { const j = await api('/settings'); settings.value = j.data }
async function saveSettings() { busy.value = true; try { const j = await api('/settings', json('PUT', settings.value)); settings.value = j.data; report('站点文案已保存') } catch (e) { report(e.message, true) } finally { busy.value = false } }
async function loadTypes() { const j = await api('/resource-types'); types.value = j.data }
async function loadEntries() { const j = await api(`/entries?kind=${kind.value}`); entries.value = j.data }
async function saveProfile() { busy.value = true; try { await api('/profile', json('PUT', { profile: profile.value, cards: cards.value })); await loadProfile(); report('首页已保存') } catch (e) { report(e.message, true) } finally { busy.value = false } }
function moveCard(index, shift) { const target = index + shift; if (target < 0 || target >= cards.value.length) return; [cards.value[index], cards.value[target]] = [cards.value[target], cards.value[index]] }
async function saveTypes() { busy.value = true; try { const j = await api('/resource-types', json('PUT', { types: types.value })); types.value = j.data; report('资源分类已保存') } catch (e) { report(e.message, true) } finally { busy.value = false } }
function newEntry(nextKind = kind.value) { kind.value = nextKind; editingId.value = null; form.value = blank(); form.value.kind = nextKind; if (nextKind === 'resource') form.value.resource_type_id = types.value[0]?.id || null; tab.value = 'editor' }
function editEntry(row) { editingId.value = row.id; form.value = structuredClone(row); tab.value = 'editor' }
async function saveEntry() { busy.value = true; try { const path = editingId.value ? `/entries/${editingId.value}` : '/entries'; await api(path, json(editingId.value ? 'PUT' : 'POST', form.value)); await loadEntries(); tab.value = kind.value; report('内容已保存') } catch (e) { report(e.message, true) } finally { busy.value = false } }
async function deleteEntry(row) { if (!confirm(`确定删除“${row.title || '短帖'}”吗？`)) return; try { await api(`/entries/${row.id}`, { method: 'DELETE' }); await loadEntries(); report('已删除') } catch (e) { report(e.message, true) } }
async function switchKind(next) { kind.value = next; tab.value = next; try { await loadEntries() } catch (e) { report(e.message, true) } }
async function uploadFile(event, target) { const file = event.target.files?.[0]; if (!file) return; const data = new FormData(); data.append('file', file); busy.value = true; try { const j = await api('/upload', { method: 'POST', body: data }); if (target === 'avatar') profile.value.avatar = j.url; else if (target === 'cover') form.value.cover_image = j.url; else if (target === 'body') form.value.body += `\n\n${file.type.startsWith('image/') ? `![${j.name}](${j.url})` : `[${j.name}](${j.url})`}\n`; else if (target === 'action') form.value.actions.push({ label: 'Download', url: j.url }); report('上传成功') } catch (e) { report(e.message, true) } finally { busy.value = false; event.target.value = '' } }
onMounted(async () => { try { const r = await fetch('/api/admin/session'); const j = await r.json(); authenticated.value = j.authenticated; if (authenticated.value) await loadAll() } catch (e) { report(e.message || '连接失败', true) } finally { checking.value = false } })
</script>
<template>
  <div class="page-shell admin-page"><div class="admin-title"><div><span class="eyebrow">站点后台</span><h1>内容管理</h1></div><button v-if="authenticated" class="ghost-button" @click="logout">退出登录</button></div>
    <div v-if="message" class="notice" role="status">{{ message }}</div>
    <div v-if="checking" class="surface state">检查登录状态…</div>
    <form v-else-if="!authenticated" class="surface login" @submit.prevent="login"><h2>登录后台</h2><p>输入管理员密码，继续管理网站内容。</p><label>管理员密码<input v-model="password" type="password" required autocomplete="current-password" /></label><button class="primary-button" :disabled="busy">登录</button></form>
    <template v-else><nav class="admin-nav"><button :class="{ active: tab === 'profile' }" @click="tab = 'profile'">首页介绍</button><button :class="{ active: tab === 'moment' || (tab === 'editor' && kind === 'moment') }" @click="switchKind('moment')">动态</button><button :class="{ active: tab === 'resource' || (tab === 'editor' && kind === 'resource') }" @click="switchKind('resource')">资源帖子</button><button :class="{ active: tab === 'types' }" @click="tab = 'types'">资源分类</button><button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">站点文案</button></nav>
      <section v-if="tab === 'profile'" class="admin-section"><div class="section-head"><div><h2>个人介绍</h2><p>头像、名称、描述和下方卡片都会实时显示在首页。</p></div><button class="primary-button" :disabled="busy" @click="saveProfile">保存首页</button></div><div class="surface editor-box"><div class="form-grid"><label>头像地址<input v-model="profile.avatar" placeholder="/picture/avatar.png" /></label><label>显示名称<input v-model="profile.name" placeholder="你的名字" /></label></div><label>上传头像<input type="file" accept="image/*" @change="uploadFile($event, 'avatar')" /></label><img v-if="profile.avatar" :src="profile.avatar" class="avatar-preview" alt="当前头像" /><label>描述<textarea v-model="profile.description" rows="4" placeholder="简单介绍一下自己"></textarea></label></div><div class="section-head card-head"><div><h2>介绍卡片</h2><p>卡片内容支持 Markdown，使用 ++文字++ 添加下划线。</p></div><button class="ghost-button" @click="cards.push({ title: '', content: '' })">+ 添加卡片</button></div><div v-for="(card, index) in cards" :key="index" class="surface editor-box card-editor"><div class="card-controls"><strong>卡片 {{ index + 1 }}</strong><div><button @click="moveCard(index, -1)" :disabled="index === 0">上移</button><button @click="moveCard(index, 1)" :disabled="index === cards.length - 1">下移</button><button @click="cards.splice(index, 1)">删除</button></div></div><label>卡片标题<input v-model="card.title" placeholder="例如：联系方式" /></label><label>卡片内容 · Markdown<textarea v-model="card.content" rows="6" placeholder="支持链接、代码块、加粗、斜体、划去、下划线"></textarea></label><details><summary>预览</summary><MarkdownContent :source="card.content" /></details></div></section>
      <section v-else-if="tab === 'types'" class="admin-section"><div class="section-head"><div><h2>资源分类</h2><p>分类会自动出现在资源库子导航中；删除分类会让所属资源帖子变为未分类。</p></div><button class="primary-button" :disabled="busy" @click="saveTypes">保存分类</button></div><div class="surface editor-box"><div v-for="(type, index) in types" :key="type.id || index" class="type-row"><input v-model="type.name" placeholder="分类名称" /><button @click="types.splice(index, 1)">删除</button></div><button class="ghost-button" @click="types.push({ name: '' })">+ 添加分类</button></div></section>
      <section v-else-if="tab === 'settings'" class="admin-section"><div class="section-head"><div><h2>站点文案</h2><p>编辑各页面介绍和页脚备案信息。</p></div><button class="primary-button" :disabled="busy" @click="saveSettings">保存文案</button></div><div class="surface editor-box"><label>动态页介绍<textarea v-model="settings.momentsDescription" rows="3"></textarea></label><label>资源库介绍<textarea v-model="settings.resourceDescription" rows="3"></textarea></label><label>活动页施工说明<textarea v-model="settings.activitiesMessage" rows="3"></textarea></label><label>备案号<input v-model="settings.icpNumber" placeholder="留空则不显示" /></label></div></section>
      <section v-else-if="tab === 'moment' || tab === 'resource'" class="admin-section"><div class="section-head"><div><h2>{{ tab === 'moment' ? '动态' : '资源帖子' }}</h2><p>编辑、发布或保留草稿。</p></div><button class="primary-button" @click="newEntry(tab)">+ 新建{{ tab === 'moment' ? '动态' : '资源' }}</button></div><div v-if="!entries.length" class="surface state">暂无内容</div><div v-else class="entry-admin-list"><div v-for="row in entries" :key="row.id" class="surface entry-admin-row"><div><strong>{{ row.title || '短帖' }}</strong><small>{{ row.status === 'draft' ? '草稿' : '已发布' }} · {{ new Date(row.published_at).toLocaleDateString('zh-CN') }}</small></div><div><button @click="editEntry(row)">编辑</button><button class="danger" @click="deleteEntry(row)">删除</button></div></div></div></section>
      <section v-else-if="tab === 'editor'" class="admin-section">
        <div class="section-head"><div><h2>{{ editingId ? '编辑' : '新建' }}{{ kind === 'moment' ? '动态' : '资源' }}</h2><p>正文使用 Markdown，内容会用于搜索。</p></div><div class="head-actions"><button class="ghost-button" @click="tab = kind">返回列表</button><button class="primary-button" :disabled="busy" @click="saveEntry">保存内容</button></div></div>
        <div class="surface editor-box">
          <div class="form-grid"><label>标题{{ form.format === 'short' ? '（可选）' : '' }}<input v-model="form.title" placeholder="给内容起个标题" /></label><label>发布状态<select v-model="form.status"><option value="published">已发布</option><option value="draft">草稿</option></select></label></div>
          <div class="form-grid"><label>发布时间<input v-model="dateInput" type="datetime-local" /></label><label v-if="kind === 'moment'">动态形式<select v-model="form.format"><option value="article">文章</option><option value="short">短帖</option></select></label><label v-else>资源类型<select v-model.number="form.resource_type_id"><option :value="null" disabled>选择类型</option><option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option></select></label></div>
          <label v-if="form.format !== 'short'">摘要<textarea v-model="form.summary" rows="2" placeholder="列表中显示的简短说明"></textarea></label>
          <div class="form-grid"><label>封面图片地址（可选）<input v-model="form.cover_image" placeholder="/picture/cover.png 或 https://..." /></label><label class="upload-label">上传封面图片<input type="file" accept="image/*" @change="uploadFile($event, 'cover')" /></label></div>
          <img v-if="form.cover_image" class="cover-preview" :src="form.cover_image" alt="当前封面预览" />
          <label>标签<input v-model="tagsText" placeholder="技术, 日常, Vue" /></label>
          <label>正文 · Markdown<textarea v-model="form.body" rows="16" placeholder="开始写作…"></textarea></label>
          <label class="upload-label">上传图片或文件并插入正文<input type="file" @change="uploadFile($event, 'body')" /></label>
          <details><summary>正文预览</summary><MarkdownContent :source="form.body" /></details>
          <div v-if="kind === 'resource'" class="action-editor"><div class="section-head"><div><h3>卡片按钮</h3><p>配置阅读、下载、官网等按钮；留空则不显示。</p></div><button class="ghost-button" @click="form.actions.push({ label: '', url: '' })">+ 添加按钮</button></div><div v-for="(action, index) in form.actions" :key="index" class="action-row"><input v-model="action.label" placeholder="按钮文字，如 官网" /><input v-model="action.url" placeholder="https://... 或 /source/..." /><button @click="form.actions.splice(index, 1)">删除</button></div><label class="upload-label">上传资源并添加下载按钮<input type="file" @change="uploadFile($event, 'action')" /></label></div>
        </div>
      </section>
    </template>
  </div>
</template>
<style scoped src="../styles/admin.css"></style>
