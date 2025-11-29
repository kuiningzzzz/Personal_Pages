<template>
    < class="social-container">
        <div class="social-header">
            <h1>Social Contact & Entertainment</h1>
            <p>Keep your spirit free</p>
        </div>
        <FriendCard title="test" desc="test2" link="/" />

</template>

<script setup>
import FriendCard from '../components/friend_card.vue'
</script>


<style scoped>
.social-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
}

.social-header {
    width: 90%;
    text-align: center;
}

h1 {
    color: #ffffff;
    font-size: 32px;
    font-weight: 500;
    margin-bottom: 20px;
}

p {
    color: #b8c5d6;
    font-size: 16px;
    line-height: 1.6;
    margin: 10px 0;
}
</style>