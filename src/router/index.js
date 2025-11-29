import { createRouter, createWebHistory } from 'vue-router'
import home from '../views/home.vue'
import tutorial from '../views/tutorial.vue'
import social from '../views/social.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: home
  },
  {
    path: '/tutorial',
    name: 'tutorial',
    component: tutorial
  },
  {
    path: '/social',
    name: 'social',
    component: social
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router