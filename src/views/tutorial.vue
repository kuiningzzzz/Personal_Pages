<script setup>
import CommentArea from '../components/comment_area.vue'
</script>

<template>
    <div class="tutorial-container">
        <h1>Welcome to the Tutorial Page</h1>
        <p>This is the tutorial view of the application.</p>
        
        <CommentArea pageId="tutorial" />
    </div>
</template>

<style scoped>
.tutorial-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 20px;
}

h1 {
    color: #ffffff;
    font-size: 32px;
    font-weight: 500;
}

p {
    color: #b8c5d6;
    font-size: 16px;
    line-height: 1.6;
}
</style>