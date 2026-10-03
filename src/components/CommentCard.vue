<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import CommentIcon from './CommentIcon.vue'
import { copyText } from '../lib/clipboard'
import { showSubscriptionNotice } from '../lib/subscriptions'

const props = defineProps({ comment: { type: Object, required: true }, busy: Boolean, focused: Boolean })
const emit = defineEmits(['like', 'reply', 'report', 'withdraw'])
const contentId = `comment-body-${useId()}`
const menuId = `comment-menu-${useId()}`
const moreTrigger = ref(null), menu = ref(null), menuPosition = ref(null)
const viewport = ref(null), content = ref(null), expanded = ref(false), overflowing = ref(false)
const height = ref(0), collapsedHeight = ref(70.2), moreOpen = ref(false), copying = ref(false)
const viewportStyle = computed(() => ({ maxHeight: `${expanded.value ? height.value : collapsedHeight.value}px` }))
const menuStyle = computed(() => menuPosition.value ? { left: `${menuPosition.value.left}px`, top: `${menuPosition.value.top}px`, transformOrigin: menuPosition.value.above ? 'right bottom' : 'right top' } : { visibility: 'hidden' })
let observer
function closeMenu(restoreFocus = false) {
  moreOpen.value = false
  if (restoreFocus && moreTrigger.value?.isConnected) moreTrigger.value.focus({ preventScroll: true })
}
function positionMenu() {
  if (!menu.value || !moreTrigger.value) return
  const anchor = moreTrigger.value.getBoundingClientRect()
  const width = menu.value.offsetWidth, height = menu.value.offsetHeight
  const edge = 10, gap = 7
  const above = anchor.bottom + gap + height > window.innerHeight - edge
  menuPosition.value = {
    left: Math.max(edge, Math.min(anchor.right - width, window.innerWidth - width - edge)),
    top: Math.max(edge, Math.min(above ? anchor.top - height - gap : anchor.bottom + gap, window.innerHeight - height - edge)), above
  }
}
function outsideMenu(event) {
  if (copying.value || menu.value?.contains(event.target) || moreTrigger.value?.contains(event.target)) return
  closeMenu()
}
function menuScroll(event) { if (!menu.value?.contains(event.target)) closeMenu() }
function menuResize() { closeMenu(true) }
function menuKeys(event) {
  if (!moreOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); closeMenu(true); return
  }
  if (event.key === 'Tab') { closeMenu(true); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  const items = [...(menu.value?.querySelectorAll('button:not(:disabled)') || [])]
  if (!items.length) return
  const index = items.indexOf(document.activeElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next].focus()
}
function detachMenu() {
  document.removeEventListener('pointerdown', outsideMenu, true)
  document.removeEventListener('focusin', outsideMenu)
  document.removeEventListener('keydown', menuKeys, true)
  window.removeEventListener('scroll', menuScroll, true)
  window.removeEventListener('resize', menuResize)
}
watch(moreOpen, async open => {
  detachMenu()
  if (!open) return
  menuPosition.value = null
  document.addEventListener('pointerdown', outsideMenu, true)
  document.addEventListener('focusin', outsideMenu)
  document.addEventListener('keydown', menuKeys, true)
  window.addEventListener('scroll', menuScroll, true)
  window.addEventListener('resize', menuResize)
  await nextTick()
  if (!moreOpen.value) return
  positionMenu()
  await nextTick()
  if (!moreOpen.value) return
  menu.value?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
})
function measure() {
  if (!viewport.value || !content.value) return
  collapsedHeight.value = parseFloat(getComputedStyle(viewport.value).lineHeight) * 3
  height.value = content.value.offsetHeight
  overflowing.value = height.value > collapsedHeight.value + 1
}
watch(() => [props.comment.body, props.comment.reply_to_name], async () => { expanded.value = false; await nextTick(); measure() })
onMounted(() => { observer = new ResizeObserver(measure); observer.observe(content.value); measure() })
onUnmounted(() => { observer?.disconnect(); detachMenu() })
function action(name) { closeMenu(true); emit(name, props.comment) }
async function copy() {
  if (copying.value) return
  copying.value = true
  try { await copyText(props.comment.body); closeMenu(true); showSubscriptionNotice('评论内容已复制') }
  catch (cause) { showSubscriptionNotice(cause.message || '复制失败，请手动选择内容复制') }
  finally { copying.value = false }
}
const date = value => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <article :id="`comment-${comment.id}`" class="comment-card" :class="{ focused, 'reply-card': comment.root_id }">
    <header><div class="comment-identity"><strong>{{ comment.username }}</strong><span v-if="comment.owned" class="identity-tag self-tag">自己</span><span v-if="comment.is_owner" class="identity-tag owner-tag">站主</span></div><span class="comment-email">{{ comment.email }}</span></header>
    <div :id="contentId" ref="viewport" class="comment-viewport" :style="viewportStyle"><p ref="content" class="comment-body"><span v-if="comment.root_id" class="reply-to">回复 @{{ comment.reply_to_name }}：</span>{{ comment.body }}</p></div>
    <button v-if="overflowing" class="fold-button" type="button" :aria-expanded="expanded" :aria-controls="contentId" @click="expanded = !expanded">{{ expanded ? '收回' : '展开' }}<span aria-hidden="true">{{ expanded ? '↑' : '↓' }}</span></button>
    <footer><time :datetime="comment.created_at">{{ date(comment.created_at) }}</time><div class="comment-actions">
      <button type="button" :disabled="busy" :class="{ liked: comment.liked }" :aria-pressed="comment.liked" :aria-label="`${comment.liked ? '取消点赞' : '点赞'}，${comment.likes} 个赞`" :title="comment.liked ? '取消点赞' : '点赞'" @click="emit('like', comment)"><CommentIcon name="like" :filled="comment.liked" /><span class="like-count">{{ comment.likes }}</span></button>
      <button type="button" :disabled="busy" aria-label="回复" title="回复" @click="emit('reply', comment)"><CommentIcon name="reply" /></button>
      <button ref="moreTrigger" type="button" :disabled="busy" aria-label="更多操作" title="更多操作" aria-haspopup="menu" :aria-controls="menuId" :aria-expanded="moreOpen" @click="moreOpen ? closeMenu(true) : moreOpen = true" @keydown.down.prevent="moreOpen = true"><CommentIcon name="more" /></button>
    </div></footer>
    <Teleport to="body"><Transition name="comment-popover"><div v-if="moreOpen" :id="menuId" ref="menu" class="comment-menu" :style="menuStyle" role="menu" aria-label="更多操作">
      <button type="button" role="menuitem" tabindex="-1" :disabled="copying" @click="copy"><CommentIcon name="copy" /><span>{{ copying ? '复制中…' : '复制' }}</span></button>
      <button type="button" role="menuitem" tabindex="-1" :disabled="busy || copying" @click="action('report')"><CommentIcon name="report" /><span>举报</span></button>
      <button v-if="comment.owned" type="button" role="menuitem" tabindex="-1" class="withdraw-action" :disabled="busy || copying" @click="action('withdraw')"><CommentIcon name="withdraw" /><span>撤回</span></button>
    </div></Transition></Teleport>
  </article>
