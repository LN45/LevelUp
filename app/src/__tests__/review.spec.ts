import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'

import { db, dueQuestions, recordQuizAnswer, type Lesson, type Subject } from '@/db'
import { endOfDay, groupDueByLesson, newReviewState, rateAnswer } from '@/utils/review'

const DAY = 24 * 3600 * 1000
const NOW = new Date('2026-10-28T10:00:00')

async function addQuestion(lessonId: number, due = NOW) {
  const review = { ...newReviewState(NOW), due }
  return db.quizQuestions.add({
    lessonId,
    type: 'true-false',
    question: 'Question',
    choices: ['Vrai', 'Faux'],
    answer: 0,
    explanation: 'Explication.',
    review,
    due,
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('révision espacée', () => {
  it('une nouvelle question est à revoir tout de suite', () => {
    expect(newReviewState(NOW).due).toEqual(NOW)
  })

  it('une question ratée revient le lendemain, une question réussie plus tard', () => {
    const missed = rateAnswer(newReviewState(NOW), false, NOW)
    const known = rateAnswer(newReviewState(NOW), true, NOW)
    expect(missed.due.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(DAY * 0.9)
    expect(missed.due.getTime() - NOW.getTime()).toBeLessThanOrEqual(DAY * 1.5)
    expect(known.due.getTime()).toBeGreaterThan(missed.due.getTime())
  })

  it('espace de plus en plus une question toujours réussie', () => {
    let state = newReviewState(NOW)
    let now = NOW
    const intervals: number[] = []
    for (let i = 0; i < 3; i++) {
      const next = rateAnswer(state, true, now)
      intervals.push(next.due.getTime() - now.getTime())
      now = next.due
      state = next
    }
    expect(intervals[1]).toBeGreaterThan(intervals[0] as number)
    expect(intervals[2]).toBeGreaterThan(intervals[1] as number)
  })

  it('« aujourd’hui » va jusqu’à minuit', () => {
    const end = endOfDay(NOW)
    expect(end.getDate()).toBe(NOW.getDate())
    expect(end.getHours()).toBe(23)
  })
})

describe('questions à revoir', () => {
  it('ne propose que les questions dues aujourd’hui de la leçon', async () => {
    await addQuestion(1, NOW)
    await addQuestion(1, new Date(NOW.getTime() + 5 * 3600 * 1000)) // ce soir : due
    await addQuestion(1, new Date(NOW.getTime() + 2 * DAY)) // dans 2 jours : pas encore
    await addQuestion(2, NOW) // autre leçon
    expect(await dueQuestions(1, NOW)).toHaveLength(2)
  })

  it('enregistre une réponse et repousse la question', async () => {
    const id = await addQuestion(1, NOW)
    await recordQuizAnswer(id, true, NOW)
    const question = await db.quizQuestions.get(id)
    expect(question?.due.getTime()).toBeGreaterThan(endOfDay(NOW).getTime())
    expect(question?.review.reps).toBe(1)
    expect(await dueQuestions(1, NOW)).toHaveLength(0)
  })

  it('regroupe par matière puis par leçon, sans les mélanger', () => {
    const subject = (id: number, name: string) => ({ id, name }) as Subject
    const lesson = (id: number, subjectId: number, day: number) =>
      ({ id, subjectId, title: `Leçon ${id}`, createdAt: new Date(2026, 9, day) }) as Lesson
    const groups = groupDueByLesson(
      [{ lessonId: 1 }, { lessonId: 1 }, { lessonId: 2 }, { lessonId: 3 }],
      [lesson(1, 10, 1), lesson(2, 10, 5), lesson(3, 20, 3), lesson(4, 20, 4)],
      [subject(10, 'Sciences'), subject(20, 'Histoire'), subject(30, 'Anglais')],
    )
    expect(
      groups.map((g) => [g.subject.name, g.lessons.map((l) => [l.lesson.id, l.count])]),
    ).toEqual([
      [
        'Sciences',
        [
          [2, 1],
          [1, 2],
        ],
      ],
      ['Histoire', [[3, 1]]],
    ])
  })

  it('donne un état de révision aux questions existantes (version 4)', async () => {
    db.close()
    await Dexie.delete('levelup')
    const v3 = new Dexie('levelup')
    v3.version(3).stores({ quizQuestions: '++id, lessonId' })
    await v3.table('quizQuestions').add({ lessonId: 1, question: 'Ancienne question' })
    v3.close()

    await db.open()
    const [question] = await db.quizQuestions.toArray()
    expect(question?.review.reps).toBe(0)
    expect(question?.due).toBeInstanceOf(Date)
    expect(await dueQuestions(1)).toHaveLength(1)
  })
})
