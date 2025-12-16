<template>
    <div class="markdown-container">
        <div class="markdown-card">
            <div v-if="loading" class="loading">加载中...</div>
            <div v-else-if="error" class="error">{{ error }}</div>
            <div v-else class="markdown-content" v-html="renderedMarkdown"></div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'

const props = defineProps({
    src: {
        type: String,
        required: true
    }
})

const loading = ref(true)
const error = ref('')
const renderedMarkdown = ref('')

// 配置 marked
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value
            } catch (e) {
                console.error(e)
            }
        }
        return hljs.highlightAuto(code).value
    },
    breaks: true,
    gfm: true
})

// 加载并渲染 markdown 文件
async function loadMarkdown() {
    loading.value = true
    error.value = ''
    
    try {
        const response = await fetch(props.src)
        if (!response.ok) {
            throw new Error(`无法加载文件: ${response.statusText}`)
        }
        const markdown = await response.text()
        renderedMarkdown.value = marked(markdown)
    } catch (e) {
        error.value = `加载失败: ${e.message}`
        console.error('Markdown 加载错误:', e)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadMarkdown()
})

// 监听 src 变化
watch(() => props.src, () => {
    loadMarkdown()
})
</script>

<style scoped>
.markdown-container {
    display: flex;
    justify-content: center;
    padding: 20px;
    width: 100%;
}

.markdown-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 40px;
    width: 90%;
    max-width: 900px;
}

.loading,
.error {
    text-align: center;
    color: #7a8a9e;
    padding: 40px;
    font-size: 16px;
}

.error {
    color: #ff6b6b;
}

/* Markdown 内容样式 */
.markdown-content {
    color: #e8edf5;
    font-size: 16px;
    line-height: 1.8;
    font-weight: 300;
    word-break: break-word;
}

/* 标题样式 */
.markdown-content :deep(h1) {
    color: #ffffff;
    font-size: 32px;
    font-weight: 500;
    margin: 32px 0 20px 0;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    letter-spacing: 0.5px;
}

.markdown-content :deep(h1:first-child) {
    margin-top: 0;
}

.markdown-content :deep(h2) {
    color: #ffffff;
    font-size: 26px;
    font-weight: 500;
    margin: 28px 0 16px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    letter-spacing: 0.3px;
}

.markdown-content :deep(h3) {
    color: #ffffff;
    font-size: 22px;
    font-weight: 500;
    margin: 24px 0 12px 0;
    letter-spacing: 0.2px;
}

.markdown-content :deep(h4) {
    color: #e8edf5;
    font-size: 18px;
    font-weight: 500;
    margin: 20px 0 10px 0;
}

.markdown-content :deep(h5),
.markdown-content :deep(h6) {
    color: #e8edf5;
    font-size: 16px;
    font-weight: 500;
    margin: 16px 0 8px 0;
}

/* 段落和文本 */
.markdown-content :deep(p) {
    color: #b8c5d6;
    margin: 12px 0;
    line-height: 1.8;
}

.markdown-content :deep(strong) {
    color: #ffffff;
    font-weight: 500;
}

.markdown-content :deep(em) {
    color: #d4dde8;
    font-style: italic;
}

/* 链接 */
.markdown-content :deep(a) {
    color: #74aaff;
    text-decoration: none;
    transition: color 0.2s ease;
    word-break: break-word;
}

.markdown-content :deep(a:hover) {
    color: #9cc3ff;
    text-decoration: underline;
}

/* 列表 */
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
    color: #b8c5d6;
    margin: 16px 0;
    padding-left: 28px;
}

.markdown-content :deep(li) {
    margin: 8px 0;
    line-height: 1.7;
}

.markdown-content :deep(li > ul),
.markdown-content :deep(li > ol) {
    margin: 8px 0;
}

/* 引用块 */
.markdown-content :deep(blockquote) {
    background: rgba(255, 255, 255, 0.03);
    border-left: 4px solid rgba(116, 170, 255, 0.5);
    margin: 20px 0;
    padding: 16px 20px;
    border-radius: 4px;
    color: #c5d0dd;
    font-style: italic;
    overflow: auto;
}

.markdown-content :deep(blockquote p) {
    margin: 8px 0;
}

/* 代码 */
.markdown-content :deep(code) {
    background: rgba(255, 255, 255, 0.08);
    color: #ff9d76;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
    word-break: break-word;
}

.markdown-content :deep(pre) {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}

