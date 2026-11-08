import { describe, expect, it } from 'vitest'
import { formatCents, MAX_CENTS, parseDollarsToCents } from './money'

describe('parseDollarsToCents', () => {
  it.each([
    ['0', 0],
    ['12', 1200],
    ['12.5', 1250],
    ['12.34', 1234],
    ['  $49.99 ', 4999],
    ['$1,234.50', 123450],
    ['1234.5', 123450],
    ['0.07', 7],
    ['99,999.99', MAX_CENTS],
  ])('parses %s', (text, cents) => {
    expect(parseDollarsToCents(text)).toBe(cents)
  })

  it.each(['', ' ', '-5', '12.345', 'abc', '$', '.5', '12.', '1,2,3', '12,34', '100000', '1e3', '$$5'])(
    'rejects %s',
    (text) => {
      expect(parseDollarsToCents(text)).toBeNull()
    },
  )
})

describe('formatCents', () => {
  it('formats US dollars', () => {
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(123450)).toBe('$1,234.50')
  })
})
