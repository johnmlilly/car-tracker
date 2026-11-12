import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReceiptDetail, ReceiptView } from '../../shared/api'
import { todayInEastern } from '../../shared/schedule'
import app from '../index'
import { startPlatform } from '../test/platform'

let env: Env
let dispose: () => Promise<void>

beforeEach(async () => {
  ;({ env, dispose } = await startPlatform())
})

afterEach(async () => {
  await dispose()
})

const today = todayInEastern(new Date())

async function idOf(sql: string, ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...params).first<{ id: number }>()
  if (!row) throw new Error(`No row for ${sql}`)
  return row.id
}

const vehicleId = (name: string) => idOf('SELECT id FROM vehicles WHERE name = ?', name)
const serviceId = (name: string) => idOf('SELECT id FROM services WHERE name = ?', name)

function postJson(path: string, body: unknown) {
  return app.request(
    path,
    { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
    env,
  )
}

/** A receipt already read, as the read route leaves it. */
async function reviewReceipt(vehicle: number | null, status = 'review'): Promise<number> {
  const extraction = JSON.stringify({
    date: today,
    shop: 'Lake Ridge Auto Care',
    odometer: null,
    totalCents: 12_500,
    minderCode: 'B12',
    lineItems: [{ description: 'BG Transmission Service', amountCents: 12_500 }],
  })
  const row = await env.DB.prepare(
    `INSERT INTO receipts (vehicle_id, r2_key, content_type, status, extraction, uploaded_at)
     VALUES (?, ?, 'image/webp', ?, ?, ?) RETURNING id`,
  )
    .bind(vehicle, `receipts/${crypto.randomUUID()}.webp`, status, extraction, new Date().toISOString())
    .first<{ id: number }>()
  return row!.id
}

async function receiptStatus(id: number) {
  const row = await env.DB.prepare('SELECT status FROM receipts WHERE id = ?')
    .bind(id)
    .first<{ status: string }>()
  return row?.status
}

async function recordsFor(receiptId: number) {
  const { results } = await env.DB.prepare(
    `SELECT id, vehicle_id AS vehicleId, date, odometer, shop, total_cents AS totalCents,
            source, minder_code AS minderCode
     FROM service_records WHERE receipt_id = ?`,
  )
    .bind(receiptId)
    .all()
  return results
}

const confirm = (id: number | string, body: unknown) => postJson(`/api/receipts/${id}/confirm`, body)

describe('receipt confirm against D1', () => {
  it('writes one receipt-linked record that closes covered Minder items', async () => {
    const odyssey = await vehicleId('2024 Honda Odyssey')
    const oil = await serviceId('Oil and filter change')
    expect((await postJson(`/api/vehicles/${odyssey}/minder`, { code: 'A1' })).status).toBe(201)
    const id = await reviewReceipt(odyssey)

    const res = await confirm(id, {
      date: today,
      odometer: 41_250,
      shop: 'Lake Ridge Auto Care',
      totalCents: 9_999,
      minderCode: 'a 1',
      items: [
        { description: 'Synthetic oil change', serviceId: oil, amountCents: 7_999 },
        { description: 'Wipers', serviceId: null, amountCents: 2_000 },
      ],
    })
    expect(res.status).toBe(201)
    expect(((await res.json()) as ReceiptView).status).toBe('confirmed')

    const [record] = await recordsFor(id)
    expect(record).toMatchObject({
      vehicleId: odyssey,
      date: today,
      odometer: 41_250,
      shop: 'Lake Ridge Auto Care',
      totalCents: 9_999,
      source: 'receipt',
      minderCode: 'A1',
    })
    const recordId = (record as { id: number }).id
    const items = await env.DB.prepare(
      'SELECT description FROM service_items WHERE service_record_id = ? ORDER BY id',
    )
      .bind(recordId)
      .all<{ description: string }>()
    expect(items.results.map((i) => i.description)).toEqual(['Synthetic oil change', 'Wipers'])
    const reading = await env.DB.prepare(
      "SELECT odometer FROM odometer_logs WHERE service_record_id = ? AND source = 'record'",
    )
      .bind(recordId)
      .first<{ odometer: number }>()
    expect(reading?.odometer).toBe(41_250)

    // A1 opens oil and tire rotation; only oil was covered.
    const { results: due } = await env.DB.prepare(
      `SELECT s.name AS name, d.closed_by_service_item_id IS NOT NULL AS closed
       FROM due_items d JOIN services s ON s.id = d.service_id ORDER BY s.name`,
    ).all<{ name: string; closed: number }>()
    expect(due).toEqual([
      { name: 'Oil and filter change', closed: 1 },
      { name: 'Tire rotation', closed: 0 },
    ])
    expect(await receiptStatus(id)).toBe('confirmed')
  })

  it('drops the Minder code for an interval vehicle', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    const id = await reviewReceipt(corolla)
    const res = await confirm(id, {
      date: today,
      minderCode: 'B12',
      items: [{ description: 'Transmission', serviceId: await serviceId('Transmission fluid') }],
    })
    expect(res.status).toBe(201)
    expect(await recordsFor(id)).toEqual([
      expect.objectContaining({ source: 'receipt', minderCode: null }),
    ])
  })

  it('refuses a second confirm and keeps one record', async () => {
    const id = await reviewReceipt(await vehicleId('2019 Toyota Corolla'))
    const body = { date: today, minderCode: null, items: [{ description: 'Oil', serviceId: null }] }
    expect((await confirm(id, body)).status).toBe(201)
    const again = await confirm(id, body)
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: { message: "This receipt isn't ready to confirm." } })
    expect(await recordsFor(id)).toHaveLength(1)
  })

  it('rolls back when a record already points at the receipt', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    const id = await reviewReceipt(corolla)
    await env.DB.prepare(
      "INSERT INTO service_records (vehicle_id, date, source, receipt_id) VALUES (?, ?, 'receipt', ?)",
    )
      .bind(corolla, today, id)
      .run()
    const items = await env.DB.prepare('SELECT count(*) AS n FROM service_items').first<{ n: number }>()

    const res = await confirm(id, { date: today, minderCode: null, items: [{ description: 'Oil', serviceId: null }] })
    expect(res.status).toBe(409)
    expect(await recordsFor(id)).toHaveLength(1)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM service_items').first<{ n: number }>()).toEqual(items)
    expect(await receiptStatus(id)).toBe('review')
  })

  it.each([
    ['pending', 'pending'],
    ['confirmed', 'confirmed'],
  ])('refuses a %s receipt', async (_, status) => {
    const id = await reviewReceipt(await vehicleId('2019 Toyota Corolla'), status)
    const res = await confirm(id, { date: today, minderCode: null, items: [{ description: 'Oil', serviceId: null }] })
    expect(res.status).toBe(409)
  })

  it('refuses a receipt with no vehicle', async () => {
    const id = await reviewReceipt(null)
    const res = await confirm(id, { date: today, minderCode: null, items: [{ description: 'Oil', serviceId: null }] })
    expect(res.status).toBe(409)
  })

  it('returns 404 for a missing receipt', async () => {
    expect((await confirm(999, {})).status).toBe(404)
    expect((await confirm('abc', {})).status).toBe(404)
  })

  it('reports invalid fields, a bad Minder code, and unknown services together and writes nothing', async () => {
    const id = await reviewReceipt(await vehicleId('2024 Honda Odyssey'))
    const res = await confirm(id, { date: 'nope', minderCode: 'C9', items: [] })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { fields: Record<string, string> } }
    expect(body.error.fields).toEqual({
      date: 'Enter a valid date.',
      items: 'Add at least one line item.',
      minderCode: 'Enter a code like A or B12.',
    })

    const unknown = await confirm(id, {
      date: today,
      minderCode: null,
      items: [{ description: 'Mystery', serviceId: 9999 }],
    })
    expect(unknown.status).toBe(400)
    expect(await recordsFor(id)).toEqual([])
    expect(await receiptStatus(id)).toBe('review')
  })

  it('rejects a conflicting odometer', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    expect(
      (await postJson(`/api/vehicles/${corolla}/odometer`, { date: '2026-01-01', odometer: 50_000 }))
        .status,
    ).toBe(201)
    const id = await reviewReceipt(corolla)
    const res = await confirm(id, {
      date: today,
      odometer: 40_000,
      minderCode: null,
      items: [{ description: 'Oil', serviceId: null }],
    })
    expect(res.status).toBe(400)
    expect(Object.keys(((await res.json()) as { error: { fields: object } }).error.fields)).toEqual([
      'odometer',
    ])
  })

  it('returns the receipt to review when its record is deleted', async () => {
    const id = await reviewReceipt(await vehicleId('2019 Toyota Corolla'))
    await confirm(id, { date: today, minderCode: null, items: [{ description: 'Oil', serviceId: null }] })
    const [record] = (await recordsFor(id)) as { id: number }[]

    const del = await app.request(`/api/service-records/${record.id}`, { method: 'DELETE' }, env)
    expect(del.status).toBe(204)
    expect(await receiptStatus(id)).toBe('review')
    expect(await recordsFor(id)).toEqual([])
  })

  it('includes review data in the receipt detail', async () => {
    const odyssey = await vehicleId('2024 Honda Odyssey')
    const corolla = await vehicleId('2019 Toyota Corolla')
    expect((await postJson(`/api/vehicles/${odyssey}/minder`, { code: 'A1' })).status).toBe(201)

    const odysseyReceipt = await reviewReceipt(odyssey)
    const detail = (await (await app.request(`/api/receipts/${odysseyReceipt}`, {}, env)).json()) as ReceiptDetail
    expect(detail).toMatchObject({
      today,
      scheduleModel: 'minder',
      openMinderCode: 'A1',
      extraction: { minderCode: 'B12' },
    })
    const names = detail.services.map((s) => s.name)
    expect(names).toEqual([...names].sort())
    expect(detail.extraction?.lineItems[0].suggestedServiceId).toBe(await serviceId('Transmission fluid'))

    const corollaReceipt = await reviewReceipt(corolla)
    const corollaDetail = (await (await app.request(`/api/receipts/${corollaReceipt}`, {}, env)).json()) as ReceiptDetail
    expect(corollaDetail).toMatchObject({ scheduleModel: 'interval', openMinderCode: null })
  })
})
