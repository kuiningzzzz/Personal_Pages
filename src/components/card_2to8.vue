<template>
    <div class="home-card">
        <div class="card-title">
            <h3>{{ title }}</h3>
        </div>
        <div class="card-content">
            <slot></slot>
        </div>
    </div>
</template>

<script setup>
defineProps({
    title: {
        type: String,
        required: true
    }
})
</script>

<style scoped>
.home-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 32px;
    width: 90%;
    max-width: 700px;
    display: flex;
    align-items: stretch;
    gap: 24px;
}

.card-title {
    width: 20%;
    min-width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    padding-right: 20px;
}

.card-title h3 {
    color: #ffffff;
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    writing-mode: horizontal-tb;
    letter-spacing: 0.5px;
    text-align: center;
}

.card-content {
    width: 80%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 20px;
    gap: 5px;
}

/* 平板和手机响应式 */
@media (max-width: 768px) {
    .home-card {
        padding: 24px;
        gap: 16px;
        width: 95%;
        flex-direction: column;
        align-items: flex-start;
    }

    .card-title {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0 0 12px 0;
        justify-content: flex-start;
    }

    .card-title h3 {
        font-size: 18px;
        text-align: left;
    }

    .card-content {
        width: 100%;
        padding-left: 0;
        gap: 8px;
    }
}

@media (max-width: 480px) {
    .home-card {
        padding: 16px;
        gap: 12px;
        width: 100%;
        border-radius: 8px;
        margin: 0 5px;
    }

    .card-title h3 {
        font-size: 16px;
    }

    .card-content {
        gap: 4px;
    }
}
</style>
