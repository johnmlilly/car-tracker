import { MAX_RECEIPT_BYTES } from '../shared/api'

export const MAX_EDGE = 1600
const WEBP_QUALITY = 0.75

export const PREPARE_MESSAGES = {
  type: 'Use a photo or a PDF.',
  size: 'File is larger than 10 MB.',
  decode: "Couldn't read that image. Try another photo or file.",
} as const

/** Scales so the longer edge is at most `max`; never enlarges. */
export function fitWithin(width: number, height: number, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export type FileKind = { kind: 'image' } | { kind: 'pdf' } | { error: string }

export function classifyFile(file: { type: string; size: number }): FileKind {
  if (file.type === 'application/pdf') {
    return file.size > MAX_RECEIPT_BYTES ? { error: PREPARE_MESSAGES.size } : { kind: 'pdf' }
  }
  if (file.type.startsWith('image/')) return { kind: 'image' }
  return { error: PREPARE_MESSAGES.type }
}

export class PrepareError extends Error {}

/** A PDF unchanged, or the image re-encoded as WebP at most MAX_EDGE px on its longer side. */
export async function prepareReceipt(file: File): Promise<Blob> {
  const kind = classifyFile(file)
  if ('error' in kind) throw new PrepareError(kind.error)
  if (kind.kind === 'pdf') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (err) {
    console.error(err)
    throw new PrepareError(PREPARE_MESSAGES.decode)
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new PrepareError(PREPARE_MESSAGES.decode)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
  )
  if (!blob) throw new PrepareError(PREPARE_MESSAGES.decode)
  if (blob.size > MAX_RECEIPT_BYTES) throw new PrepareError(PREPARE_MESSAGES.size)
  return blob
}
