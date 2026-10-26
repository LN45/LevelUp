export interface TextPart {
  text: string
  bold: boolean
}

/** Découpe « un **mot** clé » en morceaux normaux et en gras (sans HTML, donc sans injection) */
export function splitBold(text: string): TextPart[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((part) => part.text)
}

/** Texte sans marques de mise en forme, pour la lecture vocale */
export function plainText(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/^\s*-\s+/gm, '')
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
