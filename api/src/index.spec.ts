import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isGrounded, normalize, normalizeQuestion, shuffleChoices } from './generate'
import { app } from './index'

const TOKEN = 'jeton-de-test'
const IMAGE = { mediaType: 'image/jpeg', data: 'aGVsbG8=' }
const EXTRACTION = {
  legible: true,
  title: ' Les volcans ',
  lines: ['# Les volcans', '', 'Un volcan…'],
}

function createEnv(aiResponse: unknown = JSON.stringify(EXTRACTION)) {
  const store = new Map<string, string>()
  return {
    APP_TOKEN: TOKEN,
    AI_MODEL: 'modele-de-test',
    DAILY_LIMIT: '2',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    AI: { run: vi.fn(async () => ({ response: aiResponse })) },
    QUOTA: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => void store.set(key, value),
    },
  }
}

let env: ReturnType<typeof createEnv>

function post(body: unknown, token = TOKEN, path = '/extract') {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env as unknown as Env,
  )
}

beforeEach(() => {
  env = createEnv()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('API', () => {
  it('répond à /health sans jeton', async () => {
    const res = await app.request('/health', {}, env as unknown as Env)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('refuse un jeton absent ou faux', async () => {
    expect((await post({ images: [IMAGE] }, 'faux')).status).toBe(401)
    const res = await app.request('/extract', { method: 'POST' }, env as unknown as Env)
    expect(res.status).toBe(401)
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('autorise seulement les origines configurées (CORS)', async () => {
    const preflight = (origin: string) =>
      app.request(
        '/extract',
        {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
        },
        env as unknown as Env,
      )
    const allowed = await preflight('http://localhost:5173')
    const other = await preflight('https://site-inconnu.example')
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('refuse une requête invalide', async () => {
    expect((await post({ images: [] })).status).toBe(400)
    expect((await post({ images: [{ mediaType: 'image/gif', data: 'aGVsbG8=' }] })).status).toBe(
      400,
    )
    expect(
      (await post({ images: [{ mediaType: 'image/jpeg', data: 'pas du base64 !' }] })).status,
    ).toBe(400)
    expect((await post({ images: Array(7).fill(IMAGE) })).status).toBe(400)
  })

  it('extrait le texte et le titre du cours', async () => {
    const res = await post({ images: [IMAGE, IMAGE] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ title: 'Les volcans', text: '# Les volcans\n\nUn volcan…' })

    const [model, inputs] = env.AI.run.mock.calls[0] as unknown as [
      string,
      { messages: { content: unknown }[] },
    ]
    expect(model).toBe('modele-de-test')
    expect(JSON.stringify(inputs.messages[1]?.content)).toContain('data:image/jpeg;base64,aGVsbG8=')
  })

  it('signale un cours illisible', async () => {
    env = createEnv({ legible: false, title: '', lines: [] })
    const res = await post({ images: [IMAGE] })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'illegible' })
  })

  it('renvoie ai_failed si la réponse de l’IA ne respecte pas le schéma, sans la logger', async () => {
    env = createEnv('{"legible": "oui", "secret": "contenu du cours"}')
    const res = await post({ images: [IMAGE] })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'ai_failed' })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('contenu du cours')
  })

  it('ne logge pas d’extrait de cours quand le JSON est invalide', async () => {
    env = createEnv('{"lines": ["contenu du cours"')
    expect((await post({ images: [IMAGE] })).status).toBe(502)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('contenu du cours')
  })

  it('accepte une réponse JSON entourée de balises Markdown', async () => {
    env = createEnv('```json\n' + JSON.stringify(EXTRACTION) + '\n```')
    expect((await post({ images: [IMAGE] })).status).toBe(200)
  })

  it('accepte une réponse déjà sous forme d’objet', async () => {
    env = createEnv(EXTRACTION)
    expect((await post({ images: [IMAGE] })).status).toBe(200)
  })

  it('bloque après le quota quotidien', async () => {
    expect((await post({ images: [IMAGE] })).status).toBe(200)
    expect((await post({ images: [IMAGE] })).status).toBe(200)
    const res = await post({ images: [IMAGE] })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'quota_exceeded' })
    expect(env.AI.run).toHaveBeenCalledTimes(2)
  })
})

const COURSE = {
  title: 'Les volcans',
  subject: 'Sciences et technologie',
  text: 'Un volcan est une montagne qui crache de la lave. La lave sort par le cratère.',
}

const SOURCE = 'Un volcan est une montagne qui crache de la lave.'
const sentence = (text: string, source = SOURCE) => ({ source, sentence: text })
const card = (front: string) => ({ front, back: 'Réponse' })
const mcq = (question: string, choices = ['La lave', 'La neige', 'Le sable'], answer = 0) => ({
  type: 'mcq' as const,
  question,
  choices,
  answer,
  explanation: 'Bravo, c’est la lave.',
})
const trueFalse = (question: string, answer = 0) => ({
  type: 'true-false' as const,
  question,
  choices: ['Oui', 'Non'],
  answer,
  explanation: 'C’est écrit dans le cours.',
})

const GENERATED = {
  summary: [sentence(' Un **volcan** crache de la lave. '), sentence('B'), sentence('C')],
  definitions: [
    {
      source: 'La lave sort par le cratère.',
      term: 'Cratère',
      definition: 'Le trou en haut du volcan.',
    },
  ],
  flashcards: [
    card('Qu’est-ce qu’un volcan ?'),
    card('Où sort la lave ?'),
    card('Volcan endormi ?'),
  ],
  quiz: [mcq('Que crache un volcan ?'), mcq('Q2'), trueFalse('La lave sort par le cratère.')],
}

const generateRequest = (body: unknown = COURSE) => post(body, TOKEN, '/generate')

describe('POST /generate', () => {
  it('génère la fiche, les cartes et le quiz', async () => {
    env = createEnv(JSON.stringify(GENERATED))
    const res = await generateRequest()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ReturnType<typeof normalize>

    expect(body.sheet.summary).toEqual(['Un **volcan** crache de la lave.', 'B', 'C'])
    expect(body.flashcards).toHaveLength(3)
    // La bonne réponse suit le mélange des choix
    const first = body.quiz[0]
    expect(first?.choices[first.answer]).toBe('La lave')
    expect(body.quiz[2]).toMatchObject({ type: 'true-false', choices: ['Vrai', 'Faux'], answer: 0 })

    const [, inputs] = env.AI.run.mock.calls[0] as unknown as [
      string,
      { messages: { content: unknown }[] },
    ]
    expect(JSON.stringify(inputs.messages[1]?.content)).toContain(
      'Matière : Sciences et technologie',
    )
  })

  it('refuse un cours trop court sans consommer de quota', async () => {
    env = createEnv(JSON.stringify(GENERATED))
    for (let i = 0; i < 3; i++) {
      expect((await generateRequest({ ...COURSE, text: 'Trop court.' })).status).toBe(400)
    }
    expect((await generateRequest()).status).toBe(200)
  })

  it('réessaie une fois si la réponse est inexploitable, en ne comptant qu’un quota', async () => {
    env = createEnv()
    env.AI.run = vi
      .fn()
      .mockResolvedValueOnce({ response: '{"pas": "le bon format"}' })
      .mockResolvedValueOnce({ response: JSON.stringify(GENERATED) })
    expect((await generateRequest()).status).toBe(200)
    expect(env.AI.run).toHaveBeenCalledTimes(2)
    expect(await env.QUOTA.get(`quota:${new Date().toISOString().slice(0, 10)}`)).toBe('1')
  })

  it('renvoie ai_failed après deux réponses trop pauvres', async () => {
    env = createEnv(JSON.stringify({ ...GENERATED, quiz: [mcq('Une seule question')] }))
    const res = await generateRequest()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'ai_failed' })
    expect(env.AI.run).toHaveBeenCalledTimes(2)
  })
})

