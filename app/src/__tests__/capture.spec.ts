import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import { describe, expect, it } from 'vitest'

import { db } from '@/db'
import { useLessonsStore } from '@/stores/lessons'
import { fitWithin } from '@/utils/images'
import { guessTitle, hasUsableText, pageText } from '@/utils/pdf'

describe('compression des photos', () => {
  it('réduit le plus grand côté à 1600 px en gardant les proportions', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
  })

  it('n’agrandit jamais une petite image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('import PDF', () => {
  it('reconstitue les lignes du texte d’une page', () => {
    const content = {
      items: [
        { str: 'Les volcans', hasEOL: true },
        { str: 'Un volcan ', hasEOL: false },
        { str: 'crache de la lave.', hasEOL: false },
      ],
    } as unknown as TextContent
    expect(pageText(content)).toBe('Les volcans\nUn volcan crache de la lave.')
  })

  it('distingue un PDF avec du texte d’un PDF scanné', () => {
    const page = 'Un volcan est une montagne qui crache de la lave. '.repeat(3)
    expect(hasUsableText([page, page])).toBe(true)
    expect(hasUsableText(['', ' \n '])).toBe(false)
    expect(hasUsableText([page, '', '', ''])).toBe(false)
  })

  it('propose la première ligne non vide comme titre, raccourcie si besoin', () => {
    expect(guessTitle('\n  \nLes volcans\nUn volcan…')).toBe('Les volcans')
    const title = guessTitle('A'.repeat(200))
    expect(title).toHaveLength(80)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('enregistrement d’une leçon', () => {
  it('enregistre la leçon nettoyée avec sa date', async () => {
    setActivePinia(createPinia())
    const id = await useLessonsStore().add({
      subjectId: 1,
      title: '  Les volcans  ',
      sourceText: '\n# Les volcans\n',
    })
    const lesson = await db.lessons.get(id)
    expect(lesson).toMatchObject({
      subjectId: 1,
      title: 'Les volcans',
      sourceText: '# Les volcans',
    })
    expect(lesson?.createdAt).toBeInstanceOf(Date)
  })
})
