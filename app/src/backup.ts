// Sauvegarde de toutes les données dans un fichier JSON, et restauration
import { State } from 'ts-fsrs'
import { z } from 'zod'

import { db } from './db'
import { normalizeSettings, type Settings } from './stores/settings'

const BACKUP_FORMAT = 'levelup-backup'
/** À augmenter si la forme des données change (avec conversion des anciennes sauvegardes) */
const BACKUP_VERSION = 1

const id = z.number().int().positive()
// Les dates sont écrites en texte ISO dans le JSON
const date = z.coerce.date()
const text = z.string()

const reviewSchema = z.object({
  due: date,
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number().int(),
  lapses: z.number().int(),
  state: z.enum(State),
  last_review: date.optional(),
})

const questionBase = {
  id,
  lessonId: id,
  question: text,
  explanation: text,
  review: reviewSchema,
  due: date,
  lastCorrect: z.boolean().optional(),
}

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  settings: z.unknown().transform(normalizeSettings),
  subjects: z
    .array(
      z.object({
        id,
        name: text,
        icon: text,
        color: text,
        // Absent des sauvegardes faites avant l'ordre modifiable : on garde l'ordre du fichier
        order: z.number().int().optional(),
        createdAt: date,
      }),
    )
    .transform((subjects) =>
      subjects.map((subject, index) => ({ ...subject, order: subject.order ?? index })),
    ),
  lessons: z.array(z.object({ id, subjectId: id, title: text, sourceText: text, createdAt: date })),
  sheets: z.array(
    z.object({
      id,
      lessonId: id,
      content: z.object({
        summary: z.array(text),
        definitions: z.array(z.object({ term: text, definition: text })),
      }),
    }),
  ),
  quizQuestions: z.array(
    z.discriminatedUnion('type', [
      z.object({
        ...questionBase,
        type: z.enum(['mcq', 'true-false']),
        choices: z.array(text),
        answer: z.number().int().nonnegative(),
      }),
      z.object({
        ...questionBase,
        type: z.literal('match'),
        pairs: z.array(z.object({ left: text, right: text })),
      }),
      z.object({ ...questionBase, type: z.literal('order'), items: z.array(text) }),
    ]),
  ),
  xp: z.array(
    z.object({ id, date, amount: z.number().int().nonnegative(), subjectId: id, lessonId: id }),
  ),
})

export type Backup = z.infer<typeof backupSchema>

const dataTables = () => [db.subjects, db.lessons, db.sheets, db.quizQuestions, db.xp]

/** Contenu du fichier de sauvegarde : toute la base locale et les réglages */
export async function createBackup(settings: Settings): Promise<string> {
  const [subjects, lessons, sheets, quizQuestions, xp] = await db.transaction(
    'r',
    dataTables(),
    () =>
      Promise.all([
        db.subjects.toArray(),
        db.lessons.toArray(),
        db.sheets.toArray(),
        db.quizQuestions.toArray(),
        db.xp.toArray(),
      ]),
  )
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date(),
      settings,
      subjects,
      lessons,
      sheets,
      quizQuestions,
      xp,
    },
    null,
    2,
  )
}

/** Sauvegarde lue et vérifiée, ou null si le fichier n'en est pas une */
export function parseBackup(content: string): Backup | null {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return null
  }
  const result = backupSchema.safeParse(json)
  return result.success ? result.data : null
}

/** Remplace toutes les données par celles de la sauvegarde : tout ou rien en cas d'erreur */
export async function restoreBackup(backup: Backup): Promise<void> {
  await db.transaction('rw', dataTables(), async () => {
    await Promise.all(dataTables().map((table) => table.clear()))
    await db.subjects.bulkAdd(backup.subjects)
    await db.lessons.bulkAdd(backup.lessons)
    await db.sheets.bulkAdd(backup.sheets)
    await db.quizQuestions.bulkAdd(backup.quizQuestions)
    await db.xp.bulkAdd(backup.xp)
  })
}
