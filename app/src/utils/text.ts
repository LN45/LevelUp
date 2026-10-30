export interface TextPart {
  text: string
  bold: boolean
  /** Passage [entre crochets] : dans la langue de la matière (anglais, espagnol…) */
  foreign: boolean
}

// « [illisible] » : ancienne marque de la lecture des photos, en français
const RICH_TOKENS = /(\*\*|\[illisible\]|\[|\])/

/** Découpe « un **mot** et [a word] » en morceaux (sans HTML, donc sans injection) */
export function splitRich(text: string): TextPart[] {
  const parts: TextPart[] = []
  let bold = false
  let foreign = false
  for (const token of text.split(RICH_TOKENS)) {
    if (token === '**') bold = !bold
    else if (token === '[') foreign = true
    else if (token === ']') foreign = false
    else if (token) parts.push({ text: token, bold, foreign })
  }
  return parts
}

export type SpeechSegment = Omit<TextPart, 'bold'>

/** Morceaux à lire à voix haute, sans marques de mise en forme, chacun dans sa langue */
export function speechSegments(text: string): SpeechSegment[] {
  const plain = text.replace(/^\s*#+\s*/gm, '').replace(/^\s*-\s+/gm, '')
  const segments: SpeechSegment[] = []
  for (const { text: part, foreign } of splitRich(plain)) {
    const last = segments[segments.length - 1]
    if (last?.foreign === foreign) last.text += part
    else segments.push({ text: part, foreign })
  }
  // Un morceau sans lettre ni chiffre (ponctuation seule) n'a rien à lire
  return segments.filter((segment) => /[\p{L}\p{N}]/u.test(segment.text))
}

/** « 12 octobre 2026 » */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export type CourseLine = { kind: 'title' | 'item' | 'paragraph'; text: string }

/** Lignes du texte du cours (Markdown simple : # titres, - listes) pour l'afficher sans symboles */
export function courseLines(markdown: string): CourseLine[] {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): CourseLine => {
      if (line.startsWith('#')) return { kind: 'title', text: line.replace(/^#+\s*/, '') }
      if (/^[-*]\s/.test(line)) return { kind: 'item', text: line.slice(2).trim() }
      return { kind: 'paragraph', text: line }
    })
}
