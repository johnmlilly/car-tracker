import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ServiceRecordsResponse } from '../../shared/api'
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

async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>()
  return row!.n
}

function postJson(path: string, body: unknown) {
  return app.request(
    path,
    { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
    env,
  )
}

interface Line {
  description: string
  serviceId: number | null
}

async function createRecord(vehicle: number, body: { date?: string; odometer?: number; items: Line[] }) {
  return postJson(`/api/vehicles/${vehicle}/service-records`, { date: today, ...body })
}

/** Due items keyed by service name: null when open, else the closing line id. */
async function dueItemState(): Promise<Record<string, number | null>> {
  const { results } = await env.DB.prepare(
    `SELECT s.name AS name, d.closed_by_service_item_id AS closedBy
     FROM due_items d JOIN services s ON s.id = d.service_id`,
  ).all<{ name: string; closedBy: number | null }>()
  return Object.fromEntries(results.map((r) => [r.name, r.closedBy]))
}

async function itemIdsFor(recordId: number): Promise<number[]> {
  const { results } = await env.DB.prepare(
    'SELECT id FROM service_items WHERE service_record_id = ? ORDER BY id',
  )
    .bind(recordId)
    .all<{ id: number }>()
  return results.map((r) => r.id)
}

const latestRecordId = () => idOf('SELECT max(id) AS id FROM service_records')

describe('service record routes against D1', () => {
  it('starts from the seeded vehicles', async () => {
    const res = await app.request('/api/vehicles', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { vehicles: { name: string }[] }
    expect(body.vehicles.map((v) => v.name).sort()).toEqual([
      '2019 Toyota Corolla',
      '2024 Honda Odyssey',
    ])
  })

  it('closes only the Minder items covered by a matched line', async () => {
    const odyssey = await vehicleId('2024 Honda Odyssey')
    const oil = await serviceId('Oil and filter change')
    expect((await postJson(`/api/vehicles/${odyssey}/minder`, { code: 'A1' })).status).toBe(201)
    expect(await dueItemState()).toEqual({ 'Oil and filter change': null, 'Tire rotation': null })

    const res = await createRecord(odyssey, {
      items: [
        { description: 'Synthetic oil change', serviceId: oil },
        { description: 'Wiper blades', serviceId: null },
      ],
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as ServiceRecordsResponse
    expect(created.records[0].receipt).toBeNull()

    const [oilLine] = await itemIdsFor(await latestRecordId())
    expect(await dueItemState()).toEqual({ 'Oil and filter change': oilLine, 'Tire rotation': null })
  })

  it('writes a record-owned odometer reading that cannot be deleted directly', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    const res = await createRecord(corolla, {
      odometer: 42000,
      items: [{ description: 'Inspection', serviceId: null }],
    })
    expect(res.status).toBe(201)

    const recordId = await latestRecordId()
    const reading = await env.DB.prepare(
      'SELECT id, odometer, source, service_record_id AS recordId FROM odometer_logs',
    ).first<{ id: number; odometer: number; source: string; recordId: number }>()
    expect(reading).toMatchObject({ odometer: 42000, source: 'record', recordId })

    const del = await app.request(`/api/odometer-logs/${reading!.id}`, { method: 'DELETE' }, env)
    expect(del.status).toBe(409)
    expect(await del.json()).toEqual({
      error: { message: 'This reading comes from a service record. Delete the record instead.' },
    })
    expect(await count('odometer_logs')).toBe(1)
  })

  it('rejects a conflicting odometer and writes nothing', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    const earlier = postJson(`/api/vehicles/${corolla}/odometer`, {
      date: '2026-01-01',
      odometer: 50000,
    })
    expect((await earlier).status).toBe(201)

    const res = await createRecord(corolla, {
      odometer: 40000,
      items: [{ description: 'Oil', serviceId: null }],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { fields: Record<string, string> } }
    expect(Object.keys(body.error.fields)).toEqual(['odometer'])
    expect(await count('service_records')).toBe(0)
    expect(await count('service_items')).toBe(0)
    expect(await count('odometer_logs')).toBe(1)
  })

  it('rejects an unknown service id and writes nothing', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    const res = await createRecord(corolla, {
      items: [
        { description: 'Oil', serviceId: null },
        { description: 'Mystery', serviceId: 9999 },
      ],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { fields: Record<string, string> } }
    expect(Object.keys(body.error.fields)).toEqual(['items.1.serviceId'])
    expect(await count('service_records')).toBe(0)
  })

  it('deletes a record with its lines and reading, handing its Minder closure to another record', async () => {
    const odyssey = await vehicleId('2024 Honda Odyssey')
    const oil = await serviceId('Oil and filter change')
    expect((await postJson(`/api/vehicles/${odyssey}/minder`, { code: 'A' })).status).toBe(201)

    expect(
      (await createRecord(odyssey, { odometer: 30000, items: [{ description: 'Oil', serviceId: oil }] }))
        .status,
    ).toBe(201)
    const first = await latestRecordId()
    expect(
      (await createRecord(odyssey, { items: [{ description: 'Oil again', serviceId: oil }] })).status,
    ).toBe(201)
    const [secondLine] = await itemIdsFor(await latestRecordId())

    const del = await app.request(`/api/service-records/${first}`, { method: 'DELETE' }, env)
    expect(del.status).toBe(204)
    expect(await dueItemState()).toEqual({ 'Oil and filter change': secondLine })
    expect(await count('service_records')).toBe(1)
    expect(await count('service_items')).toBe(1)
    expect(await count('odometer_logs')).toBe(0)

    const again = await app.request(`/api/service-records/${first}`, { method: 'DELETE' }, env)
    expect(again.status).toBe(404)
  })

  it('reopens a Minder item when no other record covers it', async () => {
    const odyssey = await vehicleId('2024 Honda Odyssey')
    const oil = await serviceId('Oil and filter change')
    expect((await postJson(`/api/vehicles/${odyssey}/minder`, { code: 'A' })).status).toBe(201)
    expect((await createRecord(odyssey, { items: [{ description: 'Oil', serviceId: oil }] })).status).toBe(
      201,
    )
    const recordId = await latestRecordId()

    const del = await app.request(`/api/service-records/${recordId}`, { method: 'DELETE' }, env)
    expect(del.status).toBe(204)
    expect(await dueItemState()).toEqual({ 'Oil and filter change': null })
    expect(await count('service_items')).toBe(0)
  })
})
