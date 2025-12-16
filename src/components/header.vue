<template>
    <header class="header-banner">
        <router-link to="/" class="logo"><h1>奎宁zzzz</h1></router-link>
        <button class="menu-toggle" @click="mobileMenuOpen = !mobileMenuOpen" v-if="isMobile">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
        </button>
        <nav :class="['nav-menu', { active: mobileMenuOpen }]">
            <router-link to="/" @click="mobileMenuOpen = false">Index</router-link>
            <router-link to="/tutorial" @click="mobileMenuOpen = false">Tutorial</router-link>
            <router-link to="/social" @click="mobileMenuOpen = false">Social</router-link>
        </nav>
    </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const mobileMenuOpen = ref(false)
const isMobile = ref(false)

const checkMobile = () => {
    isMobile.value = window.innerWidth <= 768
    if (isMobile.value === false) {
        mobileMenuOpen.value = false
    }
}

onMounted(() => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
    window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.header-banner {
    border-radius: 12px;
    backdrop-filter: blur(16px);
    color: white;
    padding: 16px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
}

.logo {
    text-decoration: none;
}

h1 {
    color: #e8edf5;
    margin: 0;
    margin-left: 15px;
    font-size: 26px;
    font-weight: 500;
    letter-spacing: 0.5px;
}

nav {
    display: flex;
    gap: 20px;
}

nav a {
    color: #d1d9e6;
    text-decoration: none;
    padding: 8px 18px;
    border-radius: 6px;
    transition: all 0.25s ease;
    position: relative;
}

nav a:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #e8edf5;
}

nav a.router-link-active {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    font-weight: 500;
}

/* 菜单按钮 */
.menu-toggle {
    display: none;
    background: none;
    border: none;
    color: #e8edf5;
    cursor: pointer;
    padding: 8px;
    transition: all 0.25s ease;
}

.menu-toggle:hover {
    color: #ffffff;
}

/* 平板和手机响应式 */
@media (max-width: 768px) {
    .header-banner {
        padding: 12px 16px;
    }

    h1 {
        font-size: 20px;
        margin-left: 10px;
    }

    .menu-toggle {
        display: block;
    }

    .nav-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: rgba(15, 20, 25, 0.95);
        backdrop-filter: blur(16px);
        flex-direction: column;
        gap: 0;
        display: none;
        border-radius: 0 0 12px 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-top: none;
        margin-top: 0;
        z-index: 100;
    }

    .nav-menu.active {
        display: flex;
    }

    nav a {
        padding: 12px 16px;
        border-radius: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    nav a:last-child {
        border-bottom: none;
    }

    nav a:hover {
        background: rgba(255, 255, 255, 0.1);
    }
}

@media (max-width: 480px) {
    h1 {
        font-size: 18px;
        margin-left: 5px;
    }

    .header-banner {
        padding: 10px 12px;
    }
}
</style>
