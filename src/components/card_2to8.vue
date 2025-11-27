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
    display: flex;
    align-items: stretch;
    gap: 24px;
}

.card-title {
    width: 20%;
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
}

.card-content {
    width: 80%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 20px;
    gap: 5px;
}
</style>