.markdown-content :deep(pre code) {
    background: transparent;
    color: #e8edf5;
    padding: 0;
    font-size: 14px;
    line-height: 1.6;
}

/* 表格 */
.markdown-content :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px;
    overflow: hidden;
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}

.markdown-content :deep(thead) {
    background: rgba(255, 255, 255, 0.05);
}

.markdown-content :deep(th) {
    color: #ffffff;
    font-weight: 500;
    padding: 12px 16px;
    text-align: left;
    border-bottom: 2px solid rgba(255, 255, 255, 0.1);
    white-space: nowrap;
}

.markdown-content :deep(td) {
    color: #b8c5d6;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    white-space: nowrap;
}

.markdown-content :deep(tr:last-child td) {
    border-bottom: none;
}

.markdown-content :deep(tr:hover) {
    background: rgba(255, 255, 255, 0.03);
}

/* 水平线 */
.markdown-content :deep(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 32px 0;
}

/* 图片 */
.markdown-content :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 20px 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    display: block;
}

/* 任务列表 */
.markdown-content :deep(input[type="checkbox"]) {
    margin-right: 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .markdown-card {
        padding: 24px;
        width: 95%;
    }

    .markdown-content {
        font-size: 15px;
    }

    .markdown-content :deep(h1) {
        font-size: 24px;
        margin: 24px 0 16px 0;
    }

    .markdown-content :deep(h2) {
        font-size: 20px;
        margin: 20px 0 12px 0;
    }

    .markdown-content :deep(h3) {
        font-size: 18px;
        margin: 18px 0 10px 0;
    }

    .markdown-content :deep(h4) {
        font-size: 16px;
    }

    .markdown-content :deep(p) {
        font-size: 14px;
        line-height: 1.7;
    }

    .markdown-content :deep(code) {
        font-size: 12px;
    }

    .markdown-content :deep(pre) {
        padding: 12px;
        margin: 12px 0;
    }

    .markdown-content :deep(pre code) {
        font-size: 12px;
        line-height: 1.5;
    }

    .markdown-content :deep(blockquote) {
        padding: 12px 16px;
        margin: 12px 0;
    }

    .markdown-content :deep(ul),
    .markdown-content :deep(ol) {
        padding-left: 20px;
        margin: 12px 0;
    }

    .markdown-content :deep(li) {
        margin: 4px 0;
    }

    .markdown-content :deep(table) {
        font-size: 13px;
    }

    .markdown-content :deep(th),
    .markdown-content :deep(td) {
        padding: 8px 12px;
    }

    .markdown-content :deep(img) {
        margin: 12px 0;
    }
}

@media (max-width: 480px) {
    .markdown-card {
        padding: 16px;
        width: 100%;
        border-radius: 8px;
    }

    .markdown-content {
        font-size: 14px;
    }

    .markdown-content :deep(h1) {
        font-size: 20px;
        margin: 20px 0 12px 0;
        padding-bottom: 8px;
    }

    .markdown-content :deep(h2) {
        font-size: 18px;
        margin: 16px 0 10px 0;
    }

    .markdown-content :deep(h3) {
        font-size: 16px;
        margin: 14px 0 8px 0;
    }

    .markdown-content :deep(h4) {
        font-size: 15px;
    }

    .markdown-content :deep(p) {
        font-size: 13px;
        line-height: 1.6;
        margin: 8px 0;
    }

    .markdown-content :deep(code) {
        font-size: 11px;
        padding: 1px 4px;
    }

    .markdown-content :deep(pre) {
        padding: 8px;
        margin: 8px 0;
        border-radius: 4px;
    }

    .markdown-content :deep(blockquote) {
        padding: 8px 12px;
        margin: 8px 0;
        border-left: 3px solid rgba(116, 170, 255, 0.5);
    }

    .markdown-content :deep(ul),
    .markdown-content :deep(ol) {
        padding-left: 16px;
        margin: 8px 0;
    }

    .markdown-content :deep(li) {
        margin: 2px 0;
    }

    .markdown-content :deep(table) {
        font-size: 12px;
        margin: 12px 0;
    }

    .markdown-content :deep(th),
    .markdown-content :deep(td) {
        padding: 6px 8px;
    }

    .markdown-content :deep(hr) {
        margin: 16px 0;
    }

    .markdown-content :deep(img) {
        margin: 8px 0;
    }
}
</style>

<style>
/* 代码高亮主题（全局样式） */
@import 'highlight.js/styles/atom-one-dark.css';
</style>
