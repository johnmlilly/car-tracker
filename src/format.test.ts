import { describe, expect, it } from 'vitest'
import { formatDate, formatInterval, formatMiles, formatPoint } from './format'

describe('format', () => {
  it('formats dates without timezone shifts', () => {
    expect(formatDate('2027-01-01')).toBe('Jan 1, 2027')
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
  })
  it('formats miles with separators', () => {
    expect(formatMiles(71000)).toBe('71,000 mi')
  })
  it('joins known parts of a due point', () => {
    expect(formatPoint('2027-08-01', 71000)).toBe('Aug 1, 2027 or 71,000 mi')
    expect(formatPoint(null, 71000)).toBe('71,000 mi')
    expect(formatPoint(null, null)).toBeNull()
    expect(formatPoint('2024-09-15', 58000, 'at')).toBe('Sep 15, 2024 at 58,000 mi')
  })
  it('describes intervals', () => {
    expect(formatInterval(10000, 12)).toBe('Every 10,000 mi or 12 months')
    expect(formatInterval(120000, null)).toBe('Every 120,000 mi')
    expect(formatInterval(null, 1)).toBe('Every 1 month')
  })
})
