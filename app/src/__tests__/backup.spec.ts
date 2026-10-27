import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { createBackup, parseBackup, restoreBackup } from '@/backup'
import { db, recordQuizAnswer } from '@/db'
import { DEFAULT_SETTINGS } from '@/stores/settings'
import { newReviewState } from '@/utils/review'

const NOW = new Date('2026-10-28T10:00:00')

async function fillDatabase() {
  const lessonId = await db.lessons.add({
    subjectId: 1,
    title: 'Les volcans',
    sourceText: 'Un volcan crache de la lave.',
    createdAt: NOW,
  })
  await db.sheets.add({
    lessonId,
    content: { summary: ['Un **volcan** crache de la lave.'], definitions: [] },
  })
  const review = newReviewState(NOW)
  const base = { lessonId, explanation: '', review, due: review.due }
  const questionId = await db.quizQuestions.add({
    ...base,
    type: 'mcq',
    question: 'Que crache un volcan ?',
    choices: ['De la lave', 'De l’eau', 'Du sable'],
    answer: 0,
  })
  await db.quizQuestions.add({
    ...base,
    type: 'match',
    question: 'Relie',
    pairs: [{ left: 'Lave', right: 'Roche fondue' }],
  })
  await db.quizQuestions.add({ ...base, type: 'order', question: 'Range', items: ['A', 'B'] })
  await recordQuizAnswer(questionId, true, NOW)
}

const snapshot = async () => ({
  subjects: await db.subjects.toArray(),
  lessons: await db.lessons.toArray(),
  sheets: await db.sheets.toArray(),
  quizQuestions: await db.quizQuestions.toArray(),
  xp: await db.xp.toArray(),
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('sauvegarde', () => {
  it('restaure exactement les données et les réglages exportés', async () => {
    await fillDatabase()
    const before = await snapshot()
    const settings = { ...DEFAULT_SETTINGS, nickname: 'Renard', fontSize: 24 as const }
    const content = await createBackup(settings)

    await db.lessons.clear()
    await db.subjects.add({ name: 'À effacer', icon: '🦊', color: '#000', createdAt: NOW })

    const backup = parseBackup(content)
    if (!backup) throw new Error('sauvegarde refusée')
    await restoreBackup(backup)

    expect(await snapshot()).toEqual(before)
    expect(backup.settings).toEqual(settings)
  })

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    await fillDatabase()
    const valid = JSON.parse(await createBackup(DEFAULT_SETTINGS))

    expect(parseBackup('pas du JSON')).toBeNull()
    expect(parseBackup('{"format":"autre"}')).toBeNull()
    expect(parseBackup(JSON.stringify({ ...valid, version: 99 }))).toBeNull()
    const brokenQuestion = { ...valid.quizQuestions[0], type: 'inconnu' }
    expect(parseBackup(JSON.stringify({ ...valid, quizQuestions: [brokenQuestion] }))).toBeNull()
  })

  it('ne change rien si la restauration échoue', async () => {
    await fillDatabase()
    const backup = parseBackup(await createBackup(DEFAULT_SETTINGS))
    if (!backup) throw new Error('sauvegarde refusée')
    const before = await snapshot()

    // Deux matières du même nom : refusé par l'index unique
    const [first] = backup.subjects
    if (!first) throw new Error('matière manquante')
    backup.subjects.push({ ...first, id: 999 })
    await expect(restoreBackup(backup)).rejects.toThrow()

    expect(await snapshot()).toEqual(before)
  })

  it('remplace des réglages invalides par les valeurs par défaut', async () => {
    const valid = JSON.parse(await createBackup(DEFAULT_SETTINGS))
    const backup = parseBackup(JSON.stringify({ ...valid, settings: { fontSize: 500 } }))
    expect(backup?.settings).toEqual(DEFAULT_SETTINGS)
  })
})
