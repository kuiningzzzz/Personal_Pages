<template>
    <div class="emoji-card">
        <div class="card-image">
            <img :src="previewImage" :alt="title" @error="handleImageError" />
        </div>
        <div class="card-header">
            <h3 class="card-title">{{ title }}</h3>
            <span class="card-count" v-if="count">{{ count }} 张</span>
        </div>
        <div class="card-content">
            <p class="card-desc">{{ desc }}</p>
        </div>
        <div class="card-footer">
            <router-link :to="viewerLink" class="view-link">
                <button class="view-btn">
                    <span>查看全部</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </button>
            </router-link>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    title: {
        type: String,
        required: true
    },
    desc: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    previewImage: {
        type: String,
        required: true
    },
    count: {
        type: Number,
        default: 0
    }
})

const viewerLink = computed(() => {
    return `/emoji-viewer?category=${props.category}`
})

const handleImageError = (e) => {
    e.target.src = '/picture/default-emoji.png'
}
</script>

<style scoped>
.emoji-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    height: fit-content;
    overflow: hidden;
}

.emoji-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
}

.card-image {
    width: 100%;
    height: 200px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
}

.card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.emoji-card:hover .card-image img {
    transform: scale(1.05);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px 0 24px;
    gap: 8px;
}

.card-title {
    color: #ffffff;
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    line-height: 1.4;
    letter-spacing: 0.3px;
    word-break: break-word;
}

.card-count {
    color: #7a8a9e;
    font-size: 12px;
    font-weight: 300;
    white-space: nowrap;
}

.card-content {
    flex: 1;
    padding: 12px 24px 16px 24px;
}

.card-desc {
    color: #b8c5d6;
    font-size: 14px;
    line-height: 1.7;
    font-weight: 300;
    margin: 0;
    word-break: break-word;
}

.card-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0 24px 20px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 16px;
    margin: 0 24px 20px 24px;
}

.view-link {
    text-decoration: none;
}

.view-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: #e8edf5;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
}

.view-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateX(2px);
}

.view-btn svg {
    transition: transform 0.2s ease;
}

.view-btn:hover svg {
    transform: translateX(2px);
}

/* 响应式设计 */
@media (max-width: 768px) {
    .card-image {
        height: 180px;
    }

    .card-header {
        padding: 16px 16px 0 16px;
    }

    .card-content {
        padding: 10px 16px 12px 16px;
    }

    .card-footer {
        padding: 0 16px 16px 16px;
        margin: 0 16px 16px 16px;
        padding-top: 12px;
    }

    .card-title {
        font-size: 18px;
    }

    .card-desc {
        font-size: 13px;
    }
}

@media (max-width: 480px) {
    .card-image {
        height: 160px;
    }

    .card-header {
        padding: 12px 12px 0 12px;
    }

    .card-content {
        padding: 8px 12px 10px 12px;
    }

    .card-footer {
        padding: 0 12px 12px 12px;
        margin: 0 12px 12px 12px;
        padding-top: 10px;
    }

    .card-title {
        font-size: 16px;
    }

    .card-count {
        font-size: 11px;
    }

    .card-desc {
        font-size: 12px;
    }
}
</style>
