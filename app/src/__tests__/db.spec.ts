import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { SUBJECT_CATALOG, db, deleteSubject } from '@/db'

async function addLessonWithContent(subjectId: number) {
  const lessonId = await db.lessons.add({
    subjectId,
    title: 'Leçon',
    sourceText: 'Texte',
    createdAt: new Date(),
  })
  await db.sheets.add({ lessonId, content: 'Fiche' })
  await db.cards.add({ lessonId, front: 'Recto', back: 'Verso', due: new Date() })
  await db.quizQuestions.add({
    lessonId,
    type: 'true-false',
    question: 'Question ?',
    choices: ['Vrai', 'Faux'],
    answer: 0,
    explanation: 'Explication.',
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('base locale', () => {
  it('crée les matières de 6e au premier lancement', async () => {
    const names = (await db.subjects.toArray()).map((s) => s.name)
    expect(names).toEqual(SUBJECT_CATALOG.filter((s) => s.preset).map((s) => s.name))
  })

  it('supprime une matière avec tout son contenu, sans toucher aux autres', async () => {
    const [first, second] = await db.subjects.toArray()
    if (!first || !second) throw new Error('matières pré-remplies manquantes')
    await addLessonWithContent(first.id)
    await addLessonWithContent(first.id)
    await addLessonWithContent(second.id)

    await deleteSubject(first.id)

    expect(await db.subjects.get(first.id)).toBeUndefined()
    expect(await db.lessons.count()).toBe(1)
    expect(await db.sheets.count()).toBe(1)
    expect(await db.cards.count()).toBe(1)
    expect(await db.quizQuestions.count()).toBe(1)
    expect((await db.lessons.toArray())[0]?.subjectId).toBe(second.id)
  })
})