</template>
<style scoped>
.comment-card { min-width: 0; padding: 12px; border-radius: 5px; background: var(--paper-deep); box-shadow: 2px 3px 0 var(--home-stack); color: var(--ink); scroll-margin-block: 20px; }
.comment-card.focused { box-shadow: inset 3px 0 0 var(--accent); background: var(--accent-soft); }
.reply-card { background: var(--card-sky); }
header { display: grid; gap: 4px; overflow-wrap: anywhere; }
strong { color: var(--ink); font-size: 13px; font-weight: 800; }
.comment-identity { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.identity-tag { flex: none; padding: 2px 5px; border-radius: 3px; font-size: 10px; font-weight: 700; line-height: 1.4; }
.self-tag { color: var(--link); background: var(--paper); }
.owner-tag { color: var(--ink); background: var(--accent-soft); box-shadow: 1px 2px 0 var(--sun); }
.comment-email { color: var(--soft); font-size: 10px; line-height: 1.5; }
.comment-viewport { margin: 10px 0 8px; overflow: hidden; font-size: 13px; line-height: 1.8; transition: max-height .25s ease; }
.comment-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.reply-to { color: var(--link); font-weight: 700; }
.fold-button { display: inline-flex; align-items: center; gap: 7px; margin: 0 0 9px; padding: 4px 8px; border: 0; border-radius: 3px; background: var(--paper); color: var(--link); font-size: 11px; font-weight: 700; }
footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 5px 8px; }
time { color: var(--soft); font-size: 10px; }
.comment-actions { display: flex; gap: 5px; margin-left: auto; }
.comment-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 28px; height: 28px; padding: 5px 6px; border: 0; border-radius: 4px; background: var(--paper); color: var(--muted); }
.like-count { font-size: 10px; line-height: 1; }
.comment-actions button.liked { color: var(--cocoa); background: var(--accent-soft); }
.comment-actions button:hover:not(:disabled) { color: var(--ink); background: var(--accent-soft); }
button:disabled { opacity: .5; cursor: wait; }
.comment-menu { position: fixed; z-index: 200; display: grid; gap: 2px; width: 136px; padding: 5px; border-radius: 5px; background: var(--paper); color: var(--ink); box-shadow: 4px 5px 0 var(--home-stack); }
.comment-menu button { display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 7px 10px; border: 0; border-radius: 3px; background: transparent; color: var(--ink); text-align: left; font-size: 12px; line-height: 1.5; }
.comment-menu button:hover:not(:disabled) { background: var(--accent-soft); }
.comment-menu .withdraw-action { color: var(--danger); }
.comment-popover-enter-active, .comment-popover-leave-active { transition: opacity .14s ease, transform .14s ease; }
.comment-popover-enter-from, .comment-popover-leave-to { opacity: 0; transform: scale(.95); }
@media (prefers-reduced-motion: reduce) { .comment-viewport, .comment-popover-enter-active, .comment-popover-leave-active { transition: none; } }
</style>
