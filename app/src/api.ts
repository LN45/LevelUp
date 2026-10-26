import type { GeneratedContent } from './db'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN ?? ''

/** Même limite que l'API (api/src/extract.ts) */
export const MAX_IMAGES = 6

export interface ImagePayload {
  mediaType: 'image/jpeg'
  /** Contenu encodé en base64 */
  data: string
}

const ERROR_MESSAGES = {
  network: 'Pas de connexion internet. Vérifie le Wi-Fi, puis réessaie.',
  quota_exceeded: 'On a beaucoup travaillé aujourd’hui ! Réessaie demain.',
  illegible:
    'Je n’arrive pas à lire les photos. Essaie avec plus de lumière, le cahier bien à plat.',
  ai_failed: 'Je n’ai pas réussi cette fois. Réessaie dans un moment.',
  invalid_request: 'Ce cours est trop court (ou trop long) pour que je puisse travailler dessus.',
  payload_too_large: 'Les photos sont trop lourdes. Essaie avec moins de photos.',
  unauthorized: 'L’appli n’est pas bien configurée. Demande à un adulte de vérifier le jeton.',
  unknown: 'Oups, un problème est survenu. Réessaie.',
} as const

export type ApiErrorCode = keyof typeof ERROR_MESSAGES

export class ApiError extends Error {
  override name = 'ApiError'

  constructor(readonly code: ApiErrorCode) {
    super(ERROR_MESSAGES[code])
  }
}

/** Traduit le code d'erreur renvoyé par l'API en code connu de l'appli */
export function toErrorCode(error: unknown): ApiErrorCode {
  return typeof error === 'string' && error in ERROR_MESSAGES ? (error as ApiErrorCode) : 'unknown'
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${APP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network')
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const code = typeof data === 'object' && data !== null && 'error' in data ? data.error : null
    throw new ApiError(toErrorCode(code))
  }
  return response.json() as Promise<T>
}

export function extractCourse(images: ImagePayload[]): Promise<{ title: string; text: string }> {
  return post('/extract', { images })
}

/** Fiche, flashcards et quiz d'une leçon (aucune donnée personnelle envoyée) */
export function generateLesson(course: {
  title: string
  subject: string
  text: string
}): Promise<GeneratedContent> {
  return post('/generate', course)
}
