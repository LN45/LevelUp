import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function post(body: unknown, token = TOKEN) {
  return app.request(
    '/extract',
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
