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

const SYSTEM_PROMPT = `Tu transcris les photos d'un cours de collège (6e) pour un élève dyslexique.
Règles :
- Recopie tout le contenu du cours, fidèlement et dans l'ordre des photos : chaque phrase, jusqu'au tout dernier mot de la dernière photo. N'en saute aucune, même courte ou écrite dans la marge.
- Corrige en silence l'orthographe, la grammaire et la ponctuation. Ne signale jamais les fautes.
- N'ajoute rien qui ne figure pas sur les photos. Ne résume pas, n'explique pas.
- Garde la structure en Markdown simple : titres avec # ou ##, listes avec -, une ligne vide entre les paragraphes.
- Écris [illisible] à la place d'un passage impossible à lire.
- Ne recopie jamais le nom de l'élève, du professeur, de la classe ni de l'établissement (en-têtes, étiquettes de cahier). Garde les noms qui font partie du cours (personnages historiques, auteurs, lieux).
Réponds uniquement avec un objet JSON, sans balises Markdown autour, avec exactement ces trois champs :
- "legible" : true si tu as pu lire le cours, même en partie ; false seulement si les photos ne montrent aucun cours lisible.
- "title" : le titre du cours tel qu'il est écrit. S'il n'y en a pas, propose un titre court (8 mots maximum) d'après le contenu.
- "lines" : la transcription complète, une ligne Markdown par élément du tableau ; un élément vide "" entre deux paragraphes.`

export const extract = new Hono<{ Bindings: Env }>().post('/', async (c) => {
  const request = extractRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!request.success) throw new HTTPException(400, { message: 'invalid_request' })
  await consumeDailyQuota(c.env)

  const extraction = await generateJson(c.env, {
    model: c.env.EXTRACT_MODEL,
    system: SYSTEM_PROMPT,
    prompt: `Voici ${request.data.images.length} photo(s) du cours à transcrire.`,
    images: request.data.images,
    schema: extractionSchema,
  })

  const text = extraction.lines.join('\n').trim()
  if (!extraction.legible || !text) throw new HTTPException(422, { message: 'illegible' })
  return c.json({ title: extraction.title.trim(), text })
})
