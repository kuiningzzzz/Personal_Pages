<script setup>
import { ref, computed, watch, onMounted, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownContent from '../components/MarkdownContent.vue'
import { resourceLabel } from '../lib/resources'
import AiLearningAdmin from '../components/AiLearningAdmin.vue'
import ModerationAdmin from '../components/ModerationAdmin.vue'
import FeedbackAdmin from '../components/FeedbackAdmin.vue'
import UsersAdmin from '../components/UsersAdmin.vue'
import AnnouncementsAdmin from '../components/AnnouncementsAdmin.vue'
import BackupAdmin from '../components/BackupAdmin.vue'
import ActivityPublishAdmin from '../components/ActivityPublishAdmin.vue'
import PaginationNav from '../components/PaginationNav.vue'
import { adminListing } from '../lib/admin-list'
import HomePlaylistAdmin from '../components/HomePlaylistAdmin.vue'
import HomeWelcomeAdmin from '../components/HomeWelcomeAdmin.vue'
import { applyStation } from '../lib/music'

const authenticated = ref(false)
const checking = ref(true)
const password = ref('')
const message = ref('')
const hasWarnings = ref(false)
const busy = ref(false)
const route = useRoute()
const initialTab = route.query.tab === 'blacklist' ? 'users' : route.query.tab === 'reports' ? 'feedback' : route.query.tab
const tab = ref(['feedback', 'users', 'announcements', 'backups', 'plaza'].includes(initialTab) ? initialTab : 'profile')
const usersSection = ref(route.query.tab === 'blacklist' || route.query.section === 'blacklist' ? 'blacklist' : 'accounts')
const feedbackSection = ref(route.query.tab === 'reports' || route.query.section === 'reports' ? 'reports' : 'feedback')
const profile = ref({ avatar: '', name: '', description: '' })
const cards = ref([])
const playlist = ref([])
const welcome = ref(['', '', ''])
const types = ref([])
const settings = ref({ momentsDescription: '', resourceDescription: '', activitiesMessage: '', icpNumber: '' })
const entries = ref([])
const kind = ref('moment')
const editingId = ref(null)
const blank = () => ({ kind: kind.value, format: 'article', resource_kind: 'document', parent_id: null, member_ids: [], images: [], title: '', summary: '', cover_image: '', body: '', tags: [], resource_type_id: null, actions: [], status: 'published', pinned: false, published_at: new Date().toISOString() })
const form = ref(blank())
const isShort = computed(() => kind.value === 'moment' && form.value.format === 'short')
const bodyLength = computed(() => [...String(form.value.body || '').trim()].length)
const shortTooLong = computed(() => isShort.value && bodyLength.value > 500)
const memberQuery = ref('')
function descendants(id) {
  const found = new Set(id ? [id] : [])
  let changed = true
  while (changed) { changed = false; for (const row of entries.value) if (found.has(row.parent_id) && !found.has(row.id)) { found.add(row.id); changed = true } }
  return found
}
function ancestors(id) {
  const found = new Set()
  while (id && !found.has(id)) { found.add(id); id = entries.value.find(row => row.id === id)?.parent_id }
  return found
}
function resourceLocation(row) { return [...ancestors(row.parent_id)].reverse().map(id => entries.value.find(item => item.id === id)?.title).filter(Boolean).join(' / ') || '资源库首页' }
const parentCollections = computed(() => {
  const excluded = descendants(editingId.value)
  if (form.value.resource_kind === 'collection') for (const id of form.value.member_ids) for (const child of descendants(id)) excluded.add(child)
  return entries.value.filter(row => row.resource_kind === 'collection' && !excluded.has(row.id))
})
const inheritedCategory = computed(() => {
  const parent = entries.value.find(row => row.id === Number(form.value.parent_id))
  return types.value.find(type => type.id === parent?.resource_type_id)?.name || '未分类'
})
const memberCandidates = computed(() => {
  const excluded = ancestors(form.value.parent_id)
  if (editingId.value) excluded.add(editingId.value)
  const query = memberQuery.value.trim().toLocaleLowerCase()
  return entries.value.filter(row => !excluded.has(row.id) && (!query || `${row.title} ${row.tags.join(' ')} ${resourceLocation(row)}`.toLocaleLowerCase().includes(query)))
})
const listQuery = ref('')
const listSort = ref('updated')
const listPage = ref(1)
const expandedCollections = ref(new Set())
const listHeading = ref(null)
const listing = computed(() => adminListing(entries.value, { kind: kind.value, query: listQuery.value, sort: listSort.value, page: listPage.value, expanded: expandedCollections.value }))
watch([listQuery, listSort, kind], () => { listPage.value = 1 }, { flush: 'sync' })
watch(() => listing.value.totalPages, pages => { if (listPage.value > pages) listPage.value = pages })
function toggleCollection(id) {
  const next = new Set(expandedCollections.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expandedCollections.value = next
}
function changePage(page) {
  listPage.value = page
  listHeading.value?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
const listDate = row => new Date(row[listSort.value === 'created' ? 'created_at' : 'updated_at']).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const tagsText = computed({ get: () => form.value.tags.join(', '), set: value => { form.value.tags = value.split(/[,，\n]/).map(x => x.trim()).filter(Boolean) } })
const dateInput = computed({ get: () => { const date = new Date(form.value.published_at || Date.now()); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }, set: value => { form.value.published_at = value ? new Date(value).toISOString() : new Date().toISOString() } })
const api = async (path, options = {}) => { const response = await fetch(`/api/admin${path}`, { credentials: 'same-origin', ...options }); const data = await response.json(); if (!data.success) throw new Error(data.message || '操作失败'); return data }
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const report = (text, error = false) => { hasWarnings.value = error; message.value = text; if (!error) setTimeout(() => { if (message.value === text) message.value = '' }, 4000) }
const reportSave = (text, result) => {
  const warnings = result.warnings || []
  hasWarnings.value = warnings.length > 0
  message.value = [text, result.deletedFiles ? `已清理 ${result.deletedFiles} 个未引用文件。` : '', ...warnings.map(item => `⚠ ${item}`)].filter(Boolean).join('\n')
  if (!warnings.length) setTimeout(() => { if (message.value.startsWith(text)) message.value = '' }, 4000)
}

async function login() { busy.value = true; try { await api('/login', json('POST', { password: password.value })); password.value = ''; authenticated.value = true; await loadAll(); report('已登录') } catch (e) { report(e.message, true) } finally { busy.value = false } }
async function logout() { await api('/logout', { method: 'POST' }); authenticated.value = false; entries.value = []; report('已退出') }
async function loadAll() { await Promise.all([loadProfile(), loadTypes(), loadEntries(), loadSettings()]) }
async function loadProfile() { const j = await api('/profile'); profile.value = j.data.profile; cards.value = j.data.cards; playlist.value = j.data.playlist || []; welcome.value = [...(j.data.welcome || ['', '', ''])]; applyStation(j.data) }
async function loadSettings() { const j = await api('/settings'); settings.value = j.data }
async function saveSettings() { busy.value = true; try { const j = await api('/settings', json('PUT', settings.value)); settings.value = j.data; reportSave('站点文案已保存', j) } catch (e) { report(e.message, true) } finally { busy.value = false } }
async function loadTypes() { const j = await api('/resource-types'); types.value = j.data }
async function loadEntries() { const j = await api(`/entries?kind=${kind.value}`); entries.value = j.data }
async function saveProfile() { busy.value = true; try { const j = await api('/profile', json('PUT', { profile: profile.value, cards: cards.value, playlist: playlist.value, welcome: welcome.value })); await loadProfile(); reportSave('首页已保存', j) } catch (e) { report(e.message, true) } finally { busy.value = false } }
function moveCard(index, shift) { const target = index + shift; if (target < 0 || target >= cards.value.length) return; [cards.value[index], cards.value[target]] = [cards.value[target], cards.value[index]] }
async function saveTypes() { busy.value = true; try { const j = await api('/resource-types', json('PUT', { types: types.value })); types.value = j.data; await loadEntries(); reportSave('资源分类已保存', j) } catch (e) { report(e.message, true) } finally { busy.value = false } }
function newEntry(nextKind = kind.value, resourceKind = 'document', parentId = null) { kind.value = nextKind; editingId.value = null; form.value = blank(); form.value.kind = nextKind; form.value.resource_kind = resourceKind; form.value.parent_id = parentId; memberQuery.value = ''; if (nextKind === 'resource') form.value.resource_type_id = types.value[0]?.id || null; tab.value = 'editor' }
function editEntry(row) {
  // Vue wraps list rows in proxies; structuredClone cannot clone a proxy directly.
  const entry = structuredClone(toRaw(entries.value.find(item => item.id === row.id) || row))
  editingId.value = entry.id
  kind.value = entry.kind
  form.value = entry
  form.value.pinned = Boolean(entry.pinned)
  form.value.images ||= []
  form.value.member_ids = entries.value.filter(item => item.parent_id === entry.id).map(item => item.id)
  memberQuery.value = ''
  tab.value = 'editor'
}
async function saveEntry() { if (shortTooLong.value) { report('短帖正文不能超过 500 字', true); return } busy.value = true; try { const path = editingId.value ? `/entries/${editingId.value}` : '/entries'; const j = await api(path, json(editingId.value ? 'PUT' : 'POST', form.value)); await loadEntries(); tab.value = kind.value; reportSave('内容已保存', j) } catch (e) { report(e.message, true) } finally { busy.value = false } }
async function toggleMomentPin(row) {
  if (busy.value) return
  busy.value = true
  try { await api(`/entries/${row.id}/pin`, json('POST', { enabled: !row.pinned })); await loadEntries(); report(row.pinned ? '已取消置顶' : '已置顶') }
  catch (e) { report(e.message, true) }
  finally { busy.value = false }
}
async function deleteEntry(row) { if (!confirm(`确定删除“${row.title || '短帖'}”吗？${row.resource_kind === 'collection' ? '\n其中的成员会回到资源库首页。' : ''}`)) return; try { const j = await api(`/entries/${row.id}`, { method: 'DELETE' }); await loadEntries(); reportSave('已删除', j) } catch (e) { report(e.message, true) } }
async function switchKind(next) { kind.value = next; tab.value = next; try { await loadEntries() } catch (e) { report(e.message, true) } }
async function uploadFile(event, target) { const file = event.target.files?.[0]; if (!file) return; const data = new FormData(); data.append('file', file); busy.value = true; try { const j = await api('/upload', { method: 'POST', body: data }); if (target === 'avatar') profile.value.avatar = j.url; else if (target === 'cover') form.value.cover_image = j.url; else if (target === 'body') form.value.body += `\n\n${file.type.startsWith('image/') ? `![${j.name}](${j.url})` : `[${j.name}](${j.url})`}\n`; else if (target === 'action') form.value.actions.push({ label: 'Download', url: j.url }); report('上传成功') } catch (e) { report(e.message, true) } finally { busy.value = false; event.target.value = '' } }
async function uploadGallery(event) {
  const files = [...(event.target.files || [])]
  if (!files.length) return
  if (form.value.images.length + files.length > 500) { report('图集最多 500 张图片', true); event.target.value = ''; return }
  busy.value = true
  let uploaded = 0
  try {
    for (const file of files) {
      report(`正在上传图片 ${uploaded + 1} / ${files.length}…`, true)
      const data = new FormData(); data.append('file', file)
      const result = await api('/upload', { method: 'POST', body: data })
      form.value.images.push({ url: result.url, caption: '', width: 0, height: 0 })
      uploaded++
    }
    report(`已上传 ${uploaded} 张图片，保存图集后生效`)
  } catch (cause) { report(`已上传 ${uploaded} 张；${cause.message}`, true) }
  finally { busy.value = false; event.target.value = '' }
}
function moveImage(index, shift) { const target = index + shift; if (target < 0 || target >= form.value.images.length) return; [form.value.images[index], form.value.images[target]] = [form.value.images[target], form.value.images[index]] }
function imageDimensions(event, image) { image.width = event.target.naturalWidth; image.height = event.target.naturalHeight }
onMounted(async () => { try { const r = await fetch('/api/admin/session'); const j = await r.json(); authenticated.value = j.authenticated; if (authenticated.value) await loadAll() } catch (e) { report(e.message || '连接失败', true) } finally { checking.value = false } })
</script>
<template>
  <div class="page-shell admin-page"><div class="admin-title"><div><span class="eyebrow">站点后台</span><h1>内容管理</h1></div><button v-if="authenticated" class="ghost-button" @click="logout">退出登录</button></div>
    <div v-if="message" class="notice" :class="{ 'notice-warning': hasWarnings }" :role="hasWarnings ? 'alert' : 'status'">{{ message }}</div>
    <div v-if="checking" class="surface state">检查登录状态…</div>
    <form v-else-if="!authenticated" class="surface login" @submit.prevent="login"><h2>登录后台</h2><p>输入管理员密码，继续管理网站内容。</p><label>管理员密码<input v-model="password" type="password" required autocomplete="current-password" /></label><button class="primary-button" :disabled="busy">登录</button></form>
    <template v-else>
      <nav class="admin-nav">
        <button :class="{ active: tab === 'profile' }" @click="tab = 'profile'">首页介绍</button>
        <button :class="{ active: tab === 'announcements' }" @click="tab = 'announcements'">公告管理</button>
        <button :class="{ active: tab === 'moment' || (tab === 'editor' && kind === 'moment') }" @click="switchKind('moment')">动态</button>
        <button :class="{ active: tab === 'resource' || (tab === 'editor' && kind === 'resource') }" @click="switchKind('resource')">资源库</button>
        <button :class="{ active: tab === 'learning' }" @click="tab = 'learning'">AI 学习</button>
        <button :class="{ active: tab === 'plaza' }" @click="tab = 'plaza'">活动发布</button>
        <button :class="{ active: tab === 'users' }" @click="tab = 'users'">用户管理</button>
        <button :class="{ active: tab === 'feedback' }" @click="tab = 'feedback'">反馈管理</button>
        <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">站点文案</button>
        <button :class="{ active: tab === 'backups' }" @click="tab = 'backups'">备份管理</button>
      </nav>
      <AiLearningAdmin v-if="tab === 'learning'" @notice="report" />
      <ActivityPublishAdmin v-if="tab === 'plaza'" />
      <section v-if="tab === 'users'" class="admin-group" aria-label="用户管理">
        <nav class="admin-subnav" aria-label="用户管理分类">
          <button type="button" :class="{ active: usersSection === 'accounts' }" :aria-pressed="usersSection === 'accounts'" @click="usersSection = 'accounts'">注册用户</button>
          <button type="button" :class="{ active: usersSection === 'blacklist' }" :aria-pressed="usersSection === 'blacklist'" @click="usersSection = 'blacklist'">黑名单用户</button>
        </nav>
        <UsersAdmin v-if="usersSection === 'accounts'" />
        <ModerationAdmin v-else mode="blacklist" />
      </section>
      <section v-if="tab === 'feedback'" class="admin-group" aria-label="反馈管理">
        <nav class="admin-subnav" aria-label="反馈管理分类">
          <button type="button" :class="{ active: feedbackSection === 'feedback' }" :aria-pressed="feedbackSection === 'feedback'" @click="feedbackSection = 'feedback'">访客反馈</button>
          <button type="button" :class="{ active: feedbackSection === 'reports' }" :aria-pressed="feedbackSection === 'reports'" @click="feedbackSection = 'reports'">举报内容处理</button>
        </nav>
        <FeedbackAdmin v-if="feedbackSection === 'feedback'" />
        <ModerationAdmin v-else mode="reports" />
      </section>
      <AnnouncementsAdmin v-if="tab === 'announcements'" />
      <BackupAdmin v-if="tab === 'backups'" @restored="loadAll" />
<section v-if="tab === 'profile'" class="admin-section"><div class="section-head"><div><h2>个人介绍</h2><p>头像、名称、描述和下方卡片都会实时显示在首页。</p></div><button class="primary-button" :disabled="busy" @click="saveProfile">保存首页</button></div><div class="surface editor-box"><div class="form-grid"><label>头像地址<input v-model="profile.avatar" placeholder="/picture/avatar.png" /></label><label>显示名称<input v-model="profile.name" placeholder="你的名字" /></label></div><label>上传头像<input type="file" accept="image/*" @change="uploadFile($event, 'avatar')" /></label><img v-if="profile.avatar" :src="profile.avatar" class="avatar-preview" alt="当前头像" /><label>描述<textarea v-model="profile.description" rows="4" placeholder="简单介绍一下自己"></textarea></label></div><HomeWelcomeAdmin v-model="welcome" /><HomePlaylistAdmin v-model="playlist" :busy="busy" @notice="report" @uploading="busy = $event" /><div class="section-head card-head"><div><h2>介绍卡片</h2><p>卡片内容支持 Markdown，使用 ++文字++ 添加下划线。</p></div><button class="ghost-button" @click="cards.push({ title: '', content: '' })">+ 添加卡片</button></div><div v-for="(card, index) in cards" :key="index" class="surface editor-box card-editor"><div class="card-controls"><strong>卡片 {{ index + 1 }}</strong><div><button @click="moveCard(index, -1)" :disabled="index === 0">上移</button><button @click="moveCard(index, 1)" :disabled="index === cards.length - 1">下移</button><button @click="cards.splice(index, 1)">删除</button></div></div><label>卡片标题<input v-model="card.title" placeholder="例如：联系方式" /></label><label>卡片内容 · Markdown<textarea v-model="card.content" rows="6" placeholder="支持链接、代码块、加粗、斜体、划去、下划线"></textarea></label><details><summary>预览</summary><MarkdownContent :source="card.content" /></details></div></section>
      <section v-else-if="tab === 'settings'" class="admin-section"><div class="section-head"><div><h2>站点文案</h2><p>编辑各页面介绍和页脚备案信息。</p></div><button class="primary-button" :disabled="busy" @click="saveSettings">保存文案</button></div><div class="surface editor-box"><label>动态页介绍<textarea v-model="settings.momentsDescription" rows="3"></textarea></label><label>资源库介绍<textarea v-model="settings.resourceDescription" rows="3"></textarea></label><label>广场介绍<textarea v-model="settings.activitiesMessage" rows="3"></textarea></label><label>备案号<input v-model="settings.icpNumber" placeholder="留空则不显示" /></label></div></section>
      <section v-else-if="tab === 'moment' || tab === 'resource'" class="admin-section">
        <div ref="listHeading" class="section-head list-heading"><div><h2>{{ tab === 'moment' ? '动态' : '资源库' }}</h2><p>编辑、发布或保留草稿。合集成员只在对应合集里展示。</p></div><div v-if="tab === 'resource'" class="head-actions"><button class="primary-button" @click="newEntry('resource')">+ 文档</button><button class="ghost-button" @click="newEntry('resource', 'collection')">+ 合集</button><button class="ghost-button" @click="newEntry('resource', 'gallery')">+ 图集</button></div><button v-else class="primary-button" @click="newEntry('moment')">+ 新建动态</button></div>
        <details v-if="tab === 'resource'" class="category-manager">
          <summary>资源分类管理 <span>{{ types.length }} 个大类</span></summary>
          <div class="category-content">
            <p>大类用于根界面的筛选和订阅，合集成员自动继承父合集的大类。删除大类后，相关内容变为未分类。</p>
            <div v-for="(type, index) in types" :key="type.id || `new-${index}`" class="type-row"><input v-model="type.name" placeholder="大类名称" :aria-label="`大类 ${index + 1} 名称`" /><button type="button" @click="types.splice(index, 1)">删除</button></div>
            <div class="head-actions"><button class="ghost-button" type="button" @click="types.push({ name: '' })">+ 添加大类</button><button class="primary-button" type="button" :disabled="busy" @click="saveTypes">保存大类</button></div>
          </div>
        </details>
        <div class="admin-list-toolbar">
          <label>搜索内容<input v-model="listQuery" type="search" placeholder="标题、标签、摘要或正文" /></label>
          <label>排序<select v-model="listSort"><option value="updated">最新修改</option><option value="created">最新创建</option></select></label>
        </div>
        <div class="admin-list-meta"><span>{{ listQuery.trim() ? '搜索结果' : '全部内容' }} · {{ listing.total }} {{ kind === 'resource' ? '个根项目' : '条动态' }}</span><small v-if="listQuery.trim() && kind === 'resource'">匹配内容按所属合集展示</small></div>
        <div v-if="!listing.rows.length" class="surface state">{{ listQuery.trim() ? '没有找到匹配的内容' : '暂无内容' }}</div>
        <div v-else class="entry-admin-list">
          <template v-for="row in listing.rows" :key="row.rowKey">
            <div v-if="row.fold" class="collection-fold" :style="{ marginLeft: `${Math.min(row.depth, 5) * 18}px` }"><button type="button" :aria-label="`${row.expanded ? '收起' : '展开'}合集 ${row.title} 的成员`" :aria-expanded="row.expanded" @click="toggleCollection(row.id)">{{ row.expanded ? '收起' : `展开其余 ${row.hidden} 项` }} <span aria-hidden="true">{{ row.expanded ? '↑' : '↓' }}</span></button></div>
            <div v-else class="surface entry-admin-row" :style="{ marginLeft: `${Math.min(row.depth, 5) * 18}px` }"><div><span v-if="row.kind === 'moment' && row.pinned" class="moment-pin-label">置顶</span><strong>{{ row.title || '短帖' }}</strong><small>{{ row.kind === 'resource' ? `${resourceLabel(row)} · ` : row.format === 'short' ? '短帖 · ' : '长文 · ' }}{{ row.status === 'draft' ? '草稿' : '已发布' }} · {{ listSort === 'created' ? '创建' : '修改' }}：{{ listDate(row) }}</small><small v-if="row.parent_id">所属：{{ resourceLocation(row) }}</small></div><div><button v-if="row.resource_kind === 'collection'" @click="newEntry('resource', 'document', row.id)">+ 子资源</button><button v-if="row.kind === 'moment' && row.status === 'published'" :disabled="busy" @click="toggleMomentPin(row)">{{ row.pinned ? '取消置顶' : '置顶' }}</button><button :disabled="busy" @click="editEntry(row)">编辑</button><button class="danger" :disabled="busy" @click="deleteEntry(row)">删除</button></div></div>
          </template>
        </div>
        <PaginationNav :page="listing.page" :total-pages="listing.totalPages" @change="changePage" />
      </section>
      <section v-else-if="tab === 'editor'" class="admin-section">
        <div class="section-head"><div><h2>{{ editingId ? '编辑' : '新建' }}{{ kind === 'moment' ? '动态' : resourceLabel(form) }}</h2><p>正文使用 Markdown，内容会用于搜索。</p></div><div class="head-actions"><button class="ghost-button" @click="tab = kind">返回列表</button><button class="primary-button" :disabled="busy || shortTooLong" @click="saveEntry">保存内容</button></div></div>
        <div class="surface editor-box">
          <div class="form-grid"><label>标题{{ form.format === 'short' ? '（可选）' : '' }}<input v-model="form.title" placeholder="给内容起个标题" /></label><label>发布状态<select v-model="form.status" @change="form.status === 'draft' && (form.pinned = false)"><option value="published">已发布</option><option value="draft">草稿</option></select></label></div>
          <label v-if="kind === 'moment'" class="moment-pin-setting"><input v-model="form.pinned" type="checkbox" :disabled="busy || form.status === 'draft'" /><span>置顶动态（短帖与长文合计最多 5 条，仅限已发布内容）</span></label>
          <div class="form-grid"><label>发布时间<input v-model="dateInput" type="datetime-local" /></label><label v-if="kind === 'moment'">动态形式<select v-model="form.format"><option value="article">长文</option><option value="short">短帖</option></select></label><label v-else-if="!form.parent_id">根大类<select v-model.number="form.resource_type_id"><option :value="null">未分类</option><option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option></select></label><label v-else>根大类 · 继承父合集<input :value="inheritedCategory" readonly /></label></div>
          <div v-if="kind === 'resource'" class="form-grid"><label>资源形态<select v-model="form.resource_kind"><option value="document">文档</option><option value="collection">合集</option><option value="gallery">图集</option></select></label><label>所属合集<select v-model="form.parent_id"><option :value="null">无 · 展示在资源库首页</option><option v-for="collection in parentCollections" :key="collection.id" :value="collection.id">{{ resourceLocation(collection) }} / {{ collection.title }}{{ collection.status === 'draft' ? '（草稿）' : '' }}</option></select></label></div>
          <p v-if="kind === 'resource' && form.parent_id" class="editor-hint">此内容只在所属合集中出现，大类随父合集自动继承；如果上级合集是草稿，此内容也暂不对外展示。</p>
          <section v-if="kind === 'resource' && form.resource_kind === 'collection'" class="member-editor">
            <div class="section-head"><div><h3>合集成员</h3><p>勾选已有资源、图集或其他合集。保存时移入本合集；取消勾选的原成员会回到资源库首页。</p></div><span>{{ form.member_ids.length }} 项</span></div>
            <input v-model="memberQuery" type="search" placeholder="按标题、标签或所属合集查找成员" aria-label="查找合集成员" />
            <div class="member-picker"><label v-for="item in memberCandidates" :key="item.id" class="member-option"><input v-model="form.member_ids" type="checkbox" :value="item.id" /><span><strong>{{ item.title }}</strong><small>{{ resourceLabel(item) }} · {{ resourceLocation(item) }}{{ item.status === 'draft' ? ' · 草稿' : '' }}</small></span></label><p v-if="!memberCandidates.length" class="editor-hint">暂无可加入的资源，可以先保存合集，再创建子资源。</p></div>
          </section>
          <label v-if="form.format !== 'short'">摘要<textarea v-model="form.summary" rows="2" placeholder="列表中显示的简短说明"></textarea></label>
          <div class="form-grid"><label>封面图片地址（可选）<input v-model="form.cover_image" placeholder="/picture/cover.png 或 https://..." /></label><label class="upload-label">上传封面图片<input type="file" accept="image/*" @change="uploadFile($event, 'cover')" /></label></div>
          <img v-if="form.cover_image" class="cover-preview" :src="form.cover_image" alt="当前封面预览" />
          <label>标签<input v-model="tagsText" placeholder="技术, 日常, Vue" /></label>
          <label>{{ kind === 'resource' && form.resource_kind !== 'document' ? '介绍 · Markdown（可选）' : '正文 · Markdown' }}<textarea v-model="form.body" :rows="kind === 'resource' && form.resource_kind !== 'document' ? 6 : isShort ? 8 : 16" :aria-invalid="shortTooLong" :aria-describedby="isShort ? 'short-body-count' : undefined" placeholder="开始写作…"></textarea></label>
          <p v-if="isShort" id="short-body-count" class="editor-hint" :class="{ 'count-warning': shortTooLong }" :role="shortTooLong ? 'alert' : undefined">{{ bodyLength }} / 500 字{{ shortTooLong ? `，请删减 ${bodyLength - 500} 字后保存。` : ' · 包含 Markdown 标记和链接地址；短帖只在列表中展示。' }}</p>
          <label class="upload-label">上传图片或文件并插入正文<input type="file" @change="uploadFile($event, 'body')" /></label>
          <details><summary>正文预览</summary><MarkdownContent :source="form.body" /></details>
          <section v-if="kind === 'resource' && form.resource_kind === 'gallery'" class="gallery-editor">
            <div class="section-head"><div><h3>图集图片</h3><p>按比例以瀑布流呈现，点击可查看大图。第一张图片会作为默认封面。</p></div><span>{{ form.images.length }} / 500 张</span></div>
            <label class="upload-label">批量上传图片<input type="file" accept="image/*" multiple :disabled="busy" @change="uploadGallery" /></label>
            <div v-for="(image, index) in form.images" :key="index" class="gallery-image-editor"><img v-if="image.url" :src="image.url" :alt="image.caption || `图片 ${index + 1}`" @load="imageDimensions($event, image)" /><div><label>图片 {{ index + 1 }} · 地址<input v-model="image.url" placeholder="/picture/... 或 https://..." @input="image.width = 0; image.height = 0" /></label><label>图片说明（可选）<input v-model="image.caption" placeholder="描述这张图片" /></label><div class="image-controls"><button type="button" class="ghost-button" :disabled="index === 0 || busy" @click="moveImage(index, -1)">上移</button><button type="button" class="ghost-button" :disabled="index === form.images.length - 1 || busy" @click="moveImage(index, 1)">下移</button><button type="button" class="ghost-button" :disabled="busy" @click="form.images.splice(index, 1)">移除</button></div></div></div>
            <button type="button" class="ghost-button" :disabled="form.images.length >= 500 || busy" @click="form.images.push({ url: '', caption: '', width: 0, height: 0 })">+ 添加图片地址</button>
          </section>
          <div v-if="kind === 'resource'" class="action-editor"><div class="section-head"><div><h3>卡片按钮</h3><p>配置阅读、下载、官网等按钮；留空则不显示。</p></div><button class="ghost-button" @click="form.actions.push({ label: '', url: '' })">+ 添加按钮</button></div><div v-for="(action, index) in form.actions" :key="index" class="action-row"><input v-model="action.label" placeholder="按钮文字，如 官网" /><input v-model="action.url" placeholder="https://... 或 /source/..." /><button @click="form.actions.splice(index, 1)">删除</button></div><label class="upload-label">上传资源并添加下载按钮<input type="file" @change="uploadFile($event, 'action')" /></label></div>
        </div>
      </section>
    </template>
  </div>
</template>
<style scoped src="../styles/admin.css"></style>
