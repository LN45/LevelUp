import Dexie, { type EntityTable } from 'dexie'

export interface Subject {
  id: number
  name: string
  icon: string
  color: string
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

// Contenu détaillé des fiches, cartes et quiz affiné aux étapes 5 à 9 :
// seuls les champs indexés sont figés par le schéma.
export interface Sheet {
  id: number
  lessonId: number
  content: string
}

export interface Card {
  id: number
  lessonId: number
  front: string
  back: string
  /** Prochaine révision (état FSRS complet ajouté à l'étape 9) */
  due: Date
}

export interface QuizQuestion {
  id: number
  lessonId: number
  type: 'mcq' | 'true-false'
  question: string
  choices: string[]
  /** Index de la bonne réponse dans choices */
  answer: number
  explanation: string
}

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
  cards: EntityTable<Card, 'id'>
  quizQuestions: EntityTable<QuizQuestion, 'id'>
}

// ++id plutôt que des UUID : crypto.randomUUID() n'existe pas en HTTP via l'IP locale
db.version(1).stores({
  subjects: '++id, &name',
  lessons: '++id, subjectId, createdAt',
  sheets: '++id, &lessonId',
  cards: '++id, lessonId, due',
  quizQuestions: '++id, lessonId',
})

db.on('populate', async (tx) => {
  const createdAt = new Date()
  await tx.table('subjects').bulkAdd(
    SUBJECT_CATALOG.filter((s) => s.preset).map(({ name, icon, color }) => ({
      name,
      icon,
      color,
      createdAt,
    })),
  )
})

/** Supprime une matière avec ses leçons, fiches, cartes et questions */
export async function deleteSubject(subjectId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.subjects, db.lessons, db.sheets, db.cards, db.quizQuestions],
    async () => {
      const lessonIds = await db.lessons.where('subjectId').equals(subjectId).primaryKeys()
      await Promise.all([
        db.sheets.where('lessonId').anyOf(lessonIds).delete(),
        db.cards.where('lessonId').anyOf(lessonIds).delete(),
        db.quizQuestions.where('lessonId').anyOf(lessonIds).delete(),
      ])
      await db.lessons.bulkDelete(lessonIds)
      await db.subjects.delete(subjectId)
    },
  )
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
