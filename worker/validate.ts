export const MAX_ODOMETER = 999_999

export const MILES_MESSAGE = `Enter whole miles from 0 to ${MAX_ODOMETER.toLocaleString('en-US')}.`

/**
 * Odometer miles from a JSON value: the integer when valid, `null` when the
 * value is null or absent, `undefined` when invalid. Callers decide whether
 * null is allowed.
 */
export function parseMiles(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_ODOMETER) {
    return undefined
  }
  return value
}
