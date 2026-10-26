import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

import { AiError, generateJson } from './ai'
import { consumeDailyQuota } from './quota'

const TRUE_FALSE_CHOICES = ['Vrai', 'Faux']

export const generateRequestSchema = z.object({
  title: z.string().trim().max(120),
  subject: z.string().trim().max(60),
  text: z.string().trim().min(50).max(20_000),
})

// Schéma imposé à l'IA : volontairement souple sur les quantités, resserré par normalize().
// "source" (phrase recopiée du cours) ancre la fiche dans le cours et n'est pas renvoyée au front.
const aiOutputSchema = z.object({
  summary: z
    .array(z.object({ source: z.string().max(500), sentence: z.string().max(300) }))
    .min(1)
    .max(10),
  definitions: z
    .array(
      z.object({
        source: z.string().max(500),
        term: z.string().max(60),
        definition: z.string().max(300),
      }),
    )
    .max(10),
  flashcards: z
    .array(z.object({ front: z.string().max(200), back: z.string().max(300) }))
    .min(1)
    .max(15),
  quiz: z
    .array(
      z.object({
        type: z.enum(['mcq', 'true-false']),
        question: z.string().max(300),
        choices: z.array(z.string().max(120)).max(4),
        answer: z.number().int().min(0),
        explanation: z.string().max(300),
      }),
    )
    .min(1)
    .max(12),
})

type AiOutput = z.infer<typeof aiOutputSchema>
type AiQuestion = AiOutput['quiz'][number]

export interface QuizQuestion {
  type: 'mcq' | 'true-false'
  question: string
  choices: string[]
  answer: number
  explanation: string
}

const LIMITS = { summary: 6, definitions: 6, flashcards: 10, quiz: 6, minimum: 3 }
/** Part minimale des paires de mots de la citation qu'on doit retrouver dans le cours */
const GROUNDING_THRESHOLD = 0.8

/** Minuscules, sans accents ni ponctuation ni Markdown : pour comparer citation et cours */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const wordPairs = (words: string[]) => words.slice(1).map((word, i) => `${words[i]} ${word}`)

/**
 * La citation vient-elle vraiment du cours ? Recopie exacte, ou presque
 * (au moins 80 % de ses paires de mots consécutifs se retrouvent dans le cours).
 */
export function isGrounded(source: string, course: string): boolean {
  const quote = normalizeForMatch(source)
  const text = normalizeForMatch(course)
  const quoteWords = quote.split(' ')
  if (quoteWords.length < 2) return false
  if (text.includes(quote)) return true
  const coursePairs = new Set(wordPairs(text.split(' ')))
  const pairs = wordPairs(quoteWords)
  return pairs.filter((pair) => coursePairs.has(pair)).length / pairs.length >= GROUNDING_THRESHOLD
}

/** Mélange les choix (Fisher-Yates) en suivant la bonne réponse : l'IA la met souvent en premier */
export function shuffleChoices(question: QuizQuestion, random = Math.random): QuizQuestion {
  const order = question.choices.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j] as number, order[i] as number]
  }
  return {
    ...question,
    choices: order.map((i) => question.choices[i] as string),
    answer: order.indexOf(question.answer),
  }
}

/** Question exploitable ou null : QCM à 3 choix distincts, vrai/faux normalisé, bonne réponse valide */
export function normalizeQuestion(raw: AiQuestion, random = Math.random): QuizQuestion | null {
  const question = raw.question.trim()
  const explanation = raw.explanation.trim()
  if (!question || !explanation) return null

  if (raw.type === 'true-false') {
    if (raw.answer > 1) return null
    return {
      type: 'true-false',
      question,
      choices: TRUE_FALSE_CHOICES,
      answer: raw.answer,
      explanation,
    }
  }

  const choices = raw.choices.map((choice) => choice.trim())
  const distinct = new Set(choices.map((choice) => choice.toLocaleLowerCase('fr')))
  if (choices.length !== 3 || distinct.size !== 3 || choices.includes('')) return null
  if (raw.answer >= choices.length) return null
  return shuffleChoices({ type: 'mcq', question, choices, answer: raw.answer, explanation }, random)
}

/**
 * Nettoie et plafonne la sortie de l'IA. Les phrases du résumé et les définitions dont la
 * citation est introuvable dans le cours sont écartées. AiError si le résultat est trop pauvre.
 */
