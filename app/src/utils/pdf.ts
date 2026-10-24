import type { TextContent } from 'pdfjs-dist/types/src/display/api'

import { MAX_IMAGE_SIDE, toJpeg } from './images'

/** En dessous, la page est considérée comme scannée (image sans texte) */
const MIN_CHARS_PER_PAGE = 100
const TITLE_MAX_LENGTH = 80

export type PdfContent =
  | { kind: 'text'; title: string; text: string }
  | { kind: 'images'; images: Blob[]; skippedPages: number }

export function pageText(content: TextContent): string {
  return content.items
    .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
    .join('')
}

export function hasUsableText(pageTexts: string[]): boolean {
  const chars = pageTexts.join('').replace(/\s/g, '').length
  return chars >= MIN_CHARS_PER_PAGE * pageTexts.length
}

/** Première ligne non vide, raccourcie : titre proposé pour un PDF lu sans IA */
export function guessTitle(text: string): string {
  const firstLine =
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  return firstLine.length > TITLE_MAX_LENGTH
    ? `${firstLine.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : firstLine
}

/**
 * PDF avec du texte : extrait directement sur le téléphone (aucun envoi à l'IA).
 * PDF scanné : pages rendues en images (maxPages au plus) pour passer par /extract.
 */
export async function readPdf(file: Blob, maxPages: number): Promise<PdfContent> {
  // Chargé seulement quand on importe un PDF (bibliothèque lourde)
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const pdf = await loadingTask.promise
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
    )
    const texts = await Promise.all(
      pages.map(async (page) => pageText(await page.getTextContent())),
    )
    if (hasUsableText(texts)) {
      const text = texts
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      return { kind: 'text', title: guessTitle(text), text }
    }

    const images: Blob[] = []
    for (const page of pages.slice(0, maxPages)) {
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({
        scale: MAX_IMAGE_SIDE / Math.max(base.width, base.height),
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport }).promise
      images.push(await toJpeg(canvas))
    }
    return { kind: 'images', images, skippedPages: Math.max(0, pages.length - maxPages) }
  } finally {
    // Libère le document et le worker pdf.js
    await loadingTask.destroy()
  }
}
