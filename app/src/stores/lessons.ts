import { defineStore } from 'pinia'

import { db, type Lesson } from '@/db'

export const LESSON_TITLE_MAX_LENGTH = 120

export const useLessonsStore = defineStore('lessons', () => {
  async function add(lesson: Pick<Lesson, 'subjectId' | 'title' | 'sourceText'>): Promise<number> {
    return db.lessons.add({
      subjectId: lesson.subjectId,
      title: lesson.title.trim().slice(0, LESSON_TITLE_MAX_LENGTH),
      sourceText: lesson.sourceText.trim(),
      createdAt: new Date(),
    })
  }

  return { add }
})
