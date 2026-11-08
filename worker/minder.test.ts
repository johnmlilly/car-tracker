import { describe, expect, it } from 'vitest'
import type { DueItemView, ScheduleItemView } from '../shared/api'
import {
  groupDueItems,
  mergeMinderStatus,
  normalizeCode,
  parseMinderInput,
  resolveServices,
  type MinderLookupRow,
} from './minder'

const CODE_MESSAGE = 'Enter a code like A or B12.'
const ODOMETER_MESSAGE = 'Enter whole miles from 0 to 999,999.'

describe('normalizeCode', () => {
  it.each([
    ['A', 'A'],
    ['b12', 'B12'],
    [' b 1 2 ', 'B12'],
    ['B21', 'B12'],
    ['a135', 'A135'],
  ])('normalizes %j to %s', (raw, expected) => {
    expect(normalizeCode(raw)).toBe(expected)
  })

  it.each(['', '12', 'C1', 'BB', 'B11', 'B1x', 'AB1', '1B'])('rejects %j', (raw) => {
    expect(normalizeCode(raw)).toBeNull()
  })
})

describe('parseMinderInput', () => {
  it('rejects a non-object body', () => {
    for (const body of [undefined, null, 'B1', [1]]) {
      expect(parseMinderInput(body)).toEqual({
        ok: false,
        fields: { body: 'Expected a JSON object.' },
      })
    }
  })

  it('accepts a code with no odometer', () => {
    expect(parseMinderInput({ code: 'b21' })).toEqual({
      ok: true,
      value: { code: 'B12', odometer: null },
    })
    expect(parseMinderInput({ code: 'A', odometer: null })).toEqual({
      ok: true,
      value: { code: 'A', odometer: null },
    })
  })

  it('accepts an odometer within range', () => {
    expect(parseMinderInput({ code: 'A', odometer: 0 })).toEqual({
      ok: true,
      value: { code: 'A', odometer: 0 },
    })
    expect(parseMinderInput({ code: 'A', odometer: 999_999 })).toEqual({
      ok: true,
      value: { code: 'A', odometer: 999_999 },
    })
  })

  it.each([undefined, 12, '', 'C', 'B11'])('rejects code %j', (code) => {
    expect(parseMinderInput({ code })).toEqual({ ok: false, fields: { code: CODE_MESSAGE } })
  })

  it.each([-1, 1.5, 1_000_000, '100'])('rejects odometer %j', (odometer) => {
    expect(parseMinderInput({ code: 'A', odometer })).toEqual({
      ok: false,
      fields: { odometer: ODOMETER_MESSAGE },
    })
  })

  it('reports both fields together', () => {
    expect(parseMinderInput({ code: 'x', odometer: -5 })).toEqual({
      ok: false,
      fields: { code: CODE_MESSAGE, odometer: ODOMETER_MESSAGE },
    })
  })
})

describe('resolveServices', () => {
  const lookup: MinderLookupRow[] = [
    { code: 'A', kind: 'main', serviceId: 1 },
    { code: 'B', kind: 'main', serviceId: 1 },
    { code: 'B', kind: 'main', serviceId: 2 },
    { code: '1', kind: 'sub', serviceId: 3 },
    { code: '2', kind: 'sub', serviceId: 4 },
    { code: '2', kind: 'sub', serviceId: 5 },
    { code: '3', kind: 'sub', serviceId: 2 },
  ]

  it('maps the main letter alone', () => {
    expect(resolveServices('A', lookup)).toEqual({ ok: true, serviceIds: [1] })
  })

  it('combines main and sub-item services', () => {
    expect(resolveServices('B12', lookup)).toEqual({ ok: true, serviceIds: [1, 2, 3, 4, 5] })
  })

  it('dedupes a service shared by main and sub rows', () => {
    expect(resolveServices('B3', lookup)).toEqual({ ok: true, serviceIds: [1, 2] })
  })

  it('rejects a sub-item missing from the lookup', () => {
    expect(resolveServices('B16', lookup)).toEqual({
      ok: false,
      message: "Sub-item 6 isn't in this car's Minder list.",
    })
  })

  it('rejects a main letter missing from the lookup', () => {
    expect(resolveServices('A1', lookup.filter((r) => r.code !== 'A'))).toEqual({
      ok: false,
      message: CODE_MESSAGE,
    })
  })

  it('does not treat a main row as a sub-item', () => {
    expect(resolveServices('A1', [{ code: 'A', kind: 'main', serviceId: 1 }])).toEqual({
      ok: false,
      message: "Sub-item 1 isn't in this car's Minder list.",
    })
  })
})

