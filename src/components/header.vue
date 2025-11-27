<template>
    <header class="header-banner">
        <h1>奎宁zzzz</h1>
        <nav>
            <router-link to="/">首页</router-link>
            <router-link to="/tutorial">教程</router-link>
        </nav>
    </header>
</template>

<style scoped>
.header-banner {
    background-color: #102e88;
    color: white;
    padding: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

h1 {
    color: white;
    margin: 0;
    font-size: 24px;
}

nav {
    display: flex;
    gap: 20px;
}

nav a {
    color: white;
    text-decoration: none;
    padding: 8px 16px;
    border-radius: 4px;
    transition: background-color 0.3s;
}

nav a:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

nav a.router-link-active {
    background-color: rgba(255, 255, 255, 0.2);
    font-weight: bold;
}
</style>
