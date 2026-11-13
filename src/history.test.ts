import { describe, expect, it } from 'vitest'
import type { ServiceItemView, ServiceRecordView } from '../shared/api'
import {
  filterRecords,
  groupByYear,
  historyStats,
  NO_FILTER,
  recordCost,
  recordServices,
  serviceGroup,
} from './history'

let nextId = 1

function line(description: string, serviceName: string | null, amountCents: number | null): ServiceItemView {
  return { id: nextId++, description, serviceId: serviceName ? 1 : null, serviceName, amountCents }
}

function record(over: Partial<ServiceRecordView>): ServiceRecordView {
  return {
    id: nextId++,
    date: '2026-06-14',
    odometer: null,
    shop: null,
    totalCents: null,
    source: 'manual',
    receipt: null,
    items: [],
    ...over,
  }
}

const oil = record({
  date: '2026-06-14',
  shop: 'Toyota of Cary',
  totalCents: 9_395,
  receipt: { id: 4, contentType: 'image/webp' },
  items: [line('0W-16 synthetic', 'Oil and filter change', 6_995), line('Rotate', 'Tire rotation', 2_400)],
})
const battery = record({
  date: '2026-02-11',
  shop: 'AutoZone',
  items: [line('Battery, Duralast Gold', null, 18_999)],
})
const brake = record({
  date: '2025-01-18',
  items: [line('Brake fluid flush', 'Brake fluid', null)],
})
const all = [oil, battery, brake]

describe('serviceGroup', () => {
  it('maps tracked services and falls back to Other', () => {
    expect(serviceGroup('Oil and filter change')).toBe('Oil')
    expect(serviceGroup('Cabin air filter')).toBe('Filters')
    expect(serviceGroup('Transmission fluid')).toBe('Fluids')
    expect(serviceGroup('Valve clearance inspection')).toBe('Inspections')
    expect(serviceGroup('Spark plugs')).toBe('Other')
    expect(serviceGroup(null)).toBe('Other')
  })
})

describe('filterRecords', () => {
  it('returns everything with no filter', () => {
    expect(filterRecords(all, NO_FILTER)).toEqual(all)
  })

  it('searches shop, descriptions, and service names, ignoring case', () => {
    expect(filterRecords(all, { ...NO_FILTER, query: 'autozone' })).toEqual([battery])
    expect(filterRecords(all, { ...NO_FILTER, query: 'DURALAST' })).toEqual([battery])
    expect(filterRecords(all, { ...NO_FILTER, query: ' tire rotation ' })).toEqual([oil])
    expect(filterRecords(all, { ...NO_FILTER, query: 'nothing like this' })).toEqual([])
  })

  it('filters by service group, including Other for unmatched lines', () => {
    expect(filterRecords(all, { ...NO_FILTER, group: 'Tires' })).toEqual([oil])
    expect(filterRecords(all, { ...NO_FILTER, group: 'Other' })).toEqual([battery])
    expect(filterRecords(all, { ...NO_FILTER, group: 'Fluids' })).toEqual([brake])
  })

  it('keeps only records with a receipt', () => {
    expect(filterRecords(all, { ...NO_FILTER, hasReceipt: true })).toEqual([oil])
  })
})

describe('recordCost', () => {
  it('prefers the total, then the sum of known lines, else null', () => {
    expect(recordCost(oil)).toBe(9_395)
    expect(recordCost(battery)).toBe(18_999)
    expect(recordCost(brake)).toBeNull()
  })
})

describe('groupByYear', () => {
  it('groups newest year first with counts and totals', () => {
    expect(groupByYear(all)).toEqual([
      { year: '2026', records: [oil, battery], totalCents: 28_394 },
      { year: '2025', records: [brake], totalCents: 0 },
    ])
  })

  it('is empty for no records', () => {
    expect(groupByYear([])).toEqual([])
  })
})

describe('historyStats', () => {
  it('summarizes records', () => {
    expect(historyStats(all)).toEqual({
      services: 3,
      spentCents: 28_394,
      lastDate: '2026-06-14',
      receipts: 1,
    })
  })

  it('handles no records', () => {
    expect(historyStats([])).toEqual({ services: 0, spentCents: 0, lastDate: null, receipts: 0 })
  })
})

describe('recordServices', () => {
  it('lists distinct tracked services in line order', () => {
    const r = record({ items: [line('a', 'Tire rotation', null), line('b', null, null), line('c', 'Tire rotation', null)] })
    expect(recordServices(r)).toEqual(['Tire rotation'])
  })
})
