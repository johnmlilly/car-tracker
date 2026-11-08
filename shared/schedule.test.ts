import { describe, expect, it } from 'vitest'
import {
  addMonths,
  computeDue,
  computeStatus,
  isIsoDate,
  resolveLastDone,
  todayInEastern,
} from './schedule'

describe('todayInEastern', () => {
  it('uses the Eastern date, not UTC', () => {
    expect(todayInEastern(new Date('2026-11-08T03:00:00Z'))).toBe('2026-11-07')
    expect(todayInEastern(new Date('2026-11-08T06:00:00Z'))).toBe('2026-11-08')
  })
})

describe('isIsoDate', () => {
  it('accepts real dates and rejects malformed or impossible ones', () => {
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-1-01')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })
})

describe('addMonths', () => {
  it('adds calendar months across years', () => {
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15')
    expect(addMonths('2026-11-07', 6)).toBe('2027-05-07')
  })
  it('clamps to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2027-01-31', 13)).toBe('2028-02-29')
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30')
  })
})

describe('computeDue', () => {
  const base = {
    intervalMiles: 10000,
    intervalMonths: 12,
    lastDoneDate: null,
    lastDoneOdometer: null,
  }

  it('returns nulls without a last-done point', () => {
    expect(computeDue(base)).toEqual({ nextDueDate: null, nextDueMiles: null })
  })
  it('computes both dimensions when both are known', () => {
    expect(computeDue({ ...base, lastDoneDate: '2026-08-01', lastDoneOdometer: 61000 })).toEqual({
      nextDueDate: '2027-08-01',
      nextDueMiles: 71000,
    })
  })
  it('leaves a dimension null when the interval lacks it', () => {
    expect(
      computeDue({
        ...base,
        intervalMonths: null,
        lastDoneDate: '2026-08-01',
        lastDoneOdometer: 5,
      }),
    ).toEqual({ nextDueDate: null, nextDueMiles: 10005 })
  })
})

describe('resolveLastDone', () => {
  const noBaseline = { baselineDate: null, baselineOdometer: null }
  const baseline = { baselineDate: '2026-03-01', baselineOdometer: 50000 }

  it('is empty with no baseline and no records', () => {
    expect(resolveLastDone(noBaseline, [])).toEqual({ lastDoneDate: null, lastDoneOdometer: null })
  })
  it('uses the baseline alone', () => {
    expect(resolveLastDone(baseline, [])).toEqual({
      lastDoneDate: '2026-03-01',
      lastDoneOdometer: 50000,
    })
  })
  it('uses records alone, newest date and highest odometer in any order', () => {
    const records = [
      { date: '2026-09-01', odometer: 58000 },
      { date: '2026-01-15', odometer: 49000 },
    ]
    expect(resolveLastDone(noBaseline, records)).toEqual({
      lastDoneDate: '2026-09-01',
      lastDoneOdometer: 58000,
    })
  })
  it('prefers a newer record over the baseline', () => {
    expect(resolveLastDone(baseline, [{ date: '2026-06-01', odometer: 54000 }])).toEqual({
      lastDoneDate: '2026-06-01',
      lastDoneOdometer: 54000,
    })
  })
  it('keeps a newer baseline over an older record', () => {
    expect(resolveLastDone(baseline, [{ date: '2025-12-01', odometer: 47000 }])).toEqual({
      lastDoneDate: '2026-03-01',
      lastDoneOdometer: 50000,
    })
  })
  it('advances only the date for a record without an odometer', () => {
    expect(resolveLastDone(baseline, [{ date: '2026-06-01', odometer: null }])).toEqual({
      lastDoneDate: '2026-06-01',
      lastDoneOdometer: 50000,
    })
  })
  it('combines a date-only baseline with a record odometer', () => {
    expect(
      resolveLastDone({ baselineDate: '2026-08-01', baselineOdometer: null }, [
        { date: '2026-05-01', odometer: 52000 },
      ]),
    ).toEqual({ lastDoneDate: '2026-08-01', lastDoneOdometer: 52000 })
  })
})

describe('computeStatus', () => {
  const today = '2026-11-07'

  it('is unknown when nothing is computable', () => {
    expect(computeStatus({ nextDueDate: null, nextDueMiles: null }, today, null)).toBe('unknown')
    expect(computeStatus({ nextDueDate: null, nextDueMiles: 70000 }, today, null)).toBe('unknown')
  })
  it('uses the 30-day soon window inclusively', () => {
    expect(computeStatus({ nextDueDate: '2026-12-08', nextDueMiles: null }, today, null)).toBe('ok')
    expect(computeStatus({ nextDueDate: '2026-12-07', nextDueMiles: null }, today, null)).toBe(
      'soon',
    )
    expect(computeStatus({ nextDueDate: today, nextDueMiles: null }, today, null)).toBe('soon')
    expect(computeStatus({ nextDueDate: '2026-11-06', nextDueMiles: null }, today, null)).toBe(
      'overdue',
    )
  })
  it('uses the 1,000-mile soon window inclusively when mileage is known', () => {
    const due = { nextDueDate: null, nextDueMiles: 70000 }
    expect(computeStatus(due, today, 68999)).toBe('ok')
    expect(computeStatus(due, today, 69000)).toBe('soon')
    expect(computeStatus(due, today, 70000)).toBe('soon')
    expect(computeStatus(due, today, 70001)).toBe('overdue')
  })
  it('takes the worse of date and mileage', () => {
    expect(computeStatus({ nextDueDate: '2027-06-01', nextDueMiles: 70000 }, today, 70500)).toBe(
      'overdue',
    )
    expect(computeStatus({ nextDueDate: '2026-11-20', nextDueMiles: 90000 }, today, 60000)).toBe(
      'soon',
    )
  })
})
