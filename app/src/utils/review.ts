// Révision espacée des questions du quiz (FSRS via ts-fsrs)
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs'

import type { Lesson, QuizQuestion, Subject } from '@/db'

/** État de révision d'une question (date de la prochaine révision comprise) */
export type ReviewState = Card

// Réglages standard (90 % de rappel visé) avec un léger flou sur les dates.
// enable_short_term: false : une question ratée revient le lendemain, pas dans une minute.
const scheduler = fsrs({ enable_fuzz: true, enable_short_term: false })

export function newReviewState(now = new Date()): ReviewState {
  return createEmptyCard(now)
}

/** Nouvel état après la première réponse d'une série : réussie → « Bien », ratée → « À revoir » */
export function rateAnswer(state: ReviewState, correct: boolean, now = new Date()): ReviewState {
  return scheduler.next(state, now, correct ? Rating.Good : Rating.Again).card
}

/** « À réviser aujourd'hui » : tout ce qui est prévu avant minuit */
export function endOfDay(now = new Date()): Date {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return end
}

export interface DueGroup {
  subject: Subject
  lessons: { lesson: Lesson; count: number }[]
}

/**
 * Questions à revoir, regroupées par matière puis par leçon (jamais mélangées) :
 * matières dans l'ordre de la liste, leçons de la plus récente à la plus ancienne.
 */
export function groupDueByLesson(
  dueQuestions: Pick<QuizQuestion, 'lessonId'>[],
  lessons: Lesson[],
  subjects: Subject[],
): DueGroup[] {
  const counts = new Map<number, number>()
  for (const question of dueQuestions) {
    counts.set(question.lessonId, (counts.get(question.lessonId) ?? 0) + 1)
  }
  return subjects
    .map((subject) => ({
      subject,
      lessons: lessons
        .filter((lesson) => lesson.subjectId === subject.id && counts.has(lesson.id))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((lesson) => ({ lesson, count: counts.get(lesson.id) ?? 0 })),
    }))
    .filter((group) => group.lessons.length)
}
