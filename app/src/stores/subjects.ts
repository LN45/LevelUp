import { defineStore } from 'pinia'

import { useLiveQuery } from '@/composables/useLiveQuery'
import { db, deleteSubject, type NewSubject, type Subject } from '@/db'

export const SUBJECT_NAME_MAX_LENGTH = 40

export type NameError = 'empty' | 'duplicate'

/** Comparaison sans tenir compte des majuscules */
export const isSameSubjectName = (a: string, b: string) =>
  a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr')

export const useSubjectsStore = defineStore('subjects', () => {
  // undefined tant que la base n'a pas répondu
  const subjects = useLiveQuery<Subject[] | undefined>(() => db.subjects.toArray(), undefined)

  /** Nettoie le nom et vérifie qu'il est libre */
  function checkName(name: string, ignoreId?: number): { name: string } | { error: NameError } {
    const cleaned = name.trim().slice(0, SUBJECT_NAME_MAX_LENGTH)
    if (!cleaned) return { error: 'empty' }
    const taken = (subjects.value ?? []).some(
      (s) => s.id !== ignoreId && isSameSubjectName(s.name, cleaned),
    )
    return taken ? { error: 'duplicate' } : { name: cleaned }
  }

  async function add(subject: NewSubject): Promise<NameError | null> {
    const checked = checkName(subject.name)
    if ('error' in checked) return checked.error
    await db.subjects.add({ ...subject, name: checked.name, createdAt: new Date() })
    return null
  }

  async function rename(id: number, newName: string): Promise<NameError | null> {
    const checked = checkName(newName, id)
    if ('error' in checked) return checked.error
    await db.subjects.update(id, { name: checked.name })
    return null
  }

  function countLessons(id: number): Promise<number> {
    return db.lessons.where('subjectId').equals(id).count()
  }

  return { subjects, add, rename, remove: deleteSubject, countLessons }
})
