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
// "source" (phrase recopiée du cours) ancre chaque élément dans le cours ; elle est vérifiée
// puis retirée : elle n'est pas renvoyée au front.
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
  quiz: z
    .array(
      // L'IA écrit la bonne réponse en toutes lettres : c'est l'API qui construit les choix,
      // la position de la bonne réponse est donc connue par construction
      z.object({
        source: z.string().max(500),
        type: z.enum(['mcq', 'true-false']),
        /** QCM : la question ; vrai/faux : "" */
        question: z.string().max(300),
        /** QCM : la bonne réponse ; vrai/faux : l'affirmation vraie */
        correct: z.string().max(200),
        /** QCM : deux mauvaises réponses ; vrai/faux : une version fausse de l'affirmation */
        wrong: z.array(z.string().max(200)).max(3),
        explanation: z.string().max(300),
      }),
    )
    .min(1)
    .max(12),
  // Suite d'étapes ou chronologie du cours, pour « remettre dans l'ordre » ; steps vide s'il n'y en a pas
  sequence: z.object({
    question: z.string().max(200),
    steps: z.array(z.object({ source: z.string().max(500), step: z.string().max(150) })).max(6),
    explanation: z.string().max(300),
  }),
})

type AiOutput = z.infer<typeof aiOutputSchema>
type AiQuestion = AiOutput['quiz'][number]

export interface ChoiceQuestion {
  type: 'mcq' | 'true-false'
  question: string
  choices: string[]
  answer: number
  explanation: string
}

/** Relier chaque mot (left) à sa définition (right) */
export interface MatchQuestion {
  type: 'match'
  question: string
  pairs: { left: string; right: string }[]
  explanation: string
}

/** Remettre les étapes dans l'ordre (items rangés dans le bon ordre) */
export interface OrderQuestion {
  type: 'order'
  question: string
  items: string[]
  explanation: string
}

export type QuizQuestion = ChoiceQuestion | MatchQuestion | OrderQuestion

const LIMITS = { summary: 6, definitions: 6, quiz: 8, minimum: 3, pairs: 4, steps: 5 }
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
export function shuffleChoices(question: ChoiceQuestion, random = Math.random): ChoiceQuestion {
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

/**
 * Construit une question exploitable, ou null.
 * QCM : bonne réponse + 2 mauvaises, distinctes, mélangées.
 * Vrai/faux : l'affirmation vraie ou sa version fausse, tirée au hasard.
 */
export function normalizeQuestion(raw: AiQuestion, random = Math.random): ChoiceQuestion | null {
  const correct = raw.correct.trim()
  const wrong = raw.wrong.map((choice) => choice.trim()).filter(Boolean)
  const explanation = raw.explanation.trim()
  if (!correct || !explanation) return null

  if (raw.type === 'true-false') {
    const [falseStatement] = wrong
    if (!falseStatement || normalizeForMatch(falseStatement) === normalizeForMatch(correct)) {
      return null
    }
    const isTrue = random() < 0.5
    return {
      type: 'true-false',
      question: isTrue ? correct : falseStatement,
      choices: TRUE_FALSE_CHOICES,
      answer: isTrue ? 0 : 1,
      explanation,
    }
  }

  const question = raw.question.trim()
  const choices = [correct, ...wrong.slice(0, 2)]
  if (!question || choices.length !== 3) return null
  if (new Set(choices.map(normalizeForMatch)).size !== 3) return null
  if (isTautology(question, correct)) return null
  return shuffleChoices({ type: 'mcq', question, choices, answer: 0, explanation }, random)
}

// Petits mots qui n'apportent pas d'information (après normalizeForMatch : sans accents)
const STOP_WORDS = new Set(
  'avec dans entre pour sont etre elle elles ils leur leurs mais plus tres tout tous toute toutes cest quest quoi quel quelle quels quelles comment pourquoi cela ceci cette ces des les une aux par sur sous qui que dont fait faire peut peuvent'.split(
    ' ',
  ),
)

const contentWords = (text: string) =>
  normalizeForMatch(text)
    .replace(/\b(\w)\s/g, '$1') // « qu est » → « quest », « c est » → « cest »
    .split(' ')
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))

