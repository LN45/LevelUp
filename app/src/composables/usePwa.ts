import { useLocalStorage, useMediaQuery } from '@vueuse/core'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { computed, shallowRef } from 'vue'

/** Événement d'installation de Chrome (Android), absent des types du DOM */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// État partagé, créé au chargement : Chrome n'envoie l'événement qu'une fois, parfois très tôt
const installEvent = shallowRef<BeforeInstallPromptEvent | null>(null)
window.addEventListener('beforeinstallprompt', (event) => {
  // Remplace la petite barre de Chrome par notre propre invitation
  event.preventDefault()
  installEvent.value = event as BeforeInstallPromptEvent
})
window.addEventListener('appinstalled', () => (installEvent.value = null))

const isStandalone = useMediaQuery('(display-mode: standalone)')
// iPad récents : se présentent comme un Mac, mais tactile
const isIos =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true

const installDismissed = useLocalStorage('levelup:install-dismissed', false)

// Mode « prompt » : la nouvelle version attend que l'élève accepte, ou le prochain lancement
const { needRefresh, updateServiceWorker } = useRegisterSW()

export function usePwa() {
  return {
    /** Android : la fenêtre d'installation de Chrome est disponible */
    canPrompt: computed(() => installEvent.value !== null),
    /** iPhone ou iPad, appli pas encore installée : il faut passer par le menu Partager */
    showIosHint: computed(() => isIos && !iosStandalone && !isStandalone.value),
    /** « Plus tard » touché sur l'accueil */
    installDismissed,
    async install() {
      const event = installEvent.value
      if (!event) return
      await event.prompt()
      await event.userChoice
      installEvent.value = null
    },
    needRefresh,
    update: () => updateServiceWorker(),
  }
}
