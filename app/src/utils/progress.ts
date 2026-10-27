// Expérience, niveaux (une queue de kitsuné par niveau) et progression par leçon
import type { QuizQuestion } from '@/db'

/** Barème : tout effort rapporte, rien ne fait perdre d'XP */
export const XP = {
  firstTry: 10,
  missed: 3,
  retry: 2,
  seriesDone: 20,
} as const

export const MAX_LEVEL = 9

/** XP totale pour atteindre chaque niveau (index 0 = niveau 1) : 150, 450, 900… */
export const LEVEL_XP = Array.from({ length: MAX_LEVEL }, (_, i) => 75 * (i + 1) * i)

/** XP d'une réponse ; le second passage d'une question ratée rapporte un petit bonus */
export function answerXp(correct: boolean, retry: boolean): number {
  if (retry) return XP.retry
  return correct ? XP.firstTry : XP.missed
}

export interface LevelInfo {
  level: number
  /** XP encore nécessaire pour la queue suivante, null au niveau maximum */
  toNext: number | null
  /** Avancement dans le niveau en cours, de 0 à 1 */
  progress: number
}

export function levelInfo(xp: number): LevelInfo {
  const level = LEVEL_XP.filter((threshold) => xp >= threshold).length
  const start = LEVEL_XP[level - 1] ?? 0
  const end = LEVEL_XP[level]
  if (end === undefined) return { level, toNext: null, progress: 1 }
  return { level, toNext: end - xp, progress: (xp - start) / (end - start) }
}

export interface LessonProgress {
  /** Questions dont la dernière réponse était juste */
  succeeded: number
  total: number
}

/** Progression de chaque leçon qui a des questions */
export function progressByLesson(
  questions: Pick<QuizQuestion, 'lessonId' | 'lastCorrect'>[],
): Map<number, LessonProgress> {
  const result = new Map<number, LessonProgress>()
  for (const question of questions) {
    const entry = result.get(question.lessonId) ?? { succeeded: 0, total: 0 }
    entry.total++
    if (question.lastCorrect) entry.succeeded++
    result.set(question.lessonId, entry)
  }
  return result
}

export function progressText({ succeeded, total }: LessonProgress): string {
  const plural = succeeded > 1 ? 's' : ''
  return `${succeeded} question${plural} réussie${plural} sur ${total}`
}
