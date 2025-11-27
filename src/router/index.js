import { createRouter, createWebHistory } from 'vue-router'
import home from '../views/home.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: home
  },
  {
    path: '/tutorial',
    name: 'tutorial',
    component: () => import('../views/tutorial.vue') 
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router