<script setup>
const lines = defineModel({ type: Array, required: true })
</script>
<template>
  <section class="surface editor-box welcome-editor">
    <h2>开始界面</h2><p>三行文字依次出现，最后显示“进入网站”按钮。开始界面使用固定的深棕色与淡色。</p>
    <label v-for="(_, index) in lines" :key="index">第 {{ index + 1 }} 行
      <input v-model="lines[index]" maxlength="120" :placeholder="`第 ${index + 1} 行欢迎文字`" />
    </label>
  </section>
</template>
<style scoped>
.welcome-editor { margin-top: 24px; }.welcome-editor h2 { margin: 0 0 8px; font-size: 23px; }.welcome-editor p { color: var(--muted); font-size: 12px; line-height: 1.8; margin: 0 0 18px; }
.welcome-editor label { display: grid; gap: 8px; margin-top: 14px; color: var(--ink); font-size: 12px; font-weight: 700; }.welcome-editor input { width: 100%; padding: 12px; border: 0; border-radius: 4px; background: var(--field-bg); color: var(--ink); box-shadow: inset 0 0 0 1px var(--field-line); }
</style>
