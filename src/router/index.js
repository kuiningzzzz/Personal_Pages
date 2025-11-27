import { createRouter, createWebHistory } from 'vue-router'
import home from '../views/home.vue'
import tutorial from '../views/tutorial.vue'

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
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router