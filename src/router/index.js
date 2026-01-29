import { createRouter, createWebHistory } from 'vue-router'
import home from '../views/home.vue'
import tutorial from '../views/tutorial.vue'
import social from '../views/social.vue'
import project from '../views/project.vue'
import resource from '../views/resource.vue'
import markdownViewer from '../views/markdown_viewer.vue'
import emojiViewer from '../views/emoji_viewer.vue'
import admin from '../views/admin.vue'

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
    path: '/project',
    name: 'project',
    component: project
  },
  {
    path: '/resource',
    name: 'resource',
    component: resource
  },
  {
    path: '/social',
    name: 'social',
    component: social
  },
  {
    path: '/article',
    name: 'article',
    component: markdownViewer
  },
  {
    path: '/emoji-viewer',
    name: 'emoji-viewer',
    component: emojiViewer
  },
  {
    path: '/admin',
    name: 'admin',
    component: admin
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
