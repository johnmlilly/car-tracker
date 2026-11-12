import type { ReceiptExtraction, ReceiptExtractionLine } from '../shared/api'
import { MAX_CENTS } from '../shared/money'
import { isIsoDate } from '../shared/schedule'
import { normalizeCode } from './minder'
import { MAX_DESCRIPTION_LENGTH, MAX_LINE_ITEMS, MAX_SHOP_LENGTH } from './serviceRecord'
import { parseMiles } from './validate'

/** The receipt couldn't be read into usable data. The message is for logs only. */
export class ExtractError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_CENTS
    ? value
    : null
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, max).trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Cleans model output into a `ReceiptExtraction`. Lenient: a bad field becomes
 * null (the user fixes it at review) and a line without a description is
 * dropped. `today` is YYYY-MM-DD in Eastern time. Throws only for a non-object.
 */
export function parseExtraction(raw: unknown, today: string): ReceiptExtraction {
  if (!isObject(raw)) throw new ExtractError('Extraction is not an object')

  const date =
    typeof raw.date === 'string' && isIsoDate(raw.date) && raw.date <= today ? raw.date : null
  const odometer = parseMiles(raw.odometer) ?? null
  const minderCode = typeof raw.minderCode === 'string' ? normalizeCode(raw.minderCode) : null

  const lineItems: ReceiptExtractionLine[] = []
  if (Array.isArray(raw.lineItems)) {
    for (const line of raw.lineItems.slice(0, MAX_LINE_ITEMS)) {
      if (!isObject(line)) continue
      const description = text(line.description, MAX_DESCRIPTION_LENGTH)
      if (description === null) continue
      lineItems.push({ description, amountCents: cents(line.amountCents) })
    }
  }

  return {
    date,
    shop: text(raw.shop, MAX_SHOP_LENGTH),
    odometer,
    totalCents: cents(raw.totalCents),
    minderCode,
    lineItems,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The one service whose keywords appear in `description` as whole words or
 * phrases (case-insensitive), optionally pluralized with `s` or `es`. Null when
 * no service or more than one matches.
 */
export function matchService(
  description: string,
  services: { id: number; keywords: string[] }[],
): number | null {
  const matched = services.filter((service) =>
    service.keywords.some((keyword) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(keyword)}(?:e?s)?(?![\\p{L}\\p{N}])`, 'iu').test(
        description,
      ),
    ),
  )
  return matched.length === 1 ? matched[0].id : null
}
