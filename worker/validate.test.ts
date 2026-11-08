import { describe, expect, it } from 'vitest'
import { MAX_ODOMETER, MILES_MESSAGE, parseMiles } from './validate'

describe('parseMiles', () => {
  it.each([0, 1, 123_456, MAX_ODOMETER])('accepts %s', (value) => {
    expect(parseMiles(value)).toBe(value)
  })

  it.each([null, undefined])('returns null for %s', (value) => {
    expect(parseMiles(value)).toBeNull()
  })

  it.each([MAX_ODOMETER + 1, -1, 1.5, '100', NaN, Infinity, true, {}, []])(
    'rejects %s',
    (value) => {
      expect(parseMiles(value)).toBeUndefined()
    },
  )

  it('formats the limit in the message', () => {
    expect(MILES_MESSAGE).toBe('Enter whole miles from 0 to 999,999.')
  })
})
