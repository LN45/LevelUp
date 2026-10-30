import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, generateLesson } from '@/api'
import { db, type GeneratedContent } from '@/db'
import { useLessonsStore } from '@/stores/lessons'
import { courseLines, englishNumber, englishSpeech, speechSegments, splitRich } from '@/utils/text'

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
  const part = (text: string, bold = false, foreign = false) => ({ text, bold, foreign })

  it('découpe le gras sans HTML', () => {
    expect(splitRich('Un **volcan** actif')).toEqual([
      part('Un '),
      part('volcan', true),
      part(' actif'),
    ])
    expect(splitRich('<b>pas du HTML</b>')).toEqual([part('<b>pas du HTML</b>')])
  })

  it('repère les passages en langue étrangère, même en gras', () => {
    expect(splitRich('Le mot [the **cat**] veut dire chat.')).toEqual([
      part('Le mot '),
      part('the ', false, true),
      part('cat', true, true),
      part(' veut dire chat.'),
    ])
    expect(splitRich('On dit [Hello')).toEqual([part('On dit '), part('Hello', false, true)])
  })

  it('garde « [illisible] » en français', () => {
    expect(splitRich('Le [illisible] rouge')).toEqual([
      part('Le '),
      part('[illisible]'),
      part(' rouge'),
    ])
  })

  it('prépare la lecture vocale sans marques, langue par langue', () => {
    expect(speechSegments('# Les **volcans**\n- la lave')).toEqual([
      { text: 'Les volcans\nla lave', foreign: false },
    ])
    expect(speechSegments('On dit [**Hello**] et [Goodbye].')).toEqual([
      { text: 'On dit ', foreign: false },
      { text: 'Hello', foreign: true },
      { text: ' et ', foreign: false },
      { text: 'Goodbye', foreign: true },
    ])
  })

  it('écrit les nombres en anglais', () => {
    expect([0, 7, 11, 21, 40, 100, 342, 1500, 2026].map(englishNumber)).toEqual([
      'zero',
      'seven',
      'eleven',
      'twenty one',
      'forty',
      'one hundred',
      'three hundred and forty two',
      'one thousand five hundred',
      'two thousand and twenty six',
    ])
  })

  it('prépare le texte anglais pour la voix : nombres en lettres et « I »', () => {
    expect(englishSpeech('I am 11. I’m happy, I said.')).toBe(
      'eye am eleven. eye’m happy, eye said.',
    )
    // Nombres à virgule, heures et ordinaux laissés au moteur vocal ; mots contenant un I inchangés
    expect(englishSpeech('It is 7:30, 2.5 km, the 1st day. Imagine')).toBe(
      'It is 7:30, 2.5 km, the 1st day. Imagine',
    )
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
