<template>
    <div class="word-block">
        <slot></slot>
    </div>
</template>

<style scoped>
.word-block {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(8px);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 4px 12px;
    margin: 4px;
    display: inline-block;
    color: #d1d9e6;
    font-size: 13px;
    font-weight: 300;
    line-height: 1.4;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.word-block:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
}

/* 响应式设计 */
@media (max-width: 768px) {
    .word-block {
        font-size: 12px;
        padding: 3px 10px;
        margin: 3px;
    }
}

@media (max-width: 480px) {
    .word-block {
        font-size: 11px;
        padding: 2px 8px;
        margin: 2px;
    }
}
</style>
