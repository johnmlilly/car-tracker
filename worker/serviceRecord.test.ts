import { describe, expect, it } from 'vitest'
import { MAX_CENTS } from '../shared/money'
import {
  MAX_LINE_ITEMS,
  parseServiceRecordInput,
  reassignClosures,
  selectDueItemsToClose,
} from './serviceRecord'

const today = '2026-11-07'
const line = { description: 'Oil change', serviceId: 1, amountCents: 4999 }
const valid = {
  date: '2026-11-01',
  odometer: 61000,
  shop: '  Honda of Town  ',
  totalCents: 12345,
  items: [line],
}

function fieldsFor(body: unknown) {
  const result = parseServiceRecordInput(body, today)
  if (result.ok) throw new Error('expected invalid')
  return result.fields
}

describe('parseServiceRecordInput', () => {
  it('accepts a full record and trims text', () => {
    expect(parseServiceRecordInput(valid, today)).toEqual({
      ok: true,
      value: { ...valid, shop: 'Honda of Town', items: [line] },
    })
  })

  it('defaults optional fields to null', () => {
    const result = parseServiceRecordInput(
      { date: today, items: [{ description: ' Wiper blades ' }] },
      today,
    )
    expect(result).toEqual({
      ok: true,
      value: {
        date: today,
        odometer: null,
        shop: null,
        totalCents: null,
        items: [{ description: 'Wiper blades', serviceId: null, amountCents: null }],
      },
    })
  })

  it('treats a blank shop as null', () => {
    const result = parseServiceRecordInput({ ...valid, shop: '   ' }, today)
    expect(result.ok && result.value.shop).toBeNull()
  })

  it.each([null, [], 'x', 5])('rejects a non-object body %s', (body) => {
    expect(fieldsFor(body)).toEqual({ body: 'Expected a JSON object.' })
  })

  it.each([undefined, '', '2026-02-30', '11/01/2026', 20261101])('rejects date %s', (date) => {
    expect(fieldsFor({ ...valid, date }).date).toBe('Enter a valid date.')
  })

  it('rejects a future date and accepts today', () => {
    expect(fieldsFor({ ...valid, date: '2026-11-08' }).date).toBe("Date can't be in the future.")
    expect(parseServiceRecordInput({ ...valid, date: today }, today).ok).toBe(true)
  })

  it.each([-1, 1_000_000, 1.5, '61000'])('rejects odometer %s', (odometer) => {
    expect(fieldsFor({ ...valid, odometer }).odometer).toBe('Enter whole miles from 0 to 999,999.')
  })

  it.each([0, 999_999])('accepts odometer %s', (odometer) => {
    expect(parseServiceRecordInput({ ...valid, odometer }, today).ok).toBe(true)
  })

  it('rejects a long or non-string shop', () => {
    expect(fieldsFor({ ...valid, shop: 'x'.repeat(101) }).shop).toBe(
      'Keep the shop name to 100 characters.',
    )
    expect(fieldsFor({ ...valid, shop: 5 }).shop).toBe('Keep the shop name to 100 characters.')
    expect(parseServiceRecordInput({ ...valid, shop: 'x'.repeat(100) }, today).ok).toBe(true)
  })

  it.each([-1, MAX_CENTS + 1, 12.5, '100'])('rejects total %s', (totalCents) => {
    expect(fieldsFor({ ...valid, totalCents }).totalCents).toBe(
      'Enter an amount from $0 to $99,999.99.',
    )
  })

  it.each([0, MAX_CENTS])('accepts total %s', (totalCents) => {
    expect(parseServiceRecordInput({ ...valid, totalCents }, today).ok).toBe(true)
  })

  it.each([undefined, null, [], 'oil'])('requires line items, got %s', (items) => {
    expect(fieldsFor({ ...valid, items }).items).toBe('Add at least one line item.')
  })

  it('caps line items', () => {
    const many = Array.from({ length: MAX_LINE_ITEMS + 1 }, () => line)
    expect(fieldsFor({ ...valid, items: many }).items).toBe('Add up to 30 line items.')
    const max = Array.from({ length: MAX_LINE_ITEMS }, () => line)
    expect(parseServiceRecordInput({ ...valid, items: max }, today).ok).toBe(true)
  })

  it('keys line errors by index', () => {
    const fields = fieldsFor({
      ...valid,
      items: [
        line,
        { description: '  ', serviceId: 0, amountCents: -1 },
        { description: 'x'.repeat(201), serviceId: 1.5 },
        'oil',
      ],
    })
    expect(fields).toEqual({
      'items.1.description': 'Enter a description.',
      'items.1.serviceId': 'Pick a service from the list.',
      'items.1.amountCents': 'Enter an amount from $0 to $99,999.99.',
      'items.2.description': 'Keep descriptions to 200 characters.',
      'items.2.serviceId': 'Pick a service from the list.',
      'items.3.description': 'Enter a description.',
    })
  })

  it('accepts a 200-character description', () => {
    const items = [{ description: 'x'.repeat(200) }]
    expect(parseServiceRecordInput({ ...valid, items }, today).ok).toBe(true)
  })
})

