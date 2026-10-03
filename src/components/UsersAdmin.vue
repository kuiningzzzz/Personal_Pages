<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import PaginationNav from './PaginationNav.vue'

const users = ref([]), owner = ref(null), total = ref(0), page = ref(1), totalPages = ref(1)
const searchText = ref(''), query = ref(''), loading = ref(false), busy = ref(false)
const error = ref(''), notice = ref('')
let revision = 0
async function request(path, body) {
  const response = await fetch(`/api/admin/users${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '操作失败')
  return result
}
async function load() {
  const current = ++revision; loading.value = true; error.value = ''
  try {
    const params = new URLSearchParams({ q: query.value, page: String(page.value) })
    const result = await request(`?${params}`)
    if (current !== revision) return
    users.value = result.data; owner.value = result.owner; total.value = result.total
    page.value = result.page; totalPages.value = result.totalPages
  } catch (cause) { if (current === revision) error.value = cause.message }
  finally { if (current === revision) loading.value = false }
}
function search() { query.value = searchText.value.trim(); page.value = 1; load() }
function reset() { searchText.value = ''; search() }
function paginate(next) { page.value = next; load() }
async function setOwner(user) {
  if (busy.value || loading.value) return
  busy.value = true; notice.value = ''; error.value = ''
  try {
    const result = await request(`/${user.id}/owner`, { enabled: !user.is_owner })
    notice.value = result.message; await load()
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
const date = value => new Date(value).toLocaleString('zh-CN')
onMounted(load)
onUnmounted(() => { revision++ })
</script>

<template>
  <section class="users-admin">
    <header class="users-heading"><div><h2>用户管理</h2><p>查看注册账户，指定在评论区显示站主身份的账户。</p></div><button type="button" class="ghost-button" :disabled="loading || busy" @click="load">刷新</button></header>
    <div class="owner-summary"><span>当前站主</span><strong>{{ owner?.username || '尚未设置' }}</strong><small v-if="owner">{{ owner.email }}</small><p>仅保留一个站主账户，设置新站主会自动取消原账户的站主身份。</p></div>
    <form class="users-search" @submit.prevent="search"><label for="users-search-input" class="sr-only">搜索用户名或邮箱</label><input id="users-search-input" v-model="searchText" type="search" maxlength="200" placeholder="搜索用户名或邮箱" :disabled="busy" /><button type="submit" class="primary-button" :disabled="loading || busy">搜索</button><button v-if="query || searchText" type="button" class="ghost-button" :disabled="loading || busy" @click="reset">重置</button><small>{{ total }} 个账户</small></form>
    <p v-if="error" class="users-notice error" role="alert">{{ error }}</p><p v-if="notice" class="users-notice" role="status">{{ notice }}</p>
    <p v-if="loading" class="surface state" role="status">正在读取账户…</p>
    <p v-else-if="!users.length" class="surface state">{{ query ? '没有匹配的账户' : '暂无注册账户' }}</p>
    <div v-else class="surface users-table-wrap"><table class="users-table"><thead><tr><th scope="col">用户名 / 邮箱</th><th scope="col">注册时间</th><th scope="col">身份</th><th scope="col">操作</th></tr></thead><tbody><tr v-for="user in users" :key="user.id"><td><strong>{{ user.username }}</strong><span class="user-email">{{ user.email }}</span><small>账户 #{{ user.id }}</small></td><td><time :datetime="user.created_at">{{ date(user.created_at) }}</time></td><td><span class="user-role" :class="{ owner: user.is_owner }">{{ user.is_owner ? '站主' : '访客' }}</span></td><td><button type="button" class="ghost-button owner-action" :disabled="busy || loading" @click="setOwner(user)">{{ user.is_owner ? '取消站主' : '设为站主' }}</button></td></tr></tbody></table></div>
    <PaginationNav :page="page" :total-pages="totalPages" :disabled="loading || busy" @change="paginate" />
  </section>
</template>

<style scoped>
.users-admin { max-width: 1080px; }
.users-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 22px; }
h2 { margin: 0 0 8px; font-size: 27px; }.users-heading p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.owner-summary { padding: 16px 18px; margin-bottom: 22px; border-radius: 5px; background: var(--accent-soft); box-shadow: 4px 5px 0 var(--sun); overflow-wrap: anywhere; }.owner-summary>span { margin-right: 12px; font-size: 12px; color: var(--muted); }.owner-summary strong { color: var(--ink); font-size: 15px; }.owner-summary small { margin-left: 10px; color: var(--muted); font-size: 12px; }.owner-summary p { margin: 10px 0 0; color: var(--muted); font-size: 11px; line-height: 1.7; }
.users-search { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 20px; }.users-search input { flex: 1; min-width: 160px; padding: 12px; border: 0; border-radius: 4px; color: var(--ink); background: var(--field-bg); font: inherit; font-size: 13px; }.users-search small { margin-left: auto; color: var(--muted); font-size: 12px; }
.users-table-wrap { overflow-x: auto; }.users-table { width: 100%; border-collapse: collapse; text-align: left; }.users-table th { padding: 17px 18px; color: var(--muted); font-size: 12px; background: var(--paper-deep); }.users-table td { padding: 17px 18px; vertical-align: middle; font-size: 12px; color: var(--ink); }.users-table tr+tr td { border-top: 1px solid var(--paper-deep); }.users-table td:first-child { min-width: 190px; max-width: 360px; overflow-wrap: anywhere; }.users-table td:first-child strong { display: block; font-size: 14px; }.user-email { display: block; margin-top: 5px; color: var(--muted); }.users-table small { display: block; margin-top: 5px; color: var(--soft); font-size: 10px; }.users-table time { white-space: nowrap; font-size: 11px; }
.user-role { display: inline-block; padding: 3px 7px; border-radius: 3px; color: var(--muted); background: var(--paper-deep); white-space: nowrap; }.user-role.owner { color: var(--ink); background: var(--accent-soft); box-shadow: 2px 2px 0 var(--sun); }.owner-action { min-height: 34px; padding: 7px 10px; font-size: 12px; white-space: nowrap; }
.users-notice { padding: 12px 15px; border-radius: 4px; background: var(--sky); color: var(--ink); font-size: 13px; }.users-notice.error { background: var(--warning-bg); color: var(--error-text); }button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width:600px) { .users-table th,.users-table td { padding: 14px 12px; }.owner-summary small { display: block; margin: 7px 0 0; } }
</style>
