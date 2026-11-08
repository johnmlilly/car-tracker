import { formatDate, formatMiles } from '../shared/format'
import type { Reading } from '../shared/mileage'
import { isIsoDate } from '../shared/schedule'
import { MILES_MESSAGE, parseMiles } from './validate'

export type OdometerParseResult =
  { ok: true; value: Reading } | { ok: false; fields: Record<string, string> }

/** Validates a new-reading body. `today` is YYYY-MM-DD in Eastern time. */
export function parseOdometerInput(body: unknown, today: string): OdometerParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, fields: { body: 'Expected a JSON object.' } }
  }
  const { date, odometer } = body as Record<string, unknown>
  const fields: Record<string, string> = {}

  if (typeof date !== 'string' || !isIsoDate(date)) {
    fields.date = 'Enter a valid date.'
  } else if (date > today) {
    fields.date = "Date can't be in the future."
  }

  if (typeof parseMiles(odometer) !== 'number') fields.odometer = MILES_MESSAGE

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return { ok: true, value: { date: date as string, odometer: odometer as number } }
}

/**
 * Message for a reading that would make the odometer run backwards against the
 * vehicle's other readings, most likely a typo. Same-date readings are exempt.
 */
export function findConflict(existing: Reading[], input: Reading): string | null {
  const higherBefore = existing
    .filter((r) => r.date < input.date && r.odometer > input.odometer)
    .sort((a, b) => b.odometer - a.odometer)[0]
  if (higherBefore) {
    return `Lower than ${formatMiles(higherBefore.odometer)} logged on ${formatDate(higherBefore.date)}.`
  }
  const lowerAfter = existing
    .filter((r) => r.date > input.date && r.odometer < input.odometer)
    .sort((a, b) => a.odometer - b.odometer)[0]
  if (lowerAfter) {
    return `Higher than ${formatMiles(lowerAfter.odometer)} logged on ${formatDate(lowerAfter.date)}.`
  }
  return null
}
