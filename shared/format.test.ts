import { describe, expect, it } from 'vitest'
import { formatDate, formatMiles } from './format'

describe('shared format', () => {
  it('formats dates without timezone shifts', () => {
    expect(formatDate('2027-01-01')).toBe('Jan 1, 2027')
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
  })
  it('formats miles with separators', () => {
    expect(formatMiles(71000)).toBe('71,000 mi')
  })
})
