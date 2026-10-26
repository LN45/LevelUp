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

async function addLessonWithContent(subjectId: number) {
  const lessonId = await db.lessons.add({
    subjectId,
    title: 'Leçon',
    sourceText: 'Texte',
    createdAt: new Date(),
  })
  await db.sheets.add({ lessonId, content: { summary: ['Phrase.'], definitions: [] } })
  await db.cards.add({ lessonId, front: 'Recto', back: 'Verso', due: new Date() })
  await db.quizQuestions.add({
    lessonId,
    type: 'true-false',
    question: 'Question ?',
    choices: ['Vrai', 'Faux'],
    answer: 0,
    explanation: 'Explication.',
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
    expect(await db.cards.count()).toBe(1)
    expect(await db.quizQuestions.count()).toBe(1)
    expect((await db.lessons.toArray())[0]?.subjectId).toBe(second.id)
  })

  it('supprime une leçon avec sa fiche, ses cartes et ses questions', async () => {
    const kept = await addLessonWithContent(1)
    const removed = await addLessonWithContent(1)

    await deleteLesson(removed)

    expect(await db.lessons.get(removed)).toBeUndefined()
    expect(await db.lessons.get(kept)).toBeDefined()
    expect(await db.sheets.count()).toBe(1)
    expect(await db.cards.count()).toBe(1)
    expect(await db.quizQuestions.count()).toBe(1)
  })

  it('enregistre les corrections en gardant les ids des cartes et questions conservées', async () => {
    const lessonId = await addLessonWithContent(1)
    await db.cards.add({ lessonId, front: 'À supprimer', back: '-', due: new Date() })
    const [card] = await db.cards.where('lessonId').equals(lessonId).toArray()
    const [question] = await db.quizQuestions.where('lessonId').equals(lessonId).toArray()
    if (!card || !question) throw new Error('contenu manquant')

    await saveLessonEdits(lessonId, {
      title: 'Titre corrigé',
      sourceText: 'Texte corrigé',
      sheet: { summary: ['Phrase corrigée.'], definitions: [] },
      cards: [{ ...card, back: 'Verso corrigé' }],
      quiz: [{ ...question, answer: 1 }],
    })

    expect(await db.lessons.get(lessonId)).toMatchObject({
      title: 'Titre corrigé',
      sourceText: 'Texte corrigé',
    })
    const sheet = await db.sheets.where('lessonId').equals(lessonId).first()
    expect(sheet?.content.summary).toEqual(['Phrase corrigée.'])
    const cards = await db.cards.where('lessonId').equals(lessonId).toArray()
    expect(cards).toEqual([{ ...card, back: 'Verso corrigé' }])
    expect(await db.quizQuestions.get(question.id)).toMatchObject({ answer: 1 })
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

  it('remplace le contenu généré d’une leçon, cartes à réviser tout de suite', async () => {
    const lessonId = await addLessonWithContent(1)
    await saveGeneratedContent(lessonId, {
      sheet: { summary: ['Nouveau.'], definitions: [] },
      flashcards: [
        { front: 'A', back: '1' },
        { front: 'B', back: '2' },
      ],
      quiz: [],
    })

    const sheets = await db.sheets.where('lessonId').equals(lessonId).toArray()
    expect(sheets.map((s) => s.content.summary)).toEqual([['Nouveau.']])
    const cards = await db.cards.where('lessonId').equals(lessonId).toArray()
    expect(cards.map((c) => c.front)).toEqual(['A', 'B'])
    expect(cards.every((c) => c.due.getTime() <= Date.now())).toBe(true)
    expect(await db.quizQuestions.where('lessonId').equals(lessonId).count()).toBe(0)
  })
})
