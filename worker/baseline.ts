import { isIsoDate } from '../shared/schedule'
import { MILES_MESSAGE, parseMiles } from './validate'

export interface BaselineInput {
  baselineDate: string | null
  baselineOdometer: number | null
}

export type ParseResult =
  { ok: true; value: BaselineInput } | { ok: false; fields: Record<string, string> }

/** Validates a baseline update body. `today` is YYYY-MM-DD in Eastern time. */
export function parseBaselineInput(body: unknown, today: string): ParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, fields: { body: 'Expected a JSON object.' } }
  }
  const input = body as Record<string, unknown>
  const fields: Record<string, string> = {}

  const date = input.baselineDate
  if (!('baselineDate' in input)) {
    fields.baselineDate = 'Required (use null to leave blank).'
  } else if (date !== null) {
    if (typeof date !== 'string' || !isIsoDate(date)) {
      fields.baselineDate = 'Enter a valid date.'
    } else if (date > today) {
      fields.baselineDate = "Date can't be in the future."
    }
  }

  const odometer = input.baselineOdometer
  if (!('baselineOdometer' in input)) {
    fields.baselineOdometer = 'Required (use null to leave blank).'
  } else if (parseMiles(odometer) === undefined) {
    fields.baselineOdometer = MILES_MESSAGE
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return {
    ok: true,
    value: { baselineDate: date as string | null, baselineOdometer: odometer as number | null },
  }
}