describe('groupDueItems', () => {
  it('returns nothing with no open items', () => {
    expect(groupDueItems([])).toEqual([])
  })

  it('lists each service once, from its earliest log, sorted by name', () => {
    expect(
      groupDueItems([
        { serviceName: 'Tire rotation', logId: 2, code: 'A1', loggedAt: '2026-11-07T15:00:00.000Z' },
        { serviceName: 'Oil change', logId: 2, code: 'A1', loggedAt: '2026-11-07T15:00:00.000Z' },
        { serviceName: 'Oil change', logId: 1, code: 'B', loggedAt: '2026-10-01T15:00:00.000Z' },
      ]),
    ).toEqual([
      { serviceName: 'Oil change', status: 'overdue', since: { code: 'B', date: '2026-10-01' } },
      { serviceName: 'Tire rotation', status: 'overdue', since: { code: 'A1', date: '2026-11-07' } },
    ])
  })

  it('breaks loggedAt ties by lower log id', () => {
    const at = '2026-11-07T15:00:00.000Z'
    expect(
      groupDueItems([
        { serviceName: 'Oil change', logId: 5, code: 'B', loggedAt: at },
        { serviceName: 'Oil change', logId: 4, code: 'A', loggedAt: at },
      ])[0].since.code,
    ).toBe('A')
  })

  it('dates a log by its Eastern calendar day', () => {
    expect(
      groupDueItems([
        { serviceName: 'Oil change', logId: 1, code: 'A', loggedAt: '2026-11-08T03:00:00.000Z' },
      ])[0].since.date,
    ).toBe('2026-11-07')
  })
})

describe('mergeMinderStatus', () => {
  const item = (serviceName: string, status: ScheduleItemView['status']): ScheduleItemView => ({
    id: serviceName.length,
    serviceName,
    intervalMiles: 5000,
    intervalMonths: 6,
    baselineDate: null,
    baselineOdometer: null,
    nextDueDate: null,
    nextDueMiles: null,
    status,
    minderSince: null,
  })
  const due = (serviceName: string, code = 'B12'): DueItemView => ({
    serviceName,
    status: 'overdue',
    since: { code, date: '2026-11-07' },
  })

  it('leaves items alone with no open Minder items', () => {
    const items = [item('Tire rotation', 'ok'), item('Oil and filter change', 'soon')]
    expect(mergeMinderStatus(items, [])).toEqual({ items, dueItems: [] })
  })

  it('marks matching items overdue and keeps the rest as leftovers', () => {
    const result = mergeMinderStatus(
      [item('Tire rotation', 'ok'), item('Brake fluid', 'soon')],
      [due('Tire rotation', 'A1'), due('Multi-point inspection')],
    )
    expect(result.items).toEqual([
      { ...item('Tire rotation', 'ok'), status: 'overdue', minderSince: { code: 'A1', date: '2026-11-07' } },
      item('Brake fluid', 'soon'),
    ])
    expect(result.dueItems).toEqual([due('Multi-point inspection')])
  })

  it('returns every Minder item when there are no schedule items', () => {
    const open = [due('Oil and filter change'), due('Tire rotation')]
    expect(mergeMinderStatus([], open)).toEqual({ items: [], dueItems: open })
  })
})
