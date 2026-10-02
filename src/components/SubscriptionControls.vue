<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import SubscribeButton from './SubscribeButton.vue'
import { visitor, loadVisitor } from '../lib/auth'
import { isSubscribed, loadSubscriptions, saveSubscriptionChanges, showSubscriptionNotice, subscriptionsBusy } from '../lib/subscriptions'

const props = defineProps({ kind: { type: String, required: true }, types: { type: Array, default: () => [] } })
const popoverId = useId()
const controls = ref(null)
const trigger = ref(null)
const panel = ref(null)
const open = ref(false)
const opening = ref(false)
const selected = ref({})
const initial = ref({})
const options = computed(() => props.kind === 'resource'
  ? props.types.map(type => ({ key: `type-${type.id}`, label: type.name, scope: 'resource-type', targetId: type.id }))
  : [{ key: 'short', label: '短帖', scope: 'moment-short', targetId: 0 }, { key: 'article', label: '长文', scope: 'moment-article', targetId: 0 }])
const changes = computed(() => options.value.filter(option => selected.value[option.key] !== initial.value[option.key])
  .map(option => ({ scope: option.scope, targetId: option.targetId, enabled: Boolean(selected.value[option.key]) })))

function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}
function addOptions() {
  for (const option of options.value) {
    if (!Object.hasOwn(selected.value, option.key)) {
      selected.value[option.key] = isSubscribed(option.scope, option.targetId)
      initial.value[option.key] = selected.value[option.key]
    }
  }
}
async function toggleOptions() {
  if (open.value) { close(); return }
  if (opening.value || subscriptionsBusy.value) return
  opening.value = true
  try {
    const user = await loadVisitor(true)
    if (!user) { showSubscriptionNotice('登录/注册后即可使用订阅服务'); return }
    await loadSubscriptions(true)
    if (visitor.value?.id !== user.id) return
    selected.value = {}; initial.value = {}; addOptions()
    open.value = true
    await nextTick()
    panel.value?.querySelector('input, button')?.focus()
  } catch (cause) { showSubscriptionNotice(cause.message) }
  finally { opening.value = false }
}
async function save() {
  if (!changes.value.length) { close(true); return }
  if (await saveSubscriptionChanges(changes.value)) close(true)
}
function outside(event) { if (open.value && !controls.value?.contains(event.target)) close() }
function escape(event) { if (open.value && event.key === 'Escape') { event.preventDefault(); close(true) } }
watch(options, () => { if (open.value) addOptions() })
watch(() => visitor.value?.id, () => close())
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', outside)
  document.addEventListener('keydown', escape)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin', outside)
  document.removeEventListener('keydown', escape)
})
</script>

<template>
  <div ref="controls" class="subscription-controls" :class="{ 'is-open': open }">
    <SubscribeButton :scope="kind === 'resource' ? 'resource-all' : 'moment-all'" :label="kind === 'resource' ? '全部资源库' : '全部动态'" subscribe-text="全部订阅" cancel-text="取消全部订阅" />
    <button ref="trigger" type="button" class="category-trigger" :disabled="opening || subscriptionsBusy" :aria-expanded="open" :aria-controls="popoverId" aria-haspopup="dialog" @click="toggleOptions">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M8 5h8M8 10h8M8 15h8M3.5 5h.5M3.5 10h.5M3.5 15h.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      {{ opening ? '读取中…' : '按类订阅' }}<svg class="chevron" :class="{ rotated: open }" aria-hidden="true" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 4.25h7L6 8.25Z" /></svg>
    </button>
    <Transition name="subscription-popover">
      <section v-if="open" :id="popoverId" ref="panel" class="subscription-popover" role="dialog" :aria-labelledby="`${popoverId}-title`">
        <h2 :id="`${popoverId}-title`">{{ kind === 'resource' ? '选择订阅分类' : '选择动态类型' }}</h2>
        <p>勾选想收到邮件提醒的内容。</p>
        <form @submit.prevent="save">
          <fieldset :disabled="subscriptionsBusy"><legend class="sr-only">可多选的订阅分类</legend>
            <label v-for="option in options" :key="option.key" class="subscription-option" :class="{ checked: selected[option.key] }">
              <input v-model="selected[option.key]" type="checkbox" :name="option.key" /><span>{{ option.label }}</span>
            </label>
            <span v-if="!options.length" class="no-options">暂无可订阅分类</span>
          </fieldset>
          <div class="popover-actions"><button type="button" class="popover-cancel" :disabled="subscriptionsBusy" @click="close(true)">取消</button><button type="submit" class="popover-save" :disabled="subscriptionsBusy || !changes.length">{{ subscriptionsBusy ? '保存中…' : '保存选择' }}</button></div>
        </form>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.subscription-controls { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; width: fit-content; margin-top: 16px; }
.subscription-controls.is-open { z-index: 30; }
.category-trigger { display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 6px; height: 34px; min-height: 34px; padding: 0 12px; border: 0; border-radius: 4px; background: var(--sky); color: var(--ink); box-shadow: 3px 3px 0 var(--denim); font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; transition: transform .2s ease; }
.category-trigger svg { display: block; width: 17px; height: 17px; flex: none; }
.category-trigger:hover:not(:disabled) { transform: translateY(-2px); }
.category-trigger:disabled { opacity: .65; cursor: wait; }
.category-trigger .chevron { width: 12px; height: 12px; margin-left: 2px; transition: transform .2s ease; }
.chevron.rotated { transform: rotate(180deg); }
.subscription-popover { position: absolute; z-index: 30; top: calc(100% + 12px); left: 0; width: min(300px, calc(100vw - 48px)); padding: 20px; border-radius: 6px; background: var(--paper); color: var(--ink); box-shadow: 6px 7px 0 var(--home-stack); }
.subscription-popover h2 { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 800; }
.subscription-popover p { margin: 7px 0 16px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.subscription-popover fieldset { display: grid; gap: 7px; margin: 0; padding: 0 2px 5px 0; border: 0; max-height: min(270px, 45vh); overflow-y: auto; }
.subscription-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 4px; background: var(--paper-deep); color: var(--ink); font-size: 13px; cursor: pointer; transition: background-color .18s ease; }
.subscription-option.checked { background: var(--accent-soft); }
.subscription-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--ink); flex: none; }
.subscription-option span { overflow-wrap: anywhere; }
.no-options { color: var(--muted); padding: 10px 0; font-size: 13px; }
.popover-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.popover-actions button { min-height: 34px; padding: 8px 12px; border: 0; border-radius: 4px; color: var(--ink); font-size: 12px; font-weight: 700; }
.popover-cancel { background: var(--paper-deep); }
.popover-save { background: var(--accent-soft); box-shadow: 3px 3px 0 var(--sun); }
.popover-actions button:disabled { opacity: .55; cursor: default; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.subscription-popover-enter-active, .subscription-popover-leave-active { transition: opacity .18s ease, transform .18s ease; transform-origin: left top; }
.subscription-popover-enter-from, .subscription-popover-leave-to { opacity: 0; transform: translateY(-6px) scale(.98); }
@media (prefers-reduced-motion: reduce) { .subscription-popover-enter-active, .subscription-popover-leave-active { transition: opacity .1s ease; } }
</style>
