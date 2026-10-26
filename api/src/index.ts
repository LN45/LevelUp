import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { timingSafeEqual } from 'hono/utils/buffer'

import { AiError } from './ai'
import { extract } from './extract'
import { generate } from './generate'

declare global {
  interface Env {
    // Secret (.dev.vars en local, wrangler secret en production) : absent des types générés
    // tant que .dev.vars n'existe pas
    APP_TOKEN: string
  }
}

type AppEnv = { Bindings: Env }

const MAX_BODY_BYTES = 15 * 1024 * 1024

/** Jeton d'appli : barrière légère (il est visible dans le front), complétée par CORS et quota */
const requireAppToken: MiddlewareHandler<AppEnv> = async (c, next) => {
  const expected = c.env.APP_TOKEN
  if (!expected) throw new HTTPException(500, { message: 'server_misconfigured' })
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? ''
  if (!(await timingSafeEqual(token, expected))) {
    throw new HTTPException(401, { message: 'unauthorized' })
  }
  await next()
}

export const app = new Hono<AppEnv>()
  .use('*', (c, next) =>
    cors({
      origin: c.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86_400,
    })(c, next),
  )
  .get('/health', (c) => c.json({ ok: true }))
  .use('*', requireAppToken)
  .use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new HTTPException(413, { message: 'payload_too_large' })
      },
    }),
  )
  .route('/extract', extract)
  .route('/generate', generate)
  .notFound((c) => c.json({ error: 'not_found' }, 404))
  .onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
    // Jamais de contenu de cours ni de réponse de l'IA dans les logs : messages techniques seulement
    console.error(`${error.name}: ${error.message}`)
    if (error instanceof AiError) return c.json({ error: 'ai_failed' }, 502)
    return c.json({ error: 'server_error' }, 500)
  })

export default app
