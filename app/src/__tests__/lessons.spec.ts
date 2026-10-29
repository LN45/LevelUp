import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, generateLesson } from '@/api'
import { db, type GeneratedContent } from '@/db'
import { useLessonsStore } from '@/stores/lessons'
import { courseLines, plainText, splitBold } from '@/utils/text'

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  generateLesson: vi.fn(),
}))

const GENERATED: GeneratedContent = {
  sheet: { summary: ['Un **volcan** crache de la lave.'], definitions: [] },
  quiz: [
    {
      type: 'true-false',
      question: 'La lave est chaude.',
      choices: ['Vrai', 'Faux'],
      answer: 0,
      explanation: 'Oui.',
    },
  ],
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  setActivePinia(createPinia())
  vi.mocked(generateLesson).mockReset()
})

async function addLesson() {
  const store = useLessonsStore()
  const id = await store.add({ subjectId: 1, title: 'Les volcans', sourceText: 'Texte du cours' })
  return { store, id }
}

describe('génération d’une leçon', () => {
  it('envoie titre, matière et texte, puis enregistre le résultat', async () => {
    vi.mocked(generateLesson).mockResolvedValue(GENERATED)
    const { store, id } = await addLesson()

    await store.generate(id)

    expect(generateLesson).toHaveBeenCalledWith({
      title: 'Les volcans',
      subject: 'Français',
      text: 'Texte du cours',
    })
    expect(await db.sheets.where('lessonId').equals(id).count()).toBe(1)
    expect(await db.quizQuestions.where('lessonId').equals(id).count()).toBe(1)
    expect(store.generating.has(id)).toBe(false)
    expect(store.generationErrors.has(id)).toBe(false)
  })

  it('ne lance pas deux générations en même temps pour la même leçon', async () => {
    vi.mocked(generateLesson).mockResolvedValue(GENERATED)
    const { store, id } = await addLesson()
    await Promise.all([store.generate(id), store.generate(id)])
    expect(generateLesson).toHaveBeenCalledTimes(1)
  })

  it('garde un message clair en cas d’échec, sans rien enregistrer', async () => {
    vi.mocked(generateLesson).mockRejectedValue(new ApiError('quota_exceeded'))
    const { store, id } = await addLesson()

    await store.generate(id)

    expect(store.generationErrors.get(id)).toContain('Réessaie demain')
    expect(await db.sheets.count()).toBe(0)
  })
})

describe('mise en forme du texte', () => {
  it('découpe le gras sans HTML', () => {
    expect(splitBold('Un **volcan** actif')).toEqual([
      { text: 'Un ', bold: false },
      { text: 'volcan', bold: true },
      { text: ' actif', bold: false },
    ])
    expect(splitBold('<b>pas du HTML</b>')).toEqual([{ text: '<b>pas du HTML</b>', bold: false }])
  })

  it('retire les marques avant la lecture vocale', () => {
    expect(plainText('# Les **volcans**\n- la lave')).toBe('Les volcans\nla lave')
  })

  it('reconnaît titres, listes et paragraphes du cours', () => {
    expect(courseLines('# Titre\n\n- un point\nUn paragraphe.')).toEqual([
      { kind: 'title', text: 'Titre' },
      { kind: 'item', text: 'un point' },
      { kind: 'paragraph', text: 'Un paragraphe.' },
    ])
  })

  it('garde le gras dans les lignes du cours', () => {
    expect(courseLines('# Les **volcans**\n- la **lave**\n**Magma** : roche fondue.')).toEqual([
      { kind: 'title', text: 'Les **volcans**' },
      { kind: 'item', text: 'la **lave**' },
      { kind: 'paragraph', text: '**Magma** : roche fondue.' },
    ])
  })
})
