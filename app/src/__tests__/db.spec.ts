import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  SUBJECT_CATALOG,
  db,
  deleteLesson,
  deleteSubject,
  saveGeneratedContent,
  saveLessonEdits,
} from '@/db'
import { newReviewState } from '@/utils/review'

const reviewFields = () => {
  const review = newReviewState()
  return { review, due: review.due }
}

async function addLessonWithContent(subjectId: number) {
  const lessonId = await db.lessons.add({
    subjectId,
    title: 'Leçon',
    sourceText: 'Texte',
    createdAt: new Date(),
  })
  await db.sheets.add({ lessonId, content: { summary: ['Phrase.'], definitions: [] } })
  await db.quizQuestions.add({
    lessonId,
    type: 'true-false',
    question: 'Question ?',
    choices: ['Vrai', 'Faux'],
    answer: 0,
    explanation: 'Explication.',
    ...reviewFields(),
  })
  return lessonId
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
    expect(await db.quizQuestions.count()).toBe(1)
    expect((await db.lessons.toArray())[0]?.subjectId).toBe(second.id)
  })

  it('supprime une leçon avec sa fiche et ses questions', async () => {
    const kept = await addLessonWithContent(1)
    const removed = await addLessonWithContent(1)

    await deleteLesson(removed)

    expect(await db.lessons.get(removed)).toBeUndefined()
    expect(await db.lessons.get(kept)).toBeDefined()
    expect(await db.sheets.count()).toBe(1)
    expect(await db.quizQuestions.count()).toBe(1)
  })

  it('enregistre les corrections en gardant les ids des questions conservées', async () => {
    const lessonId = await addLessonWithContent(1)
    const removedId = await db.quizQuestions.add({
      lessonId,
      type: 'true-false',
      question: 'À supprimer',
      choices: ['Vrai', 'Faux'],
      answer: 0,
      explanation: '-',
      ...reviewFields(),
    })
    const question = (await db.quizQuestions.where('lessonId').equals(lessonId).toArray()).find(
      (q) => q.id !== removedId,
    )
    if (!question) throw new Error('contenu manquant')

    await saveLessonEdits(lessonId, {
      title: 'Titre corrigé',
      sourceText: 'Texte corrigé',
      sheet: { summary: ['Phrase corrigée.'], definitions: [] },
      quiz: [{ ...question, answer: 1 }],
    })

    expect(await db.lessons.get(lessonId)).toMatchObject({
      title: 'Titre corrigé',
      sourceText: 'Texte corrigé',
    })
    const sheet = await db.sheets.where('lessonId').equals(lessonId).first()
    expect(sheet?.content.summary).toEqual(['Phrase corrigée.'])
    expect(await db.quizQuestions.get(question.id)).toMatchObject({ answer: 1 })
    expect(await db.quizQuestions.get(removedId)).toBeUndefined()
  })

  it('convertit les anciennes fiches à points clés en résumé (version 2)', async () => {
    db.close()
    await Dexie.delete('levelup')
    const v1 = new Dexie('levelup')
    v1.version(1).stores({ sheets: '++id, &lessonId' })
    await v1.table('sheets').add({
      lessonId: 1,
      content: {
        keyPoints: [{ text: 'Un mulet est stérile.', example: 'Le mulet.' }, { text: 'Fin.' }],
        definitions: [{ term: 'Stérile', definition: 'Incapable d’avoir des descendants.' }],
      },
    })
    v1.close()

    await db.open()
    const sheet = await db.sheets.where('lessonId').equals(1).first()
    expect(sheet?.content).toEqual({
      summary: ['Un mulet est stérile. Par exemple : Le mulet.', 'Fin.'],
      definitions: [{ term: 'Stérile', definition: 'Incapable d’avoir des descendants.' }],
    })
  })

  it('supprime la table des flashcards en gardant le reste (version 3)', async () => {
    db.close()
    await Dexie.delete('levelup')
    const v2 = new Dexie('levelup')
    v2.version(2).stores({ lessons: '++id', cards: '++id, lessonId, due' })
    await v2.table('lessons').add({ title: 'Gardée' })
    await v2.table('cards').add({ lessonId: 1, front: 'Recto', back: 'Verso', due: new Date() })
    v2.close()

    await db.open()
    expect(db.tables.map((table) => table.name)).not.toContain('cards')
    expect((await db.lessons.toArray()).map((lesson) => lesson.title)).toEqual(['Gardée'])
  })

  it('remplace le contenu généré d’une leçon', async () => {
    const lessonId = await addLessonWithContent(1)
    await saveGeneratedContent(lessonId, {
      sheet: { summary: ['Nouveau.'], definitions: [] },
      quiz: [],
    })

    const sheets = await db.sheets.where('lessonId').equals(lessonId).toArray()
    expect(sheets.map((s) => s.content.summary)).toEqual([['Nouveau.']])
    expect(await db.quizQuestions.where('lessonId').equals(lessonId).count()).toBe(0)
  })
})