describe('selectDueItemsToClose', () => {
  // 2026-11-02T03:00Z is still Nov 1 in Eastern time.
  const rows = [
    { id: 3, serviceId: 10, loggedAt: '2026-11-02T03:00:00.000Z' },
    { id: 1, serviceId: 10, loggedAt: '2026-10-01T15:00:00.000Z' },
    { id: 2, serviceId: 20, loggedAt: '2026-10-01T15:00:00.000Z' },
    { id: 4, serviceId: 10, loggedAt: '2026-11-03T15:00:00.000Z' },
  ]

  it('closes only covered services logged on or before the record date', () => {
    expect(selectDueItemsToClose(rows, [10], '2026-11-01')).toEqual([1, 3])
  })

  it('includes a code logged the same Eastern day and excludes the next day', () => {
    expect(selectDueItemsToClose(rows, [10], '2026-11-02')).toEqual([1, 3])
    expect(selectDueItemsToClose(rows, [10], '2026-11-03')).toEqual([1, 3, 4])
  })

  it('ignores unmatched lines and uncovered services', () => {
    expect(selectDueItemsToClose(rows, [null, 99], '2026-12-01')).toEqual([])
    expect(selectDueItemsToClose(rows, [20, null], '2026-12-01')).toEqual([2])
  })

  it('returns nothing with no open rows', () => {
    expect(selectDueItemsToClose([], [10], '2026-12-01')).toEqual([])
  })
})

describe('reassignClosures', () => {
  // 15:00Z is mid-morning Nov 1 in Eastern time.
  const closed = [
    { id: 1, serviceId: 10, loggedAt: '2026-11-01T15:00:00.000Z' },
    { id: 2, serviceId: 20, loggedAt: '2026-11-01T15:00:00.000Z' },
  ]

  it('hands a closure to the lowest-id covering line of another record', () => {
    const others = [
      { id: 9, serviceId: 10, date: '2026-11-05' },
      { id: 7, serviceId: 10, date: '2026-11-03' },
    ]
    expect(reassignClosures(closed, others)).toEqual([{ dueItemId: 1, closedByServiceItemId: 7 }])
  })

  it('counts a record on the same Eastern day as the code, not one before it', () => {
    expect(reassignClosures(closed, [{ id: 5, serviceId: 20, date: '2026-11-01' }])).toEqual([
      { dueItemId: 2, closedByServiceItemId: 5 },
    ])
    expect(reassignClosures(closed, [{ id: 5, serviceId: 20, date: '2026-10-31' }])).toEqual([])
  })

  it('reopens items no other record covers', () => {
    expect(reassignClosures(closed, [{ id: 5, serviceId: 30, date: '2026-12-01' }])).toEqual([])
    expect(reassignClosures(closed, [])).toEqual([])
  })

  it('uses the Eastern date of a late-evening code', () => {
    // 2026-11-02T03:00Z is Nov 1 at 10pm Eastern.
    const late = [{ id: 3, serviceId: 10, loggedAt: '2026-11-02T03:00:00.000Z' }]
    expect(reassignClosures(late, [{ id: 4, serviceId: 10, date: '2026-11-01' }])).toEqual([
      { dueItemId: 3, closedByServiceItemId: 4 },
    ])
  })
})
