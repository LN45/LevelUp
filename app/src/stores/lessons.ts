import { defineStore } from 'pinia'
import { reactive } from 'vue'

import { ApiError, generateLesson } from '@/api'
import { db, deleteLesson, saveGeneratedContent, type Lesson } from '@/db'

export const LESSON_TITLE_MAX_LENGTH = 120

export const useLessonsStore = defineStore('lessons', () => {
  // Générations en cours et dernières erreurs, par leçon : la génération continue
  // même si l'élève change d'écran
  const generating = reactive(new Set<number>())
  const generationErrors = reactive(new Map<number, string>())

  async function add(lesson: Pick<Lesson, 'subjectId' | 'title' | 'sourceText'>): Promise<number> {
    return db.lessons.add({
      subjectId: lesson.subjectId,
      title: lesson.title.trim().slice(0, LESSON_TITLE_MAX_LENGTH),
      sourceText: lesson.sourceText.trim(),
      createdAt: new Date(),
    })
  }

  /** Génère et enregistre la fiche, les cartes et le quiz d'une leçon */
  async function generate(lessonId: number): Promise<void> {
    if (generating.has(lessonId)) return
    generating.add(lessonId)
    generationErrors.delete(lessonId)
    try {
      const lesson = await db.lessons.get(lessonId)
      if (!lesson) return
      const subject = await db.subjects.get(lesson.subjectId)
      const generated = await generateLesson({
        title: lesson.title,
        subject: subject?.name ?? '',
        text: lesson.sourceText,
      })
      await saveGeneratedContent(lessonId, generated)
    } catch (error) {
      generationErrors.set(
        lessonId,
        error instanceof ApiError ? error.message : 'Oups, un problème est survenu. Réessaie.',
      )
    } finally {
      generating.delete(lessonId)
    }
  }

  async function remove(lessonId: number): Promise<void> {
    await deleteLesson(lessonId)
    generationErrors.delete(lessonId)
  }

  return { generating, generationErrors, add, generate, remove }
})