describe('nettoyage de la sortie de l’IA', () => {
  it('écarte les questions mal formées', () => {
    expect(normalizeQuestion(mcq('Deux choix', ['A', 'B']))).toBeNull()
    expect(normalizeQuestion(mcq('Doublon', ['A', 'a', 'B']))).toBeNull()
    expect(normalizeQuestion(mcq('Hors limites', ['A', 'B', 'C'], 3))).toBeNull()
    expect(normalizeQuestion(trueFalse('Vrai/faux impossible', 2))).toBeNull()
    expect(normalizeQuestion({ ...mcq('Sans explication'), explanation: ' ' })).toBeNull()
  })

  it('plafonne les quantités', () => {
    const many = <T>(item: T) => Array<T>(12).fill(item)
    const result = normalize(
      {
        summary: many(sentence('Phrase')),
        definitions: many({ source: SOURCE, term: 'Mot', definition: 'Sens' }),
        flashcards: many(card('Carte')),
        quiz: many(mcq('Question')),
      },
      COURSE.text,
    )
    expect(result.sheet.summary).toHaveLength(6)
    expect(result.sheet.definitions).toHaveLength(6)
    expect(result.flashcards).toHaveLength(10)
    expect(result.quiz).toHaveLength(6)
  })

  it('reconnaît une citation du cours malgré accents, ponctuation et Markdown', () => {
    const course = '## Les êtres vivants\n- Stérile : qui ne peut pas avoir de petits.'
    expect(isGrounded('Stérile : qui ne peut pas avoir de petits', course)).toBe(true)
    expect(isGrounded('sterile, qui ne peut pas avoir de petits !', course)).toBe(true)
    expect(isGrounded('Stérile : qui peut avoir des petits.', course)).toBe(false)
    expect(isGrounded('Stérile', course)).toBe(false)
  })

  it('écarte les phrases et définitions dont la citation est absente du cours', () => {
    const result = normalize(
      {
        ...GENERATED,
        summary: [
          ...GENERATED.summary,
          sentence('Inventé', 'Les volcans fabriquent du chocolat chaud.'),
        ],
        definitions: [
          ...GENERATED.definitions,
          { source: 'Phrase absente du cours.', term: 'Faux', definition: 'Inventé.' },
        ],
      },
      COURSE.text,
    )
    expect(result.sheet.summary).not.toContain('Inventé')
    expect(result.sheet.definitions.map((d) => d.term)).toEqual(['Cratère'])
  })

  it('mélange les choix sans perdre la bonne réponse', () => {
    const question = { ...mcq('Q'), choices: ['A', 'B', 'C'], answer: 0 }
    // random() = 0 : chaque élément est échangé avec le premier
    const shuffled = shuffleChoices(question, () => 0)
    expect(shuffled.choices).toEqual(['B', 'C', 'A'])
    expect(shuffled.choices[shuffled.answer]).toBe('A')
  })
})