export function normalize(output: AiOutput, course: string, random = Math.random) {
  const summary = output.summary
    .filter((item) => isGrounded(item.source, course))
    .map((item) => item.sentence.trim())
    .filter(Boolean)
    .slice(0, LIMITS.summary)
  const definitions = output.definitions
    .filter((definition) => isGrounded(definition.source, course))
    .map(({ term, definition }) => ({ term: term.trim(), definition: definition.trim() }))
    .filter((d) => d.term && d.definition)
    .slice(0, LIMITS.definitions)
  const flashcards = output.flashcards
    .map(({ front, back }) => ({ front: front.trim(), back: back.trim() }))
    .filter((card) => card.front && card.back)
    .slice(0, LIMITS.flashcards)
  const quiz = output.quiz
    .map((question) => normalizeQuestion(question, random))
    .filter((question) => question !== null)
    .slice(0, LIMITS.quiz)

  if ([summary, flashcards, quiz].some((list) => list.length < LIMITS.minimum)) {
    throw new AiError('Contenu généré insuffisant')
  }
  return { sheet: { summary, definitions }, flashcards, quiz }
}

const SYSTEM_PROMPT = `Tu prépares des révisions pour un élève de 6e dyslexique, à partir de son cours.
Règles pour tout le contenu :
- Reste fidèle au cours : n'invente rien qui n'y est pas, ne change jamais le sens.
- Reprends les définitions du cours au plus près de ses mots.
- Attention aux mots contraires (par exemple fertile et stérile, actif et endormi) : chacun a sa propre définition, souvent opposée.
- Écris en français, avec un vocabulaire simple de 6e.
- Phrases courtes : 15 mots maximum.
- Mets en gras avec **deux étoiles** seulement le mot-clé le plus important d'un point, d'une carte ou d'une question (un ou deux mots maximum) : le gras doit rester rare.

Réponds uniquement avec un objet JSON, sans balises Markdown autour, avec ces champs :
- "summary" : un petit résumé du cours en 4 à 6 phrases courtes, dans l'ordre du cours, qui se lisent à la suite comme un texte. Une phrase peut donner un exemple concret tiré du cours (« Par exemple, … »). Pour chaque phrase : "source" est la phrase du cours sur laquelle elle s'appuie, recopiée mot pour mot ; "sentence" est la phrase du résumé, qui dit la même chose que "source".
- "definitions" : jusqu'à 6 mots importants du cours. "source" : la phrase du cours qui définit ce mot, recopiée mot pour mot. "term" : le mot. "definition" : une définition courte et simple, qui dit la même chose que "source".
- "flashcards" : 6 à 10 cartes. "front" : une question courte ou un mot. "back" : la réponse courte.
- "quiz" : 6 questions, environ 4 QCM et 2 vrai/faux.
  - QCM : "type": "mcq", exactement 3 choix courts dans "choices", une seule bonne réponse.
  - Vrai/faux : "type": "true-false", "question" est une affirmation, "choices": ["Vrai", "Faux"]. Au moins une affirmation doit être fausse (réponse "Faux"), sans être piégeuse.
  - "answer" : position de la bonne réponse dans "choices" (0 pour la première).
  - Pas de piège, pas de double négation, pas de « sauf ».
  - La bonne réponse explique vraiment : elle ne se contente jamais de répéter le mot de la question.
  - "explanation" : une phrase courte et encourageante qui explique la bonne réponse.`

export const generate = new Hono<{ Bindings: Env }>().post('/', async (c) => {
  const request = generateRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!request.success) throw new HTTPException(400, { message: 'invalid_request' })
  await consumeDailyQuota(c.env)

  const { title, subject, text } = request.data
  const attempt = async () =>
    normalize(
      await generateJson(c.env, {
        system: SYSTEM_PROMPT,
        prompt: `Matière : ${subject || 'non précisée'}\nTitre : ${title || 'sans titre'}\n\nCours :\n${text}`,
        schema: aiOutputSchema,
      }),
      text,
    )

  // Une seconde tentative si la réponse est inexploitable (un seul décompte du quota)
  try {
    return c.json(await attempt())
  } catch (error) {
    if (!(error instanceof AiError)) throw error
    return c.json(await attempt())
  }
})