/**
 * La réponse se contente-t-elle de répéter la question ? (ex. « Qu'est-ce que des
 * caractéristiques communes ? » → « Les caractéristiques communes entre individus »)
 * Oui si la plupart de ses mots importants viennent de la question et qu'elle apporte
 * au plus un mot nouveau.
 */
export function isTautology(question: string, answer: string): boolean {
  const questionWords = new Set(contentWords(question))
  const answerWords = contentWords(answer)
  if (!answerWords.length) return true
  const repeated = answerWords.filter((word) => questionWords.has(word)).length
  return repeated / answerWords.length >= 0.5 && answerWords.length - repeated <= 1
}

/** Retire les doublons (même texte, sans tenir compte des majuscules, accents et ponctuation) */
export function uniqueBy<T>(items: T[], text: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = normalizeForMatch(text(item))
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** « Relier par paires » construit depuis les mots à retenir (déjà vérifiés), sans appel d'IA */
export function buildMatchQuestion(
  definitions: { term: string; definition: string }[],
): MatchQuestion | null {
  if (definitions.length < LIMITS.minimum) return null
  return {
    type: 'match',
    question: 'Relie chaque mot à sa définition.',
    pairs: definitions
      .slice(0, LIMITS.pairs)
      .map(({ term, definition }) => ({ left: term, right: definition })),
    explanation: '',
  }
}

/** Position d'une citation dans le cours (à partir de ses premiers mots), -1 si introuvable */
function positionInCourse(source: string, normalizedCourse: string): number {
  const start = normalizeForMatch(source).split(' ').slice(0, 5).join(' ')
  return start ? normalizedCourse.indexOf(start) : -1
}

/**
 * « Remettre dans l'ordre » : 3 à 5 étapes, chacune citée depuis le cours, et dans le même
 * ordre que dans le cours (sinon l'ordre proposé pourrait être inventé). null sinon.
 */
export function buildOrderQuestion(
  sequence: AiOutput['sequence'],
  course: string,
): OrderQuestion | null {
  const steps = sequence.steps
    .map(({ source, step }) => ({ source, step: step.trim() }))
    .filter(({ step }) => step)
  if (steps.length < LIMITS.minimum || steps.length > LIMITS.steps) return null
  if (!steps.every(({ source }) => isGrounded(source, course))) return null

  const normalizedCourse = normalizeForMatch(course)
  const positions = steps.map(({ source }) => positionInCourse(source, normalizedCourse))
  const inCourseOrder = positions.every(
    (position, i) => position >= 0 && (i === 0 || position >= (positions[i - 1] as number)),
  )
  if (!inCourseOrder) return null
  if (new Set(steps.map(({ step }) => normalizeForMatch(step))).size !== steps.length) return null

  return {
    type: 'order',
    question: sequence.question.trim() || 'Remets ces étapes dans l’ordre.',
    items: steps.map(({ step }) => step),
    explanation: sequence.explanation.trim(),
  }
}

/**
 * Nettoie et plafonne la sortie de l'IA. Tout élément (phrase du résumé, définition, question)
 * dont la citation est introuvable dans le cours est écarté, comme les questions dont la bonne
 * réponse répète la question et les doublons. Ajoute « relier » et « remettre dans l'ordre »
 * quand c'est possible. AiError si le résultat est trop pauvre.
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
  const choiceQuestions = uniqueBy(
    output.quiz
      .filter((question) => isGrounded(question.source, course))
      .map((question) => normalizeQuestion(question, random))
      .filter((question) => question !== null),
    (question) => question.question,
  ).slice(0, LIMITS.quiz)

  if ([summary, choiceQuestions].some((list) => list.length < LIMITS.minimum)) {
    throw new AiError('Contenu généré insuffisant')
  }
  const quiz: QuizQuestion[] = [
    ...choiceQuestions,
    ...[buildMatchQuestion(definitions), buildOrderQuestion(output.sequence, course)].filter(
      (question) => question !== null,
    ),
  ]
  return { sheet: { summary, definitions }, quiz }
}

const SYSTEM_PROMPT = `Tu prépares des révisions pour un élève de 6e dyslexique, à partir de son cours.
Règles pour tout le contenu :
- Reste fidèle au cours : n'invente rien qui n'y est pas, ne change jamais le sens.
- Reprends les définitions du cours au plus près de ses mots.
- Attention aux mots contraires (par exemple fertile et stérile, actif et endormi) : chacun a sa propre définition, souvent opposée.
- Écris en français, avec un vocabulaire simple de 6e.
- Entoure de crochets chaque mot ou passage dans une autre langue que le français (par exemple dans un cours d'anglais : On dit [Good morning] le matin.), comme dans le cours. N'utilise jamais de crochets pour autre chose.
- Phrases courtes : 15 mots maximum.
- Mets en gras avec **deux étoiles** seulement le mot-clé le plus important d'une phrase ou d'une question (un ou deux mots maximum) : le gras doit rester rare.

Réponds uniquement avec un objet JSON, sans balises Markdown autour, avec ces champs :
- "summary" : un petit résumé du cours en 4 à 6 phrases courtes, dans l'ordre du cours, qui se lisent à la suite comme un texte. Une phrase peut donner un exemple concret tiré du cours (« Par exemple, … »). Pour chaque phrase : "source" est la phrase du cours sur laquelle elle s'appuie, recopiée mot pour mot ; "sentence" est la phrase du résumé, qui dit la même chose que "source".
- "definitions" : jusqu'à 6 mots importants du cours. "source" : la phrase du cours qui définit ce mot, recopiée mot pour mot. "term" : le mot. "definition" : une définition courte et simple, qui dit la même chose que "source".
- "quiz" : 8 questions, environ 5 QCM et 3 vrai/faux, chacune sur une notion différente (jamais deux fois la même question, même tournée autrement), dans l'ordre du cours. Pour chaque question, "source" est la phrase du cours qui contient la bonne réponse, recopiée mot pour mot.
  - QCM : "type": "mcq". "question" : la question. "correct" : la bonne réponse, courte, qui dit exactement la même chose que "source". "wrong" : exactement 2 mauvaises réponses courtes, clairement fausses d'après le cours. Les 3 réponses ont la même forme et à peu près la même longueur : la bonne réponse ne doit pas se reconnaître à sa formulation.
  - Vrai/faux : "type": "true-false", "question": "". "correct" : une affirmation vraie, qui dit exactement la même chose que "source". "wrong" : une seule version fausse de cette affirmation (par exemple avec le contraire), sans être piégeuse.
  - Pas de piège, pas de double négation, pas de « sauf ».
  - La bonne réponse explique vraiment avec les mots du cours : elle ne se contente jamais de répéter les mots de la question. Pour "Qu'est-ce que <notion> ?", la réponse ne doit pas être "<notion>" redit autrement.
  - "explanation" : une phrase courte qui énonce ce qui est vrai d'après le cours (par exemple « Les animaux <groupe> <ce qui est vrai>. »). Elle s'affiche aussi après une mauvaise réponse : jamais de « bravo », « très bien », « bien compris » ni de félicitations.
- "sequence" : seulement si le cours décrit clairement une suite d'étapes ou une chronologie (étapes d'un phénomène, ordre des événements). Sinon : "question": "", "steps": [], "explanation": "".
  - "question" : courte consigne, par exemple « Remets dans l'ordre les étapes de <phénomène>. ».
  - "steps" : 3 à 5 étapes très courtes (8 mots maximum), dans le bon ordre. Pour chaque étape, "source" est la phrase du cours qui la décrit, recopiée mot pour mot ; "step" est l'étape.
  - "explanation" : une phrase qui rappelle l'ordre d'après le cours, sans félicitations.`

export const generate = new Hono<{ Bindings: Env }>().post('/', async (c) => {
  const request = generateRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!request.success) throw new HTTPException(400, { message: 'invalid_request' })
  await consumeDailyQuota(c.env)

  const { title, subject, text } = request.data
  const attempt = async () =>
    normalize(
      await generateJson(c.env, {
        model: c.env.GENERATE_MODEL,
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
