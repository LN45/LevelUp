import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'

import { addXp, db, recordQuizAnswer, totalXp } from '@/db'
import {
  LEVEL_XP,
  MAX_LEVEL,
  XP,
  answerXp,
  levelInfo,
  progressByLesson,
  progressText,
} from '@/utils/progress'
import { newReviewState, rateAnswer } from '@/utils/review'

const NOW = new Date('2026-10-28T10:00:00')

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('niveaux', () => {
  it('a 9 niveaux de plus en plus longs à atteindre', () => {
    expect(LEVEL_XP).toEqual([0, 150, 450, 900, 1500, 2250, 3150, 4200, 5400])
  })

  it('calcule le niveau et ce qu’il manque pour la queue suivante', () => {
    expect(levelInfo(0)).toEqual({ level: 1, toNext: 150, progress: 0 })
    expect(levelInfo(300)).toEqual({ level: 2, toNext: 150, progress: 0.5 })
    expect(levelInfo(450).level).toBe(3)
  })

  it('reste au niveau 9 au-delà du dernier seuil', () => {
    expect(levelInfo(99999)).toEqual({ level: MAX_LEVEL, toNext: null, progress: 1 })
  })

  it('récompense chaque réponse, même ratée', () => {
    expect(answerXp(true, false)).toBe(XP.firstTry)
    expect(answerXp(false, false)).toBe(XP.missed)
    expect(answerXp(false, true)).toBe(XP.retry)
    expect(Object.values(XP).every((amount) => amount > 0)).toBe(true)
  })
})

describe('progression par leçon', () => {
  it('compte les questions réussies à la dernière réponse, leçon par leçon', () => {
    const progress = progressByLesson([
      { lessonId: 1, lastCorrect: true },
      { lessonId: 1, lastCorrect: false },
      { lessonId: 1 }, // jamais répondue
      { lessonId: 2, lastCorrect: true },
    ])
    expect(progress.get(1)).toEqual({ succeeded: 1, total: 3 })
    expect(progress.get(2)).toEqual({ succeeded: 1, total: 1 })
    expect(progress.has(3)).toBe(false)
  })

  it('accorde le texte', () => {
    expect(progressText({ succeeded: 1, total: 9 })).toBe('1 question réussie sur 9')
    expect(progressText({ succeeded: 7, total: 9 })).toBe('7 questions réussies sur 9')
  })
})

describe('expérience enregistrée', () => {
  async function addLessonWithQuestion() {
    const lessonId = await db.lessons.add({
      subjectId: 3,
      title: 'Leçon',
      sourceText: 'Texte',
      createdAt: NOW,
    })
    const review = newReviewState(NOW)
    const questionId = await db.quizQuestions.add({
      lessonId,
      type: 'true-false',
      question: 'Question ?',
      choices: ['Vrai', 'Faux'],
      answer: 0,
      explanation: '',
      review,
      due: review.due,
    })
    return { lessonId, questionId }
  }

  it('donne l’XP d’une réponse avec la matière de la leçon', async () => {
    const { lessonId, questionId } = await addLessonWithQuestion()
    await recordQuizAnswer(questionId, false, NOW)
    await addXp(lessonId, XP.seriesDone, NOW)
    expect(await totalXp()).toBe(XP.missed + XP.seriesDone)
    expect((await db.quizQuestions.get(questionId))?.lastCorrect).toBe(false)
    expect((await db.xp.toArray()).every((entry) => entry.subjectId === 3)).toBe(true)
  })

  it('garde l’XP quand la leçon est supprimée', async () => {
    const { lessonId, questionId } = await addLessonWithQuestion()
    await recordQuizAnswer(questionId, true, NOW)
    expect((await db.quizQuestions.get(questionId))?.lastCorrect).toBe(true)
    await db.lessons.delete(lessonId)
    expect(await totalXp()).toBe(XP.firstTry)
  })

  it('compte les révisions déjà faites (version 5)', async () => {
    db.close()
    await Dexie.delete('levelup')
    const v4 = new Dexie('levelup')
    v4.version(4).stores({ lessons: '++id', quizQuestions: '++id, lessonId, due' })
    await v4.table('lessons').add({ subjectId: 7, title: 'Ancienne' })
    await v4.table('lessons').add({ subjectId: 8, title: 'Jamais révisée' })
    const reviewed = rateAnswer(rateAnswer(newReviewState(NOW), true, NOW), false, NOW)
    await v4.table('quizQuestions').bulkAdd([
      { lessonId: 1, review: reviewed, due: reviewed.due },
      { lessonId: 2, review: newReviewState(NOW), due: NOW },
    ])
    v4.close()

    await db.open()
    const entries = await db.xp.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ lessonId: 1, subjectId: 7, amount: 2 * XP.firstTry })
  })
})
