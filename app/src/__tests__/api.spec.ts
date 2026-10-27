import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, extractCourse, toErrorCode } from '@/api'

const IMAGE = { mediaType: 'image/jpeg' as const, data: 'aGVsbG8=' }

function mockFetch(response: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (response instanceof Error) throw response
      return response
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('client API', () => {
  it('traduit les codes d’erreur connus et inconnus', () => {
    expect(toErrorCode('quota_exceeded')).toBe('quota_exceeded')
    expect(toErrorCode('nouveau_code')).toBe('unknown')
    expect(toErrorCode(42)).toBe('unknown')
  })

  it('renvoie le cours extrait', async () => {
    mockFetch(Response.json({ title: 'Les volcans', text: '# Les volcans' }))
    expect(await extractCourse([IMAGE])).toEqual({ title: 'Les volcans', text: '# Les volcans' })
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(url).toBe('/api/extract')
    // Jeton vide en CI (fourni seulement au build) : on vérifie juste que l'en-tête est envoyé
    expect(new Headers(init?.headers).get('Authorization')).toMatch(/^Bearer\b/)
  })

  it('transforme une erreur de l’API en message clair', async () => {
    mockFetch(Response.json({ error: 'quota_exceeded' }, { status: 429 }))
    const error = await extractCourse([IMAGE]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('quota_exceeded')
    expect((error as ApiError).message).toContain('Réessaie demain')
  })

  it('signale une absence de réseau', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    await expect(extractCourse([IMAGE])).rejects.toMatchObject({ code: 'network' })
  })

  it('gère une réponse d’erreur qui n’est pas du JSON', async () => {
    mockFetch(new Response('Bad Gateway', { status: 502 }))
    await expect(extractCourse([IMAGE])).rejects.toMatchObject({ code: 'unknown' })
  })
})
