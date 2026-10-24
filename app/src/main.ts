import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './styles/main.css'

import App from './App.vue'
import { requestPersistentStorage } from './db'
import router from './router'

void requestPersistentStorage()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
