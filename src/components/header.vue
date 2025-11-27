<template>
    <header class="header-banner">
        <router-link to="/" class="logo">
            <h1>奎宁zzzz</h1>
        </router-link>
        <nav>
            <router-link to="/">首页</router-link>
            <router-link to="/tutorial">教程</router-link>
        </nav>
    </header>
</template>

<style scoped>
.header-banner {
    border-radius: 12px;

    backdrop-filter: blur(16px);

    color: white;
    padding: 16px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
h1 {
    color: #e8edf5;
    margin: 0;
    margin-left: 15px;
    font-size: 26px;
    font-weight: 500;
    letter-spacing: 0.5px;
}

.logo {
    text-decoration: none;
    transition: opacity 0.25s ease;
}

.logo:hover {
    opacity: 0.8;
}

nav {
    display: flex;
    gap: 20px;
}   display: flex;
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
</style>
