import { describe, expect, it } from 'vitest'
import type { DueItemView, ScheduleItemView } from './api'
import { barFraction, countdown, describeCountdown, gridEntries, pickNextDue } from './scheduleView'

const TODAY = '2026-11-13'

function item(over: Partial<ScheduleItemView>): ScheduleItemView {
  return {
    id: 1,
    serviceName: 'Oil and filter change',
    intervalMiles: null,
    intervalMonths: null,
    baselineDate: null,
    baselineOdometer: null,
    lastDoneDate: null,
    lastDoneOdometer: null,
    nextDueDate: null,
    nextDueMiles: null,
    status: 'unknown',
    minderSince: null,
    ...over,
  }
}

const milesOnly = item({
  serviceName: 'Tire rotation',
  intervalMiles: 5000,
  lastDoneOdometer: 50_000,
  nextDueMiles: 55_000,
  status: 'soon',
})

const monthsOnly = item({
  serviceName: 'Brake fluid',
  intervalMonths: 12,
  lastDoneDate: '2026-01-13',
  nextDueDate: '2027-01-13',
  status: 'ok',
})

describe('countdown', () => {
  it('counts miles left on a miles-only item', () => {
    const c = countdown(milesOnly, 54_600, TODAY)
    expect(c).toEqual({ kind: 'miles', remaining: 400, used: 0.92, from: 50_000, to: 55_000 })
    expect(describeCountdown(c!)).toEqual({ value: '400', unit: 'mi left' })
  })

  it('needs a mileage estimate for miles', () => {
    expect(countdown(milesOnly, null, TODAY)).toBeNull()
  })

  it('counts days on a months-only item and switches to months past 60 days', () => {
    const c = countdown(monthsOnly, null, TODAY)!
    expect(c.kind).toBe('days')
    expect(c.remaining).toBe(61)
    expect(describeCountdown(c)).toEqual({ value: '2', unit: 'months left' })
    expect(describeCountdown({ ...c, remaining: 26 })).toEqual({ value: '26', unit: 'days left' })
    expect(describeCountdown({ ...c, remaining: 1 })).toEqual({ value: '1', unit: 'day left' })
  })

  it('picks the dimension with the worse status when both exist', () => {
    const both = item({
      intervalMiles: 10_000,
      intervalMonths: 12,
      lastDoneOdometer: 40_000,
      nextDueMiles: 50_000,
      lastDoneDate: '2025-12-01',
      nextDueDate: '2026-12-01',
      status: 'soon',
    })
    // 4,000 miles used (ok) but 18 days left (soon): days wins.
    expect(countdown(both, 44_000, TODAY)?.kind).toBe('days')
    // 600 miles past due beats 18 days left.
    expect(countdown(both, 50_600, TODAY)).toMatchObject({ kind: 'miles', remaining: -600 })
  })

  it('picks the dimension further through its interval when statuses tie', () => {
    const both = item({
      intervalMiles: 10_000,
      intervalMonths: 36,
      lastDoneOdometer: 40_000,
      nextDueMiles: 50_000,
      lastDoneDate: '2025-11-13',
      nextDueDate: '2028-11-13',
      status: 'ok',
    })
    expect(countdown(both, 45_000, TODAY)?.kind).toBe('miles')
  })

  it('reports overdue and clamps the bar', () => {
    const c = countdown(milesOnly, 55_340, TODAY)!
    expect(describeCountdown(c)).toEqual({ value: '340', unit: 'mi overdue' })
    expect(barFraction(c)).toBe(1)
    expect(barFraction({ ...c, used: -0.2 })).toBe(0)
  })

  it('is null without a baseline', () => {
    expect(countdown(item({ intervalMiles: 5000 }), 50_000, TODAY)).toBeNull()
  })
})

const minderDue: DueItemView = {
  serviceName: 'Multi-point inspection',
  status: 'overdue',
  since: { code: 'B', date: '2026-11-02' },
}

describe('gridEntries', () => {
  it('sorts overdue, soon, ok, unknown, with Minder items first among overdue', () => {
    const overdueMiles = item({ ...milesOnly, id: 2, serviceName: 'Cabin air filter', status: 'overdue' })
    const unknown = item({ id: 3, serviceName: 'Spark plugs', intervalMiles: 120_000 })
    const entries = gridEntries([unknown, monthsOnly, milesOnly, overdueMiles], [minderDue], 55_100, TODAY)
    expect(entries.map((e) => e.item.serviceName)).toEqual([
      'Multi-point inspection',
      'Cabin air filter',
      'Tire rotation',
      'Brake fluid',
      'Spark plugs',
    ])
  })

  it('sorts by interval progress within a status, then by name', () => {
    const a = item({ ...milesOnly, id: 2, serviceName: 'A', lastDoneOdometer: 52_000, nextDueMiles: 57_000, status: 'ok' })
    const b = item({ ...milesOnly, id: 3, serviceName: 'B', status: 'ok' })
    const c = item({ ...milesOnly, id: 4, serviceName: 'C', status: 'ok' })
    expect(gridEntries([a, c, b], [], 53_000, TODAY).map((e) => e.item.serviceName)).toEqual(['B', 'C', 'A'])
  })
})

describe('pickNextDue', () => {
  it('returns the most urgent item with its countdown', () => {
    expect(pickNextDue([monthsOnly, milesOnly], [], 54_600, TODAY)).toEqual({
      serviceName: 'Tire rotation',
      status: 'soon',
      minder: null,
      countdown: { kind: 'miles', remaining: 400, used: 0.92, from: 50_000, to: 55_000 },
    })
  })

  it('keeps the Minder code on a schedule item the Minder made overdue', () => {
    const oil = item({
      ...milesOnly,
      serviceName: 'Oil and filter change',
      status: 'overdue',
      minderSince: { code: 'A1', date: '2026-11-02' },
    })
    const next = pickNextDue([monthsOnly, oil], [], 52_000, TODAY)
    expect(next).toMatchObject({
      serviceName: 'Oil and filter change',
      status: 'overdue',
      minder: { code: 'A1', date: '2026-11-02' },
    })
    // The interval alone still has miles left; the home card shows the Minder status instead.
    expect(next?.countdown).toMatchObject({ kind: 'miles', remaining: 3_000 })
  })

  it('returns a leftover Minder item with its code', () => {
    expect(pickNextDue([monthsOnly], [minderDue], null, TODAY)).toEqual({
      serviceName: 'Multi-point inspection',
      status: 'overdue',
      minder: { code: 'B', date: '2026-11-02' },
      countdown: null,
    })
  })

  it('is null when nothing has a known status', () => {
    expect(pickNextDue([item({})], [], null, TODAY)).toBeNull()
    expect(pickNextDue([], [], null, TODAY)).toBeNull()
  })
})
