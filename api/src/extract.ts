import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

import { generateJson } from './ai'
import { consumeDailyQuota } from './quota'

export const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const imageSchema = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  // Taille en base64 : 4 caractères pour 3 octets
  data: z.base64().max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3)),
})

export const extractRequestSchema = z.object({
  images: z.array(imageSchema).min(1).max(MAX_IMAGES),
})

// Une ligne par élément : en sortie JSON contrainte, le modèle remplace les \n par des espaces
export const extractionSchema = z.object({
  legible: z.boolean(),
  title: z.string().max(120),
  lines: z.array(z.string().max(2_000)).max(1_000),
})

const SYSTEM_PROMPT = `Tu transcris la photo d'une page de cours de collège (6e) pour un élève dyslexique.
Règles :
- Recopie tout le contenu de la page, fidèlement et dans l'ordre : chaque phrase, jusqu'au tout dernier mot. N'en saute aucune, même courte ou écrite dans la marge.
- Corrige en silence l'orthographe, la grammaire et la ponctuation. Ne signale jamais les fautes.
- N'ajoute rien qui ne figure pas sur les photos. Ne résume pas, n'explique pas.
- Garde la structure en Markdown simple : titres avec # ou ##, listes avec -, une ligne vide entre les paragraphes.
- Écris [illisible] à la place d'un passage impossible à lire.
- Ne recopie jamais le nom de l'élève, du professeur, de la classe ni de l'établissement (en-têtes, étiquettes de cahier). Garde les noms qui font partie du cours (personnages historiques, auteurs, lieux).
Réponds uniquement avec un objet JSON, sans balises Markdown autour, avec exactement ces trois champs :
- "legible" : true si tu as pu lire la page, même en partie ; false seulement si la photo ne montre aucun cours lisible.
- "title" : le titre du cours tel qu'il est écrit sur la page. S'il n'y en a pas, propose un titre court (8 mots maximum) d'après le contenu.
- "lines" : la transcription complète, une ligne Markdown par élément du tableau ; un élément vide "" entre deux paragraphes.`

export const extract = new Hono<{ Bindings: Env }>().post('/', async (c) => {
  const request = extractRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!request.success) throw new HTTPException(400, { message: 'invalid_request' })
  await consumeDailyQuota(c.env)

  // Une photo par appel : le modèle ne lit pas de façon fiable plusieurs images à la fois
  const { images } = request.data
  const pages = await Promise.all(
    images.map((image, index) =>
      generateJson(c.env, {
        model: c.env.EXTRACT_MODEL,
        system: SYSTEM_PROMPT,
        prompt: `Voici la page ${index + 1} sur ${images.length} du cours à transcrire.`,
        images: [image],
        schema: extractionSchema,
      }),
    ),
  )

  // Une page illisible n'empêche pas de garder les autres
  const legible = pages
    .filter((page) => page.legible)
    .map((page) => ({ title: page.title.trim(), text: page.lines.join('\n').trim() }))
    .filter((page) => page.text)
  if (!legible.length) throw new HTTPException(422, { message: 'illegible' })
  return c.json({
    title: legible[0]?.title ?? '',
    text: legible.map((page) => page.text).join('\n\n'),
  })
})
