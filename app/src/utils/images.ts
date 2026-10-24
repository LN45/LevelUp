export const MAX_IMAGE_SIDE = 1600
/** Limite par image de l'API */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const JPEG_QUALITIES = [0.8, 0.65, 0.5]

/** Dimensions réduites pour que le plus grand côté ne dépasse pas maxSide (jamais agrandies) */
export function fitWithin(width: number, height: number, maxSide = MAX_IMAGE_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Réduit une image (bitmap ou page de PDF rendue) et l'encode en JPEG de moins de 2 Mo */
export async function toJpeg(source: ImageBitmap | HTMLCanvasElement): Promise<Blob> {
  const { width, height } = fitWithin(source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D indisponible')
  context.drawImage(source, 0, 0, width, height)

  for (const quality of JPEG_QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob
  }
  throw new Error('Image trop lourde même compressée')
}

/** Photo prise ou choisie : redressée selon l'EXIF, réduite et compressée */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return await toJpeg(bitmap)
  } finally {
    bitmap.close()
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    // Résultat « data:image/jpeg;base64,xxxx » : on ne garde que la partie base64
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
