import { describe, expect, it } from 'vitest'
import { parseBaselineInput } from './baseline'

const today = '2026-11-07'

describe('parseBaselineInput', () => {
  it('accepts a date and odometer', () => {
    expect(
      parseBaselineInput({ baselineDate: '2026-08-01', baselineOdometer: 61000 }, today),
    ).toEqual({
      ok: true,
      value: { baselineDate: '2026-08-01', baselineOdometer: 61000 },
    })
  })

  it('accepts today and both-null (clear)', () => {
    expect(parseBaselineInput({ baselineDate: today, baselineOdometer: null }, today).ok).toBe(true)
    expect(parseBaselineInput({ baselineDate: null, baselineOdometer: null }, today)).toEqual({
      ok: true,
      value: { baselineDate: null, baselineOdometer: null },
    })
  })

  it.each([null, 'x', [1], 3])('rejects non-object body %j', (body) => {
    expect(parseBaselineInput(body, today)).toEqual({
      ok: false,
      fields: { body: 'Expected a JSON object.' },
    })
  })

  it('requires both keys', () => {
    const result = parseBaselineInput({}, today)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(Object.keys(result.fields).sort()).toEqual(['baselineDate', 'baselineOdometer'])
  })

  it.each(['2026-02-30', '11/07/2026', 20261107])('rejects invalid date %j', (baselineDate) => {
    const result = parseBaselineInput({ baselineDate, baselineOdometer: null }, today)
    expect(result).toEqual({ ok: false, fields: { baselineDate: 'Enter a valid date.' } })
  })

  it('rejects a future date', () => {
    const result = parseBaselineInput({ baselineDate: '2026-11-08', baselineOdometer: null }, today)
    expect(result).toEqual({ ok: false, fields: { baselineDate: "Date can't be in the future." } })
  })

  it.each([-1, 1.5, 1_000_000, '61000', Number.NaN])('rejects odometer %j', (baselineOdometer) => {
    const result = parseBaselineInput({ baselineDate: null, baselineOdometer }, today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.fields).toHaveProperty('baselineOdometer')
  })

  it('accepts the odometer bounds', () => {
    expect(parseBaselineInput({ baselineDate: null, baselineOdometer: 0 }, today).ok).toBe(true)
    expect(parseBaselineInput({ baselineDate: null, baselineOdometer: 999_999 }, today).ok).toBe(
      true,
    )
  })
})
