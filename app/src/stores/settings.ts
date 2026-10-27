import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { watchEffect } from 'vue'

export const FONTS = ['luciole', 'opendyslexic'] as const
export const FONT_SIZES = [18, 20, 22, 24] as const
export const LINE_HEIGHTS = [1.5, 1.8, 2.1] as const
export const SPEECH_RATES = ['normal', 'slow'] as const
export const AUTO_SPEAK = [false, true] as const
export const NICKNAME_MAX_LENGTH = 30

export interface Settings {
  font: (typeof FONTS)[number]
  fontSize: (typeof FONT_SIZES)[number]
  lineHeight: (typeof LINE_HEIGHTS)[number]
  speechRate: (typeof SPEECH_RATES)[number]
  /** Lit automatiquement les questions du quiz quand elles s'affichent */
  autoSpeak: boolean
  /** null : jamais demandé ; '' : l'élève a choisi « plus tard » */
  nickname: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  font: 'luciole',
  fontSize: 20,
  lineHeight: 1.5,
  speechRate: 'normal',
  autoSpeak: false,
  nickname: null,
}

const FONT_STACKS: Record<Settings['font'], string> = {
  luciole: "'Luciole', system-ui, sans-serif",
  opendyslexic: "'OpenDyslexic', 'Luciole', system-ui, sans-serif",
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Relit les réglages stockés en remplaçant toute valeur absente ou invalide par sa valeur par défaut */
export function parseSettings(raw: string | null): Settings {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw ?? 'null')
  } catch {
    // stockage corrompu : on repart des valeurs par défaut
  }
  return normalizeSettings(parsed)
}

/** Réglages valides à partir de n'importe quelle valeur (stockage, sauvegarde importée) */
export function normalizeSettings(value: unknown): Settings {
  const data = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>

  return {
    font: pick(data.font, FONTS, DEFAULT_SETTINGS.font),
    fontSize: pick(data.fontSize, FONT_SIZES, DEFAULT_SETTINGS.fontSize),
    lineHeight: pick(data.lineHeight, LINE_HEIGHTS, DEFAULT_SETTINGS.lineHeight),
    speechRate: pick(data.speechRate, SPEECH_RATES, DEFAULT_SETTINGS.speechRate),
    autoSpeak: pick(data.autoSpeak, AUTO_SPEAK, DEFAULT_SETTINGS.autoSpeak),
    nickname:
      typeof data.nickname === 'string'
        ? data.nickname.trim().slice(0, NICKNAME_MAX_LENGTH)
        : DEFAULT_SETTINGS.nickname,
  }
}

export const useSettingsStore = defineStore('settings', () => {
  // localStorage plutôt que Dexie : lecture synchrone, donc la bonne police dès l'affichage
  const settings = useLocalStorage<Settings>(
    'levelup:settings',
    { ...DEFAULT_SETTINGS },
    {
      serializer: { read: parseSettings, write: JSON.stringify },
    },
  )

  watchEffect(() => {
    const style = document.documentElement.style
    style.setProperty('--font-family', FONT_STACKS[settings.value.font])
    style.setProperty('--font-size-base', `${settings.value.fontSize}px`)
    style.setProperty('--line-height', String(settings.value.lineHeight))
  })

  return { settings }
})
