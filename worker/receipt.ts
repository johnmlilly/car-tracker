import { MAX_RECEIPT_BYTES, type ReceiptContentType } from '../shared/api'
import { parseId } from './http'

export const FILE_MESSAGES = {
  missing: 'Choose a photo or PDF.',
  type: 'Use a photo or a PDF.',
  size: 'File is larger than 10 MB.',
} as const

export const VEHICLE_MESSAGE = 'Choose a vehicle.'

/**
 * The receipt type from the file's leading bytes, or null for anything else.
 * The app's client re-encodes photos to WebP or JPEG; PNG is accepted
 * deliberately as a fallback for browsers that can encode neither.
 */
export function sniffReceiptType(bytes: Uint8Array): ReceiptContentType | null {
  const startsWith = (prefix: number[], at = 0) => prefix.every((b, i) => bytes[at + i] === b)
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
  if (startsWith(ascii('RIFF')) && startsWith(ascii('WEBP'), 8)) return 'image/webp'
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(ascii('%PDF-'))) return 'application/pdf'
  return null
}

export interface ReceiptUpload {
  vehicleId: number
  file: File
  contentType: ReceiptContentType
}

export type ReceiptParseResult =
  { ok: true; value: ReceiptUpload } | { ok: false; fields: Record<string, string> }

/**
 * Validates a parsed multipart body. The stored type comes from the file's
 * bytes; the declared MIME type and filename are untrusted and ignored.
 */
export async function parseReceiptUpload(
  body: Record<string, unknown>,
): Promise<ReceiptParseResult> {
  const fields: Record<string, string> = {}

  const vehicleId = typeof body.vehicleId === 'string' ? parseId(body.vehicleId) : null
  if (vehicleId === null) fields.vehicleId = VEHICLE_MESSAGE

  const file = body.file
  let contentType: ReceiptContentType | null = null
  if (!(file instanceof File) || file.size === 0) {
    fields.file = FILE_MESSAGES.missing
  } else if (file.size > MAX_RECEIPT_BYTES) {
    fields.file = FILE_MESSAGES.size
  } else {
    contentType = sniffReceiptType(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
    if (contentType === null) fields.file = FILE_MESSAGES.type
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return {
    ok: true,
    value: { vehicleId: vehicleId!, file: file as File, contentType: contentType! },
  }
}
