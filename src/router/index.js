import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/home.vue'
import Moments from '../views/moments.vue'
import Resource from '../views/resource.vue'
import Activities from '../views/activities.vue'
import Entry from '../views/entry.vue'
import Admin from '../views/admin.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/moments', component: Moments },
  { path: '/resource', component: Resource },
  { path: '/resource/collection/:collectionId', component: Resource },
  { path: '/resource/gallery/:id', component: Entry },
  { path: '/activities', component: Activities },
  { path: '/entry/:id', component: Entry },
  { path: '/admin', component: Admin },
  { path: '/tutorial', redirect: '/moments' },
  { path: '/project', redirect: '/resource' },
  { path: '/social', redirect: '/' },
  { path: '/article', redirect: '/moments' },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

export default createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) { return savedPosition || { top: 0 } }
})
