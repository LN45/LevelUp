import { createRouter, createWebHashHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import SettingsView from '@/views/SettingsView.vue'
import SubjectsSettingsView from '@/views/SubjectsSettingsView.vue'
import SubjectsView from '@/views/SubjectsView.vue'

// Mode hash : GitHub Pages ne sait pas servir les routes côté serveur.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/subjects', name: 'subjects', component: SubjectsView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/settings/subjects', name: 'settings-subjects', component: SubjectsSettingsView },
  ],
})

export default router
