<script setup>
import HomeAdminSection from './HomeAdminSection.vue'
const sentences = defineModel({ type: Array, default: () => [] })
defineProps({ busy: Boolean })
function add() {
  sentences.value.unshift({ _key: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, content: '' })
}
</script>
<template>
  <HomeAdminSection title="首页句子" :summary="`${sentences.length} 条句子`">
    <div class="sentence-tools"><p>首页随机显示一句，点击刷新可以换一句。保存首页后生效；清空列表即可隐藏句子卡片。</p><button type="button" :disabled="busy || sentences.length >= 500" @click="add">+ 添加句子</button></div>
    <p v-if="!sentences.length" class="sentences-empty">还没有添加句子。</p>
    <div v-for="(sentence, index) in sentences" :key="sentence.id || sentence._key" class="sentence-editor"><label><span>句子 {{ index + 1 }}</span><textarea v-model="sentence.content" rows="3" :disabled="busy" placeholder="写下一句想分享的话…"></textarea></label><button type="button" :disabled="busy" @click="sentences.splice(index, 1)">移除</button></div>
  </HomeAdminSection>
</template>
<style scoped>
.sentence-tools { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px; }.sentence-tools p, .sentences-empty { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.8; }.sentence-tools p { flex: 1; }.sentence-tools button { flex: none; }button { padding: 8px 10px; border: 0; border-radius: 4px; color: var(--ink); background: var(--accent-soft); font-size: 12px; }button:disabled { opacity: .4; cursor: not-allowed; }.sentence-editor { display: flex; align-items: flex-start; gap: 12px; margin-top: 16px; }.sentence-editor label { display: grid; gap: 8px; flex: 1; min-width: 0; color: var(--ink); font-size: 12px; font-weight: 700; }.sentence-editor textarea { width: 100%; resize: vertical; padding: 12px; border: 0; border-radius: 4px; background: var(--field-bg); color: var(--ink); box-shadow: inset 0 0 0 1px var(--field-line); line-height: 1.8; }.sentence-editor button { margin-top: 26px; }.sentence-editor textarea:focus { outline: 2px solid var(--accent); }
</style>
