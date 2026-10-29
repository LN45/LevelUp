import Dexie, { type EntityTable, type Table } from 'dexie'

import { answerXp, XP } from './utils/progress'
import { endOfDay, newReviewState, rateAnswer, type ReviewState } from './utils/review'

export interface Subject {
  id: number
  name: string
  icon: string
  color: string
  /** Position dans la liste des matières, choisie dans les réglages */
  order: number
  createdAt: Date
}

export interface Lesson {
  id: number
  subjectId: number
  title: string
  /** Texte du cours relu et corrigé */
  sourceText: string
  createdAt: Date
}

// Les textes de la fiche et du quiz peuvent contenir des mots-clés en **gras**.
// Seuls les champs indexés sont figés par le schéma : ces types peuvent évoluer sans migration.
export interface SheetContent {
  /** Petit résumé du cours, une phrase courte par élément */
  summary: string[]
  definitions: { term: string; definition: string }[]
}

export interface Sheet {
  id: number
  lessonId: number
  content: SheetContent
}

interface QuizQuestionBase {
  id: number
  lessonId: number
  question: string
  /** Peut être vide (« relier » : la correction affiche les bonnes paires) */
  explanation: string
  /** Révision espacée */
  review: ReviewState
  /** Copie de review.due, indexée pour trouver les questions à revoir */
  due: Date
  /** Résultat de la dernière réponse (premier passage d'une série) ; absent si jamais répondue */
  lastCorrect?: boolean
}

export type ChoiceQuestion = QuizQuestionBase & {
  type: 'mcq' | 'true-false'
  choices: string[]
  /** Index de la bonne réponse dans choices */
  answer: number
}

/** Relier chaque mot (left) à sa définition (right) */
export type MatchQuestion = QuizQuestionBase & {
  type: 'match'
  pairs: { left: string; right: string }[]
}

/** Remettre les étapes dans l'ordre (items rangés dans le bon ordre) */
export type OrderQuestion = QuizQuestionBase & {
  type: 'order'
  items: string[]
}

export type QuizQuestion = ChoiceQuestion | MatchQuestion | OrderQuestion

/** XP gagnée ; gardée même si la leçon ou la matière est supprimée (jamais de queue perdue) */
export interface XpEntry {
  id: number
  date: Date
  amount: number
  subjectId: number
  lessonId: number
}

/** Omit appliqué à chaque format de question séparément */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type NewSubject = Pick<Subject, 'name' | 'icon' | 'color'>

/** Matières proposées ; celles marquées preset sont créées au premier lancement (programme de 6e) */
export const SUBJECT_CATALOG: (NewSubject & { preset: boolean })[] = [
  { name: 'Français', icon: '📜', color: '#c23b22', preset: true },
  { name: 'Mathématiques', icon: '🧮', color: '#3c6fa8', preset: true },
  { name: 'Histoire-Géographie', icon: '🏯', color: '#8a3a17', preset: true },
  { name: 'Enseignement moral et civique', icon: '⛩️', color: '#7a3b69', preset: true },
  { name: 'Anglais', icon: '🏮', color: '#d4a72c', preset: true },
  { name: 'Sciences et technologie', icon: '🍁', color: '#5b7a3a', preset: true },
  { name: 'Arts plastiques', icon: '🪭', color: '#b4566e', preset: true },
  { name: 'Éducation musicale', icon: '🎐', color: '#2f6f73', preset: true },
  { name: 'EPS', icon: '🥋', color: '#46527f', preset: true },
  { name: 'SVT', icon: '🌿', color: '#5b7a3a', preset: false },
  { name: 'Physique-Chimie', icon: '🔥', color: '#b5531f', preset: false },
  { name: 'Technologie', icon: '⚙️', color: '#46527f', preset: false },
  { name: 'Espagnol', icon: '🌸', color: '#b4566e', preset: false },
  { name: 'Allemand', icon: '🗻', color: '#2f6f73', preset: false },
  { name: 'Latin', icon: '🎴', color: '#7a3b69', preset: false },
]

/** Icône et couleur d'une matière « Autre » saisie à la main */
export const CUSTOM_SUBJECT_STYLE = { icon: '🦊', color: '#b5531f' }

