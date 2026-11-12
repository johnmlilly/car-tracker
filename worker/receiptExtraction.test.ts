import { describe, expect, it } from 'vitest'
import { ExtractError, matchService, parseExtraction } from './receiptExtraction'

const TODAY = '2026-11-11'

const FULL = {
  date: '2026-11-10',
  shop: '  Honda of Anytown ',
  odometer: 41_250,
  totalCents: 12_999,
  minderCode: 'b 21',
  lineItems: [
    { description: 'Synthetic oil change', amountCents: 7999 },
    { description: '  Tire rotation  ', amountCents: null },
  ],
}

describe('parseExtraction', () => {
  it('keeps valid fields and normalizes text and the Minder code', () => {
    expect(parseExtraction(FULL, TODAY)).toEqual({
      date: '2026-11-10',
      shop: 'Honda of Anytown',
      odometer: 41_250,
      totalCents: 12_999,
      minderCode: 'B12',
      lineItems: [
        { description: 'Synthetic oil change', amountCents: 7999 },
        { description: 'Tire rotation', amountCents: null },
      ],
    })
  })

  it('accepts an all-null extraction', () => {
    const empty = { date: null, shop: null, odometer: null, totalCents: null, minderCode: null }
    expect(parseExtraction({ ...empty, lineItems: [] }, TODAY)).toEqual({ ...empty, lineItems: [] })
  })

  it.each([
    ['a future date', { date: '2026-11-12' }, 'date'],
    ['a malformed date', { date: '11/10/2026' }, 'date'],
    ['an impossible date', { date: '2026-02-30' }, 'date'],
    ['blank shop', { shop: '   ' }, 'shop'],
    ['negative odometer', { odometer: -1 }, 'odometer'],
    ['fractional odometer', { odometer: 1.5 }, 'odometer'],
    ['string total', { totalCents: '129.99' }, 'totalCents'],
    ['total over the cap', { totalCents: 10_000_000 }, 'totalCents'],
    ['unknown Minder code', { minderCode: 'C1' }, 'minderCode'],
    ['repeated Minder sub-item', { minderCode: 'A11' }, 'minderCode'],
  ])('nulls %s', (_, patch, field) => {
    const result = parseExtraction({ ...FULL, ...patch }, TODAY) as unknown as Record<string, unknown>
    expect(result[field]).toBeNull()
  })

  it('truncates long text', () => {
    const result = parseExtraction(
      { ...FULL, shop: 'x'.repeat(150), lineItems: [{ description: 'y'.repeat(250), amountCents: 1 }] },
      TODAY,
    )
    expect(result.shop).toHaveLength(100)
    expect(result.lineItems[0].description).toHaveLength(200)
  })

  it('drops lines without a description and caps lines at 30', () => {
    const lines = [
      { description: '', amountCents: 1 },
      { amountCents: 2 },
      'not a line',
      ...Array.from({ length: 35 }, (_, i) => ({ description: `Line ${i}`, amountCents: -5 })),
    ]
    const result = parseExtraction({ ...FULL, lineItems: lines }, TODAY)
    expect(result.lineItems).toHaveLength(27)
    expect(result.lineItems[0]).toEqual({ description: 'Line 0', amountCents: null })
  })

  it('treats a missing line list as empty', () => {
    expect(parseExtraction({ ...FULL, lineItems: 'none' }, TODAY).lineItems).toEqual([])
  })

  it.each([null, 'text', 42, []])('throws for a non-object %j', (raw) => {
    expect(() => parseExtraction(raw, TODAY)).toThrow(ExtractError)
  })
})

describe('matchService', () => {
  const services = [
    { id: 1, keywords: ['oil', 'lube', 'lof'] },
    { id: 3, keywords: ['rotate', 'rotation'] },
    { id: 4, keywords: ['engine air filter', 'air filter'] },
    { id: 5, keywords: ['cabin', 'pollen'] },
    { id: 8, keywords: ['multi-point'] },
  ]

  it.each([
    ['Synthetic OIL change', 1],
    ['LOF special', 1],
    ['Tire Rotation', 3],
    ['Replace engine air filter', 4],
    ['Multi-Point inspection', 8],
  ])('matches %s', (description, id) => {
    expect(matchService(description, services)).toBe(id)
  })

  it.each([
    ['no keyword', 'Wiper blades'],
    ['a keyword inside a word', 'Aloft boiler'],
    ['two services', 'Cabin air filter'],
    ['two services on one line', 'Oil change and rotation'],
  ])('returns null for %s', (_, description) => {
    expect(matchService(description, services)).toBeNull()
  })
})
