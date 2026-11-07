import { describe, expect, it } from 'vitest'
import { findConflict, parseOdometerInput } from './odometer'

const TODAY = '2026-11-07'

describe('parseOdometerInput', () => {
  it('accepts a valid reading', () => {
    expect(parseOdometerInput({ date: '2026-11-07', odometer: 61_000 }, TODAY)).toEqual({
      ok: true,
      value: { date: '2026-11-07', odometer: 61_000 },
    })
  })

  it.each([null, [], 'text', 5])('rejects a non-object body %j', (body) => {
    expect(parseOdometerInput(body, TODAY)).toEqual({
      ok: false,
      fields: { body: 'Expected a JSON object.' },
    })
  })

  it('requires both fields', () => {
    const result = parseOdometerInput({}, TODAY)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.fields).sort()).toEqual(['date', 'odometer'])
  })

  it.each([null, '', '2026-02-30', '11/07/2026', 20261107])('rejects date %j', (date) => {
    const result = parseOdometerInput({ date, odometer: 1 }, TODAY)
    expect(result).toEqual({ ok: false, fields: { date: 'Enter a valid date.' } })
  })

  it('rejects a future date', () => {
    const result = parseOdometerInput({ date: '2026-11-08', odometer: 1 }, TODAY)
    expect(result).toEqual({ ok: false, fields: { date: "Date can't be in the future." } })
  })

  it.each([null, '61000', 1.5, -1, 1_000_000, Number.NaN])('rejects odometer %j', (odometer) => {
    const result = parseOdometerInput({ date: TODAY, odometer }, TODAY)
    expect(result).toEqual({
      ok: false,
      fields: { odometer: 'Enter whole miles from 0 to 999,999.' },
    })
  })

  it('accepts the odometer bounds', () => {
    expect(parseOdometerInput({ date: TODAY, odometer: 0 }, TODAY).ok).toBe(true)
    expect(parseOdometerInput({ date: TODAY, odometer: 999_999 }, TODAY).ok).toBe(true)
  })
})

describe('findConflict', () => {
  const existing = [
    { date: '2026-01-01', odometer: 50_000 },
    { date: '2026-06-01', odometer: 55_000 },
    { date: '2026-10-01', odometer: 60_000 },
  ]

  it('accepts a reading that fits between neighbors', () => {
    expect(findConflict(existing, { date: '2026-08-01', odometer: 57_000 })).toBeNull()
  })

  it('accepts a first reading', () => {
    expect(findConflict([], { date: '2026-08-01', odometer: 0 })).toBeNull()
  })

  it('flags a reading lower than the highest earlier one', () => {
    expect(findConflict(existing, { date: '2026-11-01', odometer: 54_000 })).toBe(
      'Lower than 60,000 mi logged on Oct 1, 2026.',
    )
  })

  it('flags a reading higher than the lowest later one', () => {
    expect(findConflict(existing, { date: '2025-12-01', odometer: 56_000 })).toBe(
      'Higher than 50,000 mi logged on Jan 1, 2026.',
    )
  })

  it('allows equal values on different dates', () => {
    expect(findConflict(existing, { date: '2026-11-01', odometer: 60_000 })).toBeNull()
    expect(findConflict(existing, { date: '2025-12-01', odometer: 50_000 })).toBeNull()
  })

  it('never conflicts with a reading on the same date', () => {
    expect(findConflict(existing, { date: '2026-10-01', odometer: 59_500 })).toBeNull()
  })
})