export const db = new Dexie('levelup') as Dexie & {
  subjects: EntityTable<Subject, 'id'>
  lessons: EntityTable<Lesson, 'id'>
  sheets: EntityTable<Sheet, 'id'>
  // Type d'insertion explicite : EntityTable fusionnerait les formats de question en un seul
  quizQuestions: Table<QuizQuestion, number, OmitEach<QuizQuestion, 'id'>>
  xp: EntityTable<XpEntry, 'id'>
}

// ++id plutôt que des UUID : crypto.randomUUID() n'existe pas en HTTP via l'IP locale
db.version(1).stores({
  subjects: '++id, &name',
  lessons: '++id, subjectId, createdAt',
  sheets: '++id, &lessonId',
  cards: '++id, lessonId, due',
  quizQuestions: '++id, lessonId',
})

/** Ancienne forme de la fiche (version 1) : points clés en blocs avec exemple facultatif */
interface SheetContentV1 {
  keyPoints?: { text: string; example?: string }[]
}

// Version 2 : les points clés deviennent les phrases d'un petit résumé (index inchangés)
db.version(2)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('sheets')
      .toCollection()
      .modify((sheet: { content: SheetContent & SheetContentV1 }) => {
        const { keyPoints, ...content } = sheet.content
        if (!keyPoints) return
        sheet.content = {
          ...content,
          summary: keyPoints.map(({ text, example }) =>
            example ? `${text} Par exemple : ${example}` : text,
          ),
        }
      }),
  )

// Version 3 : les flashcards sont abandonnées, leur table est supprimée
db.version(3).stores({ cards: null })

// Version 4 : révision espacée des questions (état FSRS + date indexée), toutes à revoir dès maintenant
db.version(4)
  .stores({ quizQuestions: '++id, lessonId, due' })
  .upgrade((tx) =>
    tx
      .table('quizQuestions')
      .toCollection()
      .modify((question: { review?: ReviewState; due?: Date }) => {
        const review = newReviewState()
        question.review = review
        question.due = review.due
      }),
  )

// Version 5 : expérience. Les réponses déjà enregistrées comptent comme réussies du premier coup.
db.version(5)
  .stores({ xp: '++id, subjectId' })
  .upgrade(async (tx) => {
    const lessons: Lesson[] = await tx.table('lessons').toArray()
    const questions: QuizQuestion[] = await tx.table('quizQuestions').toArray()
    const date = new Date()
    const entries = lessons
      .map((lesson) => ({
        date,
        lessonId: lesson.id,
        subjectId: lesson.subjectId,
        amount:
          XP.firstTry *
          questions
            .filter((question) => question.lessonId === lesson.id)
            .reduce((sum, question) => sum + (question.review?.reps ?? 0), 0),
      }))
      .filter((entry) => entry.amount > 0)
    await tx.table('xp').bulkAdd(entries)
  })

// Version 6 : ordre des matières modifiable, en gardant l'ordre de création
db.version(6)
  .stores({ subjects: '++id, &name, order' })
  .upgrade((tx) => {
    let order = 0
    return tx
      .table('subjects')
      .toCollection()
      .modify((subject: { order?: number }) => {
        subject.order = order++
      })
  })

db.on('populate', async (tx) => {
  const createdAt = new Date()
  await tx.table('subjects').bulkAdd(
    SUBJECT_CATALOG.filter((s) => s.preset).map(({ name, icon, color }, order) => ({
      name,
      icon,
      color,
      order,
      createdAt,
    })),
  )
})

/** Matières dans l'ordre choisi par l'élève */
export function orderedSubjects(): Promise<Subject[]> {
  return db.subjects.orderBy('order').toArray()
}

/** Ce que /generate produit pour une leçon */
export interface GeneratedContent {
  sheet: SheetContent
  quiz: OmitEach<QuizQuestion, 'id' | 'lessonId' | 'review' | 'due' | 'lastCorrect'>[]
}

const contentTables = () => [db.sheets, db.quizQuestions]

/** À appeler dans une transaction qui inclut contentTables() */
async function deleteContent(lessonIds: number[]): Promise<void> {
  await Promise.all(
    contentTables().map((table) => table.where('lessonId').anyOf(lessonIds).delete()),
  )
}

