// Seul module qui connaît le fournisseur d'IA (Cloudflare Workers AI) :
// pour en changer, il suffit de réécrire generateJson.
import { z } from 'zod'

export interface ImageInput {
  mediaType: string
  /** Contenu de l'image encodé en base64 */
  data: string
}

/** L'IA n'a pas répondu, ou pas avec un JSON conforme au schéma */
export class AiError extends Error {
  override name = 'AiError'
}

// Workers AI type run() par nom de modèle littéral ; ici le modèle vient de la configuration
type RunModel = (model: string, inputs: object) => Promise<{ response?: unknown }>

export async function generateJson<T extends z.ZodType>(
  env: Env,
  options: { system: string; prompt: string; images?: ImageInput[]; schema: T },
): Promise<z.infer<T>> {
  const { system, prompt, images = [], schema } = options
  const content = [
    { type: 'text', text: prompt },
    ...images.map((image) => ({
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.data}` },
    })),
  ]

  let response: unknown
  try {
    const result = await (env.AI.run as RunModel)(env.AI_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      response_format: { type: 'json_schema', json_schema: z.toJSONSchema(schema) },
      max_tokens: 4096,
      // 0 : on veut une recopie, pas de la créativité
      temperature: 0,
    })
    response = result.response
  } catch (error) {
    // Message technique du fournisseur (quota, modèle inconnu…), sans contenu de cours
    throw new AiError(`Workers AI : ${error instanceof Error ? error.message : 'erreur inconnue'}`)
  }

  try {
    // Certains modèles entourent quand même le JSON de balises Markdown ```json
    const data: unknown =
      typeof response === 'string'
        ? JSON.parse(response.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''))
        : response
    return schema.parse(data)
  } catch {
    // Pas de cause : le message de JSON.parse contiendrait un extrait de la réponse
    throw new AiError('Réponse de l’IA non conforme au schéma')
  }
}
