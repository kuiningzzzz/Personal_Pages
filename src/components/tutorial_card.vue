<template>
    <div class="tutorial-card">
        <div class="card-header">
            <h3 class="card-title">{{ title }}</h3>
            <span class="card-date" v-if="date">{{ date }}</span>
        </div>
        <div class="card-content">
            <p class="card-desc">{{ desc }}</p>
        </div>
        <div class="card-footer">
            <router-link :to="link" class="read-more-link">
                <button class="read-more-btn">
                    <span>Read More</span>
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
defineProps({
    title: {
        type: String,
        required: true
    },
    desc: {
        type: String,
        required: true
    },
    date: {
        type: String,
        default: ''
    },
    link: {
        type: String,
        default: '/'
    }
})
</script>

<style scoped>
.tutorial-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 24px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: fit-content;
}

.tutorial-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
}

.card-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.card-title {
    color: #ffffff;
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    line-height: 1.4;
    letter-spacing: 0.3px;
}

.card-date {
    color: #7a8a9e;
    font-size: 12px;
    font-weight: 300;
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
}

.card-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.read-more-link {
    text-decoration: none;
}

.read-more-btn {
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
}

.read-more-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateX(2px);
}

.read-more-btn svg {
    transition: transform 0.2s ease;
}

.read-more-btn:hover svg {
    transform: translateX(2px);
}
</style>