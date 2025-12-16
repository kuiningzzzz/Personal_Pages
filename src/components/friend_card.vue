<template>
    <div class="friend-card">
        <div class="card-image">
            <img :src="avatar" :alt="title" />
        </div>
        <div class="card-body">
            <div class="card-header">
                <h3 class="card-title">{{ title }}</h3>
            </div>
            <div class="card-content">
                <p class="card-desc">{{ desc }}</p>
            </div>
            <div class="card-footer">
                <a :href="link" target="_blank" class="see-page-link">
                    <button class="see-page-btn">
                        <span>See Page</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                        </svg>
                    </button>
                </a>
            </div>
        </div>
    </div>
</template>

<script setup>
defineProps({
    title: {
        type: String,
        required: true
    },
    desc: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        required: true
    },
    link: {
        type: String,
        required: true
    }
})
</script>

<style scoped>
.friend-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: fit-content;
}

.friend-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
}

.card-image {
    width: 100%;
    aspect-ratio: 5 / 3;
    overflow: hidden;
    position: relative;
}

.card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
}

.card-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.card-header {
    display: flex;
    flex-direction: column;
}

.card-title {
    color: #ffffff;
    font-size: 18px;
    font-weight: 500;
    margin: 0;
    line-height: 1.4;
    letter-spacing: 0.3px;
    word-break: break-word;
}

.card-content {
    flex: 1;
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
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.see-page-link {
    text-decoration: none;
}

.see-page-btn {
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

.see-page-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateX(2px);
}

.see-page-btn svg {
    transition: transform 0.2s ease;
}

.see-page-btn:hover svg {
    transform: translateX(2px);
}

/* 响应式设计 */
@media (max-width: 768px) {
    .card-body {
        padding: 16px;
        gap: 10px;
    }

    .card-title {
        font-size: 16px;
    }

    .card-desc {
        font-size: 13px;
    }

    .see-page-btn {
        padding: 6px 12px;
        font-size: 12px;
    }
}

@media (max-width: 480px) {
    .card-body {
        padding: 12px;
        gap: 8px;
    }

    .card-title {
        font-size: 14px;
    }

    .card-desc {
        font-size: 12px;
        line-height: 1.6;
    }

    .see-page-btn {
        padding: 5px 10px;
        font-size: 11px;
        gap: 4px;
    }

    .see-page-btn svg {
        width: 14px;
        height: 14px;
    }
}
</style>