/** Remplace la fiche et les questions d'une leçon par celles générées (questions à revoir dès maintenant) */
export async function saveGeneratedContent(
  lessonId: number,
  generated: GeneratedContent,
): Promise<void> {
  await db.transaction('rw', contentTables(), async () => {
    await deleteContent([lessonId])
    await db.sheets.add({ lessonId, content: generated.sheet })
    await db.quizQuestions.bulkAdd(
      generated.quiz.map((question) => {
        const review = newReviewState()
        return { ...question, lessonId, review, due: review.due }
      }),
    )
  })
}

/** Questions d'une leçon à revoir aujourd'hui */
export function dueQuestions(lessonId: number, now = new Date()): Promise<QuizQuestion[]> {
  const limit = endOfDay(now)
  return db.quizQuestions
    .where('lessonId')
    .equals(lessonId)
    .filter((question) => question.due <= limit)
    .toArray()
}

/** À appeler dans une transaction qui inclut db.lessons et db.xp */
async function addXpEntry(lessonId: number, amount: number, date: Date): Promise<void> {
  const lesson = await db.lessons.get(lessonId)
  if (lesson) await db.xp.add({ date, amount, lessonId, subjectId: lesson.subjectId })
}

/** XP sans réponse à enregistrer (second passage, fin de série) */
export async function addXp(lessonId: number, amount: number, now = new Date()): Promise<void> {
  await db.transaction('rw', db.lessons, db.xp, () => addXpEntry(lessonId, amount, now))
}

/** Enregistre la première réponse d'une série, planifie la prochaine révision et donne l'XP */
export async function recordQuizAnswer(
  questionId: number,
  correct: boolean,
  now = new Date(),
): Promise<void> {
  await db.transaction('rw', [db.quizQuestions, db.lessons, db.xp], async () => {
    const question = await db.quizQuestions.get(questionId)
    if (!question) return
    const review = rateAnswer(question.review, correct, now)
    await db.quizQuestions.update(questionId, { review, due: review.due, lastCorrect: correct })
    await addXpEntry(question.lessonId, answerXp(correct, false), now)
  })
}

export async function totalXp(): Promise<number> {
  let total = 0
  await db.xp.each((entry) => (total += entry.amount))
  return total
}

export interface LessonEdits {
  title: string
  sourceText: string
  /** null si la fiche n'a pas encore été générée */
  sheet: SheetContent | null
  quiz: QuizQuestion[]
}

/**
 * Enregistre les corrections d'un adulte. Les questions gardées conservent leur id (et donc
 * leur état de révision) ; celles qui ne sont plus dans la liste sont supprimées.
 */
export async function saveLessonEdits(lessonId: number, edits: LessonEdits): Promise<void> {
  const keptQuestions = new Set(edits.quiz.map((question) => question.id))
  await db.transaction('rw', [db.lessons, ...contentTables()], async () => {
    await db.lessons.update(lessonId, { title: edits.title, sourceText: edits.sourceText })
    if (edits.sheet) {
      await db.sheets.where('lessonId').equals(lessonId).modify({ content: edits.sheet })
    }
    await db.quizQuestions
      .where('lessonId')
      .equals(lessonId)
      .filter((question) => !keptQuestions.has(question.id))
      .delete()
    await db.quizQuestions.bulkPut(edits.quiz)
  })
}

/** Supprime une leçon avec sa fiche et ses questions */
export async function deleteLesson(lessonId: number): Promise<void> {
  await db.transaction('rw', [db.lessons, ...contentTables()], async () => {
    await deleteContent([lessonId])
    await db.lessons.delete(lessonId)
  })
}

/** Supprime une matière avec ses leçons, fiches et questions */
export async function deleteSubject(subjectId: number): Promise<void> {
  await db.transaction('rw', [db.subjects, db.lessons, ...contentTables()], async () => {
    const lessonIds = await db.lessons.where('subjectId').equals(subjectId).primaryKeys()
    await deleteContent(lessonIds)
    await db.lessons.bulkDelete(lessonIds)
    await db.subjects.delete(subjectId)
  })
}

// navigator.storage n'existe qu'en contexte sécurisé (HTTPS ou localhost) : null sinon
export async function isStoragePersisted(): Promise<boolean | null> {
  return navigator.storage?.persisted ? navigator.storage.persisted() : null
}

/** Demande au navigateur de ne pas effacer les données en cas de manque de place */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const persisted = await isStoragePersisted()
  return persisted === false ? navigator.storage.persist() : persisted
}
