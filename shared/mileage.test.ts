import { describe, expect, it } from 'vitest'
import { estimateMileage } from './mileage'

const r = (date: string, odometer: number) => ({ date, odometer })

describe('estimateMileage', () => {
  it('returns null without readings', () => {
    expect(estimateMileage([], '2026-11-07')).toBeNull()
  })

  it('uses a single reading as-is with no rate', () => {
    expect(estimateMileage([r('2026-10-01', 61_000)], '2026-11-07')).toEqual({
      estimate: 61_000,
      latest: { date: '2026-10-01', odometer: 61_000 },
      milesPerDay: null,
    })
  })

  it('extrapolates from the oldest reading within 12 months', () => {
    const readings = [
      r('2025-06-01', 40_000), // outside the window, ignored
      r('2026-01-01', 50_000),
      r('2026-06-01', 55_000),
      r('2026-11-01', 60_000),
    ]
    const result = estimateMileage(readings, '2026-11-11')
    expect(result?.milesPerDay).toBeCloseTo(10_000 / 304)
    expect(result?.estimate).toBe(60_000 + Math.round((10_000 / 304) * 10))
  })

  it('falls back to the newest older reading when none is within 12 months', () => {
    const readings = [r('2024-01-01', 10_000), r('2024-11-01', 20_000), r('2026-11-01', 40_000)]
    expect(estimateMileage(readings, '2026-11-01')?.milesPerDay).toBeCloseTo(20_000 / 730)
  })

  it('has no rate when every other reading is under 14 days older', () => {
    const result = estimateMileage([r('2026-10-25', 59_800), r('2026-11-01', 60_000)], '2026-12-01')
    expect(result).toEqual({
      estimate: 60_000,
      latest: { date: '2026-11-01', odometer: 60_000 },
      milesPerDay: null,
    })
  })

  it('uses a reading exactly 14 days older as the anchor', () => {
    const result = estimateMileage([r('2026-10-18', 59_300), r('2026-11-01', 60_000)], '2026-11-01')
    expect(result?.milesPerDay).toBe(50)
  })

  it('ignores input order and picks the higher reading on the same date as latest', () => {
    const readings = [r('2026-11-01', 60_100), r('2026-10-01', 59_000), r('2026-11-01', 60_000)]
    const result = estimateMileage(readings, '2026-11-01')
    expect(result?.latest).toEqual({ date: '2026-11-01', odometer: 60_100 })
    expect(result?.milesPerDay).toBeCloseTo(1_100 / 31)
  })

  it('rounds the extrapolated miles', () => {
    const readings = [r('2026-10-01', 0), r('2026-11-01', 100)] // 100/31 per day
    expect(estimateMileage(readings, '2026-11-02')?.estimate).toBe(103)
  })

  it('floors a negative rate at zero', () => {
    const readings = [r('2026-10-01', 61_000), r('2026-11-01', 60_000)]
    const result = estimateMileage(readings, '2026-12-01')
    expect(result?.milesPerDay).toBe(0)
    expect(result?.estimate).toBe(60_000)
  })

  it('does not extrapolate when today is the latest reading date', () => {
    const readings = [r('2026-10-01', 59_000), r('2026-11-01', 60_000)]
    expect(estimateMileage(readings, '2026-11-01')?.estimate).toBe(60_000)
  })
})
