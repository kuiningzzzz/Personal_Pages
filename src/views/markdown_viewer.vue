<template>
    <div class="viewer-container">
        <MarkdownReader :src="markdownSrc" />
        <CommentArea :pageId="markdownSrc" />
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownReader from '../components/markdown_reader.vue'
import CommentArea from '../components/comment_area.vue'

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
    width: 100%;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .viewer-container {
        padding: 15px;
        min-height: auto;
    }
}

@media (max-width: 480px) {
    .viewer-container {
        padding: 10px 0;
    }
}
</style>
