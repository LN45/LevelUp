import { HTTPException } from 'hono/http-exception'

/**
 * Quota quotidien partagé par toutes les routes qui appellent l'IA.
 * À appeler juste avant l'appel, après validation : une requête invalide ne consomme rien.
 * KV n'est pas atomique : deux requêtes simultanées peuvent dépasser d'une unité, c'est acceptable ici.
 */
export async function consumeDailyQuota(env: Env): Promise<void> {
  const key = `quota:${new Date().toISOString().slice(0, 10)}`
  const used = Number(await env.QUOTA.get(key)) || 0
  if (used >= Number(env.DAILY_LIMIT)) {
    throw new HTTPException(429, { message: 'quota_exceeded' })
  }
  await env.QUOTA.put(key, String(used + 1), { expirationTtl: 2 * 24 * 3600 })
}
