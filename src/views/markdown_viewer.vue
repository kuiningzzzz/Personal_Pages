<template>
    <div class="viewer-container">
        <MarkdownReader :src="markdownSrc" />
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownReader from '../components/markdown_reader.vue'

const route = useRoute()

// 从路由参数获取 markdown 文件路径
const markdownSrc = computed(() => {
    return route.query.src || '/articles/default.md'
})
</script>

<style scoped>
.viewer-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    min-height: calc(100vh - 200px);
}
</style>
